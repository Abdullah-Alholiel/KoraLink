'use client';

import { useEffect, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Send } from 'lucide-react';
import MobileFrame from '@/components/layout/MobileFrame';
import { useConversations, useConversationMessages } from '@/hooks/useConversations';
import { selectUser, useAppStore } from '@/store/useAppStore';

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
  const { messages, isLoading, error, sendMessage } = useConversationMessages(id);

  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  const conversation = conversations?.find((c) => c.id === id);
  const otherName = conversation?.otherParticipant.fullName ?? t('messages.directMessages');

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    const content = draft.trim();
    if (!content) return;
    setDraft('');
    sendMessage(content).catch(() => setDraft(content));
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
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                    mine
                      ? 'bg-brand-green text-white rounded-br-md'
                      : 'bg-white text-brand-black rounded-bl-md shadow-card'
                  }`}
                >
                  <p className="leading-snug break-words">{m.content}</p>
                </div>
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
      </div>
    </MobileFrame>
  );
}
