import { Body, Controller, Delete, Get, HttpCode, Logger, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createPostSchema,
  listPostsQuerySchema,
  updatePostSchema,
  uploadRequestSchema,
  type CreatePostInput,
  type ListPostsQuery,
  type UpdatePostInput,
  type UploadRequestInput,
} from '@durbin/shared';
import { CurrentSchool, CurrentUser, Roles, type AuthUser, type SchoolContext } from '../auth/decorators.js';
import { SchoolGuard } from '../schools/school.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ContentService } from './content.service.js';
import { ContentPublisherService } from './content-publisher.service.js';

@Controller('content')
@UseGuards(SchoolGuard)
export class ContentController {
  private readonly logger = new Logger(ContentController.name);

  constructor(
    private readonly content: ContentService,
    private readonly publisher: ContentPublisherService,
  ) {}

  @Get('posts')
  list(@CurrentSchool() school: SchoolContext, @Query(new ZodPipe(listPostsQuerySchema)) q: ListPostsQuery) {
    return this.content.list(school.id, new Date(q.from), new Date(q.to));
  }

  @Get('stats')
  stats(@CurrentSchool() school: SchoolContext, @Query(new ZodPipe(listPostsQuerySchema)) q: ListPostsQuery) {
    return this.content.stats(school.id, new Date(q.from), new Date(q.to));
  }

  @Get('posts/:id')
  get(@CurrentSchool() school: SchoolContext, @Param('id') id: string) {
    return this.content.get(school.id, id);
  }

  @Post('posts')
  @Roles('OWNER', 'MANAGER')
  create(
    @CurrentSchool() school: SchoolContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createPostSchema)) body: CreatePostInput,
  ) {
    return this.content.create(school.id, user.id, body);
  }

  @Patch('posts/:id')
  @Roles('OWNER', 'MANAGER')
  update(
    @CurrentSchool() school: SchoolContext,
    @Param('id') id: string,
    @Body(new ZodPipe(updatePostSchema)) body: UpdatePostInput,
  ) {
    return this.content.update(school.id, id, body);
  }

  @Delete('posts/:id')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(204)
  async remove(@CurrentSchool() school: SchoolContext, @Param('id') id: string) {
    await this.content.remove(school.id, id);
  }

  /** Darhol chiqarish / qayta urinish. Javob PUBLISHING'gacha qaytadi; natija ro'yxatni qayta so'rashda ko'rinadi. */
  @Post('posts/:id/publish')
  @Roles('OWNER', 'MANAGER')
  async publishNow(@CurrentSchool() school: SchoolContext, @Param('id') id: string) {
    const post = await this.content.queueNow(school.id, id);
    void this.publisher.run().catch((err: Error) => this.logger.error(`Publisher xatosi: ${err.message}`));
    return post;
  }

  @Post('posts/:id/mark-published')
  @Roles('OWNER', 'MANAGER')
  markPublished(@CurrentSchool() school: SchoolContext, @Param('id') id: string) {
    return this.content.markPublished(school.id, id);
  }

  @Post('uploads')
  @Roles('OWNER', 'MANAGER')
  createUpload(@CurrentSchool() school: SchoolContext, @Body(new ZodPipe(uploadRequestSchema)) body: UploadRequestInput) {
    return this.content.createUpload(school.id, body);
  }
}
