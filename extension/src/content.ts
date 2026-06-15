// ============================================================================
// Content script — runs on mitmachim.top. Detects the composer, reads what the
// user types (plaintext, only sent to the background worker which encrypts it),
// auto-saves with debounce, shows a status pill, and offers draft restore.
//
// It NEVER reads cookies, session tokens, or any forum credentials. It only
// reads the text in the composer's title/content fields.
// ============================================================================

import { MIN_MEANINGFUL_CHARS, TIMING } from './config';
import { initLog, log } from './log';
import { sendToBackground } from './messaging';
import { ComposerWatcher } from './dom/composerDetector';
import {
  resolveEditor,
  readTitle,
  readContent,
  writeTitle,
  writeContent,
  readComposerIds,
  readCategoryName,
  readTopicType,
  applyCategory,
  applyTopicType,
  type EditorHandles,
} from './dom/editorAdapter';
import { parseUrl, buildLocalDraftKey } from './dom/urlParser';
import {
  NodebbDraftWatcher,
  findDraftByContent,
  nodebbActionToType,
  type NodebbDraft,
} from './dom/nodebbDrafts';
import { StatusBar } from './ui/injectedStatusBar';
import { RestoreModal } from './ui/restoreModal';
import { showToast } from './ui/toast';
import { FORUM, type DecryptedDraft, type DraftContext, type DraftType } from './types';

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

class ContentController {
  private readonly statusBar = new StatusBar();
  private readonly restoreModal = new RestoreModal();
  private watcher: ComposerWatcher;
  private readonly draftWatcher = new NodebbDraftWatcher({
    onDeleted: (key, draft) => this.onNativeDraftDeleted(key, draft),
  });
  /** Keys whose native draft was just deleted — don't re-create until the user types again. */
  private readonly suppressedKeys = new Set<string>();

  private composer: HTMLElement | null = null;
  private dirty = false;
  private lastSentHash: string | null = null;
  private lastServerUpdatedAt: string | null = null;
  /** Latest readable context, cached so we can flush on teardown/unload. */
  private lastContext: DraftContext | null = null;
  /** True while a conflict dialog is open; suppresses auto/periodic saves. */
  private conflictPending = false;
  private readonly handledRestoreKeys = new Set<string>();

  private saveTimer: number | null = null;
  private periodicTimer: number | null = null;
  private boundInput = (): void => this.onInput();

  constructor() {
    this.watcher = new ComposerWatcher({
      onComposerOpen: (c) => this.onComposerOpen(c),
      onComposerClose: () => this.onComposerClose(),
      onUrlChange: () => this.onUrlChange(),
    });
  }

  start(): void {
    this.watcher.start();
    this.draftWatcher.start();
    // pagehide/visibilitychange fire earlier and more reliably than beforeunload
    // for SPA navigations; all are best-effort flushes of the last edit.
    window.addEventListener('beforeunload', () => this.saveImmediately());
    window.addEventListener('pagehide', () => this.saveImmediately());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveImmediately();
    });
  }

  // -- composer lifecycle ----------------------------------------------------

  private onComposerOpen(composer: HTMLElement): void {
    this.detachInput();
    this.composer = composer;
    const handles = resolveEditor(composer);
    if (!handles) {
      log.warn('composer:no-editor');
      return;
    }

    const ctx = this.buildContext(handles);
    this.lastSentHash = null;
    this.lastServerUpdatedAt = null;
    this.lastContext = this.isEmpty(ctx) ? null : ctx;
    this.conflictPending = false;
    this.dirty = false;

    this.statusBar.mount();
    this.statusBar.setStatus('idle');

    composer.addEventListener('input', this.boundInput, true);
    this.startPeriodic();
    log.event('composer:active', { type: ctx.type, key: ctx.localDraftKey });

    void this.offerRestore(ctx);
  }

  private onComposerClose(): void {
    this.saveImmediately();
    this.detachInput();
    this.stopPeriodic();
    this.statusBar.destroy();
    this.restoreModal.hide();
    this.composer = null;
  }

  private onUrlChange(): void {
    // The composer context may have changed; force a re-evaluation on next scan.
    this.restoreModal.hide();
  }

  /** The forum's native draft was removed (discarded, deleted, or posted) — mirror the delete. */
  private onNativeDraftDeleted(localDraftKey: string, draft: NodebbDraft): void {
    const type = nodebbActionToType(draft.action);
    if (!type) return;
    this.suppressedKeys.add(localDraftKey);
    if (this.lastContext?.localDraftKey === localDraftKey) {
      this.dirty = false;
      this.lastSentHash = null;
    }
    void sendToBackground({
      type: 'DELETE_DRAFT_BY_CONTEXT',
      match: {
        type,
        localDraftKey,
        topicId: draft.tid ?? null,
        postId: draft.pid ?? null,
        categoryId: draft.cid ?? null,
      },
    });
    log.event('draft:native-deleted-mirrored', { key: localDraftKey });
  }

  // -- context construction --------------------------------------------------

  private buildContext(handles: EditorHandles): DraftContext {
    const urlInfo = parseUrl(location.href);
    const ids = readComposerIds(handles.composer);
    const content = readContent(handles);
    const title = readTitle(handles);

    // Prefer the forum's own draft record (authoritative cid/tid/pid + action),
    // so our localDraftKey matches NodeBB's and delete-mirroring stays exact.
    const nb = findDraftByContent(content);

    const categoryId = nb?.cid ?? ids.cid ?? urlInfo.categoryId;
    const topicId = nb?.tid ?? ids.tid ?? urlInfo.topicId;
    const postId = nb?.pid ?? ids.pid ?? urlInfo.postId;
    const action = ids.action ?? urlInfo.action;
    const hasTitle = !!handles.titleEl;

    let type: DraftType;
    const nbType = nodebbActionToType(nb?.action);
    if (nbType) type = nbType;
    else if ((action && action.toLowerCase().includes('edit')) || postId) type = 'edit';
    else if (hasTitle) type = 'topic';
    else if (topicId) type = 'reply';
    else type = urlInfo.inferredType ?? (hasTitle ? 'topic' : 'reply');

    // Category name + "סוג נושא" only exist on the new-topic composer (null otherwise).
    const categoryName = readCategoryName(handles.composer);
    const topicType = readTopicType(handles.composer);

    const localDraftKey = buildLocalDraftKey({
      type,
      categoryId,
      topicId,
      postId,
      normalizedUrl: urlInfo.normalizedUrl,
    });

    return {
      type,
      forum: FORUM,
      title,
      content,
      categoryId,
      categoryName,
      topicType,
      topicId,
      postId,
      url: location.href.slice(0, 2000),
      localDraftKey,
      clientUpdatedAt: new Date().toISOString(),
    };
  }

  private currentContext(): DraftContext | null {
    if (!this.composer) return null;
    const handles = resolveEditor(this.composer);
    if (!handles) return null;
    return this.buildContext(handles);
  }

  private isEmpty(ctx: DraftContext): boolean {
    const title = (ctx.title ?? '').trim();
    const content = ctx.content.trim();
    return title.length === 0 && content.length < MIN_MEANINGFUL_CHARS;
  }

  // -- saving ----------------------------------------------------------------

  private onInput(): void {
    this.dirty = true;
    // Snapshot the latest text so teardown/unload can flush it even if the
    // composer DOM is gone by then.
    const snapshot = this.currentContext();
    if (snapshot) {
      this.suppressedKeys.delete(snapshot.localDraftKey); // user is writing again
      if (!this.isEmpty(snapshot)) this.lastContext = snapshot;
    }
    if (this.conflictPending) return; // wait until the user resolves the conflict
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.statusBar.setStatus('saving');
    this.saveTimer = window.setTimeout(() => void this.doSave(), TIMING.saveDebounceMs);
  }

  private async doSave(): Promise<void> {
    if (this.conflictPending) return;
    const ctx = this.currentContext();
    if (!ctx) return;
    if (this.isEmpty(ctx)) {
      this.statusBar.setStatus('idle');
      return;
    }
    if (this.suppressedKeys.has(ctx.localDraftKey)) {
      // Native draft was just deleted; don't resurrect it until the user types.
      this.statusBar.setStatus('idle');
      return;
    }
    this.lastContext = ctx;

    const hash = fnv1a(`${ctx.type}|${ctx.title ?? ''}|${ctx.content}`);
    if (hash === this.lastSentHash) {
      this.dirty = false;
      return; // nothing changed since last successful send
    }

    this.statusBar.setStatus('saving');
    const res = await sendToBackground({
      type: 'SAVE_DRAFT',
      context: ctx,
      expectedServerUpdatedAt: this.lastServerUpdatedAt,
    });

    if (!res.ok || !('result' in res)) {
      this.statusBar.setStatus('error');
      return;
    }
    const result = res.result;

    if (result.status === 'saved') {
      this.dirty = false;
      this.lastSentHash = hash;
      this.lastServerUpdatedAt = result.serverUpdatedAt ?? this.lastServerUpdatedAt;
      this.statusBar.setStatus('saved');
    } else if (result.status === 'offline') {
      this.dirty = false;
      this.lastSentHash = hash;
      this.statusBar.setStatus('offline');
    } else if (result.status === 'conflict' && result.serverDraft) {
      this.conflictPending = true; // stop auto-saving until the user resolves it
      this.statusBar.setStatus('conflict');
      if (!this.restoreModal.isOpen) this.offerConflict(result.serverDraft, ctx);
    } else if (result.status === 'error') {
      const msg =
        result.error === 'not_connected'
          ? 'לא מחובר — פתחו את התוסף'
          : result.error === 'too_large'
            ? 'הטיוטה גדולה מדי לסנכרון'
            : result.error === 'unauthorized'
              ? 'יש להתחבר מחדש בתוסף'
              : undefined;
      this.statusBar.setStatus('error', msg);
    } else {
      this.statusBar.setStatus('error');
    }
  }

  /** Fire-and-forget save used on unload / composer close. */
  private saveImmediately(): void {
    if (!this.dirty || this.conflictPending) return;
    // Prefer a fresh read, but fall back to the last cached snapshot if the
    // composer DOM has already been torn down.
    const ctx = this.currentContext() ?? this.lastContext;
    if (!ctx || this.isEmpty(ctx)) return;
    void sendToBackground({
      type: 'SAVE_DRAFT',
      context: ctx,
      expectedServerUpdatedAt: this.lastServerUpdatedAt,
    });
  }

  private startPeriodic(): void {
    this.stopPeriodic();
    this.periodicTimer = window.setInterval(() => {
      if (this.dirty && !this.conflictPending) void this.doSave();
    }, TIMING.periodicSaveMs);
  }

  private stopPeriodic(): void {
    if (this.periodicTimer !== null) window.clearInterval(this.periodicTimer);
    this.periodicTimer = null;
  }

  private detachInput(): void {
    if (this.composer) this.composer.removeEventListener('input', this.boundInput, true);
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }

  // -- restore ---------------------------------------------------------------

  private async offerRestore(ctx: DraftContext): Promise<void> {
    if (this.handledRestoreKeys.has(ctx.localDraftKey)) return;

    const res = await sendToBackground({
      type: 'MATCH_DRAFT',
      match: {
        type: ctx.type,
        localDraftKey: ctx.localDraftKey,
        topicId: ctx.topicId,
        postId: ctx.postId,
        categoryId: ctx.categoryId,
      },
    });
    if (!res.ok || !('draft' in res) || !res.draft) return;

    const server = res.draft;
    if (!server.content.trim() && !server.title.trim()) return;

    // Don't offer if the editor already holds the same content.
    const live = this.currentContext();
    if (live && live.content.trim() === server.content.trim()) {
      this.lastServerUpdatedAt = server.serverUpdatedAt;
      this.handledRestoreKeys.add(ctx.localDraftKey);
      return;
    }

    const hasExistingContent = !!live && !this.isEmpty(live);
    log.event('restore:offered', { key: ctx.localDraftKey, device: server.deviceName });

    this.restoreModal.show(
      {
        title: server.title,
        content: server.content,
        deviceName: server.deviceName,
        serverUpdatedAt: server.serverUpdatedAt,
        hasExistingContent,
        categoryName: server.categoryName,
        topicType: server.topicType,
      },
      (action) => {
        this.handledRestoreKeys.add(ctx.localDraftKey);
        this.lastServerUpdatedAt = server.serverUpdatedAt;
        void this.applyRestoreAction(action, server);
      },
    );
  }

  private async applyRestoreAction(
    action: 'restore' | 'append' | 'ignore' | 'delete',
    server: DecryptedDraft,
  ): Promise<void> {
    if (!this.composer) return;
    const handles = resolveEditor(this.composer);
    if (!handles && action !== 'delete' && action !== 'ignore') return;

    switch (action) {
      case 'restore':
        if (handles) {
          if (server.title) writeTitle(handles, server.title);
          writeContent(handles, server.content);
        }
        if (this.composer) {
          if (server.categoryId || server.categoryName) {
            applyCategory(this.composer, server.categoryId, server.categoryName);
          }
          if (server.topicType) applyTopicType(this.composer, server.topicType);
        }
        showToast('הטיוטה שוחזרה');
        break;
      case 'append':
        if (handles) {
          const current = readContent(handles);
          const merged = current.trim()
            ? `${current.trimEnd()}\n\n${server.content}`
            : server.content;
          if (server.title && !readTitle(handles).trim()) writeTitle(handles, server.title);
          writeContent(handles, merged);
        }
        showToast('הטיוטה נוספה');
        break;
      case 'delete': {
        const res = await sendToBackground({ type: 'DELETE_DRAFT', id: server.id });
        showToast(res.ok ? 'הטיוטה נמחקה' : 'מחיקה נכשלה');
        break;
      }
      case 'ignore':
      default:
        break;
    }
    // After we change the editor, the next debounced save will re-sync it.
    this.dirty = true;
  }

  private offerConflict(server: DecryptedDraft, mine: DraftContext): void {
    this.restoreModal.show(
      {
        title: server.title,
        content: server.content,
        deviceName: server.deviceName,
        serverUpdatedAt: server.serverUpdatedAt,
        hasExistingContent: true,
        heading: 'יש גרסה חדשה יותר בשרת',
        primaryLabel: 'השתמש בגרסת השרת',
      },
      (action) => {
        this.conflictPending = false; // resolved — re-enable auto-saving
        this.lastServerUpdatedAt = server.serverUpdatedAt;
        if (action === 'ignore') {
          // Keep my version: force-overwrite the server copy on next save.
          this.lastSentHash = null;
          this.lastServerUpdatedAt = null;
          void this.doSave();
        } else {
          void this.applyRestoreAction(action, server);
          void mine; // my context is superseded by the chosen action
        }
      },
    );
  }
}

async function main(): Promise<void> {
  await initLog();
  log.event('content:loaded', { url: location.pathname });
  new ContentController().start();
}

void main();
