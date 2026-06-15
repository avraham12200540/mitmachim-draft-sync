-- ============================================================================
-- Mitmachim Draft Sync — SQLite schema (reference copy).
-- The authoritative, executed version lives in migrations.ts (MIGRATION_1).
-- Keep the two in sync. All timestamps are ISO-8601 UTC strings.
-- ============================================================================

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
  category_name      TEXT,
  topic_type         TEXT,
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_devices_user        ON devices (user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_user         ON tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_drafts_user         ON drafts (user_id);
CREATE INDEX IF NOT EXISTS idx_drafts_user_key     ON drafts (user_id, local_draft_key);
CREATE INDEX IF NOT EXISTS idx_drafts_user_topic   ON drafts (user_id, type, topic_id);
CREATE INDEX IF NOT EXISTS idx_drafts_user_post    ON drafts (user_id, type, post_id);
CREATE INDEX IF NOT EXISTS idx_drafts_updated      ON drafts (server_updated_at);
CREATE INDEX IF NOT EXISTS idx_sync_events_user    ON sync_events (user_id, created_at);
