import { format, formatDistanceToNow } from 'date-fns';
import { uz } from 'date-fns/locale';

const numberFmt = new Intl.NumberFormat('ru-RU'); // 12 345 — bo'sh joy bilan guruhlash
const compactFmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtNumber = (n: number) => numberFmt.format(n);
export const fmtCompact = (n: number) => compactFmt.format(n);

/** +12% / −5% ; oldingi qiymat 0 bo'lsa null */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export const fmtSigned = (n: number) => (n > 0 ? `+${fmtNumber(n)}` : n < 0 ? `−${fmtNumber(-n)}` : '0');

/** "24-sen" — grafik o'qi uchun qisqa */
export const fmtDayShort = (iso: string) => format(new Date(`${iso}T00:00:00`), 'd MMM', { locale: uz });
export const fmtDate = (iso: string) => format(new Date(iso), 'd MMMM yyyy', { locale: uz });
export const fmtDateTime = (iso: string) => format(new Date(iso), 'd MMM, HH:mm', { locale: uz });
export const fmtTime = (iso: string) => format(new Date(iso), 'HH:mm', { locale: uz });
export const fmtAgo = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true, locale: uz });
