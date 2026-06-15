// ============================================================================
// Centralized DOM selectors for the Mitmachim Top (NodeBB) composer.
//
// Mitmachim Top runs NodeBB, whose markup can change between versions/themes.
// To stay resilient we keep ORDERED selector lists and try each in turn. If the
// composer stops being detected, update these lists first — see
// docs/TROUBLESHOOTING.md ("composer לא מזוהה").
// ============================================================================

/** Elements that represent an open composer (most specific first). */
export const COMPOSER_SELECTORS: string[] = [
  '[component="composer"]',
  '.composer',
  '.composer.resize',
  'form.composer',
  '[data-component="composer"]',
];

/** Title input within (or near) the composer. */
export const TITLE_SELECTORS: string[] = [
  '[component="composer/title"]',
  'input.title',
  'input[name="title"]',
  'input[placeholder*="כותרת"]',
  'input.form-control.title',
];

/** The main content editor — plain textarea (NodeBB default, markdown). */
export const CONTENT_TEXTAREA_SELECTORS: string[] = [
  '[component="composer/textarea"]',
  'textarea.write',
  'textarea.form-control.write',
  'textarea[name="content"]',
  'textarea',
];

/** Rich/contenteditable editor fallbacks (some themes/plugins use these). */
export const CONTENT_CONTENTEDITABLE_SELECTORS: string[] = [
  '[component="composer/textarea"][contenteditable="true"]',
  '.composer [contenteditable="true"]',
  'div.write[contenteditable="true"]',
  '[role="textbox"][contenteditable="true"]',
];

/** Submit/post button — used only to infer state, never clicked by us. */
export const SUBMIT_SELECTORS: string[] = [
  '[data-action="post"]',
  'button.composer-submit',
  'button[type="submit"]',
];

/** Attributes the composer container may expose carrying ids. */
export const ID_ATTRIBUTES = {
  cid: ['data-cid', 'data-category-id'],
  tid: ['data-tid', 'data-topic-id'],
  pid: ['data-pid', 'data-post-id'],
  action: ['data-action-type', 'data-action'],
} as const;

// ---------------------------------------------------------------------------
// New-topic extras: category selector + "סוג נושא" (topic type) selector.
// (Mitmachim/NodeBB markup — see docs/TROUBLESHOOTING.md to update.)
// ---------------------------------------------------------------------------

/** Element showing the currently selected category (its text is the name). */
export const CATEGORY_SELECTED_SELECTORS: string[] = [
  '[component="category-selector-selected"]',
  '.category-selector .category-name',
  '.category-name',
];

/** The category dropdown list + its selectable items (carry data-cid). */
export const CATEGORY_LIST_SELECTORS: string[] = [
  '[component="category/list"]',
  '.category-dropdown-menu',
];
export const CATEGORY_ITEM_SELECTORS: string[] = [
  '[data-cid]',
  'a.dropdown-item',
];

/** The toggle button that opens the category dropdown. */
export const CATEGORY_TOGGLE_SELECTORS: string[] = [
  '[component="category-selector"] .dropdown-toggle',
  '.category-dropdown-container .dropdown-toggle',
];

/** The topic-type ("סוג נושא") dropdown list + items. */
export const TYPE_LIST_SELECTORS: string[] = ['[component="type/list"]'];
export const TYPE_ITEM_SELECTORS: string[] = ['a.dropdown-item'];

/** Composer discard/trash button (deleting the draft from within the editor). */
export const COMPOSER_DISCARD_SELECTORS: string[] = [
  '[component="composer/discard"]',
  '[data-action="discard"]',
  '.composer .trash',
  '.composer [title*="מחק"]',
];

// ---------------------------------------------------------------------------
// Native forum drafts (sidebar) — used to detect when the user deletes a draft.
// ---------------------------------------------------------------------------

export const DRAFTS_LIST_SELECTORS: string[] = [
  '[component="drafts/list"]',
  '.draft-list',
];

/** A single draft row; carries data-save-id linking to localStorage. */
export const DRAFT_ITEM_SELECTORS: string[] = [
  '[component="drafts/open"]',
  '.draft-item-container [data-save-id]',
];

/** localStorage keys NodeBB uses for drafts. */
export const NODEBB_DRAFTS_AVAILABLE_KEY = 'drafts:available';
