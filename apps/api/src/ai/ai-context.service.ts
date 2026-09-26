import { Inject, Injectable, Logger } from '@nestjs/common';
import { fromMinor } from '@durbin/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { addDays, startOfUtcDay, toIsoDate } from '../common/dates.js';
import { InstagramService } from '../instagram/instagram.service.js';
import { AdsService } from '../ads/ads.service.js';
import { GoalsService } from '../goals/goals.service.js';
import { META_CLIENT, type MetaClient } from '../meta/meta-client.js';
import { MetaConnectionsService } from '../meta/meta-connections.service.js';

/** Toshkent vaqti (UTC+5) — post soatlari va hafta kunlari maktab nuqtai nazaridan */
const TZ_OFFSET_MS = 5 * 3_600_000;
const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const HOUR_BUCKETS = [
  [6, 12, '06-12'],
  [12, 16, '12-16'],
  [16, 18, '16-18'],
  [18, 21, '18-21'],
  [21, 24, '21-24'],
  [0, 6, '00-06'],
] as const;

// AI'ga beriladigan maktab ma'lumotlari: ixcham, faqat xulosa uchun kerakli raqamlar.
// Model raqamlarni o'ylab topmasligi uchun hammasi shu yerdan olinadi.
@Injectable()
export class AiContextService {
  private readonly logger = new Logger(AiContextService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly instagram: InstagramService,
    private readonly ads: AdsService,
    private readonly goals: GoalsService,
    private readonly connections: MetaConnectionsService,
    @Inject(META_CLIENT) private readonly meta: MetaClient,
  ) {}

  async build(schoolId: string): Promise<string> {
    const [school, instagram, ads, goals, leads, content] = await Promise.all([
      this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true } }),
      this.instagramContext(schoolId),
      this.adsContext(schoolId),
      this.goalsContext(schoolId),
      this.leadsContext(schoolId),
      this.contentContext(schoolId),
    ]);
    return JSON.stringify({
      bugun: toIsoDate(new Date()),
      maktab: school.name,
      instagram,
      reklama: ads,
      maqsadlar: goals,
      lidlar_30_kun: leads,
      kontent_plan: content,
    });
  }

  private async instagramContext(schoolId: string) {
    const conn = await this.prisma.metaConnection.findUnique({ where: { schoolId_type: { schoolId, type: 'INSTAGRAM' } } });
    if (!conn) return { ulangan: false };

    const [ov7, ov30, top, media, online] = await Promise.all([
      this.instagram.overview(schoolId, 'last_7d'),
      this.instagram.overview(schoolId, 'last_30d'),
      this.instagram.topMedia(schoolId, 'last_30d'),
      this.prisma.igMedia.findMany({
        where: { schoolId, postedAt: { gte: addDays(new Date(), -90) } },
        select: { type: true, postedAt: true, reach: true, likes: true },
      }),
      this.onlineHours(schoolId),
    ]);

    return {
      ulangan: true,
      akkaunt: conn.displayName,
      followerlar: { hozir: ov30.followers.current, o_zgarish_30_kun: ov30.followers.change, o_zgarish_7_kun: ov7.followers.change },
      oxirgi_7_kun: { ...ov7.totals, oldingi_7_kun: ov7.previousTotals },
      oxirgi_30_kun: { ...ov30.totals, oldingi_30_kun: ov30.previousTotals },
      kunlik_reach_14_kun: ov30.series.slice(-14).map((d) => ({ sana: d.date, reach: d.reach, followerlar: d.followers })),
      eng_yaxshi_postlar_30_kun: top.map((m) => {
        const local = new Date(new Date(m.postedAt).getTime() + TZ_OFFSET_MS);
        return {
          turi: m.type,
          sana: toIsoDate(local),
          hafta_kuni: WEEKDAYS[local.getUTCDay()],
          soat: local.getUTCHours(),
          reach: m.reach,
          like: m.likes,
          izoh: m.comments,
          saqlash: m.saves,
          matn: (m.caption ?? '').slice(0, 100),
        };
      }),
      auditoriya_onlayn_soatlari: online,
      postlar_90_kun: {
        soni: media.length,
        tur_boyicha: aggregate(media, (m) => m.type),
        hafta_kuni_boyicha: aggregate(media, (m) => WEEKDAYS[new Date(m.postedAt.getTime() + TZ_OFFSET_MS).getUTCDay()]),
        soat_boyicha: aggregate(media, (m) => {
          const h = new Date(m.postedAt.getTime() + TZ_OFFSET_MS).getUTCHours();
          return HOUR_BUCKETS.find(([from, to]) => h >= from && h < to)![2];
        }),
      },
    };
  }

  /** Followerlar onlayn bo'ladigan soatlar (Toshkent vaqti), eng faol 3 tasi; Meta bermasa — izoh */
  private async onlineHours(schoolId: string) {
    const ref = await this.connections.instagramRef(schoolId);
    const byUtc = ref ? await this.meta.getOnlineFollowers(ref).catch(() => null) : null;
    if (!byUtc) return { malumot_yoq: "Meta bermadi (100 dan kam follower yoki yangi akkaunt) — postlar natijasiga qarab xulosa qil" };
    const byLocal = Object.entries(byUtc)
      .map(([h, n]) => ({ soat: (Number(h) + 5) % 24, onlayn: n }))
      .sort((a, b) => a.soat - b.soat);
    const top = [...byLocal].sort((a, b) => b.onlayn - a.onlayn).slice(0, 3).map((x) => `${x.soat}:00`);
    return { eng_faol_soatlar: top, soatlar: byLocal };
  }

  private async adsContext(schoolId: string) {
    const conn = await this.prisma.metaConnection.findUnique({ where: { schoolId_type: { schoolId, type: 'ADS' } } });
    if (!conn) return { ulangan: false };
    try {
      const ov = await this.ads.overview(schoolId, 'last_30d');
      const money = (minor: number) => Math.round(fromMinor(minor, ov.currency) * 100) / 100;
      const totals = (t: typeof ov.totals) => ({ ...t, spend: money(t.spend) });
      return {
        ulangan: true,
        valyuta: ov.currency,
        oxirgi_30_kun: totals(ov.totals),
        oldingi_30_kun: totals(ov.previousTotals),
        campaignlar: ov.campaigns.map((c) => ({
          nomi: c.name,
          holati: c.status,
          maqsadi: c.objective,
          kunlik_byudjet: c.dailyBudget === null ? null : money(c.dailyBudget),
          sarf: money(c.spend),
          klik: c.clicks,
          reach: c.reach,
          ctr: c.ctr,
          lid: c.leads,
        })),
      };
    } catch (err) {
      this.logger.warn(`AI konteksti: reklama ma'lumoti olinmadi (${(err as Error).message})`);
      return { ulangan: true, xato: "ma'lumot olinmadi" };
    }
  }

  private async goalsContext(schoolId: string) {
    const goals = await this.goals.list(schoolId);
    return goals.map((g) => ({
      nomi: g.name,
      turi: g.type,
      maqsad: g.target,
      hozir: g.current,
      foiz: g.percent,
      qolgan_kun: g.daysLeft,
      reja_boyicha_bugungacha: g.expected,
      holati: g.status,
      muddat: `${g.startDate} — ${g.endDate}`,
      ...(g.bySource ? { manbalar: g.bySource } : {}),
      ...(g.dataMissing ? { malumot_yoq: true } : {}),
    }));
  }

  private async leadsContext(schoolId: string) {
    const groups = await this.prisma.lead.groupBy({
      by: ['source'],
      where: { schoolId, count: { gt: 0 }, date: { gte: addDays(startOfUtcDay(new Date()), -29) } },
      _sum: { count: true },
    });
    return Object.fromEntries(groups.map((g) => [g.source, g._sum.count ?? 0]));
  }

  private async contentContext(schoolId: string) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [groups, upcoming] = await Promise.all([
      this.prisma.contentPost.groupBy({
        by: ['status'],
        where: { schoolId, scheduledAt: { gte: monthStart } },
        _count: { _all: true },
      }),
      this.prisma.contentPost.findMany({
        where: { schoolId, status: 'SCHEDULED', scheduledAt: { gte: now, lte: addDays(now, 14) } },
        orderBy: { scheduledAt: 'asc' },
        take: 20,
        select: { type: true, title: true, scheduledAt: true },
      }),
    ]);
    return {
      shu_oy: Object.fromEntries(groups.map((g) => [g.status, g._count._all])),
      keyingi_14_kun: upcoming.map((p) => ({ turi: p.type, sarlavha: p.title, vaqt: p.scheduledAt.toISOString() })),
    };
  }
}

/** Guruh bo'yicha postlar soni va o'rtacha reach/like */
function aggregate<T extends { reach: number; likes: number }>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return [...groups.entries()].map(([k, list]) => ({
    guruh: k,
    postlar: list.length,
    o_rtacha_reach: Math.round(list.reduce((a, m) => a + m.reach, 0) / list.length),
    o_rtacha_like: Math.round(list.reduce((a, m) => a + m.likes, 0) / list.length),
  }));
}
