import type { Env } from './index';
import { pushToUser } from './push';
import { DAY, jstDay, taskStatus, trashOn, type TrashRule } from '../shared/time';

type User = { id: string };
interface Ctx {
  req: Request;
  env: Env;
  user: User;
  params: string[];
}
type Handler = (c: Ctx) => Promise<Response>;

const json = (data: unknown, status = 200) => Response.json(data, { status });
const bad = (error: string) => json({ error }, 400);
const nowIso = () => new Date().toISOString();

// ---------- validación ----------
const isInt = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isText = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isNullableInt = (v: unknown, min: number, max: number) => v === null || isInt(v, min, max);

async function body<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

// ---------- estado completo para la PWA ----------
const getState: Handler = async ({ env, user }) => {
  const db = env.DB;
  const [tasks, zones, users, trash, paused, me] = await db.batch([
    db.prepare('SELECT * FROM tasks WHERE archived = 0'),
    db.prepare('SELECT id, name, sort FROM zones ORDER BY sort, id'),
    db.prepare('SELECT id, name FROM users ORDER BY created_at'),
    db.prepare('SELECT id, name, weekdays, weeks FROM trash_rules ORDER BY id'),
    db.prepare("SELECT value FROM settings WHERE key = 'paused_since'"),
    db.prepare('SELECT id, name, lang, notify_minute, notify_late, notify_trash FROM users WHERE id = ?').bind(
      user.id,
    ),
  ]);
  const now = new Date();
  const rules = trash.results as unknown as TrashRule[];
  return json({
    now: now.toISOString(),
    me: me.results[0],
    users: users.results,
    zones: zones.results,
    trashRules: rules,
    trash: { today: trashOn(rules, now, 0), tomorrow: trashOn(rules, now, 1) },
    pausedSince: (paused.results[0] as { value: string } | undefined)?.value ?? null,
    tasks: (tasks.results as any[]).map((t) => ({ ...t, ...taskStatus(t, now) })),
  });
};

// ---------- tareas ----------
async function validAssignee(env: Env, v: unknown) {
  if (v === null || v === undefined) return true;
  if (typeof v !== 'string') return false;
  return !!(await env.DB.prepare('SELECT 1 FROM users WHERE id = ?').bind(v).first());
}

const createTask: Handler = async ({ req, env }) => {
  const b = await body<any>(req);
  if (!b || !isText(b.name, 80)) return bad('name');
  if (!isInt(b.every_days, 1, 365)) return bad('every_days');
  const flex = b.flex_days ?? 0;
  if (!isInt(flex, 0, b.every_days)) return bad('flex_days');
  const est = b.est_minutes ?? null;
  if (!isNullableInt(est, 1, 600)) return bad('est_minutes');
  const zone = b.zone_id ?? null;
  if (!isNullableInt(zone, 1, Number.MAX_SAFE_INTEGER)) return bad('zone_id');
  if (!(await validAssignee(env, b.assignee_id))) return bad('assignee_id');
  // Al dar de alta se puede decir cuándo se hizo por última vez, para no empezar todo en verde.
  const ago = b.last_done_days_ago ?? 0;
  if (!isInt(ago, 0, 365)) return bad('last_done_days_ago');

  const anchor = new Date(Date.now() - ago * DAY).toISOString();
  const row = await env.DB.prepare(
    `INSERT INTO tasks (name, zone_id, every_days, flex_days, est_minutes, assignee_id, rotate, anchor_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(b.name.trim(), zone, b.every_days, flex, est, b.assignee_id ?? null, b.rotate ? 1 : 0, anchor)
    .first();
  return json(row, 201);
};

const updateTask: Handler = async ({ req, env, params }) => {
  const id = Number(params[0]);
  const b = await body<any>(req);
  if (!b) return bad('body');
  const current = await env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND archived = 0').bind(id).first<any>();
  if (!current) return json({ error: 'not_found' }, 404);

  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    vals.push(v);
  };
  const every = b.every_days ?? current.every_days;

  if ('name' in b) { if (!isText(b.name, 80)) return bad('name'); set('name', b.name.trim()); }
  if ('every_days' in b) { if (!isInt(b.every_days, 1, 365)) return bad('every_days'); set('every_days', b.every_days); }
  if ('flex_days' in b) { if (!isInt(b.flex_days, 0, every)) return bad('flex_days'); set('flex_days', b.flex_days); }
  if ('est_minutes' in b) { if (!isNullableInt(b.est_minutes, 1, 600)) return bad('est_minutes'); set('est_minutes', b.est_minutes); }
  if ('zone_id' in b) { if (!isNullableInt(b.zone_id, 1, Number.MAX_SAFE_INTEGER)) return bad('zone_id'); set('zone_id', b.zone_id); }
  if ('assignee_id' in b) { if (!(await validAssignee(env, b.assignee_id))) return bad('assignee_id'); set('assignee_id', b.assignee_id); }
  if ('rotate' in b) set('rotate', b.rotate ? 1 : 0);
  if (!sets.length) return bad('nothing_to_update');

  const row = await env.DB.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ? RETURNING *`)
    .bind(...vals, id)
    .first();
  return json(row);
};

const archiveTask: Handler = async ({ env, params }) => {
  await env.DB.prepare('UPDATE tasks SET archived = 1 WHERE id = ?').bind(Number(params[0])).run();
  return json({ ok: true });
};

const completeTask: Handler = async ({ env, user, params }) => {
  const id = Number(params[0]);
  const t = await env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND archived = 0').bind(id).first<any>();
  if (!t) return json({ error: 'not_found' }, 404);

  let next = t.assignee_id as string | null;
  if (t.rotate) {
    // La próxima vez le toca a quien no la ha hecho.
    const other = await env.DB.prepare('SELECT id FROM users WHERE id != ? ORDER BY created_at LIMIT 1')
      .bind(user.id)
      .first<{ id: string }>();
    next = other?.id ?? user.id;
  }

  const now = nowIso();
  // D1 no admite BEGIN/COMMIT: batch es atómico.
  const [ins] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO completions (task_id, user_id, done_at, prev_anchor_at, prev_assignee_id)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
    ).bind(id, user.id, now, t.anchor_at, t.assignee_id),
    env.DB.prepare('UPDATE tasks SET anchor_at = ?, assignee_id = ? WHERE id = ?').bind(now, next, id),
  ]);
  return json({ completionId: (ins.results[0] as { id: number }).id });
};

const undoCompletion: Handler = async ({ env, params }) => {
  const c = await env.DB.prepare('SELECT * FROM completions WHERE id = ?').bind(Number(params[0])).first<any>();
  if (!c) return json({ error: 'not_found' }, 404);
  // Solo se puede deshacer la última de esa tarea; si no, el ancla quedaría mal.
  const last = await env.DB.prepare('SELECT id FROM completions WHERE task_id = ? ORDER BY done_at DESC LIMIT 1')
    .bind(c.task_id)
    .first<{ id: number }>();
  if (last?.id !== c.id) return json({ error: 'not_latest' }, 409);

  await env.DB.batch([
    env.DB.prepare('UPDATE tasks SET anchor_at = ?, assignee_id = ? WHERE id = ?').bind(
      c.prev_anchor_at,
      c.prev_assignee_id,
      c.task_id,
    ),
    env.DB.prepare('DELETE FROM completions WHERE id = ?').bind(c.id),
  ]);
  return json({ ok: true });
};

const history: Handler = async ({ env, params }) => {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.done_at, u.name AS user_name FROM completions c
     LEFT JOIN users u ON u.id = c.user_id WHERE c.task_id = ? ORDER BY c.done_at DESC LIMIT 50`,
  )
    .bind(Number(params[0]))
    .all();
  return json(results);
};

// ---------- zonas ----------
const createZone: Handler = async ({ req, env }) => {
  const b = await body<any>(req);
  if (!b || !isText(b.name, 40)) return bad('name');
  const row = await env.DB.prepare(
    'INSERT INTO zones (name, sort) VALUES (?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM zones)) RETURNING *',
  )
    .bind(b.name.trim())
    .first();
  return json(row, 201);
};

// ---------- basura: se reemplaza la lista entera ----------
const putTrash: Handler = async ({ req, env }) => {
  const b = await body<{ rules: TrashRule[] }>(req);
  if (!b || !Array.isArray(b.rules) || b.rules.length > 20) return bad('rules');
  const list = (s: string, min: number, max: number) =>
    /^\d(,\d)*$/.test(s) && s.split(',').every((x) => isInt(Number(x), min, max));
  for (const r of b.rules) {
    if (!isText(r.name, 40) || !list(r.weekdays, 0, 6) || (r.weeks !== null && !list(r.weeks, 1, 5))) {
      return bad('rule');
    }
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM trash_rules'),
    ...b.rules.map((r) =>
      env.DB.prepare('INSERT INTO trash_rules (name, weekdays, weeks) VALUES (?, ?, ?)').bind(
        r.name.trim(),
        r.weekdays,
        r.weeks,
      ),
    ),
  ]);
  return json({ ok: true });
};

// ---------- modo viaje ----------
const setPause: Handler = async ({ req, env }) => {
  const b = await body<{ on: boolean }>(req);
  if (!b || typeof b.on !== 'boolean') return bad('on');
  const cur = await env.DB.prepare("SELECT value FROM settings WHERE key = 'paused_since'").first<{ value: string }>();

  if (b.on) {
    if (!cur) await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('paused_since', ?)").bind(nowIso()).run();
    return json({ pausedSince: cur?.value ?? nowIso() });
  }
  if (!cur) return json({ pausedSince: null });

  // Al volver se desplazan todas las anclas los días que duró la pausa:
  // nada aparece atrasado por haber estado fuera.
  const days = jstDay(new Date()) - jstDay(cur.value);
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE tasks SET anchor_at = strftime('%Y-%m-%dT%H:%M:%fZ', anchor_at, ?) WHERE archived = 0",
    ).bind(`+${days} days`),
    env.DB.prepare("DELETE FROM settings WHERE key = 'paused_since'"),
  ]);
  return json({ pausedSince: null, shiftedDays: days });
};

// ---------- ajustes del usuario ----------
const updateMe: Handler = async ({ req, env, user }) => {
  const b = await body<any>(req);
  if (!b) return bad('body');
  const sets: string[] = [];
  const vals: unknown[] = [];
  if ('name' in b) { if (!isText(b.name, 40)) return bad('name'); sets.push('name = ?'); vals.push(b.name.trim()); }
  if ('lang' in b) { if (b.lang !== 'es' && b.lang !== 'ja') return bad('lang'); sets.push('lang = ?'); vals.push(b.lang); }
  if ('notify_minute' in b) { if (!isInt(b.notify_minute, 0, 1439)) return bad('notify_minute'); sets.push('notify_minute = ?'); vals.push(b.notify_minute); }
  if ('notify_late' in b) { sets.push('notify_late = ?'); vals.push(b.notify_late ? 1 : 0); }
  if ('notify_trash' in b) { sets.push('notify_trash = ?'); vals.push(b.notify_trash ? 1 : 0); }
  if (!sets.length) return bad('nothing_to_update');
  const row = await env.DB.prepare(
    `UPDATE users SET ${sets.join(', ')} WHERE id = ? RETURNING id, name, lang, notify_minute, notify_late, notify_trash`,
  )
    .bind(...vals, user.id)
    .first();
  return json(row);
};

// ---------- push ----------
const pushKey: Handler = async ({ env }) => json({ key: env.VAPID_PUBLIC_KEY });

const subscribe: Handler = async ({ req, env, user }) => {
  const b = await body<{ endpoint: string; keys?: { p256dh: string; auth: string } }>(req);
  if (!b?.endpoint?.startsWith('https://') || !b.keys?.p256dh || !b.keys?.auth) return bad('subscription');
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  )
    .bind(b.endpoint, user.id, b.keys.p256dh, b.keys.auth)
    .run();
  return json({ ok: true });
};

const unsubscribe: Handler = async ({ req, env, user }) => {
  const b = await body<{ endpoint: string }>(req);
  if (!b?.endpoint) return bad('endpoint');
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')
    .bind(b.endpoint, user.id)
    .run();
  return json({ ok: true });
};

const testPush: Handler = async ({ env, user }) => {
  await pushToUser(env, user.id, { title: 'Limpieza', body: 'Prueba de notificación ✓', tag: 'test', url: '/' });
  return json({ ok: true });
};

// ---------- router ----------
const routes: [string, RegExp, Handler][] = [
  ['GET', /^\/api\/state$/, getState],
  ['POST', /^\/api\/tasks$/, createTask],
  ['PATCH', /^\/api\/tasks\/(\d+)$/, updateTask],
  ['DELETE', /^\/api\/tasks\/(\d+)$/, archiveTask],
  ['POST', /^\/api\/tasks\/(\d+)\/done$/, completeTask],
  ['GET', /^\/api\/tasks\/(\d+)\/history$/, history],
  ['POST', /^\/api\/completions\/(\d+)\/undo$/, undoCompletion],
  ['POST', /^\/api\/zones$/, createZone],
  ['PUT', /^\/api\/trash$/, putTrash],
  ['POST', /^\/api\/pause$/, setPause],
  ['PATCH', /^\/api\/me$/, updateMe],
  ['GET', /^\/api\/push\/key$/, pushKey],
  ['POST', /^\/api\/push\/subscribe$/, subscribe],
  ['DELETE', /^\/api\/push\/subscribe$/, unsubscribe],
  ['POST', /^\/api\/push\/test$/, testPush],
];

export async function api(req: Request, env: Env, user: User, url: URL): Promise<Response> {
  for (const [method, re, handler] of routes) {
    if (req.method !== method) continue;
    const m = url.pathname.match(re);
    if (m) return handler({ req, env, user, params: m.slice(1) });
  }
  return json({ error: 'not_found' }, 404);
}
