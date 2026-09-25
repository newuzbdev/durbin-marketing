import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { dashboardQuerySchema } from '@durbin/shared';
import { CurrentSchool, type SchoolContext } from '../auth/decorators.js';
import { SchoolGuard } from '../schools/school.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DashboardService } from './dashboard.service.js';

type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

@Controller('dashboard')
@UseGuards(SchoolGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@CurrentSchool() school: SchoolContext, @Query(new ZodPipe(dashboardQuerySchema)) q: DashboardQuery) {
    return this.dashboard.get(school.id, q.period);
  }
}
