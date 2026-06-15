// ============================================================================
// Build-time defaults & constants. Advanced users can override the API URL at
// runtime from the popup (stored in chrome.storage.local). To change the
// compiled default, edit DEFAULT_API_URL below and rebuild.
// ============================================================================

/** Default private API base URL. Change this and rebuild, or set it in the popup. */
export const DEFAULT_API_URL = 'https://drafts-api.example.com';

/** chrome.storage.local keys. */
export const STORAGE_KEYS = {
  auth: 'mds.auth',
  debug: 'mds.debug',
  queue: 'mds.pendingQueue',
} as const;

/** chrome.alarms names. */
export const ALARMS = {
  sync: 'mds.sync',
} as const;

/** Timing (ms). */
export const TIMING = {
  /** Debounce before sending to the server after the last keystroke. */
  saveDebounceMs: 1500,
  /** Immediate-ish local save debounce. */
  localSaveMs: 400,
  /** Periodic forced save while the composer is dirty. */
  periodicSaveMs: 30_000,
  /** Background queue retry interval. */
  queueRetryMinutes: 2,
} as const;

/** Hard ceilings mirrored from the server validation (see docs/API.md). */
export const LIMITS = {
  maxContentBytes: 100 * 1024,
  maxTitleBytes: 20 * 1024,
  maxUrlChars: 2000,
} as const;

/** A draft is "empty" (and not worth saving) below this trimmed length. */
export const MIN_MEANINGFUL_CHARS = 2;
