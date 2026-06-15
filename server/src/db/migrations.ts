import type Database from 'better-sqlite3';
import { getDb } from './db';
import { logger } from '../utils/logger';

interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Migration #1 — full initial schema. This is the authoritative, executed
 * schema; `schema.sql` is a human-readable reference kept in sync with it.
 */
const MIGRATION_1 = `
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  sync_key_hash  TEXT NOT NULL UNIQUE,
  created_at     TEXT NOT NULL,
  last_login_at  TEXT
);

CREATE TABLE IF NOT EXISTS devices (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  device_name  TEXT,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at   TEXT,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT,
  revoked_at  TEXT,
  FOREIGN KEY (user_id)   REFERENCES users (id)   ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS drafts (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL,
  type               TEXT NOT NULL,
  local_draft_key    TEXT NOT NULL,
  encrypted_title    TEXT,
  encrypted_content  TEXT NOT NULL,
  encryption_iv      TEXT,
  encryption_salt    TEXT,
  category_id        TEXT,
  topic_id           TEXT,
  post_id            TEXT,
  url                TEXT,
  device_id          TEXT,
  client_updated_at  TEXT,
  server_updated_at  TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  deleted_at         TEXT,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_events (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  draft_id      TEXT,
  device_id     TEXT,
  action        TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_devices_user        ON devices (user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_user         ON tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_drafts_user         ON drafts (user_id);
CREATE INDEX IF NOT EXISTS idx_drafts_user_key     ON drafts (user_id, local_draft_key);
CREATE INDEX IF NOT EXISTS idx_drafts_user_topic   ON drafts (user_id, type, topic_id);
CREATE INDEX IF NOT EXISTS idx_drafts_user_post    ON drafts (user_id, type, post_id);
CREATE INDEX IF NOT EXISTS idx_drafts_updated      ON drafts (server_updated_at);
CREATE INDEX IF NOT EXISTS idx_sync_events_user    ON sync_events (user_id, created_at);
`;

const MIGRATIONS: Migration[] = [{ version: 1, name: 'initial_schema', sql: MIGRATION_1 }];

/**
 * Applies any migrations not yet recorded in `_migrations`. Idempotent and safe
 * to run on every server start.
 */
export function runMigrations(db: Database.Database = getDb()): number {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
       version    INTEGER PRIMARY KEY,
       name       TEXT NOT NULL,
       applied_at TEXT NOT NULL
     );`,
  );

  const appliedRows = db.prepare('SELECT version FROM _migrations').all() as { version: number }[];
  const applied = new Set(appliedRows.map((r) => r.version));

  let count = 0;
  const record = db.prepare(
    'INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)',
  );

  for (const migration of MIGRATIONS.sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue;
    const tx = db.transaction(() => {
      db.exec(migration.sql);
      record.run(migration.version, migration.name, new Date().toISOString());
    });
    tx();
    count += 1;
    logger.info('Applied migration', { version: migration.version, name: migration.name });
  }

  if (count === 0) logger.debug('No migrations to apply');
  return count;
}
