# Program Design — P2-332 refund window 4h → 12h (run #202)

Gates 1-3 compact (autonomous mode). Problem: the owner decided the cancel/refund policy
(DECISIONS.md 2026-11-11, D-20261110-06): **full refund until 12h before slot, then forfeit,
platform-wide**. The codebase already implements the 4h conditional engine (slice 4); the decision
maps to moving the boundary and bringing every human-facing surface with it.

## Scope
IN: boundary constant 4→12 · decision-table spec pins · 5 PWA copy keys (en+ar, incl. the
pre-existing 2h-vs-4h static-rules contradiction) · removePlayer Cancelled guard (Reviewer A
IMPORTANT #2, same money-roster area) · leaveMatch eviction-collection consistency (Reviewer A
MINOR #1).
OUT: host cancel (always 100% refund — untouched by the decision, Reviewer A MINOR #3) ·
no-show/after-kickoff rules (unchanged) · refund_policy admin setting VALUE (owner-owned content)
· P2-345 waitlist cap · strict no-exception window variant (proposed default = keep the owner's
backfill exception; 48h-veto window recorded in 00-retro.md).

## Contracts (exact)
- `REFUND_WINDOW_HOURS` semantics UNCHANGED: hoursToKickoff >= N → 100% refund; inside window →
  paid-backfill refund else host forfeit. Only the value changes: 4 → 12 (constants.ts:12).
  No migration, no endpoint shape change, no DTO change. Zero API contract drift.
- Spec: matches.refund-matrix.spec.ts `expect(REFUND_WINDOW_HOURS).toBe(4)` → `toBe(12)`; docstring
  updated to cite D-20261110-06; boundary pins keep same semantics (5h→13h outside-window,
  1h stays inside-window).
- leaveMatch comment block (:1958-1964) rewrote to 12h + decision anchor.
- i18n (leaf parity MUST stay 1192=1192; VALUE-only edits, zero key add/remove):
  - refund.leftForfeited en: "You left within 4 hours…" → "You left within 12 hours of kickoff and
    no one replaced you — the fee was forfeited to the host per our policy."
  - refund.leftForfeited ar: "غادرت خلال ١٢ ساعة من بداية المباراة ولم يحل أحد محلّك — تم تحويل
    الرسوم للمضيف وفق سياستنا." (Arabic-Indic ١٢ per the numerals standard — the old string used "4" Latin; ١٢ matches the existing ٤ usage.)
  - matchDetail.playerHostedPayoutNotePlayer en: "…Cancel 12+ hours before start, or if your seat
    is backfilled, and you're refunded in full." ar: "…ألغِ قبل ١٢ ساعة من البداية أو إذا عُبئت
    قعدتك، ويُسترد المبلغ كاملًا."
  - legal.termsRefundTitle en: "Joiner refunds and the 12-hour rule" ar: "استرداد المشاركين
    وقاعدة الـ١٢ ساعة"
  - legal.termsRefundDesc en: "Joiners who withdraw 12 or more hours before kickoff are refunded in
    full. Within the final 12 hours, a withdrawal is refunded in full only if a waitlisted player
    takes the seat; otherwise the fee is forfeited to the host. Withdrawals after kickoff and
    no-shows are not refunded. Fees already forfeited are not returned even if the match is later
    cancelled. Repeated abuse of hosting responsibility or refunds may result in account
    restrictions under the Accounts section." ar: mirrored ١٢/الأربع LAST-hour phrasing →
    "الساعات الاثنتا عشرة الأخيرة".
  - matchRules.refund.body en: "Full refund if cancelled 12+ hours before match. Within 12 hours,
    refund only if your seat is backfilled from the waitlist." ar: "استرداد كامل إذا تم الإلغاء
    قبل ١٢ ساعة من المباراة. خلال ١٢ ساعة، الاسترداد فقط إذا عُبئ مقعدك من قائمة الانتظار."
    (fixes the stale "2+ hours" copy that contradicted even the 4h engine; the admin refund_policy
    override still wins when set.)
- removePlayer: `match.status === 'InProgress' || match.status === 'Completed' || match.status === 'Cancelled'`
  → BadRequest "Players can only be removed before the match starts." + new spec case
  (Cancelled rejected, after-lock, mirroring markNoShow's pattern).
- leaveMatch ≥window branch: `evicted = evicted.concat(result?.evicted ?? [])` (consistency with
  :1990/:2027; behavior-neutral today).

## Verification checklist (Gate 3)
- [x] No endpoint/DTO/shape change — value + copy + one guard only.
- [x] Mutation contract untouched (return this.findOne(id) outside tx).
- [x] Money flows read persisted snapshots; no re-derivation introduced.
- [x] i18n: value-only edits in 5 keys × 2 locales; leaf counts stay equal (checked post-edit).
- [x] Every forfeited/refund path keeps per-episode ledger keys (unchanged).
- [x] Observability: no new flows (refund_credited / host-forfeit notifications unchanged).
