# Run #219 — P2-382 · 00-retro (area audit)

## Scope
This run covers the Turnstile captcha gate on the two public OTP-send routes:
`apps/api/src/modules/auth/auth.controller.ts` (`POST /auth/send-otp`) and
`apps/api/src/modules/auth/email-auth.controller.ts` (`POST /auth/email/send-otp`).
No admin-portal surface is touched, so the AGENTS.md §10.1 state check does not apply.

## Recent history in the area
- `448bfe7c` (#269): the F1 launch lane added the Turnstile gate. Each controller wired `await this.turnstile.verify(dto.turnstileToken, ip)` on its own, and both DTOs gained `turnstileToken?: string`.
- `abcd6b68` (#271): added the prod dummy-secret boot guard (D-20261117-04) to `TurnstileService`.
- `7d739961` (#268): OTP codes are never logged, and phone login fails closed when SMS is not configured.

## Findings
- **Tech debt / drift risk:** the same gate call existed in two places, and nothing checked that they matched. A later edit to one route (dropping the call, moving it after the OTP write, adding an argument) would put the gates out of sync without any error once `TURNSTILE_ENABLED` is turned on.
- **Documented asymmetry:** the email route has a 202 anti-enumeration contract, so a captcha rejection must come back as a 400 `CAPTCHA_*` and must never reveal whether a send happened. The phone route uses the shared coded-exception path. Today the two behave the same, because `TurnstileService.verify` only ever throws coded `BadRequestException`s. Until now the asymmetry was recorded only in a code comment.
- **Regressions / contract breaks:** none found. The existing `turnstile.spec.ts` covers the service only. `auth.controller.spec.ts` stubs `turnstile.verify`, which the helper still calls.

## Risks of the change
- With the flag off there must be no behavior change. The helper forwards to `verify`, which returns immediately.
- A previous tripwire broke CI on a whitespace-only change. The new spec uses tolerant regexes, checks presence and counts only, and strips comments before matching.
