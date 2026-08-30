'use client';

import { useEffect, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Send, AlertCircle, Loader2, MoreVertical } from 'lucide-react';
import MobileFrame from '@/components/layout/MobileFrame';
import { useConversations, useConversationMessages } from '@/hooks/useConversations';
import ReportSheet from '@/components/matches/ReportSheet';
import { selectUser, useAppStore } from '@/store/useAppStore';
import { uuid } from '@/lib/uuid';

export default function ConversationPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const t = useTranslations();
  const storeUser = useAppStore(selectUser);

  const { data: conversations } = useConversations();
  const { messages, isLoading, error, sendMessage, retryMessage } = useConversationMessages(id);

  const [draft, setDraft] = useState('');
  // P1-31: the message being reported (overflow ⋯ on a received bubble).
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const conversation = conversations?.find((c) => c.id === id);
  const otherName = conversation?.otherParticipant.fullName ?? t('messages.directMessages');

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    const content = draft.trim();
    if (!content) return;
    sendMessage.mutate({ content, clientMessageId: uuid() });
    setDraft('');
  };

  const handleRetry = (m: { clientMessageId?: string | null; content: string }) => {
    if (m.clientMessageId) {
      retryMessage(m.clientMessageId, m.content);
    }
  };

  return (
    <MobileFrame>
      <div className="flex flex-col h-full bg-brand-bg">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-[var(--top-safe-inset)] pb-3 bg-white border-b border-gray-100">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50 active:scale-95 transition-transform"
            aria-label={t('common.back')}
          >
            <ArrowLeft className="w-5 h-5 text-brand-black" strokeWidth={2} />
          </button>
          <div className="w-9 h-9 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-brand-green">
              {otherName.charAt(0).toUpperCase()}
            </span>
          </div>
          <h1 className="text-base font-bold text-brand-black truncate">{otherName}</h1>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scroll-container px-4 py-4 space-y-3">
          {isLoading && (
            <div className="flex justify-center py-8">
              <span className="text-xs text-gray-400">{t('common.loading')}</span>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-xs text-gray-400">{t('common.errorDescription')}</p>
            </div>
          )}

          {!isLoading && !error && messages.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400">{t('messages.typeMessage')}</p>
            </div>
          )}

          {messages.map((m) => {
            const mine = m.sender.id === storeUser?.id;
            return (
              <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <div className={`flex items-center gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
                  <div
                    className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                      mine
                        ? 'bg-brand-green text-white rounded-br-md'
                        : 'bg-white text-brand-black rounded-bl-md shadow-card'
                    }`}
                  >
                    <p className="leading-snug break-words">{m.content}</p>
                  </div>
                  {/* P1-31: report an abusive received message (overflow menu). */}
                  {!mine && (
                    <button
                      onClick={() => setReportTargetId(m.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:text-gray-500 hover:bg-gray-100 active:scale-95 transition-all flex-shrink-0"
                      aria-label={t('report.reportMessage')}
                    >
                      <MoreVertical className="w-4 h-4" strokeWidth={2} />
                    </button>
                  )}
                </div>
                {mine && m.status === 'sending' && (
                  <span className="mt-1 flex items-center gap-1 text-[10px] text-gray-400">
                    <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
                    {t('messages.sending')}
                  </span>
                )}
                {mine && m.status === 'failed' && (
                  <button
                    onClick={() => handleRetry(m)}
                    className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-brand-red"
                  >
                    <AlertCircle className="w-3.5 h-3.5" strokeWidth={2} />
                    {t('messages.failedToSend')} · {t('messages.tapToRetry')}
                  </button>
                )}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 pb-safe bg-white border-t border-gray-100">
          <div className="flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2 border border-gray-100 focus-within:border-brand-green transition-colors">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={t('messages.typeMessage')}
              className="flex-1 text-sm text-brand-black placeholder:text-gray-400 outline-none bg-transparent"
            />
            <button
              onClick={handleSend}
              disabled={!draft.trim()}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-brand-green text-white disabled:bg-gray-200 disabled:text-gray-400 active:scale-95 transition-transform"
              aria-label={t('messages.send')}
            >
              <Send className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* P1-31: report sheet for a received message. */}
        <ReportSheet
          open={reportTargetId !== null}
          onClose={() => setReportTargetId(null)}
          subjectType="message"
          subjectId={reportTargetId ?? ''}
          subjectLabel={t('report.subjectMessage')}
          title={t('report.messageSheetTitle')}
        />
      </div>
    </MobileFrame>
  );
}
