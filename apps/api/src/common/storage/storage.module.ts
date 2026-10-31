import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * Global storage module (P1-38, run #170) — one SigV4 client for the
 * self-hosted SeaweedFS gateway. Global so any future consumer (avatars,
 * dispute evidence) injects StorageService without re-declaring the module.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
