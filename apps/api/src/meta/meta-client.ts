import type { CampaignObjective, CampaignStatus, GeoLocationDto, IgMediaType, PostType } from '@durbin/shared';

// Meta Graph API ustidagi abstraksiya. Ikkita implementatsiya:
//  - GraphMetaClient  (META_MODE=live) — haqiqiy Graph API
//  - MockMetaClient   (META_MODE=mock) — Meta App Review o'tguncha soxta ma'lumot
// Graph API'ning metrika nomlari va javob shakllari faqat implementatsiyalar ichida qoladi.

export const META_CLIENT = Symbol('META_CLIENT');

export interface UserToken {
  accessToken: string;
  expiresAt: Date | null;
}

export interface InstagramAccount {
  igUserId: string;
  username: string;
  avatarUrl: string | null;
  pageId: string;
  pageName: string;
  /** Page token: long-lived user token'dan olingan bo'lsa muddatsiz */
  pageAccessToken: string;
}

/** Sync qilinadigan IG akkaunt: API chaqiruvlari uchun kerakli hamma narsa */
export interface IgAccountRef {
  igUserId: string;
  pageId: string;
  accessToken: string;
  /**
   * Instagram Login API tokeni (graph.instagram.com). Bo'lsa, Direct xabarlar shu orqali olinadi va yuboriladi —
   * Facebook Login yo'li Advanced Access'siz xabarlarni bermaydi, Instagram Login (Live app) esa beradi.
   */
  igLoginToken?: string;
}

export interface IgDailyMetrics {
  /** YYYY-MM-DD (UTC) */
  date: string;
  reach: number;
  views: number;
  profileViews: number;
}

export interface IgMediaItem {
  externalId: string;
  type: IgMediaType;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  postedAt: Date;
  reach: number;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
}

export interface IgConversationItem {
  externalId: string;
  participantId: string;
  participantName: string;
  updatedAt: Date;
}

export interface IgMessageItem {
  externalId: string;
  /** true — suhbatdoshdan kelgan, false — biz yuborganmiz */
  inbound: boolean;
  text: string;
  sentAt: Date;
}

// ─── Facebook Ads ─────────────────────────────────────────────────

export interface AdAccount {
  /** act_XXXX */
  id: string;
  name: string;
  currency: string;
}

/** Reklama akkaunti API chaqiruvlari uchun (long-lived user token) */
export interface AdsRef {
  adAccountId: string;
  accessToken: string;
  currency: string;
}

export interface AdCampaignItem {
  externalId: string;
  name: string;
  status: CampaignStatus;
  objective: string;
  /** Kampaniya byudjeti yoki ad set'lar yig'indisi, eng kichik birlikda */
  dailyBudget: number | null;
  startTime: Date | null;
  stopTime: Date | null;
}

export interface AdInsightRow {
  campaignExternalId: string;
  /** YYYY-MM-DD */
  date: string;
  /** Eng kichik valyuta birligida */
  spend: number;
  clicks: number;
  reach: number;
  impressions: number;
  leads: number;
}

export interface CreateCampaignParams {
  name: string;
  objective: CampaignObjective;
  dailyBudget: number;
  startTime: Date;
  endTime: Date;
  ageMin: number;
  ageMax: number;
  genders: ('male' | 'female')[];
  /** ISO davlat kodlari */
  countryCodes: string[];
  cityKeys: string[];
  /** OUTCOME_LEADS uchun — lid formasi shu sahifaniki bo'ladi */
  pageId: string | null;
}

export interface LeadAdItem {
  externalId: string;
  createdAt: Date;
  name: string | null;
  phone: string | null;
}

export interface PublishMediaInput {
  postType: PostType;
  /** Meta serverlari yuklab oladigan ochiq URL */
  mediaUrl: string;
  isVideo: boolean;
  /** Story uchun e'tiborsiz qoldiriladi */
  caption: string;
}

export interface PublishedMedia {
  externalId: string;
  permalink: string | null;
}

export interface MetaClient {
  readonly mode: 'mock' | 'live';

  /** Facebook Login dialog URL'i */
  buildLoginUrl(state: string): string;
  /** OAuth code → long-lived user token */
  exchangeCode(code: string): Promise<UserToken>;
  /** Foydalanuvchi boshqaradigan, IG Business akkaunt bog'langan sahifalar */
  listInstagramAccounts(userToken: string): Promise<InstagramAccount[]>;

  getFollowersCount(account: IgAccountRef): Promise<number>;
  /** Kunlik yangi followerlar (YYYY-MM-DD → son). Tarixiy follower sonini orqaga hisoblash uchun.
   *  Meta faqat oxirgi 30 kunni beradi; ma'lumot bo'lmasa bo'sh obyekt. */
  getDailyNewFollowers(account: IgAccountRef, from: Date, to: Date): Promise<Record<string, number>>;
  /** Har bir kun uchun alohida qiymat, [from, to] ikkala chegara kiradi */
  getDailyMetrics(account: IgAccountRef, from: Date, to: Date): Promise<IgDailyMetrics[]>;
  /**
   * Followerlar qaysi soatlarda onlayn: UTC soat (0–23) → o'rtacha onlayn followerlar soni, oxirgi kunlar bo'yicha.
   * Meta faqat 100+ followerli akkauntlarga beradi — ma'lumot bo'lmasa null.
   */
  getOnlineFollowers(account: IgAccountRef): Promise<Record<number, number> | null>;
  /** Oxirgi postlar, insights bilan */
  listMedia(account: IgAccountRef, limit: number): Promise<IgMediaItem[]>;

  listConversations(account: IgAccountRef, limit: number): Promise<IgConversationItem[]>;
  listMessages(account: IgAccountRef, conversationId: string, limit: number): Promise<IgMessageItem[]>;
  sendMessage(account: IgAccountRef, recipientId: string, text: string): Promise<{ externalId: string }>;

  /** Container yaratish → (video bo'lsa) tayyor bo'lishini kutish → chiqarish */
  publishMedia(account: IgAccountRef, input: PublishMediaInput): Promise<PublishedMedia>;

  // Facebook Ads
  listAdAccounts(userToken: string): Promise<AdAccount[]>;
  listCampaigns(ref: AdsRef): Promise<AdCampaignItem[]>;
  /** Kampaniyalar bo'yicha kunlik statistika, [from, to] */
  getCampaignDailyInsights(ref: AdsRef, from: Date, to: Date): Promise<AdInsightRow[]>;
  /** Davr bo'yicha takrorlanmas reach: akkaunt jami va kampaniyalar bo'yicha (kunlik yig'indi emas) */
  getReach(ref: AdsRef, from: Date, to: Date): Promise<{ total: number; byCampaign: Record<string, number> }>;
  setCampaignStatus(ref: AdsRef, campaignId: string, status: 'ACTIVE' | 'PAUSED'): Promise<void>;
  /** Kampaniya + ad set (reklamasiz), ikkalasi ham PAUSED */
  createCampaign(ref: AdsRef, params: CreateCampaignParams): Promise<{ campaignId: string }>;
  /** Davlatlar va shaharlar (butun dunyo) */
  searchLocations(ref: AdsRef, query: string): Promise<GeoLocationDto[]>;
  /** Sahifaning Lead Ads formalaridan `since`dan keyingi lidlar (sahifa tokeni bilan) */
  listLeadAds(page: IgAccountRef, since: Date): Promise<LeadAdItem[]>;
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number,
    public readonly subcode?: number,
  ) {
    super(message);
  }

  /** Token bekor qilingan / muddati o'tgan — qayta ulash kerak */
  get isAuthError(): boolean {
    return this.code === 190;
  }
}

/** Matnsiz Direct xabar (rasm, video, ulashilgan post, reaksiya) */
export const MEDIA_PLACEHOLDER = '📎 Media';
