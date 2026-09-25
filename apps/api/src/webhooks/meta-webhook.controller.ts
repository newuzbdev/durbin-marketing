import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators.js';
import { verifyMetaSignature } from '../common/signed-state.js';
import { MEDIA_PLACEHOLDER } from '../meta/meta-client.js';
import { DmService } from '../instagram/dm.service.js';

interface InstagramWebhookBody {
  object?: string;
  entry?: {
    id: string;
    messaging?: {
      sender: { id: string };
      recipient: { id: string };
      timestamp: number;
      message?: { mid: string; text?: string; is_echo?: boolean };
    }[];
  }[];
}

/**
 * Meta webhook'lari. Meta App → Webhooks'da callback URL: `{API}/api/meta/webhook`,
 * verify token: META_WEBHOOK_VERIFY_TOKEN. Hozir `instagram` → `messages` hodisasi qayta ishlanadi;
 * Lead Ads (`page` → `leadgen`) 5-bosqichda qo'shiladi.
 */
@Public()
@Controller('meta/webhook')
export class MetaWebhookController {
  private readonly logger = new Logger(MetaWebhookController.name);

  constructor(private readonly dm: DmService) {}

  /** Meta obunani tasdiqlash so'rovi */
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (mode !== 'subscribe' || !expected || token !== expected) throw new ForbiddenException();
    return challenge;
  }

  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>, @Headers('x-hub-signature-256') signature?: string) {
    // Facebook Login app (META_APP_SECRET) yoki Instagram Login app (IG_APP_SECRET) imzolagan bo'lishi mumkin
    const secrets = [process.env.META_APP_SECRET, process.env.IG_APP_SECRET].filter((s): s is string => !!s);
    if (!req.rawBody || !secrets.some((secret) => verifyMetaSignature(req.rawBody!, signature, secret))) {
      this.logger.warn(`Webhook rad etildi: imzo ${signature ? "mos kelmadi" : "yo'q"}`);
      throw new ForbiddenException('Imzo noto‘g‘ri');
    }
    const body = req.body as InstagramWebhookBody;
    const events = body.entry?.reduce((n, e) => n + (e.messaging?.length ?? 0), 0) ?? 0;
    this.logger.log(`Webhook qabul qilindi: object=${body.object}, ${body.entry?.length ?? 0} entry, ${events} messaging hodisa`);
    if (body.object !== 'instagram') return 'ignored';

    for (const entry of body.entry ?? []) {
      for (const ev of entry.messaging ?? []) {
        if (!ev.message?.mid) continue;
        await this.dm
          .ingestWebhook({
            igUserId: entry.id,
            senderId: ev.sender.id,
            recipientId: ev.recipient.id,
            mid: ev.message.mid,
            text: ev.message.text || MEDIA_PLACEHOLDER,
            timestamp: ev.timestamp,
            isEcho: !!ev.message.is_echo,
          })
          .catch((err: Error) => this.logger.error(`Webhook xabarini saqlashda xato: ${err.message}`));
      }
    }
    // Meta 200 kutadi, aks holda qayta-qayta yuboradi
    return 'ok';
  }
}
