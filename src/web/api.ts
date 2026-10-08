// Cliente de la API. Tipos alineados con src/worker/api.ts.
import type { Status, TrashRule } from '../shared/time';
import type { Lang } from './i18n';

export interface Task {
  id: number;
  name: string;
  zone_id: number | null;
  every_days: number;
  flex_days: number;
  est_minutes: number | null;
  assignee_id: string | null;
  rotate: number;
  anchor_at: string;
  // calculado por taskStatus()
  since: number;
  left: number;
  overdue: number;
  status: Status;
  freshness: number;
}

export interface Me {
  id: string;
  name: string;
  lang: Lang;
  notify_minute: number;
  notify_late: number;
  notify_trash: number;
}

export interface AppState {
  now: string;
  me: Me;
  users: { id: string; name: string }[];
  zones: { id: number; name: string; sort: number }[];
  trashRules: (TrashRule & { id: number })[];
  trash: { today: string[]; tomorrow: string[] };
  pausedSince: string | null;
  tasks: Task[];
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export async function call<R = unknown>(method: string, path: string, body?: unknown): Promise<R> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status, (data as { error?: string }).error ?? String(res.status));
  return data as R;
}

export type TaskInput = {
  name: string;
  zone_id: number | null;
  every_days: number;
  flex_days: number;
  est_minutes: number | null;
  assignee_id: string | null;
  rotate: boolean;
  last_done_days_ago?: number;
};

export const api = {
  state: () => call<AppState>('GET', '/state'),
  createTask: (t: TaskInput) => call<Task>('POST', '/tasks', t),
  updateTask: (id: number, t: Partial<TaskInput>) => call<Task>('PATCH', `/tasks/${id}`, t),
  archiveTask: (id: number) => call('DELETE', `/tasks/${id}`),
  done: (id: number) => call<{ completionId: number }>('POST', `/tasks/${id}/done`),
  history: (id: number) => call<{ id: number; done_at: string; user_name: string | null }[]>('GET', `/tasks/${id}/history`),
  undo: (completionId: number) => call('POST', `/completions/${completionId}/undo`),
  createZone: (name: string) => call<{ id: number; name: string; sort: number }>('POST', '/zones', { name }),
  putTrash: (rules: TrashRule[]) => call('PUT', '/trash', { rules }),
  pause: (on: boolean) => call<{ pausedSince: string | null }>('POST', '/pause', { on }),
  updateMe: (m: Partial<Omit<Me, 'id'>>) => call<Me>('PATCH', '/me', m),
  testPush: () => call('POST', '/push/test'),
  logout: () => call('POST', '/auth/logout'),
};
