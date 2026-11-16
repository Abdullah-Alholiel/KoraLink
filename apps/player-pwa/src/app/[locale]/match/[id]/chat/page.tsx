'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import MatchChat from '@/components/matches/MatchChat';
import MobileFrame from '@/components/layout/MobileFrame';
import ErrorState from '@/components/ui/ErrorState';
import { classifyError, errorKey } from '@/lib/error-classify';
import { useMatch } from '@/hooks/useMatches';

/**
 * P2-281 M-2: full-page match-lobby chat thread — the "long threads"
 * destination the ChatSheet expand affordance opens. Same MatchChat body
 * as the sheet (one surface, two destinations) in `variant="page"`.
 *
 * The header title comes from the shared match query — already warm when
 * arriving from the match page, so it resolves from cache with no spin.
 *
 * Route-group note: lives OUTSIDE (main) on purpose — the match detail page
 * renders its own MobileFrame shell outside the group too, so back from the
 * thread returns to the intact match page without the bottom nav remounting.
 *
 * P2-321 (run #196, re-scoped — the row understated the defect): the page
 * called `use(useParams())` — a plain object cast to a Promise — which React
 * 19 rejects with "An unsupported type was passed to use()": the route 500s
 * on SSR and crashes on client navigation (proven live: digest 2159266065,
 * journald 2026-11-09 01:51Z; MobileFrame never rendered). Next 15 passes
 * `params` as a REAL Promise prop — siblings match/[id] and messages/[id]
 * take it that way. This page now does the same. A failed match fetch also
 * renders the shared classified ErrorState + retry (the original P2-321
 * gap) instead of a header stuck on "Loading…".
 */
export default function MatchChatPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const router = useRouter();
  const t = useTranslations();
  const { id } = use(params);

  // P2-321 (original scope): a failed match fetch previously fell through to
  // the loading string and left the header stuck on "Loading…" forever — the
  // chat body handles its own message errors, but the page-level match query
  // error had no surface. Render the shared classified ErrorState + retry
  // (my-games/clubs sibling pattern) instead of the thread shell.
  const { data: match, error: matchError, refetch: refetchMatch } = useMatch(id);

  if (matchError) {
    return (
      <MobileFrame>
        <div className="flex flex-col h-full bg-white">
          <ErrorState
            title={t(errorKey(classifyError(matchError)))}
            onRetry={() => refetchMatch()}
            retryLabel={t('common.retry')}
          />
        </div>
      </MobileFrame>
    );
  }

  const matchTitle = match?.title ?? t('common.loading');

  return (
    <MobileFrame>
      <div className="flex flex-col h-full bg-white">
        <MatchChat
          matchId={id}
          matchTitle={matchTitle}
          variant="page"
          onRequestClose={() => router.back()}
        />
      </div>
    </MobileFrame>
  );
}
