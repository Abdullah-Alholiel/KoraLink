# Run #136 — Gate 0 Retrospective (P2-207 wallet queryKey locale)

**Area touched:** `apps/player-pwa/src/hooks/useWallet.ts` (+ its test). No admin, no API.

## State audit

- DECISIONS.md read FIRST (Gate-0 supremacy): no entry contradicts this fix; it is a
  cache-correctness bug fix, not a design/UX change. Money paths untouched.
- `git worktree list`: single checkout at /home/ubuntu/projects/koralink on `staging`
  (run-#59 worktree layout is gone). In sync with origin/staging at preflight.
- Sibling agents: multica sibling's UNCOMMITTED `apps/api/src/common/utils/ws-origin.ts`
  edit (+15/−8) present in the shared tree. Reviewer A verified it matches the boarded
  P2-205 fix exactly (DEFAULT_WS_ORIGINS const feeding both sites). Per P2-150 dup-guard
  and shared-tree discipline: factory does NOT touch, stage, or commit it. No open PR for
  it either — sibling owns the commit+PR.
- PR #136 (P1-66): re-checked at Phase 1 — ALL repo checks green (gate 5m39s, fresh-apply,
  review, semgrep, GitGuardian, both real Vercel previews Ready). Only the stale
  third `Vercel` project check fails ("Deployment was blocked" = P2-208, owner-only).
  Never-merge-red holds → PR stays open; re-surfaced to Abdullah this run.

## Prior-run verification (claims ≠ facts)

- P1-66 (run #135, PR #136): Reviewer B code-verified all 4 claims BUILT-AS-CLAIMED
  (env-keyed key with empty default + not-configured outcome BEFORE gates;
  profile third hint arm + i18n EN+AR; worker empty-key abort before subscribe;
  .env.example VAPID contract). CI green (above). Stays IN-REVIEW pending merge
  (Vercel-side check) + key activation (owner).
- P2-199 (run #134, 0c8603e): reviewer sweep confirms aria-pressed/current components
  present in admin (Reviewer B design lens spot-check). DONE stands.

## Review phase (both dispatched parallel, glm-5.3-flash, probe 200 @1.9s)

- Reviewer A (code quality, PWA lane, 128s): zero new P0/P1 findings. All standing bug
  classes clean (::uuid casts 0, eq-null 0, console.* 0, z-index compliant, hydration
  guarded, i18n 1095/1095 parity, no dead UI, no direct transport imports in components,
  no NEW hex violations). Incomplete check noted: Drawer direction not re-verified this
  sweep (no violations found either).
- Reviewer B (product gaps + design lens, 149s): no new P0. Top gap = P1-66 activation
  (owner ops, already boarded). P2 leads re-confirmed as boarded rows (attachments=Open
  leg of P1-3; P2-143 admin drawer states; 3DS UX rides P0-2). Design lens clean on
  touched surfaces.
- Hex lane: clean, 10/10 metrics at baseline.
- Sentry 24h: no new actionable signatures (130× CORS-probe rejections = guard working,
  probe noise — matches existing P2-110 row, evidence refreshed 130/24h; venue_favorites
  failures are the known P2-51 deploy-before-migrate evidence; koralink-web
  viewport-diagnostic 55× stale since Oct 12 = MINOR, watched).

## Lane & second item (Phase 3.6 + 3.5 decisions)

- **zeroshot lane: skipped** — primary item (P2-207) is a small single-file slice with
  pre-existing test scaffolding; lane worktree + fresh `npm ci` + status-poll overhead
  exceeds the fix itself. Routed on the normal PR path (PR #137) — proven faster for
  <100-line mechanical slices. Same reasoning applies to the P2-204 hardening rider.
- **Second item: P2-204** (API lint override cleanup, PR-Agent r2 on #135) — 35
  mechanical residuals measured live (34 no-unused-vars + 1 `Function` type in
  mailer.spec.ts:234 + 1 `require()` in matches.pitch-slots-filter.spec.ts:28),
  `**/*.spec.ts` only, zero overlap with the sibling's dirty `ws-origin.ts`.
  Re-enables all three overridden rules strict. Hardening rider (1/run max).

## Tech-debt signals

- fix:feat ratio healthy this window (review fixes landed via PRs, features via lanes).
- P2 pool is heavily owner-gated (7 of ~15 open rows need Abdullah calls) — surfaced in
  the decisions queue rather than worked around.
