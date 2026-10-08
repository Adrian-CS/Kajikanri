import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { StoreProvider } from './store';
import './styles.css';

function Root() {
  const [update, setUpdate] = useState<(() => void) | null>(null);
  useEffect(() => {
    // registerType 'prompt': la versión nueva espera a que se pulse «Actualizar».
    const updateSW = registerSW({
      onNeedRefresh: () => setUpdate(() => () => updateSW(true)),
    });
  }, []);
  return (
    <StoreProvider>
      <App update={update} />
    </StoreProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
