import { Module } from '@nestjs/common';
import { InstagramModule } from '../instagram/instagram.module.js';
import { MetaWebhookController } from './meta-webhook.controller.js';

@Module({
  imports: [InstagramModule],
  controllers: [MetaWebhookController],
})
export class WebhooksModule {}
