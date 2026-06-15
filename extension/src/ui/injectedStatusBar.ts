import { getUiLayer } from './host';
import type { SaveStatus } from '../types';

const LABELS: Record<SaveStatus, string> = {
  idle: 'טיוטה מסונכרנת',
  saving: 'שומר...',
  saved: 'נשמר',
  offline: 'אין חיבור - נשמר מקומית',
  error: 'שגיאה בסנכרון',
  conflict: 'נמצאה גרסה חדשה יותר בשרת',
};

const DOT_CLASS: Record<SaveStatus, string> = {
  idle: '',
  saving: 'saving',
  saved: 'ok',
  offline: 'offline',
  error: 'error',
  conflict: 'offline',
};

/** A small, unobtrusive status pill shown while a composer is active. */
export class StatusBar {
  private el: HTMLElement | null = null;
  private dot: HTMLElement | null = null;
  private text: HTMLElement | null = null;
  private savedAt: number | null = null;
  private tickTimer: number | null = null;

  mount(): void {
    if (this.el && this.el.isConnected) return;
    const layer = getUiLayer();

    this.el = document.createElement('div');
    this.el.className = 'mds-statusbar';

    this.dot = document.createElement('span');
    this.dot.className = 'mds-dot';

    this.text = document.createElement('span');
    this.text.className = 'mds-text';
    this.text.textContent = LABELS.idle;

    this.el.append(this.dot, this.text);
    layer.appendChild(this.el);

    this.tickTimer = window.setInterval(() => this.refreshSavedLabel(), 5000);
  }

  setStatus(status: SaveStatus, detail?: string): void {
    if (!this.el) this.mount();
    if (this.dot) this.dot.className = `mds-dot ${DOT_CLASS[status]}`.trim();
    if (status === 'saved') this.savedAt = Date.now();
    if (this.text) this.text.textContent = detail ?? this.labelFor(status);
  }

  private labelFor(status: SaveStatus): string {
    if (status === 'saved' && this.savedAt) return this.savedAgoText();
    return LABELS[status];
  }

  private savedAgoText(): string {
    if (!this.savedAt) return LABELS.saved;
    const sec = Math.max(0, Math.round((Date.now() - this.savedAt) / 1000));
    if (sec < 3) return 'נשמר';
    if (sec < 60) return `נשמר לפני ${sec} שניות`;
    const min = Math.round(sec / 60);
    return `נשמר לפני ${min} דקות`;
  }

  private refreshSavedLabel(): void {
    if (this.savedAt && this.dot?.classList.contains('ok') && this.text) {
      this.text.textContent = this.savedAgoText();
    }
  }

  destroy(): void {
    if (this.tickTimer !== null) window.clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.el?.remove();
    this.el = null;
    this.dot = null;
    this.text = null;
    this.savedAt = null;
  }
}
