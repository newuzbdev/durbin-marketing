import { currencyOffset, fromMinor, toMinor } from '@durbin/shared';
import { adSetBody, geoLocations, graphErrorMessage, pacificOffsetHours } from '../meta/graph-meta-client.js';
import type { CreateCampaignParams } from '../meta/meta-client.js';
import { totals } from './ads.service.js';

const base: CreateCampaignParams = {
  name: 'Qabul',
  objective: 'OUTCOME_TRAFFIC',
  dailyBudget: 10_000_000,
  startTime: new Date('2026-10-01T05:00:00Z'),
  endTime: new Date('2026-10-31T18:59:00Z'),
  ageMin: 25,
  ageMax: 45,
  genders: [],
  countryCodes: [],
  cityKeys: [],
  pageId: 'page-1',
};

describe('adSetBody', () => {
  it('shahar tanlanmasa — butun O‘zbekiston, jins berilmaydi, Advantage audience o‘chiq', () => {
    const b = adSetBody('c1', base);
    expect(b).toMatchObject({
      campaign_id: 'c1',
      daily_budget: 10_000_000,
      status: 'PAUSED',
      optimization_goal: 'LINK_CLICKS',
      targeting: { geo_locations: { countries: ['UZ'] }, age_min: 25, age_max: 45, targeting_automation: { advantage_audience: 0 } },
    });
    expect((b.targeting as Record<string, unknown>).genders).toBeUndefined();
    expect(b.promoted_object).toBeUndefined();
  });

  it('lid kampaniyasi: sahifa promoted_object, forma reklamada; shaharlar va bitta jins', () => {
    const b = adSetBody('c1', { ...base, objective: 'OUTCOME_LEADS', cityKeys: ['123', '456'], genders: ['female'] });
    expect(b).toMatchObject({
      optimization_goal: 'LEAD_GENERATION',
      destination_type: 'ON_AD',
      promoted_object: { page_id: 'page-1' },
      targeting: { geo_locations: { cities: [{ key: '123' }, { key: '456' }] }, genders: [2] },
    });
  });
});

describe('valyuta', () => {
  it('UZS va USD — 1/100, JPY — kasrsiz', () => {
    expect(currencyOffset('UZS')).toBe(100);
    expect(toMinor(150_000, 'UZS')).toBe(15_000_000);
    expect(fromMinor(1999, 'USD')).toBe(19.99);
    expect(toMinor(500, 'JPY')).toBe(500);
  });
});

describe('totals', () => {
  it('yig‘indi va CTR (foiz, 2 xona)', () => {
    const t = totals(
      [
        { spend: 100, clicks: 30, impressions: 1000, leads: 2 },
        { spend: 50, clicks: 3, impressions: 2000, leads: null },
      ],
      1800,
    );
    expect(t).toEqual({ spend: 150, clicks: 33, impressions: 3000, reach: 1800, leads: 2, ctr: 1.1 });
    expect(totals([], null)).toMatchObject({ ctr: 0, reach: null });
  });
});

describe('geoLocations', () => {
  it('bo‘sh — O‘zbekiston; davlatlar va shaharlar birga', () => {
    expect(geoLocations([], [])).toEqual({ countries: ['UZ'] });
    expect(geoLocations(['US', 'KZ'], [])).toEqual({ countries: ['US', 'KZ'] });
    expect(geoLocations(['KZ'], ['2555335'])).toEqual({ countries: ['KZ'], cities: [{ key: '2555335' }] });
  });
});

describe('graphErrorMessage', () => {
  it('Meta’ning aniq foydalanuvchi xabarini "Invalid parameter" dan ustun qo‘yadi', () => {
    expect(
      graphErrorMessage({ message: 'Invalid parameter', code: 100, error_user_msg: 'Page must accept Lead Gen TOS' }),
    ).toBe('Page must accept Lead Gen TOS');
    expect(graphErrorMessage({ message: 'Invalid parameter', error_user_title: 'Budget too low' })).toBe('Budget too low');
    expect(graphErrorMessage({ message: 'Invalid parameter' })).toBe('Invalid parameter');
    expect(graphErrorMessage(undefined)).toBeUndefined();
  });
});

describe('pacificOffsetHours', () => {
  it('yozda -7, qishda -8 (Meta online_followers soatlari shu vaqtda)', () => {
    expect(pacificOffsetHours(new Date('2026-07-01T12:00:00Z'))).toBe(-7);
    expect(pacificOffsetHours(new Date('2026-01-15T12:00:00Z'))).toBe(-8);
  });
});
