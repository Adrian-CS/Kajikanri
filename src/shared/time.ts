// Lógica compartida entre el Worker (cron, API) y la PWA.
// Japón no tiene horario de verano: JST es siempre UTC+9, así que basta con un desplazamiento fijo.

export const DAY = 86_400_000;
const JST = 9 * 3_600_000;

/** Número de día en JST (días desde epoch). Comparar dos de estos da días naturales de diferencia. */
export const jstDay = (d: string | Date) => Math.floor((new Date(d).getTime() + JST) / DAY);

/** 'YYYY-MM-DD' en JST. */
export const jstDate = (d: Date = new Date()) => new Date(d.getTime() + JST).toISOString().slice(0, 10);

/** Minutos desde las 00:00 JST. */
export const jstMinutes = (d: Date = new Date()) => {
  const j = new Date(d.getTime() + JST);
  return j.getUTCHours() * 60 + j.getUTCMinutes();
};

export type Status = 'late' | 'due' | 'ok';

export interface TaskTiming {
  anchor_at: string;
  every_days: number;
  flex_days: number;
}

/**
 * late: ha pasado la frecuencia más el margen.
 * due:  toca hoy o mañana, o está dentro del margen.
 * ok:   al día.
 */
export function taskStatus(t: TaskTiming, now: Date = new Date()) {
  const since = jstDay(now) - jstDay(t.anchor_at);
  const left = t.every_days - since;
  const status: Status =
    since > t.every_days + t.flex_days ? 'late' : left <= 1 ? 'due' : 'ok';
  const overdue = Math.max(0, since - t.every_days - t.flex_days);
  return { since, left, overdue, status, freshness: Math.max(0, 1 - since / t.every_days) };
}

export interface TrashRule {
  name: string;
  weekdays: string;
  weeks: string | null;
}

/** Tipos de basura que se recogen el día actual + offsetDays (en JST). */
export function trashOn(rules: TrashRule[], now: Date, offsetDays = 0): string[] {
  const d = new Date(now.getTime() + JST + offsetDays * DAY); // getters UTC = hora JST
  const wd = d.getUTCDay();
  const nth = Math.ceil(d.getUTCDate() / 7);
  const nums = (s: string) => s.split(',').map((x) => Number(x.trim()));
  return rules
    .filter((r) => nums(r.weekdays).includes(wd) && (!r.weeks || nums(r.weeks).includes(nth)))
    .map((r) => r.name);
}
