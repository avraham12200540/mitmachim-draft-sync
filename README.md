# Mitmachim Draft Sync — סנכרון טיוטות לפורום מתמחים טופ

סנכרון של טיוטות כתיבה בפורום [mitmachim.top](https://mitmachim.top) בין כל המחשבים שלכם, **בהצפנה מקצה לקצה**. כל הצפנה והפענוח קורים אצלכם בדפדפן; השרת הפרטי שלכם שומר רק טקסט מוצפן ומטא־דאטה לא רגיש, ולעולם לא רואה את התוכן הגלוי, את הסיסמה לפורום, או את מפתח הסנכרון שלכם.

> מבוסס על מונורפו עם npm workspaces: שרת API (TypeScript + Fastify + SQLite) ותוסף Chrome (Manifest V3).

---

## 1. מה הפרויקט עושה

כשאתם כותבים נושא חדש, תגובה או עריכה בפורום מתמחים טופ, התוסף שומר את הטיוטה אוטומטית. הטיוטה מוצפנת בדפדפן ונשלחת לשרת פרטי שבבעלותכם. כשאתם פותחים את אותו הקשר במחשב אחר (לדוגמה, מהבית לעבודה), התוסף מושך את הטיוטה האחרונה, מפענח אותה מקומית, ומציע לכם לשחזר אותה אל תוך העורך.

עיקרי היכולות:

- **שמירה אוטומטית** של טיוטות בזמן הקלדה (עם debounce ושמירה תקופתית).
- **הצפנה מקצה לקצה** עם AES‑GCM‑256; המפתח נגזר ממפתח הסנכרון בלבד ולעולם לא עוזב את המחשב.
- **סנכרון בין מחשבים** דרך השרת הפרטי שלכם — אתם הבעלים של הנתונים.
- **עבודה במצב לא־מקוון**: טיוטות נכנסות לתור מקומי מוצפן ונשלחות שוב אוטומטית כשהחיבור חוזר (ניסיון חוזר כל 2 דקות דרך `chrome.alarms`).
- **זיהוי קונפליקטים** בין מכשירים (last‑write‑wins עם שדה `expectedServerUpdatedAt` אופציונלי).
- **ניהול מכשירים** והתנתקות (ביטול token לכל מכשיר).

---

## 2. איך הוא עובד

תרשים הזרימה, במילים:

```
[ עורך בפורום mitmachim.top ]
            │  (המשתמש מקליד נושא / תגובה / עריכה)
            ▼
[ content script ]  ← רץ רק על https://mitmachim.top/*
            │  קורא אך ורק את טקסט הכותרת/התוכן מתוך העורך (composer)
            ▼
[ background service worker ]
            │  1. מצפין את הטקסט מקומית (AES-GCM-256, מפתח שנגזר ממפתח הסנכרון)
            │  2. שולח את המעטפת המוצפנת + מטא-דאטה לא רגיש לשרת
            ▼
[ שרת פרטי (API) ]
            │  שומר ב-SQLite רק encrypted_title / encrypted_content / iv / salt
            │  + מטא-דאטה לא רגיש (type, categoryId, topicId, postId, url, deviceName, timestamps)
            ▼
[ מחשב אחר ]
            │  background מושך את הטיוטה המוצפנת מהשרת
            │  ומפענח אותה מקומית עם אותו מפתח סנכרון
            ▼
[ העורך בפורום ]  ← התוסף מציע לשחזר את הטיוטה
```

נקודות חשובות בארכיטקטורה:

- **content script** קורא *רק* את הטקסט שבעורך. הוא אינו ניגש לעוגיות, ל‑`localStorage`, ל‑session או לכל פרט התחברות, ואינו קורא ל‑API של הפורום.
- **background service worker** הוא המרכז: הוא מחזיק את ה‑token ואת מפתח ההצפנה הנגזר, מבצע את כל קריאות ה‑API ואת ההצפנה/פענוח, ומנהל את התור הלא־מקוון.
- **השרת** הוא "אטום" — הוא אינו יכול לקרוא את התוכן, כי הוא לעולם לא מקבל את מפתח הסנכרון או את המפתח הנגזר.

פירוט מלא של מודל ההצפנה והאבטחה נמצא ב‑[`docs/SECURITY.md`](docs/SECURITY.md), וחוזה ה‑API המלא ב‑[`docs/API.md`](docs/API.md).

---

## 3. מה הוא *לא* עושה

- **לא שומר ולא קורא סיסמאות, עוגיות או session** של הפורום או של כל אתר אחר.
- **לא משתמש ב‑API של הפורום** ולא מתחבר לשרת של מתמחים טופ. הוא רק קורא טקסט מתוך העורך בדף.
- **לא משנה את הפורום** ולא שולח עבורכם נושאים/תגובות — הוא רק שומר ומשחזר טיוטות.
- **לא שולח טקסט גלוי** לשום מקום. השרת מקבל אך ורק מחרוזות מוצפנות + מטא־דאטה לא רגיש.
- **לא רושם טקסט מלא של טיוטות ביומנים**. גם במצב Debug, הלוגים (בקידומת `[MDS]`) לעולם לא מכילים את תוכן הטיוטה המלא.

---

## 4. מבנה התיקיות

```
DraftSync/
├─ package.json              # מונרפו (npm workspaces: server, extension)
├─ tsconfig.base.json
├─ .env.example              # תבנית משתני סביבה לשרת
├─ docs/                     # תיעוד (API, אבטחה, פריסה, גיבוי, פתרון תקלות)
│  └─ API.md
├─ server/                   # שרת ה-API הפרטי
│  ├─ src/
│  │  ├─ index.ts            # נקודת הכניסה (Fastify)
│  │  ├─ config.ts           # טעינת ENV + ברירות מחדל
│  │  ├─ db/                 # SQLite, סכמה, מיגרציות
│  │  ├─ routes/             # health / auth / devices / drafts
│  │  ├─ services/           # לוגיקה (כולל ניקוי תקופתי)
│  │  ├─ middleware/         # cors, rate-limit, error handler
│  │  └─ utils/
│  ├─ scripts/               # smoke-test, גיבוי DB
│  ├─ data/                  # קובץ ה-SQLite (נוצר בזמן ריצה)
│  └─ dist/                  # פלט הקומפילציה (entry: dist/index.js)
└─ extension/                # תוסף Chrome MV3
   ├─ manifest.json
   ├─ src/
   │  ├─ background.ts        # service worker (token, הצפנה, תור, API)
   │  ├─ content.ts           # קורא טקסט מהעורך בפורום
   │  ├─ popup.ts             # ה-popup (עברית, RTL)
   │  ├─ crypto.ts            # AES-GCM + PBKDF2 (Web Crypto)
   │  ├─ config.ts            # DEFAULT_API_URL וקבועים
   │  └─ dom/selectors.ts     # סלקטורים לעורך (רשימות fallback)
   └─ dist/                   # פלט ה-build → היעד ל-"Load unpacked"
```

---

## 5. דרישות מוקדמות

- **Node.js >= 20** (נבנה ונבדק על Node 24). מומלץ להתקין דרך [nvm](https://github.com/nvm-sh/nvm) או NodeSource.
- **npm** (מגיע עם Node).
- **Google Chrome** (או דפדפן מבוסס Chromium עם תמיכה ב‑Manifest V3) להתקנת התוסף.
- לפיתוח השרת: `better-sqlite3` נבנה נייטיב, ולכן בסביבות מסוימות נדרשים כלי בנייה (build‑essential ב‑Linux, או build tools ב‑Windows). ברוב המקרים `npm install` מסדר זאת אוטומטית.
- לפריסה: שרת **Ubuntu 24.04** (למשל DigitalOcean), Nginx, ו‑certbot ל‑HTTPS — ראו פרק [10](#10-פריסה-ל-digitalocean).

---

## 6. התקנה והרצה של שרת מקומי

מהשורש של המונרפו:

```bash
# 1. התקנת כל התלויות (כל ה-workspaces)
npm install

# 2. הגדרת משתני סביבה
cp .env.example server/.env
# פתחו את server/.env והגדירו SYNC_KEY_PEPPER לערך אקראי חזק.
# יצירת ערך אקראי:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> בסביבת פיתוח (`NODE_ENV=development`) השרת יעלה גם בלי `SYNC_KEY_PEPPER` (נופל לערך ברירת מחדל לא־מאובטח, ומסומן ככזה). **בפרודקשן `SYNC_KEY_PEPPER` הוא חובה** — השרת יסרב לעלות בלעדיו.

### הרצה בפיתוח (reload אוטומטי)

```bash
npm run dev:server      # tsx watch — טוען מחדש על כל שינוי בקוד
```

### בנייה והרצה בפרודקשן

```bash
npm run build:server    # tsc → server/dist
npm run start:server    # node server/dist/index.js
```

המיגרציות רצות אוטומטית בעליית השרת. ניתן גם להריץ אותן ידנית:

```bash
npm run migrate
```

### בדיקת חיים

ברירת המחדל היא האזנה על `http://127.0.0.1:3001`. בדקו שהשרת חי:

```bash
curl http://127.0.0.1:3001/health
```

תגובה לדוגמה:

```json
{ "ok": true, "version": "1.0.0", "time": "2026-06-15T10:20:30.000Z", "uptimeSec": 1234 }
```

#### משתני הסביבה העיקריים (`server/.env`)

| משתנה | ברירת מחדל | תיאור |
|-------|------------|-------|
| `PORT` | `3001` | הפורט שעליו השרת מאזין |
| `HOST` | `127.0.0.1` | כתובת ההאזנה (השאירו `127.0.0.1` מאחורי Nginx) |
| `NODE_ENV` | `development` | `development` או `production` |
| `DB_PATH` | `./data/draftsync.db` | נתיב קובץ ה‑SQLite |
| `SYNC_KEY_PEPPER` | — | **חובה בפרודקשן** — pepper ל‑HMAC של מפתחות הסנכרון/tokens |
| `TOKEN_TTL_DAYS` | `365` | תוקף ה‑access token בימים |
| `CORS_EXTRA_ORIGINS` | (ריק) | מקורות web נוספים מורשים, מופרדים בפסיק |
| `RATE_LIMIT_WINDOW_MS` | `60000` | חלון הגבלת קצב (ms) |
| `RATE_LIMIT_MAX_PER_IP` | `120` | מקסימום בקשות לכל IP בחלון |
| `RATE_LIMIT_MAX_PER_USER` | `300` | מקסימום בקשות לכל משתמש בחלון |
| `MAX_BODY_BYTES` | `1572864` | גודל גוף בקשה מרבי (בייטים) |
| `PURGE_DELETED_AFTER_DAYS` | `30` | אחרי כמה ימים מנקים טיוטות שנמחקו רכה |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |

---

## 7. בנייה והתקנת התוסף הלא־ארוז בכרום

### בנייה

```bash
npm run build:extension   # type-check + esbuild → extension/dist
# או, לפיתוח עם בנייה מחדש אוטומטית:
npm run watch:extension
```

### Load unpacked

1. פתחו ב‑Chrome את הכתובת `chrome://extensions`.
2. הפעילו את **Developer mode** (מצב מפתח) בפינה הימנית/שמאלית העליונה.
3. לחצו על **Load unpacked** ובחרו את התיקייה **`extension/dist`** (זהו היעד — לא `extension/src`).
4. התוסף "Mitmachim Draft Sync" יופיע ברשימה. נעצו אותו בסרגל הכלים לנוחות.

### הצבעת התוסף לשרת שלכם

כתובת ה‑API קבועה בקוד: `https://drafts-api.extsync.com` (מוגדרת ב‑`DEFAULT_API_URL` ב‑`extension/src/config.ts`, ומופיעה ב‑`host_permissions` ב‑`extension/manifest.json`). אין שדה כתובת שרת ב‑popup ואין מה להגדיר — התוסף עובד מול השרת הזה כפי שהוא.

כדי להצביע על שרת אחר, מפתח עורך את `DEFAULT_API_URL` ב‑`extension/src/config.ts` **וגם** את ה‑host ב‑`host_permissions` שב‑`extension/manifest.json`, ואז מריץ שוב `npm run build:extension`. זוהי הדרך היחידה לשנות את הכתובת (אין הגדרה דרך ה‑UI).

---

## 8. יצירת Sync Key

מפתח הסנכרון (Sync Key) הוא ה"זהות" וה"מפתח הראשי" שלכם בו־זמנית: הוא מזהה את החשבון בשרת, וממנו נגזר מפתח ההצפנה שמגן על הטיוטות.

1. פתחו את ה‑popup של התוסף.
2. לחצו על **"צור קוד סנכרון חדש"** (Create Sync Key). אפשר לתת שם למכשיר (לדוגמה "מחשב בית").
3. השרת ייצר מפתח בפורמט `MTD-XXXX-XXXX-XXXX` (למשל `MTD-7Q4K-2H9P-X7P2`).

> ⚠️ **המפתח מוצג פעם אחת בלבד.** השרת שומר רק HMAC שלו ואינו יכול לשחזר אותו. **העתיקו ושמרו אותו במקום בטוח** (מנהל סיסמאות). אם תאבדו אותו — לא ניתן לפענח את הטיוטות הקיימות.

---

## 9. חיבור מחשב נוסף

כדי לסנכרן את אותן הטיוטות במחשב נוסף:

1. התקינו את התוסף במחשב השני (פרק 7). אין כתובת שרת להגדיר — היא קבועה בקוד.
2. פתחו את ה‑popup, הדביקו את אותו ה‑**Sync Key** שיצרתם בפרק 8 (אפשר לתת גם שם מכשיר, למשל "מחשב עבודה"), ולחצו **"התחבר"**.
3. זהו — שני המחשבים חולקים כעת את אותו מפתח, וכל אחד מצפין/מפענח מקומית את אותן הטיוטות.

> כל מכשיר מקבל `accessToken` משלו, הניתן לביטול בנפרד (התנתקות/ניהול מכשירים) בלי לשבש את שאר המכשירים.

---

## 10. פריסה ל‑DigitalOcean

לפריסת השרת על VPS עם Ubuntu 24.04 (התקנת Node דרך NodeSource, ניהול תהליכים עם PM2, וכו') — ראו את המדריך המלא:

➡️ [`docs/SERVER_DEPLOYMENT.md`](docs/SERVER_DEPLOYMENT.md)

המדריך מכסה: הקמת השרת, התקנת Node LTS, הגדרת `server/.env` (כולל `SYNC_KEY_PEPPER` ו‑`HOST=127.0.0.1`), בנייה (`npm run build:server`), והרצה כשירות עמיד תחת PM2 (`ecosystem.config.cjs`).

---

## 11. Nginx ו‑HTTPS

הצבת השרת מאחורי Nginx כ‑reverse proxy אל `127.0.0.1:3001`, והוצאת תעודת HTTPS עם certbot / Let's Encrypt עבור ה‑host (`drafts-api.extsync.com`) — ראו:

➡️ [`docs/NGINX_HTTPS.md`](docs/NGINX_HTTPS.md)

> חשוב: השאירו את `HOST=127.0.0.1` בשרת כך שה‑API אינו נגיש ישירות מהאינטרנט, אלא רק דרך Nginx ב‑HTTPS.

---

## 12. גיבויים

מסד הנתונים הוא קובץ SQLite יחיד (ברירת מחדל: `server/data/draftsync.db`, במצב WAL). יש סקריפט גיבוי ייעודי:

```bash
npm run backup     # מריץ את server/scripts/backup-db.sh
```

הגיבוי משתמש בגיבוי עקבי (מתחשב ב‑WAL) ושומר עותק לתיקיית הגיבויים. למדיניות גיבוי מומלצת, תזמון (cron), שחזור, וגיבוי של `SYNC_KEY_PEPPER` (קריטי — בלעדיו אי אפשר להתאים מפתחות קיימים) — ראו:

➡️ [`docs/BACKUP.md`](docs/BACKUP.md)

---

## 13. פתרון תקלות

לבעיות נפוצות — העורך לא מזוהה, התוסף לא מתחבר לשרת, שגיאות CORS / הרשאות host, בעיות סנכרון או קונפליקטים, הפעלת מצב Debug (לוגים בקידומת `[MDS]`), ועדכון הסלקטורים ב‑`extension/src/dom/selectors.ts` כשהעורך משתנה — ראו:

➡️ [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)

---

## 14. אזהרת אבטחה

> ## ⚠️ אל תשתפו את ה‑Sync Key שלכם — לעולם.
>
> מפתח הסנכרון הוא המפתח היחיד שמפענח את כל הטיוטות שלכם. **כל מי שמחזיק בו יכול לקרוא את כל התוכן ולהתחבר לחשבון שלכם.** השרת *אינו* יכול לשחזר אותו עבורכם, ולכן:
>
> - שמרו אותו במנהל סיסמאות, לא בצ'אט/מייל/הערות גלויות.
> - אל תדביקו אותו באתרים או בכלים חיצוניים.
> - אם אתם חושדים שדלף — צרו מפתח חדש והתחברו מחדש בכל המכשירים (וגבו את הטיוטות לפני כן).

---

## טבלת סקריפטים (root npm scripts)

מריצים מהשורש של המונרפו: `npm run <script>`.

| Script | פקודה | מה הוא עושה |
|--------|-------|-------------|
| `install:all` | `npm install` | התקנת תלויות לכל ה‑workspaces |
| `build` | `build:server && build:extension` | בניית השרת והתוסף |
| `build:server` | `npm run build -w server` | קומפילציית השרת (tsc → `server/dist`) |
| `build:extension` | `npm run build -w extension` | type‑check + esbuild → `extension/dist` |
| `dev` / `dev:server` | `npm run dev -w server` | הרצת השרת בפיתוח (`tsx watch`) |
| `watch:extension` | `npm run watch -w extension` | בניית התוסף מחדש על כל שינוי |
| `migrate` | `npm run migrate -w server` | הרצת מיגרציות מסד הנתונים ידנית |
| `backup` | `npm run backup -w server` | גיבוי קובץ ה‑SQLite |
| `start:server` | `npm run start -w server` | הרצת השרת המקומפל (`node dist/index.js`) |
| `lint` | `npm run lint --workspaces --if-present` | ESLint על כל ה‑workspaces |
| `format` | `prettier --write "**/*.{ts,js,mjs,json,md,css,html}"` | פירמוט הקוד |
| `format:check` | `prettier --check ...` | בדיקת פירמוט בלי לשנות קבצים |
| `clean` | `npm run clean --workspaces --if-present` | מחיקת תיקיות `dist` |

---

## תיעוד נוסף

- [`docs/API.md`](docs/API.md) — חוזה ה‑API המלא בין התוסף לשרת.
- [`docs/SECURITY.md`](docs/SECURITY.md) — מודל ההצפנה, הנמקות, ופירוט הטרייד‑אופים.
- [`docs/SERVER_DEPLOYMENT.md`](docs/SERVER_DEPLOYMENT.md) — פריסה ל‑DigitalOcean / Ubuntu 24.04 עם PM2.
- [`docs/NGINX_HTTPS.md`](docs/NGINX_HTTPS.md) — Nginx reverse proxy ו‑HTTPS עם certbot.
- [`docs/BACKUP.md`](docs/BACKUP.md) — גיבוי, שחזור ותזמון.
- [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) — פתרון תקלות.

---

רישיון: MIT.
