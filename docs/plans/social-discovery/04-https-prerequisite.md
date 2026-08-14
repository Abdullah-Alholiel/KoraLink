# HTTPS Prerequisite — geolocation needs a secure context

**Status:** BLOCKED on sudo (no passwordless sudo for `ubuntu`; `tailscale cert`
/`tailscale serve` require root or tailscale operator privileges).

## Why

`navigator.geolocation` only exists in a **secure context** (HTTPS or
`localhost`). The PWA currently runs on `http://100.93.99.24:3000`, where the
browser exposes **no** geolocation API. The code degrades gracefully
(`status: 'unsupported'` → distance hidden, app still works), but distance/sort
won't function on-device until HTTPS is live.

Tailnet facts (verified): MagicDNS enabled, suffix `tail2948f9.ts.net`,
machine `aa.tail2948f9.ts.net`. `tailscale serve status` → "No serve config".

## Recommended fix (one of two options)

### Option A — tailscale serve (minimal, two origins)

```bash
# As root / tailscale operator (tailscale serve auto-provisions the cert):
sudo tailscale serve --bg --https=443  http://localhost:3000   # PWA
sudo tailscale serve --bg --https=8443 http://localhost:3001   # API
```

Then update `apps/player-pwa/.env` / `env.mjs`:
- `NEXT_PUBLIC_API_URL=https://aa.tail2948f9.ts.net:8443/api/v1`
- Add the new origins to API `CORS_ORIGINS` / `PLAYER_URL` (comma-separated,
  the API already supports comma-separated origins) and to the PWA CSP
  (`connect-src`/`img-src`) and the WS origin whitelist.
- Reinstall the PWA (delete + re-add home-screen icon) — the origin changed.

### Option B — single-origin via Next.js rewrite (cleanest long-term)

Add a rewrite so the PWA proxies `/api/*` → `localhost:3001`, then only the PWA
needs HTTPS:

```bash
sudo tailscale serve --bg --https=443 http://localhost:3000
```

`NEXT_PUBLIC_API_URL` becomes same-origin (`https://aa.tail2948f9.ts.net/api/v1`),
removing CORS/CSP/mixed-content complexity and the WS cross-origin issue.
Requires a small `next.config` rewrite + keeping the API bound to localhost.

## What I need from you

Either run the `sudo tailscale serve` command above (and paste the output), or
tell me it's OK to proceed and provide sudo. I'll then wire the env/CSP/CORS/WS
origins, rebuild, restart `koralink-pwa`/`koralink-api`, and verify distance
end-to-end on the phone.
