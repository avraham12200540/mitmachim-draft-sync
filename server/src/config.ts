import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

// Load .env from the server directory first, then the repo root as a fallback.
loadDotenv();
loadDotenv({ path: path.resolve(process.cwd(), '..', '.env') });

function str(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Environment variable ${name} must be an integer`);
  return n;
}

/** Parses the trustProxy setting: boolean, hop-count number, or preset/CIDR string. */
function trustProxy(name: string, fallback: string): boolean | number | string {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return Number.parseInt(v, 10);
  return v;
}

function list(name: string): string[] {
  const v = process.env[name];
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const NODE_ENV = str('NODE_ENV', 'development');
const isProd = NODE_ENV === 'production';

// In production the pepper MUST be set explicitly; in dev we fall back to a
// clearly-marked insecure default so the server still boots for local testing.
const pepper = process.env.SYNC_KEY_PEPPER;
if (isProd && (!pepper || pepper === 'change-me-to-a-long-random-string')) {
  throw new Error('SYNC_KEY_PEPPER must be set to a strong random value in production.');
}

export const config = {
  nodeEnv: NODE_ENV,
  isProd,
  version: '1.0.0',
  port: int('PORT', 3001),
  host: str('HOST', '127.0.0.1'),
  dbPath: path.resolve(process.cwd(), str('DB_PATH', './data/draftsync.db')),
  syncKeyPepper: pepper || 'insecure-dev-pepper-do-not-use-in-production',
  tokenTtlDays: int('TOKEN_TTL_DAYS', 365),
  corsExtraOrigins: list('CORS_EXTRA_ORIGINS'),
  rateLimit: {
    windowMs: int('RATE_LIMIT_WINDOW_MS', 60_000),
    maxPerIp: int('RATE_LIMIT_MAX_PER_IP', 120),
    maxPerUser: int('RATE_LIMIT_MAX_PER_USER', 300),
  },
  // Which proxy hops to trust for the real client IP. Default 'loopback' trusts
  // only 127.0.0.1/::1 (Nginx on the same host), so a spoofed X-Forwarded-For
  // from a remote client cannot bypass per-IP rate limiting. See docs/SECURITY.md.
  trustProxy: trustProxy('TRUST_PROXY', 'loopback'),
  maxBodyBytes: int('MAX_BODY_BYTES', 1_572_864),
  purgeDeletedAfterDays: int('PURGE_DELETED_AFTER_DAYS', 30),
  logLevel: str('LOG_LEVEL', 'info'),
} as const;

export type AppConfig = typeof config;
