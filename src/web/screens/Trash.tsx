import { useEffect, useState } from 'react';
import type { TrashRule } from '../../shared/time';
import { api } from '../api';
import { useLoaded } from '../store';
import { Icon } from '../ui';

interface Draft {
  key: number;
  name: string;
  weekdays: number[];
  weeks: number[]; // vacío = todas las semanas
}

const nums = (s: string | null) => (s ? s.split(',').map(Number) : []);
const toDraft = (r: TrashRule, i: number): Draft => ({ key: i, name: r.name, weekdays: nums(r.weekdays), weeks: nums(r.weeks) });
const toggle = (list: number[], n: number) => (list.includes(n) ? list.filter((x) => x !== n) : [...list, n].sort((a, b) => a - b));
// Lunes primero, que es como se lee un calendario de recogida.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Editor del calendario de basura. Se guarda la lista entera (PUT /api/trash). */
export function Trash() {
  const { state, t, refresh } = useLoaded();
  const [drafts, setDrafts] = useState<Draft[]>(() => state.trashRules.map(toDraft));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [nextKey, setNextKey] = useState(1000);

  // Si llega estado nuevo del servidor y no hay cambios sin guardar, se refleja.
  useEffect(() => {
    if (!dirty) setDrafts(state.trashRules.map(toDraft));
  }, [state.trashRules, dirty]);

  const edit = (key: number, fn: (d: Draft) => Draft) => {
    setDrafts((ds) => ds.map((d) => (d.key === key ? fn(d) : d)));
    setDirty(true);
    setMsg(null);
  };

  const add = () => {
    setDrafts((ds) => [...ds, { key: nextKey, name: '', weekdays: [], weeks: [] }]);
    setNextKey(nextKey + 1);
    setDirty(true);
    setMsg(null);
  };

  const remove = (key: number) => {
    setDrafts((ds) => ds.filter((d) => d.key !== key));
    setDirty(true);
    setMsg(null);
  };

  const save = async () => {
    if (drafts.some((d) => !d.name.trim() || d.weekdays.length === 0)) {
      setMsg({ ok: false, text: t.invalidRule });
      return;
    }
    setBusy(true);
    try {
      await api.putTrash(
        drafts.map((d) => ({
          name: d.name.trim().slice(0, 40),
          weekdays: d.weekdays.join(','),
          weeks: d.weeks.length ? d.weeks.join(',') : null,
        })),
      );
      setDirty(false);
      await refresh();
      setMsg({ ok: true, text: t.saved });
    } catch {
      setMsg({ ok: false, text: t.errorGeneric });
    }
    setBusy(false);
  };

  return (
    <div className="screen">
      <div className="stack" style={{ gap: 6 }}>
        <h1>{t.trash}</h1>
        <div className="subtle">{t.trashIntro}</div>
      </div>

      {drafts.length === 0 && <div className="notice">{t.trashEmpty}</div>}

      {drafts.map((d) => (
        <div key={d.key} className="rule">
          <div className="row">
            <input
              className="input"
              type="text"
              maxLength={40}
              aria-label={t.trashKind}
              placeholder={t.trashKindPlaceholder}
              value={d.name}
              onChange={(e) => edit(d.key, (x) => ({ ...x, name: e.target.value }))}
            />
            <button type="button" className="icon-btn" aria-label={t.removeRule} onClick={() => remove(d.key)}>
              {Icon.x()}
            </button>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <div className="field-label">{t.weekdays}</div>
            <div className="days">
              {WEEK_ORDER.map((wd) => (
                <button key={wd} type="button" className={`chip${d.weekdays.includes(wd) ? ' sel' : ''}`} aria-pressed={d.weekdays.includes(wd)} onClick={() => edit(d.key, (x) => ({ ...x, weekdays: toggle(x.weekdays, wd) }))}>
                  {t.dayNames[wd]}
                </button>
              ))}
            </div>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <div className="field-label">{t.weeks}</div>
            <div className="weeks">
              <button type="button" className={`chip${d.weeks.length === 0 ? ' sel' : ''}`} aria-pressed={d.weeks.length === 0} onClick={() => edit(d.key, (x) => ({ ...x, weeks: [] }))}>
                {t.everyWeek}
              </button>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className={`chip${d.weeks.includes(n) ? ' sel' : ''}`} aria-pressed={d.weeks.includes(n)} onClick={() => edit(d.key, (x) => ({ ...x, weeks: toggle(x.weeks, n) }))}>
                  {t.nthWeek(n)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}

      <button type="button" className="secondary" onClick={add}>
        {t.addRule}
      </button>

      {msg && (
        <div className={msg.ok ? 'notice' : 'error'} role="status">
          {msg.text}
        </div>
      )}

      <button type="button" className="primary" onClick={save} disabled={busy || !dirty}>
        {busy ? t.saving : t.save}
      </button>
    </div>
  );
}
