# Run #141 — P1-67 Partner payout notification — Gate docs

## Gate 0 — Retro (area audit)

Area: admin settlements money path. Recent: PR #142 (P2-3 payout request) merged this run
23a0ad5 — requestPayout reviewed clean (Reviewer A: 0 C/I); P2-211 cadence window fixed.
Prior races (P2-9) solved with conditional UPDATE + uidex. **Gap (Reviewer B, this run):**
`pay()` flips settlements to `paid` with audit + ops broadcast but tells the PARTNER nothing —
no bell activity, no push. Partner discovers payout only by re-checking the page (trust gap on
a money flow). Fixes:feat ratio healthy (docs+review commits dominate). DECISIONS.md checked:
no contradicting standard (notification bell in Feed-only rule is the PLAYER PWA bell = the
same bell this feature feeds; no new bell surface added).

ADMIN STATE CHECK: tree clean (apps/admin + partner/admin modules), service active, no
in-flight Abdullah work. Not an admin-UI item (API + PWA player bell).

## Gates 1–3 — Program design (compact)

**User story:** As a venue partner, when KoraLink HQ marks my settlement paid, I get a
notification (bell + push) saying which venue, how much, in my language.

**Contract:**
- New ActivityVerb `'payout_paid'` (append-only enum) + migration 0052
  `ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'payout_paid';`
- `ActivitiesService.record({ actorId: adminId, verb: 'payout_paid', recipients: [ownerId],
  subjectId: settlementId, excludeActor: false })` → bell feed_items + WS fan-out (existing
  choke point; DIRECTED_VERBS += payout_paid; added to EMAIL_ACTIVITY_VERBS — log-only until
  P1-41 keys land, then rides the mirror free).
- `NotificationsService.sendPushToUsers([ownerId], { key: 'payout_paid',
  vars: { venueName, amount }, data: { type: 'payout-paid', settlementId } })` — new PushKey,
  PushVars gains `venueName?/amount?`; catalog renders amount via Intl.NumberFormat
  per-locale (AR = Arabic-Indic digits). Display-only Number() conversion of an exact 2dp
  string (P2-4 untouched — no money math).
- Owner/venue resolution in pay(): one SQL join after the guarded UPDATE
  (settlements ⋈ venues → owner_id, venue name, amount::text). Failure → log + skip notify,
  NEVER throw into pay() (notification is best-effort, after commit — audit stays outside tx).
- PWA: NotificationSheet + NotificationProvider + ActivityCard verb maps gain `payout_paid`
  (icon + i18n key `notifications.payoutPaid` / `feed.payoutPaid`), en+ar parity.

**Gate 3 checklist:**
- [x] pay() still returns the populated settlement (mutation contract unchanged — notify is
  fire-and-forget after `after` read + audit)
- [x] Spec mock constructors updated (required DI per Reviewer-A run recommendation — no
  optional-DI silent-skip)
- [x] Push catalog total: both locales, never throws (renderPushText contract)
- [x] i18n keys en+ar both files; verb maps are total Records → tsc forces completeness
- [x] Migration journal entry idx 53 contiguous, version "7", when > 1791942067224
- [x] Enum append is backward-compatible (IF NOT EXISTS; append-only = no row rewrites)

## Gate 4 — Slices
1. DB: enum + migration + journal → schema.ts union.
2. API: verb registry + push catalog + pay() notify + jest.
3. PWA: verb maps + i18n keys (+ vitest if structure tests pin the maps).
4. Lane PR → checks → squash → restart api → live probe.
