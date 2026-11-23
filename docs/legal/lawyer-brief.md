# KoraLink — Lawyer Brief (draft for legal review, prepared by the engineering team)

**Date:** 2026-11-14 · **Status:** DRAFT — facts only, no legal conclusions.
**Prepared per:** Life OS worker request D-20261114-01 (kanban/DECISIONS.md). Every claim
below cites product source (file:line) or an owner decision ID. Items needing the lawyer's
judgment are marked **TODO-lawyer**. The engineering team verified the FACTS; the LAW is
entirely the lawyer's call.

**Booking note:** lawyer booking is the launch critical path (D-20261113-12, due 2026-11-16).
This brief exists so the lawyer's first pass can start from facts, not discovery.

---

## 1. Entity & registration — INCOMPLETE

| Item | Status |
|---|---|
| Legal entity name | Placeholder "KoraLink / KoraLink Sports" in product copy. **No registered entity confirmed.** |
| CR number | **MISSING** (owner decision D-20261113-03: company registration is NOT on the launch path; live payment keys are deferred until it exists). |

**TODO-lawyer:** what legal form is required to (a) charge the SAR 5 platform fee,
(b) hold player wallet balances, (c) sign processor agreements — and what can launch
before registration vs after.

## 2. What the product does (verified facts)

- Players book padel/football pitches and join matches (staging app live; ~200 verified
  engineering runs). Accounts open via **Saudi phone + SMS OTP (Unifonic)** or
  **email + OTP (Brevo)** — both paths active in code
  (`apps/api/src/modules/auth/auth.controller.ts`, `email-auth.controller.ts`).
- Money: player wallet topped up by card via **Moyasar**; join fees are debited from the
  wallet; a **SAR 5 per-joiner platform fee** is embedded in pricing
  (`apps/player-pwa/src/lib/pricing.ts`, pinned by tests); refunds per a **12-hour rule**
  (full refund ≥12h before start, forfeit inside it — owner decision D-20261110-06,
  enforced in `apps/api/src/modules/matches/matches.service.ts`).
- Payments are currently **Moyasar SANDBOX only** (owner decision D-20261113-03 — no real
  money until production keys, which are gated on company registration).
- Data rights tooling is built: account deletion/anonymisation, data export, restore,
  purge (PDPL-rights family P0-6, live-verified).
- Backups: nightly encrypted-at-rest dumps, **30-day retention**
  (`scripts/db-backup-prod.sh`).

## 3. Processors & data locations (as of 2026-11-21)

| Processor | Service | Data shared | Location TODAY |
|---|---|---|---|
| Unifonic | SMS/OTP delivery | phone number, OTP codes | KSA company |
| Moyasar | card processing | card data (tokenized; full numbers never stored by KoraLink) | KSA company (SAMA-licensed per Moyasar's public statements — **TODO-lawyer verify**) |
| Brevo | transactional email (OTP + notifications) | email address | EU (Brevo SAS) |
| Sentry | error monitoring (project region EU: de.sentry.io) | error payloads (may contain data fragments) | EU |
| PostHog | product analytics | pseudonymous IDs + app events | **TODO-lawyer — see §4 claim 2** |
| Oracle Cloud | app + DB hosting (this VPS) | full user DB | **Riyadh, KSA** (region me-riyadh-1, verified from the instance metadata today) |
| SeaweedFS | self-hosted object storage (avatars, venue photos) | uploaded media | same Riyadh VPS |
| Render (US-West) | **current prod API host** | prod user traffic | USA — retires at cutover |
| Vercel | **current prod PWA host** | prod web traffic | Global/US — retires at cutover |
| Neon (US-West) | **current prod Postgres** | prod user DB | USA — retires at cutover |

**Cutover note (verified):** the production cutover plan (docs/plans/prod-on-vps.md) moves
prod API + DB onto the **Riyadh VPS**, retiring Render/Vercel/Neon. So "hosting inside the
Kingdom" is **true post-cutover, false today for prod traffic**.

## 4. Product claims that are FALSE or unverifiable TODAY (TODO-lawyer each)

Source file: `apps/player-pwa/src/messages/en.json` (Arabic mirror carries the same claims).

> **Refresh 2026-11-21 (factory run #221):** claims 1 and 3 below were FIXED in copy by
> PR #283 (2026-11-18, run #218) — the app text now states the true position and is pinned
> by `apps/player-pwa/test/p218-legal-truth-pins.test.ts`. They stay listed so the lawyer
> sees what changed and rules on the underlying PDPL question, which the copy fix does NOT
> answer. Claims 2, 4, 5 are unchanged and still open.

| # | Where | Claim (verbatim) | Verified reality | TODO-lawyer |
|---|---|---|---|---|
| 1 | en.json:1163 `privacySharingBody1` / :1186 `privacyTransfersBody1` | ~~"Our primary hosting and databases run inside the Kingdom."~~ **FIXED by PR #283** — copy now reads "currently run outside the Kingdom; at launch it moves to servers inside the Kingdom" (EN+AR pinned). | Underlying reality unchanged: prod = Render US-West + Vercel + Neon US-West until the Coolify/Riyadh cutover. | **STILL OPEN:** whether pre-cutover US processing requires a PDPL transfer mechanism (risk assessment / contractual clause / consent) and a record of transfer. |
| 2 | legal ns (no dedicated key) | Analytics silent: the notice never discloses product analytics. | **UNCHANGED** — PostHog IS active (`NEXT_PUBLIC_POSTHOG_KEY` in PWA env, wired in `ObservabilityProvider.tsx`); no analytics disclosure exists in the legal namespace (grep 2026-11-21). | Consent basis for product analytics under PDPL; amend the notice text before launch. |
| 3 | en.json `privacyChildrenBody1` / `termsAccountsBody1` | ~~"…Saudi phone number verified by one-time code."~~ **FIXED by PR #283** — copy now says a phone number **or email address**, verified by one-time code (EN+AR pinned). | Underlying reality unchanged: email-OTP signup creates accounts without a phone (`email-otp.service.ts`). | **STILL OPEN:** whether an age gate must apply to BOTH signup channels and what verification is reasonable. |
| 4 | en.json:1138/:1176/:1196 | "…complaints: hello@koralink.sa" | **UNCHANGED/UNVERIFIABLE** — koralink.sa has no reachable mail infrastructure; rights requests would bounce. | n/a (ops fix: provision the mailbox before launch; factory flagged to owner 2026-11-14). |
| 5 | en.json:1219 `termsPaymentsBody2` | "…our licensed processor (Moyasar)…" | **UNCHANGED** — Moyasar publicly states SAMA licensing; KoraLink's own contract/merchant status unverifiable by the factory. | Confirm the licensing statement is accurate to repeat in terms; confirm what happens contractually while only sandbox keys exist. |

Claims that are TRUE and verified (no action): the 12-hour refund rule (en.json:1204 —
matches shipped code + owner decision D-20261110-06); 30-day backup overwrite
(en.json:1155); "no full card numbers stored" (en.json:1200 — wallet stores only Moyasar
payment references).

### 4.1 Host late-cancel forfeit & player no-show fee — shipped 2026-11-23 (factory run #225)

Two owner-decided money rules (launch condition 6) are now enforced in code. Disclosure
lives in the Terms, section 6 "Refunds and cancellation" (`legal.termsRefundBody5`) and
section 7 "Acceptable use" (`legal.termsConductBody5`), EN + AR. Both keys are listed in
`apps/player-pwa/src/messages/{en,ar}.json` AND rendered on the Terms page
(`apps/player-pwa/src/app/[locale]/terms/page.tsx` paragraph lists, extended in the same
commit).

**Rule A — host late-cancel forfeit (D-20261115-04).** Code: `MatchesService.cancelMatch`
+ helper `isLateHostCancel` (`apps/api/src/modules/matches/matches.service.ts`).
- Applies to KoraLink-booked pitches only (`booking_mode = 'koralink'`) where the host
  was debited a pitch cost (`pitch_cost_sar > 0`) at match creation.
- Cutoff: server wall clock (`Date.now()`) compared to the match's stored
  `scheduled_at` (timestamptz). The cancel is "late" when it is NOT at least
  12 hours before kick-off — i.e. anything inside the final 12h, AND anything
  at or after the scheduled start (an unstarted match stays cancellable, and
  cancelling it after kick-off cannot dodge the forfeit).
- Exactly 12h or more before kick-off → full refund.
- Started matches are exempt: cancelling an InProgress match (the in-app
  emergency cancel) keeps the full 100% pitch refund regardless of the clock.
- Effect of a late cancel: the booked slot is still released and the host
  receives **no wallet credit** (no ledger row for the host). The forfeited
  amount is STAMPED on the match row (`matches.pitch_forfeited_sar`) and the
  venue-settlement generator counts stamped rows exactly like completed
  bookings — the venue is paid through the normal settlement rail, with a
  per-match auditable record visible to admin and partner consoles.
- Joining players are always refunded 100% of the fee they paid (`refund-join-<rosterId>`
  REFUND credits), regardless of timing. The forfeit touches only the host's pitch cost.
- Non-late cancels refund the host exactly the stored `pitch_cost_sar` under the
  idempotency key `refund-<matchId>` (unchanged from before).

**Rule B — player no-show fee (D-20261113-10).** Code: `MatchesService.markNoShow`.
- Only the match host can mark, only on an InProgress/Completed match, after the
  configured grace window (pre-existing gates).
- Charged only when the player **actually paid to join** (their roster row's
  `fee_paid_sar` snapshot > 0). Players who joined free are never charged.
- Amount: the match's `price_per_player` — the per-player share the player paid at join.
  It is debited from the player's in-app wallet as a `MATCH_FEE` DEBIT ledger row.
- If the wallet cannot cover the fee, the whole mark is rejected (no flag, no fee, no
  karma change — all in one database transaction).
- Karma: the penalty is −5 floored at the player's current karma (a player at
  0 loses nothing); the amount actually applied is stored per roster episode
  (`match_players.no_show_karma_applied`) and the un-mark restores exactly
  that amount — mark/clear is symmetric even at the floor (capped at 100).
- Idempotency: fees are per charge INSTANCE within the roster episode —
  `noshow-fee:<rosterRowId>:<n>` for the nth charge and
  `noshow-fee:<rosterRowId>:r<n>` for its reversal (both UNIQUE in the
  ledger). A mark charges the seat once; clearing the mark reverses the
  standing charge; marking again charges a new instance. Sequential retries
  of the same flip replay (no double charge); concurrent flips collide on the
  UNIQUE key and surface as 409.
- Reversal: when the host clears a mark and a standing (not-yet-reversed)
  fee instance exists, the exact charged amount is credited back as a REFUND
  under that instance's reversal key `noshow-fee:<rosterRowId>:r<n>` (once
  only). Clearing the mark also closes the auto-opened no-show dispute
  (pre-existing behavior).
- Karma on re-mark: the floor clamp applies at each mark against the player's
  CURRENT karma, and each mark stamps its own applied amount on the roster
  row — reversal always restores the latest mark's exact amount.
- Note for counsel: a mark → clear → mark cycle charges, refunds, and charges
  again (each flip is money-real; the ledger shows every episode). The
  unaffordable-fee case still blocks the whole mark (no attendance record
  without payment) — engineering chose that over recording an uncollectable
  fee; flag if the terms need a debt/pending-charge model instead.
- Where the fee goes: today it is debited from the player only; it is not credited to
  the host or venue. Question for counsel: should the terms say who receives it?

## 5. Open questions for the lawyer (owner-approved agenda, D-20261114-01)

1. **Stored-value wallet & SAMA:** does holding prepaid player balances (wallet ledger,
   `apps/api/src/modules/wallet/`) constitute a regulated stored-value/e-money activity?
   What structure is acceptable (e.g. escrow, payout deadlines, float limits)?
2. **VAT / ZATCA on the SAR 5 platform fee:** is the fee taxable? Does KoraLink need
   e-invoicing integration for receipts (the app issues in-app receipts —
   `GET /wallet/receipt/:txId` — not tax invoices)?
3. **PDPL cross-border transfers:** the §4 claim-1 position pre- and post-cutover;
   required transfer mechanism and record-keeping.
4. **Entity form & CR** (§1): minimum legal form to launch with sandbox payments, and to
   later enable live keys.
5. **Terms-of-service risk allocation:** host/venue liability for pitch quality and
   no-shows; minors on the platform (§4 claim 3).
6. **Privacy notice amendments** arising from §4 claims 1-3 — engineering will patch the
   copy same-day once the lawyer states the required positions.

## 6. Timeline pressure

- Lawyer booking is the launch critical path (D-20261113-12: start by 2026-11-16;
  first review pass estimated 4-15 business days).
- The §4 amendments are one engineering run once decided — they do not need to block the
  first lawyer pass; this brief gives the lawyer the true state now.

---

*Prepared by the KoraLink engineering factory (run #207). Facts verified 2026-11-14 from
product source, live environment probes, and the owner decision ledger (kanban/DECISIONS.md).
No legal conclusions are expressed or implied.*
