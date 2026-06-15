// Small formatting helpers shared by content script and popup.

import type { DraftType } from './types';

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 10) return 'הרגע';
  if (sec < 60) return `לפני ${sec} שניות`;
  const min = Math.round(sec / 60);
  if (min < 60) return `לפני ${min} דקות`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `לפני ${hr} שעות`;
  const days = Math.round(hr / 24);
  if (days < 30) return `לפני ${days} ימים`;
  const months = Math.round(days / 30);
  if (months < 12) return `לפני ${months} חודשים`;
  return `לפני ${Math.round(months / 12)} שנים`;
}

export function truncate(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

export const TYPE_LABEL: Record<DraftType, string> = {
  topic: 'נושא חדש',
  reply: 'תגובה',
  edit: 'עריכה',
};
