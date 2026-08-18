'use client';

import { useMutation } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';
import { trackEvent, captureError } from '@/providers/ObservabilityProvider';

export type ReportSubjectType = 'user' | 'match' | 'venue';

export interface Report {
  id: string;
  subject_type: ReportSubjectType;
  subject_id: string;
  reason: string;
  status: string;
  created_at: string;
}

/** Submit a report against a user / match / venue (POST /reports). */
export function useReport() {
  return useMutation<
    Report,
    FetchError,
    { subjectType: ReportSubjectType; subjectId: string; reason: string }
  >({
    mutationFn: ({ subjectType, subjectId, reason }) =>
      fetcher<Report>('/reports', {
        method: 'POST',
        body: JSON.stringify({ subjectType, subjectId, reason }),
      }),
    onSuccess: (_data, vars) => {
      trackEvent('report_submitted', {
        subject_type: vars.subjectType,
        subject_id: vars.subjectId,
      });
    },
    onError: (err) => captureError(err, { scope: 'report' }),
  });
}
