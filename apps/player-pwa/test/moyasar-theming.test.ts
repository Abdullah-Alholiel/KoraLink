import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Run #208 D4 (owner brief Part 1 defect #4b): the Moyasar hosted card form
 * must carry the app's brand, not Moyasar's default purple. The vendor CSS
 * (public/vendor/moyasar/moyasar.css, vendored copy) styles its pay button
 * with `div#mysr .bg-primary{background-color:rgb(118 141 255)!important}` —
 * we override with a later-in-document, equal-or-higher-specificity rule.
 * This pin keeps the override wired to the REAL vendor selector: if Moyasar
 * changes the class or we re-vendor a new build, the pin fails loudly
 * instead of silently reverting to purple.
 */

const repoRoot = path.resolve(__dirname, '..');
const vendorCss = fs.readFileSync(
  path.join(repoRoot, 'public/vendor/moyasar/moyasar.css'),
  'utf8',
);

// Reads the component source (NOT a build artifact) so the pin travels with
// refactors of the function name/location.
const topupSheetSrc = fs.readFileSync(
  path.join(repoRoot, 'src/components/wallet/TopupSheet.tsx'),
  'utf8',
);

describe('Moyasar form brand theming (run #208 D4)', () => {
  it('vendor css really styles the pay button via div#mysr .bg-primary (selector drift guard)', () => {
    expect(vendorCss).toMatch(/div#mysr \.bg-primary\{[^}]*background-color:rgb\(118 141 255[^}]*\}/);
  });

  it('TopupSheet injects the brand-green override scoped to the vendor root', () => {
    expect(topupSheetSrc).toMatch(/BRAND_OVERRIDES/);
    expect(topupSheetSrc).toContain('#254132'); // brand-green token value
    expect(topupSheetSrc).toContain('div#mysr .bg-primary');
    expect(topupSheetSrc).toContain('ensureMoyasarStylesheet');
  });
});
