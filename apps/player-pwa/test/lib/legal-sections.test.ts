import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Run #205 (launch lane F4): the PDPL-structured legal pages render from a
// section-array contract — every key referenced by a page MUST exist in BOTH
// en + ar message files (leaf parity is machine-checked here, not by eyeball),
// and the draft-pending-lawyer banner must stay wired (launch condition 4:
// these pages go to a lawyer BEFORE they can be called final).

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf-8');

const extractLegalKeys = (source: string) =>
  Array.from(source.matchAll(/'(privacy|terms)[A-Za-z0-9]+'/g)).map((m) =>
    m[0].slice(1, -1),
  );

describe('legal pages i18n contract (run #205 F4)', () => {
  const en = JSON.parse(read('src/messages/en.json')).legal;
  const ar = JSON.parse(read('src/messages/ar.json')).legal;
  const privacySrc = read('src/app/[locale]/privacy/page.tsx');
  const termsSrc = read('src/app/[locale]/terms/page.tsx');

  it('EN and AR legal namespaces carry identical key sets', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ar).sort());
  });

  it('privacy page references only keys that exist in BOTH locales', () => {
    const keys = extractLegalKeys(privacySrc);
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect(en, `en.json legal.${key} missing`).toHaveProperty(key);
      expect(ar, `ar.json legal.${key} missing`).toHaveProperty(key);
    }
  });

  it('terms page references only keys that exist in BOTH locales', () => {
    const keys = extractLegalKeys(termsSrc);
    expect(keys.length).toBeGreaterThan(15);
    for (const key of keys) {
      expect(en, `en.json legal.${key} missing`).toHaveProperty(key);
      expect(ar, `ar.json legal.${key} missing`).toHaveProperty(key);
    }
  });

  it('pages render the draft-pending-lawyer banner (not silently final)', () => {
    expect(privacySrc).toContain('draftBanner');
    expect(termsSrc).toContain('draftBanner');
    expect(en.draftBanner).toMatch(/Draft|pending lawyer/i);
    expect(ar.draftBanner).toContain('مسودة');
  });

  it('effective date is an i18n key, not hard-coded in JSX', () => {
    expect(privacySrc).toContain("t('lastUpdatedValue')");
    expect(termsSrc).toContain("t('lastUpdatedValue')");
    expect(privacySrc).not.toMatch(/August 2026/);
    expect(termsSrc).not.toMatch(/September 2026/);
  });

  it('PDPL structure: privacy carries rights, retention, transfers, breach, complaints sections', () => {
    for (const key of [
      'privacyRightsH',
      'privacyRetentionH',
      'privacyTransfersH',
      'privacyBreachH',
      'privacyComplaintsH',
      'privacyLawfulBasisH',
    ]) {
      expect(en[key]?.length ?? 0).toBeGreaterThan(10);
      expect(ar[key]?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it('terms carries governing law + liability + refund-window sections', () => {
    for (const key of ['termsLawH', 'termsLiabilityH', 'termsRefundH']) {
      expect(en[key]?.length ?? 0).toBeGreaterThan(10);
      expect(ar[key]?.length ?? 0).toBeGreaterThan(10);
    }
    // refund rule matches the shipped 12h decision (D-20261110-06)
    expect(en.termsRefundBody1).toContain('12 hours');
    expect(ar.termsRefundBody1).toContain('١٢ ساعة');
  });
});
