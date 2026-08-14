---
name: koralink-review-workflow
description: "Post-dev-cycle: 1 GLM reviewer → 4 deepseek fixers. GLM slow → self-review fallback."
version: 1.0.0
---

# KoraLink Review Workflow

After every dev cycle: **1 sequential GLM 5.2 reviewer** (comprehensive), then **4 deepseek-v4-pro fix agents** in parallel. If GLM is too slow or fails, fall back to deepseek-v4-pro self-review.

## When to Use

After ANY multi-file change cycle in the KoraLink monorepo.

## Process

### 1. Verify baseline

```bash
npx tsc --noEmit -p apps/api/tsconfig.json
npm run build
npx vitest run -C apps/player-pwa
```

All three must be green before dispatching reviewers.

### 2. Switch delegation to GLM 5.2 for the review

```bash
hermes -p koralink config set delegation.model glm-5.2
hermes -p koralink config set delegation.provider zai
hermes -p koralink config set delegation.base_url https://api.z.ai/api/coding/paas/v4
```

### 3. Dispatch ONE comprehensive GLM reviewer (NOT 4 parallel lanes)

Use `delegate_task` with a single `goal`. The reviewer must audit ALL four layers in one pass:

| Layer | Key responsibility |
|-------|-------------------|
| **Frontend** | Hooks, pages, forms, i18n, mock removal, Zod schemas, React Query, hydration, 5 UX states |
| **Backend** | Controllers, services, DTOs, guards, error handling, withTimestamp, idempotency, cache keys |
| **Infra/Config** | `.env`, docker, CORS, API prefix, module wiring, auth chain, migrations, dev-login |
| **Database** | Schema correctness, seed validity, GiST indexes, FK constraints, enum alignment, seed phones |

The reviewer's `context` must include:
- Project path and stack details
- Key files to inspect (all four layers)
- Standards to check against (AGENTS.md, koralink-api-standards, koralink-ui-standards)
- Output format: CRITICAL (file:line) / IMPORTANT / MINOR grouped by layer

**PITFALL — GLM subagent slowness**: GLM 5.2 via z.ai is thorough but very slow (5+ minutes, sometimes stalls). Do NOT wait idly — proceed in parallel:
- If the GLM review hasn't returned within 2 minutes, the parent agent should do its own self-review (as deepseek-v4-pro) and dispatch fix agents immediately. When the GLM review eventually arrives, treat it as a supplementary second pass.
- Do NOT use `deepseek-v4-flash` as a delegation model — it returns HTTP 401 (token expired or incorrect) for delegation. The fallback is the parent doing self-review on deepseek-v4-pro.
- See `references/subagent-model-behavior.md` for detailed subagent model quirks.

### 4. Switch delegation BACK to deepseek-v4-pro

```bash
hermes -p koralink config set delegation.model deepseek-v4-pro
hermes -p koralink config set delegation.provider deepseek
hermes -p koralink config set delegation.base_url ''
```

**MUST switch back BEFORE dispatching fix sub-agents.** If delegation is still on GLM, fix agents run on the wrong model.

### 5. Dispatch 4 deepseek-v4-pro fix agents in parallel

One agent per layer: Frontend, Backend, Infra & Config, Database. Each gets:
- The specific issues from their layer to fix
- Exact file paths and line numbers
- Verification commands to run after fixing

### 6. Fix all CRITICAL + IMPORTANT issues

If issues remain after the first round, dispatch a second round. Prioritize:
1. Build-breaking / test-breaking issues
2. Data integrity / security issues
3. Runtime blockers (env, migrations, auth)
4. UX breaks (mock data, hardcoded values, hydration)

### 7. Final verification

```bash
npx tsc --noEmit -p apps/api/tsconfig.json   # 0 errors
npm run build                                  # 2/2 tasks
npx vitest run -C apps/player-pwa              # 85+/85+ tests
```

## Reviewer output location

Sub-agent summaries are truncated to 95 chars in the delegate_task result. Read the full reports from:

```
/home/ubuntu/.hermes/profiles/koralink/cache/delegation/subagent-summary-*-*.txt
```

## Known Pitfalls

### "No data shows in PWA" — the 3 root causes

After every major change cycle, verify these 3 infra blocks are resolved:

1. **No `.env` file** → API crashes on boot (`getOrThrow('DATABASE_URL')` throws). Fix: `cp apps/api/.env.example apps/api/.env`.
2. **No Drizzle migrations** → tables don't exist in Postgres, every query 500s. Fix: `cd apps/api && npm run db:generate && npm run db:migrate`.
3. **No auth cookie** → all data endpoints are `@UseGuards(JwtCookieAuthGuard)`, returning 401. Fix: use the `POST /auth/dev-login` endpoint or the DevLoginBar component on the login page.

### Common bugs found in reviews

- **`mapGender()` substring bug**: `"women only".includes("men")` is `true` — check `"women"` before `"men"`.
- **`createMatch` missing `location`**: Inherit venue location via pitch→venue join.
- **Cache key not varying by query params**: Remove `@UseInterceptors(CacheInterceptor)` from endpoints with per-user query params (matches, venues).
- **Idempotency check outside transaction**: TOCTOU race — move inside `db.transaction()`.
- **`skill_level` case mismatch**: PWA sends lowercase, API expects PascalCase. Fix in `useAuth.ts`.
- **WebSocket wrong namespace**: Client connects to `/socket.io`, gateway is at `/lobby`. Append namespace to connection URL.
- **Hydration mismatch from `useState(navigator.onLine)`**: Default to `true` for SSR, sync in `useEffect`.

### DTO enum typing

DTO fields that map to DB enums MUST narrow TypeScript types to the union, not `string`:

```typescript
// ❌ Forces as Record<string, unknown> casts
@IsEnum(['Beginner', 'Intermediate', 'Advanced'])
skill_level?: string;

// ✅ Satisfies Drizzle column type directly
@IsEnum(['Beginner', 'Intermediate', 'Advanced'])
skill_level?: 'Beginner' | 'Intermediate' | 'Advanced';
```

### Dev-login pattern

For development, the `POST /auth/dev-login` endpoint sets an HttpOnly cookie for any seeded user by phone. The PWA `DevLoginBar` component on the login page provides one-click login — it only renders when `window.location.hostname === 'localhost'`.

## Related skills

- `koralink-post-cycle-review` — baseline workflow (user-owned, needs `hermes curator adopt` to enable autonomous updates)
- `koralink-api-standards` — backend conventions, data-flow audit checklist
- `koralink-ui-standards` — frontend conventions, 5 UX states, component patterns

## Reference files

- `references/subagent-model-behavior.md` — GLM vs deepseek subagent quirks, delegation config, fix agent dispatch pattern
