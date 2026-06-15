/** Current time as an ISO‑8601 string in UTC. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** ISO string for `days` days from now (negative = in the past). */
export function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** True if `iso` represents a time strictly before now. Null/empty => never expires. */
export function isPast(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return t < Date.now();
}
