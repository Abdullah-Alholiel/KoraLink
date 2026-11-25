# Run #231 — P2-401 admin raw-error helper: Gate 0 Retro + cycle docs

## Gate 0 Retro (admin error surfaces)

- Census (grep `instanceof Error ? .*message` over apps/admin/src): **21 sites** across
  13 files — every one pipes raw backend/English text into the console UI on failure.
  P2-401 filed by Reviewer A run #230 (parent-verified pattern).
- Two of the 21 are EXEMPT by documented design: `lib/use-data.ts:17` + `lib/use-live-data.ts:55`
  feed `LoadError` whose raw reason renders as a muted LTR ops line (P2-400(d), PR #263
  precedent). Left untouched this cycle.
- Login page (`login/page.tsx:37,50,68`) carried fully hardcoded EN literals — worst class.
- Existing good patterns found on site: `disputeActionFailure` classifier (PR #199,
  disputes/[id]) and `pitchActionFailure` buckets (P2-323, partner/pitches) — never
  propagated repo-wide. This cycle generalizes them into ONE helper.
- `ApiError` already carries `.status` (lib/api.ts) — classification can be status-first,
  message never parsed. No backend change needed.
- Admin tree was clean at pick time (Phase 3.5 ADMIN STATE CHECK: no uncommitted changes,
  service active). No in-flight owner work touched.

## Gates 1–3 (compact, single doc)

See `01-program-design.md` for the contract. Gates 1–3 were executed autonomously per the
factory-loop runbook (cron mode): scope = the 19 non-exempt sites + shared helper + i18n ns;
architecture delta = one pure classifier + one wrapper in lib/api.ts, zero backend changes;
i18n contract = `errors` namespace, 8 keys, EN/AR parity machine-checked.

## Build mode

Authored via the zeroshot lane (Claude run 01a21357, Opus 5.5 worker), reconciled and
re-gated by the parent on the real-install lane tree:
- admin `tsc --noEmit` → 0 errors
- admin `vitest run` → 3 files / 39 tests passed (incl. NEW api-error-message suite)
- `npx turbo run build --concurrency=1 --force` → 3/3 successful, 0 cached (uncached proof)
- PWA `vitest run` → 189 files / 1379 tests passed
