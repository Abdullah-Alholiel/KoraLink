# Run #140 — Gate 0 Retrospective (2026-10-17)

**Cycle focus:** open-PR queue reconcile + P2-211 (payout-window drift).
**Branch:** staging @ c43a5ec → post-run tip; DECISIONS.md read first — no conflicts with
this cycle's work (no design/UX changes; admin Drawer rule untouched).

## Queue state at fire (9 open PRs)
- #137 (P2-207), #138 (P2-204), #139 (P2-110): **zero failing checks** — the P2-208
  `Vercel: kora-link` status fires only on PRs touching PWA/admin deploy paths (no
  `Vercel – kora-link-admin/player-pwa` failure, no repo gate failure). Same class as
  run #139's merged #144 (API-only). Squash-merged in numeric order: 0e4c0f4, 8df2de3, c43a5ec.
- #136/#140/#141/#142/#143/#145: carry the failing kora-link status → remain HELD on P2-208
  (owner-only Vercel dashboard disconnect). Never-merge-red holds.

## Tech-debt audit (touched area: partner settlements / payouts)
- P2-3 requestPayout + admin generatePending = two tools over ONE money source
  (Completed koralink bookings). Run #139's Reviewer-B caveat confirmed: the partner
  tool hardcoded BOTH the 365d lookback AND the 365d NOT-EXISTS guard while the admin
  generator keys both to the rolling `payout_cadence_days` PlatformSetting (default 7).
  Effect: after ONE settlement, a venue is blocked from requesting new unsettled revenue
  for up to a year (silent 400 "nothing unsettled"). → this cycle's build item.
- Fixed-in-passing confirmed during Sentry triage: the Oct-7 `GROUP BY vf.created_at`
  500 cluster (KORALINK-API-1M) is already correct in current code
  (venues.service.ts:390 groups by vf.created_at). No action.

## Sentry / error triage (24h, EU API)
| Signature | Count | Verdict |
|---|---|---|
| CORS origin not allowed (attacker.example) | 130 | P2-110 fix MERGED this run (#139) — beforeSend drop; expect collapse |
| venue_favorites query failures (4 sigs) | 7 | last fired Oct 7 (deploy-before-migrate window, run #121-evidenced); table live, code fixed — CLOSED no-action |
| Neon quota exceeded (KORALINK-API-1C) | 7 | last Sep 25 (cutover day, prod); no recurrence — CLOSED no-action |
| EADDRINUSE :3501 | 1 | transient boot race, no recurrence in 24h — MINOR |
| viewport-diagnostic:standalone (web) | 55 | known PWA diagnostic noise — MINOR |

## Findings merged from reviewers (both zai glm-5.3-flash, 109s/117s)
- Reviewer A: **no IMPORTANT**; hex clean; standing bug classes zero live hits; i18n
  parity 1095=1095; two documented-tradeoff MINORs (wallet locale-key cache doubling;
  beforeSend values[0] assumption).
- Reviewer B: run-#139 claims ALL verified (seed guard logic, #143 confirm-dialog flow,
  #145 export gating, P2-207 merged behavior). Product-gap P0s re-stated as DECISIONS-gated
  (real PSP) or REFUTED by code read (push dispatch exists — notifications.service.ts:372
  `webpush.sendNotification`; the true gap is boarded P1-66 VAPID last-mile + P2-186 iOS).
  New: seed-guard escape-hatch runbook note (docs-only, folded into P2-211's docs commit).

## ADMIN STATE CHECK (P2-211 touches apps/api/src/modules/partner/*)
apps/admin + partner modules clean (no uncommitted owner work), admin service active,
routes unchanged since the item was written. No hold.
