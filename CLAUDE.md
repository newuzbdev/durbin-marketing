# Durbin — Marketing

## Project overview

The marketing section of Durbin, a multi-tenant SaaS for schools. Each school connects its own
Instagram Business and Facebook Ads accounts. The product has six parts: Dashboard, Instagram
(insights, posts, DMs), Facebook Ads (campaigns), Kontent Plan (content calendar with
auto-publishing), Maqsadlar (lead/follower/reach goals), and AI Yordamchi (a Claude-powered
assistant).

**Status:** phases 1–3 are done: foundation (auth, tenancy, schema, app shell), Meta connection +
Instagram (OAuth, sync, stats, posts, DM, webhook), and Kontent Plan (calendar, R2 uploads, auto-publish).
The other four section pages are still placeholders.
Roadmap: Maqsadlar → Facebook Ads → AI → Dashboard → App Review/deploy
(`~/.claude/plans/durbin-marketing-bo-limi-keen-shell.md`). Meta App setup: `docs/meta-app-setup.md`;
media storage (R2): `docs/content-plan-setup.md`.

**UI language is Uzbek (Latin).** All user-facing strings, including API error messages and code
comments, are written in Uzbek.

## Tech stack

- **Monorepo:** pnpm 9 workspaces + Turborepo (`turbo.json`, `pnpm-workspace.yaml`)
- **Web:** Next.js 16 (App Router, Turbopack), React 19, Tailwind v4, shadcn/ui on **Base UI**
  (not Radix), TanStack Query, Recharts, lucide-react 1.x (no brand icons)
- **API:** NestJS 12 as **ESM** (`"type": "module"`), vitest, oxlint
- **DB:** PostgreSQL through Prisma 7 with the `@prisma/adapter-pg` driver adapter. The client is
  generated into `apps/api/src/generated/prisma` (gitignored)
- **Shared:** `zod` v4 schemas and enums in `packages/shared`
- **Meta:** Graph API behind `MetaClient` (`apps/api/src/meta/meta-client.ts`); `META_MODE=mock|live`.
  Periodic sync runs in-process with `@nestjs/schedule`, so Redis is not needed yet
- **Media:** S3-compatible storage (Cloudflare R2) behind `StorageService`; browsers upload via presigned PUT
- **Planned:** Anthropic SDK (already installed). BullMQ/Redis only if publishing outgrows the in-process cron

> Next 16, Nest 12, Prisma 7, and zod 4 each have breaking changes compared with older versions.
> Before writing Next code, read `apps/web/AGENTS.md` and the docs in `apps/web/node_modules/next/dist/docs/`.
> For Prisma 7, see `apps/api/.agents/skills/` (Prisma's official agent docs).

## Key directories

| Path | Purpose |
|---|---|
| `apps/api/src/auth/` | JWT login, register, and refresh; global guard; decorators (`@Public`, `@Roles`, `@CurrentUser`, `@CurrentSchool`) |
| `apps/api/src/schools/` | `SchoolGuard`, which enforces tenant isolation |
| `apps/api/src/common/` | Cross-cutting helpers: `ZodPipe`, AES-GCM `crypto`, UTC `dates` |
| `apps/api/src/prisma/` | Global `PrismaService` |
| `apps/api/prisma/` | `schema.prisma` (all domain models), migrations, `seed.ts` |
| `apps/api/test/` | e2e tests (supertest) |
| `apps/web/src/app/(auth)/` | Login and register pages |
| `apps/web/src/app/marketing/` | Authenticated area: sidebar layout plus six section routes |
| `apps/web/src/lib/` | `api.ts` (fetch client), `auth.tsx` (session context) |
| `apps/web/src/components/ui/` | shadcn-generated components; regenerate with the CLI instead of hand-editing |
| `apps/web/src/messages/uz.ts` | Every UI string |
| `packages/shared/src/index.ts` | Enums and zod input schemas used by both apps |


## Adding new Features or Fixing bugs 
**Important**: When you work on a new feat or fixing bug,create git branch first. Then work on changes in that branch for the reminder of the session 

## Commands

Run these from the repo root unless noted otherwise.

```bash
pnpm install
pnpm dev                                  # turbo: shared (watch) + api :4000 + web :3000
pnpm build | pnpm typecheck | pnpm lint | pnpm test
pnpm --filter @durbin/api test:e2e        # e2e tests; they need .env but not a running DB for /health
pnpm db:migrate                           # prisma migrate dev (run in apps/api)
pnpm db:seed                              # demo@durbin.uz / demo12345
pnpm --filter @durbin/api prisma:generate # after every schema.prisma change
docker compose up -d                      # Postgres, Redis, MinIO (optional; any local Postgres works)
```

- Env files: `apps/api/.env` (copy it from `.env.example`; `ENCRYPTION_KEY` must be 32 bytes, base64)
  and `apps/web/.env.local` (`NEXT_PUBLIC_API_URL`).
- **Rebuild `packages/shared` after you change it** (`pnpm --filter @durbin/shared build`). Both
  apps consume its `dist/`. `pnpm dev` runs it in watch mode.
- Web `typecheck` runs `next typegen` first because the global `LayoutProps`/`PageProps` types are generated.
- API URLs are all prefixed with `/api` (`apps/api/src/main.ts:8`). CORS origins come from `WEB_ORIGIN`
  as a comma-separated list (`apps/api/src/main.ts:9`).

## Gotchas

- API imports need the `.js` extension (ESM with `nodenext`). Prisma generates code the same way
  (`apps/api/prisma/schema.prisma:5`).
- Import Prisma types from `../generated/prisma/client.js`, not from `@prisma/client`.
- Base UI components compose with the `render={<Link …/>}` prop, not with `asChild`
  (`apps/web/src/components/marketing-sidebar.tsx:73`).
- Next 16 renamed `middleware` to `proxy.ts`. Request APIs (`params`, `cookies`) are async.
- `apps/web/CLAUDE.md` / `AGENTS.md` are regenerated by `next dev`. Leave them in place.

## Additional documentation

Read these when the task touches the topic:

| File | When to read |
|---|---|
| `.claude/docs/architectural_patterns.md` | Before you add an API module or endpoint, a web page, or a data model. Covers tenancy, auth, validation, the data-fetching and state patterns, and schema conventions |
