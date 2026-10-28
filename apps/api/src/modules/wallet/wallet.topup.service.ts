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
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Inject, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, sql } from 'drizzle-orm';
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

const SAR_TO_HALALAS = 100;
const TOPUP_KEY_PREFIX = 'topup:';
const INTENT_KEY_PREFIX = 'topup-intent:';

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

    // PR-Agent r1 CRITICAL (run #169): payment↔intent BINDING. The hosted form
    // creates the payment with description `wallet-topup:<intentId>`; verify
    // refuses ANY payment not bound to THIS intent, before any other check —
    // a leaked/observed paid paymentId can never be claimed into another
    // user's same-amount intent (and replays can never cross intents).
    const expectedDescription = `wallet-topup:${intent.id}`;
    if ((payment.description ?? null) !== expectedDescription) {
      throw new ConflictException(
        'payment_intent_mismatch: this payment was not created for this top-up intent — no money was credited',
      );
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
      throw new ConflictException(
        'payment_not_paid: the payment is not completed yet — no money was credited',
      );
    }
    if (payment.currency !== 'SAR') {
      throw new ConflictException('currency_mismatch: payment currency is not SAR');
    }
    if (payment.amount !== intent.amount_halalas) {
      throw new ConflictException(
        `amount_mismatch: payment ${payment.amount} halalas != intent ${intent.amount_halalas} halalas — no money was credited`,
      );
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
        await tx
          .update(wallet_topup_intents)
          .set(withTimestamp({ status: 'credited', payment_id: payment.id }))
          .where(and(eq(wallet_topup_intents.id, intent.id), eq(wallet_topup_intents.status, 'pending')));

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
        .where(and(eq(wallet_topup_intents.id, intentId), eq(wallet_topup_intents.status, 'pending')));
    } catch {
      // Cosmetic-only on replay paths; the credit itself is already idempotent.
    }
  }
}

