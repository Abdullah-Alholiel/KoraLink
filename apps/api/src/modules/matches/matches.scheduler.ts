import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MatchesService } from './matches.service';

/**
 * P1-1 time-based jobs. All jobs are idempotent (WHERE-guarded in the service
 * methods), so overlapping ticks / restarts are safe.
 *
 * - Every 5 min: auto-complete past matches (closes the "gap until restart").
 * - Every 5 min: finalize POTM voting whose 24h window has closed.
 * - Every 15 min: "match starting soon" push reminders.
 */
@Injectable()
export class MatchesScheduler {
  private readonly logger = new Logger(MatchesScheduler.name);

  constructor(private readonly matchesService: MatchesService) {}

  @Cron('*/5 * * * *', { name: 'auto-complete-past-matches' })
  async handleAutoComplete(): Promise<void> {
    try {
      const count = await this.matchesService.autoCompletePastMatches();
      if (count > 0) {
        this.logger.log(`Auto-completed ${count} past match(es) → Completed`);
      }
    } catch (err) {
      this.logger.error(`autoCompletePastMatches tick failed: ${(err as Error).message}`);
    }
  }

  @Cron('*/5 * * * *', { name: 'finalize-pom-voting' })
  async handlePomFinalize(): Promise<void> {
    try {
      await this.matchesService.finalizePomVoting();
    } catch (err) {
      this.logger.error(`finalizePomVoting tick failed: ${(err as Error).message}`);
    }
  }

  @Cron('*/15 * * * *', { name: 'match-start-reminders' })
  async handleReminders(): Promise<void> {
    try {
      await this.matchesService.sendMatchStartReminders();
    } catch (err) {
      this.logger.error(`sendMatchStartReminders tick failed: ${(err as Error).message}`);
    }
  }
}
