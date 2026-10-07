# CLAUDE.md — Kajikanri

PWA para llevar el control de la limpieza de casa y recibir un aviso cuando toca algo.
Proyecto personal. Lo usa Adrián; puede que su pareja también. Restricción dura:
**todo dentro del plan gratuito de Cloudflare**.

Diseño de referencia (3 pantallas interactivas): https://claude.ai/artifact/GgJbBFgU12wrfLg3JEGzrN

---

## Qué es y qué no es

Una lista de tareas **por frecuencia**, no un calendario. "Limpiar baño cada 7 días" se cuenta
desde la última vez que se hizo, no desde un lunes fijo. Si se limpia un jueves, la siguiente
vez toca el jueves siguiente.

**No es** una app de productividad, ni tiene puntos, rachas ni rankings. Silenciosa por defecto.

---

## Restricciones que no se negocian

1. **Gratis.** Workers + D1 + Cron Triggers del plan free. Sin servicios de push de terceros.
2. **Bilingüe ES / JA.** Texto nuevo de la interfaz va a los dos idiomas o no va.
   Los nombres de tareas y zonas son texto del usuario y **no se traducen**.
3. **Silenciosa.** Un resumen diario como máximo, más dos avisos opcionales (muy atrasado y
   basura). Si no hay nada pendiente, no se envía nada.
4. **Una casa por despliegue.** Todos los usuarios ven las mismas tareas. No hay `home_id`.

---

## Arquitectura

Mismo patrón que Nefuda: un único Worker sirve la PWA (estáticos), la API y el cron.

```
PWA (Vite + React + wouter)  --passkey-->  Worker  -->  D1
          ^                                  |
          +-------- Web Push <-- Cron */30 --+
```

- `src/worker/index.ts` — entrada: `/api/auth/*` → auth, resto de `/api/*` → `api.ts`.
  Los estáticos los sirve `[assets]` directamente (`run_worker_first` solo para `/api/*`).
- `src/worker/auth.ts` — copiado de Nefuda (passkeys, JWT con `jose` en cookie, `INVITE_CODE`).
  `handleAuth(req, env): Promise<Response | null>` y
  `requireUser(req, env): Promise<{ id: string } | null>`. El login se identifica por
  `users.email` (no se muestra); `users.name` es el nombre visible y se pide al registrarse
  (`name` opcional en `/api/auth/register/options`, si falta se usa lo de antes de la @).
- `src/worker/api.ts` — router a mano con regex, validación en cada handler.
- `src/worker/cron.ts` — decide y envía los avisos.
- `src/worker/push.ts` — Web Push implementado con WebCrypto (VAPID + aes128gcm).
- `src/shared/time.ts` — cálculo de estado y basura, **compartido** entre Worker y PWA.
- `src/web/sw.ts` — service worker propio (precache + `push` + `notificationclick`).
- `src/web/push.ts` — alta/baja de notificaciones desde la PWA.

---

## Decisiones y por qué

### Las tareas guardan un ancla, no una fecha de vencimiento
`tasks.anchor_at` es "desde cuándo se cuenta". Al completar, el ancla pasa a ahora. El estado
(`late` / `due` / `ok`) se calcula siempre en `taskStatus()`, nunca se guarda. Así cambiar la
frecuencia de una tarea recalcula todo sin migraciones.

- `late`: han pasado más de `every_days + flex_days` días.
- `due`: toca hoy o mañana, o está dentro del margen flexible.
- `ok`: al día.

El margen flexible lo calcula la PWA al guardar (30 % de la frecuencia, mínimo 1 día) y se
guarda como `flex_days`. El Worker solo valida `0 ≤ flex_days ≤ every_days`.

### Deshacer usa la fila de `completions`, no el historial
Cada completado guarda `prev_anchor_at` y `prev_assignee_id`. Deshacer restaura esos valores
y borra la fila. Solo se puede deshacer el último completado de cada tarea (409 si no), porque
si no el ancla quedaría incoherente. **No recalcular el ancla a partir del historial.**

### Turnos
`rotate = 1`: al completar, `assignee_id` pasa a "el otro usuario" (el primero distinto de quien
la hizo). `assignee_id = NULL` significa que la puede hacer cualquiera y aparece en el resumen
de todos.

### Modo viaje desplaza las anclas
Al activar se guarda `settings.paused_since`. Al desactivar se suman a **todas** las anclas los
días que duró la pausa, y se borra la clave. Mientras dura, el cron no envía nada.
Ninguna otra parte del código tiene que saber que existió la pausa.

### Días en JST con desplazamiento fijo
Las fechas se guardan en ISO UTC. Los días se cuentan en JST (UTC+9 fijo, Japón no tiene
horario de verano) con `jstDay()`. Nunca usar la hora local del Worker ni `toLocaleDateString`.

### Basura: calendario fijo, aparte de las tareas
La recogida sí va por día de la semana, así que no encaja en el modelo de frecuencia.
`trash_rules.weekdays` = `'1,4'` (0 = domingo); `weeks` = `NULL` (todas) o `'2,4'` (第2・第4).
Se edita como lista completa (`PUT /api/trash` reemplaza todo).

### Web Push sin librería
`web-push` de npm depende del `crypto` de Node y no funciona bien en Workers. `push.ts`
implementa RFC 8291/8292 con WebCrypto. Está probado con un ida y vuelta contra `http_ece`
(la implementación de referencia que usa `web-push`) y la firma VAPID verificada.

### Cron cada 30 min con deduplicación
Un solo trigger (`*/30 * * * *`). Para cada usuario mira si la hora actual está dentro de una
ventana de 60 min desde su hora de aviso. `notification_log` se inserta **antes** de enviar:
como mucho un aviso de cada tipo al día. Si el envío falla, ese día no se reintenta (aceptado).

| Aviso | Hora (JST) | Condición |
|---|---|---|
| `daily` | `users.notify_minute` (por defecto 08:00) | hay tareas `late` o `due` suyas o de cualquiera |
| `late` | 19:00 | `notify_late` y alguna tarea con 3+ días de retraso real |
| `trash` | 21:00 | `notify_trash` y mañana hay recogida |

---

## Trampas conocidas

- **iOS solo admite push en la PWA instalada** en la pantalla de inicio (iOS 16.4+).
  `enablePush()` devuelve `needs-install` en Safari normal: la UI tiene que explicar cómo
  instalarla en vez de mostrar un error.
- **El permiso se pide desde un toque del usuario.** Nunca llamar a `enablePush()` al cargar.
- **Cada push debe mostrar una notificación** (`userVisibleOnly`). Si el SW recibe un push y no
  muestra nada, Safari acaba revocando el permiso. No usar push silenciosos para sincronizar.
- **`VAPID_SUBJECT` tiene que ser un `mailto:` o `https:` real**: Apple rechaza el push si no.
- **Regenerar las claves VAPID invalida todas las suscripciones.** Generarlas una vez.
- **Tipos de ECDH en Workers**: el runtime acepta `public` (estándar) y workers-types lo declara
  como `$public`. Por eso hay un cast en `push.ts`. No "arreglarlo" cambiando a `$public`.
- **D1 no soporta `BEGIN`/`COMMIT`.** Usar `db.batch()` (es atómico).
- **CPU del plan free (10 ms por invocación).** El cifrado de push es nativo y barato, pero no
  añadir trabajo pesado al cron. Con dos usuarios va sobrado.
- **Si se añade un atajo de desarrollo al auth** (usuario fijo sin cookie): **nunca
  desplegarlo en producción**. El `auth.ts` copiado de Nefuda no lo tiene.

---

## Estado

Repo: https://github.com/Adrian-CS/Kajikanri (rama `main`). Última sesión: 2026-10-07.

**Hecho**
- `schema.sql` v1. Probado en SQLite local; en D1 remoto ver "Cloudflare" abajo.
- Worker: API completa, cron, Web Push. Compila con `tsc --strict` y workers-types.
- `src/shared/time.ts` probado (estados, márgenes, basura por semana del mes).
- `sw.ts`, `push.ts` del cliente, `vite.config.ts`, `wrangler.toml`, `scripts/vapid.mjs`.
- `auth.ts` de Nefuda adaptado; `credentials` con las mismas columnas que Nefuda.
  Nefuda no tiene atajo de desarrollo en el auth: no hay nada que quitar antes de desplegar.
- Nombre de la app: **Kajikanri** (antes "Limpieza"). Worker y D1 se llaman `kajikanri`.

**Cloudflare (estado al cerrar el 2026-10-07)**
- D1 `kajikanri` creada (APAC), `database_id` ya en `wrangler.toml`.
- Claves VAPID generadas: pública en `wrangler.toml`, privada como secreto.
  **No volver a ejecutar `scripts/vapid.mjs`** (invalidaría las suscripciones).
- `VAPID_SUBJECT` = `mailto:adrianflei@zohomail.eu`.
- Por confirmar con `npx wrangler secret list`: que `VAPID_PRIVATE_JWK`, `SESSION_SECRET` e
  `INVITE_CODE` estén en el Worker `kajikanri`. Hubo un intento contra un Worker "limpieza"
  que no debería haberse creado; si existe en el panel, borrarlo.
- Por confirmar: si ya se ejecutó `schema.sql` en remoto (usa `CREATE TABLE` sin
  `IF NOT EXISTS`: una segunda ejecución falla).
- Aún no se ha desplegado nada.

**Pendiente** (en orden)
- `package.json`, `tsconfig`, `index.html`. Versiones como en Nefuda: TypeScript ^5.7,
  `@simplewebauthn/*` ^13, `jose` ^6 (con `@simplewebauthn` 14 no está probado).
- Frontend React: pantallas Hoy, Nueva/editar tarea, Ajustes, según el diseño de referencia.
  La pantalla Hoy tiene que usar `taskStatus()` en cliente para el "deshacer" optimista.
- Diccionario i18n ES/JA de la interfaz.
- Pantalla de instalación para iOS (cuando `pushStatus()` sea `needs-install`).
- Editor de reglas de basura (días reales de Nerima por rellenar).
- Iconos: `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `badge-72.png` en `public/`.

---

## API

Todas bajo `/api`, requieren sesión salvo `/api/auth/*`.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/state` | Todo lo que necesita la PWA: tareas con estado calculado, zonas, usuarios, basura hoy/mañana, pausa, ajustes propios |
| POST | `/tasks` | Alta. Acepta `last_done_days_ago` para no empezar todo en verde |
| PATCH | `/tasks/:id` | Edición parcial |
| DELETE | `/tasks/:id` | Archiva (no borra el historial) |
| POST | `/tasks/:id/done` | Completa. Devuelve `completionId` para deshacer |
| GET | `/tasks/:id/history` | Últimos 50 completados |
| POST | `/completions/:id/undo` | Deshace (solo el último de la tarea) |
| POST | `/zones` | Nueva zona |
| PUT | `/trash` | Reemplaza las reglas de basura |
| POST | `/pause` | `{ on: boolean }` modo viaje |
| PATCH | `/me` | Nombre, idioma, hora de aviso, toggles |
| GET | `/push/key` | Clave pública VAPID |
| POST / DELETE | `/push/subscribe` | Alta / baja de un dispositivo |
| POST | `/push/test` | Envía un aviso de prueba a tus dispositivos |

---

## Puesta en marcha

```bash
npm create vite@latest . -- --template react-ts   # si el repo está vacío
npm i wouter jose @simplewebauthn/server@^13 @simplewebauthn/browser@^13
npm i -D wrangler @cloudflare/workers-types vite-plugin-pwa workbox-precaching workbox-routing

npx wrangler d1 create kajikanri                   # pegar el id en wrangler.toml
npx wrangler d1 execute kajikanri --remote --file=./schema.sql
node scripts/vapid.mjs                             # clave pública → wrangler.toml
npx wrangler secret put VAPID_PRIVATE_JWK
npx wrangler secret put SESSION_SECRET
npx wrangler secret put INVITE_CODE
npm run build && npx wrangler deploy
```

En desarrollo: `npx wrangler dev` (puerto 8787) y `npm run dev` en otra terminal; Vite hace
proxy de `/api`. Para probar el cron en local: `npx wrangler dev --test-scheduled` y
`curl "http://localhost:8787/__scheduled?cron=*/30+*+*+*+*"`.
