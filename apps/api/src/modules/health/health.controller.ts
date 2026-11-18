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
      // F1 (run #212): PWA enablement signal — the login widget mounts ONLY
      // when the server actually arms + keys Turnstile. No env bake needed.
      turnstile: this.turnstile.getStatus(),
    };
  }
}
