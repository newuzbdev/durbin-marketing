import { Module } from '@nestjs/common';
import { MetaModule } from '../meta/meta.module.js';
import { InstagramController } from './instagram.controller.js';
import { InstagramService } from './instagram.service.js';
import { InstagramSyncService } from './instagram-sync.service.js';
import { DmService } from './dm.service.js';

@Module({
  imports: [MetaModule],
  controllers: [InstagramController],
  providers: [InstagramService, InstagramSyncService, DmService],
  exports: [InstagramSyncService, DmService, InstagramService],
})
export class InstagramModule {}
