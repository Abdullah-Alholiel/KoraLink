import { describe, it, expect } from 'vitest';
import { formatMoney } from '@/lib/format';

/**
 * Run #112 (Reviewer-A A-2): the profile wallet row used to render a
 * hardcoded `SAR ${balance.toFixed(2)}` — Latin "SAR" + Latin digits for AR
 * users, bypassing the P2-128 locale-aware money convention. This pin holds
 * the formatMoney routing contract (the helper's digit/currency behavior is
 * pinned in format-money.test.ts).
 */

describe('profile wallet money rendering (run #112 A-2 pin)', () => {
    it('profile page routes the wallet row through formatMoney — no hardcoded SAR template', async () => {
        const fs = await import('node:fs');
        const src = fs.readFileSync(
            'src/app/[locale]/(main)/profile/page.tsx', 'utf8',
        );
        // The convention import is present.
        expect(src).toContain("import { formatMoney } from '@/lib/format'");
        // The endText branch calls the helper.
        expect(src).toContain('formatMoney(displayBalance, intlLocale)');
        // The hardcoded template is gone.
        expect(src).not.toContain('`SAR ${displayBalance.toFixed(2)}`');
    });

    it('formatMoney keeps the en historical shape the wallet row relied on', () => {
        // Byte-shape guard: the swap must not shift what EN users see.
        expect(formatMoney(1234.5, 'en')).toMatch(/^SAR[\s\u00a0]?1,234\.50$/);
    });
});
