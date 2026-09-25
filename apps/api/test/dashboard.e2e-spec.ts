import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Dashboard: bo'sh maktab, keyin Instagram + reklama (mock) ulangan maktab; davr filtri va izolyatsiya.

process.env.META_MODE = 'mock';
process.env.ENCRYPTION_KEY ||= randomBytes(32).toString('base64');
process.env.WEB_ORIGIN = 'http://localhost:3000';

describe('Dashboard (e2e, mock)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = randomBytes(4).toString('hex');
  const emails = [`da-${suffix}@test.uz`, `db-${suffix}@test.uz`];
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

  async function connect(target: 'INSTAGRAM' | 'ADS') {
    const start = await http().get(`/api/meta/oauth/start?target=${target}`).set(as(a)).expect(200);
    const url = new URL(start.body.url);
    await http().get(`${url.pathname}${url.search}`).expect(302);
  }

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

  it('bo‘sh maktab: ulanmagan bo‘limlar null, qolganlari nol', async () => {
    const res = await http().get('/api/dashboard').set(as(b)).expect(200);
    expect(res.body).toMatchObject({
      instagram: null,
      ads: null,
      leads: { total: 0, previous: 0, bySource: {} },
      goals: [],
      contentWeek: { total: 0, published: 0 },
    });
    await http().get('/api/dashboard?period=last_7d').set(as(b)).expect(400); // faqat 3 ta davr
  });

  it('to‘liq maktab: Instagram, reklama, lidlar, maqsadlar va haftalik kontent', async () => {
    await connect('INSTAGRAM');
    await connect('ADS');
    await http().post('/api/instagram/sync').set(as(a)).expect(201);
    await http().post('/api/ads/sync').set(as(a)).expect(201);

    const today = new Date().toISOString().slice(0, 10);
    await http().post('/api/leads').set(as(a)).send({ source: 'TELEGRAM', count: 3, date: today }).expect(201);
    await http()
      .post('/api/goals')
      .set(as(a))
      .send({ name: 'Faol', type: 'LEAD', target: 50, startDate: today, endDate: today })
      .expect(201);
    await http()
      .post('/api/content/posts')
      .set(as(a))
      .send({ type: 'IMAGE', title: 'Hafta posti', scheduledAt: new Date(Date.now() + 3_600_000).toISOString(), autoPublish: false })
      .expect(201);

    const res = await http().get('/api/dashboard?period=this_month').set(as(a)).expect(200);
    const d = res.body;
    expect(d.instagram.followers).toBeGreaterThan(0);
    expect(d.instagram.series.length).toBeGreaterThanOrEqual(1);
    expect(d.ads).toMatchObject({ activeCampaigns: 2, currency: 'UZS' });
    expect(d.ads.spend).toBeGreaterThan(0);
    // Lead Ads (mock) + qo'lda kiritilgan Telegram lidlari
    expect(d.leads.bySource.TELEGRAM).toBe(3);
    expect(d.leads.total).toBeGreaterThanOrEqual(3);
    expect(d.goals.map((g: { name: string }) => g.name)).toContain('Faol');
    expect(d.contentWeek).toMatchObject({ total: 1, scheduled: 1 });

    const week = await http().get('/api/dashboard').set(as(a)).expect(200);
    expect(week.body.instagram.series.length).toBeLessThanOrEqual(7);
  });

  it('izolyatsiya: B maktab A ning ma’lumotini ko‘rmaydi', async () => {
    const res = await http().get('/api/dashboard?period=this_month').set(as(b)).expect(200);
    expect(res.body).toMatchObject({ instagram: null, ads: null, leads: { total: 0 }, goals: [] });
    await http()
      .get('/api/dashboard')
      .set({ Authorization: `Bearer ${b.token}`, 'X-School-Id': a.schoolId })
      .expect(403);
  });
});
