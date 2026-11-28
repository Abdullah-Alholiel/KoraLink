import { assertMoyasarLiveKeySafety } from './moyasar.client';

// D-20261127-02: production must never silently boot on a LIVE Moyasar key.
const LIVE = 'sk_live_abcdefSECRETvalue123';
const TEST = 'sk_test_abcdefSECRETvalue123';

const getter =
  (env: Record<string, string | undefined>) =>
  (k: string): string | undefined =>
    env[k];

describe('assertMoyasarLiveKeySafety (D-20261127-02)', () => {
  it('(a) production + sk_live + no allow flag → throws, naming the env var but never the key', () => {
    let err: Error | undefined;
    try {
      assertMoyasarLiveKeySafety(getter({ MOYASAR_SECRET_KEY: LIVE }), 'production');
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeDefined();
    expect(err!.message).toContain('MOYASAR_SECRET_KEY');
    expect(err!.message).toContain('MOYASAR_LIVE_ALLOWED');
    expect(err!.message).not.toContain(LIVE);
    expect(err!.message).not.toContain('SECRETvalue');
  });

  it('(a2) production + sk_live via the _TEST fallback name → throws naming the fallback var', () => {
    expect(() =>
      assertMoyasarLiveKeySafety(getter({ MOYASAR_SECRET_KEY_TEST: LIVE }), 'production'),
    ).toThrow(/MOYASAR_SECRET_KEY_TEST/);
  });

  it('(a3) production + sk_live + MOYASAR_LIVE_ALLOWED set to a non-"true" value → throws', () => {
    expect(() =>
      assertMoyasarLiveKeySafety(
        getter({ MOYASAR_SECRET_KEY: LIVE, MOYASAR_LIVE_ALLOWED: 'yes' }),
        'production',
      ),
    ).toThrow();
  });

  it('(b) production + sk_live + MOYASAR_LIVE_ALLOWED=true → passes', () => {
    expect(() =>
      assertMoyasarLiveKeySafety(
        getter({ MOYASAR_SECRET_KEY: LIVE, MOYASAR_LIVE_ALLOWED: 'true' }),
        'production',
      ),
    ).not.toThrow();
  });

  it('(c) production + sk_test → passes', () => {
    expect(() =>
      assertMoyasarLiveKeySafety(getter({ MOYASAR_SECRET_KEY: TEST }), 'production'),
    ).not.toThrow();
    expect(() =>
      assertMoyasarLiveKeySafety(getter({ MOYASAR_SECRET_KEY_TEST: TEST }), 'production'),
    ).not.toThrow();
  });

  it.each(['development', 'test', 'staging', undefined])(
    '(d) non-production env (%s) + sk_live → passes',
    (nodeEnv) => {
      expect(() =>
        assertMoyasarLiveKeySafety(getter({ MOYASAR_SECRET_KEY: LIVE }), nodeEnv),
      ).not.toThrow();
    },
  );

  it('(e) no key at all → passes (top-up is flag-gated elsewhere)', () => {
    expect(() => assertMoyasarLiveKeySafety(getter({}), 'production')).not.toThrow();
  });
});
