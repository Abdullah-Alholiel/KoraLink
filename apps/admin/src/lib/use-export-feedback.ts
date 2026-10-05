'use client';

// ─── CSV export feedback (P2-153, run #103) ───────────────
// Shared wrapper around exportCsv: renders an aria-live success note after a
// download starts ("N rows exported") and an error note if the export throws.
// The 7 exporter pages (users/matches/transactions/settlements/audit/disputes/
// reports) already disable the button on loading/error/empty — this closes the
// remaining half of the gap: zero feedback that a download actually started.
//
// error-message standard (what + why + next): the error note carries the
// failure reason (e.g. download blocked) + the retry hint (the button stays
// enabled, so "try again" is literal).

import { useCallback, useState } from 'react';
import { exportCsv, type CsvExportOptions } from '@/lib/csv-export';

export interface ExportFeedback {
  /** 'success' → note is a completion confirmation; 'error' → note is a failure. */
  kind: 'success' | 'error' | null;
  /** Row count carried into the success note. */
  rows: number;
  note: string | null;
  /** Wraps exportCsv: call this from the page's onExport handler. */
  runExport: <T>(opts: CsvExportOptions<T>) => void;
  /** Clear the note (e.g. before starting a new export). */
  clear: () => void;
}

export function useExportFeedback(): ExportFeedback {
  const [kind, setKind] = useState<'success' | 'error' | null>(null);
  const [rows, setRows] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  const clear = useCallback(() => {
    setKind(null);
    setNote(null);
  }, []);

  const runExport = useCallback(<T,>(opts: CsvExportOptions<T>) => {
    setRows(opts.rows.length);
    try {
      exportCsv(opts);
      setKind('success');
      setNote(null);
    } catch {
      // exportCsv builds the blob + clicks a temp anchor; a throw here means
      // the browser refused the download (rare). What + why + next:
      setKind('error');
    }
  }, []);

  return { kind, rows, note, runExport, clear };
}
