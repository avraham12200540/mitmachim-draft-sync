import type { FastifyInstance } from 'fastify';
import { config } from '../config';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    ok: true,
    version: config.version,
    time: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
  }));
}
