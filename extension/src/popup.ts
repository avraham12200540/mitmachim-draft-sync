// Popup UI logic (RTL Hebrew). Talks only to the background worker, except for
// reading the locally-stored Sync Key when the user explicitly copies/reveals it.

import { sendToBackground } from './messaging';
import { getAuth } from './storage';
import { timeAgo, truncate, TYPE_LABEL } from './format';
import type { AuthStatus, BgResponse, DecryptedDraftSummary } from './types';

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

let keyRevealed = false;

function showError(id: string, message: string | null): void {
  const el = $(id);
  el.textContent = message ?? '';
  el.classList.toggle('hidden', !message);
}

async function getStatus(): Promise<AuthStatus | null> {
  const res = await sendToBackground({ type: 'GET_STATUS' });
  if (res.ok && 'status' in res) return res.status;
  return null;
}

function setConnPill(connected: boolean): void {
  const pill = $('conn-pill');
  pill.textContent = connected ? 'מחובר' : 'לא מחובר';
  pill.className = `pill ${connected ? 'ok' : 'off'}`;
}

async function render(): Promise<void> {
  const status = await getStatus();
  const connected = !!status?.connected;
  setConnPill(connected);

  $('screen-disconnected').classList.toggle('hidden', connected);
  $('screen-connected').classList.toggle('hidden', !connected);

  if (!status) return;

  if (connected) {
    await renderConnected(status);
  }
}

async function renderConnected(status: AuthStatus): Promise<void> {
  $('masked-key').textContent = keyRevealed
    ? (await getAuth()).syncKey ?? status.syncKeyMasked ?? '—'
    : status.syncKeyMasked ?? '—';
  $('btn-toggle-key').textContent = keyRevealed ? 'הסתר' : 'הצג';

  const badge = $('pending-badge');
  if (status.pendingCount > 0) {
    badge.textContent = `${status.pendingCount} ממתינות לסנכרון`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  ($('debug-toggle') as HTMLInputElement).checked = status.debug;
  await loadDrafts();
}

async function loadDrafts(): Promise<void> {
  showError('conn-error', null);
  const list = $('drafts-list');
  list.replaceChildren();
  const empty = $('drafts-empty');
  empty.classList.add('hidden');

  const res = await sendToBackground({ type: 'LIST_DRAFTS' });
  if (!res.ok) {
    showError('conn-error', res.error === 'not_connected' ? '' : 'שגיאה בטעינת טיוטות');
    return;
  }
  if (!('drafts' in res)) return;
  const drafts = res.drafts;
  if (drafts.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  for (const d of drafts) list.appendChild(renderDraft(d));
}

function renderDraft(d: DecryptedDraftSummary): HTMLElement {
  const card = document.createElement('div');
  card.className = 'draft';

  const row1 = document.createElement('div');
  row1.className = 'row1';
  const type = document.createElement('span');
  type.className = 'type';
  type.textContent = TYPE_LABEL[d.type];
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = d.title?.trim() || 'ללא כותרת';
  row1.append(title, type);

  const preview = document.createElement('div');
  preview.className = 'preview';
  preview.textContent = truncate(d.preview, 140) || '(ללא תוכן)';

  const meta = document.createElement('div');
  meta.className = 'meta';
  const when = document.createElement('span');
  when.textContent = `עודכן ${timeAgo(d.serverUpdatedAt)}`;
  meta.append(when);
  if (d.categoryName) {
    const cat = document.createElement('span');
    cat.textContent = `קטגוריה: ${d.categoryName}`;
    meta.append(cat);
  }
  if (d.topicType) {
    const tt = document.createElement('span');
    tt.textContent = `סוג: ${d.topicType}`;
    meta.append(tt);
  }
  if (d.deviceName) {
    const dev = document.createElement('span');
    dev.textContent = `מכשיר: ${d.deviceName}`;
    meta.append(dev);
  }

  const actions = document.createElement('div');
  actions.className = 'actions';
  if (d.url) {
    const open = btn('פתח בפורום', 'small', () => chrome.tabs.create({ url: d.url! }));
    actions.append(open);
  }
  const copy = btn('העתק תוכן', 'small', async (b) => {
    const res = await sendToBackground({ type: 'GET_DRAFT', id: d.id });
    if (res.ok && 'draft' in res && res.draft) {
      await navigator.clipboard.writeText(res.draft.content);
      flash(b, 'הועתק ✓');
    } else {
      flash(b, 'שגיאה');
    }
  });
  const del = btn('מחק', 'small danger', async () => {
    if (!confirm('למחוק את הטיוטה?')) return;
    const res = await sendToBackground({ type: 'DELETE_DRAFT', id: d.id });
    if (res.ok) card.remove();
  });
  actions.append(copy, del);

  card.append(row1, preview, meta, actions);
  return card;
}

function btn(
  label: string,
  cls: string,
  onClick: (self: HTMLButtonElement) => void,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `btn ${cls}`;
  b.textContent = label;
  b.addEventListener('click', () => onClick(b));
  return b;
}

function flash(b: HTMLButtonElement | null, text: string): void {
  if (!b) return;
  const prev = b.textContent;
  b.textContent = text;
  b.disabled = true;
  window.setTimeout(() => {
    b.textContent = prev;
    b.disabled = false;
  }, 1200);
}

function busy(b: HTMLButtonElement, on: boolean): void {
  b.disabled = on;
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

function wire(): void {
  $('btn-create').addEventListener('click', async () => {
    const b = $('btn-create') as HTMLButtonElement;
    showError('disc-error', null);
    busy(b, true);
    const deviceName = ($('device-name') as HTMLInputElement).value.trim() || undefined;
    const res = await sendToBackground({ type: 'CREATE_SYNC_KEY', deviceName });
    busy(b, false);
    if (res.ok && 'syncKey' in res) {
      keyRevealed = true; // reveal once so the user can save it
      await render();
      alert(`קוד הסנכרון שלך:\n\n${res.syncKey}\n\nשמרו אותו במקום בטוח. הוא מוצג פעם אחת בלבד ולא ניתן לשחזר אותו.`);
    } else {
      showError('disc-error', errMsg(res, 'יצירת הקוד נכשלה. בדקו את כתובת השרת.'));
    }
  });

  $('btn-login').addEventListener('click', async () => {
    const b = $('btn-login') as HTMLButtonElement;
    showError('disc-error', null);
    const syncKey = ($('sync-key-input') as HTMLInputElement).value.trim();
    if (!syncKey) {
      showError('disc-error', 'יש להזין קוד סנכרון.');
      return;
    }
    busy(b, true);
    const deviceName = ($('device-name') as HTMLInputElement).value.trim() || undefined;
    const res = await sendToBackground({ type: 'LOGIN', syncKey, deviceName });
    busy(b, false);
    if (res.ok) await render();
    else showError('disc-error', errMsg(res, 'ההתחברות נכשלה. ודאו שהקוד נכון.'));
  });

  $('btn-copy-key').addEventListener('click', async (e) => {
    // Capture the button now: after an await, e.currentTarget becomes null.
    const b = e.currentTarget as HTMLButtonElement;
    const auth = await getAuth();
    if (auth.syncKey) {
      await navigator.clipboard.writeText(auth.syncKey);
      flash(b, 'הועתק ✓');
    }
  });

  $('btn-toggle-key').addEventListener('click', async () => {
    keyRevealed = !keyRevealed;
    const status = await getStatus();
    if (status) await renderConnected(status);
  });

  $('btn-logout').addEventListener('click', async () => {
    if (!confirm('להתנתק מהמכשיר? הטיוטות יישארו בשרת, אך תצטרכו את קוד הסנכרון כדי להתחבר שוב.'))
      return;
    keyRevealed = false;
    await sendToBackground({ type: 'LOGOUT' });
    await render();
  });

  $('btn-refresh').addEventListener('click', () => void render());

  $('btn-sync-now').addEventListener('click', async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    busy(b, true);
    await sendToBackground({ type: 'FLUSH_QUEUE' });
    busy(b, false);
    await render();
  });

  $('debug-toggle').addEventListener('change', async (e) => {
    const enabled = (e.currentTarget as HTMLInputElement).checked;
    await sendToBackground({ type: 'SET_DEBUG', enabled });
  });
}

function errMsg(res: BgResponse, fallback: string): string {
  if (!res.ok && res.error) {
    if (res.error === 'INVALID_SYNC_KEY' || res.error.includes('INVALID_SYNC_KEY')) {
      return 'קוד הסנכרון שגוי.';
    }
    if (res.error === 'network') {
      return 'לא ניתן להגיע לשרת. בדקו את החיבור לאינטרנט ונסו שוב.';
    }
  }
  return fallback;
}

wire();
void render();
