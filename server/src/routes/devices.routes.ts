import type { FastifyInstance } from 'fastify';
import { listDevices } from '../services/devices.service';
import { authRequired } from '../middleware/authRequired';
import { userRateLimit } from '../middleware/rateLimit';

export async function devicesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/devices', { preHandler: [authRequired, userRateLimit] }, async (request) => {
    const { userId, deviceId } = request.auth!;
    return { devices: listDevices(userId, deviceId) };
  });
}
