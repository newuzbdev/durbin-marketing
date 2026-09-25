import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { LeadSourcesDto } from '@durbin/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { decrypt, encrypt } from '../common/crypto.js';
import { startOfUtcDay } from '../common/dates.js';
import {
  TELEGRAM_API,
  TelegramApiError,
  type TelegramApi,
  type TgMessage,
} from '../telegram/telegram-api.js';

/** Avtomatik manbalardan kelgan lidlarning externalId'si — bir odam bir marta hisoblanadi */
export const igLeadId = (participantId: string) => `ig:${participantId}`;
export const tgLeadId = (userId: number) => `tg:${userId}`;

export const TG_GREETING =
  "Assalomu alaykum! Maktabimizga qiziqish bildirganingiz uchun rahmat.\n\nSiz bilan bog'lanishimiz uchun pastdagi tugma orqali telefon raqamingizni yuboring.";
export const TG_THANKS = "Rahmat! Raqamingiz qabul qilindi — tez orada siz bilan bog'lanamiz.";
const TG_SHARE_BUTTON = '📱 Raqamni yuborish';

@Injectable()
export class LeadSourcesService {
  private readonly logger = new Logger(LeadSourcesService.name);
  private polling: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(TELEGRAM_API) private readonly telegram: TelegramApi,
  ) {}

  async get(schoolId: string): Promise<LeadSourcesDto> {
    const [school, igConn, bot] = await Promise.all([
      this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { igAutoLeadsSince: true } }),
      this.prisma.metaConnection.count({ where: { schoolId, type: 'INSTAGRAM' } }),
      this.prisma.telegramBot.findUnique({ where: { schoolId } }),
    ]);
    return {
      instagram: { connected: igConn > 0, autoLeads: school.igAutoLeadsSince !== null },
      telegram: bot && { username: bot.username, link: `https://t.me/${bot.username}`, lastError: bot.lastError },
    };
  }

  // ─── Instagram Direct ─────────────────────────────────────────

  async setInstagramAuto(schoolId: string, enabled: boolean): Promise<LeadSourcesDto> {
    // Faqat yoqilgandan keyin yangi yozganlar hisoblanadi — eski suhbatlar lidga aylanmaydi
    await this.prisma.school.update({
      where: { id: schoolId },
      data: { igAutoLeadsSince: enabled ? new Date() : null },
    });
    return this.get(schoolId);
  }

  async markInstagram(schoolId: string, conversationId: string): Promise<void> {
    const conv = await this.findConversation(schoolId, conversationId);
    const first = await this.prisma.igMessage.findFirst({
      where: { conversationId: conv.id, direction: 'INBOUND' },
      orderBy: { sentAt: 'asc' },
      select: { sentAt: true },
    });
    const externalId = igLeadId(conv.participantId);
    await this.prisma.lead.upsert({
      where: { schoolId_source_externalId: { schoolId, source: 'INSTAGRAM', externalId } },
      create: {
        schoolId,
        source: 'INSTAGRAM',
        externalId,
        name: conv.participantName,
        date: startOfUtcDay(first?.sentAt ?? new Date()),
      },
      update: { count: 1 },
    });
  }

  /** O'chirilmaydi, count=0 qilinadi — aks holda avtomatik rejim uni qayta qo'shib yuboradi */
  async unmarkInstagram(schoolId: string, conversationId: string): Promise<void> {
    const conv = await this.findConversation(schoolId, conversationId);
    const { count } = await this.prisma.lead.updateMany({
      where: { schoolId, source: 'INSTAGRAM', externalId: igLeadId(conv.participantId) },
      data: { count: 0 },
    });
    if (!count) throw new NotFoundException('Bu suhbat lid sifatida belgilanmagan');
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async captureInstagramTick() {
    await this.captureInstagram().catch((err: Error) => this.logger.error(`IG avto-lid xatosi: ${err.message}`));
  }

  /** Avtomatik rejim: yoqilgandan keyin paydo bo'lgan va bizga yozgan har bir suhbatdosh — bitta lid */
  async captureInstagram(): Promise<number> {
    const schools = await this.prisma.school.findMany({
      where: { igAutoLeadsSince: { not: null } },
      select: { id: true, igAutoLeadsSince: true },
    });
    let created = 0;
    for (const { id: schoolId, igAutoLeadsSince: since } of schools) {
      // Bitta maktabdagi xato (masalan, shu payt o'chirilgan) qolganlarini to'xtatmasin
      created += await this.captureInstagramFor(schoolId, since!).catch((err: Error) => {
        this.logger.warn(`IG avto-lid xatosi (school=${schoolId}): ${err.message}`);
        return 0;
      });
    }
    return created;
  }

  private async captureInstagramFor(schoolId: string, since: Date): Promise<number> {
    const convs = await this.prisma.igConversation.findMany({
      where: { schoolId, createdAt: { gte: since }, lastInboundAt: { gte: since } },
      select: { id: true, participantId: true, participantName: true },
    });
    if (!convs.length) return 0;
    const firsts = await this.prisma.igMessage.groupBy({
      by: ['conversationId'],
      where: { conversationId: { in: convs.map((c) => c.id) }, direction: 'INBOUND' },
      _min: { sentAt: true },
    });
    const firstBy = new Map(firsts.map((f) => [f.conversationId, f._min.sentAt]));
    const data = convs.flatMap((c) => {
      const first = firstBy.get(c.id);
      if (!first || first < since) return [];
      return [
        {
          schoolId,
          source: 'INSTAGRAM' as const,
          externalId: igLeadId(c.participantId),
          name: c.participantName,
          date: startOfUtcDay(first),
        },
      ];
    });
    // Mavjudlari (shu jumladan qo'lda bekor qilingan count=0) o'zgarmaydi
    const res = await this.prisma.lead.createMany({ data, skipDuplicates: true });
    return res.count;
  }

  // ─── Telegram bot ─────────────────────────────────────────────

  async connectTelegram(schoolId: string, token: string): Promise<LeadSourcesDto> {
    let me;
    try {
      me = await this.telegram.getMe(token);
    } catch (err) {
      if (err instanceof TelegramApiError && err.isAuthError) {
        throw new BadRequestException("Token noto'g'ri yoki bekor qilingan. @BotFather'dan yangi token oling");
      }
      throw new BadRequestException("Telegram bilan bog'lanib bo'lmadi, keyinroq urinib ko'ring");
    }
    if (!me.username) throw new BadRequestException('Bu token botga tegishli emas');

    // Bitta botni ikki maktab poll qilsa, update'lar ular orasida bo'linib ketadi
    const taken = await this.prisma.telegramBot.findFirst({
      where: { botId: String(me.id), schoolId: { not: schoolId } },
    });
    if (taken) throw new ConflictException('Bu bot boshqa maktabga ulangan');

    await this.telegram.deleteWebhook(token);
    const data = { botId: String(me.id), username: me.username, tokenEnc: encrypt(token), lastUpdateId: 0, lastError: null };
    await this.prisma.telegramBot.upsert({ where: { schoolId }, create: { schoolId, ...data }, update: data });
    return this.get(schoolId);
  }

  async disconnectTelegram(schoolId: string): Promise<void> {
    const { count } = await this.prisma.telegramBot.deleteMany({ where: { schoolId } });
    if (!count) throw new NotFoundException('Telegram bot ulanmagan');
  }

  // Har 5 soniyada — foydalanuvchi /start bosgach javobni uzoq kutmasin. Webhook'siz ishlaydi (lokal ham).
  @Cron(CronExpression.EVERY_5_SECONDS)
  async pollTelegramTick() {
    await this.pollTelegram().catch((err: Error) => this.logger.error(`Telegram polling xatosi: ${err.message}`));
  }

  pollTelegram(): Promise<void> {
    this.polling ??= this.doPoll().finally(() => {
      this.polling = null;
    });
    return this.polling;
  }

  private async doPoll() {
    const bots = await this.prisma.telegramBot.findMany({ where: { lastError: null } });
    for (const bot of bots) {
      const token = decrypt(bot.tokenEnc);
      try {
        const updates = await this.telegram.getUpdates(token, bot.lastUpdateId + 1);
        if (!updates.length) continue;
        for (const u of updates) {
          if (!u.message) continue;
          await this.handleTelegramMessage(bot.schoolId, token, u.message).catch((err: Error) =>
            this.logger.warn(`Telegram xabarini qayta ishlashda xato (school=${bot.schoolId}): ${err.message}`),
          );
        }
        await this.prisma.telegramBot.update({
          where: { id: bot.id },
          data: { lastUpdateId: Math.max(...updates.map((u) => u.update_id)) },
        });
      } catch (err) {
        if (err instanceof TelegramApiError && err.isAuthError) {
          await this.prisma.telegramBot.update({
            where: { id: bot.id },
            data: { lastError: "Bot tokeni bekor qilingan — yangi token bilan qayta ulang" },
          });
        }
        this.logger.warn(`Telegram getUpdates xatosi (school=${bot.schoolId}): ${(err as Error).message}`);
      }
    }
  }

  private async handleTelegramMessage(schoolId: string, token: string, m: TgMessage) {
    if (m.chat.type !== 'private' || !m.from || m.from.is_bot) return;
    const from = m.from;
    const externalId = tgLeadId(from.id);
    // Faqat o'z raqamini yuborgan bo'lsa (boshqa kontaktni forward qilsa — emas)
    const phone = m.contact && m.contact.user_id === from.id ? m.contact.phone_number : null;
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ') + (from.username ? ` (@${from.username})` : '');
    const where = { schoolId_source_externalId: { schoolId, source: 'TELEGRAM' as const, externalId } };

    const existing = await this.prisma.lead.findUnique({ where });
    if (!existing) {
      await this.prisma.lead.create({
        data: { schoolId, source: 'TELEGRAM', externalId, name, phone, date: startOfUtcDay(new Date(m.date * 1000)) },
      });
    } else if (phone && phone !== existing.phone) {
      await this.prisma.lead.update({ where, data: { phone } });
    }

    if (phone) {
      await this.telegram.sendMessage(token, m.chat.id, TG_THANKS, { remove_keyboard: true });
    } else if (!existing || (m.text?.startsWith('/start') && !existing.phone)) {
      await this.telegram.sendMessage(token, m.chat.id, TG_GREETING, {
        keyboard: [[{ text: TG_SHARE_BUTTON, request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      });
    }
  }

  private async findConversation(schoolId: string, id: string) {
    const conv = await this.prisma.igConversation.findFirst({ where: { id, schoolId } });
    if (!conv) throw new NotFoundException('Suhbat topilmadi');
    return conv;
  }
}
