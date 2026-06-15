// Watches a dynamic NodeBB single-page app for composer open/close and URL
// changes, without depending on full page reloads.

import { findComposers } from './editorAdapter';
import { log } from '../log';

export interface ComposerWatcherHandlers {
  onComposerOpen: (composer: HTMLElement) => void;
  onComposerClose: () => void;
  onUrlChange: (url: string) => void;
}

export class ComposerWatcher {
  private observer: MutationObserver | null = null;
  private urlTimer: number | null = null;
  private scheduled = false;
  private currentComposer: HTMLElement | null = null;
  private lastUrl = location.href;

  constructor(private readonly handlers: ComposerWatcherHandlers) {}

  start(): void {
    this.observer = new MutationObserver(() => this.scheduleScan());
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // NodeBB swaps content via ajaxify without a real navigation, so poll the
    // URL as a cheap, reliable change signal in addition to popstate.
    window.addEventListener('popstate', () => this.checkUrl());
    this.urlTimer = window.setInterval(() => this.checkUrl(), 1000);

    this.scan();
    log.event('composer:watcher-started');
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.urlTimer !== null) window.clearInterval(this.urlTimer);
    this.urlTimer = null;
  }

  /** Forces a re-scan (e.g. after restoring a draft). */
  rescan(): void {
    this.scan();
  }

  private checkUrl(): void {
    if (location.href !== this.lastUrl) {
      this.lastUrl = location.href;
      log.event('url:changed', { url: location.pathname });
      this.handlers.onUrlChange(location.href);
      // A URL change usually means the composer context changed too.
      this.scheduleScan();
    }
  }

  private scheduleScan(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    // Coalesce bursts of mutations into a single scan on the next frame.
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.scan();
    });
  }

  private scan(): void {
    const composers = findComposers();
    const composer = composers[0] ?? null;

    if (composer && composer !== this.currentComposer) {
      this.currentComposer = composer;
      log.event('composer:detected', { count: composers.length });
      this.handlers.onComposerOpen(composer);
    } else if (!composer && this.currentComposer) {
      this.currentComposer = null;
      log.event('composer:closed');
      this.handlers.onComposerClose();
    }
  }
}
