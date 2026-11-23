# Run #224 — P2-392 Tap-Target Batch — Gate 0 Retrospective

Cycle: lane/run224-p2-392 off origin/staging (c25a2d37). Rotation: 224 % 4 = 0 → PWA screens.

## Area audit (what this item touches)

- **Tap-target standard**: `tailwind.config.ts:30` defines `hit: '44px'` (P2-52, run #40);
  PR #274/#275 (run #215) adopted it across 15 sheet controls and introduced the census
  tripwire `test/p2366-tap-targets.test.ts` with a KNOWN_DEBT ratchet of 12 tracked
  pre-existing debt buttons.
- **P2-371 real-browser baseline (run #220)**: 72 loads {ar,en}×{360,390,430}; OVERLAP 330,
  TAP 408 instances → boarded as P2-391 (top-band stacking) and P2-392 (tap targets outside
  the sheet census). Match-detail was SKIPPED in the baseline (zero Open matches on staging).
- **Recent commits in the area**: e725d189 (P2-393 a11y quartet, min-h-hit + aria), PR #274/#275
  census pattern, PR #280/#282/#283 offline/error lanes.

## Tech debt / findings this cycle

1. **KNOWN_DEBT ratchet at 12** — the census tracked but did not fix: MatchChat (2),
   RescheduleSheet, TeamLineupSheet, TopupSheet, clubs page heart, my-games back, reports back,
   wallet export close, club-detail (2), messages page (2), privacy/terms backs (1 each).
2. **Real-browser offenders outside the census regex reach**: InstallPrompt X (no size class at
   all → ~16px), geolocation pill Enable (py-1.5 → 28px) + dismiss (w-7), host onboarding dots
   (8×8), LanguageToggle segments (28/32px), search inputs (20px tall), messages send button.
3. **Privacy/terms back buttons carry NO aria-label** (Reviewer B run #224 IMPORTANT-1; twin
   pattern on settings/match hero already labels).
4. **Match-detail entered the audit this run** (fixture match seeded): adds the same install-
   banner/dual-dismiss offenders (OVERLAP 5/viewport, TAP 5-8/viewport). Stacking stays P2-391.

## Process notes

- Seeds: fixture match `257b0897-28c3-4598-aecd-34609f6caeff` created via dev-login + POST
  /matches (booking_mode=self → no host wallet debit; balance 1037.25 unchanged, DB-verified).
- Sentry 1C (P1-52) RE-IGNITED (81 events/24h; nightly backup failed again 03:21Z Nov 22) —
  owner red row, not a code item; see RUNS report.

## Verdict

Proceed to Gates 1-3: burn the census ratchet to zero + fix the audit's top tap offenders +
label the two legal-page back buttons. Design-only PWA lane (no API/schema/i18n-structure risk
beyond 2 leaf keys).
