import { useState } from 'react';
import { api } from '../api';
import { zoneLabel } from '../i18n';
import { useLoaded } from '../store';
import { Icon, TopBar } from '../ui';

/** Renombrar, quitar y añadir zonas. Al renombrar una zona por defecto deja de traducirse. */
export function Zones() {
  const { state, t, lang, setState, refresh } = useLoaded();
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');

  const fail = () => {
    setError(t.errorGeneric);
    refresh();
  };

  const rename = async (id: number, shown: string, value: string) => {
    const n = value.trim().slice(0, 40);
    if (!n || n === shown) return; // sin cambios: no se guarda (así una zona por defecto sigue traduciéndose)
    setError('');
    setState((s) => ({ ...s, zones: s.zones.map((z) => (z.id === id ? { ...z, name: n } : z)) }));
    await api.renameZone(id, n).catch(fail);
  };

  const remove = async (id: number, shown: string) => {
    if (!window.confirm(t.zoneDeleteConfirm(shown))) return;
    setError('');
    setState((s) => ({
      ...s,
      zones: s.zones.filter((z) => z.id !== id),
      tasks: s.tasks.map((x) => (x.zone_id === id ? { ...x, zone_id: null } : x)),
    }));
    await api.deleteZone(id).catch(fail);
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = newName.trim().slice(0, 40);
    if (!n) return;
    setError('');
    try {
      const z = await api.createZone(n);
      setState((s) => ({ ...s, zones: [...s.zones, z] }));
      setNewName('');
    } catch {
      fail();
    }
  };

  return (
    <>
      <TopBar title={t.zones} backTo="/tasks" />
      <div className="screen form">
        <div className="subtle">{t.zonesIntro}</div>

        {state.zones.length === 0 ? (
          <div className="notice">{t.zonesEmpty}</div>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {state.zones.map((z) => {
              const shown = zoneLabel(z.name, lang);
              return (
                <div key={`${z.id}-${shown}`} className="row">
                  <input
                    className="input"
                    type="text"
                    maxLength={40}
                    aria-label={t.name}
                    defaultValue={shown}
                    onBlur={(e) => rename(z.id, shown, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                  <button type="button" className="icon-btn" aria-label={`${t.removeZone}: ${shown}`} onClick={() => remove(z.id, shown)}>
                    {Icon.x()}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <form className="row" onSubmit={add}>
          <input className="input" type="text" maxLength={40} aria-label={t.zonePrompt} placeholder={t.zonePrompt} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button type="submit" className="icon-btn" aria-label={t.addZone} disabled={!newName.trim()}>
            {Icon.plus(20)}
          </button>
        </form>

        {error && <div className="error" role="alert">{error}</div>}
      </div>
    </>
  );
}
