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

## 3. Processors & data locations (as of 2026-11-14)

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

| # | Where | Claim (verbatim) | Verified reality | TODO-lawyer |
|---|---|---|---|---|
| 1 | en.json:1167 `privacyTransfersBody1` | "Our primary hosting and databases run inside the Kingdom." | **FALSE for prod today** — prod = Render US-West + Vercel + Neon US-West. Becomes TRUE at the Coolify/Riyadh cutover. Staging (what testers see) already runs in Riyadh. | Whether pre-cutover US processing requires a PDPL transfer mechanism (risk assessment / contractual clause / consent) and a record of transfer; and whether the notice may state the post-cutover position once the cutover is scheduled. |
| 2 | en.json:1175 `privacyCookiesBody1` | "…strictly necessary cookies… We do not use advertising or cross-site tracking cookies." | **INCOMPLETE/SILENT on analytics**: PostHog analytics IS active in the app (PWA env has `NEXT_PUBLIC_POSTHOG_KEY`; wired in `apps/player-pwa/src/providers/ObservabilityProvider.tsx`). The notice never discloses analytics processing. | Consent basis for product analytics under PDPL; amend the notice text before launch. |
| 3 | en.json:1173 `privacyChildrenBody1` | "…accounts require a Saudi phone number verified by one-time code." | **FALSE as stated** — email-OTP signup creates accounts WITHOUT any phone number (`apps/api/src/modules/auth/email-otp.service.ts:203-206` inserts a user with `email` only). A phone is added later via profile completion. | Whether an age gate must apply to BOTH signup channels and what verification is reasonable. |
| 4 | en.json:1177 `privacyContactBody1` | "…complaints: hello@koralink.sa" | **UNVERIFIABLE TODAY** — the koralink.sa domain has no mail infrastructure reachable from this host (no A/MX resolved). Rights requests would bounce. | n/a (ops fix needed: provision the mailbox before launch; factory flagged to owner 2026-11-14). |
| 5 | en.json:1200 `termsPaymentsBody2` | "…our licensed processor (Moyasar)…" | Moyasar publicly states SAMA licensing; the factory cannot verify KoraLink's own contract/merchant status. | Confirm the licensing statement is accurate to repeat in terms; confirm what happens contractually while only sandbox keys exist. |

Claims that are TRUE and verified (no action): the 12-hour refund rule (en.json:1204 —
matches shipped code + owner decision D-20261110-06); 30-day backup overwrite
(en.json:1155); "no full card numbers stored" (en.json:1200 — wallet stores only Moyasar
payment references).

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
