'use client';

// ─── CSV export feedback (P2-153, run #103) ───────────────
// Shared wrapper around exportCsv AND the note markup: after the CSV is
// generated an aria-live note confirms it; if generation throws, an assertive
// role=alert note explains. Used by the 7 exporter pages (users/matches/
// transactions/settlements/audit/disputes/reports), which already disable
// the button on loading/error/empty — this closes the remaining half: zero
// feedback about the export that just ran.
//
// Semantics (settled across 7 PR-agent review rounds):
// 1. The note says "generated", not "downloaded". exportCsv builds a blob and
//    clicks a temp anchor — browsers refuse/block the DOWNLOAD silently
//    (Chrome auto-download blocking throws nothing), so no JS API can prove a
//    file landed. The failure path covers generation throws (invalid
//    dates/amounts in a formatter) — the only JS-visible failure — and
//    reports them via Sentry + trackEvent before showing the note.
// 2. Re-announcement: seq increments on EVERY runExport and rides in both
//    notes (sr-only suffix), so identical-text repeats are re-announced.
//    React 18 batching is why kind-reset alone can't do this.
// 3. Both live regions are ALWAYS mounted; content swaps inside. Conditional
//    live regions are not reliably announced.

import { useCallback, useState } from 'react';
import { exportCsv, type CsvExportOptions } from '@/lib/csv-export';
import * as Sentry from '@sentry/nextjs';
import { trackEvent } from '@/providers/ObservabilityProvider';
import { useTranslations } from 'next-intl';

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

// The always-mounted live-region pair, shared so the markup cannot drift
// across the 7 pages (PR-agent round-7 finding). Render <ExportFeedbackNote
// feedback={exportFeedback} /> right after the toolbar div.
export function ExportFeedbackNote({
  feedback,
}: {
  feedback: ExportFeedback;
}) {
  const tc = useTranslations('common');
  return (
    <>
      <p role="status" aria-live="polite" className={`mx-8 text-sm ${feedback.kind === 'success' ? 'mt-3' : 'h-0'}`}>
        {feedback.kind === 'success' && (
          <span className="inline-block rounded-lg bg-green-50 px-3 py-2 text-green-700">
            {tc('exportedRows', { count: feedback.rows })}
            <span className="sr-only"> #{feedback.seq}</span>
          </span>
        )}
      </p>
      <p role="alert" className={`mx-8 text-sm ${feedback.kind === 'error' ? 'mt-3' : 'h-0'}`}>
        {feedback.kind === 'error' && (
          <span className="inline-block rounded-lg bg-red-50 px-3 py-2 text-red-700">
            {tc('exportFailed')}
            <span className="sr-only"> #{feedback.seq}</span>
          </span>
        )}
      </p>
    </>
  );
}
