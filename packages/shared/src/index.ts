import { z } from 'zod';

// Enumlar Prisma sxemasi bilan bir xil bo'lishi kerak (apps/api/prisma/schema.prisma)
export const ROLES = ['OWNER', 'MANAGER', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const POST_TYPES = ['IMAGE', 'VIDEO', 'REEL', 'STORY'] as const;
export type PostType = (typeof POST_TYPES)[number];

export const POST_STATUSES = ['SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'MISSED'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const GOAL_TYPES = ['LEAD', 'FOLLOWER', 'REACH', 'AD_CLICK'] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const LEAD_SOURCES = ['INSTAGRAM', 'FB_ADS', 'TELEGRAM', 'MANUAL', 'WEBHOOK'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const CAMPAIGN_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_OBJECTIVES = [
  'OUTCOME_LEADS',
  'OUTCOME_TRAFFIC',
  'OUTCOME_AWARENESS',
  'OUTCOME_ENGAGEMENT',
] as const;
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

export const PERIODS = ['last_7d', 'last_30d', 'this_week', 'this_month', 'last_month'] as const;
export type Period = (typeof PERIODS)[number];

export const periodQuerySchema = z.object({ period: z.enum(PERIODS).default('last_30d') });
export type PeriodQuery = z.infer<typeof periodQuerySchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: YYYY-MM-DD');

// ─── Auth ───────────────────────────────────────────────────────

export const registerSchema = z.object({
  schoolName: z.string().min(2).max(120),
  name: z.string().min(2).max(120),
  email: z.email(),
  password: z.string().min(8).max(128),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ─── Kontent Plan ───────────────────────────────────────────────

/** Instagram Content Publishing API qabul qiladigan formatlar (rasm faqat JPEG) */
export const MEDIA_CONTENT_TYPES = ['image/jpeg', 'video/mp4', 'video/quicktime'] as const;
export type MediaContentType = (typeof MEDIA_CONTENT_TYPES)[number];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
export const CAPTION_MAX = 2200;

export type MediaKind = 'image' | 'video';
export const mediaKind = (contentType: string): MediaKind => (contentType.startsWith('video/') ? 'video' : 'image');

/** Har bir post turi qaysi media bilan chiqarilishi mumkin */
export const POST_TYPE_MEDIA: Record<PostType, MediaKind[]> = {
  IMAGE: ['image'],
  VIDEO: ['video'],
  REEL: ['video'],
  STORY: ['image', 'video'],
};

export const createPostSchema = z.object({
  type: z.enum(POST_TYPES),
  title: z.string().trim().min(1).max(200),
  caption: z.string().max(CAPTION_MAX).default(''),
  scheduledAt: z.iso.datetime({ offset: true }),
  mediaAssetId: z.string().nullable().optional(),
  autoPublish: z.boolean().default(true),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

// `.partial()` emas: zod 4 da default'lar optional ichida ham qo'llanadi va yuborilmagan maydonlarni ezib yuboradi
export const updatePostSchema = z.object({
  type: z.enum(POST_TYPES).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  caption: z.string().max(CAPTION_MAX).optional(),
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
  mediaAssetId: z.string().nullable().optional(),
  autoPublish: z.boolean().optional(),
});
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

/** Kalendar oralig'i: brauzer mahalliy vaqtidagi chegaralar ISO ko'rinishida, [from, to) */
export const listPostsQuerySchema = z
  .object({ from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }) })
  .refine((q) => new Date(q.to) > new Date(q.from), { message: "Oraliq noto'g'ri", path: ['to'] })
  .refine((q) => new Date(q.to).getTime() - new Date(q.from).getTime() <= 45 * 86_400_000, {
    message: 'Oraliq 45 kundan oshmasligi kerak',
    path: ['to'],
  });
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;

export const uploadRequestSchema = z
  .object({
    fileName: z.string().min(1).max(255),
    contentType: z.enum(MEDIA_CONTENT_TYPES, { error: 'Faqat JPEG rasm yoki MP4/MOV video' }),
    size: z.number().int().positive(),
  })
  .refine((f) => f.size <= (mediaKind(f.contentType) === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES), {
    message: 'Fayl hajmi juda katta (rasm ≤ 8 MB, video ≤ 300 MB)',
    path: ['size'],
  });
export type UploadRequestInput = z.infer<typeof uploadRequestSchema>;

export interface MediaAssetDto {
  id: string;
  url: string;
  contentType: string;
  size: number;
}

export interface UploadTicketDto {
  asset: MediaAssetDto;
  /** Brauzer faylni shu URL'ga PUT qiladi, `Content-Type` sarlavhasi bilan */
  uploadUrl: string;
}

export interface ContentPostDto {
  id: string;
  type: PostType;
  title: string;
  caption: string;
  scheduledAt: string;
  status: PostStatus;
  autoPublish: boolean;
  publishedAt: string | null;
  permalink: string | null;
  error: string | null;
  media: MediaAssetDto | null;
  createdBy: { id: string; name: string };
  createdAt: string;
}

export interface ContentStatsDto {
  total: number;
  scheduled: number;
  published: number;
  missed: number;
  failed: number;
}

// ─── Maqsadlar & lidlar ─────────────────────────────────────────

export const createGoalSchema = z
  .object({
    name: z.string().min(1).max(200),
    type: z.enum(GOAL_TYPES),
    target: z.number().int().positive(),
    startDate: isoDate,
    endDate: isoDate,
  })
  .refine((g) => g.endDate >= g.startDate, {
    message: "Tugash sanasi boshlanishdan keyin bo'lishi kerak",
    path: ['endDate'],
  });
export type CreateGoalInput = z.infer<typeof createGoalSchema>;

// Sanalar tartibi servisda birlashtirilgan qiymatlar bo'yicha tekshiriladi
export const updateGoalSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(GOAL_TYPES).optional(),
  target: z.number().int().positive().optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
});
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

/** Qo'lda kiritiladigan manbalar; WEBHOOK — faqat tizim orqali */
export const MANUAL_LEAD_SOURCES = ['INSTAGRAM', 'FB_ADS', 'TELEGRAM', 'MANUAL'] as const;

export const createLeadSchema = z.object({
  source: z.enum(MANUAL_LEAD_SOURCES),
  count: z.number().int().positive().max(100000).default(1),
  date: isoDate,
  name: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const listLeadsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Avtomatik lid manbalari
export const igAutoLeadsSchema = z.object({ enabled: z.boolean() });
export type IgAutoLeadsInput = z.infer<typeof igAutoLeadsSchema>;

export const connectTelegramSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^\d{5,}:[A-Za-z0-9_-]{30,}$/, "Token noto'g'ri. @BotFather bergan to'liq tokenni kiriting (123456:ABC...)"),
});
export type ConnectTelegramInput = z.infer<typeof connectTelegramSchema>;

export interface LeadSourcesDto {
  instagram: { connected: boolean; autoLeads: boolean };
  telegram: { username: string; link: string; lastError: string | null } | null;
}

export type GoalStatus = 'upcoming' | 'active' | 'achieved' | 'missed';

export interface GoalDto {
  id: string;
  name: string;
  type: GoalType;
  target: number;
  startDate: string;
  endDate: string;
  /** Hozirgacha erishilgan qiymat */
  current: number;
  /** 0–100, maqsaddan oshsa ham 100 */
  percent: number;
  remaining: number;
  /** Bugun ham kiradi; tugagan bo'lsa 0 */
  daysLeft: number;
  /** Tekis sur'at bo'yicha bugungacha kutilgan qiymat */
  expected: number;
  status: GoalStatus;
  /** FOLLOWER/REACH — Instagram, AD_CLICK — Facebook Ads ma'lumoti hali yo'q */
  dataMissing: boolean;
  /** Faqat LEAD: manbalar bo'yicha */
  bySource: Partial<Record<LeadSource, number>> | null;
}

export interface LeadDto {
  id: string;
  source: LeadSource;
  count: number;
  date: string;
  name: string | null;
  phone: string | null;
  createdAt: string;
}

export const webhookLeadSchema = z.object({
  source: z.enum(['TELEGRAM', 'WEBHOOK']).default('WEBHOOK'),
  externalId: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  date: isoDate.optional(),
});
export type WebhookLeadInput = z.infer<typeof webhookLeadSchema>;

// ─── Facebook Ads ───────────────────────────────────────────────

/** Meta: ko'pchilik valyutalar 1/100 birlikda, bular esa kasr qismisiz (Graph API currency offset = 1) */
const ZERO_DECIMAL_CURRENCIES = ['CLP', 'COP', 'CRC', 'HUF', 'ISK', 'IDR', 'JPY', 'KRW', 'PYG', 'TWD', 'VND'];
export const currencyOffset = (currency: string) => (ZERO_DECIMAL_CURRENCIES.includes(currency) ? 1 : 100);
/** Eng kichik birlik → asosiy birlik (masalan, tiyin → so'm) */
export const fromMinor = (minor: number, currency: string) => minor / currencyOffset(currency);
export const toMinor = (major: number, currency: string) => Math.round(major * currencyOffset(currency));

export const createCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    objective: z.enum(CAMPAIGN_OBJECTIVES),
    dailyBudget: z.number().int().positive(), // eng kichik valyuta birligida
    startDate: isoDate,
    endDate: isoDate,
    audience: z.object({
      ageMin: z.number().int().min(13).max(65).default(18),
      ageMax: z.number().int().min(13).max(65).default(45),
      genders: z.array(z.enum(['male', 'female'])).default([]),
      /** Meta geolokatsiya kalitlari (GET /ads/cities); bo'sh — butun O'zbekiston */
      cities: z.array(z.string().max(40)).max(25).default([]),
    }),
  })
  .refine((c) => c.endDate >= c.startDate, { message: 'Muddat noto‘g‘ri', path: ['endDate'] })
  .refine((c) => c.audience.ageMin <= c.audience.ageMax, { message: 'Yosh oralig‘i noto‘g‘ri', path: ['audience', 'ageMax'] });
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const campaignStatusSchema = z.object({ status: z.enum(['ACTIVE', 'PAUSED']) });
export type CampaignStatusInput = z.infer<typeof campaignStatusSchema>;

export const selectAdAccountSchema = z.object({ selectionId: z.string().min(1), adAccountId: z.string().min(1) });
export type SelectAdAccountInput = z.infer<typeof selectAdAccountSchema>;

export const citySearchQuerySchema = z.object({ q: z.string().trim().min(2).max(60) });

export interface AdAccountOptionDto {
  id: string;
  name: string;
  currency: string;
}

export interface GeoCityDto {
  key: string;
  name: string;
  region: string | null;
}

export interface AdTotals {
  spend: number;
  clicks: number;
  impressions: number;
  /** Takrorlanmas odamlar — Meta'dan davr bo'yicha olinadi; olib bo'lmasa null */
  reach: number | null;
  leads: number;
  /** clicks / impressions, foizda */
  ctr: number;
}

export interface AdCampaignDto extends AdTotals {
  id: string;
  name: string;
  status: CampaignStatus;
  objective: string;
  dailyBudget: number | null;
  startTime: string | null;
  stopTime: string | null;
}

export interface AdsOverviewDto {
  range: { from: string; to: string };
  currency: string;
  totals: AdTotals;
  previousTotals: AdTotals;
  campaigns: AdCampaignDto[];
  series: { date: string; spend: number; clicks: number }[];
}

// ─── Instagram DM ───────────────────────────────────────────────

export const sendMessageSchema = z.object({ text: z.string().min(1).max(1000) });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

// ─── AI ─────────────────────────────────────────────────────────

export const scriptRequestSchema = z.object({
  prompt: z.string().min(3).max(2000),
  postType: z.enum(POST_TYPES).default('REEL'),
  previous: z.string().max(10000).optional(), // "Qayta yoz" uchun oldingi variant
});
export type ScriptRequestInput = z.infer<typeof scriptRequestSchema>;

export const chatMessageSchema = z.object({
  threadId: z.string().optional(),
  message: z.string().min(1).max(4000),
});
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

// ─── Instagram API javoblari ────────────────────────────────────

export const IG_MEDIA_TYPES = ['IMAGE', 'VIDEO', 'CAROUSEL', 'REEL', 'STORY'] as const;
export type IgMediaType = (typeof IG_MEDIA_TYPES)[number];

export interface MetaConnectionDto {
  type: 'INSTAGRAM' | 'ADS';
  externalId: string;
  displayName: string;
  avatarUrl: string | null;
  lastSyncedAt: string | null;
  expiresAt: string | null;
  /** Faqat ADS */
  currency: string | null;
}

export interface IgOverviewDto {
  range: { from: string; to: string };
  totals: { reach: number; views: number; profileViews: number };
  previousTotals: { reach: number; views: number; profileViews: number };
  followers: { current: number; change: number };
  series: { date: string; reach: number; views: number; followers: number }[];
}

export interface IgMediaDto {
  id: string;
  type: IgMediaType;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  postedAt: string;
  reach: number;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface IgConversationDto {
  id: string;
  participantName: string;
  participantAvatar: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadCount: number;
  canReply: boolean;
  /** Suhbatdosh lid sifatida belgilangan (qo'lda yoki avtomatik) */
  isLead: boolean;
}

export interface IgMessageDto {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  text: string;
  sentAt: string;
}

export const selectInstagramAccountSchema = z.object({
  selectionId: z.string().min(1),
  igUserId: z.string().min(1),
});
export type SelectInstagramAccountInput = z.infer<typeof selectInstagramAccountSchema>;

export const mediaListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
