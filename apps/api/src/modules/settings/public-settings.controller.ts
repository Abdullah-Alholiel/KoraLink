import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PlatformSettingsService } from './platform-settings.service';

/**
 * Public, non-sensitive platform configuration (policies shown pre-login).
 * Deliberately unguarded: the refund policy is shown on match pages to
 * prospective players. Only whitelisted keys are ever exposed here.
 */
@ApiTags('settings')
@Controller('settings')
export class PublicSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get('public')
  @ApiOperation({ summary: 'Public platform policy settings' })
  @ApiOkResponse({ description: 'Public settings object.' })
  async getPublic() {
    const [refundPolicy] = await Promise.all([
      this.settings.getString('refund_policy', ''),
    ]);
    return { refund_policy: refundPolicy };
  }
}
