import { randomUUID } from 'node:crypto';
import type { CampaignStatus, GeoLocationDto, IgMediaType } from '@durbin/shared';
import { addDays, eachDay, startOfUtcDay, toIsoDate } from '../common/dates.js';
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

// META_MODE=mock: Meta App Review o'tguncha butun oqimni (OAuth → sync → UI) sinash uchun.
// Ma'lumotlar deterministik — bir xil kun uchun har doim bir xil qiymat, shuning uchun
// qayta sync qilish natijani o'zgartirmaydi.

const MOCK_ACCOUNT: InstagramAccount = {
  igUserId: 'mock-ig-1',
  username: 'demo_maktab',
  avatarUrl: null,
  pageId: 'mock-page-1',
  pageName: 'Demo maktab',
  pageAccessToken: 'mock-page-token',
};

const CAPTIONS = [
  "Yangi o'quv yiliga qabul boshlandi! Batafsil — profil havolasida",
  "O'quvchilarimizning olimpiada natijalari",
  'Ingliz tili klubidan lavhalar',
  "Ochiq eshiklar kuni — shanba, 10:00",
  "Robototexnika to'garagi",
  "Ota-onalar fikri: nega aynan bizning maktab?",
  'Matematika darsi: qiziqarli masala',
  'Sport musobaqasi g‘oliblari',
];

const PEOPLE = ['aziza.karimova', 'jasur_77', 'dilnoza.mom', 'sardor.t', 'malika_uz'];
const INBOUND = [
  'Assalomu alaykum, 5-sinfga qabul qachon?',
  "Narxlari qancha bo'ladi?",
  'Transport xizmati bormi?',
  "Ingliz tili kurslari haftada necha marta?",
  'Rahmat, tushunarli!',
];

const MOCK_AD_ACCOUNT: AdAccount = { id: 'act_mock1', name: 'Demo maktab — reklama', currency: 'UZS' };

// Byudjet — tiyinda (UZS offset 100): 150 000 so'm/kun = 15 000 000
const MOCK_CAMPAIGNS: Omit<AdCampaignItem, 'startTime' | 'stopTime'>[] = [
  { externalId: 'mock-campaign-1', name: 'Qabul 2026 — lid formasi', status: 'ACTIVE', objective: 'OUTCOME_LEADS', dailyBudget: 15_000_000 },
  { externalId: 'mock-campaign-2', name: 'Ochiq eshiklar kuni', status: 'ACTIVE', objective: 'OUTCOME_TRAFFIC', dailyBudget: 8_000_000 },
  { externalId: 'mock-campaign-3', name: 'Brend — xabardorlik', status: 'PAUSED', objective: 'OUTCOME_AWARENESS', dailyBudget: 5_000_000 },
];

const MOCK_LOCATIONS: GeoLocationDto[] = [
  ...[
    ['UZ', 'Uzbekistan'],
    ['KZ', 'Kazakhstan'],
    ['KG', 'Kyrgyzstan'],
    ['TJ', 'Tajikistan'],
    ['US', 'United States'],
    ['AE', 'United Arab Emirates'],
  ].map(([code, name]) => ({ type: 'country' as const, key: code, name, region: null, countryCode: code })),
  ...['Toshkent', 'Samarqand', 'Buxoro', 'Andijon', 'Namangan', "Farg'ona", 'Nukus', 'Qarshi', 'Termiz', 'Jizzax', 'Navoiy', 'Urganch', 'Guliston'].map(
    (name, i) => ({ type: 'city' as const, key: `mock-city-${i + 1}`, name, region: null, countryCode: 'UZ' }),
  ),
];

const LEAD_NAMES = ['Dilnoza Rahimova', 'Sardor Aliyev', 'Malika Yusupova', 'Jasur Karimov', 'Nodira Tosheva'];

export class MockMetaClient implements MetaClient {
  readonly mode = 'mock' as const;

  buildLoginUrl(state: string): string {
    // Facebook dialog o'rniga to'g'ridan-to'g'ri o'zimizning callback'ga qaytamiz
    const port = process.env.PORT ?? '4000';
    const url = new URL(process.env.META_REDIRECT_URI || `http://localhost:${port}/api/meta/oauth/callback`);
    url.searchParams.set('code', 'mock-code');
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(): Promise<UserToken> {
    return { accessToken: 'mock-user-token', expiresAt: addDays(new Date(), 60) };
  }

  async listInstagramAccounts(): Promise<InstagramAccount[]> {
    return [MOCK_ACCOUNT];
  }

  async getFollowersCount(account: IgAccountRef): Promise<number> {
    return followersOn(account.igUserId, startOfUtcDay(new Date()));
  }

  async getDailyNewFollowers(account: IgAccountRef, from: Date, to: Date): Promise<Record<string, number>> {
    return Object.fromEntries(
      eachDay(from, to).map((d) => [toIsoDate(d), followersOn(account.igUserId, d) - followersOn(account.igUserId, addDays(d, -1))]),
    );
  }

  async getDailyMetrics(account: IgAccountRef, from: Date, to: Date): Promise<IgDailyMetrics[]> {
    return eachDay(from, to).map((day) => {
      const r = rng(`${account.igUserId}:${toIsoDate(day)}`);
      const weekend = [0, 6].includes(day.getUTCDay()) ? 0.7 : 1;
      const reach = Math.round((800 + r() * 900) * weekend);
      return {
        date: toIsoDate(day),
        reach,
        views: Math.round(reach * (1.8 + r())),
        profileViews: Math.round(reach * (0.04 + r() * 0.04)),
      };
    });
  }

  async listMedia(account: IgAccountRef, limit: number): Promise<IgMediaItem[]> {
    const today = startOfUtcDay(new Date());
    const types: IgMediaType[] = ['REEL', 'IMAGE', 'CAROUSEL', 'REEL', 'VIDEO', 'IMAGE'];
    return Array.from({ length: Math.min(limit, 30) }, (_, i) => {
      const postedAt = new Date(addDays(today, -i * 2).getTime() + 14 * 3_600_000); // 19:00 Toshkent
      const r = rng(`${account.igUserId}:media:${toIsoDate(postedAt)}`);
      const type = types[i % types.length];
      const reach = Math.round((type === 'REEL' ? 2500 : 900) * (0.5 + r()));
      return {
        externalId: `mock-media-${toIsoDate(postedAt)}`,
        type,
        caption: CAPTIONS[i % CAPTIONS.length],
        permalink: null,
        thumbnailUrl: null,
        postedAt,
        reach,
        views: Math.round(reach * (1.5 + r())),
        likes: Math.round(reach * (0.05 + r() * 0.05)),
        comments: Math.round(reach * r() * 0.01),
        saves: Math.round(reach * r() * 0.02),
        shares: Math.round(reach * r() * 0.01),
      };
    });
  }

  async listConversations(account: IgAccountRef): Promise<IgConversationItem[]> {
    const now = Date.now();
    // Birinchi ikkitasi 24 soat ichida (javob berish mumkin), qolganlari eskiroq
    const agoHours = [0.5, 3, 30, 50, 120];
    return PEOPLE.map((name, i) => ({
      externalId: `mock-conv-${i}`,
      participantId: `mock-igsid-${i}`,
      participantName: name,
      updatedAt: new Date(Math.floor((now - agoHours[i] * 3_600_000) / 60_000) * 60_000),
    })).filter(() => account.igUserId === MOCK_ACCOUNT.igUserId);
  }

  async listMessages(account: IgAccountRef, conversationId: string): Promise<IgMessageItem[]> {
    const conv = (await this.listConversations(account)).find((c) => c.externalId === conversationId);
    if (!conv) return [];
    const i = Number(conversationId.split('-').pop());
    const last = conv.updatedAt.getTime();
    const msgs: IgMessageItem[] = [
      { externalId: `${conversationId}-m1`, inbound: true, text: INBOUND[i], sentAt: new Date(last - 20 * 60_000) },
    ];
    if (i % 2 === 1) {
      msgs.push({
        externalId: `${conversationId}-m2`,
        inbound: false,
        text: "Assalomu alaykum! Ma'lumot uchun +998 90 000 00 00 raqamiga qo'ng'iroq qiling.",
        sentAt: new Date(last - 10 * 60_000),
      });
    }
    msgs.push({ externalId: `${conversationId}-m3`, inbound: true, text: 'Yana bir savol bor edi', sentAt: new Date(last) });
    return msgs;
  }

  async sendMessage(): Promise<{ externalId: string }> {
    return { externalId: `mock-mid-${randomUUID()}` };
  }

  // ─── Facebook Ads ───────────────────────────────────────────────
  // Durbin'da yaratilgan kampaniyalar va holat o'zgarishlari jarayon xotirasida saqlanadi

  private readonly createdCampaigns = new Map<string, AdCampaignItem[]>();
  private readonly statusOverrides = new Map<string, CampaignStatus>();

  async listAdAccounts(): Promise<AdAccount[]> {
    return [MOCK_AD_ACCOUNT];
  }

  async listCampaigns(ref: AdsRef): Promise<AdCampaignItem[]> {
    const base = MOCK_CAMPAIGNS.map((c) => ({ ...c, startTime: addDays(startOfUtcDay(new Date()), -60), stopTime: null }));
    return [...base, ...(this.createdCampaigns.get(ref.adAccountId) ?? [])].map((c) => ({
      ...c,
      status: this.statusOverrides.get(c.externalId) ?? c.status,
    }));
  }

  async getCampaignDailyInsights(ref: AdsRef, from: Date, to: Date): Promise<AdInsightRow[]> {
    const campaigns = await this.listCampaigns(ref);
    return campaigns
      .filter((c) => MOCK_CAMPAIGNS.some((m) => m.externalId === c.externalId))
      .flatMap((c) =>
        eachDay(from, to).map((day) => {
          const r = rng(`${c.externalId}:${toIsoDate(day)}`);
          // To'xtatilgan kampaniya oxirgi 5 kunda sarflamaydi
          const idle = c.status !== 'ACTIVE' && day > addDays(startOfUtcDay(new Date()), -5);
          const impressions = idle ? 0 : Math.round(2500 + r() * 3500);
          const clicks = Math.round(impressions * (0.008 + r() * 0.014));
          return {
            campaignExternalId: c.externalId,
            date: toIsoDate(day),
            spend: idle ? 0 : Math.round((c.dailyBudget ?? 0) * (0.7 + r() * 0.3)),
            clicks,
            reach: Math.round(impressions * 0.62),
            impressions,
            leads: c.objective === 'OUTCOME_LEADS' ? Math.round(clicks * (0.05 + r() * 0.1)) : 0,
          };
        }),
      );
  }

  async getReach(ref: AdsRef, from: Date, to: Date) {
    const rows = await this.getCampaignDailyInsights(ref, from, to);
    const byCampaign: Record<string, number> = {};
    // Takrorlanmas reach kunlik yig'indidan kam — mock'da 55%
    for (const r of rows) byCampaign[r.campaignExternalId] = (byCampaign[r.campaignExternalId] ?? 0) + r.reach;
    for (const k of Object.keys(byCampaign)) byCampaign[k] = Math.round(byCampaign[k] * 0.55);
    const total = Math.round(Object.values(byCampaign).reduce((a, b) => a + b, 0) * 0.85);
    return { total, byCampaign };
  }

  async setCampaignStatus(_ref: AdsRef, campaignId: string, status: 'ACTIVE' | 'PAUSED') {
    this.statusOverrides.set(campaignId, status);
  }

  async createCampaign(ref: AdsRef, p: CreateCampaignParams): Promise<{ campaignId: string }> {
    const campaignId = `mock-campaign-${randomUUID().slice(0, 8)}`;
    const list = this.createdCampaigns.get(ref.adAccountId) ?? [];
    list.push({
      externalId: campaignId,
      name: p.name,
      status: 'PAUSED',
      objective: p.objective,
      dailyBudget: p.dailyBudget,
      startTime: p.startTime,
      stopTime: p.endTime,
    });
    this.createdCampaigns.set(ref.adAccountId, list);
    return { campaignId };
  }

  async searchLocations(_ref: AdsRef, query: string): Promise<GeoLocationDto[]> {
    const q = query.toLowerCase();
    return MOCK_LOCATIONS.filter((c) => c.name.toLowerCase().includes(q) || c.key.toLowerCase() === q).slice(0, 10);
  }

  async listLeadAds(page: IgAccountRef, since: Date): Promise<LeadAdItem[]> {
    // Kuniga 0–3 ta lid, oxirgi 30 kun ichida; bir xil kun — bir xil lidlar
    const today = startOfUtcDay(new Date());
    return eachDay(addDays(today, -29), today).flatMap((day) => {
      const r = rng(`${page.pageId}:leadads:${toIsoDate(day)}`);
      const n = Math.floor(r() * 4);
      return Array.from({ length: n }, (_, i) => {
        const createdAt = new Date(day.getTime() + (9 + i * 3) * 3_600_000);
        return {
          externalId: `mock-leadad-${toIsoDate(day)}-${i}`,
          createdAt,
          name: LEAD_NAMES[(day.getUTCDate() + i) % LEAD_NAMES.length],
          phone: `+99890${String(Math.floor(r() * 10_000_000)).padStart(7, '0')}`,
        };
      });
    }).filter((l) => l.createdAt > since && l.createdAt <= new Date());
  }

  async publishMedia(_account: IgAccountRef, input: PublishMediaInput): Promise<PublishedMedia> {
    // Xatolik oqimini sinash uchun: fayl nomida "mock-fail" bo'lsa, Meta xatosini taqlid qiladi
    if (input.mediaUrl.includes('mock-fail')) {
      throw new MetaApiError('Media URL yuklab olinmadi (mock)', 400, 9004);
    }
    const id = randomUUID();
    return { externalId: `mock-post-${id}`, permalink: `https://www.instagram.com/p/mock-${id.slice(0, 8)}/` };
  }
}

/** Follower soni: kunlik 2–8 ta o'sish bilan deterministik */
function followersOn(seed: string, day: Date): number {
  const dayIndex = Math.floor(day.getTime() / 86_400_000);
  const r = rng(`${seed}:followers:${dayIndex}`);
  return 1200 + (dayIndex % 1000) * 5 + Math.floor(r() * 4);
}

/** Satrdan urug'langan oddiy PRNG (mulberry32) */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
