# HANDOFF — continuation notes for the next agent

You are picking up work on **Mitmachim Draft Sync**. This file is your full
context — read it top to bottom. There is one feature in progress (described in
"PENDING TASK" below); everything else is built, deployed, and working.

> Secrets are NOT in this file (no SYNC_KEY_PEPPER, no Sync Key). This repo is
> **public** on GitHub, so never commit secrets or the user's Sync Key here.

---

## 1. What the project is

A monorepo (npm workspaces) that syncs **writing drafts** in the Mitmachim Top
forum (`https://mitmachim.top`, a **NodeBB** forum) across computers, **end-to-end
encrypted**. The forum's own drafts are local-only; this tool stores them
(encrypted) on a private server so they appear on the user's other computers.

- `server/` — TypeScript + Fastify 5 + better-sqlite3 + Zod. Auth via a **Sync
  Key** (`MTD-XXXX-XXXX-XXXX`, stored only as an HMAC-pepper hash). Drafts
  upsert/match/conflict/soft-delete, devices, health, migrations, rate limit,
  CORS, periodic cleanup. Entry `server/dist/index.js`.
- `extension/` — Chrome **MV3** (unpacked). Content script reads only the
  composer's title/content (never forum cookies/credentials/API). Background
  service worker does **AES-GCM-256 E2E encryption** (key = PBKDF2 of the Sync
  Key, never sent to the server) + offline queue. RTL Hebrew popup.
- The server stores only ciphertext + non-sensitive metadata (type, category
  id/name, topic type, topic/post ids, url, device name, timestamps). It never
  sees plaintext or the key.
- The user communicates in **Hebrew** — reply in Hebrew. All user-facing UI
  text is Hebrew/RTL.

---

## 2. Current state (DONE + working in production)

- **Server is LIVE** at `https://drafts-api.extsync.com` (HTTPS via Let's
  Encrypt). Health: `GET /health`. Two-computer sync works end-to-end (verified).
- **Extension v1.0.1** built and loaded; both computers connected.
- Implemented & deployed:
  - Sync Key create/login/logout, devices, offline queue + alarms retry.
  - Per-draft AES-GCM encryption; popup lists decrypted previews.
  - Restore-on-composer-open (restore modal: restore / append below / ignore /
    delete), basic conflict handling.
  - **Category + "סוג נושא" (topic type)** captured on new topics and synced
    (fields `categoryName`, `topicType`; DB migration #2). Shown in popup +
    restore prompt; re-applied on restore.
  - **Native-draft delete mirroring**: a watcher polls `localStorage`
    `drafts:available`; when the user discards/deletes/posts a forum draft, the
    matching synced draft is deleted (`DELETE_DRAFT_BY_CONTEXT`).
  - **Fixed API URL**: the extension always targets `https://drafts-api.extsync.com`
    (in `extension/src/config.ts` `DEFAULT_API_URL` + manifest host_permissions).
    The popup has **no** server-URL field anymore. `storage.getAuth()` forces this URL.
  - New brand **logo** (`extension/public/icons/logo.svg` + rendered PNGs).
  - Docs updated (README + docs/*), all Hebrew.

GitHub: `https://github.com/avraham12200540/mitmachim-draft-sync` (branch `main`).

---

## 3. Build / test / deploy

```bash
# from repo root
npm install
npm run build            # server (tsc) + extension (tsc --noEmit + esbuild)
npm run build:server
npm run build:extension  # outputs extension/dist  → load unpacked in chrome://extensions
npm run lint
```
- Server smoke test (needs a running server): `node server/scripts/smoke-test.mjs <baseUrl>`
- Extension crypto round-trip: `npx tsx extension/scripts/crypto.test.ts`
- Regenerate icons (after editing logo.svg): `npm i -D @resvg/resvg-js` then
  `node extension/scripts/render-icons.mjs`.

**Redeploy the server** (only if you change `server/`): the user runs, in the
droplet's web console:
```bash
cd ~/draftsync && git pull && npm run build:server && pm2 restart mds-server
```
Migrations run automatically on startup. The server is **co-hosted on the user's
existing droplet behind a Docker Caddy** — full infra specifics (IP, the Caddy
site block, the ufw rule that lets the Caddy container reach the app, etc.) are
in the user's private notes; **ask the user** if you need to touch the server.
The pending task below is **extension-only — no server change needed**.

You (the agent) **cannot SSH to the server**; give the user copy-paste commands
to run in the DigitalOcean web console, **one line at a time** (their console
mangles multi-block pastes). You also have outbound internet, so you can verify
from your side with `node -e "fetch('https://drafts-api.extsync.com/health')..."`.

---

## 4. PENDING TASK (this is what to work on)

The user wants synced drafts to become **real, usable drafts inside the forum**
on the receiving computer — not just live in the extension popup. Two parts:

1. **"סנכרן עכשיו" (sync-now) must materialize synced drafts as native forum
   drafts** so they appear in the forum's own drafts list (the pencil icon in
   the sidebar) and are **openable** in the editor.
2. **"פתח בפורום" (open-in-forum) must open the draft's editor window** (the
   composer with the draft loaded) — currently it only does
   `chrome.tabs.create({ url })`.

### What we already proved
- Content scripts CAN read/write the page's `localStorage` (same origin).
- Writing a draft into `localStorage` (`drafts:available` + a `composer:<id>:<ts>`
  entry) and reloading **does make it appear** in the forum's drafts list. ✅
- BUT clicking the injected draft **did not open the editor** — because the test
  draft had **no `cid`** (a new-topic draft with no category, so NodeBB couldn't
  open a composer). The real fix: include the real `cid`/`tid`/`pid` (we have
  them on every synced draft) and match the full native draft shape.

### YOUR FIRST STEP
Get the **exact full structure** of a real NodeBB draft (one the user created by
typing in the forum), so the injected object matches it field-for-field. Ask the
user to run this in the console on `mitmachim.top` and paste the output
(it also cleans up the earlier test draft):

```js
(() => {
  const ids = JSON.parse(localStorage.getItem('drafts:available')||'[]');
  const parsed = ids.map(id => { try { return {id, d: JSON.parse(localStorage.getItem(id))}; } catch { return null; } }).filter(Boolean);
  const test = parsed.find(p => /טיוטת בדיקה מהתוסף/.test(p.d.title||''));
  if (test) { localStorage.removeItem(test.id); localStorage.setItem('drafts:available', JSON.stringify(ids.filter(x=>x!==test.id))); console.log('cleaned test draft'); }
  const real = parsed.filter(p => !/טיוטת בדיקה/.test(p.d.title||'')).sort((a,b)=>JSON.stringify(b.d).length-JSON.stringify(a.d).length)[0];
  console.log('REAL DRAFT:', JSON.stringify(real?.d, null, 1));
})();
```

> If it prints `REAL DRAFT: undefined`, there is no native draft right now (this
> already happened once). First have the user **create one**: on mitmachim.top
> click "נושא חדש", choose a category, type a title + a sentence, wait ~2-3
> seconds for NodeBB to auto-save it as a draft (the pencil-icon count goes up),
> then run the snippet again. That guarantees a real draft to inspect.

### Then implement
- Add `materializeDraft(decrypted)` (likely in `extension/src/dom/nodebbDrafts.ts`)
  that builds the native draft object with ALL required fields (from the dump:
  at least `save_id`, `action`, `text`, `title`, `cid`/`tid`/`pid`, a timestamp,
  and whatever else the real draft carries), writes `localStorage[save_id]`, and
  appends `save_id` to `drafts:available` (dedupe by computed localDraftKey using
  the existing `nodebbDraftKey()` so you don't create duplicates of drafts the
  forum already has).
  - `action` map: topic→`topics.post`, reply→`posts.reply`, edit→`posts.edit`
    (already in `nodebbActionToType`, add the inverse).
- "סנכרן עכשיו": change the popup's sync button (currently sends `FLUSH_QUEUE`)
  to also tell the **content script** (on the active mitmachim.top tab) to pull
  all synced drafts (decrypted, via background `LIST_DRAFTS`/`GET_DRAFT`) and
  materialize the missing ones. The forum's list updates on **page reload** —
  verify with the user whether NodeBB picks them up live or a reload/UI-refresh
  is needed (it likely needs a reload or a NodeBB refresh hook). If a live UI
  refresh is needed, you may need a small **page-world** injected script to call
  NodeBB's drafts API (the content script's isolated world can't call page JS
  directly). **Verify the exact NodeBB behavior with the user before relying on it.**
- "פתח בפורום": after the draft is a native draft, open the forum and trigger
  NodeBB to open that draft's composer. Investigate (with the user) the cleanest
  trigger: clicking `[component="drafts/open"][data-save-id="..."]`, or NodeBB's
  compose route, or a page-world call. Test on the live forum.

Work **verify-first**: you can't load mitmachim.top yourself, so for every
NodeBB-DOM assumption, give the user a tiny console snippet, get the result, then
code. This approach has worked well all session.

---

## 5. NodeBB / mitmachim.top technical reference (verified)

**Composer** (`[component="composer"]`, has `data-uuid`):
- Title input: `[component="composer/title"]` (selectors in `extension/src/dom/selectors.ts`).
- Content textarea: `[component="composer/textarea"]` / `textarea.write`.
- Category selector (new topic): `[component="category-selector-selected"]` (name);
  list `[component="category/list"]` items carry `data-cid`.
- Topic type ("סוג נושא"): `[component="type/list"]`; current value shown on the
  adjacent `.dropdown-toggle`.

**Native drafts** (the feature target):
- `localStorage['drafts:available']` = JSON array of save-ids, e.g.
  `["composer:27709:1781529907122"]`.
- Each draft: `localStorage['composer:<n>:<ts>']` = JSON, observed shape:
  `{ "save_id":"composer:27709:<ts>", "action":"topics.post", "text":"...", "title":"...", ...(cid/tid/pid expected — confirm with the dump) }`.
- save-id format: `composer:<number>:<timestamp>`.
- Sidebar UI: `[component="sidebar/drafts"]` → `[component="drafts/list"]` →
  `.draft-item-container` with `[component="drafts/open"][data-save-id="..."]`;
  count badge `[component="drafts/count"]`.
- The existing watcher (`extension/src/dom/nodebbDrafts.ts`) already parses these
  and computes `localDraftKey` from `action`+`cid`/`tid`/`pid` — reuse it.

---

## 6. Key files

- `extension/src/content.ts` — composer detection, save/restore, the native-draft
  watcher wiring. The materialize trigger will live/route here.
- `extension/src/dom/nodebbDrafts.ts` — native draft parsing + watcher; add
  `materializeDraft()` and the action↔type inverse here.
- `extension/src/dom/editorAdapter.ts` — read/write composer, category/type.
- `extension/src/dom/selectors.ts` — all DOM selectors (update here if markup changes).
- `extension/src/background.ts` — message hub, encryption, API client, offline
  queue. Message protocol types in `extension/src/types.ts` (`BgRequest`/`BgResponse`).
- `extension/src/popup.ts` + `extension/public/popup.html` — the popup. "open in
  forum" = `chrome.tabs.create`, "sync now" = `FLUSH_QUEUE` (both change for this task).
- `server/src/...` — Fastify API (no change needed for this task). API contract
  in `docs/API.md`.

---

## 7. Gotchas / lessons from this session

- Content scripts share the page's `localStorage` and DOM (isolated JS world,
  same origin). They **cannot** call page-world JS (NodeBB's `app.*`) directly —
  use a page-injected `<script>` if you must call NodeBB internals.
- In async DOM event handlers, `e.currentTarget` becomes `null` after an `await`
  — capture it first. (Already fixed once in popup.ts.)
- API URL is fixed in code now — do not re-add a URL field.
- The user's DigitalOcean web console mangles multi-command pastes — give **one
  line at a time**, English in echoes (Hebrew-as-command lines error out).
- The server's Caddyfile is a **single-file bind mount that goes stale** — after
  editing it on the host you must `docker restart` the caddy container, not just
  `caddy reload`. (Server infra only — not needed for this task.)
- Verify NodeBB DOM behavior with a console snippet before coding against it.

---

## 8. How to resume

Greet the user in Hebrew, confirm you've read this handoff, then ask them to run
the **REAL DRAFT dump** snippet from section 4 and paste the result. From that,
implement the materialize + open-in-editor feature (extension-only), build
(`npm run build:extension`), have them reload the extension and test on
mitmachim.top, iterate, then commit + push.
