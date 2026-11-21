import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { TurnstileService } from '../../common/captcha/turnstile.service';

describe('HealthController — build identity (D-20261119-03, run #217)', () => {
  let ctrl: HealthController;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: TurnstileService, useValue: { getStatus: () => ({ enabled: false, siteKey: null }) } },
      ],
    }).compile();
    ctrl = moduleRef.get(HealthController);
  });

  // The controller reads RENDER_GIT_COMMIT at request time (per-call), so the
  // env slice must wrap the check() call — not the construction. Restore is
  // delete-when-unset (run-#213 lesson: assigning undefined leaks the literal
  // string 'undefined' to sibling specs).
  const withEnv = (env: Record<string, string | undefined>, fn: () => unknown) => {
    const saved = { ...process.env };
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      return fn();
    } finally {
      process.env = saved;
    }
  };

  it('reports commit when RENDER_GIT_COMMIT is set (Render boot)', () => {
    const body = withEnv({ RENDER_GIT_COMMIT: 'abc123def4567890' }, () => ctrl.check()) as Record<string, unknown>;
    expect(body).toMatchObject({ status: 'ok', commit: 'abc123def4567890' });
  });

  it('omits commit when RENDER_GIT_COMMIT is unset (local boot)', () => {
    const body = withEnv({ RENDER_GIT_COMMIT: undefined }, () => ctrl.check()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('commit');
  });

  it('omits commit when RENDER_GIT_COMMIT is an empty string', () => {
    const body = withEnv({ RENDER_GIT_COMMIT: '' }, () => ctrl.check()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('commit');
  });

  // D-20261121-01 (run #221): Coolify/Docker builds carry GIT_SHA (Dockerfile
  // ARG), other PaaS images use SOURCE_COMMIT. First set wins; an EMPTY value
  // never satisfies — a half-configured platform must fall through to the next
  // variable, never ship an empty commit stamp release-verify treats as truth.
  it('falls back to SOURCE_COMMIT when RENDER_GIT_COMMIT is absent', () => {
    const body = withEnv(
      { RENDER_GIT_COMMIT: undefined, SOURCE_COMMIT: 'src0c0mm1t', GIT_SHA: undefined },
      () => ctrl.check(),
    ) as Record<string, unknown>;
    expect(body.commit).toBe('src0c0mm1t');
  });

  it('falls back to GIT_SHA when only it is set (Coolify/Docker ARG)', () => {
    const body = withEnv(
      { RENDER_GIT_COMMIT: undefined, SOURCE_COMMIT: undefined, GIT_SHA: 'g1tshabu1ld' },
      () => ctrl.check(),
    ) as Record<string, unknown>;
    expect(body.commit).toBe('g1tshabu1ld');
  });

  it('prefers RENDER_GIT_COMMIT when several identity vars are set', () => {
    const body = withEnv(
      { RENDER_GIT_COMMIT: 'render0comm1t', SOURCE_COMMIT: 'src0c0mm1t', GIT_SHA: 'g1tshabu1ld' },
      () => ctrl.check(),
    ) as Record<string, unknown>;
    expect(body.commit).toBe('render0comm1t');
  });

  it('empty fallback values never satisfy — falls through and omits', () => {
    const body = withEnv(
      { RENDER_GIT_COMMIT: undefined, SOURCE_COMMIT: '', GIT_SHA: '' },
      () => ctrl.check(),
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty('commit');
  });

  it('always carries status ok + timestamp + turnstile status', () => {
    const body = withEnv({ RENDER_GIT_COMMIT: undefined }, () => ctrl.check()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
    expect(body.turnstile).toEqual({ enabled: false, siteKey: null });
  });
});
