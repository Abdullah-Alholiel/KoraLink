# Run #85 — Partner ownership-scope hardening (P2-12 + Reviewer-A findings)

## Gate 0 — Retrospective

**Baseline:** staging @ f8c75063 (run #84 merged: PR #47 purge fixes, PR #48 wallet CSV export).

**Recent partner-module commits (fix:feat ratio healthy — 5 fixes : 1 feat in last 8):**
- `beedc2f` P2-120 deletePitch owner-scope in tx (#45)
- `5c041fd` P2-115 settings validation + audit (#44)
- `a0775f4` P2-118 lock-discipline batch — incl. partner scoped UPDATEs (#42)
- `7a99711` P2-105 deletePitch TOCTOU row lock (#35)

**Pattern observed:** the last 3 security runs each found ONE more check-then-act /
scope-paste residue in `partner.service.ts` and fixed it in isolation. The root cause —
the Admin-bypass scope predicate `actorRole === 'Admin' ? sql\`true\` : eq(venues.owner_id, …)`
hand-copied at 7+ sites — keeps regenerating holes at whatever site the last fix didn't touch.
Run #85 treats the CLASS, not another instance: consolidate the scope helper + port the
established tx/scoped-write pattern (updatePitch/deletePitch) to the 3 remaining unguarded writes.

**Run #84 claims:** ALL VERIFIED-TRUE by Reviewer B (deleg_1a9e675b task-1): 11/11 sub-claims
+ export-flow E2E coherence. P2-119 → DONE ✅ this run. Reviewer B's "P0 no booking endpoint"
candidate REFUTED by parent (booking exists via host match-create flow; matches.service.ts
slot booking locks FOR UPDATE at :2053-2123).

**Reviewer A security-lens findings (deleg_1a9e675b task-0) — the build targets:**
1. **IMPORTANT** `createSlot` (:825-876) + `generateSlots` (:713+): assert-then-unscoped-INSERT.
   Ownership transfer between assert and insert lets a FORMER owner mint slots.
2. **IMPORTANT** `deleteSlot` (:887-922): `is_booked` TOCTOU closed (P1-18) but ownership lives
   only in the pre-check → former owner can delete an unbooked slot post-transfer.
3. **IMPORTANT** `submitVerification` (:618-651): scoped SELECT then UNQUALIFIED upsert on
   venue_verifications → a non-owner could overwrite venue IBAN/tax_id verification data.
4. **P2-12 (the board row)**: scope ternary pasted at :74/:84/:116/:241/:431/:975/:984 —
   inconsistent shape, drift-prone. Consolidate.

**MINORs (documented, NOT built):** getVerification lacks Admin bypass (:604, stricter-than-
needed, behavior change → follow-up); getPartnerMatch roster raw phones to venue owners (PDPL
data-minimization → product decision, noted on board); updatePitch findOne read unscoped (benign);
mark-read.dto ids bare @IsString (different module, queued as backlog line).

**Standing sweeps (Reviewer A):** 0 `::uuid` · 0 `eq(col,null)` · 0 console.* · FOR UPDATE
present on all money/roster/booking txs · wallet ledger in-tx idempotency correct.

## Gates 1–3 — compact program design

**Problem (user story):** As a venue owner whose venue was transferred (or re-possessed by
admin action), I must not retain write access to the old venue's slots and verification data;
as the product, partner write endpoints must derive authorization from the SAME server-side
scope predicate at write time, not from a stale pre-check.

**Scope:**
- IN: partner.service.ts — createSlot, generateSlots, deleteSlot, submitVerification gain
  in-tx owner-scoped guards (non-Admin); scope-predicate consolidation into one helper;
  jest specs for transfer-race + admin-bypass + happy paths per method.
- OUT: admin module, PWA, schema/migrations (ZERO contract delta — error shapes only reuse
  existing 403/404), getVerification Admin bypass (documented follow-up), phone masking
  (product decision), mark-read.dto (backlog).

**Architecture delta:** none structural — extends the P2-118/P2-120 house pattern:
one tx per mutating op; scoped SELECT … FOR UPDATE (owner-scoped subquery on venues for
non-Admins) before the write; Admin bypass = unscoped select; affected-row check → 404.
P2-12: extract `pitchOwnerScope(actorId, actorRole)` (SQL predicate builder) used by the
write paths; reads keep their existing consistent ternary (documented, not churned).

**Contracts (Gate 3 checklist):**
- [x] Zero API response-shape changes — mutations keep current returns
      (createSlot slot row, deleteSlot {deleted:true}-shape preserved, submitVerification
      getVerification() list, generateSlots {created,skipped}).
- [x] Error mapping unchanged for existing clients: non-owner → 403 (assert stays for the
      fast path); owner-lost-mid-flight → 404 (clean 404 convention, same as deletePitch).
- [x] No i18n keys (API-only; messages reuse existing strings).
- [x] No new DTO fields.
- [x] Frontend hooks untouched — zero adapter/hook surface.

**Verification plan (lane-internal):** `npx tsc --noEmit` (apps/api) →
`npx jest src/modules/partner --silent` → `npx turbo run build --concurrency=1` (api filter ok).
Parent re-runs full gates on the merged tree (turbo 3/3 + vitest + api jest + tsc ×2)
before push, per factory hard gate.
