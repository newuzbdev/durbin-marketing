import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ContentPublisherService } from '../src/content/content-publisher.service.js';

// Kontent Plan: yuklash → post CRUD → auto-publish (mock Meta) → holatlar, hamda tenant izolyatsiyasi.
// Lokal PostgreSQL kerak. S3 so'rovlari yuborilmaydi — presigned URL faqat lokal imzolanadi.

process.env.META_MODE = 'mock';
process.env.ENCRYPTION_KEY ||= randomBytes(32).toString('base64');
process.env.WEB_ORIGIN = 'http://localhost:3000';
process.env.S3_ENDPOINT = 'http://127.0.0.1:9';
process.env.S3_REGION = 'auto';
process.env.S3_BUCKET = 'test-bucket';
process.env.S3_ACCESS_KEY_ID = 'test-key';
process.env.S3_SECRET_ACCESS_KEY = 'test-secret';
process.env.S3_PUBLIC_URL = 'https://media.test/';

const HOUR = 3_600_000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString();

describe('Kontent Plan (e2e, mock)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let publisher: ContentPublisherService;
  const suffix = randomBytes(4).toString('hex');
  const emails = [`ca-${suffix}@test.uz`, `cb-${suffix}@test.uz`];
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

  async function upload(contentType: string, size = 1000) {
    const res = await http()
      .post('/api/content/uploads')
      .set(as(a))
      .send({ fileName: 'x', contentType, size })
      .expect(201);
    return res.body.asset.id as string;
  }

  async function createPost(body: Record<string, unknown>) {
    const res = await http()
      .post('/api/content/posts')
      .set(as(a))
      .send({ type: 'IMAGE', title: 'Post', caption: 'Matn', scheduledAt: inHours(1), ...body })
      .expect(201);
    return res.body as { id: string; status: string };
  }

  /** Postni o'tmishga surib, publisher'ni ishga tushiradi */
  async function dueAndRun(id: string, hoursAgo = 0.01) {
    await prisma.contentPost.update({ where: { id }, data: { scheduledAt: new Date(Date.now() - hoursAgo * HOUR) } });
    await publisher.run();
    return prisma.contentPost.findUniqueOrThrow({ where: { id } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    publisher = app.get(ContentPublisherService);
    a = await register(emails[0]);
    b = await register(emails[1]);

    // A maktab Instagram'ni ulaydi (mock OAuth)
    const start = await http().get('/api/meta/oauth/start').set(as(a)).expect(200);
    const url = new URL(start.body.url);
    await http().get(`${url.pathname}${url.search}`).expect(302);
  });

  afterAll(async () => {
    await prisma.school.deleteMany({ where: { id: { in: [a?.schoolId, b?.schoolId].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('yuklash: presigned URL va ochiq URL qaytaradi, noto‘g‘ri tur rad etiladi', async () => {
    const res = await http()
      .post('/api/content/uploads')
      .set(as(a))
      .send({ fileName: 'rasm.jpg', contentType: 'image/jpeg', size: 1000 })
      .expect(201);
    expect(res.body.uploadUrl).toContain('X-Amz-Signature=');
    expect(res.body.uploadUrl).not.toContain('x-amz-checksum');
    expect(res.body.asset.url).toMatch(new RegExp(`^https://media\\.test/schools/${a.schoolId}/.+\\.jpg$`));

    await http()
      .post('/api/content/uploads')
      .set(as(a))
      .send({ fileName: 'a.png', contentType: 'image/png', size: 1000 })
      .expect(400);
  });

  it("validatsiya: o'tgan vaqt va mos kelmaydigan media rad etiladi", async () => {
    const video = await upload('video/mp4');
    await http()
      .post('/api/content/posts')
      .set(as(a))
      .send({ type: 'IMAGE', title: 'X', scheduledAt: inHours(-1) })
      .expect(400);
    const bad = await http()
      .post('/api/content/posts')
      .set(as(a))
      .send({ type: 'IMAGE', title: 'X', scheduledAt: inHours(1), mediaAssetId: video })
      .expect(400);
    expect(bad.body.message).toContain('JPEG');
    // Story rasm ham, video ham qabul qiladi
    await createPost({ type: 'STORY', mediaAssetId: video });
  });

  it('ro‘yxat, statistika va tenant izolyatsiyasi', async () => {
    const post = await createPost({ title: 'Ro‘yxat uchun', scheduledAt: inHours(3) });
    const range = `from=${encodeURIComponent(inHours(-24))}&to=${encodeURIComponent(inHours(24))}`;

    const list = await http().get(`/api/content/posts?${range}`).set(as(a)).expect(200);
    expect(list.body.map((p: { id: string }) => p.id)).toContain(post.id);
    expect(list.body[0].createdBy.name).toBe('Test');

    const stats = await http().get(`/api/content/stats?${range}`).set(as(a)).expect(200);
    expect(stats.body.total).toBeGreaterThanOrEqual(2);
    expect(stats.body.scheduled).toBe(stats.body.total);

    await http().get(`/api/content/posts?${range}`).set(as(b)).expect(200, []);
    await http().get(`/api/content/posts/${post.id}`).set(as(b)).expect(404);
    await http().patch(`/api/content/posts/${post.id}`).set(as(b)).send({ title: 'Buzish' }).expect(404);
    await http().delete(`/api/content/posts/${post.id}`).set(as(b)).expect(404);
  });

  it('PATCH faqat yuborilgan maydonlarni o‘zgartiradi', async () => {
    const post = await createPost({ caption: 'Asl matn', autoPublish: false });
    const res = await http().patch(`/api/content/posts/${post.id}`).set(as(a)).send({ title: 'Yangi' }).expect(200);
    expect(res.body).toMatchObject({ title: 'Yangi', caption: 'Asl matn', autoPublish: false });
  });

  it('auto-publish: vaqti kelgan post chiqariladi, keyin o‘zgartirib bo‘lmaydi', async () => {
    const image = await upload('image/jpeg');
    const post = await createPost({ mediaAssetId: image });
    const row = await dueAndRun(post.id);
    expect(row.status).toBe('PUBLISHED');
    expect(row.igMediaId).toMatch(/^mock-post-/);
    expect(row.permalink).toContain('instagram.com');
    expect(row.publishedAt).not.toBeNull();

    await http().patch(`/api/content/posts/${post.id}`).set(as(a)).send({ title: 'X' }).expect(409);
  });

  it('xatolar: media yo‘q yoki Meta rad etsa — FAILED, qayta urinish SCHEDULED qiladi', async () => {
    const noMedia = await createPost({});
    expect((await dueAndRun(noMedia.id)).error).toBe('Media fayl biriktirilmagan');

    const asset = await prisma.mediaAsset.create({
      data: {
        schoolId: a.schoolId,
        key: `mock-fail-${suffix}.jpg`,
        url: `https://media.test/mock-fail-${suffix}.jpg`,
        contentType: 'image/jpeg',
        size: 1,
      },
    });
    const failing = await createPost({ mediaAssetId: asset.id });
    const failed = await dueAndRun(failing.id);
    expect(failed.status).toBe('FAILED');
    expect(failed.error).toContain('Instagram xatosi');

    await http().post(`/api/content/posts/${noMedia.id}/publish`).set(as(a)).expect(400);
    const retry = await http().post(`/api/content/posts/${failing.id}/publish`).set(as(a)).expect(201);
    expect(retry.body.error).toBeNull();
    await publisher.run();
    expect((await prisma.contentPost.findUniqueOrThrow({ where: { id: failing.id } })).status).toBe('FAILED');
  });

  it("MISSED: qo'lda chiqariladigan post belgilanmasa va eski auto post", async () => {
    const manual = await createPost({ autoPublish: false });
    expect((await dueAndRun(manual.id, 0.5)).status).toBe('SCHEDULED'); // 1 soatlik imkoniyat
    expect((await dueAndRun(manual.id, 2)).status).toBe('MISSED');

    const marked = await http().post(`/api/content/posts/${manual.id}/mark-published`).set(as(a)).expect(201);
    expect(marked.body.status).toBe('PUBLISHED');

    const image = await upload('image/jpeg');
    const stale = await createPost({ mediaAssetId: image });
    const row = await dueAndRun(stale.id, 7);
    expect(row.status).toBe('MISSED');
    expect(row.igMediaId).toBeNull();

    // Yangi vaqtga ko'chirilsa yana rejalashtiriladi
    const moved = await http()
      .patch(`/api/content/posts/${stale.id}`)
      .set(as(a))
      .send({ scheduledAt: inHours(2) })
      .expect(200);
    expect(moved.body).toMatchObject({ status: 'SCHEDULED', error: null });
  });

  it("Instagram ulanmagan maktab — FAILED; o'chirish faylni ham tozalaydi", async () => {
    const res = await http()
      .post('/api/content/uploads')
      .set(as(b))
      .send({ fileName: 'x.jpg', contentType: 'image/jpeg', size: 10 })
      .expect(201);
    const post = await http()
      .post('/api/content/posts')
      .set(as(b))
      .send({ type: 'IMAGE', title: 'B', scheduledAt: inHours(1), mediaAssetId: res.body.asset.id })
      .expect(201);
    const row = await dueAndRun(post.body.id);
    expect(row.status).toBe('FAILED');
    expect(row.error).toContain('Instagram ulanmagan');

    await http().delete(`/api/content/posts/${post.body.id}`).set(as(b)).expect(204);
    expect(await prisma.mediaAsset.findUnique({ where: { id: res.body.asset.id } })).toBeNull();
  });
});
