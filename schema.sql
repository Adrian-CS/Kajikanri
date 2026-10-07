-- Limpieza · esquema D1 (v1)
-- Una casa por despliegue: todos los usuarios ven las mismas tareas.
-- Fechas en ISO UTC ('2026-10-07T08:00:00.000Z'); los días se calculan en JST en código.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,                 -- UUID generado por el Worker
  email         TEXT NOT NULL UNIQUE,             -- identificador de login (auth.ts), no se muestra
  name          TEXT NOT NULL,
  lang          TEXT NOT NULL DEFAULT 'es',       -- 'es' | 'ja' (se valida en código)
  notify_minute INTEGER NOT NULL DEFAULT 480,     -- hora del resumen, minutos desde 00:00 JST
  notify_late   INTEGER NOT NULL DEFAULT 1,       -- aviso extra de lo muy atrasado
  notify_trash  INTEGER NOT NULL DEFAULT 1,       -- aviso de basura la noche antes
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Passkeys. Mismas columnas que en Nefuda (auth.ts copiado de allí).
CREATE TABLE credentials (
  id            TEXT PRIMARY KEY,                 -- credential ID en base64url
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key    TEXT NOT NULL,                    -- base64url (TEXT, no BLOB: ver auth.ts)
  counter       INTEGER NOT NULL DEFAULT 0,
  transports    TEXT,                             -- JSON: ["internal","hybrid"]
  device_name   TEXT,                             -- para poder revocar un dispositivo
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at  TEXT
);
CREATE INDEX credentials_user ON credentials(user_id);

-- Zonas: texto libre del usuario, no se traduce (igual que los nombres de tareas).
CREATE TABLE zones (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  sort  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tasks (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  zone_id      INTEGER REFERENCES zones(id) ON DELETE SET NULL,
  every_days   INTEGER NOT NULL,                  -- frecuencia
  flex_days    INTEGER NOT NULL DEFAULT 0,        -- margen antes de contar como atrasada
  est_minutes  INTEGER,                           -- para «Tengo 15 minutos»
  assignee_id  TEXT REFERENCES users(id) ON DELETE SET NULL,  -- NULL = cualquiera
  rotate       INTEGER NOT NULL DEFAULT 0,        -- 1 = al hacerla pasa a la otra persona
  anchor_at    TEXT NOT NULL,                     -- desde cuándo se cuenta (última vez hecha o alta)
  archived     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Historial. prev_* guarda el estado anterior de la tarea para poder deshacer
-- sin recalcular nada a partir del historial.
CREATE TABLE completions (
  id                INTEGER PRIMARY KEY,
  task_id           INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
  done_at           TEXT NOT NULL,
  prev_anchor_at    TEXT NOT NULL,
  prev_assignee_id  TEXT
);
CREATE INDEX completions_task ON completions(task_id, done_at DESC);

-- Basura: calendario fijo. weekdays '1,4' (0 = domingo). weeks NULL = todas las semanas,
-- '2,4' = 第2・第4 del mes.
CREATE TABLE trash_rules (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  weekdays  TEXT NOT NULL,
  weeks     TEXT
);

-- Ajustes de la casa. De momento solo 'paused_since' (modo viaje).
CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE TABLE push_subscriptions (
  endpoint    TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Evita repetir un aviso el mismo día aunque el cron corra cada 30 min.
CREATE TABLE notification_log (
  user_id  TEXT NOT NULL,
  kind     TEXT NOT NULL,                         -- 'daily' | 'late' | 'trash'
  day      TEXT NOT NULL,                         -- 'YYYY-MM-DD' en JST
  PRIMARY KEY (user_id, kind, day)
);

INSERT INTO zones (name, sort) VALUES
  ('Baño', 1), ('Cocina', 2), ('Salón', 3), ('Dormitorio', 4), ('Entrada', 5);
