import { Module } from '@nestjs/common';
import { InstagramModule } from '../instagram/instagram.module.js';
import { AdsModule } from '../ads/ads.module.js';
import { GoalsModule } from '../goals/goals.module.js';
import { MetaModule } from '../meta/meta.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { AiContextService } from './ai-context.service.js';
import { ReplicateClient } from './replicate-client.js';

@Module({
  imports: [MetaModule, InstagramModule, AdsModule, GoalsModule],
  controllers: [AiController],
  providers: [AiService, AiContextService, ReplicateClient],
})
export class AiModule {}
