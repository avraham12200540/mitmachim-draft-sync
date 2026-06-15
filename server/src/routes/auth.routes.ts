import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createSyncKey, login, logout } from '../services/auth.service';
import { authRequired } from '../middleware/authRequired';
import { userRateLimit } from '../middleware/rateLimit';

const deviceNameSchema = z.string().trim().max(80).optional();

const createSchema = z.object({ deviceName: deviceNameSchema }).strict();

const loginSchema = z
  .object({
    syncKey: z.string().trim().min(8).max(64),
    deviceName: deviceNameSchema,
  })
  .strict();

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/create-sync-key', async (request) => {
    const { deviceName } = createSchema.parse(request.body ?? {});
    return createSyncKey(deviceName ?? null);
  });

  app.post('/api/auth/login', async (request) => {
    const { syncKey, deviceName } = loginSchema.parse(request.body ?? {});
    return login(syncKey, deviceName ?? null);
  });

  app.post(
    '/api/auth/logout',
    { preHandler: [authRequired, userRateLimit] },
    async (request) => {
      logout(request.auth!);
      return { ok: true };
    },
  );
}
