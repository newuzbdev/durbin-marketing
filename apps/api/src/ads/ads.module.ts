import { Module } from '@nestjs/common';
import { MetaModule } from '../meta/meta.module.js';
import { AdsController } from './ads.controller.js';
import { AdsService } from './ads.service.js';
import { AdsSyncService } from './ads-sync.service.js';

@Module({
  imports: [MetaModule],
  controllers: [AdsController],
  providers: [AdsService, AdsSyncService],
  exports: [AdsSyncService],
})
export class AdsModule {}
