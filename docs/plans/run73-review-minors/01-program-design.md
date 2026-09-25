# Run #73 — Program Design (compact; Gates 1-3 in one doc, autonomous mode)

## Problem
Reviewer A/B (run #73, glm-5.3-flash ×2) confirmed a set of small, independently-verified hardening
items left open by run #72's P2-42 partial + the run-#41 Reviewer-A minors queue. No user story
changes — this is a correctness/hygiene batch. Owner queue untouched (all owner-gated items stand).

## Scope
IN: (1) CSP other-directive cleanup — drop dead mapbox allowances from connect/style/img-src, gate
cleartext `ws:` to dev; (2) `VenueDecisionDto.note @MaxLength(1000)`; (3) `CastVoteDto.candidateId`
UUID-shape + `@MaxLength(36)`; specs for all three.
OUT: banner hydration (refuted — no surface), pitchCostSar @Max (refuted — server-derived, ignored),
mark-no-show @IsUUID flip (wontfix this run — decision recorded in 00-retro.md), P2-103 nonce CSP
(owner-cycle), P2-100 reminder ladder (deferred, next-run candidate).

## Contracts (Gate 3)

### CSP header value (production) — exact shape after this run
```
default-src 'self'; script-src 'self' 'unsafe-inline' https://*.posthog.com https://aa.tail2948f9.ts.net:9460;
style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
connect-src 'self' https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://app.posthog.com
  https://*.posthog.com <apiOrigin> wss: https://aa.tail2948f9.ts.net:9460;
worker-src 'self' blob:; font-src 'self' data:; frame-src 'none'; object-src 'none';
base-uri 'self'; form-action 'self'
```
Dev = identical except script-src keeps unsafe-eval + legacy hosts, and connect-src ALSO has `ws:`.
Behavioral risk: none — zero mapbox/moyasar code/deps in the PWA (grep-verified 2 runs running); every
deployed API origin is https (wss: covers the socket.io path). Dev-only relaxations preserve local HMR.

### DTO contracts (additive validation only — wire shapes unchanged)
- `VenueDecisionDto { decision: 'approve'|'reject'; note?: string /* ≤1000 */ }` — 400 on note >1000.
- `CastVoteDto { candidateId: string /* /^[0-9a-f]{8}-…-[0-9a-f]{12}$/i, ≤36 */ }` — 400 on malformed/
  overlong candidateId. Existing PWA sender (usePom.ts) sends real roster UUIDs → no behavior change.

## Gate 3 contract verification checklist (explicit, per skill)

- [✓] Every mutation endpoint returns populated object — **untouched by this batch** (P2-5 ledger
      unchanged; DTO validators don't alter return shapes).
- [✓] Frontend types accept the exact JSON backend produces — **no shape edits**, only validation
      bounds on inbound fields the PWA already sends correctly (real UUIDs from roster data).
- [✓] Adapter functions exist for every API shape consumed — no new API shapes introduced.
- [✓] No field silently undefined — no field additions/removals anywhere.
- [✓] i18n keys both languages — no user-facing strings added (400 messages are backend exception
      texts, EN-only by existing convention, same as every other DTO rejection).
- [✓] CSP tripwire regenerated with the config change (csp-config.test.ts 8→11 cases, all green).

## Verification (Gates executed)
- `npx turbo run build --concurrency=1` → 3/3 exit 0 (1m46s, NODE_ENV unset pre-gate)
- `cd apps/player-pwa && npx vitest run` → 99 files, **721/721** (was 718; +3 CSP cases; grep `Test Files` verified)
- `npx tsc --noEmit` (PWA) → 0 errors · `npx eslint src test --max-warnings 0` → 0
- API `npx jest` → 77 suites, **635/635** (was 626; +9 dto-caps cases)
- No schema/migration touched → no db:generate/migrate, no API restart needed (DTO validation compiles
  into dist but wire behavior for valid clients is unchanged; restart happens at Abdullah's directed
  projects-dir merge per the standing deploy fork).
