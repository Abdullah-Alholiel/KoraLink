# Run #232 — P2-383 Gate 0 Retro (cycle: stable error codes)

**Area audited:** raw-error string-matching survivors after PR #262 (P2-373, business codes) and PR #299 (P2-401, admin localization).

## Recent commits pattern
- `56f6a070` docs #231 · `dacd687d` P2-402 FloatingCta (PR #300) · `3d3e2fe2` P2-401 admin localization (PR #299).
- fix:feat ratio healthy — recent cycles are hardening/premise-stale closures, no reactive fix loop.

## Findings
1. **CRITICAL: none.**
2. **IMPORTANT — EmailSection.tsx:68** still regex-matches raw message (`/409|in use|taken/i`). FetchError (lib/fetcher.ts:12) already exposes `status` + `code`; mailer-users.service.ts:88/:106 already throw `ConflictException('EMAIL_TAKEN')` (stable). Pure client-side debt → **this cycle** (P2-383).
3. **IMPORTANT — disputes.service.ts (admin) 400 prose** ("This dispute has already been decided." :185/:243, "Only decided disputes can be reopened." :393/:437) has no stable code; admin classifier (disputes/[id]/page.tsx:56) compensates with a message regex — escaped the PR #299 sweep. Same class → **this cycle** (Reviewer B run-#232 IMPORTANT-2, parent-verified).
4. **MINOR — FloatingCta z-40 vs nav z-50** (Reviewer A): band sits below nav by design (above-content CTA, nav pinned by shell calc `--floating-cta-bottom`); same rung as the old inline markup + tripwire ALLOWLIST reason. Documented, no change.
5. **MINOR — matches.service.ts:4153 LIKE prefix** on UUID-derived key (Reviewer A): id is system-generated varchar(36), no user input → no escape needed; noted on P2-383 row as verified-safe.
6. Refuted (claims≠facts): Reviewer B's "host page lacks offline handling" — HostMatchForm uses useOnlineStatus + CostFooter offlineNotice (P2-381, PR #282). Home feed HAS a styled empty card.

## Admin state check (item touches apps/admin)
`git status --short apps/admin apps/api/src/modules/admin apps/api/src/modules/mailer` = clean; last admin commits = PR #299/#295/#294 (factory, merged); `koralink-admin.service` active. No owner in-flight work. PROCEED.

## Verdict
PROCEED to Gate 1-3 (compact) → Gate 4 via zeroshot lane 01a21576 (Claude Opus 5.5).
