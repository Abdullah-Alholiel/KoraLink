# Run #95 — Program Design (Gates 1-3 compact)

## Problem (Gate 1)
After PRs #63/#64, the KoraLink house id shape (UUID_SHAPE regex + message) has one canonical
home: `apps/api/src/common/validation/id-shape.ts`. Reviewer A (run #95) found the realtime
gateway still declaring its own private copy (`app.gateway.ts:35`), used by `isUuidShape()` to
gate room ids before they hit room names / DB queries. A private copy silently diverges the
moment the house shape changes. User story: *as a maintainer, I want exactly one definition of
the id shape so WS and REST validation can never disagree.*

## Scope
- IN: gateway imports shared UUID_SHAPE; jest tripwire that fails CI on any private
  `const UUID_SHAPE` outside id-shape.ts; negative proof (planted offenders trip it).
- OUT: no behavior change to validation; no other regex dedup (no other private copies exist —
  tripwire enforces); no @IsUUID migration (documented drift stands).

## Architecture delta (Gate 2)
None at runtime. Import graph only: `modules/gateway/app.gateway.ts` →
`common/validation/id-shape.ts`. Test adds a filesystem walk over `apps/api/src` (skips
node_modules/dist/*.spec.ts) executed in jest.

## Contracts (Gate 3)
- `isUuidShape(v: unknown): boolean` — signature and behavior UNCHANGED (same regex value,
  now imported). Callers: WS handlers unchanged.
- Tripwire spec contract: passes only when zero non-spec .ts files outside
  `common/validation/id-shape.ts` match `/(?:export\s+)?const\s+UUID_SHAPE(\s*:\s*RegExp)?\s*=/`;
  exemption is PATH-based (id-shape.ts exactly), not keyword-based (PR-Agent r1).
- i18n: none (no user-facing strings).
- API JSON shapes: none (no endpoints touched).

## Gate 3 checklist
- [x] Mutation endpoints — none touched; N/A.
- [x] Frontend types can accept backend JSON — no API change; N/A.
- [x] Adapters — N/A.
- [x] No silently-undefined fields — no field changes.
- [x] i18n keys — none needed.
- [x] Contract verified against live code: shared regex value is byte-identical to the deleted
  private literal (verified by diff in PR #65).

## Verification (Gate 4 evidence)
- jest full API: 90 suites / 781 tests (was 89/779).
- tsc --noEmit: 0. turbo build --filter=api --concurrency=1: green.
- Negative tests: planted `export const UUID_SHAPE = /^x$/` and `const UUID_SHAPE: RegExp = /^y$/`
  each trip the tripwire; clean tree passes.
- CI on PR #65: gate/review/semgrep/fresh-apply (green on r0; re-run on r1 push).
