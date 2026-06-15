// ============================================================================
// Shared extension types. The wire contract mirrors docs/API.md.
// ============================================================================

export type DraftType = 'topic' | 'reply' | 'edit';

export const FORUM = 'mitmachim.top' as const;

/** Context captured from the live composer in the page (plaintext, never sent as-is). */
export interface DraftContext {
  type: DraftType;
  forum: typeof FORUM;
  title?: string;
  content: string;
  categoryId?: string | null;
  topicId?: string | null;
  postId?: string | null;
  url: string;
  localDraftKey: string;
  clientUpdatedAt?: string;
}

/** Parameters used to ask the server for a matching draft. */
export interface MatchQuery {
  type: DraftType;
  localDraftKey: string;
  topicId?: string | null;
  postId?: string | null;
  categoryId?: string | null;
}

/** Encrypted draft as stored/transferred. `encrypted*` are opaque envelopes. */
export interface DraftUpsert {
  type: DraftType;
  localDraftKey: string;
  encryptedContent: string;
  encryptedTitle?: string | null;
  encryptionIv?: string | null;
  encryptionSalt?: string | null;
  categoryId?: string | null;
  topicId?: string | null;
  postId?: string | null;
  url?: string | null;
  clientUpdatedAt?: string;
  expectedServerUpdatedAt?: string | null;
}

/** Draft as returned by the server (still encrypted). */
export interface DraftDTO {
  id: string;
  type: DraftType;
  localDraftKey: string;
  encryptedTitle: string | null;
  encryptedContent: string;
  encryptionIv: string | null;
  encryptionSalt: string | null;
  categoryId: string | null;
  topicId: string | null;
  postId: string | null;
  url: string | null;
  deviceId: string | null;
  deviceName: string | null;
  clientUpdatedAt: string | null;
  serverUpdatedAt: string;
  createdAt: string;
  deletedAt: string | null;
}

/** A draft after local decryption, ready for display/restore. */
export interface DecryptedDraft {
  id: string;
  type: DraftType;
  localDraftKey: string;
  title: string;
  content: string;
  categoryId: string | null;
  topicId: string | null;
  postId: string | null;
  url: string | null;
  deviceName: string | null;
  clientUpdatedAt: string | null;
  serverUpdatedAt: string;
  createdAt: string;
}

/** Compact form shown in the popup list. */
export interface DecryptedDraftSummary {
  id: string;
  type: DraftType;
  title: string;
  preview: string;
  url: string | null;
  topicId: string | null;
  postId: string | null;
  categoryId: string | null;
  localDraftKey: string;
  deviceName: string | null;
  serverUpdatedAt: string;
}

/** Item parked in the offline queue (already encrypted — safe at rest). */
export interface PendingSyncItem {
  id: string;
  localDraftKey: string;
  draftPayload: DraftUpsert;
  createdAt: string;
  retryCount: number;
  lastError?: string;
}

/** Persisted auth/state in chrome.storage.local. */
export interface StoredAuth {
  apiUrl: string;
  syncKey: string | null;
  accessToken: string | null;
  userId: string | null;
  deviceId: string | null;
  deviceName: string | null;
}

export type SaveStatus = 'saved' | 'saving' | 'offline' | 'error' | 'conflict' | 'idle';

export interface AuthStatus {
  connected: boolean;
  apiUrl: string;
  userId: string | null;
  deviceId: string | null;
  deviceName: string | null;
  syncKeyMasked: string | null;
  debug: boolean;
  pendingCount: number;
}

// ----------------------------------------------------------------------------
// Messaging protocol (content/popup -> background)
// ----------------------------------------------------------------------------

export type BgRequest =
  | { type: 'GET_STATUS' }
  | { type: 'CREATE_SYNC_KEY'; deviceName?: string }
  | { type: 'LOGIN'; syncKey: string; deviceName?: string }
  | { type: 'LOGOUT' }
  | { type: 'SET_API_URL'; apiUrl: string }
  | { type: 'SET_DEBUG'; enabled: boolean }
  | { type: 'LIST_DRAFTS' }
  | { type: 'GET_DRAFT'; id: string }
  | { type: 'DELETE_DRAFT'; id: string }
  | { type: 'SAVE_DRAFT'; context: DraftContext; expectedServerUpdatedAt?: string | null }
  | { type: 'MATCH_DRAFT'; match: MatchQuery }
  | { type: 'FLUSH_QUEUE' };

export interface SaveResult {
  ok: boolean;
  status: SaveStatus;
  draft?: DecryptedDraft;
  serverDraft?: DecryptedDraft;
  serverUpdatedAt?: string;
  error?: string;
}

export type BgResponse =
  | { ok: true; status: AuthStatus }
  | { ok: true; syncKey: string; status: AuthStatus }
  | { ok: true; status: AuthStatus; loggedIn: true }
  | { ok: true; drafts: DecryptedDraftSummary[] }
  | { ok: true; draft: DecryptedDraft | null }
  | { ok: true; result: SaveResult }
  | { ok: true; synced: number; remaining: number }
  | { ok: true }
  | { ok: false; error: string; code?: string };
