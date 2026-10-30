# Run #178 — Admin Lane Cycle (Gate 0 Retro + Program Design)

Cycle: 2026-10-30T10:19Z, run #178, layer rotation 178%4 = 2 (Admin console).

## Gate 0 — Retrospective

**DECISIONS.md consulted FIRST (ledger supremacy):** no ledger row contradicts this cycle's
design. The Drawer-RIGHT rule (d0862a7) is untouched by this slice (alerts render inside the
existing drawer body, no layout flip). EN+AR parity rule applies (5 new keys ×2 locales).

### Recent commits audited (admin + API surface)
- `1082a99` P2-267 settlements pay/generate localized alerts — reference implementation for
  the localized-bucket failure pattern (moneyActionFailure + role=alert + seq re-announce).
- `225a079` P2-273 refund input validation (client gate mirrors server DTO).
- `fededb1` P1-29 dispute resolution refunds (wallet credit on resolve; 409 amount-mismatch).
- `87a4807` P2-282 topup verify one-intent-one-payment (this run verified live).
- `82c09b8` P1-38 venue photos SeaweedFS; `6bede5d` P2-47b restore-on-behalf.

### ADMIN STATE CHECK (Phase 3.5 step 0 — PASS)
- `git status --short apps/admin apps/api/src/modules/partner apps/api/src/modules/admin*` → CLEAN (no owner WIP).
- `git log --oneline -12 -- apps/admin` → latest = 1082a99 (run #177's own merge; owner's last
  admin commit was the P2-273 era, PR #196 was PWA-only).
- `systemctl --user is-active koralink-admin.service` → active; BUILD_ID Oct 30 02:33 after restart 02:41.
- Dashboard routes live: audit, dashboard, disputes, matches, partner, pitches, reports,
  settings, settlements, transactions, users, venues.
→ NO ADMIN HOLD. Items against admin are buildable.

### Findings this cycle
- **A-MINOR M1 (→ P2-283, built this run):** disputes/[id]/page.tsx renders RAW backend
  exception text in 4 catch fallbacks (`e instanceof Error ? e.message : t(...)`) — lines
  ~95 (replyError), ~170 (resolve saveError), ~183 (reopen saveError), ~200 (saveEdit
  else-branch). Violates the established localized-bucket pattern (P2-267) and the error
  standard (what happened + why + what next, EN+AR). Same class PR-Agent enforces on money
  pages ("raw backend text never rendered").
- A-MINOR M2: dead parseFloat at :121 (recomputed at :134) — cosmetic, fixed incidentally
  only if zero-risk; otherwise left (behavior correct).
- A-MINOR M3: settlements useEffect redundant dep — cosmetic, NOT touched (different file,
  zero user value).
- Hex lane: api_exc_total 321→323 = run #177's own 87a4807 (2 ConflictExceptions in
  wallet.topup.service.ts:253/348) — ALLOWED baseline class, folded to 323 this run.
- Standing sweep + hex check (Reviewer A): PASS, zero violations.
- Reviewer B: #177 claims CONFIRMED (code + i18n parity 10/10); product gaps → board
  (P2-284 generate scoping, P2-285 settlement void path, P2-286 CSV paid-columns).

### fix:feat ratio
Last 12 admin/API commits: 6 feat / 4 fix / 2 docs — healthy (no reactive fix loop).

## Gates 1-3 (compact — single doc per runbook autonomous mode)

**Problem:** Admin dispute actions (reply, resolve with refund, reopen, edit outcome) fail
with raw English exception strings in the UI. An Arabic-first admin sees untranslated
ConflictException internals; the error standard (2026-09-06, Abdullah) requires
what-happened + why + what-next, localized.

**User story:** As an admin resolving a dispute, when my action fails (session expired,
someone else resolved first, server error), I see a short localized message telling me
exactly what to do next — never a raw exception string.

**Scope:** IN — the 4 catch sites in disputes/[id]/page.tsx, 5 new i18n keys ×2 locales,
bucket classifier mirroring P2-267, seq re-announce pattern. OUT — any API change, any other
page, M2/M3 cosmetic cleanups (documented, not built), admin i18n RTL visual check (owner).

**Architecture delta:** none — file-local helper + copy mapping, exactly the P2-267 shape.
No route/DTO/schema/i18n-namespace changes; keys are siblings of the page's existing keys.

**Exact contract (Gate 3):**
- Type: `type DisputeActionFailure = 'auth' | 'access' | 'conflict' | 'server' | 'network'`.
- Classifier: `disputeActionFailure(err: unknown): DisputeActionFailure` — same mechanism as
  settlements' moneyActionFailure (status-based: 401→auth, 403/404→access, 409→conflict,
  429/5xx→server, else→network).
- Keys (both locales, page namespace): disputeFailedAuth, disputeFailedAccess,
  disputeFailedConflict, disputeFailedServer, disputeFailedNetwork — EN/AR copy pinned in
  the lane input contract (Arabic real script, tone mirrors payFailed* ar.json).
- Behavior: all four catch fallbacks route through the classifier; special branches
  (refundInvalid early-return, isStaleEditError→editStale) byte-identical; alerts keep
  role=alert + gain key={`...-${seq}`} re-announce (saveSeq/replySeq states).

**Gate 3 contract checklist:**
- [x] No API/DTO change → mutation-return contract N/A.
- [x] Frontend types: classifier return union is explicit, not inferred.
- [x] Adapter functions: N/A (no API shape consumed).
- [x] No field silently undefined (pure client-side mapping).
- [x] i18n keys exist for every user-facing string, both languages (verified post-build).

**Vertical slice (Gate 4):** single slice — the whole item is one file + 2 message files +
spec. Gates: admin tsc 0 → parent full turbo build + vitest → PR → CI → squash → live.

## 00-status table

| Gate | Name | Status | Approved | Artifact |
|------|------|--------|----------|----------|
| 0 | Retrospective | ✅ DONE (autonomous) | run #178 | this doc |
| 1 | Product Spec | ✅ DONE (compact) | run #178 | this doc |
| 2 | Architecture | ✅ DONE (compact) | run #178 | this doc |
| 3 | Program Design | ✅ DONE (compact) | run #178 | this doc |
| 4 | Vertical Slices | ⏳ IN PROGRESS | run #178 | lane/run178-p2-283 |
