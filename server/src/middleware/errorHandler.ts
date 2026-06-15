import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../utils/appError';
import { config } from '../config';
import { logger } from '../utils/logger';

interface FastifyLikeError extends Error {
  statusCode?: number;
  code?: string;
}

/** Registers the global error handler and a JSON 404 handler. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((_request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send({ ok: false, error: 'NOT_FOUND', message: 'הנתיב לא קיים' });
  });

  app.setErrorHandler((error: FastifyLikeError, _request: FastifyRequest, reply: FastifyReply) => {
    // Zod validation errors -> 400 with a clean issue list.
    if (error instanceof ZodError) {
      reply.status(400).send({
        ok: false,
        error: 'VALIDATION',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }

    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        ok: false,
        error: error.code,
        message: error.expose ? error.message : 'אירעה שגיאה',
      });
      return;
    }

    // Fastify body-too-large and other client errors.
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || error.statusCode === 413) {
      reply
        .status(413)
        .send({ ok: false, error: 'PAYLOAD_TOO_LARGE', message: 'הבקשה גדולה מדי' });
      return;
    }
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      reply.status(error.statusCode).send({
        ok: false,
        error: error.code ?? 'BAD_REQUEST',
        message: config.isProd ? 'בקשה לא תקינה' : error.message,
      });
      return;
    }

    // Unexpected server error: log full detail, never leak it to the client.
    logger.error('Unhandled error', {
      message: error.message,
      code: error.code,
      ...(config.isProd ? {} : { stack: error.stack }),
    });
    reply
      .status(500)
      .send({ ok: false, error: 'INTERNAL', message: 'אירעה שגיאה בשרת' });
  });
}
