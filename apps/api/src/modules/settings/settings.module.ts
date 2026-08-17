import { Global, Module } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service';
import { PublicSettingsController } from './public-settings.controller';

/** Global so any module can inject `PlatformSettingsService` without wiring imports. */
@Global()
@Module({
  providers: [PlatformSettingsService],
  controllers: [PublicSettingsController],
  exports: [PlatformSettingsService],
})
export class SettingsModule {}
