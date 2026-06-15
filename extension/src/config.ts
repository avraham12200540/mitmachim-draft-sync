// ============================================================================
// Build-time defaults & constants. Advanced users can override the API URL at
// runtime from the popup (stored in chrome.storage.local). To change the
// compiled default, edit DEFAULT_API_URL below and rebuild.
// ============================================================================

/**
 * The private API base URL. Fixed — the extension always talks to this server
 * and the popup has no field to change it (avoids misconfiguration). To point
 * at a different server, edit this and rebuild + update manifest host_permissions.
 */
export const DEFAULT_API_URL = 'https://drafts-api.extsync.com';

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
