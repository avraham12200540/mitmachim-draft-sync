import { getDb } from '../db/db';
import { newId } from '../utils/ids';
import { nowIso, isoDaysFromNow, isPast } from '../utils/time';
import { generateSyncKey, generateToken, hashSecret } from '../utils/crypto';
import { AppError } from '../utils/appError';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { AuthContext, TokenRow, UserRow } from '../types';

export interface CreatedSession {
  userId: string;
  deviceId: string;
  accessToken: string;
}

function createDeviceAndToken(userId: string, deviceName: string | null): CreatedSession {
  const db = getDb();
  const now = nowIso();
  const deviceId = newId();
  const tokenId = newId();
  const token = generateToken();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO devices (id, user_id, device_name, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(deviceId, userId, deviceName, now, now);

    db.prepare(
      `INSERT INTO tokens (id, user_id, device_id, token_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(tokenId, userId, deviceId, hashSecret(token), now, isoDaysFromNow(config.tokenTtlDays));
  });
  tx();

  return { userId, deviceId, accessToken: token };
}

/** Creates a brand-new user with a fresh Sync Key and an initial device session. */
export function createSyncKey(deviceName: string | null): {
  syncKey: string;
  accessToken: string;
  deviceId: string;
  userId: string;
} {
  const db = getDb();

  // Extremely unlikely, but guard against a Sync Key hash collision.
  let syncKey = generateSyncKey();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const exists = db
      .prepare('SELECT 1 FROM users WHERE sync_key_hash = ?')
      .get(hashSecret(syncKey));
    if (!exists) break;
    syncKey = generateSyncKey();
  }

  const userId = newId();
  db.prepare(
    `INSERT INTO users (id, sync_key_hash, created_at, last_login_at) VALUES (?, ?, ?, ?)`,
  ).run(userId, hashSecret(syncKey), nowIso(), nowIso());

  const session = createDeviceAndToken(userId, deviceName);
  logger.info('Sync key created', { userId, deviceId: session.deviceId });

  return { syncKey, accessToken: session.accessToken, deviceId: session.deviceId, userId };
}

/** Authenticates an existing Sync Key and registers a new device session. */
export function login(
  syncKey: string,
  deviceName: string | null,
): { accessToken: string; deviceId: string; userId: string } {
  const db = getDb();
  const user = db
    .prepare('SELECT * FROM users WHERE sync_key_hash = ?')
    .get(hashSecret(syncKey)) as UserRow | undefined;

  if (!user) {
    throw new AppError(401, 'INVALID_SYNC_KEY', 'קוד הסנכרון שגוי או אינו קיים');
  }

  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id);
  const session = createDeviceAndToken(user.id, deviceName);
  logger.info('Login', { userId: user.id, deviceId: session.deviceId });

  return { accessToken: session.accessToken, deviceId: session.deviceId, userId: user.id };
}

/** Revokes the current token and marks the current device as revoked. */
export function logout(auth: AuthContext): void {
  const db = getDb();
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare('UPDATE tokens SET revoked_at = ? WHERE id = ?').run(now, auth.tokenId);
    db.prepare('UPDATE devices SET revoked_at = ? WHERE id = ?').run(now, auth.deviceId);
  });
  tx();
  logger.info('Logout', { userId: auth.userId, deviceId: auth.deviceId });
}

/**
 * Validates a bearer token. Returns the auth context, or null if the token is
 * unknown, revoked, expired, or its device has been revoked. Also refreshes the
 * device's `last_seen_at`.
 */
export function authenticateToken(token: string): AuthContext | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM tokens WHERE token_hash = ?')
    .get(hashSecret(token)) as TokenRow | undefined;

  if (!row) return null;
  if (row.revoked_at) return null;
  if (isPast(row.expires_at)) return null;

  const device = db
    .prepare('SELECT revoked_at FROM devices WHERE id = ?')
    .get(row.device_id) as { revoked_at: string | null } | undefined;
  if (!device || device.revoked_at) return null;

  db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(nowIso(), row.device_id);

  return { userId: row.user_id, deviceId: row.device_id, tokenId: row.id };
}
