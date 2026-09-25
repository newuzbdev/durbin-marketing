import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

// AI Yordamchi modeli Replicate orqali chaqiriladi (Anthropic Claude Sonnet 5 — Replicate'da joylashgan).
// Replicate: bitta prompt + system prompt, javob — matn bo'laklari massivi.

const API = 'https://api.replicate.com/v1';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-5';
/** Replicate'ning Claude modellari uchun eng kichik ruxsat etilgan qiymat */
const MIN_MAX_TOKENS = 1024;
const WAIT_S = 60;
const POLL_MS = 1500;
const DEADLINE_MS = 150_000;
const MAX_THROTTLE_RETRIES = 6;

export type Effort = 'low' | 'medium' | 'high';

export interface GenerateInput {
  system: string;
  prompt: string;
  maxTokens?: number;
  effort?: Effort;
}

interface Prediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string[] | string | null;
  error?: string | null;
  urls?: { get: string };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class ReplicateClient {
  private readonly logger = new Logger(ReplicateClient.name);
  private readonly token = process.env.REPLICATE_API_TOKEN ?? '';
  readonly model = process.env.AI_MODEL || DEFAULT_MODEL;
  /**
   * Kredit $5 dan kam bo'lsa Replicate "burst 1, 6/daqiqa" limit qo'yadi — so'rovlar navbat bilan yuboriladi,
   * shunda bir vaqtdagi ikki foydalanuvchi bir-birini 429 ga tushirmaydi.
   */
  private queue: Promise<unknown> = Promise.resolve();

  get configured(): boolean {
    return !!this.token;
  }

  generate(input: GenerateInput): Promise<string> {
    if (!this.token) {
      throw new ServiceUnavailableException("AI sozlanmagan: apps/api/.env ga REPLICATE_API_TOKEN qo'shing");
    }
    const run = this.queue.then(() => this.run(input));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async run(input: GenerateInput): Promise<string> {
    const started = Date.now();
    let prediction = await this.create(input);
    while (prediction.status === 'starting' || prediction.status === 'processing') {
      if (Date.now() - started > DEADLINE_MS) {
        throw new ServiceUnavailableException("AI javobi juda uzoq kechikdi — qayta urinib ko'ring");
      }
      await sleep(POLL_MS);
      prediction = await this.request<Prediction>(prediction.urls?.get ?? `${API}/predictions/${prediction.id}`);
    }
    if (prediction.status !== 'succeeded') {
      this.logger.warn(`Replicate prediction ${prediction.status}: ${prediction.error ?? ''}`);
      throw new ServiceUnavailableException(`AI xatosi: ${prediction.error ?? prediction.status}`);
    }
    const out = prediction.output;
    const text = (Array.isArray(out) ? out.join('') : (out ?? '')).trim();
    if (!text) throw new ServiceUnavailableException("AI bo'sh javob qaytardi — qayta urinib ko'ring");
    return text;
  }

  private create(input: GenerateInput): Promise<Prediction> {
    return this.request<Prediction>(`${API}/models/${this.model}/predictions`, {
      method: 'POST',
      // Sinxron kutish: qisqa javoblar bitta so'rovda qaytadi, uzunlari uchun keyin polling
      headers: { Prefer: `wait=${WAIT_S}` },
      body: JSON.stringify({
        input: {
          system_prompt: input.system,
          prompt: input.prompt,
          max_tokens: Math.max(MIN_MAX_TOKENS, input.maxTokens ?? 4096),
          effort: input.effort ?? 'low',
        },
      }),
    });
  }

  /** 429 da Replicate aytgan vaqtcha kutib qayta yuboradi; token hech qachon log qilinmaydi */
  private async request<T>(
    url: string,
    init: { method?: string; body?: string; headers?: Record<string, string> } = {},
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...init.headers },
        signal: AbortSignal.timeout((WAIT_S + 15) * 1000),
      });
      const data = (await res.json().catch(() => ({}))) as T & { detail?: string; retry_after?: number };
      if (res.status === 429 && attempt < MAX_THROTTLE_RETRIES) {
        await sleep(((data.retry_after ?? 2) + 0.5) * 1000);
        continue;
      }
      if (res.status === 401) throw new ServiceUnavailableException("Replicate tokeni noto'g'ri yoki bekor qilingan");
      if (res.status === 402) throw new ServiceUnavailableException("Replicate hisobida mablag' tugagan");
      if (!res.ok) {
        this.logger.warn(`Replicate ${res.status}: ${data.detail ?? 'unknown'}`);
        throw new ServiceUnavailableException(`AI xizmati xatosi (${res.status}): ${data.detail ?? ''}`.trim());
      }
      return data;
    }
  }
}
