import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { useState } from 'react';
import { call, HttpError } from '../api';
import { useStore } from '../store';
import { Icon } from '../ui';

export function Login() {
  const { t, refresh } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      // Los mensajes del Worker de auth están solo en español: aquí se traducen por código.
      setError(e instanceof HttpError && e.status === 403 ? t.inviteInvalid : t.loginFailed);
    }
    setBusy(false);
  };

  const login = () =>
    run(async () => {
      const optionsJSON = await call<Parameters<typeof startAuthentication>[0]['optionsJSON']>('POST', '/auth/login/options');
      const response = await startAuthentication({ optionsJSON });
      await call('POST', '/auth/login/verify', { response });
    });

  const register = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const em = email.trim().toLowerCase();
      const optionsJSON = await call<Parameters<typeof startRegistration>[0]['optionsJSON']>('POST', '/auth/register/options', {
        email: em,
        invite: invite.trim(),
        name: name.trim() || undefined,
      });
      const response = await startRegistration({ optionsJSON });
      await call('POST', '/auth/register/verify', { response, email: em, deviceName: navigator.platform || undefined });
    });
  };

  return (
    <div className="login">
      <div className="brand">
        <div className="mark">{Icon.check(34)}</div>
        <h1>{t.loginTitle}</h1>
        <div className="subtle">{t.loginTagline}</div>
      </div>

      {mode === 'login' ? (
        <div className="stack" style={{ gap: 12 }}>
          <button type="button" className="primary" onClick={login} disabled={busy}>
            {t.login}
          </button>
          <button type="button" className="text-btn" onClick={() => setMode('register')}>
            {t.registerToggle}
          </button>
        </div>
      ) : (
        <form className="stack" style={{ gap: 14 }} onSubmit={register}>
          <div className="stack">
            <label htmlFor="r-email" className="field-label">{t.email}</label>
            <input id="r-email" className="input" type="email" autoComplete="username webauthn" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="stack">
            <label htmlFor="r-name" className="field-label">{t.yourName}</label>
            <input id="r-name" className="input" type="text" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="stack">
            <label htmlFor="r-invite" className="field-label">{t.invite}</label>
            <input id="r-invite" className="input" type="text" autoComplete="off" required value={invite} onChange={(e) => setInvite(e.target.value)} />
          </div>
          <button type="submit" className="primary" disabled={busy}>
            {t.register}
          </button>
          <button type="button" className="text-btn" onClick={() => setMode('login')}>
            {t.loginToggle}
          </button>
        </form>
      )}

      {error && <div className="error" role="alert">{error}</div>}
    </div>
  );
}
