import { Injectable, Logger, Inject, ConflictException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq, gt, lt, notInArray, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { wallet_topup_intents } from '../../database/schema';
import { withTimestamp } from '../../common/utils/timestamp';
import {
  listMoyasarPayments,
  resolveMoyasarSecretKey,
} from '../../common/moyasar/moyasar.client';
import {
  TOPUP_CONFLICT_NOT_PAID_PREFIX,
  WalletTopupService,
} from './wallet.topup.service';

type DB = PostgresJsDatabase<typeof schema>;

/** Moyasar hosted-form description prefix binding a payment to an intent. */
const INTENT_DESC_PREFIX = 'wallet-topup:';

/**
 * P2-314 (run #198): a pending intent older than this is "aged out" — real
 * money may be captured but sweep-rescue is unreliable at that age, so ops
 * gets exactly ONE alert per intent (process-lifetime) and reconciles
 * manually via the admin wallet view. Fires regardless of Moyasar-list
 * visibility: a blind spot must never be silent.
 */
const AGED_OUT_ALERT_THRESHOLD_MS = 60 * 60 * 1000;

/**
 * Follow-up t_b8468d98: a pending intent older than this with NO paid payment
 * bound is abandoned (3DS never completed / app closed mid-flow). verifyTopup
 * is the ONLY writer that can still move it (the PWA's Try-again always opens
 * a FRESH intent), so this sweep expires it to 'failed' — the wallet page's
 * amber pending banner reads /topup/latest and naturally clears. 24h default,
 * overridable via WALLET_TOPUP_INTENT_EXPIRY_HOURS.
 */
const INTENT_EXPIRY_DEFAULT_HOURS = 24;

export interface ReconcileOutcome {
  scanned: number;
  credited: number;
  skipped: number;
  failed: number;
  /** Pending intents past the age threshold (alerted once each, P2-314). */
  agedOut: number;
  /** Abandoned pending intents flipped to 'failed' this pass (banner hygiene). */
  expired: number;
}

/**
 * P1 (run #189, Reviewer B): top-up credit backstop sweep.
 *
 * The wallet credit happens ONLY when the PWA calls POST /wallet/topup/verify
 * (webhook-less flow). A player who pays at Moyasar but closes the app before
 * verify returns has real SAR leave their bank with no credit — visible only
 * via P2-279's pending-attempt card nudging a manual Try-again. This sweep is
 * the server-side backstop: it finds paid Moyasar payments bound to our
 * pending intents (description `wallet-topup:<intentId>`) that carry NO ledger
 * credit yet, and re-runs the EXISTING guarded `verifyTopup` — every money
 * guard (binding, amount, currency, replay, in-tx flip assertion) is preserved
 * verbatim because the sweep never opens its own credit path.
 *
 * Discovery: Moyasar GET /v1/payments recent window (limit=100; `q=` ignored
 * server-side per live probe 2026-11-05 — description filter is client-side).
 * A payment aged OUT of the 100-payment window is NOT sweep-rescuable; the
 * player-facing rescue stays P2-279's pending card + Try-again (verify-by-id
 * works at any age). That bound is accepted (run-#189 program design).
 *
 * Cadence: every 5 minutes (cron in the @Cron decorator below), the
 * users-scheduler pattern (cron decorator + try/catch +
 * Sentry capture). The re-entrancy guard covers manual/overlapped
 * invocations; cron fires of one process are sequential.
 */
@Injectable()
export class WalletReconcileService {
  private readonly logger = new Logger(WalletReconcileService.name);
  private running = false;
  /** P2-314: intents already age-out-alerted (process-lifetime, one alert each). */
  private readonly agedOutAlerted = new Set<string>();
  /**
   * t_b8468d98: intents this process has already expired (one warn+Sentry per
   * intent, process-lifetime). A later-credited intent's own alert re-fires
   * independently — expiry never gates money alerts. Excluded ids are dropped
   * from the UPDATE by id (empty array = matches nothing in Postgres).
   */
  private readonly expiredNotifyGuard = new Set<string>();

  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly configService: ConfigService,
    private readonly topupService: WalletTopupService,
  ) {}

  private get enabled(): boolean {
    return this.configService.get<string>('WALLET_TOPUP_ENABLED') === 'true';
  }

  private getConfig(key: string): string | undefined {
    return this.configService.get<string>(key);
  }

  @Cron('*/5 * * * *', { name: 'wallet-topup-reconcile' })
  async handleReconcileTick(): Promise<void> {
    if (!this.enabled) return;
    try {
      const outcome = await this.reconcileOnce();
      if (outcome.credited > 0 || outcome.failed > 0 || outcome.agedOut > 0 || outcome.expired > 0) {
        this.logger.log(
          `topup reconcile: scanned=${outcome.scanned} credited=${outcome.credited} skipped=${outcome.skipped} failed=${outcome.failed} agedOut=${outcome.agedOut} expired=${outcome.expired}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `topup reconcile tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      Sentry.captureException(err, { tags: { scope: 'wallet.topupReconcile' } });
    }
  }

  /**
   * One sweep pass. Returns counters; never throws for per-intent failures
   * (those are logged + Sentry-captured and retried by the next tick).
   */
  async reconcileOnce(): Promise<ReconcileOutcome> {
    const outcome: ReconcileOutcome = { scanned: 0, credited: 0, skipped: 0, failed: 0, agedOut: 0, expired: 0 };
    if (this.running) return outcome;
    const secretKey = resolveMoyasarSecretKey((k) => this.getConfig(k));
    if (!this.enabled || !secretKey) return outcome;

    this.running = true;
    try {
      const pending = await this.db
        .select({
          id: wallet_topup_intents.id,
          user_id: wallet_topup_intents.user_id,
          created_at: wallet_topup_intents.created_at,
        })
        .from(wallet_topup_intents)
        .where(sql`${wallet_topup_intents.status} = 'pending'`)
        // P2-331: OLDEST pending intents first. They carry the oldest real
        // (possibly already-captured) money; newest-first + LIMIT 200 could
        // starve them forever behind a stream of fresh abandoned intents.
        .orderBy(asc(wallet_topup_intents.created_at))
        .limit(200);
      // P2-314 eviction BEFORE the empty early-return: the dedup Set must shed
      // resolved ids even when the pending backlog momentarily empties (a
      // return above this point would freeze stale ids forever).
      const pendingIds = new Set(pending.map((p) => p.id));
      for (const id of this.agedOutAlerted) {
        if (!pendingIds.has(id)) this.agedOutAlerted.delete(id);
      }
      if (pending.length === 0) return outcome;
      outcome.scanned = pending.length;

      // P2-314 age-out visibility (BEFORE discovery/credit so an intent is
      // alerted even when the Moyasar list window already lost it): a pending
      // intent older than 1h gets ONE warn + Sentry message (process-lifetime
      // rate-limit), then ops reconciles manually via the admin wallet view.
      const now = Date.now();
      for (const intent of pending) {
        const createdAt = intent.created_at ? new Date(intent.created_at).getTime() : NaN;
        if (!Number.isFinite(createdAt) || now - createdAt < AGED_OUT_ALERT_THRESHOLD_MS) continue;
        outcome.agedOut++;
        if (this.agedOutAlerted.has(intent.id)) continue;
        this.agedOutAlerted.add(intent.id);
        this.logger.warn(
          `topup intent aged out of rescuable window: intent=${intent.id} user=${intent.user_id} ageMs=${now - createdAt} — reconcile manually via admin wallet view`,
        );
        Sentry.captureMessage('Wallet top-up intent aged out of rescuable window', {
          level: 'warning',
          tags: { scope: 'wallet.topupReconcile', intentId: intent.id },
          extra: { userId: intent.user_id, ageMs: now - createdAt },
        });
      }

      const recent = await listMoyasarPayments(secretKey, INTENT_DESC_PREFIX);
      const byIntentId = new Map<string, { id: string; status: string }>();
      for (const p of recent) {
        const desc = p.description ?? '';
        if (!desc.startsWith(INTENT_DESC_PREFIX)) continue;
        const intentId = desc.slice(INTENT_DESC_PREFIX.length);
        // PR-Agent r1 IMPORTANT (run #189): prefer a PAID payment per intent —
        // a stale/failed 3DS attempt can precede the successful retry in the
        // list order (undocumented), and first-seen-wins would skip the paid
        // payment every tick. One intent completes with exactly ONE payment
        // (P2-282); the others are irrelevant once a paid one is found.
        const existing = byIntentId.get(intentId);
        if (!existing || (p.status === 'paid' && existing.status !== 'paid')) {
          byIntentId.set(intentId, { id: p.id, status: p.status });
        }
      }

      for (const intent of pending) {
        const hit = byIntentId.get(intent.id);
        if (!hit) {
          outcome.skipped++;
          continue;
        }
        if (hit.status !== 'paid') {
          outcome.skipped++;
          continue;
        }
        try {
          const result = await this.topupService.verifyTopup(intent.user_id, {
            intentId: intent.id,
            paymentId: hit.id,
          });
          if (result.credited) {
            outcome.credited++;
            this.logger.log(
              `topup reconciled: intent=${intent.id} payment=${result.paymentId} amountSar=${result.amountSar}`,
            );
          } else {
            outcome.skipped++;
          }
        } catch (err) {
          if (err instanceof ConflictException) {
            // PR-Agent r2 MINOR (run #189): only payment_not_paid (3DS still in
            // flight) is normal-and-silent. Any OTHER conflict means a paid
            // intent is being refused credit (binding/amount/already-credited
            // guards) — exactly the anomaly class this backstop exists to
            // surface: log it loudly and capture it for ops.
            const msg = (err as Error).message ?? '';
            if (msg.startsWith(`${TOPUP_CONFLICT_NOT_PAID_PREFIX}:`)) {
              outcome.skipped++;
              continue;
            }
            outcome.failed++;
            this.logger.warn(
              `topup reconcile anomaly intent=${intent.id}: ${msg}`,
            );
            Sentry.captureException(err, {
              tags: { scope: 'wallet.topupReconcile', intentId: intent.id },
            });
            continue;
          }
          outcome.failed++;
          this.logger.warn(
            `topup reconcile verify failed intent=${intent.id}: ${(err as Error).message}`,
          );
          Sentry.captureException(err, {
            tags: { scope: 'wallet.topupReconcile', intentId: intent.id },
          });
        }
      }

      // ── Abandoned-intent expiry (follow-up t_b8468d98) ────────────────────
      // Runs AFTER the credit pass so an intent with a paid payment is always
      // given its credit FIRST (verifyTopup flips pending→credited; expiring
      // one first would force topup_intent_race + a rolled-back credit).
      // Eligible = still pending after the pass + older than the expiry window
      // + NOT carrying a paid payment found this pass. A sweep-eligible intent
      // whose discovery listed a paid payment but verify failed is left pending
      // (failed++ + Sentry) so the credit path retries next tick — expiry never
      // buries a possibly-charged intent.
      const expiryHours = Math.max(
        0,
        Number.parseInt(
          this.configService.get<string>('WALLET_TOPUP_INTENT_EXPIRY_HOURS') ?? '',
          10,
        ) || INTENT_EXPIRY_DEFAULT_HOURS,
      );
      const expiryCutoff = new Date(Date.now() - expiryHours * 60 * 60 * 1000);
      const creditedIds = new Set(
        (await this.db
          .select({ id: wallet_topup_intents.id })
          .from(wallet_topup_intents)
          .where(and(eq(wallet_topup_intents.status, 'credited'), gt(wallet_topup_intents.updated_at, expiryCutoff)))
          .catch(() => [] as { id: string }[])).map((r) => r.id),
      );
      const paidIntentIds = new Set<string>();
      for (const [intentId, hit] of byIntentId) {
        if (hit.status === 'paid') paidIntentIds.add(intentId);
      }
      try {
        const expired = await this.db
          .update(wallet_topup_intents)
          .set(withTimestamp({ status: 'failed' }))
          .where(
            and(
              eq(wallet_topup_intents.status, 'pending'),
              lt(wallet_topup_intents.created_at, expiryCutoff),
              notInArray(wallet_topup_intents.id, [...paidIntentIds]),
              notInArray(wallet_topup_intents.id, [...creditedIds]),
              notInArray(wallet_topup_intents.id, [...this.expiredNotifyGuard.keys()]),
            ),
          )
          .returning({ id: wallet_topup_intents.id });
        outcome.expired = expired.length;
        for (const row of expired) this.expiredNotifyGuard.add(row.id);
        if (expired.length > 0) {
          this.logger.warn(
            `topup intents expired (abandoned >${expiryHours}h, no paid payment bound): count=${expired.length} ids=${expired.map((r) => r.id).join(',')}`,
          );
          Sentry.captureMessage('Wallet top-up intents expired (abandoned)', {
            level: 'warning',
            tags: { scope: 'wallet.topupReconcile' },
            extra: { count: expired.length, ids: expired.map((r) => r.id), expiryHours },
          });
        }
      } catch (err) {
        // Expiry is hygiene, never money-truth: a failure here must not kill
        // the sweep outcome. Next tick retries.
        this.logger.warn(`topup intent expiry pass failed: ${(err as Error).message}`);
        Sentry.captureException(err, { tags: { scope: 'wallet.topupReconcile' } });
      }

      return outcome;
    } finally {
      this.running = false;
    }
  }
}
