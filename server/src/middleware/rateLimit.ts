import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';
import { AppError } from '../utils/appError';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodically drop expired buckets so the map does not grow unbounded.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}, config.rateLimit.windowMs);
sweep.unref?.();

function allow(key: string, max: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + config.rateLimit.windowMs });
    return true;
  }
  existing.count += 1;
  return existing.count <= max;
}

function tooMany(): never {
  throw new AppError(429, 'RATE_LIMITED', 'יותר מדי בקשות, נסו שוב בעוד רגע');
}

/** onRequest hook: limits by client IP across all endpoints. */
export async function ipRateLimit(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!allow(`ip:${request.ip}`, config.rateLimit.maxPerIp)) tooMany();
}

/** preHandler hook (after auth): limits by authenticated user id. */
export async function userRateLimit(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const userId = request.auth?.userId;
  if (!userId) return;
  if (!allow(`user:${userId}`, config.rateLimit.maxPerUser)) tooMany();
}
