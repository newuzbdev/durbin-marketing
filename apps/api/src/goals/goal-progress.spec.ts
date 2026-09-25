import { parseIsoDate } from '../common/dates.js';
import { followerGain, goalProgress, measuredRange } from './goal-progress.js';

const d = parseIsoDate;
const may = { target: 1000, startDate: d('2026-05-01'), endDate: d('2026-05-31') };

describe('goalProgress', () => {
  it('rejadagi misol: 420/1000, 14-may — 42%, 580 qoldi, 18 kun', () => {
    const p = goalProgress({ ...may, current: 420 }, new Date('2026-05-14T12:00:00Z'));
    expect(p).toMatchObject({ percent: 42, remaining: 580, daysLeft: 18, status: 'active' });
    expect(p.expected).toBe(Math.round((1000 * 14) / 31));
  });

  it('boshlanmagan maqsad', () => {
    const p = goalProgress({ ...may, current: 0 }, new Date('2026-04-20T00:00:00Z'));
    expect(p).toMatchObject({ status: 'upcoming', daysLeft: 31, expected: 0 });
  });

  it('muddati tugagan: bajarilmagan va bajarilgan', () => {
    const after = new Date('2026-06-02T00:00:00Z');
    expect(goalProgress({ ...may, current: 700 }, after)).toMatchObject({ status: 'missed', daysLeft: 0, expected: 1000 });
    expect(goalProgress({ ...may, current: 1200 }, after)).toMatchObject({ status: 'achieved', percent: 100, remaining: 0 });
  });

  it('oxirgi kun — 1 kun qoldi', () => {
    expect(goalProgress({ ...may, current: 1 }, new Date('2026-05-31T23:00:00Z')).daysLeft).toBe(1);
  });
});

describe('measuredRange', () => {
  it('bugungacha, tugagan bo‘lsa tugash kunigacha', () => {
    expect(measuredRange(may.startDate, may.endDate, new Date('2026-05-10T09:00:00Z'))).toEqual({
      from: d('2026-05-01'),
      to: d('2026-05-10'),
    });
    expect(measuredRange(may.startDate, may.endDate, new Date('2026-07-01T00:00:00Z'))?.to).toEqual(d('2026-05-31'));
    expect(measuredRange(may.startDate, may.endDate, new Date('2026-04-01T00:00:00Z'))).toBeNull();
  });
});

describe('followerGain', () => {
  it('boshlanishdan oldingi kun asos qilib olinadi', () => {
    const rows = [
      { date: d('2026-05-02'), followers: 1030 },
      { date: d('2026-04-30'), followers: 1000 },
      { date: d('2026-05-01'), followers: 1010 },
    ];
    expect(followerGain(rows, d('2026-05-01'))).toBe(30);
  });

  it('oldingi kun bo‘lmasa — birinchi ma’lum kun; ma’lumot yo‘q — null', () => {
    expect(followerGain([{ date: d('2026-05-03'), followers: 50 }, { date: d('2026-05-05'), followers: 58 }], d('2026-05-01'))).toBe(8);
    expect(followerGain([], d('2026-05-01'))).toBeNull();
  });
});
