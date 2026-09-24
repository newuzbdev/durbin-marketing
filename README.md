# Durbin — Marketing

Maktablar uchun marketing bo'limi: Dashboard, Instagram, Facebook Ads, Kontent Plan, Maqsadlar, AI Yordamchi.

## Tuzilma

```
apps/web         Next.js 16 (App Router) + shadcn/ui (Base UI) + TanStack Query
apps/api         NestJS 12 (ESM) + Prisma 7 (PostgreSQL) + BullMQ
packages/shared  Umumiy enumlar va zod sxemalar (web va api ikkalasi ishlatadi)
```

## Ishga tushirish

Talablar: Node 24+, pnpm 9, Docker Desktop.

```bash
pnpm install
docker compose up -d                  # Postgres, Redis, MinIO
cp apps/api/.env.example apps/api/.env   # ENCRYPTION_KEY ni to'ldiring
cp apps/web/.env.example apps/web/.env.local
pnpm db:migrate                       # birinchi marta: migratsiya nomini so'raydi
pnpm db:seed                          # demo@durbin.uz / demo12345
pnpm dev                              # web: http://localhost:3000, api: http://localhost:4000/api
```

## Tekshiruvlar

```bash
pnpm typecheck
pnpm lint
pnpm test                             # unit testlar
pnpm --filter @durbin/api test:e2e    # e2e (health, auth guard)
```

## Asosiy qoidalar

- **Tenant izolyatsiyasi**: maktab ma'lumotiga oid har bir endpoint `@UseGuards(SchoolGuard)` bilan himoyalanadi.
  Client `X-School-Id` header yuboradi, guard a'zolikni tekshiradi, servislar esa har doim `school.id` bo'yicha filter qiladi.
- **Rollar**: `@Roles('OWNER', 'MANAGER')` — o'zgartiruvchi amallar uchun. VIEWER faqat ko'radi.
- **Meta token'lari** DB'da AES-256-GCM bilan shifrlanadi (`src/common/crypto.ts`).
- **Meta API**: `META_MODE=mock` bo'lsa soxta ma'lumot bilan ishlaydi (Meta App Review o'tguncha).
- **UI matnlari** `apps/web/src/messages/uz.ts` da.
