---
name: koralink-api-standards
description: "KoraLink NestJS API: modules, DTOs, Drizzle, auth guards."
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [nestjs, drizzle, backend, api, koralink]
    related_skills: [koralink-ui-standards]
---

# KoraLink API Standards

Backend development standards for the NestJS API at `apps/api/`.

## When to Use

Use this skill when:
- Creating new REST endpoints in `apps/api/src/modules/`
- Adding new DTOs, services, or controllers to the backend
- Writing Drizzle ORM queries or migrations
- Debugging TypeScript compilation issues in the NestJS API
- Any task touching `apps/api/src/`

Every backend endpoint, module, service, or migration MUST follow these standards.

---

## 1. Architecture Overview

```
apps/api/src/
├── app.module.ts              # Root module — imports all feature modules
├── database/
│   ├── database.module.ts    # Provides 'DB_CONNECTION' token
│   └── schema.ts             # Drizzle schema — single source of truth
├── common/
│   ├── guards/jwt-cookie-auth.guard.ts
│   ├── decorators/current-user.decorator.ts
│   └── utils/timestamp.ts     # withTimestamp() helper
└── modules/
    ├── auth/ ├── matches/ ├── wallet/ ├── gateway/ └── health/
```

### Database Connection Pattern

```typescript
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class MyService {
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}
}
```

---

## 2.5 API Contract Rule: Mutation Endpoints MUST Return Populated Objects

> **CRITICAL — the #1 source of "bare row" bugs.** Every mutation endpoint (POST/PATCH/DELETE) that modifies a resource MUST return the fully populated resource via `this.findOne(id)`, never a bare DB row or plain `{ message }` object.

**Pattern:**
```typescript
// ❌ WRONG — bare row, missing relations. Frontend crashes on null fields.
async joinMatch(userId: string, matchId: string) {
  return this.db.transaction(async (tx) => {
    // ... validation + insert ...
    return player; // bare match_players row — no user names, no pitch data
  });
}

// ✅ CORRECT — fully populated via findOne OUTSIDE the transaction
async joinMatch(userId: string, matchId: string) {
  await this.db.transaction(async (tx) => {
    // ... validation + insert — side effects only, no return ...
  });
  // findOne reads committed state AFTER tx completes
  return this.findOne(matchId);
}
```

**Why OUTSIDE the transaction?** Drizzle's `findFirst` with `with:` relation clauses queries committed data. Calling it inside an uncommitted transaction returns stale or incomplete results. The transaction commits the mutation; `findOne` reads the committed state.

**Affected methods (canonical example from KoraLink):**
- `joinMatch()` → return `this.findOne(matchId)` (was bare `match_players` row)
- `leaveMatch()` → return `this.findOne(matchId)` (was `{ message }`)
- `startMatch()` → return `this.findOne(matchId)` (was `{ message, status }`)
- `completeMatch()` → return `this.findOne(matchId)` (was `{ message, status }`)
- `cancelMatch()` → return `this.findOne(matchId)` (was `{ message, status }`)
- `createMatch()` → already uses this pattern (returned `this.findOne(created.id)`)

### Spots Counting: Exclude Host with FILTER

When counting "available spots" in a match feed, **exclude the host** — they are the organizer, not a "spot to fill."

```sql
-- ❌ WRONG — counts host as a filled spot. New match shows "1/10 spots."
COUNT(mp.id)::int AS spots_filled

-- ✅ CORRECT — host excluded. New match shows "0/10 spots."
COUNT(mp.id) FILTER (WHERE mp.is_host = false)::int AS spots_filled
```

Applies to: `GET /matches` (feed query), `GET /users/me/matches` (my matches), and any query that displays a "spots available" count.

```
modules/<name>/
├── <name>.module.ts        # @Module — controllers, providers, exports
├── <name>.service.ts       # @Injectable — business logic
├── <name>.controller.ts    # @Controller — HTTP endpoints
└── dto/<action>.dto.ts     # Request DTOs with class-validator
```

Modules must be imported in `app.module.ts`.

---

## 3. Controller Conventions

### Auth Guard (MANDATORY on every endpoint)

```typescript
@ApiTags('resource')
@ApiCookieAuth('access_token')
@UseGuards(JwtCookieAuthGuard)
@Controller('resource')
export class ResourceController { ... }
```

### CurrentUser Decorator

```typescript
async myEndpoint(@CurrentUser() user: { sub: string }) { ... }
```

### HTTP Method Conventions

| Operation | Method | Status |
|-----------|--------|--------|
| List/Discover | `@Get()` | 200 |
| Get one | `@Get(':id')` | 200 |
| Create | `@Post()` + `@HttpCode(HttpStatus.CREATED)` | 201 |
| Join/Action | `@Post(':id/action')` | 200 |
| Leave/Remove | `@Delete(':id/action')` | 200 |

Every endpoint gets `@ApiOperation()` + `@ApiOkResponse()` or `@ApiCreatedResponse()`.

---

## 4. DTO Conventions

**DTOs FIRST** — create before the endpoint.

- Always use `@Type(() => Number)` with `@IsNumber()`/`@IsInt()` on query params
- `@ApiProperty` for required, `@ApiPropertyOptional` for optional
- Query DTOs: `@IsOptional()` + defaults. Body DTOs: required by default
- Enum fields: `@IsEnum(['Value1', 'Value2'])` with inline array AND narrow the TypeScript type to the union (`field?: 'Value1' | 'Value2'`), NOT `string`. A `string`-typed enum field forces `as Record<string, unknown>` casts in service `.set()` calls because Drizzle's column type is the union type. Example:

```typescript
// ❌ BAD — forces as Record<string, unknown> cast in services
@IsEnum(['Beginner', 'Intermediate', 'Advanced'])
skill_level?: string;

// ✅ GOOD — satisfies Drizzle's union type directly
@IsEnum(['Beginner', 'Intermediate', 'Advanced'])
skill_level?: 'Beginner' | 'Intermediate' | 'Advanced';
```

---

## 5. Drizzle ORM Conventions

### withTimestamp() — ALWAYS on updates

```typescript
await tx.update(users)
  .set(withTimestamp({ wallet_balance: sql`${users.wallet_balance} + ${delta}` }))
  .where(eq(users.id, userId));
```

### Transactions

Use `this.db.transaction(async (tx) => { ... })` for atomic multi-step ops (join, leave, wallet).

### Schema imports

```typescript
import * as schema from '../../database/schema';
import { matches, users } from '../../database/schema';
```

> See `references/pitfalls.md` for high-impact anti-patterns discovered during code review cycles (TOCTOU races, missing geography columns, cache key bugs, enum type narrowing).

---

## 6. Error Handling

| Scenario | Exception | HTTP |
|----------|-----------|------|
| Not found | `NotFoundException(msg)` | 404 |
| Bad input | `BadRequestException(msg)` | 400 |
| Duplicate | `ConflictException(msg)` | 409 |
| Unauthenticated | `UnauthorizedException(msg)` | 401 |

Services throw; controllers don't catch.

---

## 7. Existing Services Reference

**WalletService** — `getBalance()`, `getHistory(page, perPage)`, `recordTransaction(userId, LedgerEntryDto)`
**MatchesService** — `findNearby(dto)`, `findOne(id)`, `joinMatch(userId, id)`, `leaveMatch(userId, id)`, `createMatch(hostId, dto)`

---

## 8. Verification Checklist

- [ ] `cd apps/api && npx tsc --noEmit` passes (authoritative; ignore `nest build` cache)
- [ ] All endpoints have `@UseGuards(JwtCookieAuthGuard)`
- [ ] All `@Body()` params use class-validator DTOs with `@ApiProperty()`
- [ ] All `.update()` calls use `withTimestamp()`
- [ ] Frontend Zod schemas match backend DTOs field-for-field (see §14)
- [ ] New modules in `app.module.ts`
- [ ] No `console.log`/`console.warn`/`console.error` in production paths — use NestJS `Logger`
- [ ] Geography `location` column is set on INSERT for any geo-filtered table (matches, venues)
- [ ] Cache interceptors removed or have custom `@CacheKey()` on param-varying endpoints
- [ ] Idempotency checks are INSIDE transactions (not before — TOCTOU race)
- [ ] Enum DTO fields use union TypeScript types, not `string`
- [ ] Conventional commit message

### Build Verification Pitfalls

- **`nest build` caches**: The NestJS builder may cache stale compilations. Always verify with `npx tsc --noEmit -p apps/api/tsconfig.json` — this is the authoritative check.
- **PWA `.next` cache**: When the Next.js build reports stale errors that don't match the source (e.g., a Type error about `Loader2` when the file has no such import), clear with `rm -rf apps/player-pwa/.next` and rebuild. Cached `.next` directories can persist compilation artifacts from previous builds. This is the most common cause of phantom build failures.
- **PWA test baseline (Phase 3+)**: As of Phase 3 merge, `npx vitest run` should pass **83+ tests across 9 files**. If tests fail, your changes likely broke something — do NOT dismiss failures as pre-existing. The only known pre-existing failures are the spurious TS1240/TS1241 decorator warnings in the API (see §9), not test failures.
- **Stray untracked module files**: `tsc --noEmit` compiles ALL `.ts` files under `apps/api/src/`, including untracked directories. If another agent/session created module skeletons (e.g. `modules/users/`, `modules/venues/`) that are not registered in `app.module.ts`, they will cause compilation failures even though they aren't in the PR. Check `git status` for untracked `apps/api/src/modules/` directories and `rm -rf` them before building if they aren't part of the current work. Also verify that any existing untracked modules have their imports satisfied (e.g. `import { sql } from 'drizzle-orm'`).

---

## 9. Lint Checker Pitfall

> **CRITICAL:** `write_file`'s lint checker reports spurious TS1240/TS1241 decorator errors for NestJS files (missing `emitDecoratorMetadata` context). **These are NOT real errors.**
>
> The ONLY authoritative check: `cd apps/api && npx tsc --noEmit`
>
> Ignore `write_file` lint for TS1240, TS1241, TS1270, TS1206.

---

## 10. Key Schema Tables

| Table | Key Fields |
|-------|-----------|
| `users` | `wallet_balance`, `karma_score`, `rating`, `no_show_count` |
| `venues` | `owner_id`, `location` (geography), `is_approved` |
| `pitches` | `venue_id`, `hourly_rate`, `size`, `surface_type` |
| `matches` | `host_id`, `pitch_id`, `status`, `price_per_player`, `max_players`, `completed_at` (set when status→Completed, used for POM voting window) |
| `match_players` | `match_id`, `user_id`, `team`, `is_host`, `no_show` |
| `match_votes` | `match_id`, `voter_id`, `candidate_id` (unique: one vote per voter per match) |
| `transactions` | `user_id`, `type` (CREDIT/DEBIT), `amount`, `reference_type`, `idempotency_key` |
| `match_messages` | `match_id`, `user_id`, `content` |

> **CRITICAL: All ID columns are `varchar(36)`, NOT native `uuid`.** Never cast
> bound parameters to `::uuid` in raw SQL — use `::text`. PostgreSQL error 42883
> (`operator does not exist: character varying = uuid`) will silently 500.

### Player of the Match (POM) Pattern

POM uses time-windowed voting: `completeMatch()` sets `completed_at`, then
a 24h voting window opens. Votes use `onConflictDoUpdate` for upsert (change
vote within window). Winner determination is on-demand via `getPomResult()`,
not a cron job — the result is computed when `GET /matches/:id/pom-result` is
called and the window has closed.

Key endpoints:
- `POST /matches/:id/vote` — `{ candidateId }` body, validates attendance + window
- `GET /matches/:id/pom-result` — discriminated union by `status` field
- `GET /users/me` — includes `pom_count` (computed via SQL CTE + RANK())

---

## 13. GitHub Push Prerequisites

### PAT Scope Requirements

When pushing commits that touch workflow files (`.github/workflows/`), the GitHub Personal Access Token **must** have the `workflow` scope. Classic PATs (`ghp_*`) require this scope added at creation time — it cannot be added to an existing token.

**Check before pushing:**
```bash
gh auth status 2>&1 | grep -o "'[^']*'" | tr "'" "\n" | grep workflow
```

If `workflow` is missing from scopes, update the PAT on GitHub (Settings → Developer settings → Personal access tokens → Tokens (classic)) and re-authenticate:
```bash
echo '<new-token-with-workflow-scope>' | gh auth login --with-token
```

**Symptom**: `remote rejected ... refusing to allow a Personal Access Token to create or update workflow ... without 'workflow' scope`

### Git Credential Helper

The project uses `gh auth git-credential` as the credential helper. After updating a PAT, `gh auth status` must reflect the new scopes before `git push` will succeed.

### Multi-Agent PR Review

When reviewing a PR that other agents have worked on:
1. **Check for new commits first**: `git log --oneline origin/<branch>..HEAD` (or `git fetch` + check) — other agents may have pushed additional commits.
2. **Check for untracked module files**: `git status --short apps/api/src/modules/` — stray untracked directories from other sessions will break `tsc --noEmit`.
3. **Build from a clean state**: `rm -rf apps/player-pwa/.next && npx turbo run build` — cached artifacts can mask real type errors.
4. **Re-read all key files**: don't trust cached reads from prior sessions; the other agent may have modified them.

### Parallel Agent Coordination (Phase 4 lesson)

When dispatching parallel sub-agents via `delegate_task` for the same branch:

1. **One file per agent**: Assign each agent files that DON'T overlap. Two agents modifying the same file (especially i18n JSON, shared hooks, or the same page component) WILL produce merge conflicts during sequential commits.

2. **Stash recovery when conflicts happen**: If parallel agents create interleaved changes:
   ```bash
   # Agent A committed their work. Agent B's work is in a stash with conflicts.
   # Step 1: Commit Agent A's i18n changes first
   git add apps/player-pwa/src/messages/ar.json apps/player-pwa/src/messages/en.json
   git commit -m "feat(i18n): add keys from workstream A"

   # Step 2: Apply the conflicting stash
   git stash apply stash@{0}
   # Resolve i18n conflicts by keeping both sides' additions

   # Step 3: Extract individual patches if stash apply fails
   git diff stash@{0}^..stash@{0} -- <file> > /tmp/file.patch
   git apply /tmp/file.patch

   # Step 4: When stash recovery is too messy, write the changes directly.
   # It's often faster to re-implement from the plan than to untangle a corrupted stash.
   ```

3. **Sub-agent timeouts**: The 600s sub-agent timeout is tight for 3+ task workstreams. If an agent hasn't produced commits after 8 minutes, check its live transcript (`deleg_*/task-N.log`) and either wait or re-dispatch the unfinished portion as a smaller, single-task sub-agent.

4. **Idempotency check after sub-agents return**: Always verify what actually landed:
   ```bash
   git log --oneline -5
   git diff HEAD --stat
   grep -c "expectedImport" path/to/file   # Verify agent claims match reality
   ```
   Sub-agents may commit with the right message but wrong file (e.g., commit says "wire verify page" but modified `page.tsx` instead of `verify/page.tsx`).

5. **Sequential > parallel for shared files**: If workstreams MUST touch the same file (e.g., both add keys to `ar.json`), run them sequentially — one agent completes and commits, then the next agent starts. The overhead of a 10-minute sequential run is far less than 30+ minutes of stash conflict resolution.

---

## 14. Frontend/Backend Schema Alignment (CRITICAL)

> **The #1 cause of broken page wiring is frontend Zod schemas that don't match backend DTOs.** Always verify alignment between:
> - Frontend: Zod schemas in `hooks/use*.ts` (e.g. `hostMatchSchema`)
> - Backend: DTO classes in `modules/<name>/dto/` (e.g. `CreateMatchDto`)

### Canonical Example: Match Creation

| Direction | Field Names |
|-----------|------------|
| Backend `CreateMatchDto` | `pitch_id`, `title`, `match_type`, `gender_rule`, `scheduled_at`, `duration_mins`, `max_players`, `pitchCostSar` |
| Frontend (BROKEN — old) | `venueId`, `format`, `date`, `time`, `isPublic`, `bookingMode`, `price` |
| Frontend (FIXED) | `pitch_id`, `title`, `match_type`, `gender_rule`, `scheduled_at`, `duration_mins`, `max_players`, `pitchCostSar` |

**Mismatch symptom**: 400 Bad Request from class-validator — either unknown fields rejected (if `whitelist` enabled) or required fields missing.

**Form mapping**: When the form UI uses different concepts (e.g. `format` picker, separate `date` + `time` inputs), the component's submit handler must map form state → DTO fields before calling the mutation hook. See the `HostMatchForm` pattern in `references/schema-alignment-checklist.md`.

### Alignment Checklist

- [ ] Every Zod field has a corresponding DTO field with the same name
- [ ] Enum values match exactly (case-sensitive)
- [ ] Number ranges match (`@Min`/`@Max` ↔ `z.number().min().max()`)
- [ ] Required/optional semantics match
- [ ] Date formats match (ISO 8601 string ↔ `@IsISO8601()`)
- [ ] Test payloads in `test/hooks/` use correct field names
- [ ] Form submit handler maps UI state → DTO fields (if form uses different concepts)

See `references/schema-alignment-checklist.md` for the full verification workflow with code snippets.

---

## 15. API Response Shape Mismatches (Frontend Wiring)

> **CRITICAL:** API services return **raw DB rows** (snake_case, flat/not wrapped). Frontend React Query hooks declare **wrapped camelCase shapes**. This mismatch is the #1 source of broken page wiring. See `references/api-contracts.md` for auth endpoint contracts.

### Matches

| Endpoint | Service Return Type | Frontend Hook Expects |
|----------|-------------------|----------------------|
| `GET /matches` | `NearbyMatchRow[]` (flat snake_case SQL rows) | `{ matches: Match[], total: number, hasMore: boolean }` |
| `GET /matches/:id` | Drizzle relational (nested `host`, `pitch`, `players`) | `Match` (rich camelCase type with `organizer`, `roster`, `comments`) |
| `POST /matches` | **Bare `matches` row from `.returning()` — NO relations** | `Match` (adapted from `MatchDetailApi` via `adaptMatchDetail`, which reads `detail.host`, `detail.pitch`, `detail.players`) |

**`CreateMatchDto`** fields: `pitch_id`, `title`, `match_type` (Casual\|Competitive), `gender_rule` (Men Only\|Women Only\|Mixed), `scheduled_at` (ISO 8601), `duration_mins`, `max_players`, `pitchCostSar`.

### Wallet

| Endpoint | Service Return Type | Frontend Hook Expects |
|----------|-------------------|----------------------|
| `GET /wallet/balance` | `{ balance: string }` (numeric string from Postgres) | `{ balance: number, currency: string }` |
| `GET /wallet/history` | `transactions[]` (raw Drizzle rows) | `{ transactions: Transaction[], total: number, hasMore: boolean }` |
| `POST /wallet/topup` | `{ ledgerEntry, wallet_balance: string }` | Transaction object |

**`TopupWalletDto`**: `amount: number`, `referenceId?: string`, `idempotencyKey: string`.
**`WalletHistoryDto`**: `page?: number` (default 1), `perPage?: number` (default 20, max 100).

---

## 16. Data-Flow Connectivity Checklist (env → fetcher → API → DB → page)

> **CRITICAL:** When "no data shows in the PWA", the bug is almost never in the page component or the adapter — it is a broken link in the connectivity chain. Code compiles, tests pass, but runtime/infra gaps block all data. Check every link BEFORE diving into component logic.

Use when diagnosing "blank page", "no matches/wallet/venues showing", "all API calls fail". Full audit recipe in `references/data-flow-audit.md`.

### Pre-flight: infra prerequisites (check FIRST)

- [ ] **`apps/api/.env` exists** (not just `.env.example`). `ConfigModule.forRoot()` loads `.env`; without it, `DATABASE_URL` is unset and `database.module.ts:16` `getOrThrow()` crashes the API on boot.
- [ ] **Drizzle migrations generated and applied.** Check `apps/api/drizzle/meta/_journal.json` exists. If absent, `npm run db:generate` was never run — tables don't exist in Postgres, every query 500s. Run `npm run db:setup` from `apps/api/`.
- [ ] **PostgreSQL + PostGIS running** (`docker compose up -d postgres redis`). API won't boot if DB unreachable; Redis needed for `CacheModule`.
- [ ] **Seed applied.** Without seed data, all endpoints legitimately return `[]`.

### Chain links (verify each is intact)

| Link | File | What to check |
|------|------|---------------|
| **Env → fetcher** | `player-pwa/src/env.mjs:6` + `.env.local` | `NEXT_PUBLIC_API_URL` must resolve to `http://localhost:3001/api/v1` in dev. Default in env.mjs is `https://api.koralink.sa` — a fresh clone without `.env.local` hits a non-existent host. |
| **Fetcher URL** | `player-pwa/src/lib/fetcher.ts:23` | Constructs `${env.NEXT_PUBLIC_API_URL}${path}`. Hooks pass paths like `/matches` (no `/api/v1` prefix — it's in the env URL). Double-prefixing breaks routing. |
| **API prefix** | `apps/api/src/main.ts:45` | `setGlobalPrefix('api/v1')`. Combined with CORS port, full URL = `http://localhost:3001/api/v1/matches`. |
| **CORS** | `apps/api/src/main.ts:28-33` | `origin: [playerUrl, adminUrl]` with `credentials: true`. PWA origin (`http://localhost:3000`) must match `PLAYER_URL` env var exactly. |
| **Auth guard** | `jwt-cookie-auth.guard.ts:16` | ALL data endpoints (matches, wallet, venues, users) are `@UseGuards(JwtCookieAuthGuard)`. **No dev-login bypass exists** — without a valid `access_token` cookie, every data call returns 401. See pitfall below. |
| **Module wiring** | `app.module.ts:55-64` | All feature modules imported. Missing import = 404 on all routes of that module. |
| **Service → DB** | `matches.service.ts`, `wallet.service.ts`, etc. | Raw SQL (`db.execute(sql\`...\`)`) returns `Record<string,unknown>[]` — cast with `as unknown as T[]`. Drizzle relational queries (`db.query.X.findFirst({with:...})`) return nested objects. |
| **Response → adapter** | `player-pwa/src/lib/api-adapter.ts` | Snake_case raw → camelCase `Match`/`Transaction`. `adaptNearbyMatch` handles the flat SQL row; `adaptMatchDetail` handles nested Drizzle relations. |
| **Adapter → hook** | `hooks/useMatches.ts:64-76`, `hooks/useWallet.ts` | Hooks unwrap `{matches: NearbyMatchApi[]}` OR bare array OR `{data: [...]}`. If API returns a different wrapper, hooks silently return `[]`. |
| **Hook → page** | pages under `(main)/` | Pages read `data?.matches ?? []`. If hook errors, page shows error state, not data. |

### Auth-chain pitfall (the most common "no data" cause)

There is **no way to obtain a JWT cookie without completing the SMS OTP flow**: `POST /auth/send-otp` → (OTP logged to console when `UNIFONIC_APP_SID` empty) → `POST /auth/verify-otp`. Seed users have masked phones (`+966****0001`) that fail `@IsPhoneNumber('SA')`, so you cannot log in as a seeded user. **If the task is "data doesn't show", verify the user is actually authenticated first** — check browser cookies for `access_token`, or the API returns 401 on every data endpoint.

### Known broken links (as of 2026-08-09 post-audit)

See `references/data-flow-audit.md` §Known Issues for the full list. Verified/fixed as of Aug 2026:
- ✅ `skill_level` case: both sides use PascalCase — verified correct
- ✅ Venues controller cache interceptor: already removed — verified clean
- ✅ Socket.IO namespace: `/lobby` already in client URL — verified correct
- ✅ Profile wallet balance: uses `useWalletBalance()` API hook — verified correct

Still outstanding:
- No `apps/api/.env` file → API crash on boot (infra setup)
- No Drizzle migrations generated → tables don't exist (infra setup)
- Payment was fake — `POST /wallet/pay` endpoint now exists but needs Moyasar/PayPal integration for production

### Resolution (current)

The adapter layer IS built — `src/lib/api-adapter.ts` transforms snake_case API responses → camelCase domain types (`adaptNearbyMatch`, `adaptMatchList`, `adaptMatchDetail`, `adaptTransactionList`, `adaptWalletBalance`). Pages render from React Query hook data with loading/error/empty states, defaulting to `[]` or `0` on error. **There is no mock-data fallback** — the earlier `src/lib/dummy-data.ts` was removed and no pages import it. See `references/frontend-wiring-patterns.md` for page wiring patterns and `references/data-flow-audit.md` for the full env→fetcher→API→DB connectivity chain and its known broken links.
