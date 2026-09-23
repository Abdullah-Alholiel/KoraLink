# Run #66 — Retro & Cycle: run-#65 review fixes + reviewer follow-ups

## Gate 0 — Retro (2026-09-21)

Baseline: staging `d9d1a8f` (run #65: 8b510fb push-unsubscribe POST, 7e364a8 push locale
re-sync, 3d1840d chat keyset pagination).

Reviewers (glm-5.3-flash ×2, parallel, clean — 9th consecutive zai run): 0 CRITICAL,
3 IMPORTANT on run #65's code, all independently confirmed by parent self-review:

| # | Finding | Evidence | Class |
|---|---------|----------|-------|
| 1 | `@IsUrl({ require_tld: true })` does NOT enforce https — validator.js default allows http/ftp; scope expectation (dto doc comment: "defense-in-depth") oversold | `notifications.dto.ts:13` | IMPORTANT (contract gap; send-path allowlist mitigates) |
| 2 | before-cursor page orders by `created_at` only while the keyset predicate is composite `(created_at, id)` → nondeterministic tie order at page boundaries (skip/dup across loadOlder) | `matches.service.ts:2277` vs predicate `:2269-2275` | IMPORTANT (data correctness) |
| 3 | `hasMore` derives only from the initial 51-probe; a short older page never clears it → "Load earlier" button forever + terminal refetch per tap | `useMessages.ts:139`, `:142-167` | IMPORTANT (UX bug) |

Minors (noted on board rows, no separate items): DELETE-route sunset has no metric;
marker can go stale vs a re-created subscription (edge, self-heals); ChatSheet
auto-scroll dep-array computed expression (lint-hostile, works).

Admin lane: ADMIN HOLD continues (projects-dir merge conflict live: 2 markers in
`apps/api/src/modules/admin/users.service.ts`, 2 in projects `kanban/BOARD.md`, plus
Abdullah's staged Dockerfile/package/users-page edits) → P2-79/P2-12 untouched this run.
Deploy-target fork still open (units serve the projects dir; staging-only commits need
Abdullah's merge go).

## Gates 1–3 (compact — full contracts in 01-program-design.md)

Fix scope = exactly the 3 IMPORTANTs. No schema/API-shape changes: responses stay
byte-compatible (bare array, same fields). New tests pin each contract.

Verification checklist (Gate 3):
- [x] DTO change rejects http:// endpoints; valid https push endpoints still pass
- [x] orderBy change touches ONLY the two getMessages windows (line :1343 feed-time
      order is a different read path — untouched)
- [x] hasMore=false only after a SHORT older page (full page keeps it true — existing
      test :138 pins that)
- [x] i18n: no new user-facing strings (button text `chatSheet.loadOlder` exists EN+AR)
