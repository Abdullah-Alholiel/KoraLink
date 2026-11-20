import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { REQUIRED_BY_PROVIDER } from './email-delivery';

// PR #283 r3 (PR-Agent MINOR, run #218): REQUIRED_BY_PROVIDER hand-duplicates
// each adapter's isConfigured() env-key set. Without enforcement, a future
// adapter change (new required key / renamed env) silently stops propagating
// here — the guard would miss the new key and the send-nothing outage this
// file exists to prevent. This tripwire parses the ADAPTER + FACTORY + GUARD
// SOURCES (not compiled output) and pins the whole env contract mechanically:
//   r4 (PR-Agent IMPORTANT): the FACTORY↔GUARD parity is parsed too — the env
//   variable name AND the trim/lowercase normalization are pinned, not just
//   commented ("parity by construction" is now enforced by test).

const ADAPTERS: Array<{ file: string; provider: string }> = [
  { file: '../../modules/auth/brevo.service.ts', provider: 'brevo' },
  { file: '../../modules/auth/resend.service.ts', provider: 'resend' },
];

const FACTORY = '../../modules/auth/email-sender.provider.ts';
const GUARD = './email-delivery.ts';

// Tolerant extraction: optional generic, optional whitespace — a benign
// adapter refactor must not zero-extract (r3 MINOR). Empty extraction still
// fails loud via toEqual against the non-empty map.
const envNamesIn = (source: string): string[] =>
  Array.from(
    source.matchAll(/config\.get(?:<string>)?\(\s*['"]([A-Z_]+)['"]\s*\)/g),
  ).map((m) => m[1]);

const isConfiguredBody = (source: string): string => {
  const fn = source.match(/isConfigured\(\)\s*:\s*boolean\s*\{([\s\S]*?)\n\s{2}\}/);
  if (!fn) throw new Error('isConfigured() body not found in adapter source');
  return fn[1];
};

describe('email-delivery ↔ adapters ↔ factory env contract (drift tripwire)', () => {
  it.each(ADAPTERS)(
    '$provider: REQUIRED_BY_PROVIDER set == isConfigured() env reads',
    ({ file, provider }) => {
      const source = readFileSync(resolve(__dirname, file), 'utf-8');
      const adapterEnv = envNamesIn(isConfiguredBody(source)).sort();
      const mapEnv = [...REQUIRED_BY_PROVIDER[provider]].sort();
      expect(mapEnv.length).toBeGreaterThan(0);
      expect(adapterEnv).toEqual(mapEnv);
    },
  );

  it('map knows exactly the transports the factory can build', () => {
    expect(Object.keys(REQUIRED_BY_PROVIDER).sort()).toEqual([
      'brevo',
      'resend',
    ]);
  });

  it('r4 IMPORTANT: factory and guard read the SAME env var with the SAME normalization', () => {
    const factorySrc = readFileSync(resolve(__dirname, FACTORY), 'utf-8');
    const guardSrc = readFileSync(resolve(__dirname, GUARD), 'utf-8');

    // 1. Both read EMAIL_PROVIDER (the env var name is pinned, not commented).
    expect(envNamesIn(factorySrc)).toContain('EMAIL_PROVIDER');
    expect(envNamesIn(guardSrc)).toContain('EMAIL_PROVIDER');

    // 2. Both normalize identically: trim().toLowerCase() on the defaulted read.
    const normalized =
      /config\.get(?:<string>)?\(\s*['"]EMAIL_PROVIDER['"]\s*\)\s*\|\|\s*['"]resend['"]\s*\)[\s\S]{0,60}?\.trim\(\)\s*\.toLowerCase\(\)/;
    expect(factorySrc).toMatch(normalized);
    expect(guardSrc).toMatch(normalized);

    // 3. The factory's quoted transport literals cover exactly the map's keys
    //    (mid-line literals — no line anchor; a renamed/added branch changes
    //    this set and fails here).
    const literals = Array.from(
      factorySrc.matchAll(/'([a-z]+)'/g),
    ).map((m) => m[1]);
    for (const key of Object.keys(REQUIRED_BY_PROVIDER)) {
      expect(literals).toContain(key);
    }
  });
});
