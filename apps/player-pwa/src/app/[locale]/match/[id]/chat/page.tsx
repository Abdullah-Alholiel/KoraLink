'use client';

import { use } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import MatchChat from '@/components/matches/MatchChat';
import MobileFrame from '@/components/layout/MobileFrame';
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
 */
export default function MatchChatPage() {
  const router = useRouter();
  const t = useTranslations();
  const params = useParams() as { locale?: string; id?: string };
  const { id } = use(params as unknown as Promise<{ id: string }>);

  const { data: match } = useMatch(id);
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
