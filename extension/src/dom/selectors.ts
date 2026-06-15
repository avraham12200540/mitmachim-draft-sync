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
