import type { FastifyReply, FastifyRequest } from 'fastify';
import { authenticateToken } from '../services/auth.service';
import { AppError } from '../utils/appError';

/**
 * Fastify preHandler that requires a valid `Authorization: Bearer <token>`.
 * On success it attaches `request.auth`; otherwise throws 401.
 */
export async function authRequired(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers['authorization'];
  if (!header || Array.isArray(header) || !header.startsWith('Bearer ')) {
    throw AppError.unauthorized();
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) throw AppError.unauthorized();

  const auth = authenticateToken(token);
  if (!auth) throw AppError.unauthorized('ההתחברות פגה או בוטלה, יש להתחבר מחדש');

  request.auth = auth;
}
