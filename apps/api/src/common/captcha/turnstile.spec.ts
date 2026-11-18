import { BadRequestException } from '@nestjs/common';
import { TurnstileService } from './turnstile.service';

type CfgStub = { get: (key: string, def?: string) => string | undefined };

function makeService(env: {
  enabled?: string;
  secret?: string;
  nodeEnv?: string;
  siteKey?: string;
  publicSiteKey?: string;
}): TurnstileService {
  const config = {
    get: (key: string, def?: string) => {
      if (key === 'TURNSTILE_ENABLED') return env.enabled ?? def;
      if (key === 'TURNSTILE_SECRET_KEY') return env.secret ?? def;
      if (key === 'NODE_ENV') return env.nodeEnv ?? def;
      if (key === 'TURNSTILE_SITE_KEY') return env.siteKey ?? def;
      if (key === 'NEXT_PUBLIC_TURNSTILE_SITE_KEY') return env.publicSiteKey ?? def;
      return undefined;
    },
  } as unknown as CfgStub;
  return new TurnstileService(config as never);
}

const ALWAYS_PASS = '1x0000000000000000000000000000000AA';
const ALWAYS_BLOCK = '2x0000000000000000000000000000000AA';
const REAL_SHAPED = '0x4AAAAAAAreal-shaped-secret-for-tests';

/** Route global fetch for one call; restores after each test via afterEach. */
function stubFetch(impl: () => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>) {
  (global as { fetch?: unknown }).fetch = (async () => impl()) as unknown as typeof fetch;
}

describe('TurnstileService', () => {
  const realFetch = global.fetch;
  const realEnv = { ...process.env };

  afterEach(() => {
    global.fetch = realFetch;
    // Assigning `process.env.X = undefined` would CREATE the key with the
    // string 'undefined' (Node coercions) and leak it to sibling specs in the
    // same worker — delete instead when the key was absent at snapshot time.
    if (realEnv.TURNSTILE_SITE_KEY === undefined) {
      delete process.env.TURNSTILE_SITE_KEY;
    } else {
      process.env.TURNSTILE_SITE_KEY = realEnv.TURNSTILE_SITE_KEY;
    }
    if (realEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY === undefined) {
      delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    } else {
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY =
        realEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    }
  });

  it('flag OFF: verify resolves without a token (zero behavior change) and status hides the site key', async () => {
    const svc = makeService({ enabled: 'false', secret: ALWAYS_PASS });
    await expect(svc.verify(undefined)).resolves.toBeUndefined();
    await expect(svc.verify('junk')).resolves.toBeUndefined();
    expect(svc.getStatus()).toEqual({ enabled: false, siteKey: null });
  });

  it('flag ON + missing token → 400 CAPTCHA_REQUIRED (fail-closed, no network call)', async () => {
    const svc = makeService({ enabled: 'true', secret: ALWAYS_PASS });
    await expect(svc.verify(undefined)).rejects.toMatchObject({
      response: { code: 'CAPTCHA_REQUIRED' },
    });
    await expect(svc.verify('')).rejects.toMatchObject({
      response: { code: 'CAPTCHA_REQUIRED' },
    });
  });

  it('flag ON + dummy always-pass secret: token accepted WITHOUT a network round-trip', async () => {
    const svc = makeService({ enabled: 'true', secret: ALWAYS_PASS });
    stubFetch(() => {
      throw new Error('network must not be called for the always-pass dummy');
    });
    await expect(svc.verify('dummy-token')).resolves.toBeUndefined();
  });

  it('flag ON + dummy always-block secret: full siteverify path → 400 CAPTCHA_INVALID on success:false', async () => {
    const svc = makeService({ enabled: 'true', secret: ALWAYS_BLOCK });
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ success: false, 'error-codes': ['invalid-input-response'] }),
      }),
    );
    await expect(svc.verify('bad-token')).rejects.toMatchObject({
      response: { code: 'CAPTCHA_INVALID' },
    });
  });

  it('siteverify success:true → resolves (the only accept path)', async () => {
    const svc = makeService({ enabled: 'true', secret: ALWAYS_BLOCK });
    stubFetch(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) }),
    );
    await expect(svc.verify('real-token', '10.0.0.1')).resolves.toBeUndefined();
  });

  it('network failure / non-2xx / unparseable body → 400 CAPTCHA_UNAVAILABLE (never a false accept)', async () => {
    const svc = makeService({ enabled: 'true', secret: ALWAYS_BLOCK });
    stubFetch(() => Promise.reject(new Error('ECONNREFUSED')));
    await expect(svc.verify('t')).rejects.toMatchObject({
      response: { code: 'CAPTCHA_UNAVAILABLE' },
    });
    stubFetch(() => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }));
    await expect(svc.verify('t')).rejects.toMatchObject({
      response: { code: 'CAPTCHA_UNAVAILABLE' },
    });
    stubFetch(() =>
      Promise.resolve({ ok: true, json: () => Promise.reject(new Error('bad json')) }),
    );
    await expect(svc.verify('t')).rejects.toMatchObject({
      response: { code: 'CAPTCHA_UNAVAILABLE' },
    });
  });

  it('getStatus: enabled → site key read from ConfigService (TURNSTILE_SITE_KEY, then NEXT_PUBLIC_ fallback), not process.env', () => {
    process.env.TURNSTILE_SITE_KEY = 'from-process-env-must-be-ignored';
    const svc = makeService({ enabled: 'true', secret: ALWAYS_PASS, siteKey: '0x4AAA_site_key' });
    expect(svc.getStatus()).toEqual({ enabled: true, siteKey: '0x4AAA_site_key' });
    const svcPublic = makeService({ enabled: 'true', secret: ALWAYS_PASS, publicSiteKey: '0x4BBB_pub' });
    expect(svcPublic.getStatus()).toEqual({ enabled: true, siteKey: '0x4BBB_pub' });
    const svcNoKey = makeService({ enabled: 'true', secret: ALWAYS_PASS });
    expect(svcNoKey.getStatus().siteKey).toBeNull();
  });

  it('getStatus: disabled → siteKey null even when ConfigService has a site key', () => {
    const svc = makeService({ enabled: 'false', secret: ALWAYS_PASS, siteKey: '0x4AAA_site_key' });
    expect(svc.getStatus()).toEqual({ enabled: false, siteKey: null });
  });

  describe('production dummy-secret boot guard (D-20261117-04)', () => {
    it('production + dummy always-pass secret → constructor THROWS naming TURNSTILE_SECRET_KEY', () => {
      expect(() =>
        makeService({ enabled: 'true', secret: ALWAYS_PASS, nodeEnv: 'production' }),
      ).toThrow(/TURNSTILE_SECRET_KEY/);
      // Guard holds even with the flag off — a latent prod hole is still a hole.
      expect(() =>
        makeService({ enabled: 'false', secret: ALWAYS_PASS, nodeEnv: 'production' }),
      ).toThrow(/TURNSTILE_SECRET_KEY/);
    });

    it.each(['staging', 'development', 'test', undefined])(
      'non-production (%s) + dummy always-pass secret → no throw, verify still short-circuits',
      async (nodeEnv) => {
        let svc: TurnstileService | undefined;
        expect(() => {
          svc = makeService({ enabled: 'true', secret: ALWAYS_PASS, nodeEnv });
        }).not.toThrow();
        stubFetch(() => {
          throw new Error('network must not be called for the always-pass dummy');
        });
        await expect(svc!.verify('dummy-token')).resolves.toBeUndefined();
      },
    );

    it('production + real-shaped secret → no throw', () => {
      expect(() =>
        makeService({ enabled: 'true', secret: REAL_SHAPED, nodeEnv: 'production' }),
      ).not.toThrow();
    });

    it('production + always-block dummy → no throw (fails closed, not a hole)', () => {
      expect(() =>
        makeService({ enabled: 'true', secret: ALWAYS_BLOCK, nodeEnv: 'production' }),
      ).not.toThrow();
    });
  });

  it('always-block dummy secret does NOT short-circuit — siteverify IS called', async () => {
    const svc = makeService({ enabled: 'true', secret: ALWAYS_BLOCK });
    let called = 0;
    stubFetch(() => {
      called += 1;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: false, 'error-codes': ['invalid-input-response'] }),
      });
    });
    await expect(svc.verify('any-token')).rejects.toMatchObject({
      response: { code: 'CAPTCHA_INVALID' },
    });
    expect(called).toBe(1);
  });

  it('enabled without secret → constructs (fail-loud boot log path; verify fails closed as unavailable)', async () => {
    const svc = makeService({ enabled: 'true' }); // no secret
    // No secret means the siteverify network call is attempted and fails
    // (ECONNREFUSED in tests). Fail-closed returns CAPTCHA_UNAVAILABLE, not
    // a false accept. This is the desired outage behavior.
    await expect(svc.verify('t')).rejects.toMatchObject({
      response: { code: 'CAPTCHA_UNAVAILABLE' },
    });
  });

  it('rejects carry the stable CAPTCHA_* shape (message + code) for error-classify', async () => {
    const svc = makeService({ enabled: 'true', secret: ALWAYS_PASS });
    const err = await svc.verify(undefined).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    const body = (err as BadRequestException).getResponse() as { code: string; message: string };
    expect(body.code).toBe('CAPTCHA_REQUIRED');
    expect(typeof body.message).toBe('string');
  });
});
