// Debug logger. Prints with a [MDS] prefix only when debug mode is enabled.
// IMPORTANT: never pass full draft titles/content here — only metadata such as
// lengths, types and ids. See docs/SECURITY.md.

import { STORAGE_KEYS } from './config';

let debugEnabled = false;

/** Loads the persisted debug flag and keeps it in sync with storage changes. */
export async function initLog(): Promise<void> {
  try {
    const obj = await chrome.storage.local.get(STORAGE_KEYS.debug);
    debugEnabled = Boolean(obj[STORAGE_KEYS.debug]);
  } catch {
    debugEnabled = false;
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEYS.debug]) {
      debugEnabled = Boolean(changes[STORAGE_KEYS.debug].newValue);
    }
  });
}

export function setLogDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

export const log = {
  event(name: string, meta?: Record<string, unknown>): void {
    if (debugEnabled) console.debug('[MDS]', name, meta ?? '');
  },
  warn(name: string, meta?: Record<string, unknown>): void {
    if (debugEnabled) console.warn('[MDS]', name, meta ?? '');
  },
  error(name: string, meta?: Record<string, unknown>): void {
    // Errors are always surfaced (still metadata-only).
    console.error('[MDS]', name, meta ?? '');
  },
};
