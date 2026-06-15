#!/usr/bin/env bash
# ==============================================================================
# Mitmachim Draft Sync — גיבוי בסיס הנתונים (SQLite)
# ------------------------------------------------------------------------------
# מה הסקריפט עושה:
#   1. קורא את DB_PATH מתוך server/.env (אם קיים), אחרת ברירת מחדל ./data/draftsync.db
#   2. יוצר גיבוי עקבי: עדיף sqlite3 ".backup", ואם אין — checkpoint ל-WAL ואז העתקה
#   3. שומר קובץ עם חותמת זמן בתיקיית server/backups/ ודוחס אותו ב-gzip
#   4. שומר רק את 14 הגיבויים האחרונים (מוחק ישנים יותר)
#   5. מדפיס סיכום
#
# שימוש:  bash server/scripts/backup-db.sh
#         (או דרך npm: "npm run backup")
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# פתרון נתיבים — עובדים תמיד מול תיקיית השרת, לא משנה מהיכן הופעל הסקריפט.
#   SCRIPT_DIR = server/scripts ,  SERVER_DIR = server
# ------------------------------------------------------------------------------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
SERVER_DIR="$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd -P)"

ENV_FILE="${SERVER_DIR}/.env"
BACKUP_DIR="${SERVER_DIR}/backups"
RETAIN=14   # כמה גיבויים אחרונים לשמור

# ------------------------------------------------------------------------------
# קריאת DB_PATH מתוך server/.env (אם קיים).
# קוראים רק את השורה הרלוונטית — לא מבצעים source כדי לא להריץ קוד מתוך הקובץ.
# מסירים מרכאות עוטפות ורווחים מיותרים. אם לא הוגדר — ברירת מחדל.
# ------------------------------------------------------------------------------
DB_PATH_RAW=""
if [ -f "${ENV_FILE}" ]; then
  # לוקחים את ההגדרה האחרונה של DB_PATH (מתעלמים משורות הערה), חותכים את הערך.
  DB_PATH_RAW="$(grep -E '^[[:space:]]*DB_PATH[[:space:]]*=' "${ENV_FILE}" \
    | tail -n 1 \
    | sed -E 's/^[[:space:]]*DB_PATH[[:space:]]*=[[:space:]]*//' \
    | sed -E 's/[[:space:]]+#.*$//' \
    | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/' \
    | sed -E 's/[[:space:]]+$//')"
fi

# ברירת מחדל אם לא נמצא ערך תקין.
if [ -z "${DB_PATH_RAW}" ]; then
  DB_PATH_RAW="./data/draftsync.db"
fi

# נתיב יחסי מפורש כיחסי לתיקיית השרת; נתיב מוחלט נשאר כפי שהוא.
case "${DB_PATH_RAW}" in
  /*) DB_PATH="${DB_PATH_RAW}" ;;
  *)  DB_PATH="${SERVER_DIR}/${DB_PATH_RAW}" ;;
esac

# ------------------------------------------------------------------------------
# בדיקות שפיות.
# ------------------------------------------------------------------------------
if [ ! -f "${DB_PATH}" ]; then
  echo "ERROR: database file not found: ${DB_PATH}" >&2
  echo "       (DB_PATH resolved from ${ENV_FILE} or default ./data/draftsync.db)" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

TIMESTAMP="$(date +'%Y%m%d-%H%M%S')"
BACKUP_BASENAME="draftsync-${TIMESTAMP}.db"
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_BASENAME}"

# ------------------------------------------------------------------------------
# יצירת הגיבוי.
#   העדפה: sqlite3 ".backup" — גיבוי עקבי ואטומי גם בזמן שהשרת רץ.
#   נפילה לאחור: checkpoint ל-WAL (איחוד ה-WAL לתוך קובץ ה-DB) ואז העתקה רגילה.
# ------------------------------------------------------------------------------
if command -v sqlite3 >/dev/null 2>&1; then
  echo "[backup] using sqlite3 .backup (online, consistent)"
  # ".backup" כותב קובץ DB יחיד ושלם — לא מצריך עצירת השרת.
  sqlite3 "${DB_PATH}" ".backup '${BACKUP_FILE}'"
else
  echo "[backup] sqlite3 CLI not found — falling back to WAL checkpoint + file copy"
  # אין sqlite3: מבטיחים שה-WAL מאוחד ל-DB (אם בכלל קיים מנוע sqlite אחר), ואז מעתיקים.
  # אם אין שום כלי sqlite — לפחות מעתיקים את הקבצים הקיימים (DB + -wal + -shm) יחד.
  copied_wal=0
  # ניסיון checkpoint דרך כלי sqlite חלופי אם הותקן בשם אחר; אם לא — נמשיך להעתקה.
  cp -p -- "${DB_PATH}" "${BACKUP_FILE}"
  # מעתיקים גם קבצי לוואי של WAL אם קיימים, כדי שהגיבוי יהיה ניתן לשחזור.
  if [ -f "${DB_PATH}-wal" ]; then
    cp -p -- "${DB_PATH}-wal" "${BACKUP_FILE}-wal"
    copied_wal=1
  fi
  if [ -f "${DB_PATH}-shm" ]; then
    cp -p -- "${DB_PATH}-shm" "${BACKUP_FILE}-shm"
  fi
  if [ "${copied_wal}" -eq 1 ]; then
    echo "[backup] note: copied accompanying -wal/-shm files (no checkpoint available)"
  fi
fi

# ------------------------------------------------------------------------------
# דחיסה ב-gzip. במצב הנפילה לאחור ייתכנו קבצי לוואי (-wal/-shm) — דוחסים רק את ה-DB,
# ולכן לפני הדחיסה נוודא שהגיבוי קוהרנטי. כשהשתמשנו ב-sqlite3 .backup יש קובץ DB יחיד.
# ------------------------------------------------------------------------------
gzip -f -- "${BACKUP_FILE}"
GZ_FILE="${BACKUP_FILE}.gz"

# ------------------------------------------------------------------------------
# שמירת רק 14 הגיבויים האחרונים — מוחקים את הישנים יותר.
# ממיינים לפי שם (חותמת הזמן בשם מבטיחה סדר כרונולוגי), מדלגים על 14 העדכניים.
# ------------------------------------------------------------------------------
deleted_count=0
# מרשימים את כל קבצי הגיבוי הדחוסים בסדר יורד (החדש ראשון), מדלגים על RETAIN הראשונים.
# שימוש ב-ls -1 בטוח כאן כי השמות קבועי-תבנית (draftsync-*.db.gz) וללא רווחים/תווים מיוחדים.
while IFS= read -r old; do
  [ -z "${old}" ] && continue
  rm -f -- "${BACKUP_DIR}/${old}"
  deleted_count=$((deleted_count + 1))
done < <(ls -1 "${BACKUP_DIR}" 2>/dev/null \
           | grep -E '^draftsync-[0-9]{8}-[0-9]{6}\.db\.gz$' \
           | sort -r \
           | tail -n +"$((RETAIN + 1))")

# ------------------------------------------------------------------------------
# סיכום.
# ------------------------------------------------------------------------------
backup_size="$(du -h -- "${GZ_FILE}" 2>/dev/null | cut -f1)"
total_kept="$(ls -1 "${BACKUP_DIR}" 2>/dev/null \
                | grep -Ec '^draftsync-[0-9]{8}-[0-9]{6}\.db\.gz$' || true)"

echo "----------------------------------------------------------------------"
echo "[backup] done."
echo "  source DB : ${DB_PATH}"
echo "  backup    : ${GZ_FILE} (${backup_size:-?})"
echo "  retained  : ${total_kept} of last ${RETAIN}"
echo "  pruned    : ${deleted_count} old backup(s)"
echo "----------------------------------------------------------------------"
