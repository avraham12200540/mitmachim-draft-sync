// Typed wrappers around chrome.storage.local for auth state, the debug flag,
// and the offline queue.

import { DEFAULT_API_URL, STORAGE_KEYS } from './config';
import type { PendingSyncItem, StoredAuth } from './types';

const DEFAULT_AUTH: StoredAuth = {
  apiUrl: DEFAULT_API_URL,
  syncKey: null,
  accessToken: null,
  userId: null,
  deviceId: null,
  deviceName: null,
};

async function getRaw<T>(key: string): Promise<T | undefined> {
  const obj = await chrome.storage.local.get(key);
  return obj[key] as T | undefined;
}

async function setRaw(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function getAuth(): Promise<StoredAuth> {
  const stored = await getRaw<Partial<StoredAuth>>(STORAGE_KEYS.auth);
  // apiUrl is fixed in code — always force it, ignoring any older stored value.
  return { ...DEFAULT_AUTH, ...(stored ?? {}), apiUrl: DEFAULT_API_URL };
}

export async function setAuth(patch: Partial<StoredAuth>): Promise<StoredAuth> {
  const current = await getAuth();
  const next = { ...current, ...patch };
  await setRaw(STORAGE_KEYS.auth, next);
  return next;
}

export async function clearSession(): Promise<void> {
  // Keep apiUrl so the user does not have to re-enter it after logout.
  const { apiUrl } = await getAuth();
  await setRaw(STORAGE_KEYS.auth, { ...DEFAULT_AUTH, apiUrl });
}

export async function isConnected(): Promise<boolean> {
  const auth = await getAuth();
  return Boolean(auth.accessToken && auth.syncKey);
}

export async function getDebug(): Promise<boolean> {
  return (await getRaw<boolean>(STORAGE_KEYS.debug)) ?? false;
}

export async function setDebug(enabled: boolean): Promise<void> {
  await setRaw(STORAGE_KEYS.debug, enabled);
}

// ---------------------------------------------------------------------------
// Offline queue
// ---------------------------------------------------------------------------

export async function getQueue(): Promise<PendingSyncItem[]> {
  return (await getRaw<PendingSyncItem[]>(STORAGE_KEYS.queue)) ?? [];
}

export async function setQueue(items: PendingSyncItem[]): Promise<void> {
  await setRaw(STORAGE_KEYS.queue, items);
}

/** Adds or replaces (by localDraftKey) a pending item so the queue stays compact. */
export async function enqueue(item: PendingSyncItem): Promise<void> {
  const queue = await getQueue();
  const idx = queue.findIndex((q) => q.localDraftKey === item.localDraftKey);
  if (idx >= 0) queue[idx] = item;
  else queue.push(item);
  await setQueue(queue);
}

export async function removeFromQueue(ids: string[]): Promise<void> {
  const set = new Set(ids);
  const queue = await getQueue();
  await setQueue(queue.filter((q) => !set.has(q.id)));
}

export async function queueCount(): Promise<number> {
  return (await getQueue()).length;
}
