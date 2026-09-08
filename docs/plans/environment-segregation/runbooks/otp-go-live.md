# OTP Go-Live (Phase 1) — Unifonic wiring on Render

> Tier **T2** end-to-end. Prerequisite: Abdullah provides the Unifonic **AppSid**.
> Delivery per devops-cycle §7: he ADDS it to `.deploy-tokens` as `KL_PROD_UNIFONIC_APP_SID`
> and tells the agent only the NAME — never the value in chat.

## Preconditions

- [ ] Phase 0 complete: segregation live, promote flow proven at least once
- [ ] Staging matrix green; no factory lock held
- [ ] Render API keys available (RENDER_API_KEY in `.deploy-tokens`)

## Steps

1. Set on Render service `srv-dadabif10e5c73e207bg` (PATCH env-vars API):
   - `UNIFONIC_APP_SID=<KL_PROD_UNIFONIC_APP_SID value>`
   - `UNIFONIC_SENDER_ID=KoraLink` (if slice 3b has not already set it)
2. Wait for the auto-deploy to go `live` (env change triggers it), or trigger a deploy.
3. **Test OTP**: `POST https://koralink-api.onrender.com/api/v1/auth/request-otp` with
   Abdullah's real phone. He confirms the SMS arrives.
4. Abdullah's explicit go → flip `DEV_LOGIN_ENABLED=false` on Render (env-vars API).
5. Post-flip verification:
   - `POST /auth/dev-login` → **403** (`DEV_LOGIN_ENABLED=false`)
   - Full OTP login E2E on the Vercel PWA: request-otp → verify-otp → `/users/me` 200
   - PWA prod chunk-grep: dev-login markers absent (already true since slice 3b)
6. **Neon reset** (`neon-reset.md`) — now safe: no dev-login path to dummy data.
7. Registry update (`devops-cycle` §1): PROD API row → "OTP live, dev-login OFF"; ops-log entry.

## Rollback (any step)

- `UNIFONIC_APP_SID` → empty (SMS falls back to log-only, code-verified safe path)
- `DEV_LOGIN_ENABLED` → `true` (restores demo dev-login; F3 risk note re-applies)
