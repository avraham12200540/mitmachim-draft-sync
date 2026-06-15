import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config';
import { logger } from '../utils/logger';

let instance: Database.Database | null = null;

/**
 * Opens (once) the SQLite database, enabling WAL mode for better concurrency
 * and foreign key enforcement. Returns a shared singleton connection.
 */
export function getDb(): Database.Database {
  if (instance) return instance;

  const dir = path.dirname(config.dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  instance = db;
  logger.info('Database opened', { path: config.dbPath });
  return db;
}

/** Closes the database connection (used on graceful shutdown). */
export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
