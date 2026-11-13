/**
 * P0-2 (2026-11-13) — the wallet history row must localize the status too:
 * an Arabic user saw "Wallet Top Up" / "Completed" in English (owner finding
 * #6). buildTransactionDescription renders `${time} • ${capStatus}`; pin the
 * Arabic locale so the status half comes out Arabic as well.
 */
import { describe, it, expect } from 'vitest';
import { adaptTransaction, type TransactionApi } from '@/lib/api-adapter';

const row: TransactionApi = {
  id: 'txn-1',
  user_id: 'u1',
  type: 'CREDIT',
  amount: '5.00',
  reference_type: 'TOPUP',
  reference_id: 'pay_abc',
  idempotency_key: 'topup:u1:k',
  status: 'Completed',
  created_at: '2026-11-13T10:00:00.000Z',
};

describe('adaptTransaction TOPUP localization (P0-2 finding #6)', () => {
  it('renders an Arabic title for an Arabic user', () => {
    const txn = adaptTransaction(row, 'ar');
    expect(txn.title).toBe('شحن المحفظة');
  });

  it('keeps the English title for an English user', () => {
    const txn = adaptTransaction(row, 'en');
    expect(txn.title).toBe('Wallet Top Up');
  });

  it('localizes the description in Arabic (Arabic numerals + Arabic day-period, no Latin "Completed")', () => {
    const txn = adaptTransaction(row, 'ar');
    expect(txn.description).toMatch(/١٠:٠٠/);
    expect(txn.description).toContain('م');
    expect(txn.description).not.toContain('Completed');
  });

  it('keeps the English status in English', () => {
    const txn = adaptTransaction(row, 'en');
    expect(txn.description).toContain('Completed');
  });
});
