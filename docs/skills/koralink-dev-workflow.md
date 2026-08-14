---
name: koralink-dev-workflow
description: "KoraLink: review workflow, hydration safety, infra blockers."
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [koralink, dev-workflow, hydration, review, infrastructure]
    related_skills: [koralink-api-standards, koralink-ui-standards, koralink-post-cycle-review]
---

# KoraLink Dev Workflow — Cross-Cutting Patterns

Design-system, API, and review skills hold standards for their domains. This skill captures patterns that span the full stack: the review workflow, SSR hydration, and infrastructure setup. Load alongside `koralink-api-standards` and `koralink-ui-standards`.

## When to Use

Load this skill when:
- Running a post-dev-cycle review (the 3-agent parallel audit workflow)
- Diagnosing "no data shows in the PWA" despite builds/tests passing (infrastructure checklist)
- Fixing "Hydration failed" errors in Next.js Client Components
- Migrating pages from mock data to live API data
- Any task that spans both `apps/api` and `apps/player-pwa` (cross-stack patterns)

See `references/data-flow-audit.md` for the full connectivity chain debug recipe.

---

## 1. Post-Cycle Review — Parallel 4-Agent Functional Audit

After every dev cycle, dispatch **4 GLM 5.2 sub-agents in parallel** (the user explicitly requires 4 lanes: frontend, backend, infra/config, database). Set `delegation.max_concurrent_children=4` (`hermes -p koralink config set delegation.max_concurrent_children 4`) before dispatching:

| Agent | Scope | Key Goal |
|-------|-------|----------|
| **Agent 1 — Frontend** | PWA pages, hooks, components, i18n | Wallet (hook gaps, dead buttons), Profile (sign-out, edit, stale balance), Host Match (dead UI, Zod validation, eslint), Messages (i18n time labels, socket reuse). Rate every gap. |
| **Agent 2 — Backend** | NestJS controllers, services, DTOs, guards | Venues cache bug, OTP store → Redis, wallet endpoints, auth dev-login, module registration, Swagger coverage |
| **Agent 3 — Infra & Config** | Env, Docker, CORS, build, bootstrap | Env defaults, compose healthchecks/platform, CORS origins, dev-login flow, build pipeline, dev-bootstrap idempotency |
| **Agent 4 — Database** | Schema, migrations, seed, indexes | Migrations journal integrity, enum alignment (form options vs DB enums), seed dynamic dates, GiST indexes applied, FK consistency |

Each agent: reads relevant files, runs `tsc --noEmit` + `npm run build` + `npx vitest run` as part of audit. Outputs Critical/Important/Minor with exact file:line references.

**Pre-dispatch**: switch delegation to GLM 5.2. **Post-review**: switch back to deepseek BEFORE dispatching fix agents. Fixes run on deepseek, never GLM.

## 2. Infrastructure Blocker Checklist

These three account for 90% of "no data shows" cycles. Check BEFORE diving into component logic:

- [ ] **`apps/api/.env` exists** — `ConfigModule.forRoot()` loads `.env`. Without it, `DATABASE_URL` unset → `database.module.ts` `getOrThrow()` crashes API on boot.
- [ ] **Drizzle migrations generated + applied** — `apps/api/drizzle/meta/_journal.json` must exist. If absent, tables don't exist. Run `npm run db:setup` from `apps/api/`.
- [ ] **Dev-auth path exists** — all data endpoints guarded by `JwtCookieAuthGuard`. No auth cookie = 401 on everything. `POST /auth/dev-login` (prod-blocked) issues a JWT for seeded users by phone.

## 3. SSR Hydration Safety (Next.js App Router)

Client Components render on BOTH server and client. Any `useState` initializer reading browser APIs produces different HTML → "Hydration failed" errors → React abandons the server tree → data flow breaks.

### The Pattern

```typescript
// ✅ SSR-safe: always default to a server-compatible value, sync in useEffect
const [isOnline, setIsOnline] = useState(true);
useEffect(() => {
  setIsOnline(navigator.onLine);  // client-only
  // ...add event listeners in useEffect, not during render
}, []);
```

```typescript
// ❌ Broken: different value on server vs client
const [isOnline, setIsOnline] = useState(
  typeof navigator !== 'undefined' ? navigator.onLine : true
);
```

### Common Browser APIs That Cause Hydration Mismatches

| API | SSR-Safe Default | Sync In useEffect |
|-----|-----------------|-------------------|
| `navigator.onLine` | `true` | `setIsOnline(navigator.onLine)` |
| `window.innerWidth` | `1024` | `setWidth(window.innerWidth)` |
| `localStorage.getItem()` | `null` / default | `setValue(localStorage.getItem(...))` |
| `matchMedia(...)` | `false` | `setDark(mq.matches)` |
| `Date.now()` / `Math.random()` | fixed seed / `useId()` | Never in render |

## 4. Mock Data Removal Pattern

When migrating a page from static mock to live API:

1. Remove `const mockXxx = [...]` arrays from the component
2. Wire the API hook (`useQuery` / `useMutation`)
3. Handle all 5 UX states from hook output — NOT from mock fallbacks
4. `?? []` / `?? 0` is the correct default; never keep mock arrays as real data
5. Remove unused imports after mock removal
6. Delete `dummy-data.ts` if no pages import it
7. Run `npm run build` to verify no unused-variable lint errors

## 5. Common Pitfalls Discovered (see also koralink-api-standards §16)

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| `pitch_id: 'demo-venue-001'` hardcoded in form | All match creation returns 404 | Add venue picker with useVenues hook |
| `href="/host"` missing locale prefix | 404 in Arabic mode | Use `/${locale}/host` |
| Socket.IO connects but shows "Offline" — token not sent | Cross-origin WebSocket (e.g., localhost → Tailscale IP): `withCredentials: true` sends cookies, but SameSite=Lax blocks them. Socket handshake gets no auth token → gateway disconnects silently. ChatSheet shows "Offline" permanently despite server being up. | Send the stored JWT via `auth` option: `io(url, { auth: { token: localStorage.getItem('koralink_token') } })`. The gateway's `handleConnection` already checks `handshake.auth.token` first, cookie second. Reconnection attempts (5) with exponential backoff. See `koralink-software-factory/references/websocket-auth-pattern.md` for full pattern. |
| Socket.IO connects to wrong namespace | Real-time chat never works | Connect to `/lobby` namespace, set `withCredentials: true` |
| `skill_level` sent lowercase to PascalCase enum | Complete-profile rejected (400) | `.charAt(0).toUpperCase() + .slice(1)` |
| `console.log` in gateway / service | AGENTS.md §6 violation | NestJS `Logger` |
| Wallet balance read from Zustand (always 0) | Profile shows SAR 0.00 | Call `useWalletBalance()` hook |
| `mapGender()` substring bug: 'women only'.includes('men') is true | Women's matches display as men's | Check 'women' before 'men' |
| Cache interceptor with default key on param-varying endpoint | Cross-user cached results | Remove interceptor or add custom `@CacheKey()` |
| SameSite=Lax cookie never sent cross-site (PWA localhost → API Tailscale IP) | dev-login "succeeds" but EVERY API call 401 | Dual extraction: strategy accepts `Authorization: Bearer` first, cookie fallback; fetcher sends stored token; CORS allows `Authorization` header (see koralink-runtime-pitfalls §3b) |
| PostGIS migration fails: `type "geography(Point, 4326)" does not exist` even after `CREATE EXTENSION` | Extension can't run inside drizzle-kit's transaction; and generated SQL quotes the type name | `db:enable-postgis` step before `db:migrate`; unquote `geography(Point, 4326)` in generated migration (see drizzle-postgis-setup) |
| Turbo cache serves stale failure despite working-tree fix | `npm run build` fails on already-fixed code; `git status` shows file modified | `npx turbo run build --force` to bypass cache; commit fix before rebuild |
| `(main)` routes have no auth guard | Unauthenticated users reach `/profile`, `/wallet` — see empty states instead of redirect to `/login` | Add auth redirect in `(main)/layout.tsx` or middleware; check `selectIsAuth` / cookie before rendering |
| Lint gate (`--max-warnings 0`) fails on test files | Unused imports in tests (`beforeEach`, `act`, `userEvent`, `_wrapper`) + `@typescript-eslint/no-explicit-any` | Fix imports or add `eslint-disable` for test-only files; lint gate must pass for CI |
| Dead UI: MenuItem/button with no onClick or href | Feature appears in the UI but does nothing when tapped | Check profile menu items, settings rows, navigation buttons — every interactive element MUST have a handler. Use `grep -rn "<MenuItem" src/ -A5 | grep -v "onClick\|href"` to find dead elements |
| Verify OTP never calls `login()` for returning users | After OTP verify, `user` is null → `isJoined` always false, `isAuthenticated` false, stats hidden, join button shows for already-joined users | In `verify/page.tsx` onSuccess: fetch `/users/me` + `useAppStore.getState().login(...)` before navigating. See `koralink-runtime-pitfalls` §10 for full details |
