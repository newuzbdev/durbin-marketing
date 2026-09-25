import { Module } from '@nestjs/common';
import { InstagramModule } from '../instagram/instagram.module.js';
import { GoalsModule } from '../goals/goals.module.js';
import { ContentModule } from '../content/content.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [InstagramModule, GoalsModule, ContentModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
