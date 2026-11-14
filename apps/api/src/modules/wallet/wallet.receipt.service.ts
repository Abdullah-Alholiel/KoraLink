import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, and, sql, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import {
  matches,
  match_players,
  transactions,
  pitches,
  venues,
} from '../../database/schema';
import { PlatformSettingsService } from '../settings/platform-settings.service';

/**
 * P2-293 (run #185, Reviewer B run-#181 gap-4): hosts get an inspectable
 * payout receipt. `releaseHostPayoutInTx` (matches.service.ts) writes a single
 * PRIZE ledger row with no metadata, so the breakdown is COMPUTED ON READ —
 * zero schema change, zero migration risk. The math mirrors the release path
 * exactly (fee pool = Σ per-episode fee snapshots of the current roster, the
 * host row carries fee_paid_sar = NULL by design; payout floor 0; margin from
 * PlatformSettings, same key `platform_margin_sar` with the same default 5).
 *
 * Forfeited fees were credited to the host AT LEAVE TIME as separate
 * ADJUSTMENT ledger rows keyed `host-forfeit-<episodeId>` with
 * reference_id = the EPISODE id (matches.service.ts forfeit branch) — so the
 * forfeit sum joins episodes→transactions and must NOT be folded into the
 * PRIZE amount. The PRIZE ledger row is the SOURCE OF TRUTH for the receipt:
 * payout = its amount; platformFee = feePool − payout (reconciles by
 * construction, immune to post-release margin changes — PR-Agent r1 PR #211).
 * A zero-payout release wrote no PRIZE row → payout displays 0 (never a
 * derived number that could show money never credited).
 */

/** Same default as matches.service PLATFORM_MARGIN_SAR. */
const PLATFORM_MARGIN_SAR = 5;

export interface PayoutReceipt {
  matchId: string;
  matchTitle: string;
  completedAt: string | null;
  currency: 'SAR';
  /** The PRIZE release credit (excludes forfeits). */
  payoutSar: number;
  /** Late-leave forfeit credits the host already received at leave time. */
  forfeitSar: number;
  /** Number of forfeit episodes (0 when none). */
  forfeits: number;
  /** payoutSar + forfeitSar — everything this match credited the host. */
  totalCreditedSar: number;
  breakdown: {
    feePoolSar: number;
    payers: number;
    platformFeeSar: number;
    perJoinerFeeSar: number;
  };
}

type DB = PostgresJsDatabase<typeof schema>;

// ── F5 (run #206, D-20261106-13): player transaction receipt contract ──

export type TransactionReceiptContext =
  | {
      kind: 'match';
      matchId: string;
      matchTitle: string;
      scheduledAt: string | null;
      venueName: string | null;
      city: string | null;
    }
  | { kind: 'topup'; paymentId: string | null }
  | { kind: 'generic' };

export interface TransactionReceipt {
  txId: string;
  /**
   * KL-20261114-A1B2C3D4E5F6 — deterministic per tx, no schema column.
   * 12 hex chars (48 bits) + UTC day: collision-resistant at any plausible
   * daily volume; the number is a human reference, not a uniqueness
   * contract — the tx id stays the PK.
   */
  receiptNumber: string;
  status: 'Pending' | 'Completed' | 'Failed' | 'Reversed';
  direction: 'credit' | 'debit';
  amountSar: number;
  currency: 'SAR';
  createdAt: string;
  issuedAt: string;
  context: TransactionReceiptContext;
}

@Injectable()
export class WalletReceiptService {
  // SettingsModule is @Global — no module wiring needed for this injection.
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly settings: PlatformSettingsService,
  ) {}

  private static round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  async getPayoutReceipt(hostId: string, matchId: string): Promise<PayoutReceipt> {
    // 1. The match must exist, belong to the caller, be player-hosted, and
    //    have a RELEASED payout — a receipt before release would show money
    //    the host has not received (held) or will never receive (cancelled).
    const [match] = await this.db
      .select({
        id: matches.id,
        title: matches.title,
        host_id: matches.host_id,
        is_player_hosted: matches.is_player_hosted,
        host_payout_state: matches.host_payout_state,
        completed_at: matches.completed_at,
      })
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1);

    if (
      !match ||
      match.host_id !== hostId ||
      !match.is_player_hosted ||
      match.host_payout_state !== 'released'
    ) {
      throw new NotFoundException('Payout receipt not found.');
    }

    // 2. Fee pool + payer count — mirrors releaseHostPayoutInTx step 2
    //    (SUM over fee_paid_sar IS NOT NULL; the host row is NULL by design).
    const [sums] = await this.db
      .select({
        total: sql<string>`COALESCE(SUM(${match_players.fee_paid_sar}), 0)::text`,
        payers: sql<number>`COUNT(${match_players.fee_paid_sar})::int`,
      })
      .from(match_players)
      .where(
        and(
          eq(match_players.match_id, matchId),
          sql`${match_players.fee_paid_sar} IS NOT NULL`,
        ),
      );

    const feePoolSar = parseFloat(sums?.total ?? '0') || 0;
    const payers = sums?.payers ?? 0;

    // 3. Margin — same settings key + default as the release path.
    const marginSar = await this.settings.getNumber(
      'platform_margin_sar',
      PLATFORM_MARGIN_SAR,
    );

    // 4. Forfeit credits: episodes of this match → the host's ADJUSTMENT rows
    //    keyed `host-forfeit-<episodeId>` (reference_id = episode id). Empty
    //    roster → skip the IN query entirely (never send inArray([])).
    const episodes = await this.db
      .select({ id: match_players.id })
      .from(match_players)
      .where(eq(match_players.match_id, matchId));

    let forfeitSar = 0;
    let forfeits = 0;
    const episodeIds = episodes.map((e) => e.id);
    if (episodeIds.length > 0) {
      const [f] = await this.db
        .select({
          total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text`,
          n: sql<number>`COUNT(*)::int`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.user_id, match.host_id),
            eq(transactions.reference_type, 'ADJUSTMENT'),
            inArray(transactions.reference_id, episodeIds),
            sql`${transactions.idempotency_key} LIKE 'host-forfeit-%'`,
            eq(transactions.status, 'Completed'),
          ),
        );
      forfeitSar = parseFloat(f?.total ?? '0') || 0;
      forfeits = f?.n ?? 0;
    }

    // 5. The PRIZE ledger row is the authoritative release credit. The
    //    breakdown derives FROM it (never from the current margin setting):
    //    PR-Agent r1 on PR #211 (run #185) — an admin changing
    //    platform_margin_sar after release would otherwise make the receipt
    //    disagree with what was actually credited, and a lowered margin could
    //    make a floored-0 release DISPLAY money that was never paid.
    //      payout       = ledger amount (0 when no row = zero-payout release)
    //      platformFee  = feePool − payout (reconciles by construction)
    //      perJoinerFee = platformFee / payers (avg; margin setting only as
    //                     the zero-payer fallback label)
    const [prize] = await this.db
      .select({ amount: transactions.amount })
      .from(transactions)
      .where(
        and(
          eq(transactions.reference_type, 'PRIZE'),
          eq(transactions.reference_id, matchId),
          // Reviewer A run-#206 (IMPORTANT, defense-in-depth): the idempotency
          // key embeds the matchId today, but the release path is host-scoped —
          // pin the read to the host explicitly so a future key-format change
          // can never leak another host's release credit into this receipt.
          eq(transactions.user_id, match.host_id),
          eq(
            transactions.idempotency_key,
            `host-payout-${matchId}`,
          ),
          eq(transactions.status, 'Completed'),
        ),
      );

    const payoutSar = prize ? parseFloat(prize.amount) || 0 : 0;
    const platformFeeSar = WalletReceiptService.round2(
      Math.max(0, feePoolSar - payoutSar),
    );
    const perJoinerFeeSar =
      payers > 0
        ? WalletReceiptService.round2(platformFeeSar / payers)
        : marginSar;

    return {
      matchId,
      matchTitle: match.title,
      completedAt: match.completed_at ? match.completed_at.toISOString() : null,
      currency: 'SAR',
      payoutSar,
      forfeitSar: WalletReceiptService.round2(forfeitSar),
      forfeits,
      totalCreditedSar: WalletReceiptService.round2(payoutSar + forfeitSar),
      breakdown: {
        feePoolSar: WalletReceiptService.round2(feePoolSar),
        payers,
        platformFeeSar,
        perJoinerFeeSar,
      },
    };
  }

  // ──────────────────────────────────────────────────────────
  // F5 (run #206, decision D-20261106-13): the PLAYER-side proof-of-payment
  // receipt. One ledger row in, a structured receipt out — computed on read
  // (same doctrine as getPayoutReceipt: zero schema change, zero migration).
  //
  // Context per reference_type:
  //   MATCH_FEE / REFUND → the match (title + scheduled date + venue via
  //     matches→pitches→venues); reference_id IS the match id (match-fees.ts
  //     fee insert; matches.service refund inserts).
  //   TOPUP → the Moyasar payment id (reference_id IS payment_id —
  //     wallet.topup.service.ts credit insert). No intents lookup needed:
  //     the row itself is already owner-scoped, the id is the artifact.
  //   everything else (SETTLEMENT / PAYOUT / PRIZE / ADJUSTMENT) → generic
  //     ledger note — still proof-of-payment, no fabricated context.
  //
  // Receipt number: deterministic `KL-<yyyyMMdd>-<first12 of tx id>` —
  // stable across reads, collision-resistant (48-bit slice), no schema
  // column. Invoice EXPORT (PDF /
  // formal invoice artifact) is a later decision — this is the in-app MVP.
  // ──────────────────────────────────────────────────────────

  async getTransactionReceipt(
    userId: string,
    txId: string,
  ): Promise<TransactionReceipt> {
    // 1. The transaction must exist AND belong to the caller (owner-only,
    //    mirroring getPayoutReceipt's host check).
    const [tx] = await this.db
      .select({
        id: transactions.id,
        user_id: transactions.user_id,
        type: transactions.type,
        amount: transactions.amount,
        reference_type: transactions.reference_type,
        reference_id: transactions.reference_id,
        status: transactions.status,
        created_at: transactions.created_at,
      })
      .from(transactions)
      .where(eq(transactions.id, txId))
      .limit(1);

    if (!tx || tx.user_id !== userId) {
      throw new NotFoundException('Receipt not found.');
    }

    // 2. Context by reference type (match → venue join; topup → payment id).
    const context = await this.buildContext(tx);

    return {
      txId: tx.id,
      receiptNumber: WalletReceiptService.buildReceiptNumber(tx),
      status: tx.status,
      direction: tx.type === 'CREDIT' ? 'credit' : 'debit',
      amountSar: parseFloat(tx.amount) || 0,
      currency: 'SAR',
      createdAt: tx.created_at.toISOString(),
      issuedAt: new Date().toISOString(),
      context,
    };
  }

  private async buildContext(
    tx: {
      reference_type: string;
      reference_id: string | null;
    },
  ): Promise<TransactionReceiptContext> {
    if (
      (tx.reference_type === 'MATCH_FEE' || tx.reference_type === 'REFUND') &&
      tx.reference_id
    ) {
      const [match] = await this.db
        .select({
          id: matches.id,
          title: matches.title,
          scheduled_at: matches.scheduled_at,
          venue_name: venues.name,
          city: venues.city,
        })
        .from(matches)
        .leftJoin(pitches, eq(matches.pitch_id, pitches.id))
        .leftJoin(venues, eq(pitches.venue_id, venues.id))
        .where(eq(matches.id, tx.reference_id))
        .limit(1);

      if (match) {
        return {
          kind: 'match',
          matchId: match.id,
          matchTitle: match.title,
          scheduledAt: match.scheduled_at
            ? match.scheduled_at.toISOString()
            : null,
          venueName: match.venue_name ?? null,
          city: match.city ?? null,
        };
      }
      // Match gone (defensive — restrict FKs make this rare): a receipt is
      // still owed, just without fabricated context.
      return { kind: 'generic' };
    }

    if (tx.reference_type === 'TOPUP') {
      // reference_id is the Moyasar payment id (wallet.topup.service credit).
      return { kind: 'topup', paymentId: tx.reference_id };
    }

    return { kind: 'generic' };
  }

  /** KL-20261114-A1B2C3D4E5F6 — deterministic per tx, no schema column. */
  static buildReceiptNumber(tx: { id: string; created_at: Date }): string {
    const ymd = tx.created_at.toISOString().slice(0, 10).replace(/-/g, '');
    return `KL-${ymd}-${tx.id.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  }
}
