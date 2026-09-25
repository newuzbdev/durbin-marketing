import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  mediaKind,
  POST_TYPE_MEDIA,
  type ContentPostDto,
  type ContentStatsDto,
  type CreatePostInput,
  type MediaAssetDto,
  type PostType,
  type UpdatePostInput,
  type UploadRequestInput,
  type UploadTicketDto,
} from '@durbin/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { MediaAsset, Prisma } from '../generated/prisma/client.js';

/** Soat farqi va sekin tarmoq uchun: "hozir" deb tanlangan vaqt o'tib ketgan hisoblanmaydi */
const PAST_TOLERANCE_MS = 2 * 60_000;

const POST_INCLUDE = {
  mediaAsset: true,
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.ContentPostInclude;

type PostRow = Prisma.ContentPostGetPayload<{ include: typeof POST_INCLUDE }>;

const MEDIA_MISMATCH: Record<PostType, string> = {
  IMAGE: 'Rasm posti uchun JPEG rasm kerak',
  VIDEO: 'Video post uchun video fayl kerak',
  REEL: 'Reel uchun video fayl kerak',
  STORY: 'Story uchun rasm yoki video kerak',
};

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async createUpload(schoolId: string, input: UploadRequestInput): Promise<UploadTicketDto> {
    const { key, url, uploadUrl } = await this.storage.createUpload(schoolId, input.contentType);
    const asset = await this.prisma.mediaAsset.create({
      data: { schoolId, key, url, contentType: input.contentType, size: input.size },
    });
    return { asset: toAssetDto(asset), uploadUrl };
  }

  async list(schoolId: string, from: Date, to: Date): Promise<ContentPostDto[]> {
    const rows = await this.prisma.contentPost.findMany({
      where: { schoolId, scheduledAt: { gte: from, lt: to } },
      orderBy: { scheduledAt: 'asc' },
      include: POST_INCLUDE,
    });
    return rows.map(toPostDto);
  }

  async stats(schoolId: string, from: Date, to: Date): Promise<ContentStatsDto> {
    const groups = await this.prisma.contentPost.groupBy({
      by: ['status'],
      where: { schoolId, scheduledAt: { gte: from, lt: to } },
      _count: { _all: true },
    });
    const n = (...statuses: string[]) =>
      groups.filter((g) => statuses.includes(g.status)).reduce((sum, g) => sum + g._count._all, 0);
    return {
      total: n('SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'MISSED', 'FAILED'),
      scheduled: n('SCHEDULED', 'PUBLISHING'),
      published: n('PUBLISHED'),
      missed: n('MISSED'),
      failed: n('FAILED'),
    };
  }

  async get(schoolId: string, id: string): Promise<ContentPostDto> {
    return toPostDto(await this.find(schoolId, id));
  }

  async create(schoolId: string, userId: string, input: CreatePostInput): Promise<ContentPostDto> {
    const scheduledAt = futureDate(input.scheduledAt);
    const mediaAssetId = await this.checkMedia(schoolId, input.mediaAssetId ?? null, input.type);
    const post = await this.prisma.contentPost.create({
      data: {
        schoolId,
        createdById: userId,
        type: input.type,
        title: input.title,
        caption: input.caption,
        scheduledAt,
        autoPublish: input.autoPublish,
        mediaAssetId,
      },
      include: POST_INCLUDE,
    });
    return toPostDto(post);
  }

  async update(schoolId: string, id: string, input: UpdatePostInput): Promise<ContentPostDto> {
    const post = await this.find(schoolId, id);
    assertEditable(post.status);

    const type = input.type ?? post.type;
    const mediaAssetId = await this.checkMedia(
      schoolId,
      input.mediaAssetId !== undefined ? input.mediaAssetId : post.mediaAssetId,
      type,
    );
    const scheduledAt = input.scheduledAt ? futureDate(input.scheduledAt) : post.scheduledAt;
    // O'tib ketgan / xato bo'lgan post yangi vaqtga ko'chirilsa — yana rejalashtirilgan bo'ladi
    const reschedule = post.status !== 'SCHEDULED' && scheduledAt.getTime() > Date.now();

    const updated = await this.prisma.contentPost.update({
      where: { id: post.id },
      data: {
        type,
        title: input.title,
        caption: input.caption,
        autoPublish: input.autoPublish,
        scheduledAt,
        mediaAssetId,
        ...(reschedule ? { status: 'SCHEDULED', error: null } : {}),
      },
      include: POST_INCLUDE,
    });
    return toPostDto(updated);
  }

  async remove(schoolId: string, id: string): Promise<void> {
    const post = await this.find(schoolId, id);
    if (post.status === 'PUBLISHING') {
      throw new ConflictException("Post hozir chiqarilmoqda — biroz kutib, keyin o'chiring");
    }
    await this.prisma.contentPost.delete({ where: { id: post.id } });

    // Fayl boshqa postda ishlatilmasa, saqlashdan ham o'chiriladi
    const asset = post.mediaAsset;
    if (asset && !(await this.prisma.contentPost.count({ where: { mediaAssetId: asset.id } }))) {
      await this.prisma.mediaAsset.delete({ where: { id: asset.id } });
      await this.storage.remove(asset.key);
    }
  }

  /** Darhol chiqarish (yoki xato/o'tib ketgan postni qayta urinish): publisher keyingi aylanishda oladi */
  async queueNow(schoolId: string, id: string): Promise<ContentPostDto> {
    const post = await this.find(schoolId, id);
    assertEditable(post.status);
    if (!post.mediaAsset) throw new BadRequestException('Avval media fayl biriktiring');
    const updated = await this.prisma.contentPost.update({
      where: { id: post.id },
      data: { status: 'SCHEDULED', autoPublish: true, scheduledAt: new Date(), error: null },
      include: POST_INCLUDE,
    });
    return toPostDto(updated);
  }

  /** Qo'lda chiqarilgan post uchun */
  async markPublished(schoolId: string, id: string): Promise<ContentPostDto> {
    const post = await this.find(schoolId, id);
    assertEditable(post.status);
    const updated = await this.prisma.contentPost.update({
      where: { id: post.id },
      data: { status: 'PUBLISHED', publishedAt: new Date(), error: null },
      include: POST_INCLUDE,
    });
    return toPostDto(updated);
  }

  private async find(schoolId: string, id: string): Promise<PostRow> {
    const post = await this.prisma.contentPost.findFirst({ where: { id, schoolId }, include: POST_INCLUDE });
    if (!post) throw new NotFoundException('Post topilmadi');
    return post;
  }

  /** Fayl shu maktabniki va post turiga mosligini tekshiradi */
  private async checkMedia(schoolId: string, assetId: string | null, type: PostType): Promise<string | null> {
    if (!assetId) return null;
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id: assetId, schoolId } });
    if (!asset) throw new BadRequestException('Media fayl topilmadi');
    if (!POST_TYPE_MEDIA[type].includes(mediaKind(asset.contentType))) {
      throw new BadRequestException(MEDIA_MISMATCH[type]);
    }
    return asset.id;
  }
}

function futureDate(iso: string): Date {
  const date = new Date(iso);
  if (date.getTime() < Date.now() - PAST_TOLERANCE_MS) {
    throw new BadRequestException("Chiqish vaqti o'tib ketgan — kelajakdagi vaqtni tanlang");
  }
  return date;
}

function assertEditable(status: string) {
  if (status === 'PUBLISHING' || status === 'PUBLISHED') {
    throw new ConflictException("Chiqarilgan yoki chiqarilayotgan postni o'zgartirib bo'lmaydi");
  }
}

function toAssetDto(a: MediaAsset): MediaAssetDto {
  return { id: a.id, url: a.url, contentType: a.contentType, size: a.size };
}

function toPostDto(p: PostRow): ContentPostDto {
  return {
    id: p.id,
    type: p.type,
    title: p.title,
    caption: p.caption,
    scheduledAt: p.scheduledAt.toISOString(),
    status: p.status,
    autoPublish: p.autoPublish,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    permalink: p.permalink,
    error: p.error,
    media: p.mediaAsset ? toAssetDto(p.mediaAsset) : null,
    createdBy: p.createdBy,
    createdAt: p.createdAt.toISOString(),
  };
}
