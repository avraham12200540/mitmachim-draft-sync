// Flexible adapter that reads from / writes to the composer editor. Tries the
// ordered selector lists in selectors.ts and dispatches the input/change events
// the forum's own JS listens for, so the site recognizes programmatic changes.

import {
  CATEGORY_SELECTED_SELECTORS,
  COMPOSER_SELECTORS,
  CONTENT_CONTENTEDITABLE_SELECTORS,
  CONTENT_TEXTAREA_SELECTORS,
  ID_ATTRIBUTES,
  TITLE_SELECTORS,
} from './selectors';
import { log } from '../log';

export interface EditorHandles {
  composer: HTMLElement;
  titleEl: HTMLInputElement | null;
  contentEl: HTMLElement | null;
  isContentEditable: boolean;
}

export interface ComposerIds {
  cid: string | null;
  tid: string | null;
  pid: string | null;
  action: string | null;
}

export function isVisible(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.offsetParent !== null) return true;
  const rects = el.getClientRects();
  return rects.length > 0;
}

function queryFirstVisible(root: ParentNode, selectors: string[]): HTMLElement | null {
  for (const sel of selectors) {
    const matches = root.querySelectorAll(sel);
    for (const el of Array.from(matches)) {
      if (isVisible(el)) return el as HTMLElement;
    }
  }
  // Fall back to the first match even if visibility detection failed.
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el instanceof HTMLElement) return el;
  }
  return null;
}

/** Returns all currently-open composer elements in the document. */
export function findComposers(): HTMLElement[] {
  const found = new Set<HTMLElement>();
  for (const sel of COMPOSER_SELECTORS) {
    document.querySelectorAll(sel).forEach((el) => {
      if (el instanceof HTMLElement && isVisible(el)) found.add(el);
    });
  }
  return Array.from(found);
}

/** Resolves the title + content editor inside a composer root. */
export function resolveEditor(composer: HTMLElement): EditorHandles | null {
  const titleEl = queryFirstVisible(composer, TITLE_SELECTORS) as HTMLInputElement | null;

  let contentEl = queryFirstVisible(composer, CONTENT_TEXTAREA_SELECTORS);
  let isContentEditable = false;
  if (!contentEl) {
    contentEl = queryFirstVisible(composer, CONTENT_CONTENTEDITABLE_SELECTORS);
    isContentEditable = !!contentEl;
  }

  if (!contentEl) {
    log.warn('editor:no-content-field', { hasTitle: !!titleEl });
    return null;
  }
  return { composer, titleEl, contentEl, isContentEditable };
}

export function readTitle(handles: EditorHandles): string {
  return handles.titleEl?.value ?? '';
}

export function readContent(handles: EditorHandles): string {
  if (handles.isContentEditable) return (handles.contentEl as HTMLElement).innerText ?? '';
  return (handles.contentEl as HTMLTextAreaElement).value ?? '';
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function fireEvents(el: HTMLElement): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}

export function writeTitle(handles: EditorHandles, text: string): void {
  if (!handles.titleEl) return;
  handles.titleEl.focus();
  setNativeValue(handles.titleEl, text);
  fireEvents(handles.titleEl);
}

export function writeContent(handles: EditorHandles, text: string): void {
  const el = handles.contentEl;
  if (!el) return;
  el.focus();
  if (handles.isContentEditable) {
    // Use innerText (not textContent) so newlines round-trip with readContent's
    // innerText read; textContent would collapse multi-line drafts to one line.
    el.innerText = text;
    fireEvents(el);
  } else {
    setNativeValue(el as HTMLTextAreaElement, text);
    fireEvents(el);
  }
}

function readAttr(el: HTMLElement, attrs: readonly string[]): string | null {
  for (const a of attrs) {
    const v = el.getAttribute(a);
    if (v) return v;
  }
  return null;
}

/** Best-effort extraction of ids from the composer markup (may be empty). */
export function readComposerIds(composer: HTMLElement): ComposerIds {
  // Check the composer element and any nested hidden inputs.
  const cid =
    readAttr(composer, ID_ATTRIBUTES.cid) ??
    (composer.querySelector('[name="cid"]') as HTMLInputElement | null)?.value ??
    null;
  const tid =
    readAttr(composer, ID_ATTRIBUTES.tid) ??
    (composer.querySelector('[name="tid"]') as HTMLInputElement | null)?.value ??
    null;
  const pid =
    readAttr(composer, ID_ATTRIBUTES.pid) ??
    (composer.querySelector('[name="pid"]') as HTMLInputElement | null)?.value ??
    null;
  const action = readAttr(composer, ID_ATTRIBUTES.action);
  return { cid, tid, pid, action };
}

const CATEGORY_PLACEHOLDER = /בחירת קטגוריה|בחר קטגוריה/;
const TYPE_PLACEHOLDER = /סוג\s*ה?נושא/;

/** Reads the human-readable name of the selected category (new-topic composer). */
export function readCategoryName(composer: HTMLElement): string | null {
  const el = queryFirstVisible(composer, CATEGORY_SELECTED_SELECTORS);
  const text = el?.innerText?.replace(/\s+/g, ' ').trim();
  if (!text || CATEGORY_PLACEHOLDER.test(text)) return null;
  return text;
}

function typeToggle(composer: HTMLElement): HTMLElement | null {
  const list = composer.querySelector('[component="type/list"]');
  if (!list) return null;
  const wrap = list.closest('.dropdown, .btn-group') ?? list.parentElement;
  return (wrap?.querySelector('.dropdown-toggle') as HTMLElement | null) ?? null;
}

/** Reads the selected "סוג נושא" (topic type) text, or null if none chosen. */
export function readTopicType(composer: HTMLElement): string | null {
  const toggle = typeToggle(composer);
  const text = toggle?.innerText?.replace(/\s+/g, ' ').trim();
  if (!text || TYPE_PLACEHOLDER.test(text)) return null;
  return text;
}

/** Best-effort: re-select a topic type by clicking the matching dropdown item. */
export function applyTopicType(composer: HTMLElement, type: string): boolean {
  const list = composer.querySelector('[component="type/list"]');
  if (!list) return false;
  const item = Array.from(list.querySelectorAll('a.dropdown-item')).find(
    (a) => (a as HTMLElement).innerText.replace(/\s+/g, ' ').trim() === type,
  ) as HTMLElement | undefined;
  if (!item) return false;
  item.click();
  return true;
}

/** Best-effort: re-select a category by cid (preferred) or visible name. */
export function applyCategory(
  composer: HTMLElement,
  cid: string | null,
  name: string | null,
): boolean {
  const list = composer.querySelector('[component="category/list"]') ?? composer;
  let item: HTMLElement | null = null;
  if (cid) item = list.querySelector(`[data-cid="${CSS.escape(cid)}"]`) as HTMLElement | null;
  if (!item && name) {
    item =
      (Array.from(list.querySelectorAll('a.dropdown-item, [data-cid]')).find(
        (el) => (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim() === name,
      ) as HTMLElement | undefined) ?? null;
  }
  if (!item) return false;
  item.click();
  return true;
}
