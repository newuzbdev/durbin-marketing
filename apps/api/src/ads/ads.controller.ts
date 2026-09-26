import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  campaignStatusSchema,
  locationSearchQuerySchema,
  createCampaignSchema,
  periodQuerySchema,
  type CampaignStatusInput,
  type CreateCampaignInput,
  type PeriodQuery,
} from '@durbin/shared';
import { CurrentSchool, Roles, type SchoolContext } from '../auth/decorators.js';
import { SchoolGuard } from '../schools/school.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AdsService } from './ads.service.js';
import { AdsSyncService } from './ads-sync.service.js';

type LocationSearchQuery = z.infer<typeof locationSearchQuerySchema>;

@Controller('ads')
@UseGuards(SchoolGuard)
export class AdsController {
  constructor(
    private readonly ads: AdsService,
    private readonly sync: AdsSyncService,
  ) {}

  @Get('overview')
  overview(@CurrentSchool() school: SchoolContext, @Query(new ZodPipe(periodQuerySchema)) q: PeriodQuery) {
    return this.ads.overview(school.id, q.period);
  }

  @Post('sync')
  @Roles('OWNER', 'MANAGER')
  async runSync(@CurrentSchool() school: SchoolContext) {
    const result = await this.sync.syncSchool(school.id);
    if (!result) throw new ServiceUnavailableException('Reklama akkaunti ulanmagan');
    return result;
  }

  @Patch('campaigns/:id/status')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(204)
  async setStatus(
    @CurrentSchool() school: SchoolContext,
    @Param('id') id: string,
    @Body(new ZodPipe(campaignStatusSchema)) body: CampaignStatusInput,
  ) {
    await this.ads.setStatus(school.id, id, body.status);
  }

  @Post('campaigns')
  @Roles('OWNER', 'MANAGER')
  create(@CurrentSchool() school: SchoolContext, @Body(new ZodPipe(createCampaignSchema)) body: CreateCampaignInput) {
    return this.ads.create(school.id, body);
  }

  @Get('locations')
  @Roles('OWNER', 'MANAGER')
  locations(
    @CurrentSchool() school: SchoolContext,
    @Query(new ZodPipe(locationSearchQuerySchema)) q: LocationSearchQuery,
  ) {
    return this.ads.locations(school.id, q.q);
  }
}
