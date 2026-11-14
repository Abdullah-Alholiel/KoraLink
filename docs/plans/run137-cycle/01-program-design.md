# Run #137 — Program Design (Gates 1-3 compact): P2-110 CORS noise demotion

## Problem
Scanner probes (`Origin: https://attacker.example` etc.) hitting `GET /api/v1/health` produce
130 Sentry events/24h (`KORALINK-API-B`) — the loudest signal in hztl/koralink-api, drowning
real errors. The guard WORKS; the observability misclassifies a policy refusal as an error.

## Root cause (Gate 0, proven)
Sentry's express middleware instrumentation auto-captures the HttpException thrown inside the
cors `origin` callback (`mechanism: generic, handled: true`; stack ends at
`apps/api/dist/src/main.js` `origin` via `cors/lib/index.js optionsCallback`). The
AllExceptionsFilter's ≥500-only rule (all-exceptions.filter.ts:50) never sees it. Therefore
`ignoreErrors` in `Sentry.init` is the correct drop point — log-level changes alone cannot
touch the Sentry side.

## User story
As the owner reading Sentry, I want probe noise silently dropped and only UNEXPECTED allowlist
misses (a legit deployment origin being denied = incident) reported, so a real problem is
visible within seconds of opening the project.

## Scope
IN: classification of denied origins in cors-origin.ts; distinct message for probe-shaped
denials; `ignoreErrors` entry in main.ts Sentry.init; Pino stays error-level ONLY for
infra-shaped misses (probe denials keep a pino warn via the existing filter log path — they
are still logged by AllExceptionsFilter as today; only Sentry capture changes).
OUT: allowlist content changes (NONE — posture untouched); WS gate changes (ws-origin.ts
delegates to the same originAllowed; untouched); P2-201 deny-stays-thrown invariant
(main.ts:112-121) — PRESERVED, the callback still throws.

## Design

### 1. cors-origin.ts — classification helper (pure, testable)
```ts
/** Origins whose denial is scanner/probe noise, never a misconfiguration incident:
 *  RFC 2606 reserved TLDs (.example/.test/.invalid/.localhost) + obvious scan payloads
 *  (evil.com, attacker.*, *.attacker.*, metadata IPs). Everything else (IP literals,
 *  internal hostnames, *.ts.net, real domains) = infra-shaped → keep capturing. */
export function isProbeShapedOrigin(origin: string): boolean
```
Rules (kept deliberately narrow — a false "probe" classification hides a real incident):
- lowercased trim; matches /(^|\.)example$/ or /\.(example|test|invalid|localhost)$/ (RFC 2606)
- exact known scanner payload hosts: evil.com, attacker.example, and any host whose last
  label is `attacker` or `attacker-<anything>`
- NO ip-literal or port heuristics — infra origins must classify as infra.

### 2. main.ts — classified deny message
```ts
const isProbe = isProbeShapedOrigin(origin ?? '');
callback(new HttpException(
  isProbe ? `CORS_PROBE_BLOCKED: ${origin}` : `CORS origin not allowed: ${origin}`,
  HttpStatus.FORBIDDEN,
));
```
(The message now carries the classification the Sentry pattern needs.)

### 3. main.ts Sentry.init — drop probe noise at the SDK layer
```ts
ignoreErrors: ['CORS_PROBE_BLOCKED: *'],
```
Pattern semantics to be PROVEN against the installed @sentry/node 10.70 before merge
(live captureException probe with a recording transport — see run report); fall back to
RegExp form `/^CORS_PROBE_BLOCKED: /` if the Glob `*` does not cross `/` in message text.

## Contracts (Gate 3 checklist)
- [x] Deny path STILL throws HttpException 403 for BOTH classes — P2-201 invariant kept
      (main.ts:112-121 comment updated to name the new message form).
- [x] `isProbeShapedOrigin` pure fn — no nest/config imports; sits beside normalizeOrigin.
- [x] Existing exports untouched (normalizeOrigin/originAllowed) — ws-origin.ts unaffected.
- [x] Tests: new cors-origin.spec.ts cases (reserved TLDs, attacker.* wildcard, evil.com,
      infra negatives: Tailscale IP/100.93.99.24:9450, .ts.net host, bare IP, empty-ish
      strings) + updated main.ts assertion if one exists (grep: none pins the message).
- [x] i18n: none — server-side log/telemetry only, zero user-facing copy.
- [x] No DB/migration. No DTO. No schema.

## Verification plan
`npx jest src/common/utils/cors-origin.spec.ts` in apps/api → turbo build --concurrency=1 →
tsc → lint (per lane rules) → PR → bot checks → triage PR-Agent → squash (only when green;
P2-208 owner gate still blocks the QUEUE, not this PR's readiness).
