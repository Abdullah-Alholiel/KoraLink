// ─── Admin CSV export (P2-68) ────────────────────────────
// Mirrors the P2-119 wallet CSV pattern (apps/player-pwa/src/lib/wallet-csv.ts):
// BOM prefix, RFC 4180 escaping, OWASP CSV-formula-injection guard.
// buildCsvExport is pure (DOM-free, unit-testable); exportCsv is the thin
// browser trigger that turns its output into a download.

export interface CsvColumn<T> {
  key: string;
  header: string;
  /** Cell text for a row; defaults to the row's `key` property. */
  value?: (row: T) => string | number | null | undefined;
}

export interface CsvExportOptions<T> {
  columns: CsvColumn<T>[];
  rows: T[];
  filePrefix: string;
  timestamp: Date;
}

export interface CsvExportFile {
  filename: string;
  /** Full document including the leading BOM. */
  content: string;
}

/** Leading characters a spreadsheet would interpret as a formula (OWASP). */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** RFC 4180 field escaping + OWASP CSV-formula-injection guard. */
export function escapeCsvField(value: string): string {
  const guarded = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  if (/[",\r\n\t]/.test(guarded) || guarded !== value) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** <filePrefix>-YYYY-MM-DD-HHmm.csv from UTC components. */
export function csvFilename(filePrefix: string, timestamp: Date): string {
  const date = `${timestamp.getUTCFullYear()}-${pad2(timestamp.getUTCMonth() + 1)}-${pad2(timestamp.getUTCDate())}`;
  const time = `${pad2(timestamp.getUTCHours())}${pad2(timestamp.getUTCMinutes())}`;
  return `${filePrefix}-${date}-${time}.csv`;
}

function cellText<T>(column: CsvColumn<T>, row: T): string {
  const raw = column.value
    ? column.value(row)
    : (row as Record<string, unknown>)[column.key];
  if (raw === null || raw === undefined) return '';
  return String(raw);
}

/** Builds the CSV document (BOM + header + one row per record, CRLF line endings). */
export function buildCsvExport<T>(opts: CsvExportOptions<T>): CsvExportFile {
  const lines = [opts.columns.map((c) => escapeCsvField(c.header)).join(',')];
  for (const row of opts.rows) {
    lines.push(opts.columns.map((c) => escapeCsvField(cellText(c, row))).join(','));
  }
  return {
    filename: csvFilename(opts.filePrefix, opts.timestamp),
    content: `﻿${lines.join('\r\n')}\r\n`,
  };
}

/** Browser download trigger for buildCsvExport's output. */
export function exportCsv<T>(opts: CsvExportOptions<T>): void {
  const { filename, content } = buildCsvExport(opts);
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick so the browser has picked up the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** ISO-8601 timestamp for CSV cells; passes unparseable values through. */
export function csvDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

/** Fixed two-decimal amount for CSV cells (Latin digits, no currency label). */
export function csvAmount(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value ?? 0;
  return Number.isNaN(n) ? '' : n.toFixed(2);
}
