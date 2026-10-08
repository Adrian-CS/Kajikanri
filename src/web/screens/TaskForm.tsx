import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { api, type TaskInput } from '../api';
import { useLoaded } from '../store';
import { Icon, Segmented, Toggle, TopBar } from '../ui';

const PRESETS = [3, 7, 14, 30] as const;
const LAST_DONE = [0, 3, 7, 14, 30] as const;
/** Margen flexible: 30 % de la frecuencia, mínimo 1 día (CLAUDE.md). */
const flexFor = (every: number) => Math.min(every, Math.max(1, Math.round(every * 0.3)));

type Owner = 'any' | 'rotate' | string; // string = id de usuario

export function TaskForm({ id }: { id?: number }) {
  const { state, t, lang, refresh, setState } = useLoaded();
  const [, go] = useLocation();
  const existing = id ? state.tasks.find((x) => x.id === id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [zone, setZone] = useState<number | null>(existing ? existing.zone_id : (state.zones[0]?.id ?? null));
  const [every, setEvery] = useState(existing?.every_days ?? 7);
  const [flex, setFlex] = useState(existing ? existing.flex_days > 0 : true);
  const [owner, setOwner] = useState<Owner>(existing ? (existing.rotate ? 'rotate' : (existing.assignee_id ?? 'any')) : 'any');
  const [mins, setMins] = useState(existing?.est_minutes ? String(existing.est_minutes) : '');
  const [lastDone, setLastDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<{ id: number; done_at: string; user_name: string | null }[] | null>(null);

  useEffect(() => {
    if (id) api.history(id).then(setHistory, () => setHistory([]));
  }, [id]);

  if (id && !existing) {
    return (
      <>
        <TopBar title={t.editTask} backTo="/tasks" />
        <div className="screen form"><div className="notice">{t.notFound}</div></div>
      </>
    );
  }

  const addZone = async () => {
    const n = window.prompt(t.zonePrompt)?.trim();
    if (!n) return;
    try {
      const z = await api.createZone(n.slice(0, 40));
      setState((s) => ({ ...s, zones: [...s.zones, z] }));
      setZone(z.id);
    } catch {
      setError(t.errorGeneric);
    }
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    const m = parseInt(mins, 10);
    const input: TaskInput = {
      name: name.trim(),
      zone_id: zone,
      every_days: every,
      flex_days: flex ? flexFor(every) : 0,
      est_minutes: m > 0 ? Math.min(600, m) : null,
      rotate: owner === 'rotate',
      // Por turnos empieza por quien la crea, salvo que ya tuviera a alguien asignado.
      assignee_id: owner === 'any' ? null : owner === 'rotate' ? (existing?.assignee_id ?? state.me.id) : owner,
    };
    try {
      if (existing) await api.updateTask(existing.id, input);
      else await api.createTask({ ...input, last_done_days_ago: lastDone });
      await refresh();
      go(existing ? '/tasks' : '/');
    } catch {
      setError(t.errorGeneric);
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!existing || !window.confirm(t.archiveConfirm)) return;
    setBusy(true);
    try {
      await api.archiveTask(existing.id);
      await refresh();
      go('/tasks');
    } catch {
      setError(t.errorGeneric);
      setBusy(false);
    }
  };

  const owners: { key: Owner; label: string }[] = [
    { key: 'any', label: t.anyone },
    ...state.users.map((u) => ({ key: u.id, label: u.id === state.me.id ? t.you : u.name })),
    ...(state.users.length > 1 ? [{ key: 'rotate' as Owner, label: t.rotate }] : []),
  ];
  const presetLabel = { 3: t.preset3, 7: t.preset7, 14: t.preset14, 30: t.preset30 };
  const fmt = (iso: string) => {
    const j = new Date(new Date(iso).getTime() + 9 * 3_600_000);
    return lang === 'ja'
      ? `${j.getUTCFullYear()}/${j.getUTCMonth() + 1}/${j.getUTCDate()}`
      : `${j.getUTCDate()}/${j.getUTCMonth() + 1}/${j.getUTCFullYear()}`;
  };

  return (
    <>
      <TopBar title={existing ? t.editTask : t.newTask} backTo={existing ? '/tasks' : '/'} />
      <div className="screen form with-footer">
        <div className="stack">
          <label htmlFor="task-name" className="field-label">{t.name}</label>
          <input id="task-name" className="input" type="text" maxLength={80} value={name} placeholder={t.namePlaceholder} onChange={(e) => setName(e.target.value)} autoFocus={!existing} />
        </div>

        <div className="stack">
          <div className="field-label">{t.zone}</div>
          <div className="chips">
            {state.zones.map((z) => (
              <button key={z.id} type="button" className={`chip${zone === z.id ? ' sel' : ''}`} aria-pressed={zone === z.id} onClick={() => setZone(zone === z.id ? null : z.id)}>
                {z.name}
              </button>
            ))}
            <button type="button" className="chip" aria-label={t.addZone} onClick={addZone}>
              {Icon.plus(16)}
              {t.addZone}
            </button>
          </div>
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <div className="field-label">{t.frequency}</div>
          <div className="stepper">
            <button type="button" className="icon-btn" aria-label={t.fewer} onClick={() => setEvery(Math.max(1, every - 1))}>
              {Icon.minus()}
            </button>
            <div className="value">
              <b>{t.everyDays(every)}</b>
              <span>{t.sinceLast}</span>
            </div>
            <button type="button" className="icon-btn" aria-label={t.more} onClick={() => setEvery(Math.min(365, every + 1))}>
              {Icon.plus(20)}
            </button>
          </div>
          <div className="presets">
            {PRESETS.map((p) => (
              <button key={p} type="button" className={`chip${every === p ? ' sel' : ''}`} aria-pressed={every === p} onClick={() => setEvery(p)}>
                {presetLabel[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-row">
            <div className="grow">
              <div className="title">{t.flex}</div>
              <div className="hint">{flex ? t.flexOn(every + flexFor(every)) : t.flexOff(every)}</div>
            </div>
            <Toggle on={flex} label={t.flex} onChange={setFlex} />
          </div>
          <div className="stack" style={{ gap: 10, padding: '14px 0' }}>
            <div className="title" style={{ fontSize: 15, fontWeight: 700 }}>{t.who}</div>
            <Segmented options={owners} value={owner} onChange={setOwner} />
          </div>
        </div>

        <div className="stack">
          <label htmlFor="task-mins" className="field-label">{t.duration}</label>
          <div className="input-suffix">
            <input id="task-mins" className="input" type="number" inputMode="numeric" min={1} max={600} value={mins} placeholder="15" onChange={(e) => setMins(e.target.value)} />
            <span>{t.minutes}</span>
          </div>
        </div>

        {!existing && (
          <div className="stack">
            <div className="field-label">{t.lastDone}</div>
            <div className="chips">
              {LAST_DONE.map((d) => (
                <button key={d} type="button" className={`chip${lastDone === d ? ' sel' : ''}`} aria-pressed={lastDone === d} onClick={() => setLastDone(d)}>
                  {d === 0 ? t.lastDoneToday : t.lastDoneAgo(d)}
                </button>
              ))}
            </div>
          </div>
        )}

        {existing && (
          <div className="stack">
            <div className="section-label">{t.history}</div>
            <div className="card">
              {history === null ? (
                <div className="notice">{t.loading}</div>
              ) : history.length === 0 ? (
                <div className="notice">{t.historyEmpty}</div>
              ) : (
                <ul className="history">
                  {history.map((h) => (
                    <li key={h.id}>
                      {fmt(h.done_at)}
                      <span>{h.user_name ?? ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button type="button" className="danger" style={{ marginTop: 12 }} onClick={archive} disabled={busy}>
              {t.archive}
            </button>
          </div>
        )}

        {error && <div className="error" role="alert">{error}</div>}
      </div>

      <div className="footer-bar">
        <div>
          <button type="button" className="primary" onClick={save} disabled={busy || !name.trim()}>
            {busy ? t.saving : t.saveTask}
          </button>
        </div>
      </div>
    </>
  );
}
