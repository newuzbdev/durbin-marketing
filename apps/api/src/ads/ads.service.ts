import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AdCampaignDto, AdsOverviewDto, AdTotals, CreateCampaignInput, GeoLocationDto, Period } from '@durbin/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { eachDay, periodRange, previousRange, startOfUtcDay, toIsoDate } from '../common/dates.js';
import { META_CLIENT, MetaApiError, type AdsRef, type MetaClient } from '../meta/meta-client.js';
import { MetaConnectionsService } from '../meta/meta-connections.service.js';
import { AdsSyncService } from './ads-sync.service.js';

type Range = { from: Date; to: Date };
type Reach = { total: number; byCampaign: Record<string, number> } | null;

/** Reach davr bo'yicha Meta'dan olinadi (kunlik yig'indi takrorlarni ikki marta sanaydi) — qisqa kesh bilan */
const REACH_TTL_MS = 10 * 60_000;
/** Maktab vaqt zonasi hali qo'llanmaydi — kampaniya sanalari Toshkent vaqtida */
const TZ = '+05:00';
const START_BUFFER_MS = 10 * 60_000;

@Injectable()
export class AdsService {
  private readonly logger = new Logger(AdsService.name);
  private readonly reachCache = new Map<string, { at: number; value: Reach }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: MetaConnectionsService,
    private readonly sync: AdsSyncService,
    @Inject(META_CLIENT) private readonly meta: MetaClient,
  ) {}

  async overview(schoolId: string, period: Period): Promise<AdsOverviewDto> {
    const ref = await this.requireRef(schoolId);
    const range = periodRange(period);
    const prev = previousRange(range);

    const [campaigns, current, previous, daily, reach, prevReach] = await Promise.all([
      this.prisma.adCampaign.findMany({ where: { schoolId } }),
      this.sumByCampaign(schoolId, range),
      this.sumByCampaign(schoolId, prev),
      this.prisma.adCampaignDailyInsight.groupBy({
        by: ['date'],
        where: { campaign: { schoolId }, date: { gte: range.from, lte: range.to } },
        _sum: { spend: true, clicks: true },
      }),
      this.reach(schoolId, ref, range),
      this.reach(schoolId, ref, prev),
    ]);

    const byDate = new Map(daily.map((d) => [toIsoDate(d.date), d._sum]));
    const rows: AdCampaignDto[] = campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      dailyBudget: c.dailyBudget,
      startTime: c.startTime?.toISOString() ?? null,
      stopTime: c.stopTime?.toISOString() ?? null,
      ...totals([current.get(c.id)].filter(isDefined), reach ? (reach.byCampaign[c.externalId] ?? 0) : null),
    }));
    // Faollari yuqorida, ichida — ko'p sarflangani birinchi
    rows.sort((a, b) => Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE') || b.spend - a.spend);

    return {
      range: { from: toIsoDate(range.from), to: toIsoDate(range.to) },
      currency: ref.currency,
      totals: totals([...current.values()], reach?.total ?? null),
      previousTotals: totals([...previous.values()], prevReach?.total ?? null),
      campaigns: rows,
      series: eachDay(range.from, range.to).map((d) => {
        const s = byDate.get(toIsoDate(d));
        return { date: toIsoDate(d), spend: s?.spend ?? 0, clicks: s?.clicks ?? 0 };
      }),
    };
  }

  async setStatus(schoolId: string, id: string, status: 'ACTIVE' | 'PAUSED'): Promise<void> {
    const ref = await this.requireRef(schoolId);
    const campaign = await this.prisma.adCampaign.findFirst({ where: { id, schoolId } });
    if (!campaign) throw new NotFoundException('Campaign topilmadi');
    if (campaign.status !== 'ACTIVE' && campaign.status !== 'PAUSED') {
      throw new ConflictException("Arxivlangan campaignni boshqarib bo'lmaydi");
    }
    await this.call(() => this.meta.setCampaignStatus(ref, campaign.externalId, status));
    await this.prisma.adCampaign.update({ where: { id }, data: { status } });
  }

  async create(schoolId: string, input: CreateCampaignInput): Promise<AdCampaignDto> {
    const ref = await this.requireRef(schoolId);
    const today = toIsoDate(startOfUtcDay(new Date()));
    if (input.startDate < today) throw new BadRequestException("Boshlanish sanasi o'tib ketgan");

    const page = await this.connections.instagramRef(schoolId);
    if (input.objective === 'OUTCOME_LEADS' && !page) {
      throw new BadRequestException("Lid campaigni uchun Facebook sahifa kerak — avval Instagram bo'limida akkauntni ulang");
    }

    // Bugun boshlansa — bir necha daqiqadan keyin (Meta o'tgan vaqtni qabul qilmaydi)
    const startTime = new Date(Math.max(new Date(`${input.startDate}T00:00:00${TZ}`).getTime(), Date.now() + START_BUFFER_MS));
    const endTime = new Date(`${input.endDate}T23:59:00${TZ}`);

    const { campaignId } = await this.call(() =>
      this.meta.createCampaign(ref, {
        name: input.name,
        objective: input.objective,
        dailyBudget: input.dailyBudget,
        startTime,
        endTime,
        ageMin: input.audience.ageMin,
        ageMax: input.audience.ageMax,
        genders: input.audience.genders,
        countryCodes: input.audience.countries,
        cityKeys: input.audience.cities,
        pageId: page?.pageId ?? null,
      }),
    );
    await this.sync.syncCampaigns(schoolId, ref);
    const c = await this.prisma.adCampaign.findUniqueOrThrow({
      where: { schoolId_externalId: { schoolId, externalId: campaignId } },
    });
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      dailyBudget: c.dailyBudget,
      startTime: c.startTime?.toISOString() ?? null,
      stopTime: c.stopTime?.toISOString() ?? null,
      ...totals([], 0),
    };
  }

  async locations(schoolId: string, q: string): Promise<GeoLocationDto[]> {
    const ref = await this.requireRef(schoolId);
    return this.call(() => this.meta.searchLocations(ref, q));
  }

  private async requireRef(schoolId: string): Promise<AdsRef> {
    const ref = await this.connections.adsRef(schoolId);
    if (!ref) throw new ServiceUnavailableException('Reklama akkaunti ulanmagan');
    return ref;
  }

  private async sumByCampaign(schoolId: string, range: Range) {
    const groups = await this.prisma.adCampaignDailyInsight.groupBy({
      by: ['campaignId'],
      where: { campaign: { schoolId }, date: { gte: range.from, lte: range.to } },
      _sum: { spend: true, clicks: true, impressions: true, leads: true },
    });
    return new Map(groups.map((g) => [g.campaignId, g._sum]));
  }

  /** Olib bo'lmasa null — sahifa baribir ochiladi, reach "—" ko'rinadi */
  private async reach(schoolId: string, ref: AdsRef, range: Range): Promise<Reach> {
    const key = `${schoolId}:${toIsoDate(range.from)}:${toIsoDate(range.to)}`;
    const hit = this.reachCache.get(key);
    if (hit && Date.now() - hit.at < REACH_TTL_MS) return hit.value;
    const value = await this.meta.getReach(ref, range.from, range.to).catch((err: Error) => {
      this.logger.warn(`Reach olinmadi (school=${schoolId}): ${err.message}`);
      return null;
    });
    this.reachCache.set(key, { at: Date.now(), value });
    return value;
  }

  /** Meta xatolarini foydalanuvchiga tushunarli ko'rinishga keltiradi */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof MetaApiError) {
        if (err.isAuthError) {
          throw new ConflictException("Reklama akkaunti ruxsati tugagan — Facebook Ads bo'limida qayta ulang");
        }
        throw new BadRequestException(`Meta xatosi: ${err.message}`);
      }
      throw err;
    }
  }
}

type Sums = { spend: number | null; clicks: number | null; impressions: number | null; leads: number | null };

export function totals(rows: Sums[], reach: number | null): AdTotals {
  const sum = (k: keyof Sums) => rows.reduce((a, r) => a + (r[k] ?? 0), 0);
  const clicks = sum('clicks');
  const impressions = sum('impressions');
  return {
    spend: sum('spend'),
    clicks,
    impressions,
    reach,
    leads: sum('leads'),
    ctr: impressions ? Math.round((clicks / impressions) * 10_000) / 100 : 0,
  };
}

function isDefined<T>(v: T | undefined): v is T {
  return v !== undefined;
}
