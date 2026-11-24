# Run #226 — Program Design (Gates 1-3 compact)

Two items, both vertical-slice sized.

## Item 1 — Admin state-consistency batch (P2-399-class small batch)

**Problem:** (a) `apps/admin/src/components/Blocked.tsx` is dead code (zero usage; the
dashboard layout guard at layout.tsx:67-69/:87-90 redirects instead) carrying hardcoded
English — a latent i18n-parity trap. (b) Dashboard loading is a bare text line
(dashboard/page.tsx:46-48) while the shared `LoadingState` (P2-274) is the standard on
audit/venues/[id]/partner.

**Scope:**
- DELETE `apps/admin/src/components/Blocked.tsx`.
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx`: replace the bare loading div with
  `<LoadingState message={t('loadingMetrics')} />` (import from `@/components/LoadingState`),
  mirroring partner/page.tsx:36-42 exactly (PageHeader keeps the title; loading message in
  the subtitle slot is NOT adopted — keep this page's existing title-only header shape).
- NO message-file changes (loadingMetrics key already exists both locales — verified parity
  864=864 this run).

**Gate 3 contract checklist:**
- [x] No API shape changes, no DTO changes, no migration → nothing to verify against backend.
- [x] LoadingState contract: `message: string` prop; built-in `px-8 py-10` (its header comment
  warns appended padding classes cannot override — we pass NO padding classes).
- [x] i18n: zero new keys; `dashboard.loadingMetrics` exists EN+AR (page already renders it).
- [x] Dead-code removal is behavior-neutral: grep proves zero importers.
- [x] Tier: A (docs/tests/deleted-component + one application file, no money/auth/env paths).

**Success criteria:** tsc 0, admin builds, no references to Blocked anywhere, dashboard
renders the spinner pattern under `loading`.

## Item 2 — P2-397 riders (zeroshot lane, Claude-authored)

Per the row: (1) census tripwire regex extension to w-7/h-7 + w-10/h-10 with triage of ~40
existing sites (many non-button or already ≥44px → KNOWN_DEBT or exempt patterns); (2) RTL/LTR
screenshot check of login header + InstallPrompt card folded into scripts/p2-371-layout-audit.cjs;
(3) MatchChat residual physical-margin audit (ml-3 class siblings). Lane writes in an isolated
worktree; parent reconciles + runs REAL gates + PR cycle.
