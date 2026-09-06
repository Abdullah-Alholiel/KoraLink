import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { NotificationsService } from './notifications.service';

/**
 * P2-43 (run #37): nightly stale push-subscription sweep.
 *
 * `NotificationsService.sweepStaleSubscriptions()` deletes subscriptions
 * whose `updated_at` is older than STALE_SUBSCRIPTION_DAYS (90d) — devices
 * that died silently (uninstall/reset/permission revoked) without the push
 * service ever delivering a 404/410 to the per-send prune. This scheduler is
 * just the cron entrypoint + error capture, mirroring UsersScheduler
 * (P0-6, run #30).
 *
 * Cadence: daily at 03:07 UTC — off-peak (Lite plan discount hours), offset
 * from the hourly :00 cluster (matches scheduler, PDPL purge at 00/05/10…)
 * so ticks never pile on the same minute.
 *
 * Idempotent: re-running deletes nothing extra (rows are gone).
 */
@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @Cron('7 3 * * *', { name: 'notifications-sweep-stale-subscriptions' })
  async handleSweepStaleSubscriptions(): Promise<void> {
    try {
      const removed = await this.notificationsService.sweepStaleSubscriptions();
      if (removed > 0) {
        this.logger.log(`Stale push-subscription sweep: removed ${removed} subscription(s)`);
      } else {
        this.logger.debug?.('Stale push-subscription sweep: nothing to remove');
      }
    } catch (err) {
      this.logger.error(
        `Stale push-subscription sweep failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      Sentry.captureException(err, { tags: { scope: 'notifications.sweepStale' } });
    }
  }
}
