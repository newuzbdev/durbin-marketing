import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseEnumPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { selectInstagramAccountSchema, type SelectInstagramAccountInput } from '@durbin/shared';
import { CurrentSchool, CurrentUser, Public, Roles, type AuthUser, type SchoolContext } from '../auth/decorators.js';
import { SchoolGuard } from '../schools/school.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { MetaConnectionsService } from './meta-connections.service.js';

const CONNECTION_TYPES = { INSTAGRAM: 'INSTAGRAM', ADS: 'ADS' } as const;

@Controller('meta')
export class MetaOAuthController {
  constructor(private readonly connections: MetaConnectionsService) {}

  /** Web shu URL'ga yo'naltiradi (Facebook Login yoki mock rejimda to'g'ridan-to'g'ri callback) */
  @Get('oauth/start')
  @UseGuards(SchoolGuard)
  @Roles('OWNER', 'MANAGER')
  start(@CurrentSchool() school: SchoolContext, @CurrentUser() user: AuthUser, @Headers('origin') origin?: string) {
    return this.connections.startOAuth(school.id, user.id, origin);
  }

  /** Facebook shu yerga qaytaradi. Brauzer navigatsiyasi — JWT yo'q, maktab `state` ichida imzolangan. */
  @Public()
  @Get('oauth/callback')
  async callback(
    @Query() query: { code?: string; state?: string; error?: string },
    @Res() res: Response,
  ) {
    res.redirect(302, await this.connections.handleCallback(query));
  }

  /** mock — Meta App ulanmagan, namunaviy ma'lumot; live — haqiqiy Graph API */
  @Get('mode')
  mode() {
    return { mode: this.connections.mode };
  }

  @Get('connections')
  @UseGuards(SchoolGuard)
  list(@CurrentSchool() school: SchoolContext) {
    return this.connections.list(school.id);
  }

  @Get('connections/instagram/pending/:selectionId')
  @UseGuards(SchoolGuard)
  @Roles('OWNER', 'MANAGER')
  pending(@CurrentSchool() school: SchoolContext, @Param('selectionId') selectionId: string) {
    return this.connections.pendingAccounts(school.id, selectionId);
  }

  @Post('connections/instagram')
  @UseGuards(SchoolGuard)
  @Roles('OWNER', 'MANAGER')
  @HttpCode(204)
  async select(
    @CurrentSchool() school: SchoolContext,
    @Body(new ZodPipe(selectInstagramAccountSchema)) body: SelectInstagramAccountInput,
  ) {
    await this.connections.selectInstagram(school.id, body.selectionId, body.igUserId);
  }

  @Delete('connections/:type')
  @UseGuards(SchoolGuard)
  @Roles('OWNER', 'MANAGER')
  @HttpCode(204)
  async disconnect(
    @CurrentSchool() school: SchoolContext,
    @Param('type', new ParseEnumPipe(CONNECTION_TYPES)) type: keyof typeof CONNECTION_TYPES,
  ) {
    await this.connections.disconnect(school.id, type);
  }
}
