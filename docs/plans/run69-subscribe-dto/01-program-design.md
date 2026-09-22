# Run #69 — Gates 1–3 compact: P2-82 subscribe DTO

## Gate 1 — Product spec (compact)

- **Problem:** `POST /api/v1/notifications/subscribe` accepts any JSON body (plain interface =
  invisible to the global whitelist+forbidNonWhitelisted pipe). Garbage endpoints/keys are stored
  and only fail later during push broadcast; `locale` is persisted as a free string.
- **User story:** As a player, my push subscription is stored only if it is a real web-push
  subscription (valid https endpoint + string keys) for this app (locale ar|en) — never garbage
  that silently breaks my notifications later.
- **IN:** SubscribeDto class (endpoint @IsUrl https+require_tld, keys p256dh/auth string caps,
  locale `ar|en` enum, expirationTime allowlisted @IsOptional @IsNumber so Chrome's
  `expirationTime: null` passes); controller + service signature swap; controller spec pinning
  the contract. **OUT:** schema/migration (locale column already varchar(5)); DELETE/POST
  unsubscribe routes (already strict since run #65); send-path SSRF allowlist (exists,
  push-endpoint.validator); any PWA change (payload already compliant).
- **Success criteria:** malformed subscribe bodies → 400 with `property X should not exist` /
  validation message BEFORE any DB write; Chrome/PWA real payload (`expirationTime: null`,
  locale `ar` or `en`) → 200 `{subscribed:true}`; all gates green.

## Gate 2 — Architecture (compact)

Data flow: PWA `usePushNotifications` → `POST /notifications/subscribe` → ValidationPipe
(class-transformer + class-validator now actually run) → `NotificationsService.subscribe()`
(SSRF host allowlist, unchanged) → upsert `push_subscriptions`.

| File | Change |
|---|---|
| `apps/api/src/modules/notifications/dto/notifications.dto.ts` | ADD `PushKeysDto`, `SubscribeDto` (whitelist = the explicit expirationTime allowlist decision) |
| `apps/api/src/modules/notifications/notifications.controller.ts` | DELETE `SubscribeBody` interface + stale P2-76 comment; `subscribe(@Body() body: SubscribeDto)`; locale passed through DTO |
| `apps/api/src/modules/notifications/notifications.service.ts` | `subscribe(userId, sub: SubscribeDto, userAgent?)` — locale now INSIDE the DTO (default 'en' kept for direct/internal callers' type compat via DTO default) |
| `apps/api/src/modules/notifications/notifications.controller.spec.ts` | ADD describe: allowlist + caps + enum contract |

Risks: (1) real clients sending unexpected extra toJSON fields → mitigated by whitelisting
exactly the toJSON surface (endpoint/keys/expirationTime) + locale; (2) very old PWA bundles
sending locale outside ar|en → 400 lands on subscribe retry path which ships to Sentry (P2-16)
and re-syncs on next locale change — acceptable, VPS/staging bundle already compliant.

## Gate 3 — Program design (the contract)

### Endpoint contract (copy-paste exact)

`POST /api/v1/notifications/subscribe` (JwtCookieAuthGuard cookie)

Request body — validated NOW, previously raw:
```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/AAAA...",
  "keys": { "p256dh": "BOrf... (88 chars b64url)", "auth": "q5z... (22 chars b64url)" },
  "expirationTime": null,
  "locale": "ar"
}
```
`expirationTime` may be absent, `null`, or a number (epoch ms) — anything else (string/bool/
object) → 400. Unknown top-level or keys-level properties → 400 (`property x should not exist`).
`locale` ∈ {"ar","en"} else 400.

Success 200 (unchanged): `{ "subscribed": true }`

### TypeScript signatures (explicit)

```ts
// dto/notifications.dto.ts
export class PushKeysDto { p256dh: string /* @IsString @Length(1,256) */; auth: string /* @IsString @Length(1,64) */ }
export class SubscribeDto {
  endpoint: string;            // @IsUrl({protocols:['https'],require_tld:true}) @IsNotEmpty  — mirrors UnsubscribeDto exactly
  keys: PushKeysDto;           // @ValidateNested() @Type(() => PushKeysDto) @IsDefined
  expirationTime?: number | null; // @IsOptional() @IsNumber()
  locale?: 'ar' | 'en';        // @IsOptional() @IsIn(['ar','en'])
}
// controller
subscribe(@CurrentUser() user: { sub: string }, @Body() body: SubscribeDto, @Req() req: Request)
// service
async subscribe(userId: string, sub: SubscribeDto, userAgent?: string): Promise<{ subscribed: boolean }>
//   — locale read as body.locale ?? 'en' at the CONTROLLER boundary (service keeps signature
//     shape minus the trailing locale param to avoid a dead default two sources of truth)
```

Caps rationale: web-push p256dh ≈ 88 chars, auth ≈ 22-24 chars (b64url); 256/64 are generous
ceilings that still block garbage blobs and DB abuse.

### Frontend hook signature — UNCHANGED
`usePushNotifications(locale)` already sends `{...sub.toJSON(), locale}` — zero PWA edits.

### Adapter contract — N/A (no frontend shape change; response `{subscribed:true}` unchanged).

### i18n keys — NONE (API-only; 400s surface via existing error classification, English
validator messages are server-side convention already used by every other DTO).

## Gate 3 contract verification checklist

- [✓] Every mutation endpoint returns its documented object — subscribe returns `{subscribed:true}` (unchanged); no new mutations.
- [✓] Frontend types accept the exact JSON the backend produces — PWA sends superset (toJSON); whitelist trims unknowns rather than rejecting REAL payload fields (expirationTime allowlisted).
- [✓] Adapter functions exist — N/A (no new API shape; response byte-identical).
- [✓] No field silently undefined — `locale` controller-level `?? 'en'` mirrors old default; `expirationTime` never persisted (was never read before either).
- [✓] i18n keys exist — N/A (no user-facing string added).
- [✓] No schema/migration — locale column already varchar(5) NOT NULL default 'en'.
- [✓] Behavior-preservation proof required in slice: spec pins Chrome `expirationTime:null` + real 88-char keys PASS, and whitelist-trimmed extra keys PASS vs unknown key 400.

---

# Addendum — item 2: P2-91 push permission-denied mislabeled as "install required" (Reviewer B P1, run #69)

## Problem
`subscribe()` collapsed three fixable-but-different failures into a bare `false`:
not-installed (iOS standalone contract), permission-denied, SW/push error. The only consumer
(profile toggle) showed `common.installRequired` for EVERY failure — a user who denied browser
permission was told to install the PWA (a dead end: recovery lives in browser settings).

## Contract (Gate 3, compact)
- `usePushNotifications.subscribe(): Promise<PushSubscribeOutcome>` —
  `'ok' | 'not-installed' | 'permission-denied' | 'error'` (exported type).
- Profile toggle mapping: `not-installed` → `common.installRequired` (existing hint);
  `permission-denied` → NEW `common.permissionDenied` (EN+AR: what happened + where to fix +
  what next); `error` → toast NEW `errors.pushSubscribeFailed` (what/why/next, mirrors the
  P2-87 unsubscribe copy); `ok` → no copy (toggle flips via subscription state).
- State rename: `installHintShown: boolean` → `subscribeHint: PushSubscribeOutcome | null`.
- Hygiene (found by the new test): the mount effect's `navigator.serviceWorker.ready` promise
  gains a `.catch` — a rejecting SW registration no longer surfaces as an unhandled rejection.
- Single consumer (grep-verified): profile/page.tsx. No page test file exists for profile —
  contract pinned in test/hooks/usePushNotifications.test.tsx (5 new cases: ok / refused /
  already-denied / not-installed / error+Sentry).

## i18n keys (parity +2 leaves each)
- `common.permissionDenied`: EN "Notifications are blocked in your browser settings. Re-enable
  notifications for KoraLink there, then try again." · AR "الإشعارات محظورة في إعدادات المتصفح.
  أعد تفعيل إشعارات كورا لينك من هناك ثم حاول مجددًا."
- `errors.pushSubscribeFailed`: EN "We couldn't turn notifications on. Nothing was changed —
  check your connection and try again." · AR "لم نتمكن من تفعيل الإشعارات. لم يتغيّر شيء —
  تحقّق من اتصالك وحاول مجددًا."

## Checklist
- [✓] Mutation contract: N/A — no API change (hook-internal contract + copy).
- [✓] Every user-facing string i18n'd EN+AR (2 new leaves each, parity test pins).
- [✓] Error-message standard: what happened + why + what next (both new keys).
- [✓] No dead UI: hint renders per-outcome; error path toasts (no silent failure).
- [✓] role="status" retained on the hint line; toast pattern matches P2-87.
