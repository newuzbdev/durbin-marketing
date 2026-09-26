import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ReplicateClient, type GenerateInput } from '../src/ai/replicate-client.js';

// AI Yordamchi: Replicate o'rniga soxta mijoz (pul sarflanmaydi). Tahlil, taklif, ssenariy, chat va izolyatsiya.

process.env.META_MODE = 'mock';
process.env.ENCRYPTION_KEY ||= randomBytes(32).toString('base64');
process.env.WEB_ORIGIN = 'http://localhost:3000';

class FakeReplicate {
  readonly model = 'fake/model';
  readonly configured = true;
  calls: GenerateInput[] = [];
  next: string[] = [];

  async generate(input: GenerateInput) {
    this.calls.push(input);
    return this.next.shift() ?? 'Javob';
  }
}

describe('AI Yordamchi (e2e, soxta Replicate)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ai = new FakeReplicate();
  const suffix = randomBytes(4).toString('hex');
  const emails = [`ia-${suffix}@test.uz`, `ib-${suffix}@test.uz`];
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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ReplicateClient)
      .useValue(ai)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    a = await register(emails[0]);
    b = await register(emails[1]);

    // Kontekst uchun: Instagram (mock) va bitta maqsad
    const start = await http().get('/api/meta/oauth/start').set(as(a)).expect(200);
    const url = new URL(start.body.url);
    await http().get(`${url.pathname}${url.search}`).expect(302);
    await http().post('/api/instagram/sync').set(as(a)).expect(201);
    const today = new Date().toISOString().slice(0, 10);
    await http()
      .post('/api/goals')
      .set(as(a))
      .send({ name: '100 lid', type: 'LEAD', target: 100, startDate: today, endDate: today })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.school.deleteMany({ where: { id: { in: [a?.schoolId, b?.schoolId].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('tahlil: maktab ma’lumotlari promptga qo‘shiladi, natija saqlanadi', async () => {
    await http().get('/api/ai/insights/ANALYSIS').set(as(a)).expect(200, {});
    ai.next.push(
      'Mana tahlil:\n```json\n{"items":[{"title":"Reach o‘sdi","text":"7 kunda reach 5 200.","tone":"positive"},{"title":"Nomaʼlum","text":"x","tone":"weird"}]}\n```',
    );
    const res = await http().post('/api/ai/insights/ANALYSIS').set(as(a)).expect(201);
    expect(res.body.items).toEqual([
      { title: 'Reach o‘sdi', text: '7 kunda reach 5 200.', tone: 'positive' },
      { title: 'Nomaʼlum', text: 'x', tone: 'neutral' }, // noma'lum ohang → neutral
    ]);

    const prompt = ai.calls.at(-1)!.prompt;
    expect(prompt).toContain('"ulangan":true');
    expect(prompt).toContain('demo_maktab');
    expect(prompt).toContain('100 lid');
    expect(prompt).toContain('eng_faol_soatlar'); // mock: Toshkent 18–20

    const latest = await http().get('/api/ai/insights/ANALYSIS').set(as(a)).expect(200);
    expect(latest.body.items).toHaveLength(2);
    await http().get('/api/ai/insights/CONTENT_SUGGESTION').set(as(a)).expect(200, {});
    await http().get('/api/ai/insights/ANALYSIS').set(as(b)).expect(200, {});
  });

  it('noto‘g‘ri AI javobi — 502, hech narsa saqlanmaydi', async () => {
    ai.next.push('Kechirasiz, tushunmadim');
    await http().post('/api/ai/insights/CONTENT_SUGGESTION').set(as(a)).expect(502);
    expect(await prisma.aiInsight.count({ where: { schoolId: a.schoolId, kind: 'CONTENT_SUGGESTION' } })).toBe(0);
  });

  it('ssenariy: hashtaglar normallashtiriladi; "Qayta yoz" oldingi variantni yuboradi', async () => {
    const script = {
      caption: 'Ustozlar kuni muborak!',
      hashtags: ['ustoz', '#maktab hayoti'],
      scenes: [{ time: 0, visual: 'Sinf', text: 'Rahmat' }],
    };
    ai.next.push(JSON.stringify(script));
    const res = await http()
      .post('/api/ai/script')
      .set(as(a))
      .send({ prompt: "O'qituvchilar kuni reel", postType: 'REEL' })
      .expect(200);
    expect(res.body).toEqual({
      caption: 'Ustozlar kuni muborak!',
      hashtags: ['#ustoz', '#maktabhayoti'],
      scenes: [{ time: '0', visual: 'Sinf', text: 'Rahmat' }],
    });

    ai.next.push(JSON.stringify(script));
    await http()
      .post('/api/ai/script')
      .set(as(a))
      .send({ prompt: "O'qituvchilar kuni reel", postType: 'STORY', previous: JSON.stringify(res.body) })
      .expect(200);
    expect(ai.calls.at(-1)!.prompt).toContain('Oldingi variant foydalanuvchiga yoqmadi');
    expect(ai.calls.at(-1)!.system).toContain('STORY');
  });

  it('chat: suhbat yaratiladi, tarix keyingi so‘rovga qo‘shiladi, izolyatsiya', async () => {
    ai.next.push('Reach past, chunki postlar kam.');
    const first = await http().post('/api/ai/chat').set(as(a)).send({ message: 'Reach nega past?' }).expect(200);
    expect(first.body.reply).toMatchObject({ role: 'ASSISTANT', content: 'Reach past, chunki postlar kam.' });

    ai.next.push('Haftasiga 4 ta post.');
    await http().post('/api/ai/chat').set(as(a)).send({ threadId: first.body.threadId, message: 'Nechta post kerak?' }).expect(200);
    expect(ai.calls.at(-1)!.prompt).toContain('Foydalanuvchi: Reach nega past?');
    expect(ai.calls.at(-1)!.prompt).toContain('Yordamchi: Reach past, chunki postlar kam.');

    const threads = (await http().get('/api/ai/threads').set(as(a)).expect(200)).body;
    expect(threads).toEqual([expect.objectContaining({ id: first.body.threadId, title: 'Reach nega past?' })]);
    const msgs = (await http().get(`/api/ai/threads/${first.body.threadId}/messages`).set(as(a)).expect(200)).body;
    expect(msgs.map((m: { role: string }) => m.role)).toEqual(['USER', 'ASSISTANT', 'USER', 'ASSISTANT']);

    await http().get(`/api/ai/threads/${first.body.threadId}/messages`).set(as(b)).expect(404);
    await http().post('/api/ai/chat').set(as(b)).send({ threadId: first.body.threadId, message: 'x' }).expect(404);
    await http().delete(`/api/ai/threads/${first.body.threadId}`).set(as(a)).expect(204);
    await http().get('/api/ai/threads').set(as(a)).expect(200, []);
  });
});
