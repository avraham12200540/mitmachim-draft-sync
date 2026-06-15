// Shared Shadow DOM host for all injected UI. Using a shadow root isolates our
// styles from the forum's CSS (and vice versa). All UI is RTL/Hebrew.

const BASE_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.mds-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  direction: rtl;
  font-family: -apple-system, "Segoe UI", Arial, sans-serif;
  z-index: 2147483000;
}
.mds-layer > * { pointer-events: auto; }

:host {
  --mds-bg: #ffffff;
  --mds-fg: #1f2933;
  --mds-muted: #6b7280;
  --mds-border: #e2e6eb;
  --mds-accent: #2563eb;
  --mds-accent-fg: #ffffff;
  --mds-ok: #16a34a;
  --mds-warn: #d97706;
  --mds-err: #dc2626;
  --mds-shadow: 0 6px 24px rgba(0,0,0,.15);
}
@media (prefers-color-scheme: dark) {
  :host {
    --mds-bg: #1f2329;
    --mds-fg: #e6e8eb;
    --mds-muted: #9aa3ad;
    --mds-border: #353b43;
    --mds-accent: #3b82f6;
    --mds-shadow: 0 6px 24px rgba(0,0,0,.5);
  }
}

/* status bar */
.mds-statusbar {
  position: fixed;
  bottom: 16px;
  inset-inline-start: 16px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 320px;
  padding: 7px 12px;
  border-radius: 999px;
  background: var(--mds-bg);
  color: var(--mds-fg);
  border: 1px solid var(--mds-border);
  box-shadow: var(--mds-shadow);
  font-size: 13px;
  line-height: 1.3;
}
.mds-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--mds-muted); flex: 0 0 auto; }
.mds-dot.ok { background: var(--mds-ok); }
.mds-dot.saving { background: var(--mds-accent); animation: mds-pulse 1s ease-in-out infinite; }
.mds-dot.offline { background: var(--mds-warn); }
.mds-dot.error { background: var(--mds-err); }
.mds-statusbar .mds-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@keyframes mds-pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }

/* toast */
.mds-toasts {
  position: fixed;
  bottom: 64px;
  inset-inline-start: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mds-toast {
  background: var(--mds-fg);
  color: var(--mds-bg);
  padding: 9px 14px;
  border-radius: 8px;
  font-size: 13px;
  box-shadow: var(--mds-shadow);
  opacity: 0;
  transform: translateY(8px);
  transition: opacity .18s ease, transform .18s ease;
}
.mds-toast.show { opacity: 1; transform: translateY(0); }

/* restore bar / modal */
.mds-restore {
  position: fixed;
  bottom: 16px;
  inset-inline-end: 16px;
  width: min(380px, calc(100vw - 32px));
  background: var(--mds-bg);
  color: var(--mds-fg);
  border: 1px solid var(--mds-border);
  border-radius: 12px;
  box-shadow: var(--mds-shadow);
  padding: 14px;
}
.mds-restore h3 { margin: 0 0 4px; font-size: 14px; font-weight: 600; }
.mds-restore .mds-sub { margin: 0 0 8px; font-size: 12px; color: var(--mds-muted); }
.mds-restore .mds-preview {
  font-size: 12px; color: var(--mds-fg); background: rgba(127,127,127,.08);
  border-radius: 8px; padding: 8px; max-height: 96px; overflow: hidden;
  white-space: pre-wrap; word-break: break-word; margin-bottom: 10px;
}
.mds-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.mds-btn {
  appearance: none; border: 1px solid var(--mds-border); background: var(--mds-bg);
  color: var(--mds-fg); border-radius: 8px; padding: 6px 10px; font-size: 12.5px;
  cursor: pointer;
}
.mds-btn:hover { border-color: var(--mds-accent); }
.mds-btn.primary { background: var(--mds-accent); color: var(--mds-accent-fg); border-color: var(--mds-accent); }
.mds-btn.danger { color: var(--mds-err); }
.mds-close {
  position: absolute; inset-inline-start: 10px; top: 8px; background: none; border: none;
  color: var(--mds-muted); font-size: 16px; cursor: pointer; line-height: 1;
}
`;

let layer: HTMLElement | null = null;

/** Returns the shared layer element inside the shadow root, creating it once. */
export function getUiLayer(): HTMLElement {
  if (layer && layer.isConnected) return layer;

  const host = document.createElement('div');
  host.id = 'mds-ui-host';
  host.setAttribute('aria-hidden', 'false');
  (document.body || document.documentElement).appendChild(host);

  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = BASE_CSS;
  root.appendChild(style);

  layer = document.createElement('div');
  layer.className = 'mds-layer';
  root.appendChild(layer);
  return layer;
}
