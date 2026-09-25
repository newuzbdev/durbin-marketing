import { Injectable } from '@nestjs/common';
import type { DashboardDto, DashboardPeriod, LeadSource } from '@durbin/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { addDays, periodRange, previousRange, startOfUtcDay, toIsoDate } from '../common/dates.js';
import { InstagramService } from '../instagram/instagram.service.js';
import { GoalsService } from '../goals/goals.service.js';
import { ContentService } from '../content/content.service.js';

type Range = { from: Date; to: Date };
const GOALS_LIMIT = 6;

// Bosh sahifa: har bir bo'limdan qisqa ko'rsatkichlar. Faqat Durbin bazasidan o'qiydi (Meta'ga so'rov yo'q) — tez.
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instagram: InstagramService,
    private readonly goals: GoalsService,
    private readonly content: ContentService,
  ) {}

  async get(schoolId: string, period: DashboardPeriod): Promise<DashboardDto> {
    const range = periodRange(period);
    const prev = previousRange(range);
    const week = periodRange('this_week');
    const weekEnd = addDays(week.from, 7); // dushanba 00:00 dan keyingi dushanbagacha — butun hafta

    const connections = await this.prisma.metaConnection.findMany({ where: { schoolId }, select: { type: true, currency: true } });
    const ig = connections.some((c) => c.type === 'INSTAGRAM');
    const ads = connections.find((c) => c.type === 'ADS');

    const [igOverview, adsData, leads, goals, contentWeek] = await Promise.all([
      ig ? this.instagram.overview(schoolId, period) : null,
      ads ? this.adsSummary(schoolId, range, prev, ads.currency ?? 'USD') : null,
      this.leadsSummary(schoolId, range, prev),
      this.goals.list(schoolId),
      this.content.stats(schoolId, week.from, weekEnd),
    ]);

    return {
      range: { from: toIsoDate(range.from), to: toIsoDate(range.to) },
      instagram: igOverview && {
        reach: igOverview.totals.reach,
        previousReach: igOverview.previousTotals.reach,
        followers: igOverview.followers.current,
        followersChange: igOverview.followers.change,
        series: igOverview.series.map(({ date, reach, followers }) => ({ date, reach, followers })),
      },
      ads: adsData,
      leads,
      goals: goals.filter((g) => g.status === 'active' || g.status === 'upcoming').slice(0, GOALS_LIMIT),
      contentWeek: { from: toIsoDate(week.from), to: toIsoDate(addDays(weekEnd, -1)), ...contentWeek },
    };
  }

  private async adsSummary(schoolId: string, range: Range, prev: Range, currency: string) {
    const spend = (r: Range) =>
      this.prisma.adCampaignDailyInsight
        .aggregate({ where: { campaign: { schoolId }, date: { gte: r.from, lte: r.to } }, _sum: { spend: true } })
        .then((a) => a._sum.spend ?? 0);
    const [activeCampaigns, current, previous] = await Promise.all([
      this.prisma.adCampaign.count({ where: { schoolId, status: 'ACTIVE' } }),
      spend(range),
      spend(prev),
    ]);
    return { activeCampaigns, spend: current, previousSpend: previous, currency };
  }

  private async leadsSummary(schoolId: string, range: Range, prev: Range) {
    const where = (r: Range) => ({ schoolId, count: { gt: 0 }, date: { gte: startOfUtcDay(r.from), lte: r.to } });
    const [groups, previous] = await Promise.all([
      this.prisma.lead.groupBy({ by: ['source'], where: where(range), _sum: { count: true } }),
      this.prisma.lead.aggregate({ where: where(prev), _sum: { count: true } }),
    ]);
    const bySource: Partial<Record<LeadSource, number>> = {};
    for (const g of groups) bySource[g.source] = g._sum.count ?? 0;
    return {
      total: Object.values(bySource).reduce((a, b) => a + b, 0),
      previous: previous._sum.count ?? 0,
      bySource,
    };
  }
}
