'use client';

// ─── CSV export feedback (P2-153, run #103) ───────────────
// Shared wrapper around exportCsv: renders an aria-live success note after the
// CSV is generated and a plain-language failure note if generation throws.
// The 7 exporter pages (users/matches/transactions/settlements/audit/disputes/
// reports) already disable the button on loading/error/empty — this closes the
// remaining half of the gap: zero feedback about the export that just ran.
//
// Semantics (settled across 5 PR-agent review rounds):
// 1. The note says "generated", not "downloaded". exportCsv builds a blob and
//    clicks a temp anchor — browsers refuse/block the DOWNLOAD silently
//    (Chrome auto-download blocking throws nothing), so no JS API can prove a
//    file landed. The failure path covers generation throws (invalid
//    dates/amounts in a formatter) — the only JS-visible failure — and
//    reports them via Sentry + trackEvent before showing the note.
// 2. Re-announcement: seq increments on EVERY runExport and rides in the
//    note text (`exportedAt`-style counter is NOT needed — the count field
//    carries seq), so identical-text repeats are not deduped by screen
//    readers. React 18 batching is why kind-reset alone can't do this.
// 3. Both live regions are ALWAYS mounted; content swaps inside. Conditional
//    live regions are not reliably announced.

import { useCallback, useState } from 'react';
import { exportCsv, type CsvExportOptions } from '@/lib/csv-export';
import * as Sentry from '@sentry/nextjs';
import { trackEvent } from '@/providers/ObservabilityProvider';

export interface ExportFeedback {
  /** 'success' → completion confirmation; 'error' → failure note shown. */
  kind: 'success' | 'error' | null;
  /** Row count carried into the success note. */
  rows: number;
  /** Bumps on every export so SRs re-announce even with identical text. */
  seq: number;
  /** Wraps exportCsv: call this from the page's onExport handler. */
  runExport: <T>(opts: CsvExportOptions<T>) => void;
}

export function useExportFeedback(): ExportFeedback {
  const [kind, setKind] = useState<'success' | 'error' | null>(null);
  const [rows, setRows] = useState(0);
  const [seq, setSeq] = useState(0);

  const runExport = useCallback(<T,>(opts: CsvExportOptions<T>) => {
    setSeq((s) => s + 1); // new announcement even if the text repeats
    setRows(opts.rows.length);
    try {
      exportCsv(opts);
      setKind('success'); // = "file generated, download handed to browser"
    } catch (e) {
      // JS-visible failure = generation error (bad date/amount in a formatter).
      // Download blocking is silent in every browser — see header comment.
      Sentry.captureException(e, { tags: { area: 'admin-csv-export' } });
      trackEvent('admin_csv_export_error', { rows: opts.rows.length });
      setKind('error');
    }
  }, []);

  return { kind, rows, seq, runExport };
}
