# Locale-aware transactional email — Gate 1-3 compact + status

## Problem (user story)
As a player/partner whose app language is English, I receive every transactional email
(payout receipts, match cancellations, verifications) in Arabic. The mailer hardcodes
`locale:'ar'` because it has no per-user preference to read. Arabic-first market softens it,
but EN-preferring users get mail they may not read — money-adjacent parity gap (P2-264).

## Scope
IN: `users.locale` column (varchar(5), NOT NULL, default 'ar', backfill = no-op on existing
rows → everyone stays 'ar' until they toggle) · mailer resolution (recipientsFor +
sendVerificationEmail read the column) · PATCH /users/me accepts `locale` ('ar'|'en',
whitelist) · GET /users/me returns it · PWA LanguageToggle fire-and-forget sync (keepalive,
auth-guarded, silent-fail) · PWA GET /users/me wiring untouched (adds the field to the
adapter's output type only if present — checked below) · specs (API) · i18n: none needed
(user-visible strings unchanged; toggle endonyms are universal).
OUT: signup-time locale capture (auth DTOs) — follow-up · email preference center ·
per-category mutes.

## Exact API contract (Gate 3)
1. `GET /users/me` → adds `"locale": "ar" | "en"` to the existing object (server truth;
   existing consumers unaffected — additive field).
2. `PATCH /users/me` body MAY include `locale: 'en'` — 200 with the updated user object
   (same shape as today + locale). Invalid value → 400 (`locale must be one of: ar, en`).
   UpdateProfileDto gains `@IsOptional() @IsIn(['ar','en']) locale?: 'ar' | 'en'`.
   updateProfile `.returning()` adds `locale: users.locale` (bare-row return documented
   leaf convention — users row, no relations; matches existing shape).
3. `mailer.recipientsFor()` SELECT adds `users.locale`; recipient locale = `r.locale === 'en'
   ? 'en' : 'ar'` (default-protective cast — column is notNull default 'ar').
4. `sendVerificationEmail()` SELECT adds `users.locale`, same resolution, passes into
   deliver(). (Verification mail before first toggle = 'ar' — Saudi default unchanged.)
5. PWA: LanguageToggle `switchTo()` → `void fetch('/api/v1/users/me', {method:'PATCH',
   headers:{'Content-Type':'application/json', credentials... via lib/fetcher? no — toggle
   has no QueryClient context; use keepalive fetch with credentials:'include'},
   body: JSON.stringify({locale: to}), keepalive: true}).catch(() => {})` — fire-and-forget
   BEFORE navigatePreservingLocale reload (keepalive survives the unload). Auth 401 on
   /login surfaces = silent by design (not logged-in users have no preference to sync).
   next-intl locale prefix: the fetcher base URL is relative → use the absolute-path form
   the app already uses (`/api/v1` behind the same origin proxy on staging; prod PWA→API is
   cross-origin, so credentials:'include' + the API's CORS allowlist on the PWA origin
   already covers PATCH /users/me — the user is authenticated by the HttpOnly cookie).

## TS signatures
- `users.locale: string` (drizzle varchar col) — schema.ts users table.
- `UpdateProfileDto.locale?: 'ar' | 'en'`.
- `MailRecipient.locale: MailLocale` (unchanged type — value now resolved).
- LanguageToggle: no prop changes (self-contained sync inside switchTo).

## Contract verification checklist
- [x] Mutation shape: PATCH /users/me keeps its documented return (user row + locale) —
      leaf-table convention already in place; no relations promised.
- [x] Frontend types: PWA ProfileUser type gains optional `locale?: string` only where
      consumed (adapter passthrough; toggle does NOT read it — it sends).
- [x] Adapter functions: none new (additive field).
- [x] No silently-undefined field: mailer resolves with a default-protective ternary; PWA
      never depends on reading locale back.
- [x] i18n keys: none added (no user-visible copy change).

## Migration
`0055_users_locale.sql` (hand-written convention): `ALTER TABLE users ADD COLUMN locale
varchar(5) NOT NULL DEFAULT 'ar';` + journal entry (idx 56, version 7, breakpoints true,
when strictly increasing) + prevId-linked snapshot copy of 0054's. NOT applied to staging
live until build+tests green (Phase 4.5 rule: code commits FIRST, then migrate, then restart).
