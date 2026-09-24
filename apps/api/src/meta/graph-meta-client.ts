import { createHmac } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { IgMediaType } from '@durbin/shared';
import { addDays, eachDay, toIsoDate } from '../common/dates.js';
import {
  MetaApiError,
  type IgAccountRef,
  type IgConversationItem,
  type IgDailyMetrics,
  type IgMediaItem,
  type IgMessageItem,
  type InstagramAccount,
  type MetaClient,
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
    // qaytadi — shuning uchun har bir kun alohida so'raladi (kichik parallellik bilan).
    const days = eachDay(from, to);
    return mapLimit(days, 4, async (day) => {
      const res = await this.get<GraphPage<{ name: string; total_value?: { value: number } }>>(
        `/${account.igUserId}/insights`,
        {
          access_token: account.accessToken,
          metric: 'reach,views,profile_views',
          metric_type: 'total_value',
          period: 'day',
          since: Math.floor(day.getTime() / 1000),
          until: Math.floor(addDays(day, 1).getTime() / 1000),
        },
      );
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
    const res = await this.get<
      GraphPage<{
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
      }>
    >(`/${account.igUserId}/media`, {
      access_token: account.accessToken,
      fields:
        'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count',
      limit,
    });

    return mapLimit(res.data, 4, async (m) => {
      const insights = await this.getMediaInsights(m.id, account.accessToken);
      return {
        externalId: m.id,
        type: mediaType(m.media_type, m.media_product_type),
        caption: m.caption ?? null,
        permalink: m.permalink ?? null,
        thumbnailUrl: m.thumbnail_url ?? m.media_url ?? null,
        postedAt: new Date(m.timestamp),
        likes: m.like_count ?? 0,
        comments: m.comments_count ?? 0,
        ...insights,
      };
    });
  }

  private async getMediaInsights(mediaId: string, token: string) {
    try {
      const res = await this.get<GraphPage<{ name: string; values?: { value: number }[] }>>(
        `/${mediaId}/insights`,
        { access_token: token, metric: 'reach,views,saved,shares' },
      );
      const value = (name: string) => res.data.find((m) => m.name === name)?.values?.[0]?.value ?? 0;
      return { reach: value('reach'), views: value('views'), saves: value('saved'), shares: value('shares') };
    } catch (err) {
      // Business akkauntga o'tishdan oldingi postlar uchun insights bo'lmaydi
      if (err instanceof MetaApiError && !err.isAuthError) {
        return { reach: 0, views: 0, saves: 0, shares: 0 };
      }
      throw err;
    }
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

function mediaType(mediaType: string, productType?: string): IgMediaType {
  if (productType === 'REELS') return 'REEL';
  if (productType === 'STORY') return 'STORY';
  if (mediaType === 'CAROUSEL_ALBUM') return 'CAROUSEL';
  if (mediaType === 'VIDEO') return 'VIDEO';
  return 'IMAGE';
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
