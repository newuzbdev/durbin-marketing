# Architectural patterns

These patterns each appear in several places in the codebase. New code should follow them.

## 1. Multi-tenancy: every piece of domain data belongs to a `School`

- **Schema:** every domain model has `schoolId` with `onDelete: Cascade`, and its uniqueness
  constraints are scoped by school. Examples: `apps/api/prisma/schema.prisma:101`, `:118`, `:147`, `:215`, `:334`.
  Child rows (messages, campaign insights) reach the school through their parent instead of storing their own `schoolId`.
- **Request scoping:** the client sends `X-School-Id` on every call (`apps/web/src/lib/api.ts:83`).
  `SchoolGuard` checks membership and sets `req.school` (`apps/api/src/schools/school.guard.ts:21-32`).
- **Rule:** a school-scoped controller uses `@UseGuards(SchoolGuard)` and reads the school with `@CurrentSchool()`
  (`apps/api/src/auth/decorators.ts:26`). **Every Prisma query filters by `school.id`.** There is no
  Prisma middleware doing this automatically (Prisma 7 removed `$use`), so the filter must be explicit.
- Switching schools on the client invalidates every query except `me` (`apps/web/src/lib/auth.tsx:69`).

## 2. Auth: authenticated by default, opt out explicitly

- `JwtAuthGuard` is registered globally through `APP_GUARD` (`apps/api/src/auth/auth.module.ts:13`).
  Every route needs a Bearer token unless it is marked `@Public()` (`apps/api/src/auth/decorators.ts:16`,
  checked at `apps/api/src/auth/jwt-auth.guard.ts:16`). Webhooks and auth endpoints must be `@Public()`.
- Authorization uses metadata plus a guard: `@Roles(...)` (`apps/api/src/auth/decorators.ts:20`) is
  enforced inside `SchoolGuard`. Roles are OWNER, MANAGER, and VIEWER. Mutating endpoints should use
  `@Roles('OWNER','MANAGER')`.
- Tokens: the access JWT lasts 15 minutes. The refresh token is opaque, stored **hashed** (sha256), and
  rotated on every use (`apps/api/src/auth/auth.service.ts:41-49`, `:72`).
- SSO seam: the rest of the API only depends on our own JWT. A future Durbin SSO should issue the same
  tokens through `issueTokens` rather than adding a new guard.

## 3. Validation: shared zod schemas and `ZodPipe`

- Input schemas and their inferred types live in `packages/shared/src/index.ts` (for example `:37`, `:77`).
  Web forms and API endpoints import the same schema.
- Controllers validate per parameter with `@Body(new ZodPipe(schema))` (`apps/api/src/auth/auth.controller.ts:17`).
  The pipe returns a 400 error shaped as `{message, issues[{path,message}]}` (`apps/api/src/common/zod.pipe.ts:8`).
  There is no class-validator and there are no DTO classes.
- Enums are `as const` tuples in `shared` (`packages/shared/src/index.ts:4`) and must mirror the Prisma enums by hand.
- Date-only values are `YYYY-MM-DD` strings on the wire (`packages/shared/src/index.ts:33`) and `@db.Date` in the DB.

## 4. NestJS module and dependency-injection conventions

- Infrastructure modules are `@Global()` and export their service, so feature modules do not have to
  import them: `PrismaModule` (`apps/api/src/prisma/prisma.module.ts:4`) and `AuthModule` (exports
  `SchoolGuard`; `apps/api/src/auth/auth.module.ts:9`).
- Every dependency is injected through `private readonly` constructor parameters (see `auth.service.ts`,
  `school.guard.ts`, `jwt-auth.guard.ts`).
- Configuration is read from `process.env` at the point of use. `ConfigModule` is global and `dotenv/config`
  is loaded in `main.ts`.
- One folder per domain (`auth/`, `schools/`, and later `content/`, `goals/`, …) containing a
  `*.module.ts`, `*.controller.ts`, and `*.service.ts`. Cross-cutting helpers go in `common/` as plain functions.

## 5. Data conventions

- IDs are `cuid()` strings. Timestamps use `createdAt @default(now())`.
- **Money is stored as an integer in the minor currency unit** (`apps/api/prisma/schema.prisma:207`, `:222`).
- Daily metrics use one row per `(entity, date)` with an upsert-friendly unique key (for example `IgDailyInsight`, `AdCampaignDailyInsight`).
- Records imported from Meta keep `externalId` for idempotent sync and deduplication.
- Secrets are stored encrypted: Meta tokens go into `accessTokenEnc` (`schema.prisma:94`) through
  `encrypt`/`decrypt` (`apps/api/src/common/crypto.ts:11`). Never store or log plaintext tokens.
- Date math happens in UTC days (`apps/api/src/common/dates.ts:4`). Dashboard periods use
  `periodRange` (`apps/api/src/common/dates.ts:21`). The school's timezone (`School.timezone`) is not applied yet.

## 6. Web: client-side SPA over the REST API

- Authenticated pages are client components that fetch with TanStack Query through `api<T>()`
  (`apps/web/src/lib/api.ts:78`). There are no server actions or RSC data fetching for app data.
- `api()` attaches the Bearer token and `X-School-Id`, and on a 401 retries once after a **single-flight** refresh
  (`apps/web/src/lib/api.ts:59`, `:92`). Errors are thrown as `ApiError(status, message, body)`.
- Session state (tokens and the selected school) lives in `localStorage`. React reads it through
  `useSyncExternalStore` (`apps/web/src/lib/auth.tsx:40-41`), and writes notify subscribers (`auth.tsx:33`).
- Server data comes from TanStack Query (a single client in `apps/web/src/app/providers.tsx:12`,
  staleTime 60s). There is no global client-state library. The auth context is the only React context.
- Route guarding happens on the client in the `marketing` layout (`apps/web/src/app/marketing/layout.tsx:16`),
  not in `proxy.ts`.
- User feedback goes through `sonner` toasts. UI strings come from `uz` (`apps/web/src/messages/uz.ts:2`) and are not hard-coded.

## 7. External integrations (planned; the design is fixed)

- Meta access sits behind a `MetaClient` interface with `MockMetaClient` and `GraphMetaClient`, selected by
  `META_MODE=mock|live`. The mock mode is the primary mode until Meta App Review passes.
- Webhooks verify `X-Hub-Signature-256` against the raw body. `rawBody: true` is already enabled (`apps/api/src/main.ts:7`).
- Long-running and scheduled work (publishing posts, syncs, token refresh, AI analysis) goes into BullMQ jobs, not request handlers.
