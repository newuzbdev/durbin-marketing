import { BadGatewayException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type {
  AiChatReplyDto,
  AiInsightKind,
  AiInsightsDto,
  AiMessageDto,
  AiScriptDto,
  AiThreadDto,
  ChatMessageInput,
  PostType,
  ScriptRequestInput,
} from '@durbin/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AiChatMessage } from '../generated/prisma/client.js';
import { AiContextService } from './ai-context.service.js';
import { ReplicateClient } from './replicate-client.js';

const BASE_RULES = `Sen Durbin — maktablar uchun marketing yordamchisisan. Maktabning Instagram, Facebook reklama, kontent reja, maqsadlar va lidlar ma'lumotlari JSON ko'rinishida beriladi.
Qoidalar:
- Faqat o'zbek tilida, lotin yozuvida yoz.
- Faqat berilgan ma'lumotlarga tayan. Raqam yoki faktni o'ylab topma; ma'lumot yetarli bo'lmasa, buni ochiq ayt.
- Aniq raqam va sanalarni keltir (masalan: "chorshanba kuni chiqqan reel, reach 3 200").
- Qisqa va amaliy bo'l: maktab marketologi darhol qo'llay oladigan xulosa va tavsiyalar ber.`;

const JSON_ONLY = "Javobni faqat bitta JSON obyekt ko'rinishida qaytar — undan oldin yoki keyin hech qanday matn, izoh yoki ``` belgisi bo'lmasin.";

const TASKS: Record<AiInsightKind, string> = {
  ANALYSIS: `Vazifa: ma'lumotlarni tahlil qilib, 4–6 ta qisqa xulosa yoz. Mavzular (ma'lumot bo'lganlari): shu hafta eng yaxshi ishlagan post; follower o'sishi sur'ati; reach o'zgarishi; reklama CTR va sarfi oldingi davrga nisbatan; maqsadlar reja bo'yicha ketyaptimi; kontent reja bajarilishi.
Har bir xulosa: "title" — 3–6 so'zli sarlavha; "text" — 1–2 gap, raqamlar bilan, kerak bo'lsa bitta amaliy tavsiya; "tone" — "positive" (yaxshi yangilik), "negative" (muammo yoki pasayish) yoki "neutral".
Format: {"items":[{"title":"...","text":"...","tone":"positive"}]}`,
  CONTENT_SUGGESTION: `Vazifa: maqsadlar va statistikaga asoslanib kontent reja taklif qil — 4–6 ta band. Albatta qamrab ol: maqsadga yetish uchun haftasiga nechta post va ulardan nechtasi reel bo'lishi kerak (hisob-kitob bilan); qaysi kun va soatlarda chiqarish yaxshi (postlar_90_kun ma'lumotiga qarab); qaysi post turi yaxshi ishlayapti; keyingi haftaga 2–3 ta aniq post g'oyasi (maktab hayotidan).
Har bir band: "title" — qisqa sarlavha; "text" — 1–3 gap, aniq raqam va misol bilan; "tone" — "neutral" (yoki kuchli tomon bo'lsa "positive", xavf bo'lsa "negative").
Format: {"items":[{"title":"...","text":"...","tone":"neutral"}]}`,
};

const SCRIPT_FORMAT: Record<PostType, string> = {
  REEL: "15–45 soniyalik vertikal reel: 4–7 ta sahna, har birida vaqt oralig'i (masalan \"0–3 s\"), kadrda nima ko'rinadi va ekrandagi matn yoki ovoz.",
  VIDEO: "30–60 soniyalik video: 4–7 ta sahna, vaqt oralig'i, kadr va ovoz/matn bilan.",
  STORY: "3–5 ta story kadri (har biri ~5 s): kadrda nima ko'rinadi, ekrandagi matn, stiker yoki savol g'oyasi.",
  IMAGE: "Rasmli post: 1–3 ta rasm/slayd uchun kompozitsiya (\"time\" maydoniga \"1-rasm\", \"2-rasm\" deb yoz), rasm ustidagi matn.",
};

const insightsSchema = z.object({
  items: z
    .array(z.object({ title: z.string().min(1), text: z.string().min(1), tone: z.enum(['positive', 'negative', 'neutral']).catch('neutral') }))
    .min(1)
    .max(8),
});

const scriptSchema = z.object({
  caption: z.string().min(1),
  hashtags: z.array(z.string()).max(30).transform((tags) => tags.map((t) => (t.startsWith('#') ? t : `#${t}`).replace(/\s+/g, ''))),
  scenes: z.array(z.object({ time: z.coerce.string(), visual: z.string(), text: z.string() })).min(1).max(12),
});

/** Chat'da modelga yuboriladigan oxirgi xabarlar soni */
const HISTORY = 12;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: AiContextService,
    private readonly ai: ReplicateClient,
  ) {}

  status() {
    return { configured: this.ai.configured, model: this.ai.model };
  }

  async latestInsights(schoolId: string, kind: AiInsightKind): Promise<AiInsightsDto | null> {
    const row = await this.prisma.aiInsight.findFirst({ where: { schoolId, kind }, orderBy: { createdAt: 'desc' } });
    if (!row) return null;
    return { kind, items: JSON.parse(row.content) as AiInsightsDto['items'], createdAt: row.createdAt.toISOString() };
  }

  async generateInsights(schoolId: string, kind: AiInsightKind): Promise<AiInsightsDto> {
    const data = await this.context.build(schoolId);
    const text = await this.ai.generate({
      system: `${BASE_RULES}\n\n${TASKS[kind]}\n${JSON_ONLY}`,
      prompt: `Maktab ma'lumotlari:\n${data}`,
      effort: 'medium',
    });
    const { items } = parseJson(text, insightsSchema);
    const row = await this.prisma.aiInsight.create({ data: { schoolId, kind, content: JSON.stringify(items) } });
    return { kind, items, createdAt: row.createdAt.toISOString() };
  }

  async script(schoolId: string, input: ScriptRequestInput): Promise<AiScriptDto> {
    const data = await this.context.build(schoolId);
    const retry = input.previous
      ? `\n\nOldingi variant foydalanuvchiga yoqmadi:\n${input.previous}\n\nMutlaqo boshqacha g'oya, ohang va boshlanish bilan yangi variant yoz — oldingisini takrorlama.`
      : '';
    const text = await this.ai.generate({
      system: `${BASE_RULES}
Vazifa: maktab uchun Instagram ${input.postType} ssenariysi yoz. ${SCRIPT_FORMAT[input.postType]}
"caption" — Instagram'ga chiqadigan matn (2–5 gap, emoji mumkin, oxirida chaqiriq — masalan, qabul yoki bog'lanish haqida); "hashtags" — 8–12 ta o'zbekcha va mavzuga oid hashtag; "scenes" — sahnalar ro'yxati.
Maktab ma'lumotlaridan (eng yaxshi postlar, maqsadlar) ohang va g'oya uchun foydalan.
Format: {"caption":"...","hashtags":["#..."],"scenes":[{"time":"0–3 s","visual":"...","text":"..."}]}
${JSON_ONLY}`,
      prompt: `Maktab ma'lumotlari:\n${data}\n\nFoydalanuvchi so'rovi: ${input.prompt}${retry}`,
      maxTokens: 3000,
    });
    return parseJson(text, scriptSchema);
  }

  // ─── Chat ─────────────────────────────────────────────────────

  async threads(schoolId: string, userId: string): Promise<AiThreadDto[]> {
    const rows = await this.prisma.aiChatThread.findMany({
      where: { schoolId, userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((t) => ({ id: t.id, title: t.title, createdAt: t.createdAt.toISOString() }));
  }

  async messages(schoolId: string, userId: string, threadId: string): Promise<AiMessageDto[]> {
    await this.findThread(schoolId, userId, threadId);
    const rows = await this.prisma.aiChatMessage.findMany({ where: { threadId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toMessageDto);
  }

  async deleteThread(schoolId: string, userId: string, threadId: string): Promise<void> {
    await this.findThread(schoolId, userId, threadId);
    await this.prisma.aiChatThread.delete({ where: { id: threadId } });
  }

  async chat(schoolId: string, userId: string, input: ChatMessageInput): Promise<AiChatReplyDto> {
    const thread = input.threadId
      ? await this.findThread(schoolId, userId, input.threadId)
      : await this.prisma.aiChatThread.create({
          data: { schoolId, userId, title: input.message.slice(0, 60) },
        });
    const history = (
      await this.prisma.aiChatMessage.findMany({
        where: { threadId: thread.id },
        orderBy: { createdAt: 'desc' },
        take: HISTORY,
      })
    ).reverse();

    const data = await this.context.build(schoolId);
    const transcript = history
      .map((m) => `${m.role === 'USER' ? 'Foydalanuvchi' : 'Yordamchi'}: ${m.content}`)
      .join('\n\n');
    const answer = await this.ai.generate({
      system: `${BASE_RULES}
Vazifa: maktab marketologi bilan suhbat. Savollarga maktab ma'lumotlariga qarab aniq javob ber: sabablarini raqamlar bilan tushuntir va 1–3 ta amaliy qadam taklif qil.
Oddiy matn bilan yoz: markdown sarlavha, jadval va ** belgilarini ishlatma; ro'yxat kerak bo'lsa har qatorni "- " bilan boshla. Foydalanuvchi batafsil so'ramasa, 150 so'zdan oshirma.

Maktab ma'lumotlari:
${data}`,
      prompt: `${transcript ? `Suhbat tarixi:\n${transcript}\n\n` : ''}Foydalanuvchining yangi xabari: ${input.message}`,
      maxTokens: 2000,
    });

    const [userMessage, reply] = await this.prisma.$transaction([
      this.prisma.aiChatMessage.create({ data: { threadId: thread.id, role: 'USER', content: input.message } }),
      this.prisma.aiChatMessage.create({ data: { threadId: thread.id, role: 'ASSISTANT', content: answer } }),
    ]);
    return { threadId: thread.id, userMessage: toMessageDto(userMessage), reply: toMessageDto(reply) };
  }

  private async findThread(schoolId: string, userId: string, id: string) {
    const thread = await this.prisma.aiChatThread.findFirst({ where: { id, schoolId, userId } });
    if (!thread) throw new NotFoundException('Suhbat topilmadi');
    return thread;
  }
}

/** Modeldan kelgan matndan JSON obyektni ajratib, sxema bo'yicha tekshiradi */
export function parseJson<T>(text: string, schema: z.ZodType<T>): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new BadGatewayException("AI javobini o'qib bo'lmadi — qayta urinib ko'ring");
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new BadGatewayException("AI javobini o'qib bo'lmadi — qayta urinib ko'ring");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new BadGatewayException("AI javobi kutilgan ko'rinishda emas — qayta urinib ko'ring");
  return parsed.data;
}

function toMessageDto(m: AiChatMessage): AiMessageDto {
  return { id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString() };
}
