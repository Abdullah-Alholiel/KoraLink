# Run #102 — Gates 1-3 compact (P2-146 CSV guard + P2-143 ops-feed status)

## Gate 1 — Product
- **P2-146 (security hardening):** an operator exporting users/transactions to CSV must never
  open a file where a user-controlled cell (e.g. `full_name = -1+cmd|'Calc'!A0`) executes as a
  spreadsheet formula. Success: any leading formula char — including `-` followed by an
  operator — is neutralized with a leading apostrophe; plain negative numbers stay numeric.
- **P2-143 (user-visible ops UX):** when the admin ops socket dies (reconnect exhausted) or the
  console goes offline, the notification drawer must SAY so — an operator must never confuse
  "nothing happened" with "we stopped listening". Success: drawer shows a connection-lost strip
  with a retry action, offline banner when `navigator.onLine=false`, reconnecting indicator
  while attempts are in flight; EN+AR parity.
- Out of scope: P2-147 full-set exports (48h window), P2-153 export toasts (new row), P0-2/P1-41
  owner calls.

## Gate 2 — Architecture
- Item 1 (P2-146): single-file regex change in `apps/admin/src/lib/csv-export.ts` +
  dual-exporter contract test in the PWA vitest suite (imports BOTH pure exporters — admin lib
  has no test runner; the PWA suite is the repo's only TS-test harness for pure libs). PWA fix
  rides the same test: guard path must escape `"` before quoting.
- Item 2 (P2-143): expose a status machine on the `ops-realtime` singleton
  (connecting/live/reconnecting/offline/blocked), feed it `useOnline()`; NotificationCenter
  renders a status strip above the list; retry button calls a new `reconnect()`; MINOR comment
  + Date.now init hardening ride along. No API/DB changes.

## Gate 3 — Contracts (exact shapes)
### csv-export.ts (admin)
```ts
/** Leading characters a spreadsheet would interpret as a formula (OWASP).
 * Any leading '-' is guarded only when the rest of the cell carries an operator
 * (=+@\t\r), so plain negative amounts ("-12.34") stay numeric in Excel. */
const FORMULA_PREFIX = /^[=+@\t\r]|^-(?=.*[=+@\t\r])/;
```
Property table (both exporters MUST agree; test asserts `escapeCsvField(v)` exact output):
| input | admin out | pwa out (after fix) |
|---|---|---|
| `-1+cmd\|'Calc'!A0` | `"'-1+cmd\|'Calc'!A0"` quoted | same |
| `-12.34` | `-12.34` (numeric) | `"'-12.34"` quoted (PWA is blanket-dash; acceptable, documented) |
| `=say"x"` | `"'=""say""x"""`… i.e. apostrophe + doubled quotes, quoted | same |
| `SUM(A1)` | `SUM(A1)` | `SUM(A1)` |
The shared contract = the three injection fixtures + `-1` guard; per-exporter quirks asserted
separately.

### ops-realtime status machine (admin)
```ts
export type OpsSocketStatus = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'lost';
class OpsRealtime {
  getStatus(): OpsSocketStatus;
  onStatus(cb: (s: OpsSocketStatus) => void): () => void;  // returns unsubscribe
  reconnect(): void;                                        // manual retry → back to connecting
}
```
Transitions: `connect`→live · `disconnect`(io-driven)→reconnecting · attempts exhausted
(`reconnect_failed`)→lost · `!navigator.onLine`→offline (supersedes all) · `reconnect()` resets
attempts and calls `socket.connect()`. NotificationCenter subscribes; strip copy:
- live → nothing rendered
- connecting → subtle "Connecting…" line
- reconnecting → amber strip "Connection interrupted — retrying (N/M)"
- lost → red strip "Live feed lost — events may be missing" + [Retry] button
- offline → gray strip "You are offline — feed paused" (via useOnline)
i18n keys (en/ar, `notifications` ns): `status.connecting`, `status.reconnecting` ({current}
{max}), `status.lost`, `status.offline`, `status.retry`. Parity enforced by existing test.

### Gate 3 checklist
- [x] No API mutation touched → return-contract rule N/A
- [x] Frontend consumes only new lib surface above; no silent-undefined fields (status typed
      union, default 'connecting' before first socket event)
- [x] Adapter contracts unchanged (no API shape change)
- [x] i18n keys added to BOTH en.json and ar.json; parity test must stay green (651→656 leaves)
