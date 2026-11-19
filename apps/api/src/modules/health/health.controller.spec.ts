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

  it('always carries status ok + timestamp + turnstile status', () => {
    const body = withEnv({ RENDER_GIT_COMMIT: undefined }, () => ctrl.check()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
    expect(body.turnstile).toEqual({ enabled: false, siteKey: null });
  });
});
