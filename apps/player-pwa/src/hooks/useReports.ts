'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';

/** P2-23 (run #17): reporter closure — the caller's own reports + outcomes. */

export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export type ReportSubjectType = 'user' | 'match' | 'venue';

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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports', 'mine'] });
    },
  });
}
