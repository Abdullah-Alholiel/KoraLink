'use client';

import { useMemo } from 'react';
import { useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
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

/** One fetched page of the mine-list (canonical `{ reports, total, hasMore }` envelope — P2-31(2)). */
interface MyReportsPage {
  reports: MyReportApi[];
  total: number;
  hasMore: boolean;
}

const PAGE_SIZE = 20;

export interface UseMyReportsResult {
  reports: MyReportApi[];
  total?: number;
  hasMore: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  error: FetchError | null;
  refetch: () => void;
}

/** P2-31(2) (run #23): server-paged mine-list (was a hard 50-row cap). Same infinite-query shape as useMatches (P1-19). */
export function useMyReports(): UseMyReportsResult {
  const query = useInfiniteQuery({
    queryKey: ['reports', 'mine'],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<MyReportsPage> => {
      const params: Record<string, string> = { limit: String(PAGE_SIZE) };
      if (pageParam > 0) params.offset = String(pageParam);

      const raw = await fetcher<{ reports: MyReportApi[]; total?: number; hasMore?: boolean }>(
        '/reports',
        { params },
      );

      const total = raw.total ?? raw.reports.length;
      return {
        reports: raw.reports,
        total,
        // Defensive: an unexpected legacy shape carries no hasMore — never page on it.
        hasMore: raw.hasMore ?? false,
      };
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.reduce((sum, page) => sum + page.reports.length, 0);
    },
    staleTime: 30_000,
  });

  const reports = useMemo(
    () => query.data?.pages.flatMap((page) => page.reports) ?? [],
    [query.data],
  );
  const lastPage = query.data?.pages[query.data.pages.length - 1];

  return {
    reports,
    total: lastPage?.total,
    hasMore: Boolean(query.hasNextPage),
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    error: (query.error as FetchError | null) ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
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
