import { randomUUID } from 'node:crypto';

/** Generates a fresh UUID v4, used for all primary keys. */
export function newId(): string {
  return randomUUID();
}
