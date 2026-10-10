import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { AdminDisputesService } from './disputes.service';

/**
 * P1-63 dispute SLA sweep (owner default 7-day reminder, run #109).
 *
 * Daily at 06:17 UTC (off-peak, distinct minute from the other schedulers):
 * escalates open/under_review disputes older than 7 days — appends ONE
 * `sla_escalated` evidence entry and sets the admin-queue flag. Fully
 * idempotent (guarded UPDATE + evidence dedup inside a row lock), so
 * overlapping ticks, catch-up fires and restarts are safe. Failures are
 * per-row contained in the service and Sentry-tagged; a tick never throws.
 */
@Injectable()
export class DisputesScheduler {
  private readonly logger = new Logger(DisputesScheduler.name);

  constructor(private readonly disputesService: AdminDisputesService) {}

  @Cron('17 6 * * *', { name: 'dispute-sla-sweep' })
  async handleSlaSweep(): Promise<void> {
    try {
      const escalated = await this.disputesService.escalateOverdueDisputes();
      if (escalated > 0) {
        this.logger.log(`Dispute SLA sweep escalated ${escalated} overdue dispute(s)`);
      }
    } catch (err) {
      this.logger.error(`dispute SLA sweep tick failed: ${(err as Error).message}`);
      Sentry.captureException(err, { tags: { scope: 'admin.disputes.scheduler.sla' } });
    }
  }
}
