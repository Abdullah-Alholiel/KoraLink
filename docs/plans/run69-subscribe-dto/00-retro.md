# Run #69 — Gate 0 Retrospective: push subscribe DTO (P2-82)

## Area audit (apps/api/src/modules/notifications + this cycle's touch points)

- Commit pattern last 8 on staging: 5 feat/fix + 3 docs — fix:feat ratio healthy (<1.5:1).
- **P2-82 confirmed live** (`notifications.controller.ts:23-66`): `subscribe` takes the plain TS
  interface `SubscribeBody`; the global ValidationPipe (main.ts:110-116, whitelist +
  forbidNonWhitelisted + transform) is invisible to interfaces, so `endpoint`/`keys.p256dh`/
  `keys.auth`/`locale` reach the service **unvalidated**. Contrast: both unsubscribe routes got a
  strict class DTO in run #65 (UnsubscribeDto, @IsUrl https-only + require_tld).
- Why it never 400s real clients today: with no DTO the pipe passes the raw body through — real
  PWA payloads land fine, but so does any malformed/garbage payload; junk keys surface later as
  web-push send failures inside the broadcast loop (Reviewer A IMPORTANT #2), and `locale` is a
  free string persisted to `push_subscriptions.locale` (varchar(5), default 'en') — only the READ
  path sanitizes it (normalizePushLocale, service:358). Reviewer A IMPORTANT #1.
- The deliberate descope (run #65 comment): Chrome's `PushSubscription.toJSON()` includes
  `expirationTime: null` and the PWA sends `{...sub.toJSON(), locale}`
  (usePushNotifications.ts:66-69, :133-136) → a naive strict DTO with forbidNonWhitelisted would
  400 every real Chrome subscribe. This gate makes the allowlist decision explicitly.
- Standing bug-class sweep (Reviewer A, 8 classes): all clean; one borderline MINOR noted
  (matches.service.ts:2046 bare `.returning()` — complete row, intentional slot-booking path,
  documented here as accepted).
- Sentry (24h): nothing new — newest API event Sep 11 (known CORS-probe noise + P1-41 blocker);
  web Sep 14 (previously triaged). No boarding.

## Findings classification

- IMPORTANT (builds this cycle): P2-82 subscribe DTO + locale enum + key length caps
  (Reviewer A both IMPORTANCEs fold into this scope).
- MINOR (accepted, no code): wallet.service.ts:135 no FOR UPDATE on users row (single atomic
  SQL increment — safe today); wallet.controller.ts:63-80 topup referenceId untyped (dummy path,
  tightens with P0-2); matches.service.ts:2046 bare returning (complete row).
- P1 product lead (Reviewer B): play feed empty state conflates zero-API vs filtered-empty
  (play/page.tsx:181-197) — same pattern run #68 fixed on clubs. PWA lane, NEXT run (this run is
  the API lane; the fix deserves its own slice + tests mirroring the clubs pattern).

## Previous-run verification (claims ≠ facts)

Run #68 fe546c9 (P2-13 residual) — VERIFIED DONE ✅ (parent + Reviewer B independently):
FILTER_KEYS pinned, Nearby = stable ascending distance_m sort (null last, ties stable),
noClubsEmpty EN+AR (line 718 both), page.test 7/7 + i18n 6/6, full vitest 91f/642t green,
turbo build 3/3 green.

## Decision

Proceed to Gate 1 — scope: ONE vertical slice, subscribe endpoint validation. No schema change
(locale column already varchar(5) NOT NULL default 'en'); no migration; no i18n (API-only 400s);
PWA payload already compliant with the chosen allowlist.
