import { Body, Controller, Get, Param, Post, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  mediaListQuerySchema,
  periodQuerySchema,
  sendMessageSchema,
  type PeriodQuery,
  type SendMessageInput,
} from '@durbin/shared';
import { CurrentSchool, CurrentUser, Roles, type AuthUser, type SchoolContext } from '../auth/decorators.js';
import { SchoolGuard } from '../schools/school.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { InstagramService } from './instagram.service.js';
import { InstagramSyncService } from './instagram-sync.service.js';
import { DmService } from './dm.service.js';

type MediaListQuery = z.infer<typeof mediaListQuerySchema>;

@Controller('instagram')
@UseGuards(SchoolGuard)
export class InstagramController {
  constructor(
    private readonly instagram: InstagramService,
    private readonly sync: InstagramSyncService,
    private readonly dm: DmService,
  ) {}

  @Get('overview')
  overview(@CurrentSchool() school: SchoolContext, @Query(new ZodPipe(periodQuerySchema)) q: PeriodQuery) {
    return this.instagram.overview(school.id, q.period);
  }

  @Get('media')
  media(@CurrentSchool() school: SchoolContext, @Query(new ZodPipe(mediaListQuerySchema)) q: MediaListQuery) {
    return this.instagram.media(school.id, q.page, q.pageSize);
  }

  @Get('media/top')
  topMedia(@CurrentSchool() school: SchoolContext, @Query(new ZodPipe(periodQuerySchema)) q: PeriodQuery) {
    return this.instagram.topMedia(school.id, q.period);
  }

  @Post('sync')
  @Roles('OWNER', 'MANAGER')
  async runSync(@CurrentSchool() school: SchoolContext) {
    const result = await this.sync.syncSchool(school.id);
    if (!result) throw new ServiceUnavailableException('Instagram ulanmagan');
    return result;
  }

  @Get('conversations')
  conversations(@CurrentSchool() school: SchoolContext) {
    return this.dm.conversations(school.id);
  }

  @Get('conversations/:id/messages')
  messages(@CurrentSchool() school: SchoolContext, @Param('id') id: string) {
    return this.dm.messages(school.id, id);
  }

  @Post('conversations/:id/messages')
  @Roles('OWNER', 'MANAGER')
  send(
    @CurrentSchool() school: SchoolContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(sendMessageSchema)) body: SendMessageInput,
  ) {
    return this.dm.send(school.id, id, body.text, user.id);
  }
}
