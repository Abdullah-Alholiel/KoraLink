---
name: koralink-post-cycle-review
description: "Post-dev-cycle: review with GLM 5.2, fix with deepseek."
version: 1.0.0
---

# KoraLink Post-Dev-Cycle Review

After every dev cycle, run a GLM 5.2 sub-agent for code review, then fix with deepseek-v4-pro.

## Process

### 1. Verify baseline
```bash
npx tsc --noEmit -p apps/api/tsconfig.json
npx vitest run
npx turbo run build
```

### 2. Switch delegation to GLM 5.2
```bash
hermes -p koralink config set delegation.model glm-5.2
hermes -p koralink config set delegation.provider zai
hermes -p koralink config set delegation.base_url https://api.z.ai/api/coding/paas/v4
```

### 3. Dispatch reviewer
Check ALL changed files against:
- koralink-api-standards (controller conventions, withTimestamp, error handling)
- koralink-ui-standards (colors, components, RTL, 5 UX states, i18n)
- AGENTS.md binding standards
- Security: auth guards, no secrets, input validation
- Type safety: no 'any', Zod matches backend DTOs
- Performance: N+1 queries, missing indexes

Output: Critical / Important / Minor with file paths + line numbers.

### 4. Switch back to deepseek
```bash
hermes -p koralink config set delegation.model deepseek-v4-pro
hermes -p koralink config set delegation.provider deepseek
hermes -p koralink config set delegation.base_url ''
```

### 5. Fix Critical + Important issues

**PITFALL**: Switch delegation BACK to deepseek-v4-pro BEFORE dispatching any fix sub-agents. If delegation is still set to GLM 5.2, fix sub-agents will run on the reviewer model (slow, wrong tooling). Always run step 4 (switch back) before step 5.

### 6. Final build + tests

Verify with the canonical commands:
```bash
npx tsc --noEmit -p apps/api/tsconfig.json   # must be 0 errors
npm run build                                  # must be 2/2 tasks
npx vitest run                                 # must be 85+/85+ tests
```

### Reviewer output location

The sub-agent's full review is stored at:
```
/home/ubuntu/.hermes/profiles/koralink/cache/delegation/subagent-summary-0-*.txt
```
Read this file directly if the delegate_task result is truncated in the summary field (95-char cap).
