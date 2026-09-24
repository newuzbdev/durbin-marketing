import { Module } from '@nestjs/common';
import { META_CLIENT, type MetaClient } from './meta-client.js';
import { GraphMetaClient } from './graph-meta-client.js';
import { MockMetaClient } from './mock-meta-client.js';
import { MetaConnectionsService } from './meta-connections.service.js';
import { MetaOAuthController } from './meta-oauth.controller.js';

@Module({
  controllers: [MetaOAuthController],
  providers: [
    {
      provide: META_CLIENT,
      useFactory: (): MetaClient => (process.env.META_MODE === 'live' ? new GraphMetaClient() : new MockMetaClient()),
    },
    MetaConnectionsService,
  ],
  exports: [META_CLIENT, MetaConnectionsService],
})
export class MetaModule {}
