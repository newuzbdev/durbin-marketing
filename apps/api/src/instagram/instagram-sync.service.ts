import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { addDays, parseIsoDate, startOfUtcDay, toIsoDate } from '../common/dates.js';
import { META_CLIENT, MetaApiError, type IgAccountRef, type MetaClient } from '../meta/meta-client.js';
import { MetaConnectionsService } from '../meta/meta-connections.service.js';

/** Birinchi sync'da necha kun orqaga (Meta follower_count faqat 30 kunni beradi) */
const INITIAL_DAYS = 30;
/** Keyingi sync'larda: kechikib yangilanadigan metrikalar uchun oxirgi bir necha kun qayta olinadi */
const INCREMENTAL_DAYS = 3;
const MEDIA_LIMIT = 50;
const CONVERSATION_LIMIT = 25;
const MESSAGE_LIMIT = 25;

export interface SyncResult {
  days: number;
  media: number;
  conversations: number;
  newMessages: number;
}

@Injectable()
export class InstagramSyncService {
  private readonly logger = new Logger(InstagramSyncService.name);
  /** Bir maktab uchun bir vaqtda faqat bitta sync */
  private readonly running = new Map<string, Promise<SyncResult | null>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: MetaConnectionsService,
    @Inject(META_CLIENT) private readonly meta: MetaClient,
  ) {}

  /** Ulanmagan bo'lsa null */
  syncSchool(schoolId: string): Promise<SyncResult | null> {
    const inFlight = this.running.get(schoolId);
    if (inFlight) return inFlight;
    const job = this.doSync(schoolId).finally(() => this.running.delete(schoolId));
    this.running.set(schoolId, job);
    return job;
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async syncAll() {
    await this.syncWhere({});
  }

  /** Yangi ulangan (hali sync qilinmagan) akkauntlar tezda to'ladi */
  @Cron(CronExpression.EVERY_MINUTE)
  async syncNewConnections() {
    await this.syncWhere({ lastSyncedAt: null });
  }

  private async syncWhere(where: { lastSyncedAt?: null }) {
    const conns = await this.prisma.metaConnection.findMany({
      where: { type: 'INSTAGRAM', ...where },
      select: { schoolId: true },
    });
    for (const { schoolId } of conns) {
      await this.syncSchool(schoolId).catch((err: Error) =>
        this.logger.error(`Instagram sync xatosi (school=${schoolId}): ${err.message}`),
      );
    }
  }

  private async doSync(schoolId: string): Promise<SyncResult | null> {
    const ref = await this.connections.instagramRef(schoolId);
    if (!ref) return null;
    const conn = await this.prisma.metaConnection.findUniqueOrThrow({ where: { id: ref.connectionId } });

    try {
      const today = startOfUtcDay(new Date());
      const from = addDays(today, -((conn.lastSyncedAt ? INCREMENTAL_DAYS : INITIAL_DAYS) - 1));

      const days = await this.syncDailyInsights(schoolId, ref, from, today);
      const media = await this.syncMedia(schoolId, ref);
      const { conversations, newMessages } = await this.syncConversations(schoolId, ref);

      await this.prisma.metaConnection.update({ where: { id: conn.id }, data: { lastSyncedAt: new Date() } });
      return { days, media, conversations, newMessages };
    } catch (err) {
      if (err instanceof MetaApiError && err.isAuthError) {
        this.logger.warn(`Instagram token yaroqsiz (school=${schoolId}) — qayta ulash kerak`);
      }
      throw err;
    }
  }

  private async syncDailyInsights(schoolId: string, ref: IgAccountRef, from: Date, to: Date) {
    const [metrics, currentFollowers, newFollowers] = await Promise.all([
      this.meta.getDailyMetrics(ref, from, to),
      this.meta.getFollowersCount(ref),
      this.meta.getDailyNewFollowers(ref, from, to),
    ]);

    // Follower tarixi: bugungi sondan orqaga, har kungi yangi followerlarni ayirib hisoblanadi
    const followersByDate = new Map<string, number>();
    let running = currentFollowers;
    for (let d = to; d >= from; d = addDays(d, -1)) {
      const key = toIsoDate(d);
      followersByDate.set(key, running);
      running -= newFollowers[key] ?? 0;
    }

    await this.prisma.$transaction(
      metrics.map((m) => {
        const data = {
          reach: m.reach,
          views: m.views,
          profileViews: m.profileViews,
          followers: followersByDate.get(m.date) ?? currentFollowers,
        };
        const date = parseIsoDate(m.date);
        return this.prisma.igDailyInsight.upsert({
          where: { schoolId_date: { schoolId, date } },
          create: { schoolId, date, ...data },
          update: data,
        });
      }),
    );
    return metrics.length;
  }

  private async syncMedia(schoolId: string, ref: IgAccountRef) {
    const items = await this.meta.listMedia(ref, MEDIA_LIMIT);
    await this.prisma.$transaction(
      items.map(({ externalId, ...data }) =>
        this.prisma.igMedia.upsert({
          where: { schoolId_externalId: { schoolId, externalId } },
          create: { schoolId, externalId, ...data },
          update: data,
        }),
      ),
    );
    // Instagramda o'chirilgan postlar — Meta xabar bermaydi, faqat ro'yxatda qaytmay qoladi
    const window = deletedMediaWindow(items, MEDIA_LIMIT);
    await this.prisma.igMedia.deleteMany({
      where: {
        schoolId,
        externalId: { notIn: items.map((i) => i.externalId) },
        ...(window ? { postedAt: { gte: window } } : {}),
      },
    });
    return items.length;
  }

  private async syncConversations(schoolId: string, ref: IgAccountRef) {
    const conversations = await this.meta.listConversations(ref, CONVERSATION_LIMIT);
    let newMessages = 0;

    for (const c of conversations) {
      const messages = await this.meta.listMessages(ref, c.externalId, MESSAGE_LIMIT);
      const conv = await this.prisma.igConversation.upsert({
        where: { schoolId_participantId: { schoolId, participantId: c.participantId } },
        create: {
          schoolId,
          externalId: c.externalId,
          participantId: c.participantId,
          participantName: c.participantName,
          lastMessageAt: c.updatedAt,
        },
        update: { externalId: c.externalId, participantName: c.participantName },
      });

      const known = new Set(
        (
          await this.prisma.igMessage.findMany({
            where: { conversationId: conv.id, externalId: { in: messages.map((m) => m.externalId) } },
            select: { externalId: true },
          })
        ).map((m) => m.externalId),
      );
      const fresh = messages.filter((m) => !known.has(m.externalId));
      if (fresh.length) {
        await this.prisma.igMessage.createMany({
          data: fresh.map((m) => ({
            conversationId: conv.id,
            externalId: m.externalId,
            direction: m.inbound ? ('INBOUND' as const) : ('OUTBOUND' as const),
            text: m.text,
            sentAt: m.sentAt,
          })),
          skipDuplicates: true,
        });
      }
      newMessages += fresh.length;

      const lastInbound = maxDate(messages.filter((m) => m.inbound).map((m) => m.sentAt));
      const freshInbound = fresh.filter((m) => m.inbound).length;
      await this.prisma.igConversation.update({
        where: { id: conv.id },
        data: {
          lastMessageAt: maxDate([conv.lastMessageAt, c.updatedAt, ...messages.map((m) => m.sentAt)])!,
          ...(lastInbound && (!conv.lastInboundAt || lastInbound > conv.lastInboundAt)
            ? { lastInboundAt: lastInbound }
            : {}),
          ...(freshInbound ? { unreadCount: { increment: freshInbound } } : {}),
        },
      });
    }
    return { conversations: conversations.length, newMessages };
  }
}

/**
 * Qaysi oraliqdagi postlar Meta javobida bo'lishi shart: ro'yxat to'la bo'lsa (limitga yetgan) — faqat eng eski
 * qaytgan postdan keyingilari (undan eskilari keyingi sahifada bo'lishi mumkin); to'la bo'lmasa — hammasi (null).
 */
export function deletedMediaWindow(items: { postedAt: Date }[], limit: number): Date | null {
  if (items.length < limit) return null;
  return new Date(Math.min(...items.map((i) => i.postedAt.getTime())));
}

function maxDate(dates: Date[]): Date | null {
  return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
}
