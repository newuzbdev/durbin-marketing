import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { MetaModule } from './meta/meta.module.js';
import { InstagramModule } from './instagram/instagram.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';
import { StorageModule } from './storage/storage.module.js';
import { ContentModule } from './content/content.module.js';
import { GoalsModule } from './goals/goals.module.js';
import { AdsModule } from './ads/ads.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    MetaModule,
    InstagramModule,
    WebhooksModule,
    StorageModule,
    ContentModule,
    GoalsModule,
    AdsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
