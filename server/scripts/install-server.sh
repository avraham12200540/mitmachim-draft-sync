#!/usr/bin/env bash
# ==============================================================================
# Mitmachim Draft Sync — התקנה אוטומטית של השרת על Ubuntu 24.04
# ------------------------------------------------------------------------------
# מה הסקריפט עושה (ניתן להריץ שוב ושוב — idempotent-ish):
#   1. מתקין תלויות מערכת: Node.js LTS (דרך NodeSource), build-essential,
#      nginx, certbot + python3-certbot-nginx, PM2 (גלובלי).
#   2. מריץ "npm ci" ו-"npm run build:server" משורש המונורפו.
#   3. אם server/.env חסר — יוצר אותו מ-.env.example ומג'נרט SYNC_KEY_PEPPER
#      אקראי דרך node:crypto. שאר הערכים נשארים ברירת מחדל (יש לעבור עליהם!).
#   4. מריץ מיגרציות של בסיס הנתונים.
#   5. מפעיל את השרת דרך PM2 לפי scripts/ecosystem.config.cjs ושומר (pm2 save).
#   6. מדפיס "השלבים הבאים" להגדרת Nginx + certbot (תלוי-דומיין, לא אוטומטי).
#
# שימוש:  sudo bash server/scripts/install-server.sh
#         (מומלץ להריץ עם sudo כדי שהתקנת חבילות המערכת תצליח)
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# פתרון נתיבים — עובדים תמיד מול שורש המונורפו, לא משנה מהיכן הופעל הסקריפט.
#   SCRIPT_DIR = server/scripts ,  SERVER_DIR = server ,  REPO_ROOT = שורש המונורפו
# ------------------------------------------------------------------------------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
SERVER_DIR="$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd -P)"
REPO_ROOT="$(cd -- "${SERVER_DIR}/.." >/dev/null 2>&1 && pwd -P)"

ENV_FILE="${SERVER_DIR}/.env"
ENV_EXAMPLE="${REPO_ROOT}/.env.example"
# Deployment artifacts live under server/scripts (this script's own directory).
ECOSYSTEM_FILE="${SCRIPT_DIR}/ecosystem.config.cjs"
NGINX_EXAMPLE="${SCRIPT_DIR}/nginx-example.conf"

# גרסת ה-major של Node שתותקן דרך NodeSource (LTS).
NODE_MAJOR=20

# ------------------------------------------------------------------------------
# כלי עזר: הרצת פקודה עם הרשאות root במידת הצורך (sudo אם קיים ולא root).
# ------------------------------------------------------------------------------
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "[install] אזהרה: הסקריפט לא רץ כ-root ואין sudo. התקנת חבילות מערכת עלולה להיכשל." >&2
  fi
fi

echo "======================================================================"
echo "[install] Mitmachim Draft Sync — התקנת שרת על Ubuntu 24.04"
echo "[install] שורש המונורפו: ${REPO_ROOT}"
echo "======================================================================"

# ------------------------------------------------------------------------------
# שלב 1 — חבילות מערכת.
# ------------------------------------------------------------------------------
echo "[install] שלב 1/6: מתקין חבילות מערכת (apt)..."

export DEBIAN_FRONTEND=noninteractive

echo "[install]   מעדכן את רשימת החבילות (apt-get update)..."
${SUDO} apt-get update -y

echo "[install]   מתקין כלי בסיס (ca-certificates, curl, gnupg, build-essential)..."
${SUDO} apt-get install -y ca-certificates curl gnupg build-essential

# --- Node.js LTS דרך NodeSource ---
# idempotent: מתקינים מחדש רק אם Node חסר או שה-major שלו ישן מהרצוי.
need_node=1
if command -v node >/dev/null 2>&1; then
  current_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "${current_major}" -ge "${NODE_MAJOR}" ]; then
    need_node=0
    echo "[install]   Node.js כבר מותקן (גרסה $(node -v)) — מדלג על NodeSource."
  else
    echo "[install]   Node.js הקיים ($(node -v)) ישן מ-v${NODE_MAJOR} — מעדכן דרך NodeSource."
  fi
fi

if [ "${need_node}" -eq 1 ]; then
  echo "[install]   מתקין Node.js v${NODE_MAJOR} (LTS) דרך NodeSource..."
  # NOTE: ${SUDO} is empty when running as root, so no extra flags may follow it
  # unconditionally (a leaked '-E' would be parsed as a command). Pipe the
  # NodeSource setup script straight into bash (via sudo only when not root).
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" -o /tmp/nodesource_setup.sh
  ${SUDO} bash /tmp/nodesource_setup.sh
  rm -f /tmp/nodesource_setup.sh
  ${SUDO} apt-get install -y nodejs
fi
echo "[install]   Node: $(node -v) | npm: $(npm -v)"

# --- nginx + certbot ---
echo "[install]   מתקין nginx, certbot ו-python3-certbot-nginx..."
${SUDO} apt-get install -y nginx certbot python3-certbot-nginx

# --- PM2 (גלובלי) ---
# idempotent: מתקינים רק אם pm2 חסר.
if command -v pm2 >/dev/null 2>&1; then
  echo "[install]   PM2 כבר מותקן ($(pm2 -v)) — מדלג."
else
  echo "[install]   מתקין PM2 גלובלית (npm install -g pm2)..."
  ${SUDO} npm install -g pm2
fi

# ------------------------------------------------------------------------------
# שלב 2 — התקנת תלויות ובנייה משורש המונורפו.
# ------------------------------------------------------------------------------
echo "[install] שלב 2/6: התקנת תלויות (npm ci) ובניית השרת (npm run build:server)..."
cd -- "${REPO_ROOT}"

# npm ci דורש package-lock.json; אם חסר — נופלים ל-npm install כדי לא להיכשל.
if [ -f "${REPO_ROOT}/package-lock.json" ]; then
  npm ci
else
  echo "[install]   package-lock.json חסר — משתמש ב-npm install במקום npm ci."
  npm install
fi

npm run build:server

# ------------------------------------------------------------------------------
# שלב 3 — קובץ סביבה server/.env.
# ------------------------------------------------------------------------------
echo "[install] שלב 3/6: בדיקת קובץ הסביבה server/.env..."

if [ -f "${ENV_FILE}" ]; then
  echo "[install]   server/.env כבר קיים — לא נוגעים בו (שומרים על הסודות הקיימים)."
else
  if [ ! -f "${ENV_EXAMPLE}" ]; then
    echo "[install]   שגיאה: לא נמצא תבנית .env.example בנתיב ${ENV_EXAMPLE}" >&2
    exit 1
  fi

  echo "[install]   server/.env חסר — יוצר מתוך .env.example..."
  cp -- "${ENV_EXAMPLE}" "${ENV_FILE}"

  # ג'ינרוט SYNC_KEY_PEPPER אקראי וחזק דרך node:crypto (48 בייטים -> base64url).
  echo "[install]   מג'נרט SYNC_KEY_PEPPER אקראי דרך node:crypto..."
  PEPPER="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")"

  # מחליפים את שורת SYNC_KEY_PEPPER הקיימת (ערך ברירת המחדל) בערך החדש.
  # מנקודת בטיחות: הערך base64url מכיל רק [A-Za-z0-9_-], בטוח כמחרוזת החלפה ל-sed.
  if grep -qE '^[[:space:]]*SYNC_KEY_PEPPER[[:space:]]*=' "${ENV_FILE}"; then
    sed -i -E "s|^[[:space:]]*SYNC_KEY_PEPPER[[:space:]]*=.*$|SYNC_KEY_PEPPER=${PEPPER}|" "${ENV_FILE}"
  else
    printf '\nSYNC_KEY_PEPPER=%s\n' "${PEPPER}" >> "${ENV_FILE}"
  fi

  # הגבלת הרשאות הקובץ — הוא מכיל סוד.
  chmod 600 "${ENV_FILE}" || true

  echo "[install]   נוצר server/.env עם SYNC_KEY_PEPPER חדש."
  echo "[install]   *** תזכורת: עברו על server/.env ובדקו את שאר הערכים"
  echo "[install]       (PORT, HOST, DB_PATH, CORS_EXTRA_ORIGINS וכו') לפני הרצה בייצור. ***"
fi

# ------------------------------------------------------------------------------
# שלב 4 — מיגרציות בסיס הנתונים.
# ------------------------------------------------------------------------------
echo "[install] שלב 4/6: מריץ מיגרציות של בסיס הנתונים (npm run migrate)..."
cd -- "${REPO_ROOT}"
npm run migrate

# ------------------------------------------------------------------------------
# שלב 5 — הפעלת השרת דרך PM2.
# ------------------------------------------------------------------------------
echo "[install] שלב 5/6: מפעיל את השרת דרך PM2..."

if [ ! -f "${ECOSYSTEM_FILE}" ]; then
  echo "[install]   אזהרה: לא נמצא ${ECOSYSTEM_FILE}." >&2
  echo "[install]   דלגתי על הפעלת PM2. צרו את scripts/ecosystem.config.cjs והריצו:" >&2
  echo "[install]       pm2 start scripts/ecosystem.config.cjs && pm2 save" >&2
else
  cd -- "${REPO_ROOT}"
  # idempotent: אם האפליקציה כבר רצה ב-PM2 — reload; אחרת start.
  if pm2 describe mds-server >/dev/null 2>&1; then
    echo "[install]   האפליקציה כבר רשומה ב-PM2 — מבצע reload..."
    pm2 reload "${ECOSYSTEM_FILE}"
  else
    echo "[install]   מפעיל לראשונה דרך scripts/ecosystem.config.cjs..."
    pm2 start "${ECOSYSTEM_FILE}"
  fi

  echo "[install]   שומר את רשימת התהליכים (pm2 save)..."
  pm2 save

  echo "[install]   טיפ: כדי שה-PM2 יעלה אוטומטית אחרי reboot, הריצו פעם אחת:"
  echo "[install]       pm2 startup   (ובצעו את הפקודה שהוא מדפיס)"
fi

# ------------------------------------------------------------------------------
# שלב 6 — השלבים הבאים (Nginx + certbot) — תלוי-דומיין, לא אוטומטי.
# ------------------------------------------------------------------------------
echo "[install] שלב 6/6: ההתקנה הבסיסית הושלמה."
echo ""
echo "======================================================================"
echo "  ✓ השרת רץ מקומית מאחורי PM2 על HOST/PORT שב-server/.env"
echo "    (ברירת מחדל: 127.0.0.1:3001). בדיקה מהירה:"
echo "        curl http://127.0.0.1:3001/health"
echo "======================================================================"
echo ""
echo "  השלבים הבאים — Nginx reverse proxy + HTTPS (תלוי בדומיין שלכם):"
echo ""
echo "  1) הצביעו רשומת DNS A של הדומיין שלכם אל כתובת ה-IP של השרת."
echo ""
echo "  2) צרו אתר Nginx מתוך התבנית (החליפו את הדומיין בפועל):"
echo "       sudo cp ${NGINX_EXAMPLE} /etc/nginx/sites-available/draftsync"
echo "       # ערכו את server_name בקובץ והחליפו ל-domain האמיתי שלכם:"
echo "       sudo nano /etc/nginx/sites-available/draftsync"
echo "       sudo ln -sf /etc/nginx/sites-available/draftsync /etc/nginx/sites-enabled/draftsync"
echo "       sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "  3) הנפיקו תעודת HTTPS עם certbot (החליפו את הדומיין):"
echo "       sudo certbot --nginx -d drafts-api.example.com"
echo "       # certbot יעדכן את ה-Nginx אוטומטית ל-HTTPS ויחדש את התעודה לבד."
echo ""
echo "  4) ודאו שה-firewall מאפשר תעבורת web אם פעיל (ufw):"
echo "       sudo ufw allow 'Nginx Full'"
echo ""
echo "  הערה: certbot אינו מורץ אוטומטית כי הוא דורש דומיין אמיתי שמכוון לשרת."
echo "======================================================================"
echo "[install] סיום. שתהיה לכם הצלחה!"
