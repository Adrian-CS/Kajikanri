import { handleAuth, requireUser } from './auth'; // copiado de Nefuda
import { api } from './api';
import { runCron } from './cron';

export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  INVITE_CODE: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_JWK: string;
  VAPID_SUBJECT: string;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    // Solo /api/* llega aquí (run_worker_first); el resto lo sirven los assets.
    if (url.pathname.startsWith('/api/auth/')) {
      return (await handleAuth(req, env)) ?? Response.json({ error: 'not found' }, { status: 404 });
    }

    const user = await requireUser(req, env);
    if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

    try {
      return await api(req, env, user, url);
    } catch (e) {
      console.error(e);
      return Response.json({ error: 'internal' }, { status: 500 });
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runCron(env));
  },
} satisfies ExportedHandler<Env>;
