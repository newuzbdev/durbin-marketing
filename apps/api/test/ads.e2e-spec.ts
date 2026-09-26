import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { addDays, startOfUtcDay, toIsoDate } from '../src/common/dates.js';

// Facebook Ads (mock Meta): ulash → sync → overview → holat → yangi kampaniya → Lead Ads → maqsad, tenant izolyatsiyasi.

process.env.META_MODE = 'mock';
process.env.ENCRYPTION_KEY ||= randomBytes(32).toString('base64');
process.env.WEB_ORIGIN = 'http://localhost:3000';

const today = startOfUtcDay(new Date());
const day = (offset: number) => toIsoDate(addDays(today, offset));

describe('Facebook Ads (e2e, mock)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = randomBytes(4).toString('hex');
  const emails = [`aa-${suffix}@test.uz`, `ab-${suffix}@test.uz`];
  let a: { token: string; schoolId: string };
  let b: { token: string; schoolId: string };

  const http = () => request(app.getHttpServer());
  const as = (u: { token: string; schoolId: string }) => ({
    Authorization: `Bearer ${u.token}`,
    'X-School-Id': u.schoolId,
  });

  async function register(email: string) {
    const res = await http()
      .post('/api/auth/register')
      .send({ email, password: 'password123', name: 'Test', schoolName: `Maktab ${email}` })
      .expect(201);
    const me = await http().get('/api/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
    return { token: res.body.accessToken as string, schoolId: me.body.schools[0].id as string };
  }

  async function connect(u: typeof a, target: 'ADS' | 'INSTAGRAM') {
    const start = await http().get(`/api/meta/oauth/start?target=${target}`).set(as(u)).expect(200);
    const url = new URL(start.body.url);
    return http().get(`${url.pathname}${url.search}`).expect(302);
  }

  const campaignBody = (extra: Record<string, unknown> = {}) => ({
    name: 'Kuzgi qabul',
    objective: 'OUTCOME_TRAFFIC',
    dailyBudget: 10_000_000,
    startDate: day(0),
    endDate: day(14),
    audience: { ageMin: 25, ageMax: 45, genders: ['female'], cities: [] },
    ...extra,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    a = await register(emails[0]);
    b = await register(emails[1]);
  });

  afterAll(async () => {
    await prisma.school.deleteMany({ where: { id: { in: [a?.schoolId, b?.schoolId].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('ulanmagan — 503; ulash /marketing/ads ga qaytaradi', async () => {
    await http().get('/api/ads/overview').set(as(a)).expect(503);
    const cb = await connect(a, 'ADS');
    expect(cb.headers.location).toBe('http://localhost:3000/marketing/ads?connected=1');
    const conns = (await http().get('/api/meta/connections').set(as(a)).expect(200)).body;
    expect(conns).toEqual([expect.objectContaining({ type: 'ADS', externalId: 'act_mock1', currency: 'UZS' })]);
    const stored = await prisma.metaConnection.findFirstOrThrow({ where: { schoolId: a.schoolId, type: 'ADS' } });
    expect(stored.expiresAt).not.toBeNull(); // user token ~60 kun
  });

  it('sync idempotent: kampaniyalar va kunlik statistika', async () => {
    const first = await http().post('/api/ads/sync').set(as(a)).expect(201);
    expect(first.body).toMatchObject({ campaigns: 3, days: 3 * 62, leads: 0 }); // IG ulanmagan — Lead Ads yo'q
    const count = () => prisma.adCampaignDailyInsight.count({ where: { campaign: { schoolId: a.schoolId } } });
    const before = await count();
    await http().post('/api/ads/sync').set(as(a)).expect(201);
    expect(await count()).toBe(before);
  });

  it('overview: jami, CTR, reach (takrorlanmas), faollar yuqorida', async () => {
    const ov = (await http().get('/api/ads/overview?period=last_7d').set(as(a)).expect(200)).body;
    expect(ov.currency).toBe('UZS');
    expect(ov.series).toHaveLength(7);
    expect(ov.totals.spend).toBeGreaterThan(0);
    expect(ov.totals.ctr).toBeCloseTo((ov.totals.clicks / ov.totals.impressions) * 100, 1);
    const dailyReach = await prisma.adCampaignDailyInsight.aggregate({
      where: { campaign: { schoolId: a.schoolId }, date: { gte: addDays(today, -6), lte: today } },
      _sum: { reach: true },
    });
    expect(ov.totals.reach).toBeLessThan(dailyReach._sum.reach!);
    expect(ov.campaigns.map((c: { status: string }) => c.status)).toEqual(['ACTIVE', 'ACTIVE', 'PAUSED']);
    expect(ov.campaigns[0].spend).toBeGreaterThanOrEqual(ov.campaigns[1].spend);
  });

  it("holatni o'zgartirish", async () => {
    const ov = (await http().get('/api/ads/overview').set(as(a)).expect(200)).body;
    const paused = ov.campaigns.find((c: { status: string }) => c.status === 'PAUSED');
    await http().patch(`/api/ads/campaigns/${paused.id}/status`).set(as(a)).send({ status: 'ACTIVE' }).expect(204);
    await http().post('/api/ads/sync').set(as(a)).expect(201); // Meta (mock) ham yangilangan
    expect((await prisma.adCampaign.findUniqueOrThrow({ where: { id: paused.id } })).status).toBe('ACTIVE');
    await http().patch(`/api/ads/campaigns/${paused.id}/status`).set(as(a)).send({ status: 'DELETED' }).expect(400);
    await http().patch(`/api/ads/campaigns/${paused.id}/status`).set(as(b)).send({ status: 'PAUSED' }).expect(503);
  });

  it('yangi kampaniya: validatsiya, lid uchun sahifa talabi, PAUSED holatda yaratiladi', async () => {
    await http().post('/api/ads/campaigns').set(as(a)).send(campaignBody({ startDate: day(-1) })).expect(400);
    await http()
      .post('/api/ads/campaigns')
      .set(as(a))
      .send(campaignBody({ audience: { ageMin: 50, ageMax: 20 } }))
      .expect(400);
    const noPage = await http().post('/api/ads/campaigns').set(as(a)).send(campaignBody({ objective: 'OUTCOME_LEADS' })).expect(400);
    expect(noPage.body.message).toContain('Instagram');

    const created = await http().post('/api/ads/campaigns').set(as(a)).send(campaignBody()).expect(201);
    expect(created.body).toMatchObject({ name: 'Kuzgi qabul', status: 'PAUSED', objective: 'OUTCOME_TRAFFIC', dailyBudget: 10_000_000, spend: 0 });

    const cities = await http().get('/api/ads/locations?q=sam').set(as(a)).expect(200);
    expect(cities.body[0]).toMatchObject({ type: 'city', name: 'Samarqand', countryCode: 'UZ' });
    const countries = await http().get('/api/ads/locations?q=united').set(as(a)).expect(200);
    expect(countries.body.map((l: { key: string }) => l.key)).toEqual(['US', 'AE']);

    // Xorijiy auditoriya: davlatlar; noto'g'ri kod — 400
    const abroad = await http()
      .post('/api/ads/campaigns')
      .set(as(a))
      .send(campaignBody({ name: 'Xorij', audience: { ageMin: 20, ageMax: 40, countries: ['US', 'KZ'], cities: [] } }))
      .expect(201);
    expect(abroad.body.status).toBe('PAUSED');
    await http()
      .post('/api/ads/campaigns')
      .set(as(a))
      .send(campaignBody({ audience: { ageMin: 20, ageMax: 40, countries: ['usa'] } }))
      .expect(400);
  });

  it('Lead Ads → FB_ADS lidlar; reklama klik maqsadi hisoblanadi', async () => {
    await connect(a, 'INSTAGRAM');
    const res = await http().post('/api/ads/sync').set(as(a)).expect(201);
    expect(res.body.leads).toBeGreaterThan(0);
    const again = await http().post('/api/ads/sync').set(as(a)).expect(201);
    expect(again.body.leads).toBe(0); // takrorlanmaydi

    const leads = await prisma.lead.findMany({ where: { schoolId: a.schoolId, source: 'FB_ADS' } });
    expect(leads.length).toBe(res.body.leads);
    expect(leads[0].phone).toMatch(/^\+99890/);

    const goal = await http()
      .post('/api/goals')
      .set(as(a))
      .send({ name: 'Klik', type: 'AD_CLICK', target: 1000, startDate: day(-6), endDate: day(10) })
      .expect(201);
    const clicks = await prisma.adCampaignDailyInsight.aggregate({
      where: { campaign: { schoolId: a.schoolId }, date: { gte: addDays(today, -6), lte: today } },
      _sum: { clicks: true },
    });
    expect(goal.body).toMatchObject({ dataMissing: false, current: clicks._sum.clicks });
  });

  it('tenant izolyatsiyasi va uzish', async () => {
    const campaign = await prisma.adCampaign.findFirstOrThrow({ where: { schoolId: a.schoolId } });
    await connect(b, 'ADS');
    await http().patch(`/api/ads/campaigns/${campaign.id}/status`).set(as(b)).send({ status: 'PAUSED' }).expect(404);

    await http().delete('/api/meta/connections/ADS').set(as(a)).expect(204);
    expect(await prisma.adCampaign.count({ where: { schoolId: a.schoolId } })).toBe(0);
    await http().get('/api/ads/overview').set(as(a)).expect(503);
    // Instagram ulanishi joyida qoladi
    const conns = (await http().get('/api/meta/connections').set(as(a)).expect(200)).body;
    expect(conns.map((c: { type: string }) => c.type)).toEqual(['INSTAGRAM']);
  });
});
