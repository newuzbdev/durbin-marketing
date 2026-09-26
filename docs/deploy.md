# Deploy (bepul): Vercel + Render + Neon + cron-job.org

| Qism | Xizmat | Izoh |
|---|---|---|
| Web (Next.js) | **Vercel** Hobby | `apps/web`, `apps/web/vercel.json` |
| API (NestJS) | **Render** Free | `render.yaml` (Blueprint). 15 daqiqa so'rovsiz uxlaydi |
| Uyg'oq ushlash | **cron-job.org** | har 5 daqiqada `/api/health` |
| Postgres | **Neon** Free | 0.5 GB |
| Media | **Cloudflare R2** | `docs/content-plan-setup.md` |

Nega API Vercel'da emas: API doimiy ishlaydigan server — har daqiqalik auto-publish cron, 5 soniyalik Telegram polling,
5 daqiqagacha davom etadigan video chiqarish va xotiradagi AI navbati serverless funksiyalarda ishlamaydi.

## 1. Neon (Postgres)

1. neon.tech → GitHub bilan kiring → **New project** (region: Render bilan bir xil — hozir **AWS US East 2 (Ohio)**).
2. **Connection string** → **Direct connection** (pooler'siz) ni tanlang. Oxiridagi parametrlarni `?sslmode=verify-full` ga almashtiring (`channel_binding` ni olib tashlang).
   Bu `DATABASE_URL`.

## 2. Render (API)

1. render.com → GitHub bilan kiring → **New → Blueprint** → `durbin-marketing` reposini tanlang.
2. Render `render.yaml` ni o'qiydi va qiymati yo'q o'zgaruvchilarni so'raydi:

| O'zgaruvchi | Qiymat |
|---|---|
| `DATABASE_URL` | Neon'dagi Direct connection string |
| `WEB_ORIGIN` | Vercel domeni (hozircha `https://example.com`, 4-qadamda almashtiriladi) |
| `META_APP_ID`, `META_APP_SECRET` | Durbin Marketing app → App settings → Basic |
| `META_REDIRECT_URI` | `https://<render-domen>/api/meta/oauth/callback` |
| `S3_*` | `apps/api/.env` dagi R2 qiymatlari |
| `REPLICATE_API_TOKEN` | Replicate → Account → API tokens |
| `IG_LOGIN_TOKEN`, `IG_APP_SECRET` | ixtiyoriy — Instagram Direct (docs/meta-app-setup.md §6) |

   `JWT_ACCESS_SECRET`, `ENCRYPTION_KEY`, `META_WEBHOOK_VERIFY_TOKEN` ni Render o'zi yaratadi.
3. **Apply**. Birinchi build ~5 daqiqa. Tayyor bo'lgach `https://<render-domen>/api/health` → `{"ok":true}`.
   Render domeni `durbin-api-xxxx.onrender.com` ko'rinishida — `META_REDIRECT_URI` ni shunga moslang.

## 3. Vercel (web)

1. vercel.com → GitHub bilan kiring → **Add New → Project** → `durbin-marketing` reposini import qiling.
2. **Root Directory**: `apps/web` (Framework: Next.js — o'zi aniqlaydi; build sozlamalari `vercel.json` da).
3. **Environment Variables**: `NEXT_PUBLIC_API_URL` = `https://<render-domen>/api`
   (ixtiyoriy: `NEXT_PUBLIC_CONTACT_EMAIL` — maxfiylik sahifasidagi aloqa).
4. **Deploy**. Domen: `https://<loyiha>.vercel.app`.

## 4. Bog'lash

1. Render → durbin-api → **Environment** → `WEB_ORIGIN` = Vercel domeni → **Save** (o'zi qayta deploy qiladi).
2. Demo akkaunt (bir marta, lokal kompyuterdan):
   ```bash
   cd apps/api
   DATABASE_URL="<neon-url>" npx tsx prisma/seed.ts   # demo@durbin.uz / demo12345
   ```
3. **cron-job.org** → GitHub/email bilan ro'yxatdan o'ting → **Create cronjob**:
   URL `https://<render-domen>/api/health`, har **5 daqiqa** → Save.
4. **R2 CORS**: bucket → Settings → CORS → `AllowedOrigins` ga Vercel domenini qo'shing.

## 5. Meta sozlamalari (localhost/tunnel → doimiy domenlar)

**Durbin Marketing** app:
- Facebook Login → Settings → **Valid OAuth Redirect URIs**: `https://<render-domen>/api/meta/oauth/callback`
- App settings → Basic: **Privacy Policy URL** `https://<vercel>/privacy`, **Data deletion** `https://<vercel>/data-deletion`,
  **Site URL** `https://<vercel>/login`

**Durbin DM test** (Instagram Login) app — ishlatilsa:
- Webhooks: Callback URL `https://<render-domen>/api/meta/webhook`,
  Verify token — Render'dagi `META_WEBHOOK_VERIFY_TOKEN` qiymati (Environment → ko'z belgisi)
- Privacy / Data deletion URL — Vercel domeni

## 6. Tekshirish

1. `https://<vercel>/login` → demo akkaunt bilan kiring (production'da login formasi bo'sh — qo'lda yozing).
2. Instagram → **Instagram ulash**, Facebook Ads → **Reklama akkauntini ulash**, Maqsadlar → Telegram bot tokeni.
   Yangi baza bo'sh — ulanishlar qaytadan qilinadi.
3. AI Yordamchi → Tahlil.

## Cheklovlar (bepul tarif)

- Render: 512 MB RAM; cron-job.org to'xtasa server uxlaydi — birinchi so'rov ~30–50 s.
- Neon: 0.5 GB; bo'sh turganda uxlaydi, keyingi so'rovda ~1 s da uyg'onadi.
- Bepul tariflar shartlari o'zgarishi mumkin — ro'yxatdan o'tishda tekshiring.
