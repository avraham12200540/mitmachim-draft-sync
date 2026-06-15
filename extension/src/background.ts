// ============================================================================
// Background service worker — the single hub that holds the access token and
// the derived encryption key, performs all API calls, encrypts/decrypts drafts,
// and manages the offline queue + retry alarm. Content script and popup never
// talk to the server directly; they message this worker.
// ============================================================================

import { ALARMS, LIMITS, TIMING } from './config';
import { ApiClient, ApiError } from './api';
import {
  deriveMasterKey,
  encryptField,
  decryptField,
  ivOf,
  ENCRYPTION_SCHEME,
  maskSyncKey,
} from './crypto';
import { truncate } from './format';
import { initLog, log, setLogDebug } from './log';
import {
  clearSession,
  enqueue,
  getAuth,
  getQueue,
  getDebug,
  isConnected,
  queueCount,
  setAuth,
  setDebug,
  setQueue,
} from './storage';
import type {
  AuthStatus,
  BgRequest,
  BgResponse,
  DecryptedDraft,
  DecryptedDraftSummary,
  DraftContext,
  DraftDTO,
  DraftUpsert,
  PendingSyncItem,
  SaveResult,
  StoredAuth,
} from './types';

void initLog();

// ---------------------------------------------------------------------------
// Key + client helpers
// ---------------------------------------------------------------------------

let cachedKey: CryptoKey | null = null;
let cachedKeyFor: string | null = null;

async function getKey(): Promise<CryptoKey> {
  const auth = await getAuth();
  if (!auth.syncKey) throw new Error('NOT_CONNECTED');
  if (cachedKey && cachedKeyFor === auth.syncKey) return cachedKey;
  cachedKey = await deriveMasterKey(auth.syncKey);
  cachedKeyFor = auth.syncKey;
  return cachedKey;
}

function clearKey(): void {
  cachedKey = null;
  cachedKeyFor = null;
}

function buildClient(auth: StoredAuth): ApiClient {
  return new ApiClient({ baseUrl: auth.apiUrl, token: auth.accessToken });
}

// ---------------------------------------------------------------------------
// Encryption <-> wire mapping
// ---------------------------------------------------------------------------

async function encryptContext(
  context: DraftContext,
  expectedServerUpdatedAt?: string | null,
): Promise<DraftUpsert> {
  const key = await getKey();
  const encryptedContent = await encryptField(key, context.content);
  const encryptedTitle =
    context.title && context.title.trim() ? await encryptField(key, context.title) : null;

  return {
    type: context.type,
    localDraftKey: context.localDraftKey,
    encryptedContent,
    encryptedTitle,
    encryptionIv: ivOf(encryptedContent),
    encryptionSalt: ENCRYPTION_SCHEME,
    categoryId: context.categoryId ?? null,
    topicId: context.topicId ?? null,
    postId: context.postId ?? null,
    url: context.url ?? null,
    clientUpdatedAt: context.clientUpdatedAt ?? new Date().toISOString(),
    expectedServerUpdatedAt: expectedServerUpdatedAt ?? null,
  };
}

async function toDecrypted(dto: DraftDTO): Promise<DecryptedDraft> {
  const key = await getKey();
  let content = '';
  let title = '';
  try {
    content = await decryptField(key, dto.encryptedContent);
  } catch {
    content = '⚠️ לא ניתן לפענח (קוד סנכרון שונה?)';
  }
  if (dto.encryptedTitle) {
    try {
      title = await decryptField(key, dto.encryptedTitle);
    } catch {
      title = '';
    }
  }
  return {
    id: dto.id,
    type: dto.type,
    localDraftKey: dto.localDraftKey,
    title,
    content,
    categoryId: dto.categoryId,
    topicId: dto.topicId,
    postId: dto.postId,
    url: dto.url,
    deviceName: dto.deviceName,
    clientUpdatedAt: dto.clientUpdatedAt,
    serverUpdatedAt: dto.serverUpdatedAt,
    createdAt: dto.createdAt,
  };
}

async function toSummary(dto: DraftDTO): Promise<DecryptedDraftSummary> {
  const d = await toDecrypted(dto);
  return {
    id: d.id,
    type: d.type,
    title: d.title,
    preview: truncate(d.content, 100),
    url: d.url,
    topicId: d.topicId,
    postId: d.postId,
    categoryId: d.categoryId,
    localDraftKey: d.localDraftKey,
    deviceName: d.deviceName,
    serverUpdatedAt: d.serverUpdatedAt,
  };
}

async function buildStatus(): Promise<AuthStatus> {
  const auth = await getAuth();
  return {
    connected: Boolean(auth.accessToken && auth.syncKey),
    apiUrl: auth.apiUrl,
    userId: auth.userId,
    deviceId: auth.deviceId,
    deviceName: auth.deviceName,
    syncKeyMasked: maskSyncKey(auth.syncKey),
    debug: await getDebug(),
    pendingCount: await queueCount(),
  };
}

// ---------------------------------------------------------------------------
// Offline queue
// ---------------------------------------------------------------------------

async function queueOffline(payload: DraftUpsert): Promise<void> {
  // Drop the conflict guard so the item always applies when it eventually syncs.
  const item: PendingSyncItem = {
    id: `${payload.localDraftKey}:${Date.now()}`,
    localDraftKey: payload.localDraftKey,
    draftPayload: { ...payload, expectedServerUpdatedAt: null },
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };
  await enqueue(item);
  log.event('queue:enqueued', { key: payload.localDraftKey });
}

let flushing = false;

async function flushQueue(): Promise<{ synced: number; remaining: number }> {
  // Coalesce overlapping triggers (alarm / online / startup / login) into one run.
  if (flushing) return { synced: 0, remaining: await queueCount() };
  if (!(await isConnected())) return { synced: 0, remaining: await queueCount() };
  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, remaining: 0 };

  flushing = true;
  try {
    const client = buildClient(await getAuth());
    const succeeded: string[] = [];
    const retained: PendingSyncItem[] = [];
    let stoppedForNetwork = false;

    for (const item of queue) {
      if (stoppedForNetwork) {
        retained.push(item);
        continue;
      }
      try {
        await client.upsertDraft(item.draftPayload);
        succeeded.push(item.id);
      } catch (err) {
        if (err instanceof ApiError && (err.isOffline || (err.status ?? 0) >= 500)) {
          stoppedForNetwork = true;
          retained.push(item);
        } else {
          const next = {
            ...item,
            retryCount: item.retryCount + 1,
            lastError: (err as Error).message,
          };
          if (next.retryCount <= 5) retained.push(next);
          else log.warn('queue:dropped', { key: item.localDraftKey });
        }
      }
    }

    // Preserve any items enqueued by another save while we were flushing.
    const originalIds = new Set(queue.map((q) => q.id));
    const current = await getQueue();
    const newcomers = current.filter((c) => !originalIds.has(c.id));
    await setQueue([...retained, ...newcomers]);

    if (succeeded.length)
      log.event('queue:flushed', { synced: succeeded.length, remaining: retained.length + newcomers.length });
    return { synced: succeeded.length, remaining: retained.length + newcomers.length };
  } finally {
    flushing = false;
  }
}

// ---------------------------------------------------------------------------
// Request handlers
// ---------------------------------------------------------------------------

async function handleSave(
  context: DraftContext,
  expectedServerUpdatedAt?: string | null,
): Promise<SaveResult> {
  if (!(await isConnected())) {
    return { ok: false, status: 'error', error: 'not_connected' };
  }
  const payload = await encryptContext(context, expectedServerUpdatedAt);

  // Enforce the documented size ceilings client-side: a too-large draft would be
  // rejected with 400 forever, so surface a clear error instead of queueing it.
  if (
    payload.encryptedContent.length > LIMITS.maxContentBytes ||
    (payload.encryptedTitle ? payload.encryptedTitle.length > LIMITS.maxTitleBytes : false)
  ) {
    return { ok: false, status: 'error', error: 'too_large' };
  }

  const client = buildClient(await getAuth());

  try {
    const res = await client.upsertDraft(payload);
    if (res.ok) {
      log.event('draft:synced', { type: context.type, len: context.content.length });
      return { ok: true, status: 'saved', serverUpdatedAt: res.draft.serverUpdatedAt };
    }
    const serverDraft = await toDecrypted(res.serverDraft);
    log.event('draft:conflict', { key: context.localDraftKey });
    return {
      ok: false,
      status: 'conflict',
      serverDraft,
      serverUpdatedAt: res.serverDraft.serverUpdatedAt,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      // Network down, or a transient server/proxy error (5xx) or throttling
      // (429): persist to the encrypted offline queue and retry later. Client
      // errors (400/401/403) are not queued — they would never succeed.
      if (err.isOffline || (err.status ?? 0) >= 500 || err.status === 429) {
        await queueOffline(payload);
        return { ok: false, status: 'offline' };
      }
      log.error('draft:sync-error', { code: err.code, status: err.status });
      return { ok: false, status: 'error', error: err.code === 'UNAUTHORIZED' ? 'unauthorized' : 'error' };
    }
    log.error('draft:sync-error', { message: (err as Error).message });
    return { ok: false, status: 'error', error: 'error' };
  }
}

async function handle(req: BgRequest): Promise<BgResponse> {
  switch (req.type) {
    case 'GET_STATUS':
      return { ok: true, status: await buildStatus() };

    case 'CREATE_SYNC_KEY': {
      const auth = await getAuth();
      const client = buildClient({ ...auth, accessToken: null });
      const res = await client.createSyncKey(req.deviceName);
      await setAuth({
        syncKey: res.syncKey,
        accessToken: res.accessToken,
        userId: res.userId,
        deviceId: res.deviceId,
        deviceName: req.deviceName ?? auth.deviceName ?? null,
      });
      clearKey();
      await getKey();
      log.event('auth:created');
      return { ok: true, syncKey: res.syncKey, status: await buildStatus() };
    }

    case 'LOGIN': {
      const auth = await getAuth();
      const client = buildClient({ ...auth, accessToken: null });
      const res = await client.login(req.syncKey, req.deviceName);
      await setAuth({
        syncKey: req.syncKey,
        accessToken: res.accessToken,
        userId: res.userId,
        deviceId: res.deviceId,
        deviceName: req.deviceName ?? auth.deviceName ?? null,
      });
      clearKey();
      await getKey();
      log.event('auth:login');
      void flushQueue();
      return { ok: true, status: await buildStatus(), loggedIn: true };
    }

    case 'LOGOUT': {
      const auth = await getAuth();
      try {
        if (auth.accessToken) await buildClient(auth).logout();
      } catch {
        // Best effort: revoke locally even if the server is unreachable.
      }
      clearKey();
      await setQueue([]);
      await clearSession();
      log.event('auth:logout');
      return { ok: true, status: await buildStatus() };
    }

    case 'SET_API_URL': {
      let url: string;
      try {
        url = new URL(req.apiUrl).toString().replace(/\/+$/, '');
      } catch {
        return { ok: false, error: 'invalid_url' };
      }
      await setAuth({ apiUrl: url });
      return { ok: true, status: await buildStatus() };
    }

    case 'SET_DEBUG':
      await setDebug(req.enabled);
      setLogDebug(req.enabled);
      return { ok: true };

    case 'LIST_DRAFTS': {
      if (!(await isConnected())) return { ok: false, error: 'not_connected' };
      try {
        const drafts = await buildClient(await getAuth()).listDrafts();
        const summaries: DecryptedDraftSummary[] = [];
        for (const d of drafts) summaries.push(await toSummary(d));
        return { ok: true, drafts: summaries };
      } catch (err) {
        return { ok: false, error: err instanceof ApiError ? err.message : 'error' };
      }
    }

    case 'GET_DRAFT': {
      if (!(await isConnected())) return { ok: false, error: 'not_connected' };
      try {
        const dto = await buildClient(await getAuth()).getDraft(req.id);
        return { ok: true, draft: await toDecrypted(dto) };
      } catch (err) {
        return { ok: false, error: err instanceof ApiError ? err.message : 'error' };
      }
    }

    case 'DELETE_DRAFT': {
      if (!(await isConnected())) return { ok: false, error: 'not_connected' };
      try {
        await buildClient(await getAuth()).deleteDraft(req.id);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof ApiError ? err.message : 'error' };
      }
    }

    case 'MATCH_DRAFT': {
      if (!(await isConnected())) return { ok: true, draft: null };
      try {
        const dto = await buildClient(await getAuth()).matchDraft(req.match);
        return { ok: true, draft: dto ? await toDecrypted(dto) : null };
      } catch (err) {
        return { ok: false, error: err instanceof ApiError ? err.message : 'error' };
      }
    }

    case 'SAVE_DRAFT': {
      const result = await handleSave(req.context, req.expectedServerUpdatedAt);
      return { ok: true, result };
    }

    case 'FLUSH_QUEUE': {
      const { synced, remaining } = await flushQueue();
      return { ok: true, synced, remaining };
    }

    default:
      return { ok: false, error: 'unknown_request' };
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((req: BgRequest, _sender, sendResponse) => {
  handle(req)
    .then(sendResponse)
    .catch((err) => {
      log.error('handler:error', { type: req?.type, message: (err as Error).message });
      sendResponse({ ok: false, error: (err as Error).message ?? 'error' });
    });
  return true; // keep the message channel open for the async response
});

function ensureAlarm(): void {
  chrome.alarms.create(ALARMS.sync, { periodInMinutes: TIMING.queueRetryMinutes });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  void initLog();
});
chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  void flushQueue();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARMS.sync) void flushQueue();
});

// Flush as soon as connectivity returns.
self.addEventListener('online', () => void flushQueue());
