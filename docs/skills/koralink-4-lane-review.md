---
name: koralink-4-lane-review
description: "4-lane parallel GLM 5.2 review → deepseek fix for KoraLink"
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [koralink, review, multi-agent, deepseek, glm]
    related_skills: [koralink-api-standards, koralink-ui-standards]
---

# KoraLink 4-Lane Post-Dev-Cycle Review

## When to Use

Use this skill after **every KoraLink development cycle** — whenever you've made non-trivial changes across the monorepo (API + PWA). Also use it when the user asks to "review and fix", "find missing implementations", "run the GLM → deepseek workflow", or "audit the full stack".

This replaces the older single-reviewer pattern from `koralink-post-cycle-review`. Always use 4 parallel lanes — Frontend, Backend, Infra & Config, Database.

After every development cycle, run a **4-lane parallel GLM 5.2 review**, then fix all findings with deepseek-v4-pro. Each lane audits a specific layer of the stack.

See AGENTS.md §11 for the full workflow reference.

## Process

### 1. Verify baseline
```bash
npx tsc --noEmit -p apps/api/tsconfig.json   # must be 0 errors
npm run build                                  # must be 2/2 tasks
npx vitest run                                 # must be 85+ tests
```

### 2. Configure for 4 parallel sub-agents
```bash
hermes -p koralink config set delegation.max_concurrent_children 4
hermes -p koralink config set delegation.model glm-5.2
hermes -p koralink config set delegation.provider zai
hermes -p koralink config set delegation.base_url https://api.z.ai/api/coding/paas/v4
```

### 3. Dispatch 4 lanes

Use `delegate_task` with 4 tasks:

| Lane | Scope | What it checks |
|------|-------|---------------|
| **Frontend** | PWA pages, hooks, components, i18n | Mock data, dead buttons, missing i18n, RTL, 5 UX states, Zod alignment |
| **Backend** | NestJS controllers, services, DTOs | Auth guards, withTimestamp, validation, response shapes, missing endpoints |
| **Infra & Config** | Docker, .env, CORS, fetcher, CI | DATABASE_URL, CORS origins, API prefix, cookie config, build pipeline |
| **Database** | Schema, migrations, seed, indexes | FK constraints, GiST indexes, seed validity, N+1 queries, enum alignment |

See `references/4-lane-template.md` for copy-paste dispatch code with exact goals and context.

### 4. Switch back to deepseek BEFORE fixing
```bash
hermes -p koralink config set delegation.model deepseek-v4-pro
hermes -p koralink config set delegation.provider deepseek
hermes -p koralink config set delegation.base_url ''
```

**PITFALL**: If delegation is still GLM 5.2, fix sub-agents run on the wrong model (slow, wrong tooling).

### 5. Fix all CRITICAL + IMPORTANT findings

Batch parallel fixes into one commit. Run build after each batch.

### 6. Final verification
```bash
npx tsc --noEmit -p apps/api/tsconfig.json   # 0 errors
npm run build                                  # 2/2 tasks
npx vitest run                                 # 85+/85+
```

## Common Pitfalls

### Pitfall: Hydration mismatch from useState with browser APIs
`useState` initializers that read `navigator`, `window`, `Date.now()`, or locale-specific formatting cause SSR/client HTML mismatch → hydration error crash.

**Fix**: Default to SSR-safe value, sync real value in `useEffect`:
```typescript
// ❌ BROKEN
const [isOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

// ✅ FIXED
const [isOnline] = useState(true);
useEffect(() => { setIsOnline(navigator.onLine); }, []);
```

### Pitfall: CacheInterceptor cross-user data leak
NestJS `@CacheInterceptor` with default key ignores query params. Different users with different `lat`/`lng` get identical cached results. Remove the interceptor from any endpoint with user-varying query params.

### Pitfall: Seed phone numbers failing class-validator
`@IsPhoneNumber('SA')` rejects masked numbers like `+966****0001`. Use valid format: `+966500000001`.

### Pitfall: Seed dates expiring
Hardcoded future dates (e.g. `2026-08-14`) silently expire. Use dynamic dates anchored to `new Date()`:
```typescript
const now = new Date();
const days = (n: number) => new Date(now.getTime() + n * 86400000);
scheduled_at: fmtDate(days(5), '20:00')
```

## Dev-Login Pattern

For local development without SMS OTP:

**Backend** (`POST /auth/dev-login`):
1. Look up seeded user by phone
2. Issue JWT directly (skip OTP)
3. Set HttpOnly `access_token` cookie
4. Block in production (`NODE_ENV === 'production'`)

**Frontend** (`DevLoginBar` component):
1. Only render on `localhost`
2. Show one button per seeded user
3. `POST /auth/dev-login` with `credentials: 'include'`
4. `window.location.reload()` so cookie is picked up

## Reviewer output location

```
~/.hermes/profiles/koralink/cache/delegation/subagent-summary-*.txt
```

Read directly if `delegate_task` result is truncated (95-char cap on summary field).
