import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { UsersService } from './users.service';

/**
 * P0-6 (run #30): PDPL hard-purge scheduler.
 *
 * Anonymizes users whose 30-day soft-delete grace window has expired.
 * The actual SQL is `UsersService.purgeExpiredAccounts()` — this
 * scheduler is just the cron entrypoint + error capture.
 *
 * Cadence: every 5 hours. The 30-day window is coarse-grained (no
 * sub-hour precision needed) — a 5h tick keeps the run budget tight
 * (one tick every 5 cron slots) while still being responsive (max
 * ~5h delay between expiry and purge).
 *
 * Idempotent: re-running on already-anonymized rows is a no-op (same
 * values written back). The DELETE-free UPDATE leaves the financial
 * audit trail intact per migration 0031 (transactions FK → RESTRICT).
 */
@Injectable()
export class UsersScheduler {
  private readonly logger = new Logger(UsersScheduler.name);

  constructor(private readonly usersService: UsersService) {}

  // '0 */5 * * *' = at minute 0 of every 5th hour (00:00, 05:00, 10:00, ...)
  // Matches the cadence of the matches scheduler (`@nestjs/schedule`
  // @Cron decorator string syntax).
  @Cron('0 */5 * * *', { name: 'users-purge-expired' })
  async handlePurgeExpiredAccounts(): Promise<void> {
    try {
      const count = await this.usersService.purgeExpiredAccounts();
      if (count > 0) {
        this.logger.log(`PDPL hard-purge: anonymized ${count} user(s) past 30-day grace window`);
      } else {
        this.logger.debug?.('PDPL hard-purge: 0 users past grace');
      }
    } catch (err) {
      this.logger.error(
        `PDPL hard-purge tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      Sentry.captureException(err, { tags: { scope: 'users.purgeExpired' } });
    }
  }
}