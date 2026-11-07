# Run #159 — Gate 0 Retrospective (cycle: run159-p2-247)

Date: 2026-10-23T15:2xZ · Lane: DB & Infra (159 % 4 = 3) · Base: 9ffbf2d (staging)

## DECISIONS.md check (supremacy)
Read first. No design/UX change in this cycle contradicts the ledger:
- Admin Drawer stays RIGHT (untouched).
- P0-2 wallet top-up stays dummy/prod-gated — this cycle does NOT touch money paths; the
  re-drive closure below explicitly defers to P0-2.
- EN+AR parity, DataTable/RecordDrawer standards: untouched (no admin UI change this run).

## Admin state check (mandatory — pick was admin-adjacent)
- `git status --short apps/admin apps/api/src/modules/partner apps/api/src/modules/admin*` → CLEAN.
- Last admin commits: ca0601b (P2-C/P2-D), d48c370, 23a0ad5 — nothing in-flight.
- koralink-admin.service active; routes verified live (settlements/ present).
→ No ADMIN HOLD. P2-247's admin half re-scoped against live code (see below).

## Recent-commit audit (last 8)
74be346 (P2-244 money unification), 843a351 (P1-66 push UX), docs/graphify tail.
fix:feat ratio healthy; no contract breaks found by Reviewer A (0 CRITICAL).

## Findings this Gate 0 (evidence-cited)
1. **P2-247 premise split** (parent code read):
   - Admin settlements re-drive: `pay()` is pending-guarded + TOCTOU-safe
     (settlements.service.ts:93-115); DB probe shows **0 rows with status='failed'**
     (1 pending, 1 paid) and NOTHING in apps/api writes 'failed' — the enum value has no
     producer. A retry surface would be dead code; its producer arrives with the P0-2
     payout-execution path. → CLOSED verified-no-build, anchor recorded on the row.
   - PWA `components/ui/` holds only `.gitkeep`; clubs page hand-rolls Error/Empty inline
     (~:300-400) exactly per UI-standards §6 → the shared-component half is REAL and buildable.
2. **Reviewer A IMPORTANTs** (verified in code by parent):
   - `partner.service.ts:1237` createPayoutSlot returns bare `.returning()` row AND its
     `catch {}` swallows ALL tx errors into 409 (unique-violation was the only intended map).
   - Migration 0053 added `settlements.requested_by` FK with NO index; partner.service.ts:818
     LEFT JOINs users on it per earnings read.
   - Admin settlements list (:49-80) doesn't surface requested_by provenance (P2-C half-wired).
   → pickup-lane rows P2-249/P2-250 (consolidate-never-preemptive convention).
3. **Reviewer B findings**: wallet withdraw = dead-end stub (wallet/page.tsx:271 comingSoon;
   no player withdraw endpoint) — real, but money-path → folded into P0-2 row as enrichment,
   not a new P1 (P0-2 decision owns it). Topup "disabled-vs-failed conflation" claim REFUTED
   by parent code read (wallet/page.tsx:184-196 branches 403 → topupDisabled, else →
   errors.walletTopupFailed; key exists EN+AR).

## Sentry/log triage (Phase 1.6)
- 1C Neon-quota class: 29 events/24h, lastSeen 15:00Z (13 min before run start) — LIVE,
  owner escalation unchanged (Neon billing). 1F (5) already reclassified into the 1C class.
- All other signatures stale (CORS-B last 10-13, web-6 last 10-12, favorites cluster 10-07).
- journalctl err: zero entries 5h across all three services.

## Decision
Proceed to Gates 1-3 for the P2-247 PWA shared-states slice via the Claude Pro zeroshot lane
(preconditions verified: pro auth, zeroshot 10.7.0, item PWA-only, no live DB). Parent
reconciles the lane diff and runs the REAL gates.
