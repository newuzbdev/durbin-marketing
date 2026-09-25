import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { IgConversationDto, IgMessageDto } from '@durbin/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { META_CLIENT, type MetaClient } from '../meta/meta-client.js';
import { MetaConnectionsService } from '../meta/meta-connections.service.js';
import { igLeadId } from '../goals/lead-sources.service.js';

/** Meta qoidasi: foydalanuvchi oxirgi yozganidan keyin 24 soat ichida javob berish mumkin */
export const REPLY_WINDOW_MS = 24 * 3_600_000;

export function canReply(lastInboundAt: Date | null, now = Date.now()): boolean {
  return !!lastInboundAt && now - lastInboundAt.getTime() < REPLY_WINDOW_MS;
}

/** Webhook'dan kelgan bitta xabar (Instagram messaging event) */
export interface InboundWebhookMessage {
  igUserId: string;
  senderId: string;
  recipientId: string;
  mid: string;
  text: string;
  timestamp: number;
  isEcho: boolean;
}

@Injectable()
export class DmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: MetaConnectionsService,
    @Inject(META_CLIENT) private readonly meta: MetaClient,
  ) {}

  async conversations(schoolId: string): Promise<IgConversationDto[]> {
    const rows = await this.prisma.igConversation.findMany({
      where: { schoolId },
      orderBy: { lastMessageAt: 'desc' },
      include: { messages: { orderBy: { sentAt: 'desc' }, take: 1, select: { text: true } } },
    });
    const leadIds = new Set(
      (
        await this.prisma.lead.findMany({
          where: { schoolId, source: 'INSTAGRAM', count: { gt: 0 }, externalId: { in: rows.map((c) => igLeadId(c.participantId)) } },
          select: { externalId: true },
        })
      ).map((l) => l.externalId),
    );
    return rows.map((c) => ({
      id: c.id,
      participantName: c.participantName,
      participantAvatar: c.participantAvatar,
      lastMessageAt: c.lastMessageAt.toISOString(),
      lastMessagePreview: c.messages[0]?.text ?? null,
      unreadCount: c.unreadCount,
      canReply: canReply(c.lastInboundAt),
      isLead: leadIds.has(igLeadId(c.participantId)),
    }));
  }

  /** Suhbatni ochish — o'qilgan deb belgilanadi */
  async messages(schoolId: string, conversationId: string): Promise<IgMessageDto[]> {
    const conv = await this.findConversation(schoolId, conversationId);
    if (conv.unreadCount) {
      await this.prisma.igConversation.update({ where: { id: conv.id }, data: { unreadCount: 0 } });
    }
    const rows = await this.prisma.igMessage.findMany({
      where: { conversationId: conv.id },
      orderBy: { sentAt: 'desc' },
      take: 100,
    });
    return rows.reverse().map((m) => ({
      id: m.id,
      direction: m.direction,
      text: m.text,
      sentAt: m.sentAt.toISOString(),
    }));
  }

  async send(schoolId: string, conversationId: string, text: string, userId: string): Promise<IgMessageDto> {
    const conv = await this.findConversation(schoolId, conversationId);
    if (!canReply(conv.lastInboundAt)) {
      throw new ConflictException("24 soatlik javob oynasi yopilgan — foydalanuvchi qayta yozishini kuting");
    }
    const ref = await this.connections.instagramRef(schoolId);
    if (!ref) throw new ServiceUnavailableException('Instagram ulanmagan');

    const { externalId } = await this.meta.sendMessage(ref, conv.participantId, text);
    const sentAt = new Date();
    const [msg] = await this.prisma.$transaction([
      this.prisma.igMessage.create({
        data: { conversationId: conv.id, externalId, direction: 'OUTBOUND', text, sentAt, sentByUserId: userId },
      }),
      this.prisma.igConversation.update({ where: { id: conv.id }, data: { lastMessageAt: sentAt } }),
    ]);
    return { id: msg.id, direction: msg.direction, text: msg.text, sentAt: msg.sentAt.toISOString() };
  }

  /** Webhook: xabar shu IG akkaunt ulangan barcha maktablarga yoziladi */
  async ingestWebhook(event: InboundWebhookMessage): Promise<void> {
    const conns = await this.prisma.metaConnection.findMany({
      where: { type: 'INSTAGRAM', externalId: event.igUserId },
      select: { schoolId: true },
    });
    const inbound = !event.isEcho;
    const participantId = inbound ? event.senderId : event.recipientId;
    const sentAt = new Date(event.timestamp);

    for (const { schoolId } of conns) {
      const conv = await this.prisma.igConversation.upsert({
        where: { schoolId_participantId: { schoolId, participantId } },
        // Ism keyingi sync'da yangilanadi
        create: { schoolId, participantId, participantName: participantId, lastMessageAt: sentAt },
        update: {},
      });
      const exists = await this.prisma.igMessage.findUnique({
        where: { conversationId_externalId: { conversationId: conv.id, externalId: event.mid } },
      });
      if (exists) continue;

      await this.prisma.$transaction([
        this.prisma.igMessage.create({
          data: {
            conversationId: conv.id,
            externalId: event.mid,
            direction: inbound ? 'INBOUND' : 'OUTBOUND',
            text: event.text,
            sentAt,
          },
        }),
        this.prisma.igConversation.update({
          where: { id: conv.id },
          data: {
            lastMessageAt: sentAt > conv.lastMessageAt ? sentAt : conv.lastMessageAt,
            ...(inbound ? { lastInboundAt: sentAt, unreadCount: { increment: 1 } } : {}),
          },
        }),
      ]);
    }
  }

  private async findConversation(schoolId: string, id: string) {
    const conv = await this.prisma.igConversation.findFirst({ where: { id, schoolId } });
    if (!conv) throw new NotFoundException();
    return conv;
  }
}
