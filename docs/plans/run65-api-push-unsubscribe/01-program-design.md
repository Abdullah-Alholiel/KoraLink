# Run #65 — Program Design: POST /notifications/unsubscribe (+ class DTOs)

Cycle: `run65-api-push-unsubscribe` · Item: P2-76 (1) · Gates 0–3 approved autonomously
(factory loop autonomous mode, hard gates apply).

## Problem

`DELETE /notifications/unsubscribe` carries the push endpoint (a secret-ish web-push URL) in
the request BODY. Several legitimate proxies/clients drop DELETE bodies → the scoped delete
matches nothing (or 400s on validation once DTOs exist) → the user *thinks* they unsubscribed
and keeps receiving pushes. Broken user flow on a permission/trust surface.

## User story

As a player, when I turn off push notifications (or my push key rotates), the unsubscribe
must actually reach the server regardless of what network path my device uses.

## Scope

IN: new `POST /notifications/unsubscribe` (JSON body, class-DTO validated, idempotent),
deprecated legacy `DELETE` dual-route kept byte-compatible for deployed clients, class DTO
for **unsubscribe** (ValidationPipe finally validates it), PWA hook flips to POST,
i18n: none (no user-facing copy change), tests both sides.
OUT: **subscribe stays on its plain interface this slice** — `sub.toJSON()` can carry
`expirationTime: null` (Chrome) and the global pipe is `forbidNonWhitelisted:true`
(main.ts:110-113), so a strict SubscribeDto would 400 real subscribes; follow-up noted on
the board row (needs an explicit allowlist decision: `@Allow()` expirationTime or strip).
Also OUT: P2-76 (2) critical-event non-push channel (folds into P1-41 owner decision),
in-app notifications table (Reviewer A sizing caution — that is a separate slice, NOT this
one), GET-variant (POST bodies are never proxy-stripped; GET would leak endpoint tokens into
server logs), P0-5 per-match/venue granularity (Reviewer B lead, decisions queue).

## API contract (exact JSON)

New: `POST /api/v1/notifications/unsubscribe`
Request: `{"endpoint": "https://fcm.googleapis.com/fcm/send/..."}` (validated:
IsUrl requiring https + host; see DTO below).
200 → `{"unsubscribed": true}` (unchanged shape — backward compatible).
400 → 400 "endpoint must be a valid https URL" shape from ValidationPipe
(also fires for a MISSING body now, which the old interface never produced).
Legacy: `DELETE /api/v1/notifications/unsubscribe` with JSON body — same body DTO, same
response; controller-level `@Header('Deprecation', ...)`-style code comment marks it
sunset (no wire-visible Deprecation header added — keep contract byte-identical).

## TS signatures

```ts
// notifications/dto/notifications.dto.ts (new)
export class UnsubscribeDto { @IsUrl({ require_tld: true }) @IsNotEmpty() endpoint!: string; }
// controller
@Post('unsubscribe') unsubscribe(@CurrentUser() u:{sub:string}, @Body() b:UnsubscribeDto)
@Delete('unsubscribe') unsubscribeDelete(@CurrentUser() u:{sub:string}, @Body() b:UnsubscribeDto)
// service — UNCHANGED: async unsubscribe(userId: string, endpoint: string): Promise<{unsubscribed:boolean}>
// PWA hook: fetcher('/notifications/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) })
```

## Risks / mitigations

- Old PWA bundles still call DELETE-with-body → legacy route kept, same DTO+response.
- Over-strict URL validation rejecting real FCM endpoints → `@IsUrl` with default options
  accepts `https://fcm.googleapis.com/...`; require_tld fine (public push services only).
- PWA tests mocking fetch: none pin the method (ProfilePage mocks the hook) → safe flip;
  new hook test pins POST.
- ValidationPipe `forbidNonWhitelisted` on legacy DELETE with an extra field → old bundles
  send exactly {endpoint} → no break.

## Gate 3 contract verification checklist

| Item | Result |
|---|---|
| Every mutation returns fully populated object with relations | n/a — delete endpoint; contract is `{unsubscribed:true}` (unchanged, verified service:133-145) |
| Frontend types accept the exact JSON backend produces | ✓ hook ignores response body (await only); P2-73-era fetcher types unchanged |
| Adapter functions exist for every API shape consumed | ✓ no adapter involved (raw fetcher call in usePushNotifications.ts:108-111) |
| No field silently undefined | ✓ single required field `endpoint`; DTO makes absence a 400 instead of silent |
| i18n keys exist for every user-facing string | ✓ no new user-facing strings; offline ns untouched |

## Slices

1. **Tracer:** DTO file + controller POST route → jest tripwire (DTO validation + dual-route
   metadata) → tsc → api build.
2. PWA flip: hook → POST + hook-level test pin → vitest + type-check.
3. Gates: root `npm run build` 3/3 → commit → funnel smoke (no push-path change, no restart
   needed unless DTO compiled — restart API AFTER build per stale-DTO trap).
