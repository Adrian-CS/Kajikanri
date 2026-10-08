import { useEffect, useState } from 'react';
import { api, type Me } from '../api';
import type { Lang } from '../i18n';
import { disablePush, enablePush, pushStatus, type PushState } from '../push';
import { useLoaded } from '../store';
import { Icon, Segmented, Toggle, hhmm } from '../ui';

const STEP = 30;

export function Settings() {
  const { state, t, setState, refresh } = useLoaded();
  const me = state.me;
  const [name, setName] = useState(me.name);
  const [push, setPush] = useState<PushState | 'loading'>('loading');
  const [pushBusy, setPushBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    // pushStatus() espera al SW; si no hay SW (p. ej. en desarrollo) no debe quedarse colgado.
    const timeout = new Promise<PushState>((r) => setTimeout(() => r('unsupported'), 4000));
    Promise.race([pushStatus(), timeout]).then(setPush, () => setPush('unsupported'));
  }, []);

  const patch = async (m: Partial<Omit<Me, 'id'>>) => {
    setState((s) => ({ ...s, me: { ...s.me, ...m } })); // optimista
    try {
      const saved = await api.updateMe(m);
      setState((s) => ({ ...s, me: saved }));
    } catch {
      setNote(t.errorGeneric);
      refresh();
    }
  };

  const setPause = async (on: boolean) => {
    setState((s) => ({ ...s, pausedSince: on ? new Date().toISOString() : null }));
    try {
      await api.pause(on);
    } catch {
      setNote(t.errorGeneric);
    }
    refresh(); // al desactivar se desplazan las anclas
  };

  // Siempre desde un toque: iOS solo pide permiso en respuesta a un gesto.
  const onEnable = async () => {
    setPushBusy(true);
    setNote('');
    try {
      setPush(await enablePush());
    } catch {
      setNote(t.errorGeneric);
    }
    setPushBusy(false);
  };
  const onDisable = async () => {
    setPushBusy(true);
    try {
      await disablePush();
      setPush('off');
    } catch {
      setNote(t.errorGeneric);
    }
    setPushBusy(false);
  };
  const onTest = async () => {
    setNote('');
    try {
      await api.testPush();
      setNote(t.pushTestSent);
    } catch {
      setNote(t.errorGeneric);
    }
  };

  const logout = async () => {
    await api.logout().catch(() => {});
    window.location.href = '/';
  };

  const saveName = () => {
    const n = name.trim();
    if (n && n !== me.name) patch({ name: n.slice(0, 40) });
    else setName(me.name);
  };

  return (
    <div className="screen" style={{ gap: 22 }}>
      <h1>{t.settings}</h1>

      <div className="stack">
        <div className="section-label">{t.preview}</div>
        <div className="notif" aria-hidden="true">
          <div className="notif-icon">{Icon.check(20)}</div>
          <div className="stack" style={{ gap: 2, flex: 1 }}>
            <div className="top"><b>KAJIKANRI</b><span>{hhmm(me.notify_minute)}</span></div>
            <div className="t">{t.previewTitle}</div>
            <div className="b">{t.previewBody}</div>
          </div>
        </div>
      </div>

      <div className="stack">
        <div className="section-label">{t.notifications}</div>
        <div className="card">
          <div className="card-row">
            <div className="grow">
              <div className="title">{t.daily}</div>
              <div className="hint">{t.dailyHint}</div>
            </div>
            <div className="time-stepper">
              <button type="button" aria-label={t.earlier} onClick={() => patch({ notify_minute: Math.max(0, me.notify_minute - STEP) })}>
                {Icon.left()}
              </button>
              <b>{hhmm(me.notify_minute)}</b>
              <button type="button" aria-label={t.later} onClick={() => patch({ notify_minute: Math.min(24 * 60 - STEP, me.notify_minute + STEP) })}>
                {Icon.right()}
              </button>
            </div>
          </div>
          <div className="card-row">
            <div className="grow">
              <div className="title">{t.notifyLate}</div>
              <div className="hint">{t.notifyLateHint}</div>
            </div>
            <Toggle on={!!me.notify_late} label={t.notifyLate} onChange={(v) => patch({ notify_late: v ? 1 : 0 })} />
          </div>
          <div className="card-row">
            <div className="grow">
              <div className="title">{t.notifyTrash}</div>
              <div className="hint">{t.notifyTrashHint}</div>
            </div>
            <Toggle on={!!me.notify_trash} label={t.notifyTrash} onChange={(v) => patch({ notify_trash: v ? 1 : 0 })} />
          </div>
          <div className="card-row">
            <div className="grow">
              <div className="title">{t.travel}</div>
              <div className="hint">{state.pausedSince ? t.travelOn : t.travelOff}</div>
            </div>
            <Toggle on={!!state.pausedSince} label={t.travel} onChange={setPause} />
          </div>
        </div>
      </div>

      <div className="stack">
        <div className="section-label">{t.device}</div>
        {push === 'needs-install' ? (
          <div className="card install" style={{ padding: '16px' }}>
            <div className="title" style={{ fontWeight: 700, fontSize: 15 }}>{t.installTitle}</div>
            <div className="hint" style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 4 }}>{t.installBody}</div>
            <ol>
              <li>
                {t.installStep1} <span style={{ color: 'var(--brand)', verticalAlign: 'middle' }}>{Icon.share(16)}</span>
              </li>
              <li>{t.installStep2}</li>
              <li>{t.installStep3}</li>
            </ol>
          </div>
        ) : (
          <div className="card">
            <div className="card-row">
              <div className="grow">
                <div className="title">
                  {push === 'ok' ? t.pushOk : push === 'denied' ? t.pushDenied : push === 'unsupported' ? t.pushUnsupported : push === 'loading' ? t.loading : t.pushOff}
                </div>
              </div>
            </div>
            {(push === 'off' || push === 'ok') && (
              <div className="row" style={{ padding: '12px 0' }}>
                {push === 'off' ? (
                  <button type="button" className="primary" style={{ height: 48 }} onClick={onEnable} disabled={pushBusy}>
                    {t.pushEnable}
                  </button>
                ) : (
                  <>
                    <button type="button" className="secondary" onClick={onTest}>
                      {t.pushTest}
                    </button>
                    <button type="button" className="secondary" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }} onClick={onDisable} disabled={pushBusy}>
                      {t.pushDisable}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {note && <div className="notice" role="status">{note}</div>}
      </div>

      <div className="stack">
        <label htmlFor="me-name" className="section-label">{t.yourName}</label>
        <input id="me-name" className="input" type="text" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      </div>

      <div className="stack">
        <div className="section-label">{t.language}</div>
        <Segmented<Lang>
          options={[
            { key: 'es', label: 'Español' },
            { key: 'ja', label: '日本語' },
          ]}
          value={me.lang}
          onChange={(lang) => patch({ lang })}
        />
      </div>

      <button type="button" className="text-btn" style={{ alignSelf: 'flex-start' }} onClick={logout}>
        {t.logout}
      </button>
    </div>
  );
}
