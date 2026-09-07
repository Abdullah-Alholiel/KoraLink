'use client';

import { cn } from '@/lib/utils';

/**
 * Column contract for DataTable (admin-table-restructure, 2026-09-07).
 *
 * `role` drives the restructured card (<700px container width):
 *  - identity: the strongest human name — card line 1, left.
 *  - value:    the money (or the operational count) — ONE slot, top right,
 *              tabular figures, on every card. No header row on cards.
 *  - meta:     state line under the identity row — badge + THE one date that
 *              matters, labeled ("Joined 4 Mar" — a bare "4 Mar" means nothing).
 *  - detail:   drawer-only. IDs, phones, notes, actions — hidden ≠ deleted.
 */
export interface ColumnDef<T> {
  key: string;
  /** Desktop table header (already-i18n'd string). */
  header: string;
  role: 'identity' | 'value' | 'meta' | 'detail';
  align?: 'start' | 'end';
  /** Use tabular figures (amounts, counts) — columns of numbers stay columns. */
  tabular?: boolean;
  /** Desktop-only sub-line under the cell text. */
  secondary?: (row: T) => React.ReactNode;
  /** Label prefix shown on cards for ambiguous values ("Due", "Slots"). Money needs none. */
  cardLabel?: string;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** Tap the row → RecordDrawer (reel move 5: tap the row, details slide in). */
  onRowClick?: (row: T) => void;
  /** Rendered by BOTH branches when the list is empty. */
  empty?: React.ReactNode;
}

/**
 * Container-query table shell. ≥700px of CONTAINER width (not viewport):
 * the classic table, unchanged visuals. Below it: the same rows restructured
 * into thumb-sized cards — identity left, value top right, labeled state line.
 * Drop this table into a narrow desktop side panel and it restructures there
 * too (the breakpoint belongs to the table, not the screen).
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
}: DataTableProps<T>) {
  const identity = columns.find((c) => c.role === 'identity');
  const value = columns.find((c) => c.role === 'value');
  const metas = columns.filter((c) => c.role === 'meta');

  // Empty list: single shell, no table headers, no card chrome.
  if (rows.length === 0 && empty) {
    return (
      <div className="dt-root overflow-hidden rounded-xl border border-gray-200 bg-white">
        {empty}
      </div>
    );
  }

  return (
    <div className="dt-root overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* ── Desktop: classic table (≥700px container width) ── */}
      <div className="dt-table w-full">
        <table className="w-full text-start text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'py-3 font-medium',
                    i === 0 ? 'ps-8 pe-4' : 'px-4',
                    c.align === 'end' ? 'text-end' : 'text-start',
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(onRowClick && 'cursor-pointer', 'hover:bg-gray-50')}
              >
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={cn(
                      'py-3 align-middle',
                      i === 0 ? 'ps-8 pe-4' : 'px-4',
                      c.align === 'end' ? 'text-end' : 'text-start',
                      c.tabular && 'tabular-nums',
                    )}
                  >
                    {c.render(row)}
                    {c.secondary?.(row) && (
                      <div className="mt-0.5 text-xs font-normal text-gray-500">
                        {c.secondary(row)}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Restructured: cards (<700px container width) ── */}
      <div className="dt-cards divide-y divide-gray-100" role="list">
        {rows.map((row, i) => (
          <div
            key={rowKey(row, i)}
            role="listitem"
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onKeyDown={
              onRowClick
                ? (e) => {
                    if (e.key === 'Enter') onRowClick(row);
                  }
                : undefined
            }
            className={cn(
              'px-4 py-3.5',
              onRowClick && 'cursor-pointer active:bg-gray-50',
            )}
            tabIndex={onRowClick ? 0 : undefined}
          >
            {/* Line 1: identity left · value right (one slot, tabular figures) */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium text-gray-900">
                  {identity?.render(row)}
                </div>
                {identity?.secondary?.(row) && (
                  <div className="truncate text-xs text-gray-500">
                    {identity.secondary(row)}
                  </div>
                )}
              </div>
              {value && (
                <div
                  className={cn(
                    'shrink-0 text-end font-semibold text-gray-900',
                    value.tabular !== false && 'tabular-nums',
                  )}
                >
                  {value.cardLabel && (
                    <span className="me-1 text-xs font-normal text-gray-400">
                      {value.cardLabel}
                    </span>
                  )}
                  {value.render(row)}
                  {value.secondary?.(row) && (
                    <div className="text-xs font-normal text-gray-500">
                      {value.secondary(row)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Line 2: state — badge + THE one date, labeled. Details never here. */}
            {metas.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                {metas.map((m) => (
                  <span key={m.key} className={cn(m.tabular && 'tabular-nums')}>
                    {m.cardLabel && (
                      <span className="text-gray-400">{m.cardLabel} </span>
                    )}
                    {m.render(row)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {!rows.length && empty && (
        <div className="dt-cards px-4 py-10 text-sm text-gray-400">{null}</div>
      )}
    </div>
  );
}
