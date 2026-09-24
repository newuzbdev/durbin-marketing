import { randomUUID } from 'node:crypto';
import type { IgMediaType } from '@durbin/shared';
import { addDays, eachDay, startOfUtcDay, toIsoDate } from '../common/dates.js';
import type {
  IgAccountRef,
  IgConversationItem,
  IgDailyMetrics,
  IgMediaItem,
  IgMessageItem,
  InstagramAccount,
  MetaClient,
  UserToken,
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
