import { createHmac, randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Mock Meta rejimida to'liq oqim: ulash → sync → statistika → DM → webhook, hamda tenant izolyatsiyasi.
// Lokal PostgreSQL (DATABASE_URL) kerak.

process.env.META_MODE = 'mock';
process.env.META_APP_SECRET ||= 'test-app-secret';
process.env.META_WEBHOOK_VERIFY_TOKEN = 'verify-me';
process.env.ENCRYPTION_KEY ||= randomBytes(32).toString('base64');
process.env.WEB_ORIGIN = 'http://localhost:3000';

describe('Instagram (e2e, mock)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = randomBytes(4).toString('hex');
  const emails = [`a-${suffix}@test.uz`, `b-${suffix}@test.uz`];
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

  it('OAuth: start → callback → ulanish yaratiladi', async () => {
    const start = await http().get('/api/meta/oauth/start').set(as(a)).expect(200);
    const url = new URL(start.body.url);
    expect(url.pathname).toBe('/api/meta/oauth/callback');

    const cb = await http().get(`${url.pathname}${url.search}`).expect(302);
    expect(cb.headers.location).toBe('http://localhost:3000/marketing/instagram?connected=1');

    const conns = await http().get('/api/meta/connections').set(as(a)).expect(200);
    expect(conns.body).toHaveLength(1);
    expect(conns.body[0]).toMatchObject({ type: 'INSTAGRAM', displayName: 'demo_maktab' });

    const stored = await prisma.metaConnection.findFirstOrThrow({ where: { schoolId: a.schoolId } });
    expect(stored.accessTokenEnc).not.toContain('mock-page-token');
  });

  it("soxta state bilan callback xato bilan qaytaradi", async () => {
    const cb = await http().get('/api/meta/oauth/callback?code=x&state=forged.sig').expect(302);
    expect(cb.headers.location).toContain('error=invalid_state');
  });

  it('sync idempotent: ikki marta sync bir xil qatorlar', async () => {
    const first = await http().post('/api/instagram/sync').set(as(a)).expect(201);
    expect(first.body.days).toBe(30);
    const count = () =>
      Promise.all([
        prisma.igDailyInsight.count({ where: { schoolId: a.schoolId } }),
        prisma.igMedia.count({ where: { schoolId: a.schoolId } }),
        prisma.igMessage.count({ where: { conversation: { schoolId: a.schoolId } } }),
      ]);
    const before = await count();
    // Instagramda o'chirilgan post (Meta ro'yxatida endi yo'q) keyingi sync'da o'chadi
    await prisma.igMedia.create({
      data: { schoolId: a.schoolId, externalId: 'deleted-on-ig', type: 'IMAGE', postedAt: new Date() },
    });
    const second = await http().post('/api/instagram/sync').set(as(a)).expect(201);
    expect(second.body.newMessages).toBe(0);
    expect(await count()).toEqual(before);
    expect(await prisma.igMedia.findFirst({ where: { schoolId: a.schoolId, externalId: 'deleted-on-ig' } })).toBeNull();
  });

  it('overview, media, top-5', async () => {
    const ov = await http().get('/api/instagram/overview?period=last_7d').set(as(a)).expect(200);
    expect(ov.body.series).toHaveLength(7);
    expect(ov.body.totals.reach).toBeGreaterThan(0);
    expect(ov.body.followers.current).toBeGreaterThan(0);

    const media = await http().get('/api/instagram/media?page=1&pageSize=10').set(as(a)).expect(200);
    expect(media.body.items).toHaveLength(10);
    expect(media.body.total).toBe(30);

    const top = await http().get('/api/instagram/media/top?period=last_30d').set(as(a)).expect(200);
    expect(top.body).toHaveLength(5);
    expect(top.body[0].reach).toBeGreaterThanOrEqual(top.body[4].reach);
  });

  it('DM: o‘qish unread’ni nollaydi, javob faqat 24 soat ichida', async () => {
    const list = await http().get('/api/instagram/conversations').set(as(a)).expect(200);
    expect(list.body).toHaveLength(5);
    const open = list.body.find((c: { canReply: boolean }) => c.canReply);
    const closed = list.body.find((c: { canReply: boolean }) => !c.canReply);
    expect(open.unreadCount).toBeGreaterThan(0);

    await http().get(`/api/instagram/conversations/${open.id}/messages`).set(as(a)).expect(200);
    const after = await http().get('/api/instagram/conversations').set(as(a)).expect(200);
    expect(after.body.find((c: { id: string }) => c.id === open.id).unreadCount).toBe(0);

    const sent = await http()
      .post(`/api/instagram/conversations/${open.id}/messages`)
      .set(as(a))
      .send({ text: 'Salom!' })
      .expect(201);
    expect(sent.body).toMatchObject({ direction: 'OUTBOUND', text: 'Salom!' });

    await http()
      .post(`/api/instagram/conversations/${closed.id}/messages`)
      .set(as(a))
      .send({ text: 'Kech qoldik' })
      .expect(409);
  });

  it("tenant izolyatsiyasi: B maktab A'ning ma'lumotini ko'rmaydi", async () => {
    // B foydalanuvchisi A maktab header'i bilan
    await http()
      .get('/api/instagram/overview')
      .set({ Authorization: `Bearer ${b.token}`, 'X-School-Id': a.schoolId })
      .expect(403);

    const convA = await prisma.igConversation.findFirstOrThrow({ where: { schoolId: a.schoolId } });
    await http().get(`/api/instagram/conversations/${convA.id}/messages`).set(as(b)).expect(404);

    const ov = await http().get('/api/instagram/overview').set(as(b)).expect(200);
    expect(ov.body.totals.reach).toBe(0);
  });

  it('webhook: imzosiz rad etiladi, imzoli xabar saqlanadi', async () => {
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'mock-ig-1',
          messaging: [
            {
              sender: { id: 'new-igsid-1' },
              recipient: { id: 'mock-ig-1' },
              timestamp: Date.now(),
              message: { mid: `mid-${suffix}`, text: 'Webhook orqali salom' },
            },
          ],
        },
      ],
    };
    const raw = JSON.stringify(payload);
    await http().post('/api/meta/webhook').set('Content-Type', 'application/json').send(raw).expect(403);

    const sig = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET!).update(raw).digest('hex');
    await http()
      .post('/api/meta/webhook')
      .set({ 'Content-Type': 'application/json', 'X-Hub-Signature-256': sig })
      .send(raw)
      .expect(200);

    const conv = await prisma.igConversation.findFirstOrThrow({
      where: { schoolId: a.schoolId, participantId: 'new-igsid-1' },
    });
    expect(conv.unreadCount).toBe(1);
  });

  it('webhook verify', async () => {
    const res = await http()
      .get('/api/meta/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345')
      .expect(200);
    expect(res.text).toBe('12345');
    await http().get('/api/meta/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1').expect(403);
  });

  it("uzish ulanishni va IG ma'lumotini tozalaydi", async () => {
    await http().delete('/api/meta/connections/INSTAGRAM').set(as(a)).expect(204);
    expect(await prisma.igMedia.count({ where: { schoolId: a.schoolId } })).toBe(0);
    await http().get('/api/meta/connections').set(as(a)).expect(200, []);
  });
});
