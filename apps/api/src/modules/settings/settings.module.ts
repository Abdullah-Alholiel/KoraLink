import { Global, Module } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service';

/** Global so any module can inject `PlatformSettingsService` without wiring imports. */
@Global()
@Module({
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class SettingsModule {}
