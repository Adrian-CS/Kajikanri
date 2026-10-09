import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { taskStatus, type Status } from '../../shared/time';
import { api, type AppState, type Task } from '../api';
import { headerDate, zoneLabel, type T } from '../i18n';
import { useLoaded } from '../store';
import { Icon } from '../ui';

const QUICK_BUDGET = 15;
const urgency = (t: Task) => t.since / t.every_days;

export function taskMeta(t: Task, tr: T, state: AppState) {
  const parts = [t.since <= 0 ? tr.doneToday : tr.daysAgo(t.since), tr.everyN(t.every_days)];
  if (t.left < 0) parts.push(tr.lateBy(-t.left));
  else if (t.left === 0) parts.push(tr.dueToday);
  else if (t.left === 1) parts.push(tr.dueTomorrow);
  else parts.push(tr.inDays(t.left));
  if (t.est_minutes) parts.push(tr.aboutMin(t.est_minutes));
  if (t.assignee_id && state.users.length > 1) {
    const u = state.users.find((x) => x.id === t.assignee_id);
    if (u) parts.push(u.id === state.me.id ? tr.you : u.name);
  }
  return parts.join(' · ');
}

interface Undo {
  taskId: number;
  prev: Task;
  completion: Promise<number>;
  text: string;
}

export function Today() {
  const { state, t, lang, setState, refresh } = useLoaded();
  const [quick, setQuick] = useState(false);
  const [toast, setToast] = useState<Undo | { text: string } | null>(null);
  const timer = useRef<number>(undefined);

  const showToast = (v: Undo | { text: string }) => {
    setToast(v);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 6000);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const zoneName = (id: number | null) => {
    const z = state.zones.find((x) => x.id === id);
    return z ? zoneLabel(z.name, lang) : '';
  };

  const counts = useMemo(() => {
    const c = { late: 0, due: 0, ok: 0 };
    for (const x of state.tasks) c[x.status]++;
    return c;
  }, [state.tasks]);

  const visible = useMemo(() => {
    let list = [...state.tasks].sort((a, b) => urgency(b) - urgency(a));
    if (quick) {
      let budget = QUICK_BUDGET;
      list = list
        .filter((x) => x.status !== 'ok')
        .filter((x) => {
          const m = x.est_minutes ?? 10;
          if (m > budget) return false;
          budget -= m;
          return true;
        });
    }
    return list;
  }, [state.tasks, quick]);

  // Completar es optimista: el estado se recalcula en cliente con taskStatus().
  const complete = (task: Task) => {
    const now = new Date();
    const anchor = now.toISOString();
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((x) =>
        x.id === task.id ? { ...x, anchor_at: anchor, ...taskStatus({ ...x, anchor_at: anchor }, now) } : x,
      ),
    }));
    const completion = api.done(task.id).then((r) => r.completionId);
    completion.then(refresh, () => {
      refresh();
      showToast({ text: t.errorGeneric });
    });
    showToast({ taskId: task.id, prev: task, completion, text: t.done(task.name) });
  };

  const undo = async (u: Undo) => {
    setToast(null);
    const now = new Date();
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((x) => (x.id === u.taskId ? { ...u.prev, ...taskStatus(u.prev, now) } : x)),
    }));
    try {
      await api.undo(await u.completion);
    } catch {
      showToast({ text: t.undoFailed });
    }
    refresh();
  };

  const groups: { key: Status; label: string }[] = [
    { key: 'late', label: t.groupLate },
    { key: 'due', label: t.groupDue },
    { key: 'ok', label: t.groupOk },
  ];
  const trashTomorrow = state.trash.tomorrow;
  const trashToday = state.trash.today;

  return (
    <div className="screen">
      <div className="header">
        <div className="stack" style={{ gap: 4 }}>
          <div className="subtle">{headerDate(lang, new Date(state.now))}</div>
          <h1>{t.today}</h1>
        </div>
        <Link href="/tasks/new" className="fab" aria-label={t.newTask}>
          {Icon.plus()}
        </Link>
      </div>

      {state.pausedSince && (
        <div className="banner paused">
          {Icon.timer(22)}
          <div>{t.pausedBanner}</div>
        </div>
      )}

      {state.tasks.length === 0 ? (
        <div className="empty">
          <h2>{t.emptyTitle}</h2>
          <p>{t.emptyBody}</p>
          <Link href="/tasks/new" className="chip sel" style={{ textDecoration: 'none' }}>
            {Icon.plus(18)}
            {t.emptyCta}
          </Link>
        </div>
      ) : (
        <>
          <div className="counts">
            <div className="count"><b className="c-late">{counts.late}</b><span>{t.countLate}</span></div>
            <div className="count"><b className="c-due">{counts.due}</b><span>{t.countDue}</span></div>
            <div className="count"><b className="c-ok">{counts.ok}</b><span>{t.countOk}</span></div>
          </div>

          {(trashTomorrow.length > 0 || trashToday.length > 0) && (
            <Link href="/trash" className="banner" style={{ textDecoration: 'none' }}>
              {Icon.trash()}
              {trashTomorrow.length > 0 ? (
                <div>
                  <strong>{t.trashTomorrow(trashTomorrow.join(lang === 'ja' ? '、' : ', '))}</strong>
                  <span className="hint">{t.trashTomorrowHint}</span>
                </div>
              ) : (
                <div>
                  <strong>{t.trashToday(trashToday.join(lang === 'ja' ? '、' : ', '))}</strong>
                  <span className="hint">{t.trashTodayHint}</span>
                </div>
              )}
            </Link>
          )}

          <button type="button" className={`chip outline${quick ? ' sel' : ''}`} style={{ alignSelf: 'flex-start' }} aria-pressed={quick} onClick={() => setQuick(!quick)}>
            {Icon.timer()}
            {t.quick}
          </button>

          {quick && visible.length === 0 && <div className="notice">{t.quickEmpty}</div>}
          {!quick && counts.late + counts.due === 0 && <div className="notice">{t.allClear}</div>}

          {groups.map((g) => {
            const items = visible.filter((x) => x.status === g.key);
            if (!items.length) return null;
            return (
              <section key={g.key} className="group">
                <div className={`group-head c-${g.key}`}>
                  <i />
                  <h2>{g.label}</h2>
                </div>
                {items.map((x) => (
                  <div key={x.id} className="task">
                    <Link href={`/tasks/${x.id}`} className="task-main" style={{ color: 'inherit', textDecoration: 'none' }}>
                      <div className="task-title">
                        <b>{x.name}</b>
                        <span>{zoneName(x.zone_id)}</span>
                      </div>
                      <div className={`bar c-${g.key}`}>
                        <div style={{ width: `${Math.max(4, Math.round(x.freshness * 100))}%` }} />
                      </div>
                      <div className="task-meta">{taskMeta(x, t, state)}</div>
                    </Link>
                    <button type="button" className="done-btn" aria-label={`${t.markDone}: ${x.name}`} onClick={() => complete(x)}>
                      {Icon.check()}
                    </button>
                  </div>
                ))}
              </section>
            );
          })}
        </>
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {'taskId' in toast && (
            <button type="button" onClick={() => undo(toast)}>
              {t.undo}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
