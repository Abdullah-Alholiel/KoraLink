'use client';

// ─── CSV export feedback (P2-153, run #103) ───────────────
// Shared wrapper around exportCsv: renders an aria-live success note after the
// CSV is generated and a plain-language failure note if generation throws.
// The 7 exporter pages (users/matches/transactions/settlements/audit/disputes/
// reports) already disable the button on loading/error/empty — this closes the
// remaining half of the gap: zero feedback about the export that just ran.
//
// PR-agent triage (run #103), two semantics locked:
// 1. The note says "generated", not "downloaded". exportCsv builds a blob and
//    clicks a temp anchor — browsers refuse/block the DOWNLOAD silently
//    (Chrome auto-download blocking throws nothing), so no JS API can prove a
//    file landed. The copy must not claim more than happened. The failure path
//    covers generation throws (invalid dates/amounts), the only JS-visible
//    failure; download blocking is a browser UX concern, not app feedback.
// 2. The note self-clears on new data: runExport always clears first, and
//    pages call clear() in the same effect that refetches (stale rows must not
//    look like they describe the current table).

import { useCallback, useState } from 'react';
import { exportCsv, type CsvExportOptions } from '@/lib/csv-export';

export interface ExportFeedback {
  /** 'success' → completion confirmation; 'error' → failure note shown. */
  kind: 'success' | 'error' | null;
  /** Row count carried into the success note. */
  rows: number;
  /** Wraps exportCsv: call this from the page's onExport handler. */
  runExport: <T>(opts: CsvExportOptions<T>) => void;
  /** Clear the note (pages call it when the underlying list changes). */
  clear: () => void;
}

export function useExportFeedback(): ExportFeedback {
  const [kind, setKind] = useState<'success' | 'error' | null>(null);
  const [rows, setRows] = useState(0);

  const clear = useCallback(() => {
    setKind(null);
  }, []);

  const runExport = useCallback(<T,>(opts: CsvExportOptions<T>) => {
    setKind(null); // previous note never describes the new export
    setRows(opts.rows.length);
    try {
      exportCsv(opts);
      setKind('success'); // = "file generated, download handed to browser"
    } catch {
      // JS-visible failure = generation error (bad date/amount in a formatter).
      // Download blocking is silent in every browser — see header comment.
      setKind('error');
    }
  }, []);

  return { kind, rows, runExport, clear };
}
