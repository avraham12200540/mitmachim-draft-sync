import { config } from '../config';

type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = ORDER[(config.logLevel as Level) in ORDER ? (config.logLevel as Level) : 'info'];

/**
 * Minimal structured logger. IMPORTANT: never pass draft titles/content here —
 * only metadata (ids, types, counts, timings). See docs/SECURITY.md.
 */
function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
  if (ORDER[level] < threshold) return;
  const line = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(meta ? { meta } : {}),
  };
  const text = JSON.stringify(line);
  if (level === 'error') process.stderr.write(text + '\n');
  else process.stdout.write(text + '\n');
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
};
