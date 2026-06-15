# פתרון תקלות — Mitmachim Draft Sync

מדריך זה מרכז את התקלות הנפוצות בתוסף ובשרת, עם צעדים מעשיים לאבחון ולתיקון.
לכל תקלה יש תת‑פרק נפרד. רצוי לקרוא קודם את הפרק "[הדלקת debug mode וצפייה בלוגי `[MDS]`](#הדלקת-debug-mode-וצפייה-בלוגי-mds)" — רוב האבחונים נשענים על הלוגים האלה.

> מוסכמות: שורות פקודה, נתיבי קבצים, שמות משתני סביבה ו‑URLs נשארים באנגלית (LTR) בתוך בלוקי קוד.

---

## התוסף לא מופיע

התוסף הוא Chrome Manifest V3 unpacked. אם הוא לא מופיע בשורת הכלים או בעמוד התוספים:

1. ודאו שהוא נבנה. יעד הטעינה (**Load unpacked**) הוא תיקיית `extension/dist`, **לא** `extension/src`:
   ```bash
   npm run build:extension
   ```
   הפלט אמור להיכתב ל‑`extension/dist` (כולל `manifest.json`, `background.js`, `popup.html` וכו').
2. בכרום פתחו `chrome://extensions`, הדליקו **Developer mode** (פינה ימנית עליונה), ולחצו **Load unpacked** → בחרו את `extension/dist`.
3. אם התוסף כבר טעון אך לא מתעדכן אחרי build — לחצו על כפתור הרענון (⟳) בכרטיס התוסף ב‑`chrome://extensions`.
4. בדקו שאין שגיאות טעינה: בכרטיס התוסף, אם מופיע כפתור **Errors** (אדום) — לחצו עליו וקראו את ההודעה. שגיאת מניפסט תמנע טעינה לגמרי.
5. אם האייקון "נעלם" — ייתכן שהוא רק מוסתר. לחצו על אייקון הפאזל (Extensions) בשורת הכלים ונעצו את "Mitmachim Draft Sync".
6. ודאו שאתם בכרום (או דפדפן Chromium) שתומך ב‑MV3. התוסף לא ייטען בפיירפוקס.

---

## אין שמירה

הטיוטה לא נשמרת אל השרת. אבחון לפי סדר:

1. **האם אתם בכלל בעמוד הנכון?** ה‑content script רץ רק על `https://mitmachim.top/*`. בעמוד אחר לא תהיה שמירה.
2. **האם ה‑composer מזוהה?** ראו "[composer לא מזוהה](#composer-לא-מזוהה)". בלי זיהוי ה‑composer אין מה לשמור.
3. **האם הטקסט משמעותי?** טיוטה קצרה מ‑`MIN_MEANINGFUL_CHARS` (2 תווים אחרי trim) נחשבת ריקה ולא נשמרת — זו התנהגות מכוונת.
4. **תזמון:** השמירה אינה מיידית. יש debounce של `1500ms` אחרי ההקלדה האחרונה (`TIMING.saveDebounceMs`), ושמירה כפויה תקופתית כל `30s` (`TIMING.periodicSaveMs`). חכו רגע אחרי שהפסקתם להקליד.
5. **האם מחוברים?** ללא token תקף השמירה תיכשל. ראו "[\"לא מחובר\"](#לא-מחובר)".
6. **האם השרת זמין?** אם השרת לא עונה, השמירה נכנסת ל‑offline queue ותישלח שוב כל ~2 דקות (`chrome.alarms`). ראו "[API לא זמין](#api-לא-זמין)".
7. הדליקו debug mode ובדקו ב‑**service worker console** של ה‑background אם מופיעות שורות `[MDS]` של שמירה/שגיאה. שם תראו אם הבקשה נשלחה ומה החזיר השרת (למשל `PAYLOAD_TOO_LARGE` כשהתוכן עובר 100KB, או `VALIDATION`).

---

## "לא מחובר"

הפופאפ מציג שאינכם מחוברים, או שכל פעולה מחזירה `UNAUTHORIZED` / `401`.

1. פתחו את הפופאפ. אם אין Sync Key — צרו אחד (**create-sync-key**) או התחברו עם Sync Key קיים (**login**). שימו לב: ה‑Sync Key מוצג **פעם אחת בלבד** בעת היצירה — שמרו אותו.
2. ה‑token והמפתח נשמרים ב‑`chrome.storage.local` תחת המפתח `mds.auth`. אם ניקיתם את נתוני התוסף / "Clear browsing data" — תצטרכו להתחבר מחדש.
3. ה‑token פג אחרי `TOKEN_TTL_DAYS` (ברירת מחדל 365 יום) או אם בוצע **logout** (שמבטל את ה‑token והמכשיר). במקרה כזה התחברו מחדש מהפופאפ.
4. אם התחברתם אך עדיין מקבלים `401` — ייתכן שה‑token בוטל בצד השרת (logout ממכשיר אחר על אותו מכשיר, או revoke). התחברו שוב.
5. בדקו ב‑service worker console (`[MDS]`) האם הבקשות יוצאות עם כותרת `Authorization: Bearer ...`. אם לא — אין token שמור; חזרו לשלב 1.

---

## API לא זמין

התוסף לא מצליח להגיע לשרת (timeouts, "Failed to fetch", או הכל נכנס לתור).

1. ודאו מה כתובת ה‑API שהתוסף משתמש בה:
   - ברירת המחדל המהודרת היא `DEFAULT_API_URL` ב‑`extension/src/config.ts` (`https://drafts-api.example.com` — placeholder, **לא שרת אמיתי**).
   - אפשר לדרוס אותה בשדה ה‑"advanced" בפופאפ; הערך נשמר ב‑`chrome.storage.local`.
2. אם אתם משתמשים בשרת אמיתי, ודאו שהכתובת מצביעה אליו (למשל `https://drafts-api.example.com` או הדומיין שלכם), ולא ל‑placeholder.
3. בדקו שהשרת חי עם `/health` — ראו "[בדיקת `/health` עם curl](#בדיקת-health-עם-curl)".
4. ודאו ש‑host permission ניתן לכתובת. אם הזנתם URL מותאם בפופאפ, התוסף מבקש הרשאת host בזמן ריצה (`optional_host_permissions: https://*/*`). אם דחיתם את הבקשה — הקריאות ייכשלו. הזינו את הכתובת שוב ואשרו את ההרשאה.
5. אם השרת זמין אבל הקריאות עדיין נכשלות — בדקו CORS ("[שגיאות CORS](#שגיאות-cors)") ו‑HTTPS/תעודה ("[בעיות HTTPS/תעודה](#בעיות-httpsתעודה)").
6. כל עוד השרת לא זמין, הטיוטות נשמרות ב‑offline queue (`mds.pendingQueue`) ונשלחות שוב אוטומטית כל ~2 דקות. אין צורך לשמור ידנית.

בצד השרת, ודאו שהתהליך רץ ומאזין:
```bash
pm2 status
pm2 logs
ss -ltnp | grep 3001
```
השרת מאזין כברירת מחדל על `127.0.0.1:3001` (`HOST`/`PORT`), מאחורי Nginx.

---

## שגיאות CORS

הקונסול מציג שגיאה כמו `blocked by CORS policy` / `No 'Access-Control-Allow-Origin' header`.

1. מקור הבקשה של התוסף הוא `chrome-extension://<id>`. השרת חייב להתיר אותו. הוסיפו את ה‑origin של התוסף ל‑`CORS_EXTRA_ORIGINS` ב‑`server/.env`:
   ```ini
   CORS_EXTRA_ORIGINS=chrome-extension://<your-extension-id>
   ```
   את ה‑`<your-extension-id>` תמצאו ב‑`chrome://extensions` בכרטיס התוסף. אפשר לרשום כמה origins מופרדים בפסיק.
2. אחרי שינוי ב‑`.env` הפעילו מחדש את השרת:
   ```bash
   pm2 restart all
   ```
3. אם Nginx באמצע — ודאו שהוא **לא** מוחק/משכפל כותרות `Access-Control-*`. בדרך כלל עדיף לתת ל‑Fastify לטפל ב‑CORS ולא להוסיף `add_header` כפול ב‑Nginx (כפילות שוברת את הדפדפן).
4. בקשת preflight (`OPTIONS`) חייבת לחזור `2xx`. בדקו:
   ```bash
   curl -i -X OPTIONS https://drafts-api.example.com/api/drafts \
     -H "Origin: chrome-extension://<your-extension-id>" \
     -H "Access-Control-Request-Method: POST"
   ```
   צפו לכותרות `Access-Control-Allow-Origin` תואמות.

---

## בעיות HTTPS/תעודה

קריאות נכשלות עם `ERR_CERT_*`, "Your connection is not private", או הדפדפן חוסם תוכן מעורב.

1. כתובת ה‑API חייבת להיות `https://` (גם המניפסט וגם host_permissions בנויים סביב HTTPS). `http://` לא יעבוד מתוך עמוד מאובטח.
2. בדקו את התעודה מהשרת עצמו:
   ```bash
   curl -vI https://drafts-api.example.com/health
   ```
   חפשו `SSL certificate verify ok`. אם יש `certificate has expired` — חדשו את התעודה.
3. חידוש/הנפקה עם certbot (Let's Encrypt):
   ```bash
   sudo certbot renew --dry-run
   sudo certbot renew
   sudo systemctl reload nginx
   ```
4. ודאו שהדומיין ב‑URL תואם ל‑Common Name/SAN בתעודה. תעודה ל‑`drafts-api.example.com` לא תתאים לכתובת IP או לדומיין אחר.
5. תעודות self-signed לא יעבדו מול הדפדפן ללא הוספה ידנית למאגר האמון. בפרודקשן השתמשו ב‑Let's Encrypt.
6. אחרי תיקון התעודה, רעננו את ה‑service worker (כפתור ⟳ ב‑`chrome://extensions`) כדי לאפס חיבורים תקועים.

---

## composer לא מזוהה

mitmachim.top רץ על NodeBB, וה‑markup שלו עשוי להשתנות בין גרסאות/ערכות נושא. אם התוסף מפסיק לזהות את ה‑composer (אין שמירה, אין שחזור), הסיבה הנפוצה היא שהסלקטורים כבר לא תואמים ל‑DOM.

### אבחון
1. פתחו composer חדש ב‑mitmachim.top (פתיחת נושא / תגובה).
2. הדליקו debug mode ובדקו ב‑**console של הדף** (לא של ה‑service worker) אם מופיעות שורות `[MDS]` שמדווחות על אי‑זיהוי composer.
3. פתחו DevTools (F12) → **Elements**, ובדקו מהם ה‑class/attribute האמיתיים של אלמנט ה‑composer, שדה הכותרת, ואזור התוכן.

### עדכון הסלקטורים
כל הסלקטורים מרוכזים בקובץ `extension/src/dom/selectors.ts`. הם רשימות **מסודרות** (ordered fallback) — התוסף מנסה כל סלקטור לפי הסדר ועוצר בראשון שמתאים. כדי לתקן, הוסיפו את הסלקטור החדש **בראש הרשימה הרלוונטית**:

- `COMPOSER_SELECTORS` — מיכל ה‑composer.
- `TITLE_SELECTORS` — שדה הכותרת.
- `CONTENT_TEXTAREA_SELECTORS` — אזור התוכן כ‑`textarea` (ברירת המחדל של NodeBB, markdown).
- `CONTENT_CONTENTEDITABLE_SELECTORS` — עורך עשיר/`contenteditable` (ערכות נושא/תוספים מסוימים).
- `SUBMIT_SELECTORS` — כפתור השליחה (משמש רק להסקת מצב; התוסף **לא** לוחץ עליו).
- `ID_ATTRIBUTES` — אטריביוטים שנושאים מזהים (`cid`/`tid`/`pid`). עדכנו אם NodeBB משנה את שמות ה‑data attributes.

דוגמה — אם הזיהוי של ה‑composer נשבר ומצאתם ב‑DOM שהמיכל הוא עכשיו `.composer-modal`, הוסיפו אותו בראש:
```ts
export const COMPOSER_SELECTORS: string[] = [
  '.composer-modal',        // ← חדש, נוסף בראש
  '[component="composer"]',
  '.composer',
  // ...
];
```

> טיפ: אל תמחקו את הסלקטורים הישנים — השאירו אותם בהמשך הרשימה כ‑fallback למשתמשים על גרסאות ישנות.

### בנייה מחדש וטעינה
אחרי עריכת הקובץ:
```bash
npm run build:extension
```
או בזמן פיתוח, watch אוטומטי:
```bash
npm run watch:extension
```
ואז ב‑`chrome://extensions` לחצו ⟳ (Reload) על כרטיס התוסף, ורעננו את עמוד mitmachim.top.

---

## טיוטה לא משתחזרת

פתחתם composer אבל הטיוטה השמורה לא נטענת אוטומטית.

1. ודאו שאתם **מחוברים** ושכתובת ה‑API נכונה (ראו "[\"לא מחובר\"](#לא-מחובר)" ו‑"[API לא זמין](#api-לא-זמין)"). בלי חיבור אין מאיפה לשחזר.
2. ודאו שה‑composer **מזוהה** — אם הוא לא מזוהה, אין לאן להזריק את התוכן. ראו "[composer לא מזוהה](#composer-לא-מזוהה)".
3. השחזור מבוסס על התאמת קונטקסט (`GET /api/drafts/match`). סדר ההעדפה: `postId` (edit) → `topicId` (reply) → `localDraftKey` → `categoryId+type` (topic). אם פתחתם composer בקונטקסט אחר (למשל נושא אחר) — לא תימצא התאמה, וזה תקין.
4. אם הטיוטה קיימת בשרת אבל לא מפוענחת — זו בעיית הצפנה, לא שחזור. ראו "[הצפנה — \"לא ניתן לפענח\"](#הצפנה--לא-ניתן-לפענח)".
5. בדקו ב‑service worker console (`[MDS]`) אם קריאת ה‑match חזרה עם `draft: null` (אין התאמה) או עם draft שנכשל בפענוח.
6. ודאו שהטיוטה לא נמחקה. מחיקה רכה (`deletedAt`) מסתירה אותה מהשחזור; טיוטות מנותקות מטוהרות לצמיתות אחרי `PURGE_DELETED_AFTER_DAYS` (ברירת מחדל 30 יום).

---

## מחשב שני לא רואה טיוטות

חיברתם מכשיר נוסף אבל הוא לא רואה את הטיוטות מהמחשב הראשון.

1. **אותו Sync Key.** שני המכשירים חייבים להיות מחוברים לאותו משתמש. במחשב השני בצעו **login** עם **אותו ה‑Sync Key בדיוק** שבו משתמש המחשב הראשון (פורמט `MTD-XXXX-XXXX-XXXX`). יצירת Sync Key חדש (**create-sync-key**) יוצרת **משתמש נפרד** עם טיוטות נפרדות — זו הטעות הנפוצה ביותר.
2. **אותה כתובת שרת.** ודאו ששני המכשירים מצביעים לאותו `API URL` (אותו `DEFAULT_API_URL` או אותו ערך שהוזן בשדה ה‑"advanced" בפופאפ). שני שרתים = שני מאגרים נפרדים.
3. בדקו תחת **Devices** (`GET /api/devices`) שהמכשיר השני אכן מופיע כמכשיר של אותו משתמש.
4. הסנכרון אינו בזמן אמת מיידי — המכשיר השני מושך טיוטות כשנפתח composer/בעת סנכרון. רעננו את עמוד mitmachim.top במחשב השני.
5. אם המכשיר השני **רואה** את הטיוטה אך לא מצליח לקרוא אותה — זו בעיית הצפנה (Sync Key לא תואם בפענוח). ראו את הפרק הבא.

---

## הצפנה — "לא ניתן לפענח"

הטיוטה מגיעה מהשרת אבל הפענוח נכשל (התוכן ריק/משובש או מופיעה שגיאת decrypt).

הסיבה כמעט תמיד אחת: **המפתח שונה**. המפתח נגזר מה‑Sync Key (PBKDF2‑SHA256, 100,000 iterations, salt קבוע `MDS|pbkdf2|v1`). הצפנה היא AES‑GCM‑256, וכל שדה הוא מעטפה עצמאית `1.<base64url(iv)>.<base64url(ciphertext+tag)>`. השרת אף פעם לא רואה את המפתח או את הטקסט הגלוי — הוא רק מאחסן מחרוזות אטומות.

1. **ודאו שזה אותו Sync Key.** אם הצפנתם טיוטה עם Sync Key אחד ואתם מנסים לפענח עם אחר (למשל יצרתם Sync Key חדש במקום login עם הקיים), הפענוח **חייב** להיכשל — המפתח שונה. השרת אינו יכול לעזור: הוא לא מחזיק את המפתח.
2. אם איבדתם את ה‑Sync Key המקורי — **אין דרך לשחזר** את הטיוטות המוצפנות. זה מובנה במודל ה‑zero-knowledge. הפתרון היחיד הוא להתחיל מחדש עם Sync Key חדש (הטיוטות הישנות יישארו לא קריאות).
3. ודאו עקביות: כל המכשירים שאמורים לקרוא את הטיוטה צריכים את אותו Sync Key בדיוק (כולל מקפים ואותיות — הפורמט base32 ללא תווים דו‑משמעיים).
4. ב‑service worker console (`[MDS]`) חפשו שגיאת decrypt. שימו לב: הלוגים **לעולם לא** מכילים את הטקסט המלא של הטיוטה ולא את המפתח.

---

## הדלקת debug mode וצפייה בלוגי `[MDS]`

מצב debug מוסיף לוגים מפורטים (מסומנים בקידומת `[MDS]`) בלי לחשוף לעולם את הטקסט המלא של הטיוטה.

### הדלקה
מדליקים מהפופאפ — יש מתג **debug mode**. הוא נשמר ב‑`chrome.storage.local` תחת המפתח `mds.debug`.

### איפה רואים את הלוגים
יש **שני** consoles נפרדים, וחשוב להסתכל בנכון:

1. **Console של הדף (content script)** — הלוגים על זיהוי ה‑composer, קריאת כותרת/תוכן, והזרקת טקסט בשחזור.
   - בעמוד mitmachim.top לחצו F12 → לשונית **Console**.
2. **Service worker console (background)** — הלוגים על קריאות ה‑API, הצפנה/פענוח, ה‑offline queue וה‑alarms.
   - `chrome://extensions` → כרטיס התוסף → לחצו על הקישור **service worker** (תחת "Inspect views"). זה פותח DevTools ייעודי ל‑background.

סננו את הקונסול לפי `[MDS]` כדי לראות רק את לוגי התוסף.

> תזכורת אבטחה: גם ב‑debug הלוגים לא מכילים את הטקסט המלא של הטיוטה, את ה‑Sync Key או את המפתח הנגזר.

---

## בדיקת `/health` עם curl

`GET /health` הוא נקודת בדיקת חיים ללא אימות. הוא הדרך המהירה לוודא שהשרת חי.

```bash
curl -s https://drafts-api.example.com/health
```

תגובה תקינה:
```json
{ "ok": true, "version": "1.0.0", "time": "2026-06-15T10:20:30.000Z", "uptimeSec": 1234 }
```

בדיקה מקומית על השרת עצמו (עוקפת את Nginx, בודקת את Fastify ישירות):
```bash
curl -s http://127.0.0.1:3001/health
```

- אם הבדיקה המקומית עובדת אבל החיצונית לא → הבעיה ב‑Nginx / DNS / תעודה, לא בשרת.
- אם גם המקומית נכשלת → התהליך לא רץ. בדקו `pm2 status` ו‑`pm2 logs`.
- כדי לראות גם קודי HTTP וכותרות:
  ```bash
  curl -i https://drafts-api.example.com/health
  ```

---

## איפה ה‑DB ואיך לגבות

הנתונים נשמרים ב‑SQLite (מצב WAL).

### מיקום
ברירת המחדל היא `./data/draftsync.db` (יחסית לתיקיית הרצת השרת), וניתן לשנות עם משתנה הסביבה `DB_PATH` ב‑`server/.env`:
```ini
DB_PATH=./data/draftsync.db
```
במצב WAL יופיעו לצד הקובץ גם `draftsync.db-wal` ו‑`draftsync.db-shm`. **גבו את שלושתם יחד**, או השתמשו בכלי שמבצע checkpoint לפני העתקה.

> תזכורת: ה‑DB מכיל רק מטא‑דאטה ושדות מוצפנים (`encrypted_title`/`encrypted_content`/`encryption_iv`/`encryption_salt`). אין בו טקסט גלוי, ואין בו את ה‑Sync Key (רק HMAC שלו).

### גיבוי
הדרך המומלצת — סקריפט הגיבוי המובנה (`scripts/backup-db.sh`):
```bash
npm run backup
```
הוא מבצע גיבוי עקבי של ה‑DB (כולל ה‑WAL) לקובץ נפרד.

גיבוי ידני עקבי עם כלי SQLite (לא לתפוס את הקובץ "חי" באמצע כתיבה):
```bash
sqlite3 ./data/draftsync.db ".backup './data/backup-$(date +%F).db'"
```

מיגרציות רצות אוטומטית בעליית השרת; אפשר גם להריץ ידנית:
```bash
npm run migrate
```

> מומלץ: לפני שדרוג גרסה או מיגרציה — בצעו `npm run backup` קודם.
