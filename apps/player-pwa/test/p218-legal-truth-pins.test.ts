import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Run #218 (D-20261119-02, Life-OS worker request D-20261118-02): the legal
// drafts go to a lawyer NOW (launch critical path) — every claim that is false
// as of today must stay out of these pages. This tripwire bans the known
// false-today phrasings so a copy revert cannot silently reintroduce them:
//   - prod hosting is OUTSIDE the Kingdom today (moves inside at Coolify
//     cutover — D-20261106-01);
//   - login is phone OR email OTP (email OTP live since run #46) — a
//     Saudi-phone-only claim is false today;
//   - the auth cookie is Secure only when COOKIE_SECURE=true (guaranteed in
//     production; unconditional "Secure" overclaims for staging).
// When hosting actually moves inside the Kingdom, flip the hosting pins in the
// SAME commit as the cutover (owner decision D-20261106-01, not before).

// This spec lives in test/ (NOT test/lib/) — one level up = the PWA package root.
const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf-8');

describe('legal copy truth pins (run #218 D-20261119-02)', () => {
  const enRaw = read('src/messages/en.json');
  const arRaw = read('src/messages/ar.json');
  const en = JSON.parse(enRaw).legal;
  const ar = JSON.parse(arRaw).legal;

  it('EN legal ns never claims hosting inside the Kingdom as a present-today fact', () => {
    expect(enRaw).not.toMatch(/servers inside the Kingdom and/);
    expect(en.privacyTransfersBody1).toMatch(/currently run outside the Kingdom/);
    expect(en.privacyTransfersBody1).toMatch(/move inside the Kingdom at launch/);
  });

  it('AR legal ns mirrors the hosting truth (currently outside, moves at launch)', () => {
    expect(arRaw).not.toContain('بما في ذلك خوادم داخل المملكة');
    expect(ar.privacyTransfersBody1).toContain('حالياً خارج المملكة');
    expect(ar.privacyTransfersBody1).toContain('عند الإطلاق');
  });

  it('EN never claims Saudi-phone-only signup (email OTP exists)', () => {
    expect(enRaw).not.toMatch(/Saudi phone number/);
    expect(en.privacyChildrenBody1).toMatch(/phone number or email address verified by one-time code/);
    expect(en.termsAccountsBody1).toMatch(/phone number or email address verified by one-time code/);
  });

  it('AR never claims Saudi-phone-only signup (رقم سعودي banned)', () => {
    expect(arRaw).not.toContain('رقماً سعودياً');
    expect(ar.privacyChildrenBody1).toContain('رقماً للهاتف أو عنوان بريد إلكتروني');
    expect(ar.termsAccountsBody1).toContain('رقماً للهاتف أو عنوان بريد إلكتروني');
  });

  it('cookie claims scope Secure to production (privacyCookiesBody1 AND privacySecurityBody1 — r2 pin covers the section-10 overclaim too)', () => {
    expect(enRaw).not.toContain('(HttpOnly, Secure),');
    expect(en.privacyCookiesBody1).toContain('Secure in production');
    expect(ar.privacyCookiesBody1).toContain('Secure في بيئة الإنتاج');
    expect(en.privacySecurityBody1).toContain('Secure in production');
    expect(ar.privacySecurityBody1).toContain('في بيئة الإنتاج');
  });

  it('AR termsAccountsBody1 carries the one-time qualifier (EN/AR legal-meaning parity — r2)', () => {
    expect(ar.termsAccountsBody1).toContain('برمز لمرة واحدة');
    expect(en.termsAccountsBody1).toContain('verified by one-time code');
  });

  it('truth-fix kept the draft-pending-lawyer framing and EN/AR leaf parity', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ar).sort());
    expect(en.draftBanner).toMatch(/Draft|pending lawyer/i);
    expect(ar.draftBanner).toContain('مسودة');
  });
});
