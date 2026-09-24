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

export const createPostSchema = z.object({
  type: z.enum(POST_TYPES),
  title: z.string().min(1).max(200),
  caption: z.string().max(2200).default(''),
  scheduledAt: z.iso.datetime({ offset: true }),
  mediaAssetId: z.string().optional(),
  autoPublish: z.boolean().default(true),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = createPostSchema.partial();
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const listPostsQuerySchema = z.object({ from: isoDate, to: isoDate });

export const uploadRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().regex(/^(image|video)\//, 'Faqat rasm yoki video'),
  size: z.number().int().positive().max(1024 * 1024 * 1024),
});
export type UploadRequestInput = z.infer<typeof uploadRequestSchema>;

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

export const createLeadSchema = z.object({
  source: z.enum(LEAD_SOURCES),
  count: z.number().int().positive().max(100000).default(1),
  date: isoDate,
  name: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const webhookLeadSchema = z.object({
  source: z.enum(['TELEGRAM', 'WEBHOOK']).default('WEBHOOK'),
  externalId: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  date: isoDate.optional(),
});
export type WebhookLeadInput = z.infer<typeof webhookLeadSchema>;

// ─── Facebook Ads ───────────────────────────────────────────────

export const createCampaignSchema = z
  .object({
    name: z.string().min(1).max(200),
    objective: z.enum(CAMPAIGN_OBJECTIVES),
    dailyBudget: z.number().int().positive(), // eng kichik valyuta birligida
    startDate: isoDate,
    endDate: isoDate,
    audience: z.object({
      ageMin: z.number().int().min(13).max(65).default(18),
      ageMax: z.number().int().min(13).max(65).default(45),
      genders: z.array(z.enum(['male', 'female'])).default([]),
      cities: z.array(z.string()).default([]),
    }),
  })
  .refine((c) => c.endDate >= c.startDate, { message: 'Muddat noto‘g‘ri', path: ['endDate'] });
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

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
