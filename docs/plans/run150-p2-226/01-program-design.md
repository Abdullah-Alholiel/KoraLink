# Run #150 — P2-226 Terminal-error retirement (Gates 1–3 compact)

## Gate 1 — Product
**Problem:** a permanently-rejected offline chat send (DM conversation deleted → 404, banned
→ 403) is re-POSTed by the ~5s watcher poll every cycle until the 7-day TTL — steady
network/battery churn and a failure flip on every flush-listener fire.
**User story:** as a player whose DM thread was deleted while offline, I want my failed
message to stop retrying forever and show a terminal failed state I can see, instead of the
app silently hammering the server for a week.
**In scope:** both queues (DM + match chat), terminal classification, retirement, listener
failure event parity. **Out of scope:** server retry semantics, new i18n strings, queue
generalization (the two modules stay parallel, never merged).
**Success criteria:** terminal statuses (404/403, any ≥400 except 408/429/5xx) retire the
entry in ONE flush; transient (network TypeError, 408, 429, 5xx) keeps today's behavior;
all suites green; turbo build green.

## Gate 2 — Architecture
- `apps/player-pwa/src/lib/offline-dm-queue.ts`: classify in flush catch → on terminal,
  remove entry (existing `removeOfflineDm`), notify listeners with failure(terminal=true);
  `flushFailureListener` type widened with a `terminal` flag (additive, optional param).
- `apps/player-pwa/src/hooks/useMessages.ts`: same classification in flush catch; terminal →
  `discardOfflineMessage` + existing failure listener path (bubble failed; no re-POST).
- `src/lib/fetcher.ts` `FetchError` is the classifier source: terminal ⇔
  `err instanceof FetchError && s >= 400 && s !== 408 && s !== 429 && s < 500` … plus 5xx
  excluded ⇒ effectively `s >= 400 && ![408,429].includes(s) && s < 500`.
- Shared helper (small, local): `isTerminalQueueError(e): boolean` exported from
  offline-dm-queue? NO — match-chat must not import the DM module. Each module gets the
  same ~6-line predicate inline (documented parallel, per the never-generalize contract).

## Gate 3 — Contract (exact)
```ts
// both flush catches:
catch (err) {
  const terminal = err instanceof FetchError
    && err.status >= 400 && err.status !== 408 && err.status !== 429 && err.status < 500;
  if (terminal) { /* remove entry + notify terminal failure */ }
  else { /* today's transient path: continue, leave queued */ }
}
```
- DM listeners: existing `flushFailureListener = (entry, meta?) => void`; terminal meta
  `{ terminal: true }` additive/optional — existing subscribers unaffected.
- Match chat: unchanged `fn(null, entry)` signature; retirement is the behavioral delta.
- i18n: ZERO new keys (failed bubble copy already shipped via messages.queuedOffline /
  existing failed states).
- Tests (both suites): retire on 404; retire on 403; transient on 408; transient on 429;
  transient on non-FetchError TypeError; no re-POST on subsequent flush after retirement.

### Gate 3 checklist
- [x] No API surface change — PWA-only lane; no DTO/endpoint touched
- [x] Frontend types accept existing shapes; only additive optional listener meta
- [x] Adapters untouched (no API shape consumed changes)
- [x] No field silently undefined; no new i18n keys required (parity 1099=1099 preserved)
