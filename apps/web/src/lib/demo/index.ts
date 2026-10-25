// Demo rejim (NEXT_PUBLIC_DEMO_MODE=1): backend'siz — barcha so'rovlarga oldindan yozib olingan javoblar
// (fixtures.json) beriladi, o'zgarishlar faqat brauzer xotirasida saqlanadi (sahifa yangilansa — qaytadan).
// Ma'lumotlarni yangilash: lokal API'ni META_MODE=mock bilan ishga tushirib, javoblarni qayta yozib olish.
import type {
  AiChatReplyDto,
  AiMessageDto,
  AiThreadDto,
  ContentPostDto,
  ContentStatsDto,
  GoalDto,
  IgConversationDto,
  IgMessageDto,
  LeadDto,
  LeadSourcesDto,
  MediaAssetDto,
  MetaConnectionDto,
} from '@durbin/shared';
import { ApiError } from '../api';
import raw from './fixtures.json';

type Json = Record<string, unknown>;
type Init = RequestInit & { json?: unknown };

const DAY = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z)?$/;

// Yozib olingan sanalar bugungi kunga suriladi — grafiklar va kalendar doim "hozir"ni ko'rsatadi
const shiftDays = Math.floor(Date.now() / DAY) - Math.floor(Date.parse(raw.recordedAt) / DAY);
function shift<T>(v: T): T {
  if (typeof v === 'string' && ISO_DATE.test(v)) {
    const d = new Date(Date.parse(v.length === 10 ? `${v}T00:00:00Z` : v) + shiftDays * DAY).toISOString();
    return (v.length === 10 ? d.slice(0, 10) : d) as T;
  }
  if (Array.isArray(v)) return v.map(shift) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shift(x)])) as T;
  return v;
}

const data = shift(raw);
const get = data.get as unknown as Record<string, unknown>;
const posts = data.lists.posts as unknown as ContentPostDto[];
const leads = data.lists.leads as unknown as LeadDto[];
const media = data.lists.media as unknown as Json[];
const me = get['/auth/me'] as { id: string; name: string };
const assets = new Map<string, MediaAssetDto>();

let seq = 0;
const newId = () => `demo-${Date.now().toString(36)}-${++seq}`;
const now = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function page<T>(items: T[], qs: URLSearchParams) {
  const p = Number(qs.get('page') ?? 1);
  const size = Number(qs.get('pageSize') ?? 20);
  return { items: items.slice((p - 1) * size, p * size), total: items.length, page: p, pageSize: size };
}

function postsIn(qs: URLSearchParams) {
  const from = Date.parse(qs.get('from') ?? ''), to = Date.parse(qs.get('to') ?? '');
  return posts
    .filter((p) => Date.parse(p.scheduledAt) >= from && Date.parse(p.scheduledAt) < to)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

function stats(list: ContentPostDto[]): ContentStatsDto {
  const n = (s: ContentPostDto['status']) => list.filter((p) => p.status === s).length;
  return { total: list.length, scheduled: n('SCHEDULED'), published: n('PUBLISHED'), missed: n('MISSED'), failed: n('FAILED') };
}

function goal(input: Json, prev?: GoalDto): GoalDto {
  const g = { ...prev, ...input } as GoalDto;
  const today = now().slice(0, 10);
  const current = prev?.current ?? 0;
  const daysLeft = Math.max(0, Math.round((Date.parse(g.endDate) - Date.parse(today)) / DAY) + 1);
  return {
    ...g,
    id: g.id ?? newId(),
    current,
    percent: Math.min(100, Math.round((current / g.target) * 100)),
    remaining: Math.max(0, g.target - current),
    daysLeft,
    expected: prev?.expected ?? 0,
    status: today < g.startDate ? 'upcoming' : current >= g.target ? 'achieved' : daysLeft === 0 ? 'missed' : 'active',
  };
}

function post(input: Json, prev?: ContentPostDto): ContentPostDto {
  const { mediaAssetId, ...rest } = input as Json & { mediaAssetId?: string | null };
  return {
    status: 'SCHEDULED',
    caption: '',
    autoPublish: true,
    publishedAt: null,
    permalink: null,
    error: null,
    media: null,
    createdBy: { id: me.id, name: me.name },
    createdAt: now(),
    ...prev,
    ...(rest as Partial<ContentPostDto>),
    ...(mediaAssetId !== undefined && { media: mediaAssetId ? (assets.get(mediaAssetId) ?? null) : null }),
    id: prev?.id ?? newId(),
  } as ContentPostDto;
}

const remove = <T extends { id: string }>(list: T[], id: string) => {
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list.splice(i, 1);
};

/** Brauzerda tanlangan fayl saqlashga yuklanmaydi — mahalliy URL bilan ko'rsatiladi */
export function demoAddAsset(file: File): MediaAssetDto {
  const asset = { id: newId(), url: URL.createObjectURL(file), contentType: file.type, size: file.size };
  assets.set(asset.id, asset);
  return asset;
}

export async function demoApi<T>(path: string, init: Init = {}): Promise<T> {
  await sleep(150); // yuklanish holatlari ko'rinsin
  const method = (init.method ?? 'GET').toUpperCase();
  const url = new URL(path, 'http://demo');
  const p = url.pathname;
  const qs = url.searchParams;
  const body = (init.json ?? {}) as Json;
  const seg = p.split('/').filter(Boolean);
  const result = handle(method, p, qs, body, seg);
  if (result === NOT_FOUND) throw new ApiError(404, 'Demo rejimida bu amal mavjud emas');
  // Qaytarilgan obyekt keyinchalik o'zgarsa, React Query keshi buzilmasin
  return (result === undefined ? undefined : structuredClone(result)) as T;
}

const NOT_FOUND = Symbol('not-found');

function handle(method: string, p: string, qs: URLSearchParams, body: Json, seg: string[]): unknown {
  if (method === 'GET') {
    const key = p + url(qs);
    if (key in get) return get[key];
    if (p === '/content/posts') return postsIn(qs);
    if (p === '/content/stats') return stats(postsIn(qs));
    if (p === '/instagram/media') return page(media, qs);
    if (p === '/leads') return page(leads, qs);
    if (p === '/ads/locations') return get['/ads/locations?q=Tosh'];
    if (p in get) return get[p];
    if (p.startsWith('/ai/threads/') || p.startsWith('/instagram/conversations/')) return [];
    return NOT_FOUND;
  }

  // ─── Auth ───
  if (p === '/auth/login' || p === '/auth/register') return { accessToken: 'demo', refreshToken: 'demo' };
  if (p === '/auth/logout') return undefined;

  // ─── Meta ───
  if (p === '/meta/oauth/start') {
    const target = qs.get('target') === 'ADS' ? 'ADS' : 'INSTAGRAM';
    return { url: `/marketing/${target === 'ADS' ? 'ads' : 'instagram'}?connected=1` };
  }
  if (seg[1] === 'connections' && method === 'DELETE') {
    const list = get['/meta/connections'] as MetaConnectionDto[];
    get['/meta/connections'] = list.filter((c) => c.type !== seg[2]);
    return undefined;
  }
  if (p === '/instagram/sync' || p === '/ads/sync') return {};

  // ─── Kontent ───
  if (p === '/content/posts' && method === 'POST') {
    const created = post(body);
    posts.push(created);
    return created;
  }
  if (seg[0] === 'content' && seg[1] === 'posts' && seg[2]) {
    const prev = posts.find((x) => x.id === seg[2]);
    if (!prev) return NOT_FOUND;
    if (method === 'DELETE') return void remove(posts, prev.id);
    if (seg[3] === 'publish' || seg[3] === 'mark-published') {
      Object.assign(prev, { status: 'PUBLISHED', publishedAt: now() });
      return prev;
    }
    Object.assign(prev, post(body, prev));
    return prev;
  }

  // ─── Maqsadlar va lidlar ───
  const goals = get['/goals'] as GoalDto[];
  if (p === '/goals' && method === 'POST') {
    const created = goal(body);
    goals.push(created);
    return created;
  }
  if (seg[0] === 'goals' && seg[1]) {
    const prev = goals.find((g) => g.id === seg[1]);
    if (!prev) return NOT_FOUND;
    if (method === 'DELETE') return void remove(goals, prev.id);
    Object.assign(prev, goal(body, prev));
    return prev;
  }
  if (p === '/leads' && method === 'POST') {
    const created: LeadDto = {
      id: newId(),
      source: body.source as LeadDto['source'],
      count: (body.count as number) ?? 1,
      date: body.date as string,
      name: (body.name as string) ?? null,
      phone: (body.phone as string) ?? null,
      createdAt: now(),
    };
    leads.unshift(created);
    return created;
  }
  if (seg[0] === 'leads' && seg[1] === 'instagram' && seg[2]) {
    const conv = (get['/instagram/conversations'] as IgConversationDto[]).find((c) => c.id === seg[2]);
    if (conv) conv.isLead = method === 'POST';
    return undefined;
  }
  if (seg[0] === 'leads' && seg[1] === 'sources') {
    const sources = get['/leads/sources'] as LeadSourcesDto;
    if (seg[2] === 'instagram') sources.instagram.autoLeads = Boolean(body.enabled);
    if (seg[2] === 'telegram') {
      sources.telegram =
        method === 'DELETE' ? null : { username: 'demo_maktab_bot', link: 'https://t.me/demo_maktab_bot', lastError: null };
    }
    return method === 'DELETE' ? undefined : sources;
  }
  if (seg[0] === 'leads' && seg[1] && method === 'DELETE') return void remove(leads, seg[1]);

  // ─── Instagram DM ───
  if (seg[0] === 'instagram' && seg[1] === 'conversations' && seg[3] === 'messages') {
    const key = `/instagram/conversations/${seg[2]}/messages`;
    const msg: IgMessageDto = { id: newId(), direction: 'OUTBOUND', text: String(body.text ?? ''), sentAt: now() };
    get[key] = [...((get[key] as IgMessageDto[]) ?? []), msg];
    const conv = (get['/instagram/conversations'] as IgConversationDto[]).find((c) => c.id === seg[2]);
    if (conv) Object.assign(conv, { lastMessageAt: msg.sentAt, lastMessagePreview: msg.text });
    return msg;
  }

  // ─── Reklama ───
  const overviews = Object.keys(get)
    .filter((k) => k.startsWith('/ads/overview'))
    .map((k) => get[k] as { campaigns: Json[] });
  if (seg[0] === 'ads' && seg[1] === 'campaigns' && seg[3] === 'status') {
    for (const o of overviews) for (const c of o.campaigns) if (c.id === seg[2]) c.status = body.status;
    return undefined;
  }
  if (p === '/ads/campaigns' && method === 'POST') {
    const created = {
      id: newId(),
      name: body.name,
      status: 'PAUSED',
      objective: body.objective,
      dailyBudget: body.dailyBudget,
      startTime: body.startDate,
      stopTime: body.endDate,
      adsManagerUrl: 'https://adsmanager.facebook.com',
      spend: 0,
      clicks: 0,
      impressions: 0,
      reach: 0,
      leads: 0,
      ctr: 0,
    };
    for (const o of overviews) o.campaigns.unshift(created);
    return created;
  }

  // ─── AI ───
  if (seg[0] === 'ai' && seg[1] === 'insights') return get[`/ai/insights/${seg[2]}`];
  if (p === '/ai/script') return data.aiScript;
  if (p === '/ai/chat') {
    const threads = get['/ai/threads'] as AiThreadDto[];
    let threadId = body.threadId as string | undefined;
    if (!threadId) {
      threadId = newId();
      threads.unshift({ id: threadId, title: String(body.message).slice(0, 60), createdAt: now() });
    }
    const userMessage: AiMessageDto = { id: newId(), role: 'USER', content: String(body.message), createdAt: now() };
    const reply: AiMessageDto = { id: newId(), role: 'ASSISTANT', content: data.aiChatReply, createdAt: now() };
    const key = `/ai/threads/${threadId}/messages`;
    get[key] = [...((get[key] as AiMessageDto[]) ?? []), userMessage, reply];
    return { threadId, userMessage, reply } satisfies AiChatReplyDto;
  }
  if (seg[0] === 'ai' && seg[1] === 'threads' && method === 'DELETE') {
    remove(get['/ai/threads'] as AiThreadDto[], seg[2]);
    return undefined;
  }

  return NOT_FOUND;
}

function url(qs: URLSearchParams) {
  const s = qs.toString();
  return s ? `?${s}` : '';
}
