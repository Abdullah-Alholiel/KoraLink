'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import BottomSheet from '@/components/layout/BottomSheet';
import MatchChat from '@/components/matches/MatchChat';

interface ChatSheetProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  matchTitle: string;
}

/**
 * Match-lobby chat as a BottomSheet (quick peek from the match page).
 *
 * P2-281 M-2: the chat BODY lives in MatchChat (shared with the
 * /match/[id]/chat full-thread route — one surface, two destinations, zero
 * drift). This wrapper owns only the sheet chrome: pull handle, 85dvh cap,
 * and the expand affordance handed to MatchChat's header.
 */
export default function ChatSheet({
  isOpen,
  onClose,
  matchId,
  matchTitle,
}: ChatSheetProps) {
  const locale = useLocale();
  const router = useRouter();

  if (!isOpen) return null;

  return (
    <BottomSheet open={isOpen} onClose={onClose} maxHeightClass="max-h-[85dvh]">
        {/* Pull handle */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        <MatchChat
            matchId={matchId}
            matchTitle={matchTitle}
            variant="sheet"
            onRequestClose={onClose}
            onExpand={() => {
                // Close the sheet, then open the full thread. `replace` is
                // wrong here — back from the thread must return to the match,
                // not to a reopened sheet, and closing first keeps the
                // sheet out of the visual stack during the transition.
                onClose();
                router.push(`/${locale}/match/${matchId}/chat`);
            }}
        />
    </BottomSheet>
  );
}
