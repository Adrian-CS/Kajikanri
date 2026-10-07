// Cron cada 30 min. Decide qué avisos tocan a cada usuario y los envía una sola vez al día.
import type { Env } from './index';
import { pushToUser } from './push';
import { jstDate, jstMinutes, taskStatus, trashOn, type TrashRule } from '../shared/time';

interface UserRow {
  id: string;
  lang: 'es' | 'ja';
  notify_minute: number;
  notify_late: number;
  notify_trash: number;
}

interface TaskRow {
  id: number;
  name: string;
  every_days: number;
  flex_days: number;
  est_minutes: number | null;
  assignee_id: string | null;
  anchor_at: string;
}

const LATE_MINUTE = 19 * 60; // aviso extra de lo muy atrasado
const TRASH_MINUTE = 21 * 60; // aviso de basura la noche antes
const LATE_THRESHOLD = 3; // días de retraso para el aviso extra
const WINDOW = 60; // si el cron se retrasa, aún se envía dentro de esta ventana

const msg = {
  es: {
    daily: (names: string) => `Hoy toca: ${names}`,
    dailyBody: (late: number, mins: number) =>
      [late ? `${late} atrasada${late > 1 ? 's' : ''}` : '', mins ? `~${mins} min en total` : '']
        .filter(Boolean)
        .join(' · ') || 'Ábrela para ver la lista',
    late: (names: string) => `Se está acumulando: ${names}`,
    lateBody: 'Lleva varios días de retraso',
    trash: (kinds: string) => `Mañana: ${kinds}`,
    trashBody: 'Sácala esta noche o antes de las 8:00',
    sep: ', ',
  },
  ja: {
    daily: (names: string) => `今日の掃除：${names}`,
    dailyBody: (late: number, mins: number) =>
      [late ? `${late}件遅れ` : '', mins ? `合計 約${mins}分` : ''].filter(Boolean).join('・') ||
      'アプリで確認してください',
    late: (names: string) => `溜まっています：${names}`,
    lateBody: '数日遅れています',
    trash: (kinds: string) => `明日は${kinds}の日`,
    trashBody: '今夜か朝8時までに出してください',
    sep: '、',
  },
};

/** Inserta en el log antes de enviar: si ya existía, no se envía. Al menos una vez no, como mucho una vez sí. */
async function claim(env: Env, userId: string, kind: string, day: string): Promise<boolean> {
  const r = await env.DB.prepare('INSERT OR IGNORE INTO notification_log (user_id, kind, day) VALUES (?, ?, ?)')
    .bind(userId, kind, day)
    .run();
  return r.meta.changes > 0;
}

const inWindow = (now: number, at: number) => now >= at && now - at < WINDOW;

export async function runCron(env: Env) {
  const now = new Date();
  const day = jstDate(now);
  const minute = jstMinutes(now);

  const [paused, users, tasks, rules] = await env.DB.batch([
    env.DB.prepare("SELECT value FROM settings WHERE key = 'paused_since'"),
    env.DB.prepare('SELECT id, lang, notify_minute, notify_late, notify_trash FROM users'),
    env.DB.prepare(
      'SELECT id, name, every_days, flex_days, est_minutes, assignee_id, anchor_at FROM tasks WHERE archived = 0',
    ),
    env.DB.prepare('SELECT name, weekdays, weeks FROM trash_rules'),
  ]);
  if (paused.results.length) return; // modo viaje: silencio total

  const allTasks = (tasks.results as unknown as TaskRow[]).map((t) => ({ ...t, ...taskStatus(t, now) }));
  const trashTomorrow = trashOn(rules.results as unknown as TrashRule[], now, 1);

  for (const u of users.results as unknown as UserRow[]) {
    const m = msg[u.lang] ?? msg.es;
    const mine = allTasks.filter((t) => t.assignee_id === null || t.assignee_id === u.id);

    if (inWindow(minute, u.notify_minute)) {
      const pending = mine
        .filter((t) => t.status !== 'ok')
        .sort((a, b) => b.since / b.every_days - a.since / a.every_days);
      // Sin nada pendiente no se avisa: silencioso por defecto.
      if (pending.length && (await claim(env, u.id, 'daily', day))) {
        const mins = pending.reduce((n, t) => n + (t.est_minutes ?? 0), 0);
        const late = pending.filter((t) => t.status === 'late').length;
        await pushToUser(env, u.id, {
          title: m.daily(pending.slice(0, 3).map((t) => t.name).join(m.sep) + (pending.length > 3 ? '…' : '')),
          body: m.dailyBody(late, mins),
          tag: 'daily',
          url: '/',
        });
      }
    }

    if (u.notify_late && inWindow(minute, LATE_MINUTE)) {
      const veryLate = mine.filter((t) => t.overdue >= LATE_THRESHOLD);
      if (veryLate.length && (await claim(env, u.id, 'late', day))) {
        await pushToUser(env, u.id, {
          title: m.late(veryLate.slice(0, 3).map((t) => t.name).join(m.sep)),
          body: m.lateBody,
          tag: 'late',
          url: '/',
        });
      }
    }

    if (u.notify_trash && trashTomorrow.length && inWindow(minute, TRASH_MINUTE)) {
      if (await claim(env, u.id, 'trash', day)) {
        await pushToUser(env, u.id, {
          title: m.trash(trashTomorrow.join(m.sep)),
          body: m.trashBody,
          tag: 'trash',
          url: '/',
        });
      }
    }
  }

  // Limpieza del log, una vez al día.
  if (minute < 30) {
    await env.DB.prepare("DELETE FROM notification_log WHERE day < date(?, '-30 days')").bind(day).run();
  }
}
