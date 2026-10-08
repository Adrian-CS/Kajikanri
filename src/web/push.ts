// Alta de notificaciones desde la PWA. Llamar SIEMPRE desde un toque del usuario (iOS lo exige).

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'ok';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

function keyToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const p = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(p + '='.repeat((4 - (p.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Estado actual sin pedir nada (para pintar el ajuste). */
export async function pushStatus(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) ? 'ok' : 'off';
}

export async function enablePush(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';

  const reg = await navigator.serviceWorker.ready;
  const { key } = await fetch('/api/push/key').then((r) => r.json());
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) }));

  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sub),
  });
  return 'ok';
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}
