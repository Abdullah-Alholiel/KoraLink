import { Injectable, Logger, Inject, ConflictException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { ConfigService } from '@nestjs/config';
import { desc, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { wallet_topup_intents } from '../../database/schema';
import {
  fetchMoyasarPayment,
  listMoyasarPayments,
  resolveMoyasarSecretKey,
  MoyasarHttpError,
} from '../../common/moyasar/moyasar.client';
import { WalletTopupService } from './wallet.topup.service';

type DB = PostgresJsDatabase<typeof schema>;

/** Moyasar hosted-form description prefix binding a payment to an intent. */
const INTENT_DESC_PREFIX = 'wallet-topup:';

export interface ReconcileOutcome {
  scanned: number;
  credited: number;
  skipped: number;
  failed: number;
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
      if (outcome.credited > 0 || outcome.failed > 0) {
        this.logger.log(
          `topup reconcile: scanned=${outcome.scanned} credited=${outcome.credited} skipped=${outcome.skipped} failed=${outcome.failed}`,
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
    const outcome: ReconcileOutcome = { scanned: 0, credited: 0, skipped: 0, failed: 0 };
    if (this.running) return outcome;
    const secretKey = resolveMoyasarSecretKey((k) => this.getConfig(k));
    if (!this.enabled || !secretKey) return outcome;

    this.running = true;
    try {
      const pending = await this.db
        .select({ id: wallet_topup_intents.id, user_id: wallet_topup_intents.user_id })
        .from(wallet_topup_intents)
        .where(sql`${wallet_topup_intents.status} = 'pending'`)
        .orderBy(desc(wallet_topup_intents.created_at))
        .limit(200);
      if (pending.length === 0) return outcome;
      outcome.scanned = pending.length;

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
            if (msg.startsWith('payment_not_paid')) {
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
      return outcome;
    } finally {
      this.running = false;
    }
  }
}
