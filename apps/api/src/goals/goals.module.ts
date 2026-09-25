import { Module } from '@nestjs/common';
import { GoalsController } from './goals.controller.js';
import { GoalsService } from './goals.service.js';
import { LeadSourcesService } from './lead-sources.service.js';
import { HttpTelegramApi, TELEGRAM_API } from '../telegram/telegram-api.js';

@Module({
  controllers: [GoalsController],
  providers: [GoalsService, LeadSourcesService, { provide: TELEGRAM_API, useClass: HttpTelegramApi }],
  exports: [GoalsService],
})
export class GoalsModule {}
