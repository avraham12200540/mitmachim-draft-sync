import { getDb } from '../db/db';
import { newId } from '../utils/ids';
import { nowIso } from '../utils/time';
import { AppError } from '../utils/appError';
import { logger } from '../utils/logger';
import type { DraftDTO, DraftRow, DraftType } from '../types';

type DraftRowWithDevice = DraftRow & { device_name: string | null };

/** Fields a client may send to create or update a draft (already validated). */
export interface DraftUpsertInput {
  type: DraftType;
  localDraftKey: string;
  encryptedContent: string;
  encryptedTitle?: string | null;
  encryptionIv?: string | null;
  encryptionSalt?: string | null;
  categoryId?: string | null;
  topicId?: string | null;
  postId?: string | null;
  url?: string | null;
  clientUpdatedAt?: string;
  expectedServerUpdatedAt?: string | null;
}

export interface MatchParams {
  type: DraftType;
  localDraftKey: string;
  topicId?: string | null;
  postId?: string | null;
  categoryId?: string | null;
}

const SELECT_WITH_DEVICE = `
  SELECT d.*, dev.device_name AS device_name
  FROM drafts d
  LEFT JOIN devices dev ON d.device_id = dev.id
`;

function toDTO(row: DraftRowWithDevice): DraftDTO {
  return {
    id: row.id,
    type: row.type,
    localDraftKey: row.local_draft_key,
    encryptedTitle: row.encrypted_title,
    encryptedContent: row.encrypted_content,
    encryptionIv: row.encryption_iv,
    encryptionSalt: row.encryption_salt,
    categoryId: row.category_id,
    topicId: row.topic_id,
    postId: row.post_id,
    url: row.url,
    deviceId: row.device_id,
    deviceName: row.device_name,
    clientUpdatedAt: row.client_updated_at,
    serverUpdatedAt: row.server_updated_at,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function recordEvent(
  userId: string,
  draftId: string | null,
  deviceId: string | null,
  action: string,
): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO sync_events (id, user_id, draft_id, device_id, action, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(newId(), userId, draftId, deviceId, action, nowIso());
  } catch {
    // sync_events is best-effort telemetry; never fail a request because of it.
  }
}

export function listDrafts(
  userId: string,
  opts: { since?: string | null; includeDeleted?: boolean } = {},
): DraftDTO[] {
  const db = getDb();
  const clauses = ['d.user_id = ?'];
  const params: unknown[] = [userId];

  if (!opts.includeDeleted) clauses.push('d.deleted_at IS NULL');
  if (opts.since) {
    clauses.push('d.server_updated_at > ?');
    params.push(opts.since);
  }

  const rows = db
    .prepare(`${SELECT_WITH_DEVICE} WHERE ${clauses.join(' AND ')} ORDER BY d.server_updated_at DESC`)
    .all(...params) as DraftRowWithDevice[];

  return rows.map(toDTO);
}

export function getDraft(userId: string, id: string): DraftDTO | null {
  const row = getDb()
    .prepare(`${SELECT_WITH_DEVICE} WHERE d.id = ? AND d.user_id = ?`)
    .get(id, userId) as DraftRowWithDevice | undefined;
  return row ? toDTO(row) : null;
}

function findByKey(userId: string, localDraftKey: string): DraftRowWithDevice | undefined {
  return getDb()
    .prepare(
      `${SELECT_WITH_DEVICE}
       WHERE d.user_id = ? AND d.local_draft_key = ? AND d.deleted_at IS NULL
       ORDER BY d.server_updated_at DESC LIMIT 1`,
    )
    .get(userId, localDraftKey) as DraftRowWithDevice | undefined;
}

/**
 * Finds the best matching draft for a composer context. Preference order:
 * postId (edit) → topicId (reply) → localDraftKey → categoryId+type (new topic).
 */
export function matchDraft(userId: string, p: MatchParams): DraftDTO | null {
  const db = getDb();

  const tryQuery = (where: string, args: unknown[]): DraftRowWithDevice | undefined =>
    db
      .prepare(
        `${SELECT_WITH_DEVICE} WHERE d.user_id = ? AND d.deleted_at IS NULL AND ${where}
         ORDER BY d.server_updated_at DESC LIMIT 1`,
      )
      .get(userId, ...args) as DraftRowWithDevice | undefined;

  let row: DraftRowWithDevice | undefined;

  if (p.type === 'edit' && p.postId) {
    row = tryQuery("d.type = 'edit' AND d.post_id = ?", [p.postId]);
  }
  if (!row && p.type === 'reply' && p.topicId) {
    row = tryQuery("d.type = 'reply' AND d.topic_id = ?", [p.topicId]);
  }
  if (!row) {
    row = findByKey(userId, p.localDraftKey);
  }
  if (!row && p.type === 'topic' && p.categoryId) {
    row = tryQuery("d.type = 'topic' AND d.category_id = ?", [p.categoryId]);
  }

  return row ? toDTO(row) : null;
}

interface UpsertResult {
  ok: boolean;
  code?: 'CONFLICT';
  draft?: DraftDTO;
  serverDraft?: DraftDTO;
}

/** Creates or updates (by localDraftKey) a draft, with basic conflict detection. */
export function upsertDraft(
  userId: string,
  deviceId: string | null,
  input: DraftUpsertInput,
): UpsertResult {
  const db = getDb();
  const now = nowIso();
  const clientUpdatedAt = input.clientUpdatedAt ?? now;
  const existing = findByKey(userId, input.localDraftKey);

  if (existing) {
    // Conflict: the client based its edit on an older server version, AND the
    // server's copy was edited more recently by another device.
    if (
      input.expectedServerUpdatedAt &&
      input.expectedServerUpdatedAt !== existing.server_updated_at
    ) {
      const serverNewer =
        (existing.client_updated_at ?? existing.server_updated_at) > clientUpdatedAt;
      if (serverNewer) {
        return { ok: false, code: 'CONFLICT', serverDraft: toDTO(existing) };
      }
    }

    db.prepare(
      `UPDATE drafts SET
         type = ?, encrypted_title = ?, encrypted_content = ?, encryption_iv = ?,
         encryption_salt = ?, category_id = ?, topic_id = ?, post_id = ?, url = ?,
         device_id = ?, client_updated_at = ?, server_updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).run(
      input.type,
      input.encryptedTitle ?? null,
      input.encryptedContent,
      input.encryptionIv ?? null,
      input.encryptionSalt ?? null,
      input.categoryId ?? null,
      input.topicId ?? null,
      input.postId ?? null,
      input.url ?? null,
      deviceId,
      clientUpdatedAt,
      now,
      existing.id,
      userId,
    );
    recordEvent(userId, existing.id, deviceId, 'update');
    return { ok: true, draft: getDraft(userId, existing.id)! };
  }

  const id = newId();
  db.prepare(
    `INSERT INTO drafts (
       id, user_id, type, local_draft_key, encrypted_title, encrypted_content,
       encryption_iv, encryption_salt, category_id, topic_id, post_id, url,
       device_id, client_updated_at, server_updated_at, created_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  ).run(
    id,
    userId,
    input.type,
    input.localDraftKey,
    input.encryptedTitle ?? null,
    input.encryptedContent,
    input.encryptionIv ?? null,
    input.encryptionSalt ?? null,
    input.categoryId ?? null,
    input.topicId ?? null,
    input.postId ?? null,
    input.url ?? null,
    deviceId,
    clientUpdatedAt,
    now,
    now,
  );
  recordEvent(userId, id, deviceId, 'create');
  logger.debug('Draft created', { userId, draftId: id, type: input.type });
  return { ok: true, draft: getDraft(userId, id)! };
}

/** Partial update of an existing draft by id. */
export function patchDraft(
  userId: string,
  id: string,
  deviceId: string | null,
  patch: Partial<DraftUpsertInput>,
): DraftDTO {
  const existing = getDb()
    .prepare('SELECT * FROM drafts WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
    .get(id, userId) as DraftRow | undefined;
  if (!existing) throw AppError.notFound('הטיוטה לא נמצאה');

  const merged = {
    type: patch.type ?? existing.type,
    encrypted_title:
      patch.encryptedTitle !== undefined ? patch.encryptedTitle : existing.encrypted_title,
    encrypted_content: patch.encryptedContent ?? existing.encrypted_content,
    encryption_iv: patch.encryptionIv !== undefined ? patch.encryptionIv : existing.encryption_iv,
    encryption_salt:
      patch.encryptionSalt !== undefined ? patch.encryptionSalt : existing.encryption_salt,
    category_id: patch.categoryId !== undefined ? patch.categoryId : existing.category_id,
    topic_id: patch.topicId !== undefined ? patch.topicId : existing.topic_id,
    post_id: patch.postId !== undefined ? patch.postId : existing.post_id,
    url: patch.url !== undefined ? patch.url : existing.url,
    client_updated_at: patch.clientUpdatedAt ?? nowIso(),
  };

  getDb()
    .prepare(
      `UPDATE drafts SET
         type = ?, encrypted_title = ?, encrypted_content = ?, encryption_iv = ?,
         encryption_salt = ?, category_id = ?, topic_id = ?, post_id = ?, url = ?,
         device_id = ?, client_updated_at = ?, server_updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .run(
      merged.type,
      merged.encrypted_title,
      merged.encrypted_content,
      merged.encryption_iv,
      merged.encryption_salt,
      merged.category_id,
      merged.topic_id,
      merged.post_id,
      merged.url,
      deviceId,
      merged.client_updated_at,
      nowIso(),
      id,
      userId,
    );
  recordEvent(userId, id, deviceId, 'patch');
  return getDraft(userId, id)!;
}

/** Soft-deletes (default) or hard-deletes a draft. Returns true if a row matched. */
export function deleteDraft(
  userId: string,
  id: string,
  hard: boolean,
  deviceId: string | null,
): boolean {
  const db = getDb();
  if (hard) {
    const info = db.prepare('DELETE FROM drafts WHERE id = ? AND user_id = ?').run(id, userId);
    recordEvent(userId, id, deviceId, 'hard_delete');
    return info.changes > 0;
  }
  const info = db
    .prepare(
      'UPDATE drafts SET deleted_at = ?, server_updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    )
    .run(nowIso(), nowIso(), id, userId);
  recordEvent(userId, id, deviceId, 'soft_delete');
  return info.changes > 0;
}

export interface SyncPendingResult {
  localDraftKey: string;
  ok: boolean;
  code?: 'CONFLICT';
  draft?: DraftDTO;
  serverDraft?: DraftDTO;
}

/** Batch upsert for offline queue flush. */
export function syncPending(
  userId: string,
  deviceId: string | null,
  items: DraftUpsertInput[],
): SyncPendingResult[] {
  return items.map((item) => {
    const res = upsertDraft(userId, deviceId, item);
    return {
      localDraftKey: item.localDraftKey,
      ok: res.ok,
      code: res.code,
      draft: res.draft,
      serverDraft: res.serverDraft,
    };
  });
}
