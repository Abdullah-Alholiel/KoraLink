'use client';

import { Loader2, MessageSquare, AlertTriangle, X, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMatchMessages } from '@/hooks/useMatches';
import { buildComments } from '@/lib/api-adapter';

interface ChatSheetProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  matchTitle: string;
}

export default function ChatSheet({
  isOpen,
  onClose,
  matchId,
  matchTitle,
}: ChatSheetProps) {
  const t = useTranslations();

  const {
    data: messages,
    isLoading,
    error,
    refetch,
  } = useMatchMessages(matchId);

  if (!isOpen) return null;

  const comments = messages ? buildComments(messages) : [];

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white rounded-t-3xl z-50 max-h-[85vh] flex flex-col animate-slide-up">
        {/* Pull handle */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0">
          <h2 className="text-base font-bold text-brand-black">
            {matchTitle}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
            aria-label="Close chat"
          >
            <X className="w-4 h-4 text-gray-500" strokeWidth={2} />
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto scroll-container min-h-[200px]">
          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-brand-green animate-spin" strokeWidth={2} />
            </div>
          )}

          {/* Error */}
          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 px-6">
              <div className="w-14 h-14 rounded-full bg-brand-red/10 flex items-center justify-center mb-3">
                <AlertTriangle className="w-7 h-7 text-brand-red" strokeWidth={1.5} />
              </div>
              <p className="text-sm text-gray-400 text-center mb-4">
                {t('common.errorDescription')}
              </p>
              <button
                onClick={() => refetch()}
                className="bg-brand-green text-white px-5 py-2 rounded-full text-sm font-bold active:scale-95 transition-transform"
              >
                {t('common.retry')}
              </button>
            </div>
          )}

          {/* Empty */}
          {!isLoading && !error && comments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-6">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <MessageSquare className="w-7 h-7 text-gray-300" strokeWidth={1.5} />
              </div>
              <h3 className="text-base font-bold text-brand-black mb-1">
                {t('chatSheet.emptyTitle')}
              </h3>
              <p className="text-sm text-gray-400 text-center">
                {t('chatSheet.emptyDescription')}
              </p>
            </div>
          )}

          {/* Populated — message list */}
          {!isLoading && !error && comments.length > 0 && (
            <div className="pb-2">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="flex items-start gap-3 px-5 py-3"
                >
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-gray-500">
                      {comment.userName.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-brand-black">
                        {comment.userName}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(comment.createdAt).toLocaleTimeString(
                          'en-US',
                          {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          },
                        )}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {comment.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input row (disabled — send deferred to future cycle) */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100 flex-shrink-0">
          <input
            disabled
            placeholder={t('chatSheet.sendPlaceholder')}
            className="flex-1 bg-gray-50 rounded-full px-4 py-2.5 text-sm text-gray-400 placeholder:text-gray-300 outline-none cursor-not-allowed"
          />
          <button
            disabled
            className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 cursor-not-allowed"
            title={t('chatSheet.comingSoon')}
          >
            <Send className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </>
  );
}
