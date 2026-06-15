// Reads the forum's (NodeBB) native local drafts from localStorage and watches
// for deletions, so the extension can mirror a delete to the synced server copy.
//
// Format (observed on mitmachim.top):
//   localStorage['drafts:available'] = ["composer:27709:<ts>", ...]
//   localStorage['composer:27709:<ts>'] = { save_id, action, text, title, cid, tid, pid }
//   action: 'topics.post' (new topic) | 'posts.reply' | 'posts.edit'

import { buildLocalDraftKey } from './urlParser';
import { NODEBB_DRAFTS_AVAILABLE_KEY } from './selectors';
import { log } from '../log';
import type { DraftType } from '../types';

export interface NodebbDraft {
  saveId: string;
  action?: string;
  text?: string;
  title?: string;
  cid?: string | null;
  tid?: string | null;
  pid?: string | null;
}

function str(v: unknown): string | null {
  return v === undefined || v === null || v === '' ? null : String(v);
}

function readAvailableIds(): string[] {
  try {
    const raw = localStorage.getItem(NODEBB_DRAFTS_AVAILABLE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function readDraft(saveId: string): NodebbDraft | null {
  try {
    const raw = localStorage.getItem(saveId);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      saveId,
      action: typeof o.action === 'string' ? o.action : undefined,
      text: typeof o.text === 'string' ? o.text : undefined,
      title: typeof o.title === 'string' ? o.title : undefined,
      cid: str(o.cid),
      tid: str(o.tid),
      pid: str(o.pid),
    };
  } catch {
    return null;
  }
}

export function readAllNodebbDrafts(): NodebbDraft[] {
  return readAvailableIds()
    .map(readDraft)
    .filter((d): d is NodebbDraft => d !== null);
}

export function nodebbActionToType(action?: string): DraftType | null {
  if (action === 'topics.post') return 'topic';
  if (action === 'posts.reply') return 'reply';
  if (action === 'posts.edit') return 'edit';
  return null;
}

/** Computes the same localDraftKey our content script uses, from a native draft. */
export function nodebbDraftKey(d: NodebbDraft): string | null {
  const type = nodebbActionToType(d.action);
  if (!type) return null;
  return buildLocalDraftKey({
    type,
    categoryId: d.cid,
    topicId: d.tid,
    postId: d.pid,
    normalizedUrl: '',
  });
}

/**
 * Finds the native draft whose text matches the live composer content. Used so
 * our saved draft uses the SAME cid/tid/pid the forum recorded (keeps the
 * delete-mirroring mapping exact).
 */
export function findDraftByContent(content: string): NodebbDraft | null {
  const trimmed = content.trim();
  if (trimmed.length < 2) return null;
  const drafts = readAllNodebbDrafts();
  const exact = drafts.find((d) => (d.text ?? '').trim() === trimmed);
  if (exact) return exact;
  const head = trimmed.slice(0, 40);
  return drafts.find((d) => trimmed.length > 20 && (d.text ?? '').trim().startsWith(head)) ?? null;
}

export interface NodebbDraftWatcherHandlers {
  onDeleted: (localDraftKey: string, draft: NodebbDraft) => void;
}

/** Polls `drafts:available`; fires onDeleted when a known draft disappears. */
export class NodebbDraftWatcher {
  private known = new Map<string, { key: string; draft: NodebbDraft }>();
  private timer: number | null = null;

  constructor(private readonly handlers: NodebbDraftWatcherHandlers) {}

  start(): void {
    this.refresh(false); // seed without firing
    this.timer = window.setInterval(() => this.refresh(true), 2500);
    log.event('nodebb-drafts:watching');
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private refresh(fireDeletions: boolean): void {
    const current = new Map<string, { key: string; draft: NodebbDraft }>();
    for (const d of readAllNodebbDrafts()) {
      const key = nodebbDraftKey(d);
      if (key) current.set(d.saveId, { key, draft: d });
    }
    if (fireDeletions) {
      for (const [saveId, entry] of this.known) {
        if (!current.has(saveId)) {
          log.event('nodebb-draft:deleted', { key: entry.key });
          this.handlers.onDeleted(entry.key, entry.draft);
        }
      }
    }
    this.known = current;
  }
}
