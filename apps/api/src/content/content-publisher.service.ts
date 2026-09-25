import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { mediaKind } from '@durbin/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { mapLimit } from '../common/async.js';
import { META_CLIENT, MetaApiError, type MetaClient } from '../meta/meta-client.js';
import { MetaConnectionsService } from '../meta/meta-connections.service.js';
import { InstagramSyncService } from '../instagram/instagram-sync.service.js';

/** Server shuncha vaqt ishlamay qolgan bo'lsa, eski postlar kech chiqarilmaydi — MISSED bo'ladi */
export const STALE_AFTER_MS = 6 * 3_600_000;
/** Qo'lda chiqariladigan post shu vaqt ichida "chiqdi" deb belgilanmasa — MISSED */
export const MANUAL_GRACE_MS = 3_600_000;
/** PUBLISHING holatida qolib ketgan post (masalan, server qayta ishga tushgan) */
export const STUCK_AFTER_MS = 15 * 60_000;
const BATCH = 20;
const CONCURRENCY = 3;

export interface PublishRunResult {
  published: number;
  failed: number;
  missed: number;
}

// Auto-publish: har daqiqada muddati kelgan postlar Instagramga chiqariladi. Redis/BullMQ'siz — bitta API
// jarayoni uchun yetarli. Bir nechta instansda ham xavfsiz: post `updateMany(status=SCHEDULED)` bilan "egallanadi".
@Injectable()
export class ContentPublisherService {
  private readonly logger = new Logger(ContentPublisherService.name);
  private running: Promise<PublishRunResult> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: MetaConnectionsService,
    private readonly sync: InstagramSyncService,
    @Inject(META_CLIENT) private readonly meta: MetaClient,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    await this.run().catch((err: Error) => this.logger.error(`Publisher xatosi: ${err.message}`));
  }

  /** Bir vaqtda faqat bitta aylanish; parallel chaqiruv o'sha aylanishni kutadi */
  run(now = new Date()): Promise<PublishRunResult> {
    this.running ??= this.doRun(now).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async doRun(now: Date): Promise<PublishRunResult> {
    const missed = await this.markMissed(now);
    await this.recoverStuck(now);

    const due = await this.prisma.contentPost.findMany({
      where: { status: 'SCHEDULED', autoPublish: true, scheduledAt: { lte: now } },
      orderBy: { scheduledAt: 'asc' },
      take: BATCH,
      select: { id: true },
    });
    const results = await mapLimit(due, CONCURRENCY, (p) => this.publishOne(p.id));
    return {
      published: results.filter((r) => r === 'published').length,
      failed: results.filter((r) => r === 'failed').length,
      missed,
    };
  }

  private async markMissed(now: Date): Promise<number> {
    const [manual, stale] = await this.prisma.$transaction([
      this.prisma.contentPost.updateMany({
        where: { status: 'SCHEDULED', autoPublish: false, scheduledAt: { lt: new Date(now.getTime() - MANUAL_GRACE_MS) } },
        data: { status: 'MISSED' },
      }),
      this.prisma.contentPost.updateMany({
        where: { status: 'SCHEDULED', autoPublish: true, scheduledAt: { lt: new Date(now.getTime() - STALE_AFTER_MS) } },
        data: {
          status: 'MISSED',
          error: "Belgilangan vaqtdan 6 soatdan ko'p o'tdi — avtomatik chiqarilmadi",
        },
      }),
    ]);
    return manual.count + stale.count;
  }

  private async recoverStuck(now: Date) {
    const { count } = await this.prisma.contentPost.updateMany({
      where: { status: 'PUBLISHING', updatedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
      data: {
        status: 'FAILED',
        error: "Chiqarish jarayoni uzilib qoldi. Instagramda post chiqqanini tekshiring, keyin qayta urinib ko'ring",
      },
    });
    if (count) this.logger.warn(`${count} ta post PUBLISHING holatida qolib ketgan edi → FAILED`);
  }

  private async publishOne(id: string): Promise<'published' | 'failed' | 'skipped'> {
    // Egallash: boshqa aylanish/instans allaqachon olgan bo'lsa, count = 0
    const { count } = await this.prisma.contentPost.updateMany({
      where: { id, status: 'SCHEDULED' },
      data: { status: 'PUBLISHING', error: null },
    });
    if (!count) return 'skipped';

    const post = await this.prisma.contentPost.findUniqueOrThrow({ where: { id }, include: { mediaAsset: true } });
    const fail = async (error: string) => {
      await this.prisma.contentPost.update({ where: { id }, data: { status: 'FAILED', error } });
      return 'failed' as const;
    };

    if (!post.mediaAsset) return fail('Media fayl biriktirilmagan');
    const ref = await this.connections.instagramRef(post.schoolId);
    if (!ref) return fail('Instagram ulanmagan — Instagram bo‘limida akkauntni ulang');

    try {
      const published = await this.meta.publishMedia(ref, {
        postType: post.type,
        mediaUrl: post.mediaAsset.url,
        isVideo: mediaKind(post.mediaAsset.contentType) === 'video',
        caption: post.caption,
      });
      await this.prisma.contentPost.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          igMediaId: published.externalId,
          permalink: published.permalink,
          publishedAt: new Date(),
          error: null,
        },
      });
      // Yangi post Instagram bo'limidagi ro'yxatda ham ko'rinsin
      void this.sync.syncSchool(post.schoolId).catch((err: Error) => this.logger.warn(`Sync xatosi: ${err.message}`));
      return 'published';
    } catch (err) {
      this.logger.error(`Post chiqarilmadi (post=${id}): ${(err as Error).message}`);
      return fail(publishErrorMessage(err));
    }
  }
}

export function publishErrorMessage(err: unknown): string {
  if (err instanceof MetaApiError) {
    if (err.isAuthError) return 'Instagram ruxsati bekor qilingan — akkauntni qayta ulang';
    // 9 / 4 / 17 / 32 / 613 — so'rovlar limiti (IG: sutkasiga 100 ta post)
    if ([4, 9, 17, 32, 613].includes(err.code ?? 0)) {
      return "Instagram limiti tugadi (sutkasiga ko'pi bilan 100 ta post). Keyinroq qayta urinib ko'ring";
    }
    return `Instagram xatosi: ${err.message}`;
  }
  return `Kutilmagan xatolik: ${(err as Error).message}`;
}
