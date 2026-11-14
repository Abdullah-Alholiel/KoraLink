# Run #143 — P2-C + P2-D (partner payout-request history + explicit request copy)

## Gate 0 — Retro (area audit)
- Area: `apps/api/src/modules/partner/partner.service.ts` (requestPayout, getEarnings), `apps/admin/.../partner/earnings/page.tsx`, `settlements` table.
- DECISIONS.md consulted FIRST: drawer stays RIGHT (untouched), DataTable roles respected, EN+AR parity mandatory. No conflict.
- Recent landings: d48c370 (P2-210 merged this run), b04de40 (P1-67), 23a0ad5 (P2-3 payout request).
- Reviewer A #143: 0 CRITICAL / 0 IMPORTANT; 4 MINORs (window-bound asymmetry partner-vs-admin generator; CURRENT_DATE TZ reliance; period labeling today→today; sequential inserts) — recorded, not in this slice's scope.
- Hex lane: `api_raw_sql 58→59` = b04de40 pay() ownership guard (documented drift, new [P2][hex] row); `api_exc_total 279` = accepted P2-212 baseline.
- Tech debt adjacent: settlements table has NO provenance column — a `pending` row is indistinguishable (partner request vs cron generator). This slice fixes that.

## Gates 1-3 — Program design (compact)

**Problem (P2-C):** a partner-requested payout leaves no visible trace of WHO requested it; the partner console can't tell request-origin settlements from auto-generated ones. **(P2-D):** the post-request success note doesn't state exactly WHAT was requested (which venues, which amounts).

**User story:** as a venue partner, after requesting a payout I can see in my earnings table which settlements came from my requests (chip + drawer row), and the success note lists every venue + amount I just requested.

**Scope IN:** `settlements.requested_by` column (+FK users.id, NULL = auto); migration 0053 (drizzle-kit generate); requestPayout writes it; getEarnings returns `requested_by` + `requested_by_name` (LEFT JOIN users); admin earnings page: "requested" chip in Status cell + "Requested by" RecordDrawer row; success note lists per-venue lines; i18n EN+AR parity.
**Scope OUT:** admin settlements page provenance chip (follow-up); partner audit-log viewer (Reviewer B P2-9); period labeling (P2-F); window-bound unification (Reviewer A minor).

**Contract (Gate 3 checklist — verified explicitly):**
1. POST /partner/payout-requests response shape UNCHANGED `{requested, totalAmount, settlements[]}` (additive none) — frontend type needs no change. ✓ by construction (insert gains a column; returning unchanged).
2. GET /partner/earnings `settlements[]` rows GAIN `requested_by: string|null`, `requested_by_name: string|null` — additive, old consumers tolerant. Admin page interface extended with both optional.
3. Adapter: none needed (admin reads API shape directly via useLiveAdminData).
4. i18n keys (en+ar, partner.earnings ns): `requestedChip`, `requestedBy`, `autoOrigin`, `payoutRequestedVenue` — leaf counts stay equal; verified post-edit.
5. Migration: `0053` journal entry rides the SAME PR as schema+code (Phase 4.5 rule); `scripts/migrate-vps.mjs` runs ONLY after merge + local gates, then API restart + live probe.
6. FK rule: `requested_by varchar(36) REFERENCES users(id)` — id columns are varchar(36), never native uuid.
7. Mutation contract: requestPayout already returns populated settlements post-tx; unchanged.

## Gate 4 slices
1. DB+API: schema col → 0053 → requestPayout write → getEarnings read (+spec).
2. Admin UI: chip + drawer + note list (+ i18n EN/AR).
3. Gates: `npx turbo run build --concurrency=1`, `npx vitest run` (PWA — unaffected but gated), API jest, tsc. Then PR → CI → squash → migrate-vps → restart → live probe.
