import { getDb } from '../db/db';
import type { DeviceRow } from '../types';

export interface DeviceDTO {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  current: boolean;
}

/** Lists all devices for a user, flagging which one is the current session. */
export function listDevices(userId: string, currentDeviceId: string): DeviceDTO[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as DeviceRow[];

  return rows.map((r) => ({
    id: r.id,
    deviceName: r.device_name,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    revokedAt: r.revoked_at,
    current: r.id === currentDeviceId,
  }));
}
