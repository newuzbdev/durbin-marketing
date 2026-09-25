// Telegram Bot API ustidagi yupqa qatlam. Testlarda TELEGRAM_API provider'i soxta implementatsiya bilan almashtiriladi.
// Token URL ichida bo'ladi — shuning uchun URL hech qachon log qilinmaydi.

export const TELEGRAM_API = Symbol('TELEGRAM_API');

export interface TgUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TgMessage {
  message_id: number;
  date: number;
  chat: { id: number; type: 'private' | 'group' | 'supergroup' | 'channel' };
  from?: TgUser;
  text?: string;
  contact?: { phone_number: string; first_name: string; user_id?: number };
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

export type TgReplyMarkup =
  | { keyboard: { text: string; request_contact?: boolean }[][]; resize_keyboard?: boolean; one_time_keyboard?: boolean }
  | { remove_keyboard: true };

export interface TelegramApi {
  getMe(token: string): Promise<TgUser>;
  /** getUpdates ishlashi uchun webhook o'chirilishi kerak */
  deleteWebhook(token: string): Promise<void>;
  getUpdates(token: string, offset: number): Promise<TgUpdate[]>;
  sendMessage(token: string, chatId: number, text: string, replyMarkup?: TgReplyMarkup): Promise<void>;
}

export class TelegramApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }

  /** Token noto'g'ri yoki bot o'chirilgan */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 404;
  }
}

export class HttpTelegramApi implements TelegramApi {
  getMe(token: string) {
    return this.call<TgUser>(token, 'getMe');
  }

  async deleteWebhook(token: string) {
    await this.call<boolean>(token, 'deleteWebhook', { drop_pending_updates: false });
  }

  getUpdates(token: string, offset: number) {
    return this.call<TgUpdate[]>(token, 'getUpdates', { offset, timeout: 0, allowed_updates: ['message'] });
  }

  async sendMessage(token: string, chatId: number, text: string, replyMarkup?: TgReplyMarkup) {
    await this.call(token, 'sendMessage', { chat_id: chatId, text, reply_markup: replyMarkup });
  }

  private async call<T>(token: string, method: string, body?: unknown): Promise<T> {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!res.ok || !data.ok) {
      throw new TelegramApiError(data.description ?? `Telegram ${res.status}`, res.status);
    }
    return data.result as T;
  }
}
