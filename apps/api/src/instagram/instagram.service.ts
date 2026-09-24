import { Injectable } from '@nestjs/common';
import type { IgMediaDto, IgOverviewDto, Paginated, Period } from '@durbin/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { eachDay, periodRange, previousRange, toIsoDate } from '../common/dates.js';
import type { IgMedia } from '../generated/prisma/client.js';

@Injectable()
export class InstagramService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(schoolId: string, period: Period): Promise<IgOverviewDto> {
    const range = periodRange(period);
    const prev = previousRange(range);
    const rows = await this.prisma.igDailyInsight.findMany({
      where: { schoolId, date: { gte: prev.from, lte: range.to } },
      orderBy: { date: 'asc' },
    });

    const inRange = rows.filter((r) => r.date >= range.from);
    const inPrev = rows.filter((r) => r.date < range.from);
    const sum = (list: typeof rows) => ({
      reach: list.reduce((a, r) => a + r.reach, 0),
      views: list.reduce((a, r) => a + r.views, 0),
      profileViews: list.reduce((a, r) => a + r.profileViews, 0),
    });

    // Follower soni: davr boshidagi va oxiridagi ma'lum qiymatlar farqi
    const withFollowers = rows.filter((r) => r.followers > 0);
    const current = withFollowers.at(-1)?.followers ?? 0;
    const baseline =
      withFollowers.filter((r) => r.date < range.from).at(-1)?.followers ??
      withFollowers.find((r) => r.date >= range.from)?.followers ??
      current;

    const byDate = new Map(inRange.map((r) => [toIsoDate(r.date), r]));
    let lastFollowers = baseline;
    const series = eachDay(range.from, range.to).map((d) => {
      const r = byDate.get(toIsoDate(d));
      if (r?.followers) lastFollowers = r.followers;
      return { date: toIsoDate(d), reach: r?.reach ?? 0, views: r?.views ?? 0, followers: lastFollowers };
    });

    return {
      range: { from: toIsoDate(range.from), to: toIsoDate(range.to) },
      totals: sum(inRange),
      previousTotals: sum(inPrev),
      followers: { current, change: current - baseline },
      series,
    };
  }

  async media(schoolId: string, page: number, pageSize: number): Promise<Paginated<IgMediaDto>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.igMedia.findMany({
        where: { schoolId },
        orderBy: { postedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.igMedia.count({ where: { schoolId } }),
    ]);
    return { items: items.map(toMediaDto), total, page, pageSize };
  }

  /** Davr ichida chiqqan postlardan reach bo'yicha eng yaxshi 5 tasi */
  async topMedia(schoolId: string, period: Period): Promise<IgMediaDto[]> {
    const range = periodRange(period);
    const items = await this.prisma.igMedia.findMany({
      where: { schoolId, postedAt: { gte: range.from, lt: new Date(range.to.getTime() + 86_400_000) } },
      orderBy: { reach: 'desc' },
      take: 5,
    });
    return items.map(toMediaDto);
  }
}

function toMediaDto(m: IgMedia): IgMediaDto {
  return {
    id: m.id,
    type: m.type,
    caption: m.caption,
    permalink: m.permalink,
    thumbnailUrl: m.thumbnailUrl,
    postedAt: m.postedAt.toISOString(),
    reach: m.reach,
    views: m.views,
    likes: m.likes,
    comments: m.comments,
    saves: m.saves,
    shares: m.shares,
  };
}
