import * as Sentry from '@sentry/node';
import { Logger } from '@nestjs/common';

/**
 * Log + capture a fire-and-forget fan-out failure instead of swallowing it.
 *
 * P2-169 (run #115): ~9 call sites ended notification/push/activity/email
 * chains with `.catch(() => undefined)`, making fan-out failures invisible —
 * a violation of the P2-125 observability discipline (the run-#87 scheduler
 * audit proved silent catches hide real breakage: Sentry scopes were only
 * added AFTER failures went unnoticed).
 *
 * Post-commit best-effort stays best-effort: this never rethrows. Non-HTTP
 * and 5xx errors go to Sentry (a real breakage); 4xx-class errors log a warn
 * (expected control flow — e.g. a muted/missing recipient).
 */
export function reportFanOutError(scope: string, err: unknown): undefined {
  const status =
    err && typeof err === 'object'
      ? (err as { status?: unknown; statusCode?: unknown }).status ??
        (err as { statusCode?: unknown }).statusCode
      : undefined;
  const statusNum = typeof status === 'number' ? status : undefined;
  const message = err instanceof Error ? err.message : String(err);
  if (statusNum === undefined || statusNum >= 500) {
    Sentry.captureException(err, { tags: { fanout_scope: scope } });
  }
  // Nest Logger (Pino-transported, same as every service) — no console.* in
  // the API (AGENTS.md §4; Reviewer-A run-#115 sweep confirmed zero).
  new Logger('FanOut').warn(
    `${scope} failed (status=${statusNum ?? 'n/a'}): ${message}`,
  );
  return undefined;
}
