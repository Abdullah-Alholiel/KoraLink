import { describe, it, expect } from 'vitest';

/**
 * Run #189 — P2-310 tripwire: the profile stats error block announces itself
 * to screen readers. Reviewer B run-#189: the block had retry + localized
 * copy but NO role attribute, so stats-fetch failures were silent for SR
 * users (the wallet page's identical block carries role="status" since
 * P2-260). Source-shape pin (profile-wallet-money.test.ts pattern).
 */
describe('profile stats error block a11y (run #189 P2-310 pin)', () => {
    it('stats error block carries role=status + aria-live so failures are announced', async () => {
        const fs = await import('node:fs');
        const src = fs.readFileSync(
            'src/app/[locale]/(main)/profile/page.tsx',
            'utf8',
        );
        // The statsError branch renders a live region.
        expect(src).toMatch(/statsError \? \(\s*\n\s*<div[^>]*role="status"[^>]*aria-live="polite"/);
        // Retry affordance stays wired (re-scoped finding: retry already existed).
        expect(src).toContain('refetchStats()');
    });
});
