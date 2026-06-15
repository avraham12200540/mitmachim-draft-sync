import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { config } from '../config';

/**
 * Registers CORS. We reflect any `chrome-extension://` origin (the extension id
 * is random per install) plus any explicitly-configured web origins. Requests
 * with no Origin header (curl, health checks, same-origin) are allowed.
 */
export async function registerCors(app: FastifyInstance): Promise<void> {
  const extra = new Set(config.corsExtraOrigins);

  await app.register(cors, {
    origin(origin, cb) {
      if (!origin) {
        cb(null, true);
        return;
      }
      if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
        cb(null, true);
        return;
      }
      if (extra.has(origin)) {
        cb(null, true);
        return;
      }
      // Reject by not allowing the origin (no CORS headers added).
      cb(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 86400,
  });
}
