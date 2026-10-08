// Estado global: lo que devuelve GET /api/state, más el idioma y un refresco.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, HttpError, type AppState } from './api';
import { dict, guessLang, type Lang, type T } from './i18n';

interface Store {
  state: AppState | null;
  error: 'auth' | 'net' | null;
  lang: Lang;
  t: T;
  setState: (fn: (s: AppState) => AppState) => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setRaw] = useState<AppState | null>(null);
  const [error, setError] = useState<Store['error']>(null);

  const refresh = useCallback(async () => {
    try {
      setRaw(await api.state());
      setError(null);
    } catch (e) {
      setError(e instanceof HttpError && e.status === 401 ? 'auth' : 'net');
    }
  }, []);

  useEffect(() => {
    refresh();
    // Al volver a la app (p. ej. desde una notificación) se recalcula todo.
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const lang: Lang = state?.me.lang ?? guessLang();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<Store>(
    () => ({
      state,
      error,
      lang,
      t: dict[lang],
      setState: (fn) => setRaw((s) => (s ? fn(s) : s)),
      refresh,
    }),
    [state, error, lang, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

/** Igual que useStore, pero para pantallas que solo se pintan con estado cargado. */
export function useLoaded() {
  const s = useStore();
  return s as Store & { state: AppState };
}
