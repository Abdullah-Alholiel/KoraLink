import type { Transaction } from '@/types';

// ─── Wallet CSV export (P2-119) ─────────────────────────
// Pure, DOM-free helpers so the CSV shape is unit-testable. Amounts and dates
// are always Western numerals / ISO-8601 regardless of UI locale.

export const WALLET_CSV_HEADER = [
  'Date',
  'Type',
  'Category',
  'Title',
  'Description',
  'Amount',
  'Currency',
] as const;

/** RFC 4180 field escaping + OWASP CSV-formula-injection guard. */
export function escapeCsvField(value: string): string {
  // A leading =/+/-/@ would execute as a spreadsheet formula in Excel or
  // Sheets; neutralize with a leading apostrophe (PR-Agent MINOR, run #84).
  const guarded = /^[=+@-]/.test(value) ? `'${value}` : value;
  if (guarded !== value) return `"${guarded}"`;
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toIsoDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

/** Builds the CSV document (header + one row per transaction, CRLF line endings). */
export function buildWalletCsv(transactions: Transaction[]): string {
  const lines = [WALLET_CSV_HEADER.join(',')];
  for (const txn of transactions) {
    lines.push(
      [
        toIsoDate(txn.createdAt),
        txn.type,
        txn.category,
        txn.title,
        txn.description,
        txn.amount.toFixed(2),
        txn.currency,
      ]
        .map(escapeCsvField)
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** koralink-wallet-<YYYYMMDD>-<HHmm>.csv in the device's local time. */
export function walletCsvFilename(now: Date): string {
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  return `koralink-wallet-${date}-${time}.csv`;
}

/**
* Converts native <input type="date"> values (YYYY-MM-DD, local day) into an
* inclusive ISO range: `from` → local start of day, `to` → local end of day.
* Returns `inverted: true` when both are set and from is after to.
*/
export function toIsoDateRange(
  fromDay: string,
  toDay: string,
): { from?: string; to?: string; inverted: boolean } {
  const from = fromDay ? new Date(`${fromDay}T00:00:00`) : undefined;
  const to = toDay ? new Date(`${toDay}T23:59:59.999`) : undefined;
  const valid = (d: Date | undefined) =>
    d && !Number.isNaN(d.getTime()) ? d : undefined;
  const f = valid(from);
  const t = valid(to);
  return {
    from: f?.toISOString(),
    to: t?.toISOString(),
    inverted: !!f && !!t && f.getTime() > t.getTime(),
  };
}
