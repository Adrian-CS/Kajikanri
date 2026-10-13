import { describe, expect, it } from 'vitest';
import { jstDate, jstDay, jstMinutes, taskStatus, trashOn } from '../src/shared/time';

// Las horas se escriben en UTC; JST = UTC+9.
const at = (iso: string) => new Date(iso);

describe('jstDay / jstDate / jstMinutes', () => {
  it('cambia de día a medianoche JST (15:00 UTC), no a medianoche UTC', () => {
    expect(jstDay('2026-10-08T14:59:00Z')).toBe(jstDay('2026-10-08T00:00:00Z'));
    expect(jstDay('2026-10-08T15:00:00Z')).toBe(jstDay('2026-10-08T00:00:00Z') + 1);
    expect(jstDate(at('2026-10-08T15:00:00Z'))).toBe('2026-10-09');
  });
  it('minutos desde las 00:00 JST', () => {
    expect(jstMinutes(at('2026-10-08T23:00:00Z'))).toBe(8 * 60); // 08:00 JST
    expect(jstMinutes(at('2026-10-08T15:00:00Z'))).toBe(0);
  });
});

describe('taskStatus', () => {
  const now = at('2026-10-08T03:00:00Z'); // 12:00 JST
  const task = (daysAgo: number, every = 7, flex = 2) => ({
    anchor_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
    every_days: every,
    flex_days: flex,
  });

  it('ok mientras faltan 2 días o más', () => {
    expect(taskStatus(task(0), now).status).toBe('ok');
    expect(taskStatus(task(5), now)).toMatchObject({ status: 'ok', left: 2, since: 5 });
  });
  it('due cuando toca mañana u hoy', () => {
    expect(taskStatus(task(6), now)).toMatchObject({ status: 'due', left: 1 });
    expect(taskStatus(task(7), now)).toMatchObject({ status: 'due', left: 0 });
  });
  it('due dentro del margen flexible, late al pasarlo', () => {
    expect(taskStatus(task(9), now)).toMatchObject({ status: 'due', overdue: 0 });
    expect(taskStatus(task(10), now)).toMatchObject({ status: 'late', overdue: 1 });
  });
  it('sin margen, late justo al pasar la frecuencia', () => {
    expect(taskStatus(task(7, 7, 0), now).status).toBe('due');
    expect(taskStatus(task(8, 7, 0), now)).toMatchObject({ status: 'late', overdue: 1 });
  });
  it('cuenta días naturales en JST, no periodos de 24 h', () => {
    // Hecha a las 23:30 JST, ahora son las 00:30 JST del día siguiente: ya es "hace 1 día".
    const t = { anchor_at: '2026-10-07T14:30:00Z', every_days: 1, flex_days: 0 };
    expect(taskStatus(t, at('2026-10-07T15:30:00Z')).since).toBe(1);
  });
  it('freshness va de 1 a 0 y no baja de 0', () => {
    expect(taskStatus(task(0), now).freshness).toBe(1);
    expect(taskStatus(task(30), now).freshness).toBe(0);
  });
});

describe('trashOn', () => {
  const rules = [
    { name: 'Combustible', weekdays: '1,4', weeks: null },
    { name: 'No combustible', weekdays: '3', weeks: '2,4' },
  ];
  // Octubre 2026: el 1 es jueves.
  it('días de la semana fijos', () => {
    expect(trashOn(rules, at('2026-10-05T03:00:00Z'))).toEqual(['Combustible']); // lunes 5
    expect(trashOn(rules, at('2026-10-06T03:00:00Z'))).toEqual([]); // martes 6
  });
  it('semana del mes: 第2・第4 miércoles', () => {
    expect(trashOn(rules, at('2026-10-07T03:00:00Z'))).toEqual([]); // 1.er miércoles
    expect(trashOn(rules, at('2026-10-14T03:00:00Z'))).toEqual(['No combustible']); // 2.º
    expect(trashOn(rules, at('2026-10-21T03:00:00Z'))).toEqual([]); // 3.º
    expect(trashOn(rules, at('2026-10-28T03:00:00Z'))).toEqual(['No combustible']); // 4.º
  });
  it('mañana se calcula en JST', () => {
    // Domingo 4 a las 22:00 JST (13:00 UTC): mañana es lunes 5.
    expect(trashOn(rules, at('2026-10-04T13:00:00Z'), 1)).toEqual(['Combustible']);
    // Domingo 4 a las 23:30 UTC ya es lunes 5 en JST: mañana es martes.
    expect(trashOn(rules, at('2026-10-04T23:30:00Z'), 1)).toEqual([]);
  });
});
