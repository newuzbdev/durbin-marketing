import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { LeadSourcesService, TG_GREETING, TG_THANKS } from '../src/goals/lead-sources.service.js';
import {
  TELEGRAM_API,
  TelegramApiError,
  type TelegramApi,
  type TgReplyMarkup,
  type TgUpdate,
} from '../src/telegram/telegram-api.js';

// Avtomatik lid manbalari: Telegram bot (soxta Bot API) va Instagram Direct (mock Meta).

process.env.META_MODE = 'mock';
process.env.ENCRYPTION_KEY ||= randomBytes(32).toString('base64');
process.env.WEB_ORIGIN = 'http://localhost:3000';

/** Faqat shu test yaratgan tokenlarga javob beradi — dev bazadagi haqiqiy botlarga tegmaydi */
class FakeTelegram implements TelegramApi {
  updates = new Map<string, TgUpdate[]>();
  revoked = new Set<string>();
  sent: { token: string; chatId: number; text: string; markup?: TgReplyMarkup }[] = [];

  async getMe(token: string) {
    if (token.startsWith('999')) throw new TelegramApiError('Unauthorized', 401);
    const id = Number(token.split(':')[0]);
    return { id, is_bot: true, first_name: 'Bot', username: `maktab${id}_bot` };
  }
  async deleteWebhook() {}
  async getUpdates(token: string, offset: number) {
    if (this.revoked.has(token)) throw new TelegramApiError('Unauthorized', 401);
    return (this.updates.get(token) ?? []).filter((u) => u.update_id >= offset);
  }
  async sendMessage(token: string, chatId: number, text: string, markup?: TgReplyMarkup) {
    this.sent.push({ token, chatId, text, markup });
  }
}

describe('Lid manbalari (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sources: LeadSourcesService;
  const tg = new FakeTelegram();
  const suffix = randomBytes(4).toString('hex');
  const botNum = 100000 + Math.floor(Math.random() * 800000);
  const token = `${botNum}:${randomBytes(20).toString('hex')}`;
  const emails = [`la-${suffix}@test.uz`, `lb-${suffix}@test.uz`];
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

  let updateId = 1000;
  const msg = (fromId: number, extra: Record<string, unknown>, chatType = 'private'): TgUpdate => ({
    update_id: ++updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: fromId, type: chatType as 'private' },
      from: { id: fromId, is_bot: false, first_name: 'Aziza', last_name: 'Karimova', username: 'aziza_k' },
      ...extra,
    },
  });
  const push = (...u: TgUpdate[]) => tg.updates.set(token, [...(tg.updates.get(token) ?? []), ...u]);
  const tgLead = (userId: number) =>
    prisma.lead.findFirst({ where: { schoolId: a.schoolId, source: 'TELEGRAM', externalId: `tg:${userId}` } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_API)
      .useValue(tg)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    sources = app.get(LeadSourcesService);
    a = await register(emails[0]);
    b = await register(emails[1]);
  });

  afterAll(async () => {
    await prisma.school.deleteMany({ where: { id: { in: [a?.schoolId, b?.schoolId].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('Telegram ulash: noto‘g‘ri token 400, boshqa maktabdagi bot 409', async () => {
    await http().post('/api/leads/sources/telegram').set(as(a)).send({ token: 'abc' }).expect(400);
    await http()
      .post('/api/leads/sources/telegram')
      .set(as(a))
      .send({ token: `999999:${'x'.repeat(35)}` })
      .expect(400);

    const res = await http().post('/api/leads/sources/telegram').set(as(a)).send({ token }).expect(201);
    expect(res.body.telegram).toMatchObject({ username: `maktab${botNum}_bot`, lastError: null });
    expect(res.body.telegram.link).toBe(`https://t.me/maktab${botNum}_bot`);

    await http().post('/api/leads/sources/telegram').set(as(b)).send({ token }).expect(409);
    const stored = await prisma.telegramBot.findUniqueOrThrow({ where: { schoolId: a.schoolId } });
    expect(stored.tokenEnc).not.toContain(token.split(':')[1]);
  });

  it('/start → lid + raqam so‘rash; o‘z kontakti → telefon + rahmat; takror hisoblanmaydi', async () => {
    push(msg(111, { text: '/start' }));
    await sources.pollTelegram();
    const lead = await tgLead(111);
    expect(lead).toMatchObject({ name: 'Aziza Karimova (@aziza_k)', phone: null, count: 1 });
    const greet = tg.sent.at(-1)!;
    expect(greet).toMatchObject({ chatId: 111, text: TG_GREETING });
    expect(greet.markup).toMatchObject({ keyboard: [[{ request_contact: true }]] });

    push(
      msg(111, { contact: { phone_number: '+998901112233', first_name: 'Aziza', user_id: 111 } }),
      msg(111, { text: '/start' }),
      msg(222, { text: 'salom' }, 'group'),
      msg(333, { contact: { phone_number: '+998900000000', first_name: 'Boshqa', user_id: 444 } }),
    );
    const sentBefore = tg.sent.length;
    await sources.pollTelegram();
    expect((await tgLead(111))?.phone).toBe('+998901112233');
    const replies = tg.sent.slice(sentBefore);
    expect(replies.filter((s) => s.chatId === 111).map((s) => s.text)).toEqual([TG_THANKS]); // telefon bor — qayta so'ramaydi
    expect(await tgLead(222)).toBeNull(); // guruh
    expect((await tgLead(333))?.phone).toBeNull(); // boshqa odamning kontakti

    // Qayta polling — offset tufayli hech narsa takrorlanmaydi
    const count = await prisma.lead.count({ where: { schoolId: a.schoolId, source: 'TELEGRAM' } });
    await sources.pollTelegram();
    expect(await prisma.lead.count({ where: { schoolId: a.schoolId, source: 'TELEGRAM' } })).toBe(count);
  });

  it('bekor qilingan token — lastError UI’da ko‘rinadi', async () => {
    tg.revoked.add(token);
    await sources.pollTelegram();
    const res = await http().get('/api/leads/sources').set(as(a)).expect(200);
    expect(res.body.telegram.lastError).toContain('qayta ulang');
    tg.revoked.delete(token);
    // Qayta ulash xatoni tozalaydi
    const re = await http().post('/api/leads/sources/telegram').set(as(a)).send({ token }).expect(201);
    expect(re.body.telegram.lastError).toBeNull();
  });

  it('Instagram: qo‘lda belgilash / bekor qilish', async () => {
    const start = await http().get('/api/meta/oauth/start').set(as(a)).expect(200);
    const url = new URL(start.body.url);
    await http().get(`${url.pathname}${url.search}`).expect(302);
    await http().post('/api/instagram/sync').set(as(a)).expect(201);

    const convs = (await http().get('/api/instagram/conversations').set(as(a)).expect(200)).body;
    expect(convs.every((c: { isLead: boolean }) => !c.isLead)).toBe(true);
    const conv = convs[0];

    await http().post(`/api/leads/instagram/${conv.id}`).set(as(a)).expect(204);
    await http().post(`/api/leads/instagram/${conv.id}`).set(as(a)).expect(204); // idempotent
    let after = (await http().get('/api/instagram/conversations').set(as(a)).expect(200)).body;
    expect(after.find((c: { id: string }) => c.id === conv.id).isLead).toBe(true);
    const leads = (await http().get('/api/leads').set(as(a)).expect(200)).body.items;
    expect(leads.filter((l: { source: string }) => l.source === 'INSTAGRAM')).toHaveLength(1);

    await http().delete(`/api/leads/instagram/${conv.id}`).set(as(a)).expect(204);
    after = (await http().get('/api/instagram/conversations').set(as(a)).expect(200)).body;
    expect(after.find((c: { id: string }) => c.id === conv.id).isLead).toBe(false);
    const leadsAfter = (await http().get('/api/leads').set(as(a)).expect(200)).body.items;
    expect(leadsAfter.filter((l: { source: string }) => l.source === 'INSTAGRAM')).toHaveLength(0);

    await http().post(`/api/leads/instagram/${conv.id}`).set(as(b)).expect(404);
  });

  it('Instagram avtomatik: faqat yoqilgandan keyin yangi yozganlar, bekor qilingani qaytmaydi', async () => {
    const res = await http().put('/api/leads/sources/instagram').set(as(a)).send({ enabled: true }).expect(200);
    expect(res.body.instagram).toEqual({ connected: true, autoLeads: true });

    const before = await prisma.lead.count({ where: { schoolId: a.schoolId, source: 'INSTAGRAM', count: { gt: 0 } } });
    await sources.captureInstagram();
    // Eski suhbatlar (yoqilishdan oldin paydo bo'lgan) lid bo'lmaydi
    expect(await prisma.lead.count({ where: { schoolId: a.schoolId, source: 'INSTAGRAM', count: { gt: 0 } } })).toBe(before);

    // Yangi odam yozdi
    const now = new Date();
    const conv = await prisma.igConversation.create({
      data: { schoolId: a.schoolId, participantId: `new-${suffix}`, participantName: 'yangi_ota_ona', lastMessageAt: now, lastInboundAt: now },
    });
    await prisma.igMessage.create({
      data: { conversationId: conv.id, externalId: `m-${suffix}`, direction: 'INBOUND', text: 'Qabul qachon?', sentAt: now },
    });
    await sources.captureInstagram();
    const lead = await prisma.lead.findFirstOrThrow({
      where: { schoolId: a.schoolId, source: 'INSTAGRAM', externalId: `ig:new-${suffix}` },
    });
    expect(lead).toMatchObject({ name: 'yangi_ota_ona', count: 1 });

    // Lid emas deb bekor qilinsa — keyingi aylanishda qayta qo'shilmaydi
    await http().delete(`/api/leads/instagram/${conv.id}`).set(as(a)).expect(204);
    await sources.captureInstagram();
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).count).toBe(0);

    // Lidlar ro'yxatidan o'chirish ham count=0 qiladi (qayta paydo bo'lmasligi uchun)
    await http().post(`/api/leads/instagram/${conv.id}`).set(as(a)).expect(204);
    await http().delete(`/api/leads/${lead.id}`).set(as(a)).expect(204);
    await sources.captureInstagram();
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).count).toBe(0);
  });

  it('lid maqsadi Telegram va Instagram lidlarini hisoblaydi', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const g = await http()
      .post('/api/goals')
      .set(as(a))
      .send({ name: 'Lidlar', type: 'LEAD', target: 10, startDate: today, endDate: today })
      .expect(201);
    expect(g.body.bySource.TELEGRAM).toBe(2); // 111 va 333
    expect(g.body.bySource.INSTAGRAM ?? 0).toBe(0); // ikkalasi ham bekor qilingan
  });

  it('Telegram uzish', async () => {
    await http().delete('/api/leads/sources/telegram').set(as(a)).expect(204);
    expect((await http().get('/api/leads/sources').set(as(a)).expect(200)).body.telegram).toBeNull();
    await http().delete('/api/leads/sources/telegram').set(as(a)).expect(404);
  });
});
