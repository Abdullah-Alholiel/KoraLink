/**
 * P0-2 Moyasar wallet top-up service slice (run #169).
 *
 * Flow: POST /wallet/topup/intent pins a server-side intent row (user+amount,
 * idempotent per 'topup-intent:<userId>:<key>') → the PWA hosted form creates
 * the Moyasar payment client-side (card data never touches this server) →
 * POST /wallet/topup/verify fetches the payment from Moyasar (sk, Basic auth),
 * asserts paid + currency + amount + intent ownership, then credits the wallet
 * AND flips the intent in ONE transaction with Stripe-style idempotent replay
 * (idempotency_key = 'topup:<paymentId>', UNIQUE).
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray, sql, desc } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import * as schema from '../../database/schema';
import { transactions, users, wallet_topup_intents } from '../../database/schema';
import { moneyToNumber } from '../../common/utils/money';
import { withTimestamp } from '../../common/utils/timestamp';
import {
  fetchMoyasarPayment,
  resolveMoyasarPublishableKey,
  resolveMoyasarSecretKey,
  MoyasarHttpError,
  type MoyasarPayment,
} from '../../common/moyasar/moyasar.client';
import { isUniqueViolation } from './wallet.service';
import { MAX_TOPUP_SAR, MIN_TOPUP_SAR, type TopupIntentDto } from './dto/topup-intent.dto';
import type { VerifyTopupDto } from './dto/verify-topup.dto';

type DB = PostgresJsDatabase<typeof schema>;

export interface TopupIntentRow {
  id: string;
  user_id: string;
  amount_halalas: number;
  currency: string;
  status: string;
  payment_id: string | null;
  idempotency_key: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTopupIntentResult {
  intent: TopupIntentRow;
  publishableKey: string;
}

export interface VerifyTopupResult {
  credited: boolean;
  alreadyCredited: boolean;
  balance: string;
  paymentId: string;
  amountSar: number;
}

/** P2-279 (run #176): wire shape for the newest top-up attempt read. */
export interface LatestTopupIntent {
  id: string;
  /** Exact SAR amount pinned at intent create (halalas / 100). */
  amountSar: number;
  /**
   * 'pending' = unconfirmed (verify never ran or failed); 'credited' = landed.
   * t_b8468d98: 'failed' = the reconcile sweep expired an abandoned intent
   * (>expiry window, no paid payment bound) — the PWA must NOT render the
   * pending banner for it (a fresh top-up starts a new intent).
   */
  status: 'pending' | 'credited' | 'failed';
  /** ISO-8601 wire timestamp. */
  createdAt: string;
}

const SAR_TO_HALALAS = 100;

/**
 * Machine prefix of the "3DS still in flight" conflict — the ONE reconcile
 * outcome that is normal-and-silent. Run #189 PR-Agent r3: the sweep must
 * classify conflicts by THIS constant (shared producer/consumer), never by
 * re-typing the message — a reword here can never silently misroute sweep
 * outcomes (paid-refusal anomalies always reach Sentry).
 */
export const TOPUP_CONFLICT_NOT_PAID_PREFIX = 'payment_not_paid';

/**
 * P2-379 (run #214) — stable machine codes for the verify-reject bodies.
 *
 * The PWA classifies verify failures on `body.code` (hoisted to FetchError.code
 * by lib/fetcher.ts), NEVER on the English message text (PR #262 P2-373
 * precedent: copy edits / stale bundles must not break money-truth copy).
 * The message keeps its `code:` prefix so log-greps and the PWA's
 * deploy-skew fallback (message-prefix matching) keep working.
 */
export const TOPUP_VERIFY_CODES = {
  ALREADY_CREDITED: 'topup_already_credited',
  INTENT_MISMATCH: 'payment_intent_mismatch',
  NOT_PAID: TOPUP_CONFLICT_NOT_PAID_PREFIX,
  CURRENCY_MISMATCH: 'currency_mismatch',
  AMOUNT_MISMATCH: 'amount_mismatch',
} as const;
const TOPUP_KEY_PREFIX = 'topup:';
const INTENT_KEY_PREFIX = 'topup-intent:';

/**
 * F2 (run #223): the payment description binding `wallet-topup:<intentId>` —
 * THE shared producer/consumer contract between intent creation (PWA hosted
 * form writes it), the webhook (parses intentId out of it) and the reconcile
 * sweep (narrows the Moyasar list by it). One exported constant, three
 * consumers — a reword here breaks loudly at compile time, never silently.
 */
export const WEBHOOK_INTENT_DESC_PREFIX = 'wallet-topup:';

/** Round-trips a SAR amount to integer halalas exactly (2dp-guarded upstream). */
export function sarToHalalas(amountSar: number): number {
  const halalas = Math.round(amountSar * SAR_TO_HALALAS);
  if (!Number.isInteger(halalas) || halalas <= 0) {
    throw new BadRequestException('amountSar must convert to a positive integer halala amount');
  }
  return halalas;
}

@Injectable()
export class WalletTopupService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly configService: ConfigService,
  ) {}

  private get enabled(): boolean {
    return this.configService.get<string>('WALLET_TOPUP_ENABLED') === 'true';
  }

  private getConfig(key: string): string | undefined {
    return this.configService.get<string>(key);
  }

  /**
   * GET /wallet/topup/config — lets the PWA render the entry point without
   * baking the publishable key into the bundle (NEXT_PUBLIC_* trap) and keep
   * the flag authoritative server-side.
   */
  getTopupConfig(): {
    enabled: boolean;
    publishableKey: string | null;
    minAmount: number;
    maxAmount: number;
  } {
    return {
      enabled: this.enabled && resolveMoyasarPublishableKey((k) => this.getConfig(k)) !== null,
      publishableKey: this.enabled
        ? resolveMoyasarPublishableKey((k) => this.getConfig(k))
        : null,
      minAmount: MIN_TOPUP_SAR,
      maxAmount: MAX_TOPUP_SAR,
    };
  }

  /**
   * P2-279 (run #176): GET /wallet/topup/latest — the newest top-up attempt
   * for the caller. A failed/unconfirmed 3DS attempt leaves the row PENDING
   * forever (there is no 'failed' writer), so this read is the only
   * player-visible trace of an attempt that never landed. Money-truth: the
   * endpoint REPORTS state, it never interprets charge/refund outcomes.
   * Reads user_id + created_at DESC LIMIT 1 — covered by
   * wallet_topup_intents_user_created_idx (0056). P2-282: id DESC tiebreak so
   * two same-instant intents resolve deterministically.
   */
  async getLatestIntent(userId: string): Promise<{ intent: LatestTopupIntent | null }> {
    const [row] = await this.db
      .select()
      .from(wallet_topup_intents)
      .where(eq(wallet_topup_intents.user_id, userId))
      .orderBy(desc(wallet_topup_intents.created_at), desc(wallet_topup_intents.id))
      .limit(1);
    if (!row) return { intent: null };
    const intent = row as TopupIntentRow;
    return {
      intent: {
        id: intent.id,
        amountSar: intent.amount_halalas / SAR_TO_HALALAS,
        // t_b8468d98: 'failed' (expired-abandoned intents, wallet reconcile
        // sweep) passes through so the PWA's pending banner clears; only
        // 'credited' lands money and shows as a ledger row instead.
        status: intent.status === 'credited' ? 'credited' : intent.status === 'failed' ? 'failed' : 'pending',
        createdAt: intent.created_at.toISOString(),
      },
    };
  }

  /**
   * POST /wallet/topup/intent — pins user + amount server-side, idempotent per
   * client key (scoped per user). A replay returns the ORIGINAL intent row.
   */
  async createTopupIntent(
    userId: string,
    dto: TopupIntentDto,
  ): Promise<CreateTopupIntentResult> {
    if (!this.enabled) {
      throw new ForbiddenException(
        'Wallet top-up is disabled in this environment until a payment provider is integrated',
      );
    }
    const publishableKey = resolveMoyasarPublishableKey((k) => this.getConfig(k));
    if (!publishableKey) {
      throw new ForbiddenException('Wallet top-up is not configured in this environment');
    }
    const amountHalalas = sarToHalalas(dto.amountSar);
    const idempotencyKey = `${INTENT_KEY_PREFIX}${userId}:${dto.idempotencyKey}`;

    const [existing] = await this.db
      .select()
      .from(wallet_topup_intents)
      .where(eq(wallet_topup_intents.idempotency_key, idempotencyKey))
      .limit(1);
    if (existing) {
      if (existing.user_id !== userId) {
        // Different user presenting someone else's idempotency key: never leak
        // the row — treat as a conflict on the key itself.
        throw new ConflictException('Top-up idempotency key already in use');
      }
      return { intent: existing as TopupIntentRow, publishableKey };
    }

    try {
      const [intent] = await this.db
        .insert(wallet_topup_intents)
        .values({
          user_id: userId,
          amount_halalas: amountHalalas,
          currency: 'SAR',
          status: 'pending',
          idempotency_key: idempotencyKey,
        })
        .returning();
      return { intent: intent as TopupIntentRow, publishableKey };
    } catch (err) {
      if (isUniqueViolation(err, 'wallet_topup_intents_idempotency_key_unique')) {
        // Lost the create race — serve the winner's row (same user + same key).
        const [winner] = await this.db
          .select()
          .from(wallet_topup_intents)
          .where(eq(wallet_topup_intents.idempotency_key, idempotencyKey))
          .limit(1);
        if (winner && winner.user_id === userId) {
          return { intent: winner as TopupIntentRow, publishableKey };
        }
      }
      throw err;
    }
  }

  /**
   * POST /wallet/topup/verify — the ONLY credit authority. Fetches the payment
   * from Moyasar server-side and asserts, in order: flag on → intent exists and
   * belongs to the caller → payment fetched → status paid → currency SAR →
   * amount matches the intent → then credit + intent flip in one tx.
   */
  async verifyTopup(userId: string, dto: VerifyTopupDto): Promise<VerifyTopupResult> {
    if (!this.enabled) {
      throw new ForbiddenException(
        'Wallet top-up is disabled in this environment until a payment provider is integrated',
      );
    }
    const secretKey = resolveMoyasarSecretKey((k) => this.getConfig(k));
    if (!secretKey) {
      throw new ForbiddenException('Wallet top-up is not configured in this environment');
    }

    const [intent] = await this.db
      .select()
      .from(wallet_topup_intents)
      .where(and(eq(wallet_topup_intents.id, dto.intentId), eq(wallet_topup_intents.user_id, userId)))
      .limit(1);
    if (!intent) {
      throw new NotFoundException('Top-up intent not found for this user');
    }

    let payment: MoyasarPayment;
    try {
      payment = await fetchMoyasarPayment(secretKey, dto.paymentId);
    } catch (err) {
      if (err instanceof MoyasarHttpError && err.status === 404) {
        throw new NotFoundException('Payment not found at the payment provider');
      }
      throw err;
    }

    const creditKey = `${TOPUP_KEY_PREFIX}${payment.id}`;

    // P2-282: an intent completes with exactly ONE payment. Once credited, only
    // a replay of the SAME payment is served; a second, different paid payment
    // bound to this intent is refused (never a second, untracked credit).
    if (intent.status === 'credited') {
      if (payment.id !== intent.payment_id) {
        throw new ConflictException({
          message:
            'topup_already_credited: this top-up was already completed with a different payment — no money was credited',
          code: TOPUP_VERIFY_CODES.ALREADY_CREDITED,
        });
      }
      const replay = await this.findCreditReplay(userId, creditKey);
      if (replay) {
        await this.flipIntentCredited(intent.id, payment.id);
        return {
          credited: false,
          alreadyCredited: true,
          balance: replay.wallet_balance,
          paymentId: payment.id,
          amountSar: moneyToNumber(replay.ledgerEntry.amount),
        };
      }
    }

    // PR-Agent r1 CRITICAL (run #169): payment↔intent BINDING. The hosted form
    // creates the payment with description `wallet-topup:<intentId>`; verify
    // refuses ANY payment not bound to THIS intent, before any other check —
    // a leaked/observed paid paymentId can never be claimed into another
    // user's same-amount intent (and replays can never cross intents).
    const expectedDescription = `wallet-topup:${intent.id}`;
    if ((payment.description ?? null) !== expectedDescription) {
      throw new ConflictException({
        message:
          'payment_intent_mismatch: this payment was not created for this top-up intent — no money was credited',
        code: TOPUP_VERIFY_CODES.INTENT_MISMATCH,
      });
    }

    // Sequential replay: this payment already credited (webhook-less retry) —
    // heal the intent flip and return the original outcome, never re-credit.
    const prior = await this.findCreditReplay(userId, creditKey);
    if (prior) {
      await this.flipIntentCredited(intent.id, payment.id);
      return {
        credited: false,
        alreadyCredited: true,
        balance: prior.wallet_balance,
        paymentId: payment.id,
        amountSar: moneyToNumber(prior.ledgerEntry.amount),
      };
    }

    if (payment.status !== 'paid') {
      throw new ConflictException({
        message: `${TOPUP_CONFLICT_NOT_PAID_PREFIX}: the payment is not completed yet — no money was credited`,
        code: TOPUP_VERIFY_CODES.NOT_PAID,
      });
    }

    return this.creditPaidPaymentToIntent(intent, payment);
  }

  /**
   * F2 (run #223): the Moyasar webhook's credit entry. Resolves the intent by
   * id (webhook has no JWT — the intent row carries its user), fetches the
   * payment server-side, then reuses verifyTopup's EXACT binding + paid/SAR/
   * amount assertions and the SAME guarded single-tx credit. Money truth stays
   * 100% Moyasar-authoritative: the webhook secret only gates WHO CAN ASK, it
   * never decides WHAT landed.
   */
  async creditFromWebhook(intentId: string, paymentId: string): Promise<VerifyTopupResult> {
    // Reviewer A run-#223 IMPORTANT-3: gate on the TOP-UP flag too, not just
    // the webhook flag — WALLET_TOPUP_ENABLED=false + WALLET_WEBHOOK_ENABLED=true
    // must never credit (fail-closed posture parity with verifyTopup).
    if (!this.enabled) {
      throw new ForbiddenException(
        'Wallet top-up is disabled in this environment until a payment provider is integrated',
      );
    }
    const [intent] = await this.db
      .select()
      .from(wallet_topup_intents)
      .where(eq(wallet_topup_intents.id, intentId))
      .limit(1);
    if (!intent) {
      // Unknown intent on a signed event: log + 2xx upstream (nothing to act
      // on; a non-2xx would only burn Moyasar retries on a dead reference).
      throw new NotFoundException('Top-up intent not found for this payment');
    }

    const secretKey = resolveMoyasarSecretKey((k) => this.getConfig(k));
    if (!secretKey) {
      throw new ForbiddenException('Wallet top-up is not configured in this environment');
    }

    let payment: MoyasarPayment;
    try {
      payment = await fetchMoyasarPayment(secretKey, paymentId);
    } catch (err) {
      if (err instanceof MoyasarHttpError && err.status === 404) {
        throw new NotFoundException('Payment not found at the payment provider');
      }
      throw err;
    }

    // The binding guard (payment created for THIS intent) and the replay/race
    // handling live in creditPaidPaymentToIntent below — identical to verify.
    const expectedDescription = `wallet-topup:${intent.id}`;
    if ((payment.description ?? null) !== expectedDescription) {
      throw new ConflictException({
        message:
          'payment_intent_mismatch: this payment was not created for this top-up intent — no money was credited',
        code: TOPUP_VERIFY_CODES.INTENT_MISMATCH,
      });
    }

    if (payment.status !== 'paid') {
      // Webhook says paid but Moyasar's own record disagrees: warn upstream
      // (auth passed, so this is anomalous) and take no money action.
      throw new ConflictException({
        message: `${TOPUP_CONFLICT_NOT_PAID_PREFIX}: the payment is not completed yet — no money was credited`,
        code: TOPUP_VERIFY_CODES.NOT_PAID,
      });
    }

    return this.creditPaidPaymentToIntent(intent, payment);
  }

  /**
   * The single credit authority shared by /topup/verify and the F2 webhook:
   * sequential-replay check → currency + amount guards → ONE tx (ledger +
   * balance + guarded intent flip) → unique-violation race healing. Both
   * callers have already asserted status=paid and the description binding.
   */
  private async creditPaidPaymentToIntent(
    intent: TopupIntentRow,
    payment: MoyasarPayment,
  ): Promise<VerifyTopupResult> {
    const creditKey = `${TOPUP_KEY_PREFIX}${payment.id}`;
    const userId = intent.user_id;

    // P2-282: an intent completes with exactly ONE payment. Once credited, only
    // a replay of the SAME payment is served; a second, different paid payment
    // bound to this intent is refused (never a second, untracked credit).
    if (intent.status === 'credited') {
      if (payment.id !== intent.payment_id) {
        throw new ConflictException({
          message:
            'topup_already_credited: this top-up was already completed with a different payment — no money was credited',
          code: TOPUP_VERIFY_CODES.ALREADY_CREDITED,
        });
      }
      const replay = await this.findCreditReplay(userId, creditKey);
      if (replay) {
        await this.flipIntentCredited(intent.id, payment.id);
        return {
          credited: false,
          alreadyCredited: true,
          balance: replay.wallet_balance,
          paymentId: payment.id,
          amountSar: moneyToNumber(replay.ledgerEntry.amount),
        };
      }
    }

    // Sequential replay: this payment already credited (retry after a lost
    // response) — heal the intent flip and return the original outcome.
    const prior = await this.findCreditReplay(userId, creditKey);
    if (prior) {
      await this.flipIntentCredited(intent.id, payment.id);
      return {
        credited: false,
        alreadyCredited: true,
        balance: prior.wallet_balance,
        paymentId: payment.id,
        amountSar: moneyToNumber(prior.ledgerEntry.amount),
      };
    }

    if (payment.currency !== 'SAR') {
      throw new ConflictException({
        message: 'currency_mismatch: payment currency is not SAR',
        code: TOPUP_VERIFY_CODES.CURRENCY_MISMATCH,
      });
    }
    if (payment.amount !== intent.amount_halalas) {
      throw new ConflictException({
        message: `amount_mismatch: payment ${payment.amount} halalas != intent ${intent.amount_halalas} halalas — no money was credited`,
        code: TOPUP_VERIFY_CODES.AMOUNT_MISMATCH,
      });
    }

    const amountSar = payment.amount / SAR_TO_HALALAS;

    try {
      return await this.db.transaction(async (tx) => {
        // 1. Ledger entry (immutable, idempotent by UNIQUE key).
        const [ledgerEntry] = await tx
          .insert(transactions)
          .values({
            user_id: userId,
            type: 'CREDIT',
            amount: amountSar.toString(),
            reference_type: 'TOPUP',
            reference_id: payment.id,
            idempotency_key: creditKey,
            status: 'Completed',
          })
          .returning();

        // 2. Balance increment — guarded exact-cents check (P2-168 pattern).
        const [updatedUser] = await tx
          .update(users)
          .set(withTimestamp({ wallet_balance: sql`${users.wallet_balance} + ${amountSar}` }))
          .where(eq(users.id, userId))
          .returning({ id: users.id, wallet_balance: users.wallet_balance });
        if (!updatedUser) {
          throw new BadRequestException('Wallet account not found.');
        }

        // 3. Intent flip rides the SAME tx as the credit (Gate 3 contract) —
        //    a credited wallet can never leave a pending intent behind.
        //    t_b8468d98: accepts 'failed' too — the reconcile sweep expires
        //    abandoned intents >24h (status='failed'); if the payment actually
        //    completed inside that window ( Moyasar webhook-less latency), the
        //    paid payment must still credit. P2-282 preserved: zero rows = the
        //    intent was credited by another payment mid-verify — throw so the
        //    credit above rolls back. 'credited' rows (second payment) still
        //    refuse: a completed intent accepts ONLY a replay of payment_id
        //    (topup_already_credited), which never reaches this statement.
        const flipped = await tx
          .update(wallet_topup_intents)
          .set(withTimestamp({ status: 'credited', payment_id: payment.id }))
          .where(
            and(
              eq(wallet_topup_intents.id, intent.id),
              inArray(wallet_topup_intents.status, ['pending', 'failed']),
            ),
          )
          .returning({ id: wallet_topup_intents.id });
        if (flipped.length === 0) {
          throw new ConflictException(
            'topup_intent_race: intent state changed during verify — transaction rolled back',
          );
        }

        return {
          credited: true,
          alreadyCredited: false,
          balance: updatedUser.wallet_balance,
          paymentId: payment.id,
          amountSar: moneyToNumber(ledgerEntry.amount),
        };
      });
    } catch (err) {
      // Concurrent verify (double submit): the loser hits the UNIQUE
      // transactions.idempotency_key_unique, tx rolls back; serve the winner's
      // outcome (never a 500, never a double credit).
      if (isUniqueViolation(err, 'transactions_idempotency_key_unique')) {
        const replay = await this.findCreditReplay(userId, creditKey);
        if (replay) {
          await this.flipIntentCredited(intent.id, payment.id);
          return {
            credited: false,
            alreadyCredited: true,
            balance: replay.wallet_balance,
            paymentId: payment.id,
            amountSar: moneyToNumber(replay.ledgerEntry.amount),
          };
        }
      }
      throw err;
    }
  }

  /** Replays an existing top-up credit by its idempotency key. */
  private async findCreditReplay(
    userId: string,
    creditKey: string,
  ): Promise<{ ledgerEntry: { amount: string }; wallet_balance: string } | null> {
    const [existing] = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.idempotency_key, creditKey),
          eq(transactions.user_id, userId),
        ),
      )
      .limit(1);
    if (!existing) return null;
    const [user] = await this.db
      .select({ wallet_balance: users.wallet_balance })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return {
      ledgerEntry: { amount: existing.amount },
      wallet_balance: user?.wallet_balance ?? '0',
    };
  }

  /** Best-effort intent flip for replay paths (the credit tx already flipped it). */
  private async flipIntentCredited(intentId: string, paymentId: string): Promise<void> {
    try {
      await this.db
        .update(wallet_topup_intents)
        .set(withTimestamp({ status: 'credited', payment_id: paymentId }))
        .where(
          and(
            eq(wallet_topup_intents.id, intentId),
            // t_b8468d98: heals a sweep-expired ('failed') intent on replay
            // paths too — the credit already exists, the row must match it.
            inArray(wallet_topup_intents.status, ['pending', 'failed']),
          ),
        );
    } catch {
      // Cosmetic-only on replay paths; the credit itself is already idempotent.
    }
  }
}

