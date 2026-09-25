import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { addDays, parseIsoDate, startOfUtcDay } from '../common/dates.js';
import { META_CLIENT, type AdsRef, type MetaClient } from '../meta/meta-client.js';
import { MetaConnectionsService } from '../meta/meta-connections.service.js';

/** Birinchi sync: "o'tgan oy" filtri ham to'lishi uchun ~2 oy */
const INITIAL_DAYS = 62;
/** Meta statistikani bir necha kun davomida aniqlashtiradi — oxirgi kunlar qayta olinadi */
const INCREMENTAL_DAYS = 3;
const LEAD_ADS_DAYS = 30;

export interface AdsSyncResult {
  campaigns: number;
  days: number;
  leads: number;
}

@Injectable()
export class AdsSyncService {
  private readonly logger = new Logger(AdsSyncService.name);
  private readonly running = new Map<string, Promise<AdsSyncResult | null>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: MetaConnectionsService,
    @Inject(META_CLIENT) private readonly meta: MetaClient,
  ) {}

  /** Reklama akkaunti ulanmagan bo'lsa null. Bir maktab uchun bir vaqtda bitta sync. */
  syncSchool(schoolId: string): Promise<AdsSyncResult | null> {
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

  @Cron(CronExpression.EVERY_MINUTE)
  async syncNewConnections() {
    await this.syncWhere({ lastSyncedAt: null });
  }

  private async syncWhere(where: { lastSyncedAt?: null }) {
    const conns = await this.prisma.metaConnection.findMany({ where: { type: 'ADS', ...where }, select: { schoolId: true } });
    for (const { schoolId } of conns) {
      await this.syncSchool(schoolId).catch((err: Error) =>
        this.logger.error(`Reklama sync xatosi (school=${schoolId}): ${err.message}`),
      );
    }
  }

  private async doSync(schoolId: string): Promise<AdsSyncResult | null> {
    const ref = await this.connections.adsRef(schoolId);
    if (!ref) return null;
    const conn = await this.prisma.metaConnection.findUniqueOrThrow({ where: { id: ref.connectionId } });

    const today = startOfUtcDay(new Date());
    const from = addDays(today, -((conn.lastSyncedAt ? INCREMENTAL_DAYS : INITIAL_DAYS) - 1));
    // Statistika kampaniya id'lariga bog'liq; Lead Ads esa mustaqil — parallel ketadi
    const [[campaigns, days], leads] = await Promise.all([
      this.syncCampaigns(schoolId, ref).then(async (n) => [n, await this.syncInsights(schoolId, ref, from, today)] as const),
      this.syncLeadAds(schoolId).catch((err: Error) => {
        // Lead Ads xatosi statistika sync'ini to'xtatmaydi
        this.logger.warn(`Lead Ads sync xatosi (school=${schoolId}): ${err.message}`);
        return 0;
      }),
    ]);

    await this.prisma.metaConnection.update({ where: { id: conn.id }, data: { lastSyncedAt: new Date() } });
    return { campaigns, days, leads };
  }

  async syncCampaigns(schoolId: string, ref: AdsRef): Promise<number> {
    const items = await this.meta.listCampaigns(ref);
    await this.prisma.$transaction(
      items.map(({ externalId, ...data }) =>
        this.prisma.adCampaign.upsert({
          where: { schoolId_externalId: { schoolId, externalId } },
          create: { schoolId, externalId, ...data },
          update: data,
        }),
      ),
    );
    return items.length;
  }

  private async syncInsights(schoolId: string, ref: AdsRef, from: Date, to: Date): Promise<number> {
    const rows = await this.meta.getCampaignDailyInsights(ref, from, to);
    const campaigns = await this.prisma.adCampaign.findMany({ where: { schoolId }, select: { id: true, externalId: true } });
    const idByExternal = new Map(campaigns.map((c) => [c.externalId, c.id]));

    const ops = rows.flatMap((r) => {
      // Arxivlangan kampaniyalar ro'yxatda qaytmaydi — ularning statistikasi o'tkazib yuboriladi
      const campaignId = idByExternal.get(r.campaignExternalId);
      if (!campaignId) return [];
      const date = parseIsoDate(r.date);
      const data = { spend: r.spend, clicks: r.clicks, reach: r.reach, impressions: r.impressions, leads: r.leads };
      return [
        this.prisma.adCampaignDailyInsight.upsert({
          where: { campaignId_date: { campaignId, date } },
          create: { campaignId, date, ...data },
          update: data,
        }),
      ];
    });
    await this.prisma.$transaction(ops);
    return ops.length;
  }

  /** Lead Ads formalari sahifaga tegishli — Instagram ulanishidagi sahifa tokeni bilan olinadi */
  private async syncLeadAds(schoolId: string): Promise<number> {
    const page = await this.connections.instagramRef(schoolId);
    if (!page) return 0;
    const items = await this.meta.listLeadAds(page, addDays(new Date(), -LEAD_ADS_DAYS));
    if (!items.length) return 0;
    const res = await this.prisma.lead.createMany({
      data: items.map((l) => ({
        schoolId,
        source: 'FB_ADS' as const,
        externalId: `la:${l.externalId}`,
        name: l.name,
        phone: l.phone,
        date: startOfUtcDay(l.createdAt),
      })),
      skipDuplicates: true,
    });
    return res.count;
  }
}
