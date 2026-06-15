import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authRequired } from '../middleware/authRequired';
import { userRateLimit } from '../middleware/rateLimit';
import { AppError } from '../utils/appError';
import {
  deleteDraft,
  getDraft,
  listDrafts,
  matchDraft,
  patchDraft,
  syncPending,
  upsertDraft,
  type DraftUpsertInput,
} from '../services/drafts.service';

const MAX_CONTENT = 100 * 1024; // 100KB
const MAX_TITLE = 20 * 1024; // 20KB

const draftType = z.enum(['topic', 'reply', 'edit']);

const upsertSchema = z
  .object({
    type: draftType,
    localDraftKey: z.string().trim().min(1).max(512),
    encryptedContent: z.string().min(1).max(MAX_CONTENT),
    encryptedTitle: z.string().max(MAX_TITLE).nullish(),
    encryptionIv: z.string().max(512).nullish(),
    encryptionSalt: z.string().max(512).nullish(),
    categoryId: z.string().max(128).nullish(),
    topicId: z.string().max(128).nullish(),
    postId: z.string().max(128).nullish(),
    url: z.string().max(2000).nullish(),
    clientUpdatedAt: z.string().datetime().optional(),
    expectedServerUpdatedAt: z.string().datetime().nullish(),
  })
  .strict();

const patchSchema = z
  .object({
    type: draftType.optional(),
    encryptedContent: z.string().min(1).max(MAX_CONTENT).optional(),
    encryptedTitle: z.string().max(MAX_TITLE).nullish(),
    encryptionIv: z.string().max(512).nullish(),
    encryptionSalt: z.string().max(512).nullish(),
    categoryId: z.string().max(128).nullish(),
    topicId: z.string().max(128).nullish(),
    postId: z.string().max(128).nullish(),
    url: z.string().max(2000).nullish(),
    clientUpdatedAt: z.string().datetime().optional(),
  })
  .strict();

const listQuery = z
  .object({
    since: z.string().datetime().optional(),
    includeDeleted: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
  })
  .strip();

const matchQuery = z
  .object({
    type: draftType,
    localDraftKey: z.string().min(1).max(512),
    topicId: z.string().max(128).optional(),
    postId: z.string().max(128).optional(),
    categoryId: z.string().max(128).optional(),
  })
  .strip();

const deleteQuery = z
  .object({ hard: z.enum(['true', 'false']).optional().transform((v) => v === 'true') })
  .strip();

const pendingSchema = z
  .object({ items: z.array(upsertSchema).max(50) })
  .strict();

export async function draftsRoutes(app: FastifyInstance): Promise<void> {
  // All draft routes require auth + per-user rate limiting.
  app.addHook('preHandler', authRequired);
  app.addHook('preHandler', userRateLimit);

  app.get('/api/drafts', async (request) => {
    const { since, includeDeleted } = listQuery.parse(request.query);
    return { drafts: listDrafts(request.auth!.userId, { since, includeDeleted }) };
  });

  app.get('/api/drafts/match', async (request) => {
    const q = matchQuery.parse(request.query);
    return { draft: matchDraft(request.auth!.userId, q) };
  });

  app.get('/api/drafts/:id', async (request) => {
    const { id } = request.params as { id: string };
    const draft = getDraft(request.auth!.userId, id);
    if (!draft) throw AppError.notFound('הטיוטה לא נמצאה');
    return { draft };
  });

  app.post('/api/drafts', async (request, reply) => {
    const input = upsertSchema.parse(request.body) as DraftUpsertInput;
    const res = upsertDraft(request.auth!.userId, request.auth!.deviceId, input);
    if (!res.ok) {
      reply.status(409);
      return { ok: false, code: res.code, serverDraft: res.serverDraft };
    }
    return { ok: true, draft: res.draft };
  });

  app.patch('/api/drafts/:id', async (request) => {
    const { id } = request.params as { id: string };
    const patch = patchSchema.parse(request.body);
    const draft = patchDraft(request.auth!.userId, id, request.auth!.deviceId, patch);
    return { ok: true, draft };
  });

  app.delete('/api/drafts/:id', async (request) => {
    const { id } = request.params as { id: string };
    const { hard } = deleteQuery.parse(request.query);
    const removed = deleteDraft(request.auth!.userId, id, hard, request.auth!.deviceId);
    if (!removed) throw AppError.notFound('הטיוטה לא נמצאה');
    return { ok: true };
  });

  app.post('/api/sync/pending', async (request) => {
    const { items } = pendingSchema.parse(request.body);
    return { results: syncPending(request.auth!.userId, request.auth!.deviceId, items) };
  });
}
