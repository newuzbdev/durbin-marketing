import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateGoalInput,
  CreateLeadInput,
  GoalDto,
  LeadDto,
  LeadSource,
  Paginated,
  UpdateGoalInput,
} from '@durbin/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { addDays, parseIsoDate, startOfUtcDay, toIsoDate } from '../common/dates.js';
import type { Goal, Lead } from '../generated/prisma/client.js';
import { followerGain, goalProgress, measuredRange } from './goal-progress.js';

/** Tartib: faol → kelgusi → bajarilgan → bajarilmagan; ichida — tugash sanasi bo'yicha */
const STATUS_ORDER = { active: 0, upcoming: 1, achieved: 2, missed: 3 } as const;

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string): Promise<GoalDto[]> {
    const goals = await this.prisma.goal.findMany({ where: { schoolId }, orderBy: { endDate: 'asc' } });
    const dtos = await Promise.all(goals.map((g) => this.toDto(g)));
    return dtos.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  }

  async create(schoolId: string, input: CreateGoalInput): Promise<GoalDto> {
    const goal = await this.prisma.goal.create({
      data: {
        schoolId,
        name: input.name,
        type: input.type,
        target: input.target,
        startDate: parseIsoDate(input.startDate),
        endDate: parseIsoDate(input.endDate),
      },
    });
    return this.toDto(goal);
  }

  async update(schoolId: string, id: string, input: UpdateGoalInput): Promise<GoalDto> {
    const goal = await this.find(schoolId, id);
    const startDate = input.startDate ? parseIsoDate(input.startDate) : goal.startDate;
    const endDate = input.endDate ? parseIsoDate(input.endDate) : goal.endDate;
    if (endDate < startDate) throw new BadRequestException("Tugash sanasi boshlanishdan keyin bo'lishi kerak");
    const updated = await this.prisma.goal.update({
      where: { id: goal.id },
      data: { name: input.name, type: input.type, target: input.target, startDate, endDate },
    });
    return this.toDto(updated);
  }

  async remove(schoolId: string, id: string): Promise<void> {
    const goal = await this.find(schoolId, id);
    await this.prisma.goal.delete({ where: { id: goal.id } });
  }

  async leads(schoolId: string, page: number, pageSize: number): Promise<Paginated<LeadDto>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        // count=0 — lid emas deb belgilangan avtomatik yozuv
        where: { schoolId, count: { gt: 0 } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.lead.count({ where: { schoolId, count: { gt: 0 } } }),
    ]);
    return { items: items.map(toLeadDto), total, page, pageSize };
  }

  async addLead(schoolId: string, input: CreateLeadInput): Promise<LeadDto> {
    const date = parseIsoDate(input.date);
    if (date > startOfUtcDay(new Date())) throw new BadRequestException('Kelajakdagi sana uchun lid kiritib bo‘lmaydi');
    const lead = await this.prisma.lead.create({
      data: {
        schoolId,
        source: input.source,
        count: input.count,
        date,
        name: input.name || null,
        phone: input.phone || null,
      },
    });
    return toLeadDto(lead);
  }

  async removeLead(schoolId: string, id: string): Promise<void> {
    const lead = await this.prisma.lead.findFirst({ where: { id, schoolId } });
    if (!lead) throw new NotFoundException('Yozuv topilmadi');
    // Avtomatik manbadan kelgan yozuv count=0 bo'ladi — o'chirilsa, keyingi aylanishda qayta qo'shilib qoladi
    if (lead.externalId) await this.prisma.lead.update({ where: { id: lead.id }, data: { count: 0 } });
    else await this.prisma.lead.delete({ where: { id: lead.id } });
  }

  private async find(schoolId: string, id: string): Promise<Goal> {
    const goal = await this.prisma.goal.findFirst({ where: { id, schoolId } });
    if (!goal) throw new NotFoundException('Maqsad topilmadi');
    return goal;
  }

  private async toDto(goal: Goal): Promise<GoalDto> {
    const { current, dataMissing, bySource } = await this.measure(goal);
    return {
      id: goal.id,
      name: goal.name,
      type: goal.type,
      target: goal.target,
      startDate: toIsoDate(goal.startDate),
      endDate: toIsoDate(goal.endDate),
      current,
      dataMissing,
      bySource,
      ...goalProgress({ ...goal, current }),
    };
  }

  /** Maqsad turi bo'yicha haqiqiy qiymat. Boshlanmagan maqsad uchun 0. */
  private async measure(goal: Goal): Promise<{ current: number; dataMissing: boolean; bySource: GoalDto['bySource'] }> {
    const range = measuredRange(goal.startDate, goal.endDate);
    const schoolId = goal.schoolId;

    if (goal.type === 'LEAD') {
      if (!range) return { current: 0, dataMissing: false, bySource: {} };
      const groups = await this.prisma.lead.groupBy({
        by: ['source'],
        where: { schoolId, date: { gte: range.from, lte: range.to } },
        _sum: { count: true },
      });
      const bySource: Partial<Record<LeadSource, number>> = {};
      for (const g of groups) bySource[g.source] = g._sum.count ?? 0;
      return { current: Object.values(bySource).reduce((a, b) => a + b, 0), dataMissing: false, bySource };
    }

    if (goal.type === 'AD_CLICK') {
      const campaigns = await this.prisma.adCampaign.count({ where: { schoolId } });
      if (!range) return { current: 0, dataMissing: campaigns === 0, bySource: null };
      const agg = await this.prisma.adCampaignDailyInsight.aggregate({
        where: { campaign: { schoolId }, date: { gte: range.from, lte: range.to } },
        _sum: { clicks: true },
      });
      return { current: agg._sum.clicks ?? 0, dataMissing: campaigns === 0, bySource: null };
    }

    // FOLLOWER / REACH — Instagram kunlik statistikasi
    const connected = (await this.prisma.metaConnection.count({ where: { schoolId, type: 'INSTAGRAM' } })) > 0;
    if (!range) return { current: 0, dataMissing: !connected, bySource: null };
    if (goal.type === 'REACH') {
      const agg = await this.prisma.igDailyInsight.aggregate({
        where: { schoolId, date: { gte: range.from, lte: range.to } },
        _sum: { reach: true },
        _count: true,
      });
      return { current: agg._sum.reach ?? 0, dataMissing: !connected && agg._count === 0, bySource: null };
    }
    const rows = await this.prisma.igDailyInsight.findMany({
      where: { schoolId, date: { gte: addDays(range.from, -1), lte: range.to } },
      select: { date: true, followers: true },
    });
    const gain = followerGain(rows, range.from);
    return { current: gain ?? 0, dataMissing: gain === null, bySource: null };
  }
}

function toLeadDto(l: Lead): LeadDto {
  return {
    id: l.id,
    source: l.source,
    count: l.count,
    date: toIsoDate(l.date),
    name: l.name,
    phone: l.phone,
    createdAt: l.createdAt.toISOString(),
  };
}
