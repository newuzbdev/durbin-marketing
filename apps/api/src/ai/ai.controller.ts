import { Body, Controller, Delete, Get, HttpCode, Param, ParseEnumPipe, Post, UseGuards } from '@nestjs/common';
import {
  chatMessageSchema,
  scriptRequestSchema,
  type AiInsightKind,
  type ChatMessageInput,
  type ScriptRequestInput,
} from '@durbin/shared';
import { CurrentSchool, CurrentUser, Roles, type AuthUser, type SchoolContext } from '../auth/decorators.js';
import { SchoolGuard } from '../schools/school.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AiService } from './ai.service.js';

const KINDS = { ANALYSIS: 'ANALYSIS', CONTENT_SUGGESTION: 'CONTENT_SUGGESTION' } as const;

// AI chaqiruvlari pullik — yaratish faqat menejer va egaga; ko'rish hammaga
@Controller('ai')
@UseGuards(SchoolGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  status() {
    return this.ai.status();
  }

  @Get('insights/:kind')
  latest(@CurrentSchool() school: SchoolContext, @Param('kind', new ParseEnumPipe(KINDS)) kind: AiInsightKind) {
    return this.ai.latestInsights(school.id, kind);
  }

  @Post('insights/:kind')
  @Roles('OWNER', 'MANAGER')
  generate(@CurrentSchool() school: SchoolContext, @Param('kind', new ParseEnumPipe(KINDS)) kind: AiInsightKind) {
    return this.ai.generateInsights(school.id, kind);
  }

  @Post('script')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(200)
  script(@CurrentSchool() school: SchoolContext, @Body(new ZodPipe(scriptRequestSchema)) body: ScriptRequestInput) {
    return this.ai.script(school.id, body);
  }

  @Get('threads')
  threads(@CurrentSchool() school: SchoolContext, @CurrentUser() user: AuthUser) {
    return this.ai.threads(school.id, user.id);
  }

  @Get('threads/:id/messages')
  messages(@CurrentSchool() school: SchoolContext, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ai.messages(school.id, user.id, id);
  }

  @Delete('threads/:id')
  @HttpCode(204)
  async deleteThread(@CurrentSchool() school: SchoolContext, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.ai.deleteThread(school.id, user.id, id);
  }

  @Post('chat')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(200)
  chat(
    @CurrentSchool() school: SchoolContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(chatMessageSchema)) body: ChatMessageInput,
  ) {
    return this.ai.chat(school.id, user.id, body);
  }
}
