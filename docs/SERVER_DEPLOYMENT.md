# התקנה ופריסה של השרת — Ubuntu 24.04 (DigitalOcean)

מדריך מלא להעלאת שרת ה‑API של **Mitmachim Draft Sync** על VPS עם Ubuntu 24.04 LTS.
המדריך מניח שרת נקי, משתמש עם הרשאות `sudo`, ודומיין שמכוון אל ה‑VPS (לדוגמה `drafts-api.example.com`).

הארכיטקטורה: Node.js + Fastify מאזין לוקלית על `127.0.0.1:3001`, **Nginx** משמש כ‑reverse proxy עם HTTPS (Let's Encrypt), ו‑**PM2** מנהל את התהליך ומפעיל אותו מחדש אוטומטית.

> כל פקודות המעטפת (shell) נכתבות באנגלית ומיועדות להרצה כפי שהן. החליפו את `drafts-api.example.com` בדומיין האמיתי שלכם בכל מקום שהוא מופיע.

---

## דרישות מקדימות

| רכיב | פרטים |
|------|--------|
| מערכת הפעלה | Ubuntu 24.04 LTS |
| משתמש | משתמש לא‑root עם `sudo` (לדוגמה `deploy`) |
| Node.js | LTS (גרסה 20 ומעלה; נבדק על Node 24) |
| DNS | רשומת `A` (ו‑`AAAA` אם יש IPv6) של הדומיין מצביעה ל‑IP של ה‑VPS |
| פורטים פתוחים | `22` (SSH), `80` (HTTP — דרוש ל‑certbot), `443` (HTTPS) |

> **קיצור דרך:** המאגר כולל סקריפט התקנה אוטומטי — ראו [התקנה אוטומטית עם `scripts/install-server.sh`](#התקנה-אוטומטית-עם-scriptsinstall-serversh). המדריך הידני שלהלן מסביר את אותם השלבים אחד‑אחד.

---

## 1. עדכון המערכת והכנת חומת אש

התחברו ל‑VPS ב‑SSH ועדכנו את חבילות המערכת:

```bash
sudo apt update
sudo apt -y upgrade
```

אם אתם משתמשים ב‑`ufw`, פתחו את הפורטים הדרושים (חשוב לאשר SSH לפני הפעלת חומת האש כדי לא לנעול את עצמכם בחוץ):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # פותח 80 ו‑443
sudo ufw --force enable
sudo ufw status
```

---

## 2. התקנת Node.js LTS דרך NodeSource

Ubuntu מספקת גרסת Node ישנה במאגרים הרשמיים. נתקין גרסת LTS עדכנית דרך מאגר NodeSource:

```bash
# מוסיף את מאגר NodeSource עבור Node.js 22 LTS (תואם לדרישת >= 20)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

בדקו שההתקנה הצליחה:

```bash
node -v    # צריך להחזיר v22.x (או v20+/v24)
npm -v
```

---

## 3. התקנת כלי בנייה (build tools) עבור better-sqlite3

החבילה `better-sqlite3` היא מודול נייטיב שנבנה מקוד מקור בזמן ההתקנה, ולכן דרושים מהדר C/C++ ו‑`make` ו‑`python3`. החבילה `build-essential` מספקת את כולם:

```bash
sudo apt install -y build-essential python3
```

> אם בשלב `npm ci` תקבלו שגיאות קומפילציה הקשורות ל‑`node-gyp` — כמעט תמיד הסיבה היא שחבילת `build-essential` חסרה. ודאו שהיא מותקנת ונסו שוב.

---

## 4. התקנת Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

בדיקה מהירה — גלישה ל‑`http://<IP-של-השרת>/` אמורה להציג את עמוד ברירת המחדל של Nginx.

---

## 5. התקנת Certbot (תוסף Nginx)

נשתמש ב‑Certbot כדי להנפיק תעודת TLS חינמית מ‑Let's Encrypt ולחבר אותה ל‑Nginx אוטומטית:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

> את ההנפקה בפועל נריץ אחרי שה‑proxy של Nginx יוגדר (שלב 11), כי `certbot --nginx` עורך את הקובץ הקיים.

---

## 6. שכפול המאגר

מומלץ להחזיק את הקוד תחת ספריית הבית של משתמש הפריסה (לא תחת `root`):

```bash
cd ~
git clone <repo-url> draftsync
cd draftsync
```

מכאן והלאה, **שורש המאגר** הוא `~/draftsync`. כל הפקודות הבאות מורצות מתוכו אלא אם צוין אחרת.

---

## 7. התקנת תלויות עם npm ci

זהו monorepo עם npm workspaces (`server` ו‑`extension`). מספיק להריץ `npm ci` פעם אחת בשורש כדי להתקין את התלויות של כל ה‑workspaces:

```bash
npm ci
```

> משתמשים ב‑`npm ci` (ולא `npm install`) כדי לקבל התקנה דטרמיניסטית התואמת בדיוק ל‑`package-lock.json`. כאן גם נבנית `better-sqlite3` מקוד מקור — לכן שלב 3 (build tools) חייב להתבצע לפני כן.

---

## 8. בניית השרת

הידור TypeScript ל‑JavaScript אל תוך `server/dist`:

```bash
npm run build:server
```

נקודת הכניסה שתיווצר היא `server/dist/index.js`.

---

## 9. יצירת קובץ הסביבה (server/.env) ו‑SYNC_KEY_PEPPER חזק

העתיקו את התבנית מ‑`.env.example` (בשורש המאגר) אל `server/.env`:

```bash
cp .env.example server/.env
```

> השרת טוען קודם את `server/.env` ואז את `.env` שבשורש המאגר כגיבוי. מומלץ להחזיק את ההגדרות ב‑`server/.env`.

### יצירת SYNC_KEY_PEPPER

ה‑`SYNC_KEY_PEPPER` הוא הסוד שמערבבים ב‑HMAC המשמש לגיבוב (hashing) של ה‑Sync Keys וה‑tokens. **הוא חובה בסביבת production** והשרת יסרב לעלות אם הוא ריק או נשאר ערך ברירת המחדל. צרו ערך אקראי חזק:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

העתיקו את הפלט והדביקו אותו ב‑`server/.env`. ערכו את הקובץ:

```bash
nano server/.env
```

ודאו לפחות את השדות הבאים:

```ini
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
DB_PATH=./data/draftsync.db
SYNC_KEY_PEPPER=<הדביקו-כאן-את-המחרוזת-האקראית-שיצרתם>
```

> ⚠️ **גבו את ה‑`SYNC_KEY_PEPPER` במקום בטוח.** אם הוא יאבד או ישתנה — לא ניתן יהיה עוד להתאים Sync Keys ו‑tokens קיימים, וכל המכשירים יצטרכו להתחבר מחדש. אל תכניסו לעולם את `server/.env` ל‑git (הוא כבר ב‑`.gitignore`).

שאר המשתנים (`TOKEN_TTL_DAYS`, מגבלות ה‑rate limit, `MAX_BODY_BYTES`, `PURGE_DELETED_AFTER_DAYS`, `LOG_LEVEL` וכו') מגיעים עם ברירות מחדל סבירות ב‑`.env.example` — שנו רק אם יש צורך.

---

## 10. הרצת המיגרציות

המיגרציות רצות אוטומטית בכל עליית שרת, אך מומלץ להריץ אותן ידנית פעם אחת כדי לאמת שה‑DB נוצר וההגדרות תקינות:

```bash
npm run migrate
```

הפעולה יוצרת את קובץ ה‑SQLite (לפי `DB_PATH`, ברירת מחדל `server/data/draftsync.db`) במצב WAL ומחילה את הסכמה. אם השלב נכשל עם שגיאה על `SYNC_KEY_PEPPER` — חזרו לשלב 9.

---

## 11. הפעלה עם PM2

PM2 שומר על השרת חי, מפעיל אותו מחדש בקריסה, ומעלה אותו אוטומטית לאחר אתחול השרת. נתקין אותו גלובלית ונשתמש בקובץ ה‑`ecosystem` שבמאגר:

```bash
sudo npm install -g pm2
```

הפעילו את האפליקציה דרך `server/scripts/ecosystem.config.cjs` (מורץ משורש המאגר):

```bash
pm2 start server/scripts/ecosystem.config.cjs
```

> קובץ ה‑`ecosystem` מפעיל את `server/dist/index.js` עם `NODE_ENV=production` ומגדיר את שם התהליך, לוגים, והפעלה‑מחדש אוטומטית. ודאו שהרצתם תחילה `npm run build:server` (שלב 8) כך שה‑`dist` קיים.

שמרו את רשימת התהליכים הנוכחית כדי שתשוחזר לאחר אתחול:

```bash
pm2 save
```

הגדירו את PM2 לעלות אוטומטית עם המערכת. הפקודה הבאה מדפיסה פקודת `sudo` אחת — **העתיקו והריצו בדיוק את מה שהיא מדפיסה**:

```bash
pm2 startup systemd
# הריצו את פקודת ה‑sudo שהפלט מציג, ואז שוב:
pm2 save
```

ודאו שהשרת חי לוקלית לפני שממשיכים ל‑Nginx:

```bash
curl http://127.0.0.1:3001/health
# צפוי: {"ok":true,"version":"1.0.0","time":"...","uptimeSec":...}
```

---

## 12. הגדרת Nginx כ‑reverse proxy

המאגר כולל תבנית מוכנה ב‑`server/scripts/nginx-example.conf`. העתיקו אותה אל `sites-available`, החליפו את שם השרת בדומיין שלכם, צרו symlink אל `sites-enabled`, ובדקו תקינות:

```bash
sudo cp server/scripts/nginx-example.conf /etc/nginx/sites-available/draftsync
# ערכו את server_name כך שיתאים לדומיין שלכם:
sudo nano /etc/nginx/sites-available/draftsync

# הפעלת האתר וביטול ברירת המחדל:
sudo ln -sf /etc/nginx/sites-available/draftsync /etc/nginx/sites-enabled/draftsync
sudo rm -f /etc/nginx/sites-enabled/default

# בדיקת תחביר וטעינה מחדש:
sudo nginx -t
sudo systemctl reload nginx
```

### בלוק ה‑server המדויק

אם אתם מעדיפים ליצור את הקובץ ידנית, זהו הבלוק שצריך להיות ב‑`/etc/nginx/sites-available/draftsync`. בשלב זה הוא מאזין על פורט 80 בלבד; `certbot` יוסיף את חלק ה‑443/TLS בשלב הבא:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name drafts-api.example.com;

    # מקסימום גודל גוף בקשה — תואם ל‑MAX_BODY_BYTES בשרת (~1.5MB)
    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;

        proxy_connect_timeout 30s;
        proxy_read_timeout    60s;
        proxy_send_timeout    60s;
    }
}
```

> השרת רץ עם `trustProxy: true`, ולכן הוא קורא את כתובת ה‑IP האמיתית של הלקוח מכותרת `X-Forwarded-For` שמוסיף Nginx — חשוב לכך שמגבלות ה‑rate limit לפי IP יעבדו נכון. שמרו על הכותרות הללו כפי שהן.

---

## 13. הפעלת HTTPS עם Certbot

עכשיו, כש‑Nginx מגיש את הדומיין על פורט 80, הנפיקו תעודה וחברו אותה אוטומטית:

```bash
sudo certbot --nginx -d drafts-api.example.com
```

Certbot יבקש כתובת אימייל, יסכים לתנאים, ויערוך את בלוק ה‑server כך שיאזין על 443 עם TLS וירשום הפניה (redirect) מ‑HTTP ל‑HTTPS. החידוש האוטומטי כבר מוגדר על ידי טיימר של systemd; אפשר לוודא בהרצה יבשה:

```bash
sudo certbot renew --dry-run
```

---

## 14. אימות

בדקו מהקצה (end‑to‑end) דרך הדומיין הציבורי עם HTTPS:

```bash
curl https://drafts-api.example.com/health
```

תגובה תקינה:

```json
{ "ok": true, "version": "1.0.0", "time": "2026-06-15T10:20:30.000Z", "uptimeSec": 1234 }
```

אם קיבלתם את התגובה הזו — השרת מותקן, מאובטח ב‑TLS, ופועל. התוסף מכוון כברירת מחדל אל `https://drafts-api.extsync.com`; כדי להפנות אותו אל הדומיין שלכם, מפתח עורך את `DEFAULT_API_URL` ב‑`extension/src/config.ts` ואת ה‑host ב‑`host_permissions` שב‑`manifest.json`, ואז בונה מחדש את התוסף.

---

## עדכון ופריסה מחדש

כדי לפרוס גרסה חדשה של הקוד:

```bash
cd ~/draftsync
git pull
npm ci                 # אם השתנו תלויות
npm run build:server   # הידור מחדש אל server/dist
npm run migrate        # מחיל מיגרציות חדשות (בטוח להריץ גם אם אין חדשות)
pm2 restart server/scripts/ecosystem.config.cjs   # או: pm2 restart <שם-התהליך>
```

לאחר אימות שהשירות חי שוב, אין צורך ב‑`pm2 save` נוסף אלא אם שיניתם את הגדרת ה‑`ecosystem` עצמה.

```bash
curl https://drafts-api.example.com/health   # אימות אחרי הפריסה
```

> **גיבוי לפני מיגרציות:** לפני עדכון שכולל שינויי סכמה, גבו את מסד הנתונים עם `npm run backup` (מריץ את `server/scripts/backup-db.sh` ושומר עותק של קובץ ה‑SQLite). ראו גם `docs/SECURITY.md`.

---

## צפייה בלוגים וניטור

```bash
pm2 logs                 # לוגים חיים של כל התהליכים
pm2 logs <שם-התהליך>      # לוגים של תהליך ספציפי
pm2 status               # סקירת מצב (CPU/זיכרון/restart count)
pm2 monit                # מסך ניטור אינטראקטיבי
```

לוגים של Nginx:

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

> השרת רושם לוגים מובנים (structured) ולעולם **אינו** רושם תוכן טיוטות, Sync Keys או tokens. רמת הלוג נשלטת על ידי `LOG_LEVEL` ב‑`server/.env`.

---

## פתרון תקלות מהיר

| תסמין | בדיקה / פתרון |
|--------|----------------|
| השרת לא עולה, שגיאה על `SYNC_KEY_PEPPER` | ב‑production חובה ערך אקראי אמיתי. חזרו לשלב 9. |
| שגיאות קומפילציה ב‑`npm ci` (`node-gyp`) | ודאו ש‑`build-essential` ו‑`python3` מותקנים (שלב 3). |
| `502 Bad Gateway` מ‑Nginx | בדקו ש‑PM2 חי (`pm2 status`) ושהשרת עונה ל‑`curl http://127.0.0.1:3001/health`. |
| `curl https://...` נכשל בתעודה | ודאו ש‑DNS מצביע ל‑VPS וש‑`certbot --nginx` הסתיים בהצלחה. |
| השירות לא חזר אחרי reboot | ודאו שהרצתם `pm2 startup systemd` + את פקודת ה‑sudo שהודפסה + `pm2 save`. |

---

## התקנה אוטומטית עם scripts/install-server.sh

כחלופה לשלבים הידניים שלמעלה, המאגר כולל את `scripts/install-server.sh` שמרכז את עיקרי ההתקנה: עדכון apt, התקנת Node.js LTS דרך NodeSource, `build-essential`, Nginx ו‑Certbot, הרצת `npm ci` ו‑`npm run build:server`, ויצירת שלד של `server/.env`.

```bash
cd ~/draftsync
sudo bash server/scripts/install-server.sh
```

> הסקריפט הוא נקודת זינוק. עדיין עליכם להשלים ידנית את השלבים הרגישים/הספציפיים לסביבה: הזנת `SYNC_KEY_PEPPER` אמיתי ב‑`server/.env` (שלב 9), התאמת `server_name` ב‑Nginx (שלב 12), והנפקת התעודה עם `certbot --nginx -d drafts-api.example.com` (שלב 13). קראו את הסקריפט לפני הרצה כדי לדעת מה בדיוק הוא מבצע על המכונה שלכם.
