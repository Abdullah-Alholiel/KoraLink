/**
 * Structure regression guard — BOUNDARY COPY i18n (P2-138).
 *
 * ErrorBoundary's fallback used to hardcode English copy. It now resolves
 * titleKey/descriptionKey (routeError ns) and retryKey (common ns) inside a
 * hook-capable FallbackCard, and the (main) layout scopes a 'surface' boundary
 * around the routed content so app chrome survives a crash.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PWA_ROOT = join(__dirname, '../../');
const src = (p: string) => readFileSync(join(PWA_ROOT, p), 'utf8');
const json = (p: string) => JSON.parse(src(p)) as Record<string, Record<string, string>>;

describe('boundary copy i18n (P2-138)', () => {
  const boundary = src('src/components/layout/ErrorBoundary.tsx');

  it('ErrorBoundary has no hardcoded English fallback copy', () => {
    expect(boundary).not.toContain('Something went wrong');
    expect(boundary).not.toContain('Try Again');
    expect(boundary).not.toContain('An unexpected error occurred');
    expect(boundary).not.toMatch(/>\s*Error details\s*</);
  });

  it('ErrorBoundary exposes variant + i18n key props', () => {
    for (const prop of ['variant?:', 'titleKey?:', 'descriptionKey?:', 'retryKey?:']) {
      expect(boundary).toContain(prop);
    }
    expect(boundary).toContain("useTranslations('routeError')");
  });

  it('(main) layout wraps routed content in a surface boundary inside the chrome', () => {
    const layout = src('src/app/[locale]/(main)/layout.tsx');
    expect(layout).toContain('variant="surface"');
    const surface = layout.indexOf('variant="surface"');
    expect(surface).toBeLessThan(layout.indexOf('<ScrollableMain>'));
    expect(surface).toBeLessThan(layout.indexOf('<BottomNav />'));
    expect(layout.indexOf('<BottomNav />')).toBeGreaterThan(layout.indexOf('</ScrollableMain>'));
  });

  it.each(['en', 'ar'])('%s catalog has routeError.{title,description,details}', (locale) => {
    const re = json(`src/messages/${locale}.json`).routeError;
    expect(Object.keys(re).sort()).toEqual(['description', 'details', 'title']);
    for (const v of Object.values(re)) expect(v.length).toBeGreaterThan(0);
  });
});
