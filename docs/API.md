# API Reference — Mitmachim Draft Sync

המסמך הזה הוא **חוזה ה‑API הרשמי** בין התוסף לשרת. כל שינוי כאן חייב להתבצע בשני הצדדים.

- כל הנתיבים תחת `/api` (חוץ מ‑`/health`).
- כל גוף בקשה ותגובה הוא `application/json` בקידוד UTF‑8.
- אימות: כותרת `Authorization: Bearer <accessToken>` בכל נתיב שמסומן 🔒.
- זמנים: מחרוזות ISO‑8601 ב‑UTC (לדוגמה `2026-06-15T10:20:30.000Z`).
- **השרת לעולם לא רואה תוכן גלוי.** שדות `encrypted*` הם מחרוזות אטומות שהוצפנו בצד הלקוח (ראו `docs/SECURITY.md`).

---

## מעטפת שגיאה אחידה

לכל שגיאה השרת מחזיר קוד HTTP מתאים וגוף בצורה:

```json
{ "ok": false, "error": "INVALID_SYNC_KEY", "message": "תיאור קריא (לא חושף מידע רגיש)" }
```

לשגיאות ולידציה (`400`):

```json
{ "ok": false, "error": "VALIDATION", "issues": [{ "path": "type", "message": "..." }] }
```

קודי `error` נפוצים: `VALIDATION`, `UNAUTHORIZED`, `INVALID_SYNC_KEY`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `INTERNAL`.

---

## טיפוסים משותפים

### DraftDTO — מה שהשרת מחזיר

```ts
interface DraftDTO {
  id: string;
  type: 'topic' | 'reply' | 'edit';
  localDraftKey: string;
  encryptedTitle: string | null;   // מוצפן (envelope), null אם אין כותרת
  encryptedContent: string;        // מוצפן (envelope)
  encryptionIv: string | null;     // metadata עזר (ה‑IV מוטמע גם במעטפה)
  encryptionSalt: string | null;   // גרסת/מזהה סכמת ההצפנה
  categoryId: string | null;
  topicId: string | null;
  postId: string | null;
  url: string | null;
  deviceId: string | null;         // המכשיר ששמר לאחרונה
  deviceName: string | null;       // שם קריא של אותו מכשיר
  clientUpdatedAt: string | null;  // לפי שעון הלקוח
  serverUpdatedAt: string;         // לפי שעון השרת (קובע לזיהוי קונפליקט)
  createdAt: string;
  deletedAt: string | null;        // לא null => נמחקה רכה
}
```

### DraftUpsert — מה שהלקוח שולח

```ts
interface DraftUpsert {
  type: 'topic' | 'reply' | 'edit';
  localDraftKey: string;                 // חובה, מזהה יציב של הטיוטה
  encryptedContent: string;              // חובה (≤ 100KB)
  encryptedTitle?: string | null;        // ≤ 20KB
  encryptionIv?: string | null;
  encryptionSalt?: string | null;
  categoryId?: string | null;
  topicId?: string | null;
  postId?: string | null;
  url?: string | null;                   // ≤ 2000 תווים
  clientUpdatedAt?: string;              // ISO; ברירת מחדל = עכשיו
  expectedServerUpdatedAt?: string | null; // לזיהוי קונפליקט (אופציונלי)
}
```

---

## Health

### `GET /health`
ללא אימות. בדיקת חיים.

```json
{ "ok": true, "version": "1.0.0", "time": "2026-06-15T10:20:30.000Z", "uptimeSec": 1234 }
```

---

## Auth

### `POST /api/auth/create-sync-key`
יוצר משתמש חדש, מנפיק Sync Key ו‑access token למכשיר הנוכחי.

בקשה:
```json
{ "deviceName": "מחשב בית" }
```

תגובה `200`:
```json
{
  "syncKey": "MTD-7Q4K-2H9P-X7P2",
  "accessToken": "<opaque-token>",
  "deviceId": "<uuid>",
  "userId": "<uuid>"
}
```

> ⚠️ ה‑`syncKey` מוחזר **פעם אחת בלבד**. השרת שומר רק HMAC שלו ואינו יכול לשחזר אותו.

### `POST /api/auth/login`
מחבר מכשיר נוסף לאותו משתמש באמצעות Sync Key קיים.

בקשה:
```json
{ "syncKey": "MTD-7Q4K-2H9P-X7P2", "deviceName": "מחשב עבודה" }
```

תגובה `200`:
```json
{ "accessToken": "<opaque-token>", "deviceId": "<uuid>", "userId": "<uuid>" }
```

שגיאה `401`: `{ "ok": false, "error": "INVALID_SYNC_KEY" }`

### `POST /api/auth/logout` 🔒
מבטל את ה‑token הנוכחי ומסמן את המכשיר כמנותק.

תגובה `200`: `{ "ok": true }`

---

## Devices 🔒

### `GET /api/devices`
```json
{
  "devices": [
    {
      "id": "<uuid>", "deviceName": "מחשב בית",
      "createdAt": "...", "lastSeenAt": "...", "revokedAt": null,
      "current": true
    }
  ]
}
```

---

## Drafts 🔒

### `GET /api/drafts`
פרמטרים אופציונליים: `since` (ISO — רק טיוטות שעודכנו אחרי), `includeDeleted` (`true`/`false`, ברירת מחדל `false`).
```json
{ "drafts": [ /* DraftDTO[] */ ] }
```

### `GET /api/drafts/match`
מחזיר את הטיוטה המתאימה ביותר לקונטקסט הנוכחי, או `null`.
פרמטרים: `type` (חובה), `localDraftKey` (חובה), `topicId`, `postId`, `categoryId`.
סדר העדפה: התאמה לפי `postId` (edit) → `topicId` (reply) → `localDraftKey` → `categoryId+type` (topic).
```json
{ "draft": null }
```

### `GET /api/drafts/:id`
```json
{ "draft": { /* DraftDTO */ } }
```
`404` אם לא קיימת/לא שייכת למשתמש.

### `POST /api/drafts`  (upsert לפי `localDraftKey`)
גוף: `DraftUpsert`.

הצלחה `200`:
```json
{ "ok": true, "draft": { /* DraftDTO */ } }
```

קונפליקט `409` (אם נשלח `expectedServerUpdatedAt` והשרת מחזיק גרסה חדשה יותר):
```json
{ "ok": false, "code": "CONFLICT", "serverDraft": { /* DraftDTO */ } }
```

לוגיקת ה‑upsert:
1. מחפשים טיוטה קיימת לפי `(userId, localDraftKey, deletedAt IS NULL)`.
2. אם אין — יוצרים חדשה.
3. אם יש ונשלח `expectedServerUpdatedAt` שאינו תואם ל‑`serverUpdatedAt` הנוכחי, **וגם** ה‑`clientUpdatedAt` שבשרת חדש מזה שנשלח → מחזירים `CONFLICT`.
4. אחרת — מעדכנים (last‑write‑wins).

### `PATCH /api/drafts/:id`
עדכון חלקי של טיוטה קיימת (אותם שדות כמו `DraftUpsert`, כולם אופציונליים). מחזיר `{ ok: true, draft }`.

### `DELETE /api/drafts/:id`
מחיקה רכה כברירת מחדל (`deletedAt`). `?hard=true` למחיקה מלאה.
```json
{ "ok": true }
```

### `POST /api/sync/pending`
סנכרון אצווה של פריטים מהתור המקומי (offline).
בקשה: `{ "items": DraftUpsert[] }` (עד 50 פריטים).
```json
{
  "results": [
    { "localDraftKey": "...", "ok": true, "draft": { /* DraftDTO */ } },
    { "localDraftKey": "...", "ok": false, "code": "CONFLICT", "serverDraft": { /* ... */ } }
  ]
}
```

---

## הגבלות ולידציה (נאכפות ב‑Zod בשרת)

| שדה | מגבלה |
|------|--------|
| `type` | אחד מ‑`topic` \| `reply` \| `edit` |
| `localDraftKey` | חובה, 1–512 תווים |
| `encryptedContent` | חובה, עד 100KB |
| `encryptedTitle` | עד 20KB |
| `url` | עד 2000 תווים |
| גוף הבקשה כולו | עד `MAX_BODY_BYTES` (ברירת מחדל ~1.5MB) |
| שדות לא צפויים | נדחים (`strict`) |
