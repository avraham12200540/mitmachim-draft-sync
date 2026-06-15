// ============================================================================
// Client-side end-to-end encryption.
//
// The server never receives the encryption key or any plaintext. The key is
// derived from the Sync Key with PBKDF2 and used for AES-GCM. Each encrypted
// field is a self-contained envelope: `1.<base64url(iv)>.<base64url(ciphertext+tag)>`.
//
// Tradeoffs (documented fully in docs/SECURITY.md):
//  - The KDF salt is a fixed application constant. This is acceptable because
//    the Sync Key is high-entropy and random, so per-user salting buys little.
//  - The derived key is held in memory in the service worker and re-derived
//    from the stored Sync Key on demand.
// ============================================================================

const KDF_SALT = 'MDS|pbkdf2|v1';
const KDF_ITERATIONS = 100_000;
const ENVELOPE_VERSION = '1';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Derives an AES-GCM CryptoKey from the Sync Key. */
export async function deriveMasterKey(syncKey: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(syncKey),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(KDF_SALT),
      iterations: KDF_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypts a UTF-8 string into a self-contained envelope. */
export async function encryptField(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );
  return `${ENVELOPE_VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

/** Decrypts an envelope produced by {@link encryptField}. */
export async function decryptField(key: CryptoKey, envelope: string): Promise<string> {
  const parts = envelope.split('.');
  if (parts.length !== 3 || parts[0] !== ENVELOPE_VERSION) {
    throw new Error('Unsupported ciphertext envelope');
  }
  const iv = fromBase64Url(parts[1]);
  const ciphertext = fromBase64Url(parts[2]);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource,
  );
  return decoder.decode(plaintext);
}

/** Returns the IV (base64url) embedded in an envelope, for the metadata column. */
export function ivOf(envelope: string | null | undefined): string | null {
  if (!envelope) return null;
  const parts = envelope.split('.');
  return parts.length === 3 ? parts[1] : null;
}

/** The encryption scheme tag stored alongside drafts (encryption_salt column). */
export const ENCRYPTION_SCHEME = `pbkdf2-aes-gcm-${KDF_ITERATIONS}-v1`;

/** Masks a Sync Key for display, e.g. `MTD-7Q4K-2H9P-X7P2` -> `MTD-****-****-X7P2`. */
export function maskSyncKey(syncKey: string | null): string | null {
  if (!syncKey) return null;
  const parts = syncKey.split('-');
  if (parts.length < 2) return '****';
  return parts.map((p, i) => (i === 0 || i === parts.length - 1 ? p : '****')).join('-');
}
