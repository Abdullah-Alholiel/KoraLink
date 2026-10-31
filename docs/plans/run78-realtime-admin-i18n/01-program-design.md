# Run #78 — Program design (Gates 1-3 compact) + status

## Item 1 — P2-114 realtime hardening (PR #39, lane `01a0de5e`)

**Problem.** The WS rate limiter's per-socket buckets give a flooder a fresh 10/10s window on every reconnect
(cheap reconnects defeat flood control). WS handlers accept unbounded `clientMessageId` (raw PG error leak) and
arbitrary room-id strings (hardening gap — membership is the real gate, but nothing shape-checks ids at the boundary).

**User story.** As a player in a match lobby, I am protected from spam even if a bot reconnects in a loop; no
handler ever leaks a database driver error to my socket.

**Scope.** IN: rate-limit dual-bucket consume + bounded Map lifecycle; 36-char clientMessageId cap (REST DTO
parity); UUID-shape checks on the 8 room-id handlers; +20 behavioral tests. OUT: Redis-backed budgets (single-VPS);
P2-111 terminal-status predicate (separate boarded item); disconnectUser cross-node semantics (scaling cycle).

**Contract (unchanged externally).**
- `consume(primaryKey: string, userKey?: string): { allowed: boolean; retryAfterSec: number }` — new optional 2nd
  param; all three call sites pass `client.userId`.
- New WS rejections (all `WsException`): `'Invalid id format.'` (non-UUID ids), `` `clientMessageId must be at most
  36 characters.` `` — client-visible strings only in error paths that previously crashed or leaked internals.
- REST/WS parity kept: 2000-char content cap and membership checks untouched; leave-* handlers keep their
  deliberate un-gating (shape check only).

**Gate 3 checklist.**
- [x] No API/DTO shape changes — WS-only hardening; REST twins already cap both fields.
- [x] Frontend types unaffected (no adapter/hook/i18n surface in scope; server WsException messages land in existing
      toast error paths).
- [x] Every new behavior pinned by a test: dual-bucket allow/block, fresh-socket block, cross-socket sharing,
      release-no-refill, denial-stamps-nothing, sweep-bounded, 36-char cap ×2, 8 shape-rejects + happy paths.
- [x] No DB migration (no schema change). No i18n keys (server-side error strings, existing convention).

**Slices.** Slice 1: rate-limit dual-bucket + spec (lane). Slice 2: gateway caps + shape checks + specs (lane).
Both landed as one reviewed commit `4d535c1` → PR #39 (lane output was uncommitted; parent reviewed hunk-by-hunk,
ran gates, committed).

## Item 2 — P2-104 settings i18n + save-error UX (PR #38, parent-built)

**Problem.** HQ settings renders its 4 editable labels as hardcoded English (P2-104); Arabic-first admins get
English on the only config surface they can write to. Save/action failures in settings + users pages are swallowed
(`try { … } finally { … }`, no catch) — an admin gets zero feedback on a 400/403 (Reviewer A run #78 IMPORTANT).

**User story.** As an Arabic-first admin, every label and every failure on the settings page is in Arabic, and a
failed save tells me what happened and what to do next.

**Contract.**
- i18n (`apps/admin/src/messages/{en,ar}.json`): NEW `hq.labelPlatformMargin`, `hq.labelGracePeriod`,
  `hq.labelPayoutCadence`, `hq.labelRefundPolicy`, `hq.save`, `hq.saveFailed` (+`{error}` param), `hq.actionFailed`
  (+`{error}`), `common.saveFailed` (+`{error}`). Leaf parity: 613/613 both locales, zero diff (script-verified).
- `KNOWN_SETTINGS` type: `{ key, label, type }` → `{ key, labelKey, type }`; label rendered via `t(s.labelKey)`.
- settings `save(key, raw)`: catch → `saveError` state → `role=alert` banner `t('saveFailed', { error })`;
  fallback `ts('failed')` (key exists). users `act(id, body)`: catch → `actionError` state → banner
  `t('actionFailed', { error })`; fallback `ts('failed')` (PR-Agent minor fixed: originally `t('failed')` =
  missing `hq.failed`).

**Gate 3 checklist.**
- [x] EN+AR parity exact for every new key (script check, 613/613).
- [x] No endpoint/DTO changes; purely client-side render + error state.
- [x] `role=alert` on both banners (a11y); errors keep what+why+next wording (API message + "Save failed:" frame).
- [x] Gates: admin tsc 0 · turbo 3/3 --force (3m10s, 0-cached) · vitest 752/752.

## Status

| Gate | Name | Status |
|------|------|--------|
| 0 | Retrospective | ✅ DONE ([00-retro.md](./00-retro.md)) |
| 1 | Product Spec | ✅ compact (above) |
| 2 | Architecture | ✅ compact (above) |
| 3 | Program Design | ✅ compact (above, checklist explicit) |
| 4 | Vertical Slices | ✅ PRs #38 + #39 (CI-gated; merge on green) |
