import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { verifyCaptchaOrThrow } from '../../common/captcha/verify-captcha';
import type { TurnstileService } from '../../common/captcha/turnstile.service';

/**
 * P2-382 (run #219) — Turnstile PARITY TRIPWIRE.
 *
 * The phone (auth.controller.ts) and email (email-auth.controller.ts) OTP-send
 * routes must arm the captcha gate IDENTICALLY when TURNSTILE_ENABLED flips on.
 * This spec reads both controller + DTO sources and pins the structure.
 *
 * Regexes are deliberately TOLERANT: whitespace / newline / quote flexible,
 * presence + count assertions only — never exact lines (a prior tripwire broke
 * CI on a benign whitespace refactor).
 */

const AUTH_DIR = __dirname;
const read = (rel: string): string => readFileSync(join(AUTH_DIR, rel), 'utf8');

/** Strip // line comments and /* block comments *\/ so prose can't satisfy or break a pin. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

/**
 * Body of `async <name>(...) { ... }` — from the method signature up to the
 * next decorated route (or end of file). Tolerant of params spanning lines
 * and of decorator formatting.
 */
function methodBody(src: string, name: string): string {
  const start = src.search(new RegExp(`async\\s+${name}\\s*\\(`));
  if (start < 0) throw new Error(`method ${name} not found`);
  const rest = src.slice(start + 1);
  const next = rest.search(/\n\s*@(Post|Get|Patch|Put|Delete)\s*\(/);
  return rest.slice(0, next < 0 ? undefined : next);
}

const count = (s: string, re: RegExp): number => (s.match(new RegExp(re.source, 'g')) ?? []).length;

// Helper call: verifyCaptchaOrThrow( this.turnstile , dto.turnstileToken , ip ...
const HELPER_CALL = /verifyCaptchaOrThrow\s*\(\s*this\s*\.\s*turnstile\s*,\s*dto\s*\.\s*turnstileToken\s*,\s*ip\b/;
const DIRECT_VERIFY = /\bturnstile\s*\.\s*verify\s*\(/;
const HELPER_IMPORT = /import\s*\{[^}]*\bverifyCaptchaOrThrow\b[^}]*\}\s*from\s*['"`][^'"`]*common\/captcha\/verify-captcha['"`]/;

const ROUTES = [
  {
    label: 'phone (auth.controller.ts)',
    file: 'auth.controller.ts',
    method: 'sendOtp',
    route: /@Post\s*\(\s*['"`]send-otp['"`]\s*\)/,
    otpWrite: /this\s*\.\s*authService\s*\.\s*sendOtp\s*\(/,
  },
  {
    label: 'email (email-auth.controller.ts)',
    file: 'email-auth.controller.ts',
    method: 'sendEmailOtp',
    route: /@Post\s*\(\s*['"`]send-otp['"`]\s*\)/,
    otpWrite: /this\s*\.\s*emailOtpService\s*\.\s*requestEmailOtp\s*\(/,
  },
] as const;

describe('Turnstile parity tripwire (P2-382)', () => {
  describe.each(ROUTES)('$label send-otp gate', ({ file, method, route, otpWrite }) => {
    const src = stripComments(read(file));
    const body = methodBody(src, method);

    it('declares the send-otp route', () => {
      expect(route.test(src)).toBe(true);
    });

    it('imports the shared helper from common/captcha/verify-captcha', () => {
      expect(HELPER_IMPORT.test(src)).toBe(true);
    });

    it('calls the shared helper EXACTLY ONCE in the send route', () => {
      expect(count(body, HELPER_CALL)).toBe(1);
    });

    it('retains NO direct turnstile.verify(...) call anywhere in the controller', () => {
      expect(count(src, DIRECT_VERIFY)).toBe(0);
    });

    it('awaits the gate BEFORE the OTP write (and the write happens exactly once)', () => {
      expect(count(body, otpWrite)).toBe(1);
      const gateAt = body.search(new RegExp(`await\\s+${HELPER_CALL.source}`));
      const writeAt = body.search(otpWrite);
      expect(gateAt).toBeGreaterThanOrEqual(0);
      expect(writeAt).toBeGreaterThan(gateAt);
    });
  });

  it('both controllers inject TurnstileService the same way', () => {
    const inject = /private\s+readonly\s+turnstile\s*:\s*TurnstileService\b/;
    for (const r of ROUTES) {
      expect(count(stripComments(read(r.file)), inject)).toBe(1);
    }
  });

  describe('DTOs', () => {
    // `turnstileToken?: string;` in the send DTO class, behind @IsOptional.
    const FIELD = /@IsOptional\s*\(\s*\)[\s\S]{0,200}?\bturnstileToken\s*\?\s*:\s*string\s*;/;

    it.each([
      ['dto/send-otp.dto.ts', 'SendOtpDto'],
      ['dto/email-otp.dto.ts', 'EmailSendOtpDto'],
    ])('%s (%s) declares the optional turnstileToken field', (rel, cls) => {
      const src = stripComments(read(rel));
      const classStart = src.search(new RegExp(`export\\s+class\\s+${cls}\\b`));
      expect(classStart).toBeGreaterThanOrEqual(0);
      const nextClass = src.slice(classStart + 1).search(/export\s+class\s+/);
      const classSrc = src.slice(classStart, nextClass < 0 ? undefined : classStart + 1 + nextClass);
      expect(count(classSrc, /\bturnstileToken\s*\?\s*:\s*string\s*;/)).toBe(1);
      expect(FIELD.test(classSrc)).toBe(true);
    });
  });

  describe('documented 400-vs-throw asymmetry', () => {
    const FLAG_ON = /surfaceCaptchaAs400\s*:\s*true/;

    it('email send route opts into the 400 CAPTCHA surface (202 anti-enumeration contract)', () => {
      const body = methodBody(stripComments(read('email-auth.controller.ts')), 'sendEmailOtp');
      expect(count(body, FLAG_ON)).toBe(1);
      expect(body).toMatch(/requestEmailOtp/); // sanity: right method sliced
    });

    it('phone send route does NOT set the flag (shared coded-exception path)', () => {
      const src = stripComments(read('auth.controller.ts'));
      expect(count(src, /surfaceCaptchaAs400/)).toBe(0);
    });

    it('email route keeps the 202 Accepted status', () => {
      const src = stripComments(read('email-auth.controller.ts'));
      expect(src).toMatch(/@HttpCode\s*\(\s*HttpStatus\s*\.\s*ACCEPTED\s*\)/);
    });
  });

  describe('verifyCaptchaOrThrow behavior', () => {
    const svc = (verify: jest.Mock) => ({ verify }) as unknown as TurnstileService;
    const required = () =>
      new BadRequestException({ message: 'Human verification required.', code: 'CAPTCHA_REQUIRED' });

    it('flag-off passthrough: resolves when the service resolves, forwarding token + ip', async () => {
      const verify = jest.fn().mockResolvedValue(undefined);
      await expect(verifyCaptchaOrThrow(svc(verify), undefined, undefined)).resolves.toBeUndefined();
      await expect(
        verifyCaptchaOrThrow(svc(verify), 't', '10.0.0.1', { surfaceCaptchaAs400: true }),
      ).resolves.toBeUndefined();
      expect(verify).toHaveBeenNthCalledWith(1, undefined, undefined);
      expect(verify).toHaveBeenNthCalledWith(2, 't', '10.0.0.1');
    });

    it.each([false, true])(
      'coded 400 CAPTCHA_REQUIRED propagates as the SAME exception (surfaceCaptchaAs400=%s)',
      async (flag) => {
        const err = required();
        const verify = jest.fn().mockRejectedValue(err);
        await expect(
          verifyCaptchaOrThrow(svc(verify), undefined, '1.2.3.4', { surfaceCaptchaAs400: flag }),
        ).rejects.toBe(err);
      },
    );

    it('SMS (no flag): non-HTTP errors rethrown untouched', async () => {
      const boom = new Error('boom');
      await expect(verifyCaptchaOrThrow(svc(jest.fn().mockRejectedValue(boom)), 't', undefined)).rejects.toBe(boom);
    });

    it('email (flag): non-HTTP errors normalized to 400 CAPTCHA_UNAVAILABLE', async () => {
      const out = await verifyCaptchaOrThrow(
        svc(jest.fn().mockRejectedValue(new Error('boom'))),
        't',
        undefined,
        { surfaceCaptchaAs400: true },
      ).catch((e: unknown) => e);
      expect(out).toBeInstanceOf(BadRequestException);
      expect((out as BadRequestException).getStatus()).toBe(400);
      expect((out as BadRequestException).getResponse()).toMatchObject({ code: 'CAPTCHA_UNAVAILABLE' });
    });
  });
});
