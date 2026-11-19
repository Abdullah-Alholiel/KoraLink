import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TurnstileService } from '../../common/captcha/turnstile.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly turnstile: TurnstileService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe for container orchestration' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      // D-20261119-03 (run #217): git SHA this build was created from.
      // Render injects RENDER_GIT_COMMIT at boot; absent locally the field is
      // omitted so release-verify can distinguish "mismatch" from "unknown
      // build" and FAIL a rolled-back deploy (run #216: probes stayed 200
      // while prod served a stale build for weeks).
      ...(process.env.RENDER_GIT_COMMIT
        ? { commit: process.env.RENDER_GIT_COMMIT }
        : {}),
      // F1 (run #212): PWA enablement signal — the login widget mounts ONLY
      // when the server actually arms + keys Turnstile. No env bake needed.
      turnstile: this.turnstile.getStatus(),
    };
  }
}
