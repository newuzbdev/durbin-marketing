import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  createGoalSchema,
  connectTelegramSchema,
  createLeadSchema,
  igAutoLeadsSchema,
  listLeadsQuerySchema,
  updateGoalSchema,
  type ConnectTelegramInput,
  type CreateGoalInput,
  type IgAutoLeadsInput,
  type CreateLeadInput,
  type UpdateGoalInput,
} from '@durbin/shared';
import { CurrentSchool, Roles, type SchoolContext } from '../auth/decorators.js';
import { SchoolGuard } from '../schools/school.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { GoalsService } from './goals.service.js';
import { LeadSourcesService } from './lead-sources.service.js';

type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

@Controller()
@UseGuards(SchoolGuard)
export class GoalsController {
  constructor(
    private readonly goals: GoalsService,
    private readonly sources: LeadSourcesService,
  ) {}

  @Get('goals')
  list(@CurrentSchool() school: SchoolContext) {
    return this.goals.list(school.id);
  }

  @Post('goals')
  @Roles('OWNER', 'MANAGER')
  create(@CurrentSchool() school: SchoolContext, @Body(new ZodPipe(createGoalSchema)) body: CreateGoalInput) {
    return this.goals.create(school.id, body);
  }

  @Patch('goals/:id')
  @Roles('OWNER', 'MANAGER')
  update(
    @CurrentSchool() school: SchoolContext,
    @Param('id') id: string,
    @Body(new ZodPipe(updateGoalSchema)) body: UpdateGoalInput,
  ) {
    return this.goals.update(school.id, id, body);
  }

  @Delete('goals/:id')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(204)
  async remove(@CurrentSchool() school: SchoolContext, @Param('id') id: string) {
    await this.goals.remove(school.id, id);
  }

  // ─── Avtomatik lid manbalari ───────────────────────────────────

  @Get('leads/sources')
  leadSources(@CurrentSchool() school: SchoolContext) {
    return this.sources.get(school.id);
  }

  @Put('leads/sources/instagram')
  @Roles('OWNER', 'MANAGER')
  setInstagramAuto(@CurrentSchool() school: SchoolContext, @Body(new ZodPipe(igAutoLeadsSchema)) body: IgAutoLeadsInput) {
    return this.sources.setInstagramAuto(school.id, body.enabled);
  }

  @Post('leads/sources/telegram')
  @Roles('OWNER', 'MANAGER')
  connectTelegram(
    @CurrentSchool() school: SchoolContext,
    @Body(new ZodPipe(connectTelegramSchema)) body: ConnectTelegramInput,
  ) {
    return this.sources.connectTelegram(school.id, body.token);
  }

  @Delete('leads/sources/telegram')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(204)
  async disconnectTelegram(@CurrentSchool() school: SchoolContext) {
    await this.sources.disconnectTelegram(school.id);
  }

  /** Instagram suhbatdoshini lid deb belgilash / bekor qilish */
  @Post('leads/instagram/:conversationId')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(204)
  async markInstagram(@CurrentSchool() school: SchoolContext, @Param('conversationId') id: string) {
    await this.sources.markInstagram(school.id, id);
  }

  @Delete('leads/instagram/:conversationId')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(204)
  async unmarkInstagram(@CurrentSchool() school: SchoolContext, @Param('conversationId') id: string) {
    await this.sources.unmarkInstagram(school.id, id);
  }

  @Get('leads')
  leads(@CurrentSchool() school: SchoolContext, @Query(new ZodPipe(listLeadsQuerySchema)) q: ListLeadsQuery) {
    return this.goals.leads(school.id, q.page, q.pageSize);
  }

  @Post('leads')
  @Roles('OWNER', 'MANAGER')
  addLead(@CurrentSchool() school: SchoolContext, @Body(new ZodPipe(createLeadSchema)) body: CreateLeadInput) {
    return this.goals.addLead(school.id, body);
  }

  @Delete('leads/:id')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(204)
  async removeLead(@CurrentSchool() school: SchoolContext, @Param('id') id: string) {
    await this.goals.removeLead(school.id, id);
  }
}
