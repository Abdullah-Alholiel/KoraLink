import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { MatchesScheduler } from './matches.scheduler';
import type { MatchesService } from './matches.service';

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
}));

/**
 * P2-125: every MatchesScheduler cron catch block must report to Sentry
 * (scoped tag) in addition to the existing logger.error — a stalled
 * scheduler (process alive, ticks failing) must not be invisible.
 */
describe('MatchesScheduler Sentry observability (P2-125)', () => {
  const err = new Error('db down');
  const matchesService = {
    autoCompletePastMatches: jest.fn().mockRejectedValue(err),
    finalizePomVoting: jest.fn().mockRejectedValue(err),
    sendMatchStartReminders: jest.fn().mockRejectedValue(err),
    checkMinPlayers: jest.fn().mockRejectedValue(err),
  } as unknown as MatchesService;

  let scheduler: MatchesScheduler;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    scheduler = new MatchesScheduler(matchesService);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  const cases: Array<[string, (s: MatchesScheduler) => Promise<void>, string]> = [
    ['handleAutoComplete', (s) => s.handleAutoComplete(), 'matches.scheduler.auto-complete'],
    ['handlePomFinalize', (s) => s.handlePomFinalize(), 'matches.scheduler.pom-finalize'],
    ['handleReminders', (s) => s.handleReminders(), 'matches.scheduler.reminders'],
    ['handleMinPlayers', (s) => s.handleMinPlayers(), 'matches.scheduler.min-players'],
  ];

  it.each(cases)('%s captures to Sentry with scope and keeps logger.error', async (_name, run, scope) => {
    await expect(run(scheduler)).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(err, { tags: { scope } });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('db down');
  });
});
