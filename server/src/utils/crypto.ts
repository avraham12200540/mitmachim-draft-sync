import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { config } from '../config';

/**
 * Crockford-ish base32 alphabet without ambiguous characters (no I, L, O, U, 0, 1).
 * Used so Sync Keys are easy to read and copy by hand.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Sync Keys and tokens are high-entropy random secrets, so they must be hashed
 * with a *deterministic* keyed hash (so we can look them up) rather than a
 * salted password hash like bcrypt. We use HMAC-SHA256 with a server-side
 * pepper: deterministic for lookup, and resistant to offline brute force as
 * long as the pepper stays secret. See docs/SECURITY.md.
 */
export function hashSecret(secret: string): string {
  return createHmac('sha256', config.syncKeyPepper).update(secret, 'utf8').digest('hex');
}

function randomBlock(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/** Generates a Sync Key in the form `MTD-XXXX-XXXX-XXXX`. */
export function generateSyncKey(): string {
  return `MTD-${randomBlock(4)}-${randomBlock(4)}-${randomBlock(4)}`;
}

/** Generates an opaque access token (256 bits, URL-safe). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}
