import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- deliberate cross-app contract pin (P2-146)
import { escapeCsvField as adminEscape } from '../../../admin/src/lib/csv-export';
import { escapeCsvField as pwaEscape } from '@/lib/wallet-csv';

/**
 * Shared CSV formula-injection contract (P2-146, run #102).
 *
 * The admin console and the player PWA each ship an OWASP CSV-injection guard.
 * They MUST agree on what counts as a formula cell, or a user-controlled value
 * that is safe in one export stays lethal in the other (the Opus delivery
 * audit of 2026-10-04 found exactly this drift: admin let `-1+cmd|'Calc'!A0`
 * through on `-<digit>` while the PWA blocked it).
 *
 * Contract:
 * 1. Any cell starting with = + @ TAB CR is a formula -> leading apostrophe.
 * 2. A cell starting with '-' is a formula UNLESS it is a plain decimal
 *    number ("-12.34", "-1", "-0.5") -> negative amounts stay numeric.
 * 3. Guarded cells are RFC 4180-quoted with inner quotes doubled, and the
 *    apostrophe lands INSIDE the quotes.
 * 4. Cells containing , " CR LF are quoted with quotes doubled (both exporters,
 *    guarded or not).
 */

const INJECTION_FIXTURES = [
  `-1+cmd|'Calc'!A0`, // the audit's exact bypass payload (DDE spawn)
  `-SUM(A1)`,
  `-1+1`, // dash + operator: not a plain number -> guarded
  `=cmd|' /C calc'!A0`,
  `+123`,
  `@SUM(A1)`,
  `\tTABLEAD`,
  `\rCRLEAD`,
];

const NUMERIC_NEGATIVES = [`-12.34`, `-1`, `-0.5`, `-1000`];

describe('CSV formula-injection contract — admin exporter', () => {
  it.each(INJECTION_FIXTURES)('guards %j', (cell) => {
    const out = adminEscape(cell);
    expect(out.startsWith(`"'`)).toBe(true);
    expect(out.endsWith(`"`)).toBe(true);
    expect(out.slice(2, -1)).not.toContain('"'); // inner quotes doubled away
  });

  it.each(NUMERIC_NEGATIVES)('keeps negative number %j numeric', (cell) => {
    expect(adminEscape(cell)).toBe(cell);
  });

  it('keeps plain words and safe text unquoted', () => {
    expect(adminEscape('SUM(A1)')).toBe('SUM(A1)');
    expect(adminEscape('Ahmed')).toBe('Ahmed');
    expect(adminEscape('')).toBe('');
  });

  it('RFC 4180-quotes commas/quotes/newlines with doubling', () => {
    expect(adminEscape('a,b')).toBe('"a,b"');
    expect(adminEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it('guards a quoted-injection payload with inner quotes (the audit trap)', () => {
    // value embeds a double quote; guard must still fire AND remain valid CSV
    const out = adminEscape('-1+"x"');
    expect(out.startsWith(`"'`)).toBe(true);
    expect(out).toBe(`"'-1+""x"""`);
  });
});

describe('CSV formula-injection contract — PWA exporter (same rules)', () => {
  it.each(INJECTION_FIXTURES)('guards %j', (cell) => {
    const out = pwaEscape(cell);
    expect(out.startsWith(`"'`)).toBe(true);
    expect(out.endsWith(`"`)).toBe(true);
  });

  it.each(NUMERIC_NEGATIVES)('keeps negative number %j numeric', (cell) => {
    expect(pwaEscape(cell)).toBe(cell);
  });

  it('doubles inner quotes on the guard path (latent-bug regression pin)', () => {
    // Pre-fix this produced "'=say"x"" — a corrupt RFC 4180 row.
    expect(pwaEscape('=say"x')).toBe(`"'=say""x"`);
    expect(pwaEscape('-1+"x"')).toBe(`"'-1+""x"""`);
  });
});

describe('CSV formula-injection contract — cross-exporter parity', () => {
  it('both exporters return IDENTICAL output on every fixture', () => {
    const all = [...INJECTION_FIXTURES, ...NUMERIC_NEGATIVES, 'plain', 'a,"b"', 'say "hi"'];
    for (const cell of all) {
      expect(pwaEscape(cell)).toBe(adminEscape(cell));
    }
  });
});
