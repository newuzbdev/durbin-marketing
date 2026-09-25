import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { addDays, startOfUtcDay, toIsoDate } from '../src/common/dates.js';

// Maqsadlar: CRUD, lid kiritish, har bir tur bo'yicha progress (Instagram — mock sync), tenant izolyatsiyasi.

process.env.META_MODE = 'mock';
process.env.ENCRYPTION_KEY ||= randomBytes(32).toString('base64');
process.env.WEB_ORIGIN = 'http://localhost:3000';

const today = startOfUtcDay(new Date());
const day = (offset: number) => toIsoDate(addDays(today, offset));

describe('Maqsadlar (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = randomBytes(4).toString('hex');
  const emails = [`ga-${suffix}@test.uz`, `gb-${suffix}@test.uz`];
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

  const goal = (body: Record<string, unknown>) =>
    http()
      .post('/api/goals')
      .set(as(a))
      .send({ name: 'Maqsad', type: 'LEAD', target: 100, startDate: day(-9), endDate: day(20), ...body })
      .expect(201)
      .then((r) => r.body);

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

  it('lid maqsadi: faqat oraliqdagi lidlar, manbalar bo‘yicha', async () => {
    const g = await goal({ name: '100 lid' });
    expect(g).toMatchObject({ current: 0, percent: 0, status: 'active', daysLeft: 21, bySource: {} });

    for (const lead of [
      { source: 'INSTAGRAM', count: 12, date: day(-2) },
      { source: 'TELEGRAM', count: 8, date: day(0), name: 'Aziza', phone: '+998901234567' },
      { source: 'MANUAL', count: 50, date: day(-30) }, // oraliqdan tashqari
    ]) {
      await http().post('/api/leads').set(as(a)).send(lead).expect(201);
    }
    await http().post('/api/leads').set(as(a)).send({ source: 'MANUAL', count: 1, date: day(1) }).expect(400);
    await http().post('/api/leads').set(as(a)).send({ source: 'WEBHOOK', count: 1, date: day(0) }).expect(400);

    const list = await http().get('/api/goals').set(as(a)).expect(200);
    const updated = list.body.find((x: { id: string }) => x.id === g.id);
    expect(updated).toMatchObject({ current: 20, percent: 20, remaining: 80, bySource: { INSTAGRAM: 12, TELEGRAM: 8 } });

    const leads = await http().get('/api/leads?page=1&pageSize=2').set(as(a)).expect(200);
    expect(leads.body).toMatchObject({ total: 3, pageSize: 2 });
    expect(leads.body.items[0]).toMatchObject({ source: 'TELEGRAM', name: 'Aziza' });
  });

  it('follower va reach: Instagram ulanmagan — dataMissing, ulangach hisoblanadi', async () => {
    const f = await goal({ type: 'FOLLOWER', target: 500, startDate: day(-7), endDate: day(7) });
    const r = await goal({ type: 'REACH', target: 100000, startDate: day(-6), endDate: day(0) });
    expect(f.dataMissing).toBe(true);
    expect(r.dataMissing).toBe(true);

    const start = await http().get('/api/meta/oauth/start').set(as(a)).expect(200);
    const url = new URL(start.body.url);
    await http().get(`${url.pathname}${url.search}`).expect(302);
    await http().post('/api/instagram/sync').set(as(a)).expect(201);

    const reachSum = await prisma.igDailyInsight.aggregate({
      where: { schoolId: a.schoolId, date: { gte: addDays(today, -6), lte: today } },
      _sum: { reach: true },
    });
    const list = (await http().get('/api/goals').set(as(a)).expect(200)).body;
    const fr = list.find((x: { id: string }) => x.id === f.id);
    const rr = list.find((x: { id: string }) => x.id === r.id);
    expect(rr).toMatchObject({ dataMissing: false, current: reachSum._sum.reach });
    expect(fr.dataMissing).toBe(false);
    expect(fr.current).toBeGreaterThan(0); // mock: kuniga ~5 follower
  });

  it('reklama klik: kampaniya yo‘q — dataMissing', async () => {
    const g = await goal({ type: 'AD_CLICK', target: 300 });
    expect(g).toMatchObject({ current: 0, dataMissing: true });
  });

  it('validatsiya, tahrirlash, tartib va o‘chirish', async () => {
    await http()
      .post('/api/goals')
      .set(as(a))
      .send({ name: 'X', type: 'LEAD', target: 10, startDate: day(5), endDate: day(1) })
      .expect(400);

    const future = await goal({ name: 'Kelgusi', startDate: day(10), endDate: day(40) });
    expect(future.status).toBe('upcoming');
    await http().patch(`/api/goals/${future.id}`).set(as(a)).send({ endDate: day(5) }).expect(400);
    const edited = await http().patch(`/api/goals/${future.id}`).set(as(a)).send({ target: 999 }).expect(200);
    expect(edited.body).toMatchObject({ target: 999, name: 'Kelgusi', type: 'LEAD' });

    const list = (await http().get('/api/goals').set(as(a)).expect(200)).body as { status: string }[];
    const order = { active: 0, upcoming: 1, achieved: 2, missed: 3 } as Record<string, number>;
    const ranks = list.map((g) => order[g.status]);
    expect(ranks).toEqual(ranks.toSorted((x, y) => x - y));

    await http().delete(`/api/goals/${future.id}`).set(as(a)).expect(204);
  });

  it('tenant izolyatsiyasi', async () => {
    const g = await goal({ name: 'Maxfiy' });
    await http().get('/api/goals').set(as(b)).expect(200, []);
    await http().patch(`/api/goals/${g.id}`).set(as(b)).send({ target: 1 }).expect(404);
    await http().delete(`/api/goals/${g.id}`).set(as(b)).expect(404);

    const lead = (await http().get('/api/leads').set(as(a)).expect(200)).body.items[0];
    await http().delete(`/api/leads/${lead.id}`).set(as(b)).expect(404);
    expect((await http().get('/api/leads').set(as(b)).expect(200)).body.total).toBe(0);
    await http().delete(`/api/leads/${lead.id}`).set(as(a)).expect(204);
  });
});
