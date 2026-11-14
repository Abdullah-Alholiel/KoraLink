# Run #190 — Program Design (Gates 1-3 compact)

Two deliverables, neither changes any API contract.

## Deliverable 1 — P0-11 Coolify migration plan (docs/plans/prod-on-vps.md)

- **Problem:** owner wants prod+staging on this VPS (PDPL residency, cost, one box);
  Render/Vercel/Neon stay as 2-week fallback.
- **User story:** as the owner, I approve numbered steps; each step has verify+rollback;
  factory never holds prod credentials.
- **Contract shape:** a PLAN document + OWNER-QUEUE go/no-go entry. No code, no schema,
  no endpoints. Success = plan exists, approvals numbered A1-A8, cutover table C1-C8
  each with verify + rollback lines, no secrets in the file, topology matches the
  VERIFIED Coolify-4.6.0-already-installed reality.

## Deliverable 2 — P2-274 shared admin LoadingState

- **Problem:** 3 admin pages carry copy-pasted inline loading paragraphs with drifted
  padding (`p-8` partner:36-37, venues/[id]:49-51, `px-8 py-10` audit:180) — the exact
  drift EmptyState (run #42) killed for empty states.
- **Design (exact, mirrors EmptyState contract):**

```tsx
'use client';
interface LoadingStateProps { message: string; className?: string }
export default function LoadingState({ message, className = '' }: LoadingStateProps) {
  return (
    <div className={`px-8 py-10 text-sm text-gray-400 ${className}`}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
        <span>{message}</span>
      </div>
    </div>
  );
}
```

- **Call-site contract:** mechanical swap of the inner paragraph only (PageHeader
  wrappers untouched); audit page swaps its ternary branch; imports added beside the
  existing LoadError import. ZERO new i18n keys (reuses `common.loading` /
  `partner.dashboard.loading` / `audit.loadingAudit` — verified present in both
  en.json/ar.json). No other page touched. No spec file strictly required (pure markup
  swap), but the lane may add one tripwire spec if trivial.
- **Gate 3 checklist:** every consumer keeps working with identical props ✓ · no field
  silently undefined ✓ (message is required) · i18n keys exist EN+AR ✓ · mutation-return
  rule N/A (no backend change) ✓.
- **Verification plan:** lane runs `npm run type-check` (admin tsc) + root
  `npx turbo run build --concurrency=1`; parent RE-RUNS full gates on the real install
  tree after applying the diff: api `npx tsc --noEmit`, root sequential turbo, PWA
  vitest (grep 'Test Files'), then PR → CI → squash-merge → live rebuild + restart.
