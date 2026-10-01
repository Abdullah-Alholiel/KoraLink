# Run #92 — Gate 0 Retrospective: P2-132 (feed + conversation-list staleness)

**Lane rotation:** run# 92 % 4 = 0 → PWA screens · **Strix:** already done this window (run #91, `strix_scan=2026-10-01 findings=0`) · **Admin state check:** item touches ONLY `apps/player-pwa` — no admin surface involvement; `git status` clean tree at `a29cc77`.

## Area audit (what the reviewers found)

**Reviewer A (code quality, zai glm-5.3-flash, 112s, clean):**
- `useDiscussions` (messages list) has NO socket/interval freshness path: `useMessages.ts:78-113` — list only refreshes on manual pull or unmount invalidation (`useMessages.ts:390`).
- `useConversations` list (`useConversations.ts:130-142`, `['conversations','infinite']`) goes stale for closed threads: `new-dm` only subscribed inside the thread hook (`useConversations.ts:348-351`).
- Feed infinite query (useMatches.ts:104-142) rides global 60s staleTime + `refetchOnWindowFocus:false` (`QueryProvider.tsx:16`), no socket invalidation while on the Play screen.
- Standing sweeps ALL CLEAN: `::uuid` casts, `eq(col,null)`, `console.*` in API, hydration render-path hazards, bottom-sheet z-index, i18n parity (1007/1007 re-verified by parent).
- Reviewer B P1 "match-detail goes stale" **REFUTED**: status/roster/pom listeners ARE present (`useMatches.ts:193-195`); Reviewer B checked the page component, not the hook's effect wiring.

**Reviewer B (verification + product gaps, zai glm-5.3-flash, 95s, clean):**
- Run #91 claims ALL VERIFIED (PR #56 MERGED @906b137; banner hydration-safe; 5-case test; 2030 fixture).
- New P2-class finding adopted into this slice: play feed renders `OfflineBanner variant="plain"` for ANY fetch error (`play/page.tsx:300-301`) — no `useOnlineStatus`, inconsistent with match-detail (`match/[id]/page.tsx:234`) and messages (`messages/page.tsx:143`).

## Server-truth findings (parent, Gate 0 direct reads)

- `roster-update`/`status-update`/`pom-decided` broadcast ONLY into `match:${id}` rooms (`app.gateway.ts:713,734`); `new-dm` ONLY into `conv:${id}` (`app.gateway.ts:691`). **No global feed/list event exists** → socket invalidation of the feed would require a server broadcast change (out of slice).
- `join-conversation` has a **markRead side effect** (`app.gateway.ts:583-584`: `markRead` inside the handler). Joining conv rooms from the LIST screen would silently mark conversations read → **the board's socket candidate (option 2) is rejected on correctness grounds.** The board's third candidate (low-frequency refetchInterval mirroring admin's use-live-data 30s poll) is the blessed fix.
- React Query v5 refetches ALL pages of an infinite query — the F4 comment (`useMatches.ts:179-181`, "up to 10×50") is in-repo evidence this fan-out is real and deliberately avoided → the poll must be **page-1-only** (disable once the user has paged deeper).

## Fix:feat ratio / debt

Last 15 commits: mix of docs/kanban + feature PRs via lanes; no reactive fix loop. This slice is a UX-correctness fix (stale data) + consistency fix (offline state) — no new debt introduced; the page-1 poll helper is shared by all three hooks.

## Recommendation
Proceed to Gates 1-3 (single compact doc) → Gate 4 build via zeroshot lane (preconditions ALL true: Claude Pro auth ✓, zeroshot 10.7.0 ✓, PWA-only vertical slice, no live-DB dependency).
