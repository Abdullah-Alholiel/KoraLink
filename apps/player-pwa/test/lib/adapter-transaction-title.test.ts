/**
 * Run #200 (P2-333): wallet transaction titles prefer the server-enriched
 * match title. Before this change MATCH_FEE rows rendered
 * "Match Payment #a3b2c1d4" (raw reference-id slice) — noise in a wallet
 * list. The enrichment is optional; legacy responses keep the old fallbacks.
 */
import { describe, it, expect } from 'vitest';
import { adaptTransaction } from '@/lib/api-adapter';
import type { TransactionApi } from '@/lib/api-adapter';

function txRow(overrides: Partial<TransactionApi> = {}): TransactionApi {
  return {
    id: 'tx-1',
    user_id: 'user-1',
    type: 'DEBIT',
    amount: '37.00',
    reference_type: 'MATCH_FEE',
    reference_id: 'a3b2c1d4e5f6',
    idempotency_key: 'join:ep-1:uuid',
    status: 'Completed',
    created_at: '2026-11-11T10:00:00.000Z',
    ...overrides,
  };
}

describe('adaptTransaction — match-title enrichment (run #200, P2-333)', () => {
  it('MATCH_FEE row with match_title renders the match name (raw-id suffix gone)', () => {
    const t = adaptTransaction(txRow({ match_title: 'Tuesday Padel @ KSU' }));
    expect(t.title).toBe('Tuesday Padel @ KSU');
    expect(t.title).not.toContain('Match Payment');
    expect(t.title).not.toContain('a3b2c1d4');
  });

  it('MATCH_FEE row WITHOUT match_title keeps the legacy fallback (older server tolerant)', () => {
    const t = adaptTransaction(txRow());
    expect(t.title).toBe('Match Payment #a3b2c1d4');
  });

  it('REFUND row with match_title reads "Refund — <match>"', () => {
    const t = adaptTransaction(
      txRow({
        type: 'CREDIT',
        reference_type: 'REFUND',
        match_title: 'Tuesday Padel @ KSU',
      }),
    );
    expect(t.title).toBe('Refund — Tuesday Padel @ KSU');
  });

  it('REFUND row with match_title under AR locale localizes the prefix (no mixed-language row)', () => {
    // PR-Agent r1 (run #200): the prefix must not render English inside an
    // Arabic wallet list.
    const t = adaptTransaction(
      txRow({
        type: 'CREDIT',
        reference_type: 'REFUND',
        match_title: 'باذل الثلاثاء',
      }),
      'ar',
    );
    expect(t.title).toBe('استرداد — باذل الثلاثاء');
    expect(t.title).not.toContain('Refund');
  });

  it('REFUND without match_title stays plain "Refund"', () => {
    const t = adaptTransaction(txRow({ type: 'CREDIT', reference_type: 'REFUND' }));
    expect(t.title).toBe('Refund');
  });

  it('TOPUP row ignores match_title (non-match surface)', () => {
    const t = adaptTransaction(
      txRow({ type: 'CREDIT', reference_type: 'TOPUP', match_title: 'Tuesday Padel' }),
    );
    expect(t.title).toBe('Wallet Top Up');
  });
});
