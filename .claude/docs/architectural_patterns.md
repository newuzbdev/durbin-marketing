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

## 7. External integrations (Meta)

- All Meta access goes through the `MetaClient` interface (`apps/api/src/meta/meta-client.ts`), injected by the
  `META_CLIENT` token. `META_MODE` picks `GraphMetaClient` or `MockMetaClient` (`apps/api/src/meta/meta.module.ts:13`).
  Graph-specific metric names and response shapes stay inside the implementations. New Meta features add a method
  to the interface **and** to the mock, so the mock stays a full stand-in until App Review passes.
- The mock is deterministic: same day gives the same numbers. Sync code relies on this for idempotency tests.
- OAuth `state` is HMAC-signed and carries `schoolId`, `userId`, and `returnOrigin` (`apps/api/src/common/signed-state.ts`).
  The callback is `@Public()` and always redirects to the web with `?connected=1`, `?select=`, or `?error=<code>`. It never throws.
- Sync is **upsert by `externalId`**, so it is idempotent. Every sync re-reads the last few days, and only one sync
  runs per school at a time (`apps/api/src/instagram/instagram-sync.service.ts:27`). It is scheduled in-process with
  `@Cron` (`:44`, `:50`). BullMQ is reserved for post publishing.
- One IG account may be connected to several schools. External ids are unique **per parent**, not globally
  (for example `@@unique([conversationId, externalId])` on `IgMessage`).
- Switching or disconnecting an account purges that school's synced IG data (`apps/api/src/meta/meta-connections.service.ts:144`).
- Webhooks are `@Public()`. They verify `X-Hub-Signature-256` against `req.rawBody`
  (`apps/api/src/webhooks/meta-webhook.controller.ts:58`) and always answer 200 after verifying, so Meta does not retry.
- Meta platform rules are enforced on the server, not only in the UI. For example, the 24-hour DM reply window
  (`apps/api/src/instagram/dm.service.ts:10`) returns a 409.
