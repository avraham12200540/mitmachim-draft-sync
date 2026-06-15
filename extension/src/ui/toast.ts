import { getUiLayer } from './host';

let container: HTMLElement | null = null;

function getContainer(): HTMLElement {
  if (container && container.isConnected) return container;
  const layer = getUiLayer();
  container = document.createElement('div');
  container.className = 'mds-toasts';
  layer.appendChild(container);
  return container;
}

/** Shows a transient toast (Hebrew text expected). */
export function showToast(message: string, durationMs = 2600): void {
  const el = document.createElement('div');
  el.className = 'mds-toast';
  el.textContent = message;
  getContainer().appendChild(el);

  requestAnimationFrame(() => el.classList.add('show'));
  window.setTimeout(() => {
    el.classList.remove('show');
    window.setTimeout(() => el.remove(), 220);
  }, durationMs);
}
