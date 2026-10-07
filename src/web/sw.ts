/// <reference lib="webworker" />
// Service worker propio (vite-plugin-pwa en modo injectManifest): precache + push.
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// SPA: cualquier navegación sirve index.html, salvo la API.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  // iOS exige mostrar una notificación por cada push; si no, Safari acaba revocando el permiso.
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Limpieza', {
      body: data.body,
      tag: data.tag,
      data: { url: data.url ?? '/' },
      icon: '/icon-192.png',
      badge: '/badge-72.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url: string = event.notification.data?.url ?? '/';
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const win = wins[0] as WindowClient | undefined;
      if (win) {
        await win.focus();
        await win.navigate(url);
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
