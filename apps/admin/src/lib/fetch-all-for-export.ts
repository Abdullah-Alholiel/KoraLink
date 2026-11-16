// ─── Full-set CSV export fetch (P2-147) ───────────────────
// The list pages render one 20/50-row page, but an export must cover the
// whole FILTERED dataset. This walks the same list endpoint the page uses
// (same filters, same sort) at the API's perPage ceiling (@Max(100)) and
// returns every row, hard-capped so a huge table can't freeze the browser.
// exportCsv/buildCsvExport stay untouched — this layer only feeds them rows.

import { api } from '@/lib/api';

/** API-side @Max(100) on perPage. */
export const EXPORT_PAGE_SIZE = 100;
/** Hard row cap per export; `truncated` flags when the filtered total exceeds it. */
export const EXPORT_ROW_CAP = 10_000;
/** Absolute loop guard (non-monotonic totals, misbehaving paging). */
const MAX_ITERATIONS = 200;

export interface FetchAllForExportResult<TRow> {
  rows: TRow[];
  total: number;
  truncated: boolean;
}

export async function fetchAllForExport<TPage, TRow>(opts: {
  url: string;
  rowKey: keyof TPage & string;
  signal?: AbortSignal;
}): Promise<FetchAllForExportResult<TRow>> {
  const [path, query = ''] = opts.url.split('?', 2);
  const params = new URLSearchParams(query);
  params.set('perPage', String(EXPORT_PAGE_SIZE));

  const rows: TRow[] = [];
  let total = 0;
  let sawTotal = false; // envelope carried a numeric total at least once
  for (let page = 1; page <= MAX_ITERATIONS; page++) {
    params.set('page', String(page));
    // api.get throws on any non-OK response; its message carries the status
    // ("Request failed (500)") unless the API supplied its own message.
    const res = await api.get<TPage & { total?: number }>(`${path}?${params.toString()}`, {
      signal: opts.signal,
    });
    if (!res) throw new Error(`Export page ${page} returned an empty body`);
    const batch = (res[opts.rowKey] as unknown as TRow[] | undefined) ?? [];
    if (typeof res.total === 'number') {
      total = Math.max(total, res.total);
      sawTotal = true;
    }

    rows.push(...batch.slice(0, EXPORT_ROW_CAP - rows.length));
    // Break conditions, in order of certainty:
    // - cap hit: stop, truncated flag computed below.
    // - collected >= verified total: complete.
    // - empty page: offset beyond the (possibly shrunken) set — done.
    // - short page: ONLY trusted when the envelope never carried a numeric
    //   total; a mid-stream short page (concurrent deletes) or an endpoint
    //   that clamps perPage below 100 must NOT end the loop when the total
    //   says more rows exist (PR-Agent re-review on this PR).
    if (
      rows.length >= EXPORT_ROW_CAP ||
      (sawTotal && rows.length >= total) ||
      batch.length === 0 ||
      (!sawTotal && batch.length < EXPORT_PAGE_SIZE)
    ) {
      break;
    }
  }

  // Truncation semantics: with a known total, capped exports flag when the
  // filtered set exceeded the cap. If the envelope regressed and never
  // carried a numeric total, paging ran to a short page instead — hitting
  // the cap there is flagged conservatively (we cannot prove completeness),
  // never reported as a silent partial (PR-Agent review on this PR).
  const stoppedAtCap = rows.length >= EXPORT_ROW_CAP;
  const truncated = stoppedAtCap
    ? !(sawTotal && total <= EXPORT_ROW_CAP)
    : sawTotal && total > EXPORT_ROW_CAP;

  // Without an envelope total, report what we actually have as the total so
  // the capped note never renders "of 0 rows" (PR-Agent MINOR on this PR).
  return { rows, total: sawTotal ? total : Math.max(total, rows.length), truncated };
}
