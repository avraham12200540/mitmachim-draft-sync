// Round-trip test for the E2E crypto. Run: npx tsx extension/scripts/crypto.test.ts
import {
  deriveMasterKey,
  encryptField,
  decryptField,
  maskSyncKey,
  ivOf,
  ENCRYPTION_SCHEME,
} from '../src/crypto';

const assert = (c: boolean, m: string) => {
  if (!c) {
    console.error('FAIL:', m);
    process.exit(1);
  }
  console.log('ok:', m);
};

async function main() {
  const syncKey = 'MTD-W4MP-4AYR-5B2X';
  const key = await deriveMasterKey(syncKey);

  const plaintext = 'שלום עולם — זו טיוטה לבדיקה\nשורה שנייה with English & symbols 🚀';
  const envelope = await encryptField(key, plaintext);
  assert(envelope.startsWith('1.'), 'envelope has version prefix');
  assert(envelope.split('.').length === 3, 'envelope has 3 parts');
  assert(ivOf(envelope) === envelope.split('.')[1], 'ivOf extracts iv');

  const decrypted = await decryptField(key, envelope);
  assert(decrypted === plaintext, 'round-trip restores exact plaintext');

  // Different IV each time
  const envelope2 = await encryptField(key, plaintext);
  assert(envelope !== envelope2, 'two encryptions differ (random IV)');
  assert((await decryptField(key, envelope2)) === plaintext, 'second envelope also decrypts');

  // Wrong key cannot decrypt
  const wrongKey = await deriveMasterKey('MTD-AAAA-BBBB-CCCC');
  let failed = false;
  try {
    await decryptField(wrongKey, envelope);
  } catch {
    failed = true;
  }
  assert(failed, 'wrong key fails to decrypt (authenticated)');

  // Same key derived twice on "different devices" decrypts the same data
  const keyAgain = await deriveMasterKey(syncKey);
  assert((await decryptField(keyAgain, envelope)) === plaintext, 'cross-device key derivation matches');

  assert(maskSyncKey(syncKey) === 'MTD-****-****-5B2X', 'maskSyncKey hides middle blocks');
  assert(ENCRYPTION_SCHEME.includes('aes-gcm'), 'scheme tag present');

  console.log('\nCRYPTO ROUND-TRIP PASSED ✅');
}

main().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
