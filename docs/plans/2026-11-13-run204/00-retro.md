# Run #204 — Cycle: residual numerals + bell pagination

## Gate 0 — Retrospective (2026-11-13, PWA screens lane 204%4=0)

**Area audit.** Recent merges #243 (numerals), #244 (waitlist missing-wallet guard),
#245 (reviews dir-toggle). DECISIONS.md read FIRST — no contradictions; standing
48h-veto clock (P2-332 inside-window backfill exception) expires 2026-11-14 02:30Z.

**Findings (reviewers + parent, claims-verified):**
1. IMPORTANT — residual Arabic-numeral bypasses on match detail: openSpots chip
   (~:784) and comments count (~:930) render bare numbers; queued-pill position
   (`#{position}` at ~:1012) interpolates RAW digits (run-#203's board claim
   "pre-formatted locale-side" was CLAIM-WRONG — only the :984 pill got formatCount).
2. IMPORTANT — raw enum values on match detail: intensity header (~:866), surface
   in the rules line (~:884) and pill row (~:878), PaymentSheet title (~:1123).
   MatchCard got this in P2-342; the detail page was missed.
3. MINOR→built — `formatMoney(NaN)` renders literal "NaN" (no non-finite guard,
   unlike formatCount/formatRating).
4. MINOR→built — shareParams `formatMoney(m.price, appLocale)` drops match.currency
   → WhatsApp share text shows SAR for non-SAR matches.
5. MINOR→built — kick path `evicted = kickResult?.evicted ?? evicted` (non-concat,
   P2-350 class) in removePlayer kick branch (matches.service.ts:~4139).
6. REFUTED — Reviewer A's waitlistCovered (:673) claim: the key IS an ICU plural;
   next-intl locale-formats its `#` marker (verified run #203; re-confirmed by
   reading the message file this run). No fix needed.
7. Reviewer B P1 product gap: waitlist-promotion stale-state dead-end (queued bar
   never transitions after promotion+charge while user stares at the page) —
   BOARDED as P2-357 (needs realtime/refetch design, not this run's slice).

**Prior-run verification.** All run-#203 live claims re-probed green: waitlist dist
guard `!headWallet ||`=1; env-shim chunk serves VAPID mid-key (HTTPS funnel 200);
ar/play 200; API :8443 health 200; reviews dir-toggle in src (5 setPage(1) sites,
dist rebuilt). One claim CORRECTED (queuedOf, above). Sentry: all 3 signatures
stale (lastSeen Oct 25–31) — quota storm (P1-52 closed), push-subscribe delete,
viewport diagnostic; zero live clusters; journalctl clean 5h.

**Fix:feat ratio** healthy (2 fix + 1 feat + 1 docs in the last window).

**ADMIN STATE CHECK:** n/a — no admin/partner-surface item this run (tree clean,
no admin paths touched).

## Gates 1–3 compact — see 01-program-design.md

Contracts locked there; Gate 3 checklist verified per item before build (both
items are render/i18n/1-hook-level: no API shape changes on the parent item; the
lane item consumes the EXISTING paginated API contract).
