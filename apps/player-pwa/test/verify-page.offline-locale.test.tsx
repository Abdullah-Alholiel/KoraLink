import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Run #214 (P2-378 + reviewer IMPORTANT-1) source-pin tripwire for the OTP
// verify page: locale must come from next-intl (middleware default is 'ar',
// so a pathname-split fallback to 'en' desynced store/redirects from the UI),
// and the offline UX state (shared banner + blocked submit/resend with a
// localized notice) must stay wired.

const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf-8');

type Messages = Record<string, unknown>;

const countLeaves = (node: unknown): number => {
  if (node && typeof node === 'object') {
    return Object.values(node as Messages).reduce<number>(
      (sum, child) => sum + countLeaves(child),
      0,
    );
  }
  return 1;
};

describe('verify page — locale + offline tripwire (run #214 P2-378)', () => {
  const src = read('src/app/[locale]/(auth)/verify/page.tsx');
  const en = JSON.parse(read('src/messages/en.json')) as Messages;
  const ar = JSON.parse(read('src/messages/ar.json')) as Messages;

  it('derives locale via next-intl useLocale(), not a pathname split', () => {
    expect(src).toContain('useLocale(');
    expect(src).not.toContain("split('/')[1] || 'en'");
  });

  it('imports the shared online-status hook and OfflineBanner', () => {
    expect(src).toMatch(/import\s*\{\s*useOnlineStatus\s*\}\s*from\s*'@\/hooks\/useOnlineStatus'/);
    expect(src).toMatch(/import\s+OfflineBanner\s+from\s+'@\/components\/layout\/OfflineBanner'/);
    expect(src).toContain('<OfflineBanner');
  });

  it('surfaces the offlineNotice copy when blocking requests offline', () => {
    expect(src).toContain('offlineNotice');
  });

  it('verify.offlineNotice exists in BOTH en and ar with namespace parity', () => {
    const enVerify = en['verify'] as Messages;
    const arVerify = ar['verify'] as Messages;
    for (const v of [enVerify['offlineNotice'], arVerify['offlineNotice']]) {
      expect(typeof v).toBe('string');
      expect((v as string).trim().length).toBeGreaterThan(0);
    }
    expect(countLeaves(arVerify)).toBe(countLeaves(enVerify));
    expect(Object.keys(arVerify).sort()).toEqual(Object.keys(enVerify).sort());
  });
});
