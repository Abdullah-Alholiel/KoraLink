'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';
import { captureError, trackEvent } from '@/providers/ObservabilityProvider';

/** P2-23 (run #17): reporter closure — the caller's own reports + outcomes. */

export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export type ReportSubjectType = 'user' | 'match' | 'venue' | 'message';

export interface MyReportApi {
  id: string;
  subject_type: ReportSubjectType;
  subject_id: string;
  subject_label: string;
  reason: string;
  status: ReportStatus;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
}

export function useMyReports() {
  return useQuery<{ reports: MyReportApi[] }, FetchError>({
    queryKey: ['reports', 'mine'],
    queryFn: () => fetcher<{ reports: MyReportApi[] }>('/reports'),
    staleTime: 30_000,
  });
}

/** Submit a report (POST /reports). On success, invalidates the mine-list. */
export function useReport() {
  const queryClient = useQueryClient();
  return useMutation<
    { id: string; status: string },
    FetchError,
    { subjectType: ReportSubjectType; subjectId: string; reason: string }
  >({
    mutationFn: (input) =>
      fetcher<{ id: string; status: string }>('/reports', {
        method: 'POST',
        body: JSON.stringify({
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          reason: input.reason,
        }),
      }),
    onSuccess: (_data, vars) => {
      // Observability (AGENTS.md §4): restored in run #18 — the P2-23 rewrite
      // had dropped tracking; report submissions must be counted, failures
      // must reach Sentry.
      trackEvent('report_submitted', {
        subject_type: vars.subjectType,
        subject_id: vars.subjectId,
      });
      void queryClient.invalidateQueries({ queryKey: ['reports', 'mine'] });
    },
    onError: (err) => captureError(err, { scope: 'report' }),
  });
}
