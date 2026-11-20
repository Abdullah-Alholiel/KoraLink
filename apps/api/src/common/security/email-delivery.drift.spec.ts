import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { REQUIRED_BY_PROVIDER } from './email-delivery';

// PR #283 r3 (PR-Agent MINOR, run #218): REQUIRED_BY_PROVIDER hand-duplicates
// each adapter's isConfigured() env-key set. Without enforcement, a future
// adapter change (new required key / renamed env) silently stops propagating
// here — the guard would miss the new key and the send-nothing outage this
// file exists to prevent returns. This tripwire parses the ADAPTER SOURCES
// (not their compiled output) and pins set-equality with the map.

const ADAPTERS: Array<{ file: string; provider: string }> = [
  { file: '../../modules/auth/brevo.service.ts', provider: 'brevo' },
  { file: '../../modules/auth/resend.service.ts', provider: 'resend' },
];

const envNamesInIsConfigured = (source: string): string[] => {
  const fn = source.match(/isConfigured\(\): boolean \{([\s\S]*?)\n  \}/);
  if (!fn) throw new Error('isConfigured() body not found in adapter source');
  return Array.from(fn[1].matchAll(/config\.get<string>\('([A-Z_]+)'\)/g)).map(
    (m) => m[1],
  );
};

describe('email-delivery ↔ adapter env contract (drift tripwire)', () => {
  it.each(ADAPTERS)(
    '$provider: REQUIRED_BY_PROVIDER set == isConfigured() env reads',
    ({ file, provider }) => {
      const source = readFileSync(resolve(__dirname, file), 'utf-8');
      const adapterEnv = envNamesInIsConfigured(source).sort();
      const mapEnv = [...REQUIRED_BY_PROVIDER[provider]].sort();
      expect(adapterEnv).toEqual(mapEnv);
    },
  );

  it('the map knows exactly the transports the provider factory can build', () => {
    const factory = readFileSync(
      resolve(__dirname, '../../modules/auth/email-sender.provider.ts'),
      'utf-8',
    );
    // The factory branches on 'brevo' (everything else → resend); the map must
    // carry exactly those two transports — no orphan entries, no gaps.
    expect(Object.keys(REQUIRED_BY_PROVIDER).sort()).toEqual([
      'brevo',
      'resend',
    ]);
    expect(factory).toContain("'brevo'");
    expect(factory).toContain("'resend'");
  });
});
