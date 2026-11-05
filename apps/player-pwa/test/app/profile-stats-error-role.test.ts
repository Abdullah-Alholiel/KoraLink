import { describe, it, expect } from 'vitest';

/**
 * Run #189 — P2-310 tripwire: the profile stats error block announces itself
 * to screen readers. Reviewer B run-#189: the block had retry + localized
 * copy but NO live region, so stats-fetch failures were silent for SR users
 * (the wallet page's identical block announces since P2-260). PR-Agent r3:
 * a live region that mounts together with its message is not reliably
 * announced — the tripwire pins the PERSISTENT sr-only announcer shape
 * (always-present role=status + aria-live, content toggles).
 */
describe('profile stats error a11y (run #189 P2-310 pin)', () => {
    it('stats bar carries a persistent role=status live region fed by the stats error', async () => {
        const fs = await import('node:fs');
        const src = fs.readFileSync(
            'src/app/[locale]/(main)/profile/page.tsx',
            'utf8',
        );
        // Persistent announcer: role=status + aria-live + sr-only, always mounted.
        expect(src).toMatch(/<span role="status" aria-live="polite" className="sr-only">/);
        // The announcer renders the stats error message.
        expect(src).toMatch(/statsError \? t\(errorKey\(classifyError\(statsError\)\)\) : ''/);
        // Retry affordance stays wired (re-scoped finding: retry already existed).
        expect(src).toContain('refetchStats()');
    });
});
