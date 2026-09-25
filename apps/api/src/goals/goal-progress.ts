import type { GoalStatus } from '@durbin/shared';
import { addDays, startOfUtcDay } from '../common/dates.js';

const DAY_MS = 86_400_000;

export interface ProgressInput {
  target: number;
  startDate: Date;
  endDate: Date;
  current: number;
}

export interface Progress {
  percent: number;
  remaining: number;
  daysLeft: number;
  expected: number;
  status: GoalStatus;
}

/** Maqsad holati. Kunlar UTC'da, ikkala chegara ham kiradi. */
export function goalProgress({ target, startDate, endDate, current }: ProgressInput, now = new Date()): Progress {
  const today = startOfUtcDay(now);
  const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1;
  const elapsed = Math.min(totalDays, Math.max(0, Math.round((today.getTime() - startDate.getTime()) / DAY_MS) + 1));

  let status: GoalStatus;
  if (current >= target) status = 'achieved';
  else if (today < startDate) status = 'upcoming';
  else if (today > endDate) status = 'missed';
  else status = 'active';

  return {
    percent: Math.min(100, Math.floor((Math.max(0, current) / target) * 100)),
    remaining: Math.max(0, target - current),
    daysLeft: today > endDate ? 0 : totalDays - Math.max(0, elapsed - 1),
    expected: Math.round((target * elapsed) / totalDays),
    status,
  };
}

/** Hisoblash oralig'i: boshlanishdan bugungacha (tugagan bo'lsa — tugash kunigacha) */
export function measuredRange(startDate: Date, endDate: Date, now = new Date()): { from: Date; to: Date } | null {
  const today = startOfUtcDay(now);
  if (today < startDate) return null;
  return { from: startDate, to: today < endDate ? today : endDate };
}

/** Follower o'sishi: oxirgi ma'lum qiymat − boshlanishdan oldingi kungi (yoki birinchi ma'lum) qiymat */
export function followerGain(rows: { date: Date; followers: number }[], from: Date): number | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const dayBefore = addDays(from, -1).getTime();
  const baseline = sorted.find((r) => r.date.getTime() === dayBefore) ?? sorted[0];
  return Math.max(0, sorted[sorted.length - 1].followers - baseline.followers);
}
