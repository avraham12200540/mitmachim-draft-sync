import { getDb } from '../db/db';
import { config } from '../config';
import { isoDaysFromNow, nowIso } from '../utils/time';
import { logger } from '../utils/logger';

/** Permanently removes soft-deleted drafts past the retention window. */
export function purgeOldDeleted(): number {
  const cutoff = isoDaysFromNow(-config.purgeDeletedAfterDays);
  const info = getDb()
    .prepare('DELETE FROM drafts WHERE deleted_at IS NOT NULL AND deleted_at < ?')
    .run(cutoff);
  return info.changes;
}

/** Removes tokens that are revoked or have expired (housekeeping). */
export function purgeDeadTokens(): number {
  const now = nowIso();
  const info = getDb()
    .prepare('DELETE FROM tokens WHERE revoked_at IS NOT NULL OR (expires_at IS NOT NULL AND expires_at < ?)')
    .run(now);
  return info.changes;
}

/**
 * Removes revoked device rows that have no remaining tokens, so the device list
 * does not accumulate stale logged-out sessions over time. Runs after token
 * purge so freshly-orphaned devices are caught.
 */
export function purgeOrphanDevices(): number {
  const info = getDb()
    .prepare(
      `DELETE FROM devices
       WHERE revoked_at IS NOT NULL
         AND id NOT IN (SELECT device_id FROM tokens)`,
    )
    .run();
  return info.changes;
}

function runOnce(): void {
  try {
    const drafts = purgeOldDeleted();
    const tokens = purgeDeadTokens();
    const devices = purgeOrphanDevices();
    if (drafts || tokens || devices)
      logger.info('Cleanup ran', {
        purgedDrafts: drafts,
        purgedTokens: tokens,
        purgedDevices: devices,
      });
  } catch (err) {
    logger.error('Cleanup failed', { error: (err as Error).message });
  }
}

/**
 * Starts the periodic cleanup job (every 6 hours) and runs it once on startup.
 * Returns a stop function for graceful shutdown.
 */
export function startCleanupJob(): () => void {
  runOnce();
  const timer = setInterval(runOnce, 6 * 60 * 60 * 1000);
  timer.unref?.();
  return () => clearInterval(timer);
}
