/**
 * Structure regression guard — ROUTE BOUNDARIES (P2-138).
 *
 * Every hot (main) route and match/[id] ships a route-level loading skeleton,
 * and the (main) group + match/[id] ship scoped error boundaries that report
 * via captureError and render classified copy through the shared RouteError.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PWA_ROOT = join(__dirname, '../../');
const src = (p: string) => readFileSync(join(PWA_ROOT, p), 'utf8');

const LOADING = [
  'src/app/[locale]/(main)/play/loading.tsx',
  'src/app/[locale]/(main)/wallet/loading.tsx',
  'src/app/[locale]/(main)/messages/loading.tsx',
  'src/app/[locale]/(main)/my-games/loading.tsx',
  'src/app/[locale]/(main)/clubs/loading.tsx',
  'src/app/[locale]/(main)/profile/loading.tsx',
  'src/app/[locale]/match/[id]/loading.tsx',
];

const ERRORS = [
  'src/app/[locale]/(main)/error.tsx',
  'src/app/[locale]/match/[id]/error.tsx',
];

const ROUTE_ERROR = 'src/components/layout/RouteError.tsx';

describe('route boundaries (P2-138)', () => {
  it.each(LOADING)('%s exists as a static status skeleton', (file) => {
    expect(existsSync(join(PWA_ROOT, file))).toBe(true);
    const s = src(file);
    expect(s).toContain('role="status"');
    expect(s).not.toContain("'use client'");
    expect(s).not.toContain('useTranslations');
  });

  it.each(ERRORS)('%s is a client boundary wired to reset + RouteError', (file) => {
    expect(existsSync(join(PWA_ROOT, file))).toBe(true);
    const s = src(file);
    expect(s).toContain("'use client'");
    expect(s).toContain('reset={reset}');
    expect(s).toContain("from '@/components/layout/RouteError'");
    expect(s).not.toContain('common.error');
  });

  it('RouteError reports via captureError and renders classified copy', () => {
    const s = src(ROUTE_ERROR);
    expect(s).toContain('captureError(error');
    expect(s).toContain('errorKey(classifyError(error))');
    expect(s).toContain('onClick={reset}');
    expect(s).not.toContain('common.error');
  });
});
