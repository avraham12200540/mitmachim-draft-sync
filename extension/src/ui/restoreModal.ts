import { getUiLayer } from './host';
import { timeAgo, truncate } from '../format';

export type RestoreAction = 'restore' | 'append' | 'ignore' | 'delete';

export interface RestoreInfo {
  title: string;
  content: string;
  deviceName: string | null;
  serverUpdatedAt: string;
  hasExistingContent: boolean;
  /** Optional override heading (e.g. for the conflict variant). */
  heading?: string;
  /** Optional label for the primary (restore) button. */
  primaryLabel?: string;
}

/** A non-blocking restore bar pinned to the corner of the screen. */
export class RestoreModal {
  private el: HTMLElement | null = null;

  show(info: RestoreInfo, onAction: (action: RestoreAction) => void): void {
    this.hide();
    const layer = getUiLayer();

    const box = document.createElement('div');
    box.className = 'mds-restore';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'שחזור טיוטה');

    const close = document.createElement('button');
    close.className = 'mds-close';
    close.textContent = '✕';
    close.title = 'התעלם';
    close.addEventListener('click', () => {
      onAction('ignore');
      this.hide();
    });

    const heading = document.createElement('h3');
    const device = info.deviceName ? ` מהמכשיר "${info.deviceName}"` : '';
    heading.textContent = info.heading ?? `נמצאה טיוטה שמורה${device}`;

    const sub = document.createElement('p');
    sub.className = 'mds-sub';
    sub.textContent = `עודכנה ${timeAgo(info.serverUpdatedAt)}`;

    const preview = document.createElement('div');
    preview.className = 'mds-preview';
    const previewText = [info.title, info.content].filter(Boolean).join('\n');
    preview.textContent = truncate(previewText, 220) || '(ללא תוכן להצגה)';

    const actions = document.createElement('div');
    actions.className = 'mds-actions';

    const restoreLabel = info.primaryLabel ?? (info.hasExistingContent ? 'שחזר (יחליף)' : 'שחזר');
    const restoreBtn = this.button(restoreLabel, 'primary', () => {
      if (info.hasExistingContent && !confirm('שחזור יחליף את מה שכתבת בעורך. להמשיך?')) return;
      onAction('restore');
      this.hide();
    });

    const appendBtn = this.button('הוסף מתחת למה שכתבתי', '', () => {
      onAction('append');
      this.hide();
    });

    const ignoreBtn = this.button('התעלם', '', () => {
      onAction('ignore');
      this.hide();
    });

    const deleteBtn = this.button('מחק טיוטה', 'danger', () => {
      if (!confirm('למחוק את הטיוטה השמורה לצמיתות?')) return;
      onAction('delete');
      this.hide();
    });

    actions.append(restoreBtn, appendBtn, ignoreBtn, deleteBtn);
    box.append(close, heading, sub, preview, actions);
    layer.appendChild(box);
    this.el = box;
  }

  private button(label: string, variant: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `mds-btn ${variant}`.trim();
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  hide(): void {
    this.el?.remove();
    this.el = null;
  }

  get isOpen(): boolean {
    return !!this.el && this.el.isConnected;
  }
}
