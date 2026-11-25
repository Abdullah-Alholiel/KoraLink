# Run #231 P2-401 — Program Design (contract)

## Problem
~19 admin surfaces render raw backend error text (`e instanceof Error ? e.message : t(...)`)
— English/Nest-internal messages leak into the console UI, violating the error-message
standard (what happened + why + what to do next, localized EN+AR).

## Contract

### Helper (apps/admin/src/lib/api.ts)
```ts
export function classifyApiError(e: unknown): 'conflict' | 'auth' | 'notFound' | 'rate' | 'server' | 'network' | 'generic'
export function apiErrorToMessage(e: unknown, t: (k: string) => string, fallbackKey?: string): string
```
- `e instanceof ApiError` OR Error-like with numeric `.status` → status bucket:
  400/409/422→conflict · 401/403→auth · 404→notFound · 429→rate · 5xx→server;
  other statuses→generic.
- `e instanceof TypeError` (fetch network failure) → `network`.
- anything else (non-Error, status-less Error) → `generic`.
- `apiErrorToMessage` returns `t('errors.<bucket>')`; when bucket = generic and
  `fallbackKey` is provided, returns `t(fallbackKey)` so a surface keeps its specific copy.
- NEVER returns raw backend message text in ANY branch (test-pinned).

### i18n (`apps/admin/src/messages/{en,ar}.json` — `errors` namespace, 8 keys)
`conflict, auth, notFound, rate, server, network, generic, failed` — one-liners in the
what/why/next shape; EN and AR key sets identical (parity test-pinned via JSON imports).

### Migrated call sites (19; replace `e instanceof Error ? e.message : t('x')` → `apiErrorToMessage(e, tr[, '<ns>.<oldKey>'])`)
reports/[id]:64,77,98 · settings:61 · users/[id]:72 · users/page:166,193,242 ·
login:37,50,68 (new root translator `tr`) · VenueFormDrawer:206 · VenueTransferDrawer:56,80 ·
SlotManager:98,112,125 · MatchEditDrawer:79 · PitchFormDrawer:100.
EXEMPT (documented ops-line design, P2-400(d)): lib/use-data.ts:17, lib/use-live-data.ts:55.

### Tests (apps/admin/test/api-error-message.test.ts)
Status→bucket pins for ApiError AND status-shaped objects · TypeError→network ·
non-Error/status-less→generic · fallbackKey used ONLY on generic bucket ·
raw-message-never-returned pin · EN/AR key parity.

## Gate 3 checklist results
- [x] Helper pure, no backend change, no new dependency
- [x] No branch returns raw backend text (pin in test)
- [x] i18n keys exist in BOTH en.json and ar.json (parity asserted in test)
- [x] Every migrated site keeps its old specificity via fallbackKey where it had a named key
- [x] Exempt sites untouched (census grep = exactly the 2 hook files after migration)
