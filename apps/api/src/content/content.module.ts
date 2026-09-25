import { Module } from '@nestjs/common';
import { MetaModule } from '../meta/meta.module.js';
import { InstagramModule } from '../instagram/instagram.module.js';
import { ContentController } from './content.controller.js';
import { ContentService } from './content.service.js';
import { ContentPublisherService } from './content-publisher.service.js';

@Module({
  imports: [MetaModule, InstagramModule],
  controllers: [ContentController],
  providers: [ContentService, ContentPublisherService],
  exports: [ContentService],
})
export class ContentModule {}
