import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { MetaConnectionDto } from '@durbin/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { decrypt, encrypt } from '../common/crypto.js';
import { signState, verifyState } from '../common/signed-state.js';
import {
  META_CLIENT,
  type AdAccount,
  type AdsRef,
  type IgAccountRef,
  type InstagramAccount,
  type MetaClient,
  type UserToken,
} from './meta-client.js';
import type { MetaConnectionType } from '../generated/prisma/enums.js';

const SELECTION_TTL_MS = 15 * 60_000;

export function allowedWebOrigins(): string[] {
  return (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean);
}

@Injectable()
export class MetaConnectionsService {
  private readonly logger = new Logger(MetaConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(META_CLIENT) private readonly meta: MetaClient,
  ) {}

  get mode() {
    return this.meta.mode;
  }

  startOAuth(
    schoolId: string,
    userId: string,
    requestOrigin: string | undefined,
    target: MetaConnectionType = 'INSTAGRAM',
  ): { url: string } {
    const origins = allowedWebOrigins();
    const returnOrigin = requestOrigin && origins.includes(requestOrigin) ? requestOrigin : origins[0];
    return { url: this.meta.buildLoginUrl(signState({ schoolId, userId, returnOrigin, target })) };
  }

  /** OAuth callback: foydalanuvchini web'ga qaytarish uchun URL qaytaradi (hech qachon throw qilmaydi) */
  async handleCallback(query: { code?: string; state?: string; error?: string }): Promise<string> {
    const state = query.state ? verifyState(query.state) : null;
    if (!state) return this.webUrl(allowedWebOrigins()[0], 'INSTAGRAM', { error: 'invalid_state' });
    const target = state.target ?? 'INSTAGRAM';
    const back = (params: Record<string, string>) => this.webUrl(state.returnOrigin, target, params);

    if (query.error || !query.code) return back({ error: query.error ?? 'no_code' });

    // Foydalanuvchi callback'gacha maktabdan chiqarilgan bo'lishi mumkin
    const membership = await this.prisma.membership.findUnique({
      where: { userId_schoolId: { userId: state.userId, schoolId: state.schoolId } },
    });
    if (!membership || membership.role === 'VIEWER') return back({ error: 'forbidden' });

    try {
      const userToken = await this.meta.exchangeCode(query.code);
      if (target === 'ADS') return back(await this.afterAdsLogin(state.schoolId, userToken));
      const accounts = await this.meta.listInstagramAccounts(userToken.accessToken);
      if (accounts.length === 0) return back({ error: 'no_instagram_account' });
      if (accounts.length === 1) {
        await this.saveInstagram(state.schoolId, accounts[0]);
        return back({ connected: '1' });
      }
      const pending = await this.prisma.metaPendingSelection.create({
        data: {
          schoolId: state.schoolId,
          userTokenEnc: encrypt(userToken.accessToken),
          expiresAt: new Date(Date.now() + SELECTION_TTL_MS),
        },
      });
      return back({ select: pending.id });
    } catch (err) {
      this.logger.error(`OAuth callback xatosi: ${(err as Error).message}`);
      return back({ error: 'meta_error' });
    }
  }

  /** Reklama akkaunti: bittasi bo'lsa darhol ulanadi, bir nechta bo'lsa — tanlov */
  private async afterAdsLogin(schoolId: string, userToken: UserToken): Promise<Record<string, string>> {
    const accounts = await this.meta.listAdAccounts(userToken.accessToken);
    if (accounts.length === 0) return { error: 'no_ad_account' };
    if (accounts.length === 1) {
      await this.saveAds(schoolId, accounts[0], userToken);
      return { connected: '1' };
    }
    const pending = await this.prisma.metaPendingSelection.create({
      data: {
        schoolId,
        type: 'ADS',
        userTokenEnc: encrypt(JSON.stringify(userToken)),
        expiresAt: new Date(Date.now() + SELECTION_TTL_MS),
      },
    });
    return { select: pending.id };
  }

  async pendingAdAccounts(schoolId: string, selectionId: string): Promise<AdAccount[]> {
    return (await this.loadPendingAds(schoolId, selectionId)).accounts;
  }

  async selectAdAccount(schoolId: string, selectionId: string, adAccountId: string) {
    const { accounts, userToken } = await this.loadPendingAds(schoolId, selectionId);
    const account = accounts.find((a) => a.id === adAccountId);
    if (!account) throw new BadRequestException('Reklama akkaunti topilmadi');
    await this.saveAds(schoolId, account, userToken);
    await this.prisma.metaPendingSelection.delete({ where: { id: selectionId } });
  }

  /** Reklama API chaqiruvlari uchun. Ulanmagan bo'lsa null. */
  async adsRef(schoolId: string): Promise<(AdsRef & { connectionId: string }) | null> {
    const conn = await this.prisma.metaConnection.findUnique({ where: { schoolId_type: { schoolId, type: 'ADS' } } });
    if (!conn) return null;
    return {
      connectionId: conn.id,
      adAccountId: conn.externalId,
      accessToken: decrypt(conn.accessTokenEnc),
      currency: conn.currency ?? 'USD',
    };
  }

  private async saveAds(schoolId: string, account: AdAccount, userToken: UserToken) {
    const existing = await this.prisma.metaConnection.findUnique({ where: { schoolId_type: { schoolId, type: 'ADS' } } });
    const switched = existing && existing.externalId !== account.id;
    const data = {
      externalId: account.id,
      displayName: account.name,
      currency: account.currency,
      // Reklama API user token bilan ishlaydi — ~60 kun amal qiladi, keyin qayta ulash kerak
      accessTokenEnc: encrypt(userToken.accessToken),
      expiresAt: userToken.expiresAt,
    };
    await this.prisma.$transaction([
      ...(switched ? [this.prisma.adCampaign.deleteMany({ where: { schoolId } })] : []),
      this.prisma.metaConnection.upsert({
        where: { schoolId_type: { schoolId, type: 'ADS' } },
        create: { schoolId, type: 'ADS', ...data },
        update: { ...data, ...(switched ? { lastSyncedAt: null } : {}) },
      }),
    ]);
  }

  private async loadPendingAds(schoolId: string, selectionId: string) {
    const pending = await this.prisma.metaPendingSelection.findFirst({
      where: { id: selectionId, schoolId, type: 'ADS', expiresAt: { gt: new Date() } },
    });
    if (!pending) throw new NotFoundException("Tanlov muddati o'tgan, qaytadan ulang");
    const raw = JSON.parse(decrypt(pending.userTokenEnc)) as { accessToken: string; expiresAt: string | null };
    const userToken: UserToken = { accessToken: raw.accessToken, expiresAt: raw.expiresAt ? new Date(raw.expiresAt) : null };
    return { userToken, accounts: await this.meta.listAdAccounts(userToken.accessToken) };
  }

  /** Tanlov dialogi uchun akkauntlar ro'yxati (token'larsiz) */
  async pendingAccounts(schoolId: string, selectionId: string) {
    const accounts = await this.loadPendingAccounts(schoolId, selectionId);
    return accounts.map(({ igUserId, username, avatarUrl, pageName }) => ({ igUserId, username, avatarUrl, pageName }));
  }

  async selectInstagram(schoolId: string, selectionId: string, igUserId: string) {
    const accounts = await this.loadPendingAccounts(schoolId, selectionId);
    const account = accounts.find((a) => a.igUserId === igUserId);
    if (!account) throw new BadRequestException('Akkaunt topilmadi');
    await this.saveInstagram(schoolId, account);
    await this.prisma.metaPendingSelection.delete({ where: { id: selectionId } });
  }

  async list(schoolId: string): Promise<MetaConnectionDto[]> {
    const rows = await this.prisma.metaConnection.findMany({ where: { schoolId }, orderBy: { type: 'asc' } });
    return rows.map((c) => ({
      type: c.type,
      externalId: c.externalId,
      displayName: c.displayName,
      avatarUrl: c.avatarUrl,
      lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
      expiresAt: c.expiresAt?.toISOString() ?? null,
      currency: c.currency,
    }));
  }

  async disconnect(schoolId: string, type: MetaConnectionType) {
    const conn = await this.prisma.metaConnection.findUnique({ where: { schoolId_type: { schoolId, type } } });
    if (!conn) throw new NotFoundException();
    await this.prisma.$transaction([
      this.prisma.metaConnection.delete({ where: { id: conn.id } }),
      ...(type === 'INSTAGRAM' ? this.purgeInstagramData(schoolId) : [this.prisma.adCampaign.deleteMany({ where: { schoolId } })]),
    ]);
  }

  /** Sync va DM uchun: shifrlangan token ochiladi. Ulanmagan bo'lsa null. */
  async instagramRef(schoolId: string): Promise<(IgAccountRef & { connectionId: string }) | null> {
    const conn = await this.prisma.metaConnection.findUnique({
      where: { schoolId_type: { schoolId, type: 'INSTAGRAM' } },
    });
    if (!conn?.pageId) return null;
    return {
      connectionId: conn.id,
      igUserId: conn.externalId,
      pageId: conn.pageId,
      accessToken: decrypt(conn.accessTokenEnc),
      igLoginToken: await this.igLoginTokenFor(conn.externalId),
    };
  }

  /**
   * Sinov yo'li: `.env` dagi IG_LOGIN_TOKEN (Meta dashboard'da yaratilgan) — faqat o'sha akkauntga tegishli bo'lsa.
   * Production'da har bir maktab "Instagram Direct ulash" (Instagram Login OAuth) orqali o'z tokenini saqlaydi.
   */
  private igLoginOwner: Promise<string | null> | null = null;

  private async igLoginTokenFor(igUserId: string): Promise<string | undefined> {
    const token = process.env.IG_LOGIN_TOKEN;
    if (!token || this.meta.mode !== 'live') return undefined;
    this.igLoginOwner ??= fetch(`https://graph.instagram.com/me?fields=user_id&access_token=${encodeURIComponent(token)}`)
      .then((r) => r.json() as Promise<{ user_id?: string }>)
      .then((me) => me.user_id ?? null)
      .catch(() => {
        this.igLoginOwner = null; // tarmoq xatosi — keyingi safar qayta tekshiriladi
        return null;
      });
    return (await this.igLoginOwner) === igUserId ? token : undefined;
  }

  private async saveInstagram(schoolId: string, account: InstagramAccount) {
    const existing = await this.prisma.metaConnection.findUnique({
      where: { schoolId_type: { schoolId, type: 'INSTAGRAM' } },
    });
    const data = {
      externalId: account.igUserId,
      displayName: account.username,
      avatarUrl: account.avatarUrl,
      pageId: account.pageId,
      accessTokenEnc: encrypt(account.pageAccessToken),
      // Long-lived user token'dan olingan Page token muddatsiz
      expiresAt: null,
    };
    // Boshqa akkaunt ulansa, eski akkauntning statistikasi aralashib ketmasligi uchun o'chiriladi
    const switched = existing && existing.externalId !== account.igUserId;
    await this.prisma.$transaction([
      ...(switched ? this.purgeInstagramData(schoolId) : []),
      this.prisma.metaConnection.upsert({
        where: { schoolId_type: { schoolId, type: 'INSTAGRAM' } },
        create: { schoolId, type: 'INSTAGRAM', ...data },
        update: { ...data, ...(switched ? { lastSyncedAt: null } : {}) },
      }),
    ]);
  }

  private purgeInstagramData(schoolId: string) {
    return [
      this.prisma.igDailyInsight.deleteMany({ where: { schoolId } }),
      this.prisma.igMedia.deleteMany({ where: { schoolId } }),
      this.prisma.igConversation.deleteMany({ where: { schoolId } }),
    ];
  }

  private async loadPendingAccounts(schoolId: string, selectionId: string) {
    const pending = await this.prisma.metaPendingSelection.findFirst({
      where: { id: selectionId, schoolId, type: 'INSTAGRAM', expiresAt: { gt: new Date() } },
    });
    if (!pending) throw new NotFoundException("Tanlov muddati o'tgan, qaytadan ulang");
    return this.meta.listInstagramAccounts(decrypt(pending.userTokenEnc));
  }

  private webUrl(origin: string, target: MetaConnectionType, params: Record<string, string>) {
    const url = new URL(target === 'ADS' ? '/marketing/ads' : '/marketing/instagram', origin);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url.toString();
  }
}
