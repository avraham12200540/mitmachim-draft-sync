import Fastify from 'fastify';
import { config } from './config';
import { logger } from './utils/logger';
import { getDb, closeDb } from './db/db';
import { runMigrations } from './db/migrations';
import { registerCors } from './middleware/cors';
import { registerErrorHandler } from './middleware/errorHandler';
import { ipRateLimit } from './middleware/rateLimit';
import { healthRoutes } from './routes/health.routes';
import { authRoutes } from './routes/auth.routes';
import { devicesRoutes } from './routes/devices.routes';
import { draftsRoutes } from './routes/drafts.routes';
import { startCleanupJob } from './services/cleanup.service';

async function buildServer() {
  const app = Fastify({
    bodyLimit: config.maxBodyBytes,
    // Behind Nginx; trust only the configured proxy hop(s) so X-Forwarded-For
    // cannot be spoofed by a remote client to evade rate limiting.
    trustProxy: config.trustProxy,
    logger: false, // we use our own logger to avoid logging request bodies
  });

  // Tolerate an empty body even when Content-Type: application/json is set
  // (e.g. bodyless DELETE/logout from curl or strict HTTP clients).
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      const text = typeof body === 'string' ? body.trim() : '';
      if (text === '') {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(text));
      } catch {
        const err = new Error('Invalid JSON body') as Error & { statusCode?: number };
        err.statusCode = 400;
        done(err, undefined);
      }
    },
  );

  await registerCors(app);
  app.addHook('onRequest', ipRateLimit);
  registerErrorHandler(app);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(devicesRoutes);
  await app.register(draftsRoutes);

  return app;
}

async function main(): Promise<void> {
  // Open DB and apply migrations before accepting traffic.
  getDb();
  runMigrations();

  const app = await buildServer();
  const stopCleanup = startCleanupJob();

  await app.listen({ port: config.port, host: config.host });
  logger.info('Server listening', {
    host: config.host,
    port: config.port,
    env: config.nodeEnv,
    version: config.version,
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('Shutting down', { signal });
    stopCleanup();
    try {
      await app.close();
      closeDb();
    } catch (err) {
      logger.error('Error during shutdown', { error: (err as Error).message });
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: (err as Error).message, stack: (err as Error).stack });
  process.exit(1);
});
