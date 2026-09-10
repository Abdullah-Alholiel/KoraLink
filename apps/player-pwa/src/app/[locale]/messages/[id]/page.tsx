'use client';

import { useEffect, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowLeft, Send, AlertCircle, Loader2, MoreVertical, MessageSquare } from 'lucide-react';
import MobileFrame from '@/components/layout/MobileFrame';
import { useConversations, useConversationMessages } from '@/hooks/useConversations';
import type { PersonalMessage } from '@/hooks/useConversations';
import PlayerProfileSheet from '@/components/matches/PlayerProfileSheet';
import ReportSheet from '@/components/matches/ReportSheet';
import { selectUser, useAppStore } from '@/store/useAppStore';
import { useNow } from '@/hooks/useNow';
import { uuid } from '@/lib/uuid';
import type { RosterPlayer } from '@/types';

// ── Date grouping (same style as ChatSheet) ────────────

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
  messages: PersonalMessage[],
  t: (key: string) => string,
  locale: string,
  nowMs: number,
) {
  const groups: { label: string; messages: PersonalMessage[] }[] = [];
  const now = new Date(nowMs);

  for (const msg of messages) {
    const group = getDateGroup(msg.createdAt, now);
    const label =
      group === 'today' ? t('messages.today') :
      group === 'yesterday' ? t('messages.yesterday') :
      new Date(msg.createdAt).toLocaleDateString(locale, { month: 'short', day: 'numeric' });

    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.messages.push(msg);
    } else {
      groups.push({ label, messages: [msg] });
    }
  }
  return groups;
}

export default function ConversationPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const t = useTranslations();
  const locale = useLocale();
  const storeUser = useAppStore(selectUser);

  const { data: conversations } = useConversations();
  const { messages, isLoading, error, sendMessage, retryMessage } = useConversationMessages(id);

  const [draft, setDraft] = useState('');
  // Hydration-safe clock (run #49): `now` is null during SSR AND the first
  // client render — identical on both sides — so the date-divider grouping
  // and per-bubble time labels can never server/client diverge (Reviewer A
  // IMPORTANT, run #49). Post-mount it flips to the device clock, refreshing
  // labels on the next render.
  const now = useNow();
  const nowMs = now ?? 0;
  // P1-31: the message being reported (overflow ⋯ on a received bubble).
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);
  // Profile sheet for the other participant (avatar / header taps).
  const [profilePlayer, setProfilePlayer] = useState<RosterPlayer | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const conversation = conversations?.find((c) => c.id === id);
  const otherName = conversation?.otherParticipant.fullName ?? t('messages.directMessages');

  // The other participant — from the conversation summary, or derived from
  // the message history when the list query has not resolved yet.
  const otherParticipant =
    conversation?.otherParticipant ??
    (() => {
      const received = messages.find((m) => m.sender.id !== storeUser?.id);
      return received ? received.sender : null;
    })();

  const openProfile = (sender: PersonalMessage['sender']) => {
    setProfilePlayer({
      id: sender.id,
      userId: sender.id,
      name: sender.fullName ?? sender.handle ?? 'Player',
      avatarUrl: sender.avatarUrl ?? '',
      team: null,
      isHost: false,
    });
  };

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

  const groups = groupMessages(messages, t, locale, nowMs);

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
          {/* Other participant — tap to open their profile sheet */}
          <button
            onClick={() => otherParticipant && openProfile(otherParticipant)}
            className="flex items-center gap-3 flex-1 min-w-0 text-start active:opacity-70 transition-opacity"
            aria-label={t('matchDetail.playerProfile')}
          >
            <span className="w-9 h-9 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {conversation?.otherParticipant.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={conversation.otherParticipant.avatarUrl}
                  alt={otherName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-sm font-bold text-brand-green">
                  {otherName.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span className="text-base font-bold text-brand-black truncate">{otherName}</span>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scroll-container py-4">
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
            <div className="flex flex-col items-center justify-center py-12 px-8">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <MessageSquare className="w-7 h-7 text-gray-300" strokeWidth={1.5} />
              </div>
              <p className="text-sm text-gray-400 text-center">{t('messages.noMessagesYet')}</p>
            </div>
          )}

          {groups.map((group) => (
            <div key={group.label}>
              {/* Date divider — same pill style as ChatSheet */}
              <div className="flex items-center justify-center py-4">
                <div className="bg-gray-200/60 rounded-full px-3 py-0.5">
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    {group.label}
                  </span>
                </div>
              </div>

              {group.messages.map((m) => {
                const mine = m.sender.id === storeUser?.id;
                const timeStr = now === null
                  ? ' '
                  : new Date(m.createdAt).toLocaleTimeString(locale, {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    });

                return (
                  // Full-width row (ChatSheet anatomy) — the bubble's
                  // max-w-[75%] resolves against a definite width here.
                  <div
                    key={m.id}
                    className={`flex items-end gap-2 px-4 py-1.5 ${
                      mine ? 'flex-row-reverse' : 'flex-row'
                    }`}
                  >
                    {/* Avatar (others only) — tap to open their profile sheet */}
                    {!mine && (
                      <button
                        onClick={() => openProfile(m.sender)}
                        className="w-7 h-7 rounded-full bg-brand-green/20 flex items-center justify-center flex-shrink-0 mb-0.5 overflow-hidden active:scale-95 transition-transform"
                        aria-label={t('matchDetail.playerProfile')}
                      >
                        {m.sender.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.sender.avatarUrl}
                            alt={m.sender.fullName ?? 'Player'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] font-bold text-brand-green">
                            {(m.sender.fullName ?? m.sender.handle ?? 'P').charAt(0).toUpperCase()}
                          </span>
                        )}
                      </button>
                    )}

                    {/* Bubble */}
                    <div
                      data-testid="dm-bubble"
                      className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl ${
                        mine
                          ? 'bg-brand-green text-white rounded-br-md'
                          : 'bg-white shadow-sm border border-gray-100 rounded-bl-md'
                      }`}
                    >
                      <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                        {m.content}
                      </p>
                    </div>

                    {/* Time + delivery status (mine) / report overflow (theirs) */}
                    <span className={`flex items-center gap-1 flex-shrink-0 mb-0.5 ${mine ? 'text-end' : ''}`}>
                      <span className="text-[9px] text-gray-400">{timeStr}</span>
                      {mine && m.status === 'sending' && (
                        <Loader2 className="w-3 h-3 animate-spin text-gray-400" strokeWidth={2} />
                      )}
                      {mine && m.status === 'failed' && (
                        <button
                          onClick={() => handleRetry(m)}
                          className="flex items-center justify-center"
                          aria-label={`${t('messages.failedToSend')} — ${t('messages.tapToRetry')}`}
                          title={t('messages.tapToRetry')}
                        >
                          <AlertCircle className="w-4 h-4 text-brand-red" strokeWidth={2} />
                        </button>
                      )}
                      {!mine && (
                        // P1-31: report an abusive received message.
                        <button
                          onClick={() => setReportTargetId(m.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:text-gray-500 hover:bg-gray-100 active:scale-95 transition-all"
                          aria-label={t('report.reportMessage')}
                        >
                          <MoreVertical className="w-4 h-4" strokeWidth={2} />
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Input row — same style as ChatSheet */}
        <div className="flex items-center gap-2 px-4 py-3 pb-safe border-t border-gray-100 flex-shrink-0 bg-white">
          <div className="flex-1 flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2.5 border border-gray-100 focus-within:border-brand-green focus-within:bg-white transition-colors">
            <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={1.5} />
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={t('messages.typeMessage')}
              maxLength={2000}
              className="flex-1 text-sm text-brand-black placeholder:text-gray-400 outline-none bg-transparent"
            />
            {draft.length > 0 && (
              <span className="text-[10px] text-gray-400 flex-shrink-0">{draft.length}/2000</span>
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={!draft.trim()}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-brand-green text-white disabled:bg-gray-200 disabled:text-gray-400 active:scale-95 transition-transform"
            aria-label={t('messages.send')}
          >
            <Send className="w-4 h-4" strokeWidth={2} />
          </button>
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

        {/* Profile sheet — avatar / header taps (same sheet as match rosters). */}
        <PlayerProfileSheet
          player={profilePlayer}
          onClose={() => setProfilePlayer(null)}
        />
      </div>
    </MobileFrame>
  );
}
