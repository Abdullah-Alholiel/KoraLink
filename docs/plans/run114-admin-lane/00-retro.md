# Run #114 — Admin lane (114 % 4 = 2)

## Gate 0 — Retrospective (2026-10-08 ~15:20Z)

**DECISIONS.md consulted first (owner-standards doctrine):** Drawer RIGHT-hand panel standard
intact (Reviewer A re-verified `Drawer.tsx:86` `right-0`); no global PWA bell (standard intact);
EN+AR parity always. Nothing this run builds contradicts the ledger.

### Prior-run verification (claims ≠ facts) — delegated Reviewer B + parent spot-checks
| Claim (run #113) | Verdict | Evidence |
|---|---|---|
| PR #97 squash `2000157` on origin/staging | CONFIRMED | `git branch -r --contains 2000157` → origin/staging |
| LEFT JOIN + COALESCE on BOTH venue queries | CONFIRMED | venues.service.ts:172/179 + :337/:345; `INNER JOIN users` grep = 0 hits |
| venues jest 4 suites / 27 tests green | CONFIRMED | `npx jest src/modules/venues` re-run: 4/4 suites, 27/27 tests |
| malformed favorite id → 400 pipe | CONFIRMED (guard-first) | unauth probe → 401 (guard precedes pipe); with auth cookie run #113 showed 400 live |
| Admin state clean (no Abdullah WIP) | CONFIRMED | `git status --short apps/admin` empty; admin svc active; 13 routes live |

**P2-167 → DONE ✅ (verified run #114).**

### Fix:feat ratio: 3:3 = 1.0 (healthy; docs-heavy is expected for the factory loop)

### Reviewer findings (both scoped reviewers, GLM 5.3 Flash, clean completions)
- **NEW (Reviewer A):** `partner.service.ts:115` `getVenues` still `innerJoin(users)` for
  owner_name — same defect class PR #97 fixed on the player surface. Admin surface
  (`admin/venues.service.ts:61,73`) has the same INNER JOIN on owner. Owner-row deletion would
  silently drop venues from the partner portal list + admin lists.
- **CONFIRMED boarded:** users/page.tsx:249 bare `Search` (P2-166). Parent sweep added the
  second site the row predicted: `venues/page.tsx:140` bare `Search`. Both have `tc` in scope;
  `common.search` exists EN ("Search") + AR ("بحث") at messages/*.json:23.
- **Refuted/benign:** no `::uuid` casts; all admin/partner controllers guarded; reschedule
  FOR UPDATE + in-UPDATE wallet floor sound; EN/AR key parity exact (696/696); Drawer z-[80]
  intentional (modal layer).
- **New product gap (Reviewer B, P1):** `GET /venues` class-guarded → unauthenticated browsing
  401s. Product-shape call (public read carve-out vs sign-in-first) → **surfaced to the owner
  decisions queue, not built** (changes auth posture; not a default+48h-veto class).

## Gates 1-3 — Program design (compact, per-item)

### Item 1 — P2-166: Search button label i18n (user-visible pick)
- **Problem:** Arabic console shows English "Search" on users + venues pages.
- **Scope:** 2 lines. `users/page.tsx:249` `Search` → `{tc('search')}`;
  `venues/page.tsx:140` same. Keys exist both locales; no key changes, no API, no schema.
- **Contract:** render-only; zero data/adapter/hook churn. i18n parity verified pre-built
  (en.json:23 = "Search", ar.json:23 = "بحث"; pages already import `common` namespace as `tc`).

### Item 2 — NEW P2-170: partner+admin venue-list owner INNER JOIN (hardening pick)
- **Problem:** missing owner user row → venue vanishes from partner portal `getVenues` list
  and the two admin venue lists (owner_name select sites), same silent-drop class as P2-167.
- **Scope:** `partner.service.ts:115` → `leftJoin(users, …)` + `COALESCE(users.full_name, '')`;
  `admin/venues.service.ts:61,73` `INNER JOIN users u` → `LEFT JOIN users u` +
  `COALESCE(u.full_name,'')`. Owner FILTER predicates (`WHERE owner_id = …`) are ON `venues`
  columns, NOT the join — semantics unchanged. GROUP BY: admin queries select
  `u.full_name` inside aggregates-safe projections — verify each GROUP BY includes the
  coalesced expression or that full_name only feeds MAX/array_agg; adjust mechanically.
- **Contract:** response shapes unchanged (owner_name stays string, now ''-fallback);
  no pagination counts on these surfaces; jest spec pinning LEFT JOIN per query.
- **Gate 3 checklist:** mutations none; frontend types unchanged (strings); adapters none;
  i18n none. Verdict: contract-safe.

## Budget decision
Item 1 ≈ 15 min (2-line + gates + PR). Item 2 ≈ 60-90 min (3 queries + spec + PR + bot gates).
Total well inside the ~3h remaining after reviews. P2-107 clock elapses 2026-10-09T11:00Z —
run #116 (10-09 10:15Z) may build it; **P2-116 must re-check for a veto first**.
