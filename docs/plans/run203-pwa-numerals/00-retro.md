# Run #203 — PWA Numerals Completion Batch (P2-353 + P2-354 + P2-356)

**Run:** #203 (2026-11-12 15:21Z fire) · **Lane rotation:** 203%4=3 → DB/Infra, but DB/infra
candidates are thin → user-visible PWA numerals batch absorbed per the run-#202 recommendation.
**Mode:** full · **Lane:** zeroshot (Claude Pro, software-change) authors the diff; parent
re-applies + runs real gates.

## Gate 0 — Retro (abbreviated; full audit = Reviewer A report)

- Run #202 claims VERIFIED (claims≠facts pass): dist `REFUND_WINDOW_HOURS = 12`;
  served chunk `4411-843c0850b3c74f6a.js` carries `surfaceGrass` (grep=1); /ar/play 200;
  API health 200. No code re-probe needed beyond these cheap greps.
- Hex audit: `api_exc_total` 344→345 DRIFT X → attributed: PR #241's removePlayer
  Cancelled guard (`BadRequestException`, matches.service.ts ~L4106) — allowed baseline
  class, exc_files flat 27 → boarded **P2-355**, baseline folded this run (see below).
- DECISIONS.md ledger read first; no entry contradicts a render-side numerals fix
  (D-20261110-06 refund window already built; marketing numerals standard REINFORCED).
- fix:feat ratio healthy (runs #200–#202 shipped 6 features + 2 follow-up fixes, all merged).
- Sibling check: working tree clean, no foreign in-flight edits, no admin-surface dirty files.

## Gate 1 — Product spec (problem + user stories)

**Problem:** Arabic-first users see Latin digits on high-stakes money surfaces: the match
detail waitlist join CTA (`${match.price} ${match.currency}`), OngoingGameJoinSheet confirm
button, GameDetails price line (`${price} SAR` — also ignores `match.currency`), the waitlist
count pill, the venue rating average (`toFixed(1)`), and the reschedule wallet-shortfall toast
(`toFixed(2)` interpolated into an AR ICU string). Same defect class as P2-257b/P2-342 —
the run-#193/#202 sweeps missed these files.

**User stories:** (P1) As an AR player, money and queue numbers on match detail render
Arabic-Indic digits with ر.س. (P2) As an AR player, the club rating average renders ٤٫٥ not 4.5.

**Scope IN:** the 6 render sites above + `formatRating()` helper + tests. **Scope OUT:**
ICU plural keys (next-intl formats `#` locale-side already), admin surfaces, any message-file
edits (zero new keys), backend.

## Gate 2 — Architecture

Render-only change detection: all formatters + locale plumbing already exist (lib/format.ts;
MatchCard.tsx is the shipped reference). No schema/API/adapter/i18n deltas. Files touched:
match/[id]/page.tsx (2 sites), OngoingGameJoinSheet.tsx, GameDetails.tsx (+optional currency
prop, caller updated), VenueReviewsSection.tsx, lib/format.ts (+formatRating),
useMatchActions.ts (1 site). Risk: EN regression — mitigated with EN byte-shape pins in tests.

## Gate 3 — Program design (contract verification checklist)

- [✓] No API shape changes — endpoint contracts untouched.
- [✓] Frontend types can accept what backend produces — unchanged (Match.currency already
      flows; GameDetails gains an OPTIONAL prop defaulting 'SAR' — old callers stay valid).
- [✓] No adapter changes — render-only.
- [✓] Zero new i18n keys — verified: all keys used already exist in both locales
      (queuedOf/queuedPrefix plain interpolation → digits pre-formatted before interpolation;
      waitlistCovered/reviewCount ICU plurals LEFT UNTOUCHED — next-intl formats `#` with
      locale digits).
- [✓] EN byte-shape preserved where pins exist (GameDetails EN test added).
- [✓] 5 UX states unaffected; z-index untouched; no (main)-group layout imports added.

## Defaults & veto clocks

- None started this run (no new product-shape defaults proposed).
