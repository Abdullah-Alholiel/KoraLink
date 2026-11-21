import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TurnstileService } from '../../common/captcha/turnstile.service';

// D-20261121-01 (run #221): build identity must survive the Coolify cutover.
// Render injects RENDER_GIT_COMMIT, Coolify/Docker builds carry GIT_SHA (the
// Dockerfile ARG), other PaaS images use SOURCE_COMMIT. First set wins; an
// empty string never satisfies (empty = absent for identity purposes) so a
// half-configured platform falls through to the next variable instead of
// shipping an empty commit stamp that release-verify would treat as truth.
export function resolveBuildCommit(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  for (const key of ['RENDER_GIT_COMMIT', 'SOURCE_COMMIT', 'GIT_SHA'] as const) {
    const v = env[key];
    if (v) return v;
  }
  return undefined;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly turnstile: TurnstileService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe for container orchestration' })
  check() {
    const commit = resolveBuildCommit();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      // D-20261119-03 (run #217): git SHA this build was created from.
      // Absent everywhere the field is omitted so release-verify can
      // distinguish "mismatch" from "unknown build" and FAIL a rolled-back
      // deploy (run #216: probes stayed 200 while prod served a stale build
      // for weeks).
      ...(commit ? { commit } : {}),
      // F1 (run #212): PWA enablement signal — the login widget mounts ONLY
      // when the server actually arms + keys Turnstile. No env bake needed.
      turnstile: this.turnstile.getStatus(),
    };
  }
}
