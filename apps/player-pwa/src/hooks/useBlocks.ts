'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';

/**
 * P1-53 (run #100): user-to-user block state + actions.
 *
 * Shapes mirror the API contract (docs/plans/run100-p1-53-block-mute/01-program-design.md):
 *   GET  /users/me/blocks/status/:userId → { blocked: boolean }
 *   POST /users/me/blocks                → { blockedId, createdAt }
 *   DELETE /users/me/blocks/:blockedId   → { blocked: false }
 *
 * v1.1 (parked): blocked-list page consumes GET /users/me/blocks — the
 * endpoint ships with the API half; the UI lands later.
 */

export interface BlockStatusApi {
  blocked: boolean;
}

export interface BlockDtoApi {
  blockedId: string;
  createdAt: string;
}

/** Read whether the viewer has blocked `userId`. */
export function useBlockStatus(userId: string) {
  return useQuery<BlockStatusApi, FetchError>({
    queryKey: ['blocks', 'status', userId],
    queryFn: () => fetcher<BlockStatusApi>(`/users/me/blocks/status/${userId}`),
    enabled: !!userId,
    staleTime: 30_000,
  });
}

/**
 * Block + unblock mutations. The local status cache is the single source of
 * truth for the sheet UI — both mutations invalidate it; callers surface
 * localized toasts via onError (what happened / why / what next — never raw
 * backend text).
 */
export function useBlockActions(userId: string) {
  const queryClient = useQueryClient();
  const statusKey = ['blocks', 'status', userId];

  const block = useMutation<BlockDtoApi, FetchError, void>({
    mutationFn: () =>
      fetcher<BlockDtoApi>('/users/me/blocks', {
        method: 'POST',
        body: JSON.stringify({ blockedId: userId }),
      }),
    onSuccess: () => {
      queryClient.setQueryData<BlockStatusApi>(statusKey, { blocked: true });
    },
  });

  const unblock = useMutation<{ blocked: boolean }, FetchError, void>({
    mutationFn: () => fetcher<{ blocked: boolean }>(`/users/me/blocks/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.setQueryData<BlockStatusApi>(statusKey, { blocked: false });
    },
  });

  return { block, unblock };
}
