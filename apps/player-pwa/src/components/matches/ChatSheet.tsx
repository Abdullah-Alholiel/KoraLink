'use client';

import { useState, useRef, useEffect } from 'react';
import { Loader2, MessageSquare, AlertTriangle, AlertCircle, X, Send, Wifi, WifiOff } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { useMatchChat } from '@/hooks/useMessages';
import type { MatchMessage } from '@/hooks/useMessages';
import { useAppStore, selectUser } from '@/store/useAppStore';
import { uuid } from '@/lib/uuid';
import BottomSheet from '@/components/layout/BottomSheet';

interface ChatSheetProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  matchTitle: string;
}

// ── Date grouping helpers ──────────────────────────

function getDateGroup(dateStr: string, now: Date): string {
  const d = new Date(dateStr);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((msgDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === -1) return 'yesterday';
  if (diffDays < -1) return 'older';
  return 'today';
}

function groupMessages(
  messages: MatchMessage[],
  t: (key: string) => string,
  locale: string,
) {
  const groups: { label: string; messages: MatchMessage[] }[] = [];
  const now = new Date();

  for (const msg of messages) {
    const group = getDateGroup(msg.created_at, now);
    const label =
      group === 'today' ? t('messages.today') :
      group === 'yesterday' ? t('messages.yesterday') :
      new Date(msg.created_at).toLocaleDateString(locale, { month: 'short', day: 'numeric' });

    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.messages.push(msg);
    } else {
      groups.push({ label, messages: [msg] });
    }
  }
  return groups;
}

// ── Component ──────────────────────────────────────

export default function ChatSheet({
  isOpen,
  onClose,
  matchId,
  matchTitle,
}: ChatSheetProps) {
  const t = useTranslations();
  const locale = useLocale();
  const user = useAppStore(selectUser);
  const currentUserId = user?.id;

  const {
    messages,
    isLoading,
    error,
    refetch,
    isConnected,
    sendMessage,
    retryMessage,
  } = useMatchChat(matchId);

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Auto-scroll to bottom on new messages ──
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // ── Focus input on open ──
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const grouped = groupMessages(messages, t, locale);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    sendMessage.mutate({ content: trimmed, clientMessageId: uuid() });
    setInput('');
  };

  const handleRetry = (msg: MatchMessage) => {
    if (msg.client_message_id) {
      retryMessage(msg.client_message_id, msg.content);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <BottomSheet open={isOpen} onClose={onClose} maxHeightClass="max-h-[85dvh]">
        {/* Pull handle */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0 border-b border-gray-50">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-brand-black truncate">
              {matchTitle}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isConnected ? (
                <>
                  <Wifi className="w-3 h-3 text-brand-green" strokeWidth={2.5} />
                  <span className="text-[10px] text-brand-green font-medium">{t('messages.online')}</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-gray-400" strokeWidth={2} />
                  <span className="text-[10px] text-gray-400">{t('messages.offline')}</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center ml-3 flex-shrink-0 active:scale-95 transition-transform"
            aria-label="Close chat"
          >
            <X className="w-4 h-4 text-gray-500" strokeWidth={2} />
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto scroll-container min-h-[200px] bg-gray-50/50">
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
          {!isLoading && !error && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 px-6">
              <div className="w-16 h-16 rounded-full bg-brand-green/10 flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-brand-green/50" strokeWidth={1.5} />
              </div>
              <h3 className="text-base font-bold text-brand-black mb-1">
                {t('chatSheet.emptyTitle')}
              </h3>
              <p className="text-sm text-gray-400 text-center max-w-[240px]">
                {t('chatSheet.emptyDescription')}
              </p>
            </div>
          )}

          {/* Populated — grouped messages */}
          {!isLoading && !error && grouped.map((group) => (
            <div key={group.label}>
              {/* Date divider */}
              <div className="flex items-center justify-center py-4">
                <div className="bg-gray-200/60 rounded-full px-3 py-0.5">
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    {group.label}
                  </span>
                </div>
              </div>

              {group.messages.map((msg) => {
                const isMine = msg.user_id === currentUserId;
                const avatarInitial = (msg.user?.full_name ?? 'P').charAt(0).toUpperCase();
                const timeStr = new Date(msg.created_at).toLocaleTimeString(locale, {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                });

                return (
                  <div
                    key={msg.id}
                    className={`flex items-end gap-2 px-4 py-1.5 ${
                      isMine ? 'flex-row-reverse' : 'flex-row'
                    }`}
                  >
                    {/* Avatar (hidden for own messages) */}
                    {!isMine && (
                      <div className="w-7 h-7 rounded-full bg-brand-green/20 flex items-center justify-center flex-shrink-0 mb-0.5">
                        <span className="text-[10px] font-bold text-brand-green">
                          {avatarInitial}
                        </span>
                      </div>
                    )}

                    {/* Bubble */}
                    <div
                      className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl ${
                        isMine
                          ? 'bg-brand-green text-white rounded-br-md'
                          : 'bg-white shadow-sm border border-gray-100 rounded-bl-md'
                      }`}
                    >
                      {/* Sender name (in group chats, show for others) */}
                      {!isMine && (
                        <p className="text-[10px] font-semibold text-brand-green mb-0.5">
                          {msg.user?.full_name ?? msg.user?.handle ?? 'Player'}
                        </p>
                      )}
                      <p className={`text-sm leading-relaxed ${isMine ? 'text-white' : 'text-gray-700'}`}>
                        {msg.content}
                      </p>
                    </div>

                    {/* Time + delivery status */}
                    <span className={`flex items-center gap-1 flex-shrink-0 mb-0.5 ${isMine ? 'text-end' : ''}`}>
                      <span className="text-[9px] text-gray-400">{timeStr}</span>
                      {isMine && msg.status === 'sending' && (
                        <Loader2 className="w-3 h-3 animate-spin text-gray-400" strokeWidth={2} />
                      )}
                      {isMine && msg.status === 'failed' && (
                        <button
                          onClick={() => handleRetry(msg)}
                          className="flex items-center justify-center"
                          aria-label={`${t('messages.failedToSend')} — ${t('messages.tapToRetry')}`}
                          title={t('messages.tapToRetry')}
                        >
                          <AlertCircle className="w-4 h-4 text-brand-red" strokeWidth={2} />
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>

        {/* Input row */}
        <div className="flex items-center gap-2 px-4 py-3 pb-safe border-t border-gray-100 flex-shrink-0 bg-white">
          <div className="flex-1 flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2.5 border border-gray-100 focus-within:border-brand-green focus-within:bg-white transition-colors">
            <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={1.5} />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chatSheet.sendPlaceholder')}
              maxLength={500}
              className="flex-1 text-sm text-brand-black placeholder:text-gray-400 outline-none bg-transparent"
            />
            {input.length > 0 && (
              <span className="text-[10px] text-gray-400 flex-shrink-0">{input.length}/500</span>
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-95 ${
              input.trim()
                ? 'bg-brand-green text-white shadow-[0_4px_12px_rgba(37,65,50,0.3)]'
                : 'bg-gray-200 text-gray-400'
            }`}
            aria-label={t('messages.send')}
          >
            <Send className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
    </BottomSheet>
  );
}
