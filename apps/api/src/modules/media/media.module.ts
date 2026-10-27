import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

/**
 * Media module (P1-38, run #170) — venue photo upload + public serve.
 * StorageModule is @Global, so StorageService resolves without re-export.
 */
@Module({
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
