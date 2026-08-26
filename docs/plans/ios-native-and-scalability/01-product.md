# iOS Native & Scalability — Gate 1 Product Spec

## Problem statement

1. The "wrap the Next.js build in Capacitor" recipe cannot consume the current
   server-rendered PWA build, and the **current** iOS experience is capped by an
   HTTP origin (no geolocation, no push) — so native wrapping is solving the
   wrong problem first.
2. Two forward-looking scalability items (realtime multi-instance, media
   storage) have no decided approach.

## Recommended sequencing

**Path C now → Path A only when App Store distribution becomes a product
requirement.** Rationale in `00-retro.md`.

## User stories

### P0 — Unblock the iOS PWA experience (no Capacitor)

- **US1** — As a player on iOS, geolocation works (distance + nearest-first
  sort). Requires HTTPS on PWA + API origins.
  - Operator action (blocked, documented): `sudo tailscale serve` per
    `../social-discovery/04-https-prerequisite.md` (Option B single-origin
    preferred).
  - Dev work: env swap to HTTPS origin, CSP `connect-src`/`img-src` + CORS +
    WS origin updates, `--force` rebuild, PWA reinstall.
- **US2** — As a player on iOS 16.4+, web push works after HTTPS + install.
  Verify end-to-end with a real device.

### P1 — Scalability hardening (the two real gaps)

- **US3** — Realtime survives horizontal scale: add `@socket.io/redis-adapter`
  to the gateway, **env-gated** — `REDIS_URL` unset ⇒ in-memory adapter, dev
  unchanged. Verify rooms/presence still work locally with zero config.
- **US4** — Media storage decision (pre-work for social-feed media): S3-compatible
  bucket (Cloudflare R2 or AWS S3) + presigned uploads from NestJS + CDN
  delivery; `next/image` with a custom loader for CDN URLs. Decide at
  social-discovery Gate 2, BEFORE any media slice is built.

### P2 — Native iOS via Capacitor (deferred; only when App Store is required)

- **US5** — `apps/mobile` static-export build target: shared config +
  `output:'export'`, client-side locale bootstrap replacing middleware,
  `images.unoptimized`, headers moved to `capacitor.config`.
- **US6** — Native auth: Bearer-only flow, token in `@capacitor/preferences`
  (Keychain-backed); logout clears it.
- **US7** — Native push: Capacitor Push Notifications + APNs (replaces
  web-push inside the shell only — web push stays for browser users).
- **US8** — Native geolocation plugin (bonus: no HTTPS dependency in-shell).
- **Prerequisites:** Apple Developer Program ($99/yr), Xcode on the MacBook,
  publicly reachable HTTPS API.

## Scope boundaries

**IN:** HTTPS origin rollout, env/CSP/CORS updates, Redis adapter, media
storage decision doc. **OUT:** Next.js Middleware location routing
(single-region; PostGIS already does the work), Supabase/Firebase migration
(we already run the prescribed architecture), Serwist migration (unrelated).

## Success criteria

- [ ] HTTPS origins live → geolocation verified on a real iPhone (distance
      shows, feed sorts nearest-first).
- [ ] iOS web push permission prompt + notification received on device.
- [ ] Socket.io works identically in dev (no Redis) and with `REDIS_URL` set.
- [ ] Media storage decision recorded in social-discovery plan before any
      media slice starts.
- [ ] `turbo run build` + `npx vitest run` green at every gate.

## Open questions (Gate 2)

1. HTTPS: Option A (two origins) vs Option B (single-origin rewrite) — B is
   cleaner long-term but adds a proxy hop in Next.
2. R2 vs S3 (data residency/latency for Saudi users; R2 has zero egress fees).
3. If/when Path A is triggered: one repo target or separate `apps/mobile`?
