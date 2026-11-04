import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, and, sql, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { matches, match_players, transactions } from '../../database/schema';
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
 * PRIZE amount. `payoutSar` = what the PRIZE release credited (the ledger
 * row is authoritative when present; the derived floor is the fallback for
 * zero-payout releases that wrote no row).
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

    // 5. The PRIZE ledger row is the authoritative release credit.
    const [prize] = await this.db
      .select({ amount: transactions.amount })
      .from(transactions)
      .where(
        and(
          eq(transactions.reference_type, 'PRIZE'),
          eq(transactions.reference_id, matchId),
          eq(
            transactions.idempotency_key,
            `host-payout-${matchId}`,
          ),
          eq(transactions.status, 'Completed'),
        ),
      );

    const derivedPayout = WalletReceiptService.round2(
      Math.max(0, feePoolSar - marginSar * payers),
    );
    const payoutSar = prize ? parseFloat(prize.amount) || 0 : derivedPayout;

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
        platformFeeSar: WalletReceiptService.round2(marginSar * payers),
        perJoinerFeeSar: marginSar,
      },
    };
  }
}
