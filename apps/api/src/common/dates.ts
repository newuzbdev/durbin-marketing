import type { Period } from '@durbin/shared';

// Sanalar UTC'da "kun" sifatida saqlanadi (@db.Date). Hisob-kitoblar shu kunlar bo'yicha.
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

export function parseIsoDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** [from, to] — ikkala chegara ham kiradi */
export function periodRange(period: Period, now = new Date()): { from: Date; to: Date } {
  const today = startOfUtcDay(now);
  if (period === 'this_week') {
    const dow = (today.getUTCDay() + 6) % 7; // dushanba = 0
    return { from: addDays(today, -dow), to: today };
  }
  if (period === 'this_month') {
    return { from: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), to: today };
  }
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  return { from, to };
}
