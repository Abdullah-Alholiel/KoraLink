# Run #219 — P2-382 · 01-program-design

## Problem
`auth.controller.ts` and `email-auth.controller.ts` each called the Turnstile gate directly. Nothing showed that the two gates turn on in the same way.

## Shapes

### Helper — `apps/api/src/common/captcha/verify-captcha.ts`
```ts
export interface VerifyCaptchaOptions { surfaceCaptchaAs400?: boolean }

export async function verifyCaptchaOrThrow(
  turnstile: TurnstileService,
  token: string | undefined,
  ip: string | undefined,
  opts?: VerifyCaptchaOptions,
): Promise<void>;
```
- It is a plain exported function, not a new injectable, so `auth.module.ts` and `captcha.module.ts` do not change.
- It always calls `turnstile.verify(token, ip)` exactly once.
- With `surfaceCaptchaAs400` unset (phone), a rejection is rethrown unchanged through the shared coded-exception path.
- With `surfaceCaptchaAs400: true` (email), a coded `BadRequestException` (`CAPTCHA_REQUIRED` / `CAPTCHA_INVALID` / `CAPTCHA_UNAVAILABLE`) is rethrown as the same instance. Any other error becomes `400 { code: 'CAPTCHA_UNAVAILABLE' }`, so the 202 route can never answer a captcha failure with something other than a 400. Under the service contract that second case cannot happen.

### Call sites
```ts
// auth.controller.ts sendOtp
await verifyCaptchaOrThrow(this.turnstile, dto.turnstileToken, ip);
await this.authService.sendOtp(dto.phone, ip);

// email-auth.controller.ts sendEmailOtp
await verifyCaptchaOrThrow(this.turnstile, dto.turnstileToken, ip, { surfaceCaptchaAs400: true });
await this.emailOtpService.requestEmailOtp(dto.email.toLowerCase(), ip);
```

### Tripwire — `apps/api/src/modules/auth/turnstile-parity.spec.ts`
The spec reads both controllers and both DTOs with comments stripped, then checks them with tolerant regexes:
- For each send route: the helper import is present, the helper is called exactly once in the route body, the awaited helper call comes before the OTP write, and the OTP write happens exactly once.
- Neither controller contains a `turnstile.verify(` call.
- Each controller injects `private readonly turnstile: TurnstileService` exactly once.
- `SendOtpDto` and `EmailSendOtpDto` each declare `turnstileToken?: string;` once, after `@IsOptional()`.
- Asymmetry: the email route body contains `surfaceCaptchaAs400: true` exactly once, the phone controller never mentions the flag, and the email route keeps `@HttpCode(HttpStatus.ACCEPTED)`.
- Helper behavior: with the flag off it passes through and forwards its arguments; a coded 400 propagates as the same instance in both modes; any other error is rethrown unchanged for phone and turned into a 400 for email.

Mutation check: moving the email OTP write before the gate and adding back a direct `turnstile.verify` call makes 2 tripwire cases fail.

## Contract checklist
- [x] Both controllers call the single shared helper, and no direct `this.turnstile.verify(...)` call remains
- [x] Flag-off passthrough is unchanged (the service returns early and the helper adds nothing)
- [x] Phone reports a captcha failure exactly as before, and email returns 400 `CAPTCHA_*` exactly as before
- [x] `turnstile.spec.ts` is unchanged (the service contract did not move)
- [x] The parity spec pins one call per route placed before the OTP write, the DTO fields, and the email 400 asymmetry
- [x] Regexes tolerate whitespace and quote style and check only presence and counts
- [x] Auth suites and the captcha suite pass; `turbo run build --concurrency=1` passes
