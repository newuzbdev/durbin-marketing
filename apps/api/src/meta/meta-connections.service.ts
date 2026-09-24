import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { MetaConnectionDto } from '@durbin/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { decrypt, encrypt } from '../common/crypto.js';
import { signState, verifyState } from '../common/signed-state.js';
import { META_CLIENT, type IgAccountRef, type InstagramAccount, type MetaClient } from './meta-client.js';
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

  startOAuth(schoolId: string, userId: string, requestOrigin: string | undefined): { url: string } {
    const origins = allowedWebOrigins();
    const returnOrigin = requestOrigin && origins.includes(requestOrigin) ? requestOrigin : origins[0];
    return { url: this.meta.buildLoginUrl(signState({ schoolId, userId, returnOrigin })) };
  }

  /** OAuth callback: foydalanuvchini web'ga qaytarish uchun URL qaytaradi (hech qachon throw qilmaydi) */
  async handleCallback(query: { code?: string; state?: string; error?: string }): Promise<string> {
    const state = query.state ? verifyState(query.state) : null;
    if (!state) return this.webUrl(allowedWebOrigins()[0], { error: 'invalid_state' });
    const back = (params: Record<string, string>) => this.webUrl(state.returnOrigin, params);

    if (query.error || !query.code) return back({ error: query.error ?? 'no_code' });

    // Foydalanuvchi callback'gacha maktabdan chiqarilgan bo'lishi mumkin
    const membership = await this.prisma.membership.findUnique({
      where: { userId_schoolId: { userId: state.userId, schoolId: state.schoolId } },
    });
    if (!membership || membership.role === 'VIEWER') return back({ error: 'forbidden' });

    try {
      const userToken = await this.meta.exchangeCode(query.code);
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
    }));
  }

  async disconnect(schoolId: string, type: MetaConnectionType) {
    const conn = await this.prisma.metaConnection.findUnique({ where: { schoolId_type: { schoolId, type } } });
    if (!conn) throw new NotFoundException();
    await this.prisma.$transaction([
      this.prisma.metaConnection.delete({ where: { id: conn.id } }),
      ...(type === 'INSTAGRAM' ? this.purgeInstagramData(schoolId) : []),
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
    };
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
      where: { id: selectionId, schoolId, expiresAt: { gt: new Date() } },
    });
    if (!pending) throw new NotFoundException("Tanlov muddati o'tgan, qaytadan ulang");
    return this.meta.listInstagramAccounts(decrypt(pending.userTokenEnc));
  }

  private webUrl(origin: string, params: Record<string, string>) {
    const url = new URL('/marketing/instagram', origin);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url.toString();
  }
}
