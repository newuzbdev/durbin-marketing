import { createHmac } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { toMinor, type CampaignObjective, type CampaignStatus, type IgMediaType } from '@durbin/shared';
import { addDays, eachDay, toIsoDate } from '../common/dates.js';
import { mapLimit } from '../common/async.js';
import {
  MetaApiError,
  type AdAccount,
  type AdCampaignItem,
  type AdInsightRow,
  type AdsRef,
  type CreateCampaignParams,
  type IgAccountRef,
  type LeadAdItem,
  type IgConversationItem,
  type IgDailyMetrics,
  type IgMediaItem,
  type IgMessageItem,
  type InstagramAccount,
  type MetaClient,
  type PublishedMedia,
  type PublishMediaInput,
  type UserToken,
} from './meta-client.js';

// Facebook Login for Business orqali olinadigan ruxsatlar (IG + Page + Ads + Lead Ads)
export const META_SCOPES = [
  'instagram_basic',
  'instagram_manage_insights',
  'instagram_manage_messages',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  // Lead Ads: sahifaning lid formalarini o'qish uchun (leads_retrieval bilan birga)
  'pages_manage_ads',
  'business_management',
  'ads_read',
  'ads_management',
  'leads_retrieval',
];

type Params = Record<string, string | number | undefined>;

interface GraphPage<T> {
  data: T[];
}

export class GraphMetaClient implements MetaClient {
  readonly mode = 'live' as const;
  private readonly logger = new Logger(GraphMetaClient.name);
  private readonly version = process.env.META_GRAPH_VERSION || 'v24.0';
  private readonly appId = process.env.META_APP_ID ?? '';
  private readonly appSecret = process.env.META_APP_SECRET ?? '';
  private readonly redirectUri = process.env.META_REDIRECT_URI ?? '';

  constructor() {
    if (!this.appId || !this.appSecret || !this.redirectUri) {
      throw new Error('META_MODE=live uchun META_APP_ID, META_APP_SECRET, META_REDIRECT_URI kerak');
    }
  }

  buildLoginUrl(state: string): string {
    const url = new URL(`https://www.facebook.com/${this.version}/dialog/oauth`);
    url.searchParams.set('client_id', this.appId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    // Login for Business konfiguratsiyasi bo'lsa, ruxsatlar o'sha yerda belgilanadi
    const configId = process.env.META_LOGIN_CONFIG_ID;
    if (configId) url.searchParams.set('config_id', configId);
    else url.searchParams.set('scope', META_SCOPES.join(','));
    return url.toString();
  }

  async exchangeCode(code: string): Promise<UserToken> {
    const short = await this.get<{ access_token: string }>('/oauth/access_token', {
      client_id: this.appId,
      client_secret: this.appSecret,
      redirect_uri: this.redirectUri,
      code,
    });
    const long = await this.get<{ access_token: string; expires_in?: number }>('/oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: this.appId,
      client_secret: this.appSecret,
      fb_exchange_token: short.access_token,
    });
    return {
      accessToken: long.access_token,
      expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
    };
  }

  async listInstagramAccounts(userToken: string): Promise<InstagramAccount[]> {
    const res = await this.get<
      GraphPage<{
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
      }>
    >('/me/accounts', {
      access_token: userToken,
      fields: 'id,name,access_token,instagram_business_account{id,username,profile_picture_url}',
      limit: 100,
    });
    return res.data
      .filter((p) => p.instagram_business_account)
      .map((p) => ({
        igUserId: p.instagram_business_account!.id,
        username: p.instagram_business_account!.username ?? p.name,
        avatarUrl: p.instagram_business_account!.profile_picture_url ?? null,
        pageId: p.id,
        pageName: p.name,
        pageAccessToken: p.access_token,
      }));
  }

  async getFollowersCount(account: IgAccountRef): Promise<number> {
    const res = await this.get<{ followers_count?: number }>(`/${account.igUserId}`, {
      access_token: account.accessToken,
      fields: 'followers_count',
    });
    return res.followers_count ?? 0;
  }

  async getDailyNewFollowers(account: IgAccountRef, from: Date, to: Date): Promise<Record<string, number>> {
    try {
      const res = await this.get<GraphPage<{ name: string; values?: { value: number; end_time: string }[] }>>(
        `/${account.igUserId}/insights`,
        {
          access_token: account.accessToken,
          metric: 'follower_count',
          period: 'day',
          since: Math.floor(from.getTime() / 1000),
          until: Math.floor(addDays(to, 1).getTime() / 1000),
        },
      );
      const out: Record<string, number> = {};
      for (const v of res.data[0]?.values ?? []) {
        // end_time — kun tugagan payt; qiymat undan oldingi kunga tegishli
        out[toIsoDate(addDays(new Date(v.end_time), -1))] = v.value;
      }
      return out;
    } catch (err) {
      // 100 dan kam followerli akkauntlar uchun bu metrika mavjud emas
      if (err instanceof MetaApiError && !err.isAuthError) return {};
      throw err;
    }
  }

  async getDailyMetrics(account: IgAccountRef, from: Date, to: Date): Promise<IgDailyMetrics[]> {
    // Hozirgi Graph API'da reach/views/profile_views kunlik time-series emas, `total_value` sifatida
    // qaytadi — har bir kun alohida so'rov, lekin hammasi Batch API orqali bitta HTTP chaqiruvda.
    const days = eachDay(from, to);
    const results = await this.batchGet<GraphPage<{ name: string; total_value?: { value: number } }>>(
      account.accessToken,
      days.map((day) => ({
        path: `/${account.igUserId}/insights`,
        params: {
          metric: 'reach,views,profile_views',
          metric_type: 'total_value',
          period: 'day',
          since: Math.floor(day.getTime() / 1000),
          until: Math.floor(addDays(day, 1).getTime() / 1000),
        },
      })),
    );
    return days.map((day, i) => {
      const res = results[i];
      if (res instanceof MetaApiError) throw res;
      const value = (name: string) => res.data.find((m) => m.name === name)?.total_value?.value ?? 0;
      return {
        date: toIsoDate(day),
        reach: value('reach'),
        views: value('views'),
        profileViews: value('profile_views'),
      };
    });
  }

  async listMedia(account: IgAccountRef, limit: number): Promise<IgMediaItem[]> {
    type Insights = GraphPage<{ name: string; values?: { value: number }[] }>;
    type Media = {
      id: string;
      caption?: string;
      media_type: string;
      media_product_type?: string;
      permalink?: string;
      thumbnail_url?: string;
      media_url?: string;
      timestamp: string;
      like_count?: number;
      comments_count?: number;
      insights?: Insights;
    };
    const fields =
      'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count';
    const query = (withInsights: boolean) =>
      this.get<GraphPage<Media>>(`/${account.igUserId}/media`, {
        access_token: account.accessToken,
        fields: withInsights ? `${fields},insights.metric(reach,views,saved,shares)` : fields,
        limit,
      });

    // Tez yo'l: statistika ro'yxat bilan birga (field expansion) — bitta so'rov, ~1.5 s.
    // Business'ga o'tishdan oldingi post insights bermasa, Meta butun so'rovni rad etadi —
    // shunda har bir post alohida (Batch API) so'raladi va xato bergani nol bo'ladi.
    let res: GraphPage<Media>;
    let perMedia: (Insights | MetaApiError)[] | null = null;
    try {
      res = await query(true);
    } catch (err) {
      if (err instanceof MetaApiError && err.isAuthError) throw err;
      res = await query(false);
      perMedia = await this.batchGet<Insights>(
        account.accessToken,
        res.data.map((m) => ({ path: `/${m.id}/insights`, params: { metric: 'reach,views,saved,shares' } })),
      );
    }

    return res.data.map((m, i) => {
      const r = perMedia ? perMedia[i] : (m.insights ?? { data: [] });
      if (r instanceof MetaApiError && r.isAuthError) throw r;
      const value = (name: string) =>
        r instanceof MetaApiError ? 0 : (r.data.find((x) => x.name === name)?.values?.[0]?.value ?? 0);
      return {
        externalId: m.id,
        type: mediaType(m.media_type, m.media_product_type),
        caption: m.caption ?? null,
        permalink: m.permalink ?? null,
        thumbnailUrl: m.thumbnail_url ?? m.media_url ?? null,
        postedAt: new Date(m.timestamp),
        likes: m.like_count ?? 0,
        comments: m.comments_count ?? 0,
        reach: value('reach'),
        views: value('views'),
        saves: value('saved'),
        shares: value('shares'),
      };
    });
  }

  async listConversations(account: IgAccountRef, limit: number): Promise<IgConversationItem[]> {
    const res = await this.get<
      GraphPage<{ id: string; updated_time: string; participants?: { data: { id: string; username?: string }[] } }>
    >(`/${account.pageId}/conversations`, {
      access_token: account.accessToken,
      platform: 'instagram',
      fields: 'id,updated_time,participants',
      limit,
    });
    return res.data.flatMap((c) => {
      const other = c.participants?.data.find((p) => p.id !== account.igUserId);
      if (!other) return [];
      return [
        {
          externalId: c.id,
          participantId: other.id,
          participantName: other.username ?? other.id,
          updatedAt: new Date(c.updated_time),
        },
      ];
    });
  }

  async listMessages(account: IgAccountRef, conversationId: string, limit: number): Promise<IgMessageItem[]> {
    const res = await this.get<
      GraphPage<{ id: string; message?: string; from?: { id: string }; created_time: string }>
    >(`/${conversationId}/messages`, {
      access_token: account.accessToken,
      fields: 'id,message,from,created_time',
      limit,
    });
    return res.data.map((m) => ({
      externalId: m.id,
      inbound: m.from?.id !== account.igUserId,
      text: m.message ?? '',
      sentAt: new Date(m.created_time),
    }));
  }

  async sendMessage(account: IgAccountRef, recipientId: string, text: string): Promise<{ externalId: string }> {
    const res = await this.request<{ message_id: string }>('POST', `/${account.pageId}/messages`, {
      access_token: account.accessToken,
    }, { recipient: { id: recipientId }, message: { text } });
    return { externalId: res.message_id };
  }

  async publishMedia(account: IgAccountRef, input: PublishMediaInput): Promise<PublishedMedia> {
    const auth = { access_token: account.accessToken };
    const container = await this.request<{ id: string }>('POST', `/${account.igUserId}/media`, auth, containerBody(input));

    // Video'ni Meta serverda qayta ishlaydi; rasm odatda darhol FINISHED bo'ladi
    for (let attempt = 0; ; attempt++) {
      const { status_code, status } = await this.get<{ status_code?: string; status?: string }>(`/${container.id}`, {
        ...auth,
        fields: 'status_code,status',
      });
      if (status_code === 'FINISHED' || status_code === undefined) break;
      if (status_code === 'ERROR' || status_code === 'EXPIRED') {
        throw new MetaApiError(`Media qayta ishlanmadi: ${status ?? status_code}`, 400);
      }
      if (attempt >= CONTAINER_POLL_ATTEMPTS) {
        throw new MetaApiError('Media juda uzoq qayta ishlanmoqda (5 daqiqadan oshdi)', 504);
      }
      await sleep(CONTAINER_POLL_MS);
    }

    const published = await this.request<{ id: string }>('POST', `/${account.igUserId}/media_publish`, auth, {
      creation_id: container.id,
    });
    const permalink = await this.get<{ permalink?: string }>(`/${published.id}`, { ...auth, fields: 'permalink' })
      .then((r) => r.permalink ?? null)
      .catch(() => null); // Post chiqdi — havola olinmasa ham muvaffaqiyat
    return { externalId: published.id, permalink };
  }

  // ─── Facebook Ads ───────────────────────────────────────────────

  async listAdAccounts(userToken: string): Promise<AdAccount[]> {
    const rows = await this.getAll<{ id: string; name: string; currency: string; account_status: number }>(
      '/me/adaccounts',
      { access_token: userToken, fields: 'id,name,currency,account_status', limit: 100 },
    );
    // 1 — faol; 2 — o'chirilgan, 101 — yopilgan va h.k. ko'rsatilmaydi
    return rows.filter((a) => a.account_status === 1).map(({ id, name, currency }) => ({ id, name, currency }));
  }

  async listCampaigns(ref: AdsRef): Promise<AdCampaignItem[]> {
    const rows = await this.getAll<{
      id: string;
      name: string;
      status: string;
      objective: string;
      daily_budget?: string;
      start_time?: string;
      stop_time?: string;
      adsets?: { data: { daily_budget?: string }[] };
    }>(`/${ref.adAccountId}/campaigns`, {
      access_token: ref.accessToken,
      fields: 'id,name,status,objective,daily_budget,start_time,stop_time,adsets.limit(50){daily_budget}',
      limit: 100,
    });
    return rows.map((c) => {
      // Kampaniya darajasida byudjet bo'lmasa (ABO) — ad set'lar yig'indisi
      const adsetBudget = (c.adsets?.data ?? []).reduce((sum, a) => sum + Number(a.daily_budget ?? 0), 0);
      const budget = c.daily_budget ? Number(c.daily_budget) : adsetBudget || null;
      return {
        externalId: c.id,
        name: c.name,
        status: campaignStatus(c.status),
        objective: c.objective,
        dailyBudget: budget,
        startTime: c.start_time ? new Date(c.start_time) : null,
        stopTime: c.stop_time ? new Date(c.stop_time) : null,
      };
    });
  }

  async getCampaignDailyInsights(ref: AdsRef, from: Date, to: Date): Promise<AdInsightRow[]> {
    const rows = await this.getAll<{
      campaign_id: string;
      date_start: string;
      spend?: string;
      clicks?: string;
      reach?: string;
      impressions?: string;
      actions?: { action_type: string; value: string }[];
    }>(`/${ref.adAccountId}/insights`, {
      access_token: ref.accessToken,
      level: 'campaign',
      time_increment: 1,
      time_range: JSON.stringify({ since: toIsoDate(from), until: toIsoDate(to) }),
      fields: 'campaign_id,spend,clicks,reach,impressions,actions',
      limit: 500,
    });
    return rows.map((r) => ({
      campaignExternalId: r.campaign_id,
      date: r.date_start,
      spend: toMinor(Number(r.spend ?? 0), ref.currency),
      clicks: Number(r.clicks ?? 0),
      reach: Number(r.reach ?? 0),
      impressions: Number(r.impressions ?? 0),
      leads: leadCount(r.actions),
    }));
  }

  async getReach(ref: AdsRef, from: Date, to: Date) {
    const params = {
      access_token: ref.accessToken,
      time_range: JSON.stringify({ since: toIsoDate(from), until: toIsoDate(to) }),
      fields: 'campaign_id,reach',
      limit: 500,
    };
    const [account, campaigns] = await Promise.all([
      this.get<GraphPage<{ reach?: string }>>(`/${ref.adAccountId}/insights`, { ...params, level: 'account', fields: 'reach' }),
      this.getAll<{ campaign_id: string; reach?: string }>(`/${ref.adAccountId}/insights`, { ...params, level: 'campaign' }),
    ]);
    return {
      total: Number(account.data[0]?.reach ?? 0),
      byCampaign: Object.fromEntries(campaigns.map((c) => [c.campaign_id, Number(c.reach ?? 0)])),
    };
  }

  async setCampaignStatus(ref: AdsRef, campaignId: string, status: 'ACTIVE' | 'PAUSED') {
    await this.request('POST', `/${campaignId}`, { access_token: ref.accessToken }, { status });
  }

  async createCampaign(ref: AdsRef, p: CreateCampaignParams): Promise<{ campaignId: string }> {
    const auth = { access_token: ref.accessToken };
    const campaign = await this.request<{ id: string }>('POST', `/${ref.adAccountId}/campaigns`, auth, {
      name: p.name,
      objective: p.objective,
      status: 'PAUSED',
      special_ad_categories: [],
      // Byudjet ad set darajasida (ABO) — yangi API versiyalarida aniq ko'rsatish shart
      is_adset_budget_sharing_enabled: false,
    });
    try {
      await this.request('POST', `/${ref.adAccountId}/adsets`, auth, adSetBody(campaign.id, p));
    } catch (err) {
      // Yarim yaratilgan kampaniya qolmasin
      await this.request('POST', `/${campaign.id}`, auth, { status: 'DELETED' }).catch(() => undefined);
      throw err;
    }
    return { campaignId: campaign.id };
  }

  async searchCities(ref: AdsRef, query: string) {
    const res = await this.get<GraphPage<{ key: string; name: string; region?: string }>>('/search', {
      access_token: ref.accessToken,
      type: 'adgeolocation',
      location_types: JSON.stringify(['city']),
      country_code: 'UZ',
      q: query,
      limit: 10,
    });
    return res.data.map((c) => ({ key: c.key, name: c.name, region: c.region ?? null }));
  }

  async listLeadAds(page: IgAccountRef, since: Date): Promise<LeadAdItem[]> {
    const forms = await this.getAll<{ id: string }>(`/${page.pageId}/leadgen_forms`, {
      access_token: page.accessToken,
      fields: 'id',
      limit: 100,
    });
    const filtering = JSON.stringify([
      { field: 'time_created', operator: 'GREATER_THAN', value: Math.floor(since.getTime() / 1000) },
    ]);
    const perForm = await mapLimit(forms, 3, (f) =>
      this.getAll<{ id: string; created_time: string; field_data?: { name: string; values: string[] }[] }>(
        `/${f.id}/leads`,
        { access_token: page.accessToken, fields: 'id,created_time,field_data', filtering, limit: 200 },
      ),
    );
    return perForm.flat().map((l) => {
      const field = (...names: string[]) =>
        l.field_data?.find((f) => names.includes(f.name.toLowerCase()))?.values?.[0]?.trim() || null;
      const first = field('first_name');
      const last = field('last_name');
      return {
        externalId: l.id,
        createdAt: new Date(l.created_time),
        name: field('full_name', 'name') ?? ([first, last].filter(Boolean).join(' ') || null),
        phone: field('phone_number', 'phone'),
      };
    });
  }

  /** `paging.cursors.after` bo'yicha barcha sahifalar (himoya uchun ko'pi bilan 20 sahifa) */
  private async getAll<T>(path: string, params: Params, maxPages = 20): Promise<T[]> {
    const out: T[] = [];
    let after: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const res = await this.get<GraphPage<T> & { paging?: { cursors?: { after?: string }; next?: string } }>(path, {
        ...params,
        after,
      });
      out.push(...res.data);
      after = res.paging?.next ? res.paging.cursors?.after : undefined;
      if (!after) break;
    }
    return out;
  }

  /**
   * Graph Batch API: ko'pi bilan 50 ta GET bitta HTTP so'rovda. Har bir element — natija yoki MetaApiError
   * (bitta so'rov xatosi boshqalariga ta'sir qilmaydi). Hammasi bitta token bilan.
   */
  private async batchGet<T>(token: string, items: { path: string; params: Params }[]): Promise<(T | MetaApiError)[]> {
    const chunks: { path: string; params: Params }[][] = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) chunks.push(items.slice(i, i + BATCH_SIZE));
    const results = await mapLimit(chunks, 3, async (chunk) => {
      const batch = chunk.map(({ path, params }) => {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
        return { method: 'GET', relative_url: `${path.replace(/^\//, '')}?${qs}` };
      });
      const res = await this.request<({ code: number; body: string } | null)[]>(
        'POST',
        '/',
        { access_token: token, include_headers: 'false' },
        { batch },
      );
      return res.map((r): T | MetaApiError => {
        const body = (r ? JSON.parse(r.body) : {}) as T & { error?: { message: string; code?: number; error_subcode?: number } };
        if (!r || r.code >= 400 || body.error) {
          const e = body.error;
          return new MetaApiError(e?.message ?? 'Batch so‘rov javob bermadi', r?.code ?? 504, e?.code, e?.error_subcode);
        }
        return body;
      });
    });
    return results.flat();
  }

  private get<T>(path: string, params: Params): Promise<T> {
    return this.request<T>('GET', path, params);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, params: Params, body?: unknown): Promise<T> {
    const url = new URL(`https://graph.facebook.com/${this.version}${path}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    const token = params.access_token;
    if (typeof token === 'string') {
      url.searchParams.set('appsecret_proof', createHmac('sha256', this.appSecret).update(token).digest('hex'));
    }

    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message: string; code?: number; error_subcode?: number };
    };
    if (!res.ok || data.error) {
      const e = data.error;
      this.logger.warn(`Graph ${method} ${path} → ${res.status}: ${e?.message ?? 'unknown'}`);
      throw new MetaApiError(e?.message ?? `Graph API ${res.status}`, res.status, e?.code, e?.error_subcode);
    }
    return data as T;
  }
}

/** Meta Batch API chegarasi */
const BATCH_SIZE = 50;
const CONTAINER_POLL_MS = 5_000;
const CONTAINER_POLL_ATTEMPTS = 60;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Content Publishing API: feed'dagi video endi faqat REELS sifatida chiqariladi */
export function containerBody(input: PublishMediaInput): Record<string, string | boolean> {
  const media: Record<string, string> = { [input.isVideo ? 'video_url' : 'image_url']: input.mediaUrl };
  if (input.postType === 'STORY') {
    return { media_type: 'STORIES', ...media };
  }
  if (input.isVideo) {
    return { media_type: 'REELS', ...media, caption: input.caption, share_to_feed: true };
  }
  return { ...media, caption: input.caption };
}

const OPTIMIZATION: Record<CampaignObjective, Record<string, unknown>> = {
  OUTCOME_LEADS: { optimization_goal: 'LEAD_GENERATION', destination_type: 'ON_AD' },
  OUTCOME_TRAFFIC: { optimization_goal: 'LINK_CLICKS' },
  OUTCOME_AWARENESS: { optimization_goal: 'REACH' },
  OUTCOME_ENGAGEMENT: { optimization_goal: 'POST_ENGAGEMENT', destination_type: 'ON_POST' },
};

/** Ad set: byudjet, muddat va auditoriya. Auditoriya aniq berilgani uchun Advantage+ audience o'chiriladi. */
export function adSetBody(campaignId: string, p: CreateCampaignParams): Record<string, unknown> {
  return {
    name: p.name,
    campaign_id: campaignId,
    daily_budget: p.dailyBudget,
    billing_event: 'IMPRESSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    start_time: p.startTime.toISOString(),
    end_time: p.endTime.toISOString(),
    status: 'PAUSED',
    targeting: {
      geo_locations: p.cityKeys.length ? { cities: p.cityKeys.map((key) => ({ key })) } : { countries: ['UZ'] },
      age_min: p.ageMin,
      age_max: p.ageMax,
      // Ikkala jins yoki bo'sh — hammasi (Meta'da genders berilmaydi)
      ...(p.genders.length === 1 ? { genders: [p.genders[0] === 'male' ? 1 : 2] } : {}),
      targeting_automation: { advantage_audience: 0 },
    },
    ...OPTIMIZATION[p.objective],
    ...(p.objective === 'OUTCOME_LEADS' && p.pageId ? { promoted_object: { page_id: p.pageId } } : {}),
  };
}

function campaignStatus(status: string): CampaignStatus {
  return status === 'ACTIVE' || status === 'PAUSED' || status === 'ARCHIVED' ? status : 'DELETED';
}

/** Lead Ads formalari va boshqa lid konversiyalari */
function leadCount(actions?: { action_type: string; value: string }[]): number {
  const find = (type: string) => actions?.find((a) => a.action_type === type)?.value;
  return Number(find('lead') ?? find('onsite_conversion.lead_grouped') ?? 0);
}

function mediaType(mediaType: string, productType?: string): IgMediaType {
  if (productType === 'REELS') return 'REEL';
  if (productType === 'STORY') return 'STORY';
  if (mediaType === 'CAROUSEL_ALBUM') return 'CAROUSEL';
  if (mediaType === 'VIDEO') return 'VIDEO';
  return 'IMAGE';
}
