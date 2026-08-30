# Run #19 — Gate 0 Retrospective (15:16Z, Aug 30 2026)

## Scope audit (areas this cycle touches)
1. **Drizzle migrations chain** (P1-33): journal has 26 entries (0000–0025); disk has 27 .sql files.
   `0014_admin_notification_verbs.sql` (hand-written, adds 4 ActivityVerb values) is on disk but NOT
   journaled — two `0014_*` files exist, journal has only `0014_mean_franklin_storm`. Live DB verified:
   all 8 needed enum values PRESENT (applied out-of-band run #14). Fresh envs would break
   dispute-resolve/refund/admin-cancel inserts. Root cause: run #14 reconciled live data out-of-band
   without reconciling the journal.
2. **partner.service getPartnerMatches statusFilter** (P1-34): defaults `sql\`true\`` — "upcoming"
   scope lists never-playable Cancelled matches (live probe: 2 Cancelled rows as upcoming).
   The DTO comment documents all-statuses default as deliberate for the *today recap* view; that
   rationale doesn't extend to *upcoming*. Fix must stay additive (never short-circuit other predicates).
3. **PWA clubs route** (P1-32): `(main)/clubs/` is a flat list, no `[id]` route; API `GET /venues/:id`
   exists (venues.service.ts:142). Render-only feature page.

## Recent commit pattern (last 20)
Run #18's six commits all re-verified sound (both reviewers + parent): 0 CRITICAL across A/B.
fix:feat ratio healthy — run #18 was 2 fix + 2 feat + 1 docs; no reactive loop.

## Standing bug-class sweep (Reviewer A, parent-checked)
`::uuid` casts 0 · `eq(col,null)` 0 · console.* in API 0 · FK indexes 39/39 · WS guards all enforced ·
i18n parity PWA 677/677, Admin 239/239 · migrations 0023–0025 single-commit, never edited post-apply.
Flagged-but-documented (not defects): PomConfirmModal z-[80]/z-[90] (documented modal tier),
foreign pitchId silent-ignore (documented run-#18 design → P2-32).

## Refuted / no-action
- Reviewer A systemd finding: unit verified (user unit, loads apps/api/.env) — sandbox limitation, not a defect.
- Sentry/journal: zero new error signatures in 5h/24h windows.

## Tech debt carried
P2-5 bare mutations, P2-4 float money sums, CSP unsafe-eval, P2-31 minors — unchanged, queued.

**Verdict: proceed to Gate 1.** Three build items: P1-33 (data-integrity first), P1-34, P1-32 (feature).
