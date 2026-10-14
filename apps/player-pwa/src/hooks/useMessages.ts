'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRealtime } from '@/lib/realtime';
import { fetcher, FetchError } from '@/lib/fetcher';
import { listRefetchInterval, deepestPageParam } from '@/lib/query-schedule';
import { useAppStore, selectUser } from '@/store/useAppStore';
import {
  adaptDiscussionList,
  type DiscussionsApiResponse,
} from '@/lib/discussion-adapter';
import type { Discussion } from '@/types';

// ─── Types ────────────────────────────────────────────

export type MessageStatus = 'sending' | 'sent' | 'failed';

export interface MatchMessage {
  id: string;
  match_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user: {
    id: string;
    full_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  };
  /** Client-generated idempotency key (present on optimistic + echoed messages). */
  client_message_id?: string | null;
  /** Local-only delivery status. Absent on authoritative server messages. */
  status?: MessageStatus;
}

export interface MyJoinedMatch {
  id: string;
  title: string;
  status: string;
  scheduled_at: string;
  max_players: number;
  price_per_player: number;
  spots_filled: number;
  venue_name: string;
  venue_city: string;
}

/** How long an optimistic message waits for the authoritative echo before failing. */
const ACK_TIMEOUT_MS = 10_000;

// ─── My Joined Matches (Active Discussions list) ──────

export function useMyMatches() {
  return useQuery<MyJoinedMatch[], FetchError>({
    queryKey: ['user', 'me', 'matches'],
    queryFn: () => fetcher<MyJoinedMatch[]>('/users/me/matches'),
  });
}

// ─── Unified Discussions (Messages screen) ────────────

/** Canonical envelope of GET /users/me/discussions. */
export interface DiscussionsResponse {
  discussions: DiscussionsApiResponse['discussions'];
  total: number;
  hasMore: boolean;
}

const DISCUSSIONS_PAGE_SIZE = 30;

/**
 * Unified discussions, paged (30 per page). The API is paginated
 * (?page=&perPage=) — every joined match creates a discussion row, so the
 * list outgrows one page for active players. Consumers get a flat array via
 * `discussions` (all loaded pages concatenated); `hasMore`/`fetchNextPage`
 * drive the "Load more" affordance.
 */
export function useDiscussions() {
  const query = useInfiniteQuery({
    queryKey: ['user', 'me', 'discussions'],
    initialPageParam: 1,
    queryFn: async ({ pageParam }): Promise<DiscussionsResponse> => {
      const data = await fetcher<DiscussionsResponse>(
        `/users/me/discussions?page=${pageParam}&perPage=${DISCUSSIONS_PAGE_SIZE}`,
      );
      return data;
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.length + 1;
    },
    maxPages: 10,
    // Freshness poll — page-1 only (see listRefetchInterval / F4 fan-out).
    refetchInterval: ({ state }) =>
      listRefetchInterval({
        isFetching: state.fetchStatus === 'fetching',
        pageParam: deepestPageParam(state.data),
      }),
  });

  const discussions = useMemo(
    () =>
      (query.data?.pages.flatMap((page) => adaptDiscussionList(page)) ??
        []) as Discussion[],
    [query.data],
  );

  return {
    discussions,
    total: query.data?.pages[0]?.total,
    hasMore: Boolean(query.hasNextPage),
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    error: (query.error as FetchError | null) ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
}

// ─── Match Chat: REST history + WebSocket real-time ───

/**
 * Merge the authoritative REST history with locally-appended messages
 * (optimistic + real-time), deduplicating on server id and client id so a
 * history refetch never double-renders a message that is also held locally.
 */
function mergeMessages(
  history: MatchMessage[],
  local: MatchMessage[],
): MatchMessage[] {
  const historyIds = new Set(history.map((m) => m.id));
  const historyClientIds = new Set(
    history.map((m) => m.client_message_id).filter((v): v is string => !!v),
  );
  const extra = local.filter((m) => {
    if (historyIds.has(m.id)) return false;
    if (m.client_message_id && historyClientIds.has(m.client_message_id)) return false;
    return true;
  });
  return [...history, ...extra];
}

/**
 * Fetches chat history via REST and subscribes to the /lobby WebSocket
 * gateway for live `new-message` events. Sends are optimistic: the message
 * is appended immediately (status `sending`), cleared from the input, then
 * reconciled against the server echo (status `sent`) or marked `failed`
 * after an ack timeout / error so the user can retry without retyping.
 *
 * P1-3 (run #65): cursor pagination. The probe requests PAGE+1 messages;
 * a full page means older messages likely exist → `hasMore` + `loadOlder`
 * (before-cursor = oldest displayed message id). Older pages prepend to
 * the authoritative window; the merge dedupes by server id, so a refetch
 * never duplicates rows. When the no-cursor probe returns fewer than the
 * page size the whole history is known-finite (hasMore=false without an
 * extra request — the probe already over-fetched by one).
 *
 * P2-196 (run #132): on every socket RE-connect the hook backfills the gap
 * (`after`-cursor fetch for messages missed while disconnected) and exposes
 * `missedMarker` + `dismissMissedMarker` so the sheet can show a
 * "new while you were away" divider above the first missed message.
 */
const CHAT_PAGE_SIZE = 50;

export function useMatchChat(
  matchId: string | null,
  // P2-111 (run #81): the WS-echo send path has no error channel (the emit
  // just never resolves), so the REST fallback's FetchError is the only
  // carrier of WHY a send failed — e.g. the chat-closed code on a finished
  // match. The sheet turns it into authored, localized copy (P1-47 pattern).
  onSendError?: (err: FetchError) => void,
) {
  const queryClient = useQueryClient();
  const currentUser = useAppStore(selectUser);
  const rt = getRealtime();
  // P2-99 (run #75 lint fix): the typing own-echo filter and the socket
  // effect's deps array both need the raw id — it must live in COMPONENT
  // scope because the deps array is an argument to useEffect(), evaluated
  // in the component body, not inside the effect closure.
  const currentUserId = currentUser?.id;
  const [localMessages, setLocalMessages] = useState<MatchMessage[]>([]);
  const [olderMessages, setOlderMessages] = useState<MatchMessage[]>([]);
  const [olderExhausted, setOlderExhausted] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const ackTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Reconnect backfill (P2-196, run #132) ────────────────────────────────
  // A socket drop between "connected" moments silently loses room fan-out.
  // On every RE-connect (not the first connect — the initial REST history
  // probe already covers that), the hook pages the server for messages
  // STRICTLY NEWER than the newest server message we hold (`after` keyset,
  // the P1-3 direction added server-side this run) and reconciles them in.
  // Messages that are genuinely new (ids never seen) arm the "new while you
  // were away" marker the sheet renders above the first missed message.
  const [missedMarker, setMissedMarker] = useState<{ count: number; firstId: string } | null>(
    null,
  );
  const hadServerMessagesRef = useRef(false);
  const lastServerIdRef = useRef<string | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const backfillInFlightRef = useRef(false);
  // Latch: the FIRST connect of a subscription is covered by the initial
  // REST history probe — backfilling it would replay the same window. Only
  // SUBSEQUENT connects (real reconnects) page the server.
  const firstConnectDoneRef = useRef(false);

  // ── Typing indicator (P2-99, run #74) ─────────────────────────────────────
  // userIds currently typing in this lobby; 4s TTL per signal (server relays
  // the typer's userId only — names resolve from the merged message view).
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(new Set());
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastTypingSentRef = useRef(0);
  const TYPING_EMIT_INTERVAL_MS = 3_000;
  const TYPING_EXPIRE_MS = 4_000;

  // REST history query — probes PAGE+1 to detect hasMore in one request.
  const historyQuery = useQuery<MatchMessage[], FetchError>({
    queryKey: ['match', matchId, 'messages'],
    queryFn: () =>
      fetcher<MatchMessage[]>(`/matches/${matchId}/messages?limit=${CHAT_PAGE_SIZE + 1}`, {
        method: 'GET',
      }),
    enabled: !!matchId,
  });

  // The authoritative window = the newest PAGE messages of the probe
  // (the +1 was only the hasMore signal). Array.isArray guard: a non-array
  // payload (contract drift / error shape) renders as empty, never crashes.
  const probe = Array.isArray(historyQuery.data) ? historyQuery.data : [];
  const history = probe.slice(-CHAT_PAGE_SIZE);
  // Run #66 (reviewer A): hasMore must also flip false when an older page
  // comes back short — history's end is then known, and the affordance must
  // disappear instead of refiring a terminal request on every tap.
  const hasMore = !olderExhausted && probe.length > CHAT_PAGE_SIZE;

  // Load one older page before the oldest currently-known message.
  const loadOlder = useCallback(async () => {
    if (!matchId || isLoadingOlder || !hasMore) return;
    const all = [...olderMessages, ...history, ...localMessages];
    const oldest = all.find((m) => !m.id.startsWith('local-'));
    if (!oldest) return;
    setIsLoadingOlder(true);
    try {
      const older = await fetcher<MatchMessage[]>(
        `/matches/${matchId}/messages?before=${encodeURIComponent(oldest.id)}&limit=${CHAT_PAGE_SIZE}`,
        { method: 'GET' },
      );
      if (!Array.isArray(older)) return; // contract drift — stay silent
      // A short page = the API had fewer than PAGE rows older than the
      // cursor: the beginning of history. Stop offering the affordance.
      if (older.length < CHAT_PAGE_SIZE) setOlderExhausted(true);
      setOlderMessages((prev) => {
        const seen = new Set([...prev, ...history].map((m) => m.id));
        // `older` is chronological (ASC) and entirely older than `prev` —
        // prepend as-is so the combined buffer stays oldest-first.
        const fresh = older.filter((m) => !seen.has(m.id));
        return [...fresh, ...prev];
      });
    } catch {
      // Silent: the affordance stays; the user can tap again (offline or a
      // transient 5xx must not boot the user out of the sheet).
    } finally {
      setIsLoadingOlder(false);
    }
  }, [matchId, isLoadingOlder, hasMore, olderMessages, history, localMessages]);

  // Reset paged history when the sheet moves to another match (the local
  // message buffer below resets the same way).
  useEffect(() => {
    setOlderMessages([]);
    setOlderExhausted(false);
  }, [matchId]);

  // Reconcile an authoritative message into local state (replace the matching
  // optimistic message in place, or append if it's a new/other-user message).
  const reconcile = useCallback(
    (message: MatchMessage) => {
      if (message.client_message_id) {
        const timer = ackTimersRef.current.get(message.client_message_id);
        if (timer) {
          clearTimeout(timer);
          ackTimersRef.current.delete(message.client_message_id);
        }
      }

      setLocalMessages((prev) => {
        const index = prev.findIndex(
          (m) => m.client_message_id && m.client_message_id === message.client_message_id,
        );
        if (index >= 0) {
          const next = [...prev];
          next[index] = { ...message, status: 'sent' };
          return next;
        }
        if (prev.some((m) => m.id === message.id)) return prev; // dedup by server id
        return [...prev, message];
      });

      // Keep the match-detail "Latest Discussion" preview in sync.
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
    },
    [queryClient, matchId],
  );

  // ── Reconnect backfill fetcher (P2-196, run #132) ────────────────────────
  // Fired by the socket effect's `connect` handler on every RE-connect.
  // Pages the server for messages strictly newer than the newest server
  // message we already hold (`after` keyset — matches.service.ts getMessages
  // P2-196 direction) and reconciles them in. Ids never seen before arm the
  // "new while you were away" marker (cleared by a send or via the sheet).
  const backfillAfterReconnect = useCallback(async () => {
    if (!matchId || backfillInFlightRef.current) return;
    // First connect: the initial REST history probe already covers this
    // window — backfilling here would just replay the same page. The latch
    // flips on the first connect; later connects (real reconnects) pass.
    if (!firstConnectDoneRef.current) {
      firstConnectDoneRef.current = true;
      return;
    }
    if (!hadServerMessagesRef.current || !lastServerIdRef.current) return;
    backfillInFlightRef.current = true;
    try {
      // PR-Agent (run #132): one 100-row page would strand the rest of a
      // >100-message gap permanently (loadOlder pages OLDER than the oldest
      // displayed message, never into a middle hole). Continue from the last
      // fetched id until a short page (gap exhausted), 10-page safety cap —
      // a cap hit degrades to partial backfill; the next reconnect continues
      // from the NEW newest-known id, so nothing is permanently lost.
      let cursor: string = lastServerIdRef.current;
      let freshCount = 0;
      let freshFirstId: string | null = null;
      for (let page = 0; page < 10; page += 1) {
        const batch = await fetcher<MatchMessage[]>(
          `/matches/${matchId}/messages?after=${encodeURIComponent(cursor)}&limit=100`,
          { method: 'GET' },
        );
        if (!Array.isArray(batch) || batch.length === 0) break;
        // Snapshot BEFORE reconciling: reconcile feeds these rows into
        // state, and the known-ids effect only runs after the next render —
        // knownIdsRef stays stable across the whole loop.
        for (const m of batch) {
          if (!knownIdsRef.current.has(m.id)) {
            freshCount += 1;
            if (!freshFirstId) freshFirstId = m.id;
          }
          reconcile(m);
        }
        if (batch.length < 100) break; // gap exhausted
        cursor = batch[batch.length - 1].id;
      }
      if (freshCount > 0 && freshFirstId) {
        setMissedMarker({ count: freshCount, firstId: freshFirstId });
      }
    } catch {
      // Silent: a failed backfill must not boot the user out of a recovered
      // session — the next reconnect retries (same posture as loadOlder).
    } finally {
      backfillInFlightRef.current = false;
    }
  }, [matchId, reconcile]);

  // Track server-message ids seen (marker freshness + backfill cursor).
  // Runs after every merged-view change; refs are written here, never in
  // render. The newest cursor follows the (created_at, id) keyset order.
  useEffect(() => {
    let last: MatchMessage | null = null;
    for (const m of messages) {
      if (m.id.startsWith('local-')) continue;
      knownIdsRef.current.add(m.id);
      if (
        !last ||
        m.created_at > last.created_at ||
        (m.created_at === last.created_at && m.id > last.id)
      ) {
        last = m;
      }
    }
    if (last) {
      hadServerMessagesRef.current = true;
      lastServerIdRef.current = last.id;
    }
  });

  // Socket.IO subscription (real-time) — shared client (Slice 2).
  useEffect(() => {
    if (!matchId) return;
    const ackTimers = ackTimersRef.current;
    // P2-99 (run #75 lint fix): captured per-effect-run so the cleanup and the
    // deps array can reference them — `typingTimers` is the SAME Map instance
    // as typingTimersRef.current (ref identity never changes). currentUserId
    // lives in component scope; including it re-subscribes the socket on
    // identity change, keeping the own-echo filter correct
    // (react-hooks/exhaustive-deps).
    const typingTimers = typingTimersRef.current;

    rt.connect();
    rt.joinRoom('match', matchId);

    const onConnect = () => {
      setIsConnected(true);
      // P2-196: a RE-connect may have missed room fan-out — page the server
      // for everything newer than our newest known message. No-op on the
      // first connect (guard inside).
      void backfillAfterReconnect();
    };
    const onDisconnect = () => setIsConnected(false);
    const onNewMessage = (payload: unknown) => {
      reconcile(payload as MatchMessage);
    };

    const offs = [
      rt.on('connect', onConnect),
      rt.on('disconnect', onDisconnect),
      rt.on('new-message', onNewMessage),
    ];

    // The room may already be joined-and-connected (another consumer, or a
    // remount over a live singleton): surface the connected state now — the
    // 'connect' event has already fired for this generation.
    if (rt.isConnected()) setIsConnected(true);

    // P2-99: a peer's typing signal — (re)arm their 4s expiry timer.
    const onTyping = (payload: { userId?: string }) => {
      const userId = payload?.userId;
      if (!userId || userId === currentUserId) return;
      setTypingUserIds((prev) => {
        if (prev.has(userId)) return prev;
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
      const existing = typingTimers.get(userId);
      if (existing) clearTimeout(existing);
      typingTimers.set(
        userId,
        setTimeout(() => {
          typingTimers.delete(userId);
          setTypingUserIds((prev) => {
            if (!prev.has(userId)) return prev;
            const next = new Set(prev);
            next.delete(userId);
            return next;
          });
        }, TYPING_EXPIRE_MS),
      );
    };
    offs.push(rt.on('typing', onTyping));

    return () => {
      offs.forEach((off) => off());
      rt.leaveRoom('match', matchId);
      rt.disconnect();
      setLocalMessages([]);
      ackTimers.forEach(clearTimeout);
      ackTimers.clear();
      // P2-196: reset the reconnect-backfill cursors + marker on unmount or
      // match switch — a new lobby starts from the fresh history probe.
      hadServerMessagesRef.current = false;
      lastServerIdRef.current = null;
      knownIdsRef.current = new Set();
      firstConnectDoneRef.current = false;
      setMissedMarker(null);
      // P2-99: clear all typing expiry timers + state on unmount/switch.
      // `typingTimers` is the SAME Map instance as typingTimersRef.current —
      // the captured alias satisfies react-hooks/exhaustive-deps (run #75)
      // with identical behavior.
      for (const t of typingTimers.values()) clearTimeout(t);
      typingTimers.clear();
      setTypingUserIds(new Set());
    };
  }, [matchId, reconcile, rt, currentUserId]);

  // ── Read watermark (P2-58, run #50) ──────────────────────────────────────
  // While the sheet is open, advance the caller's match-chat read watermark
  // on open and on every newly-reconciled message, so the Messages list stops
  // counting the match as unread (parity with personal-conversation badges).
  const markChatRead = useCallback(
    () => {
      if (!matchId) return;
      if (rt.isConnected()) {
        rt.emit('mark-chat-read', { matchId });
        return;
      }
      // Socket down → REST fallback (same guard chain server-side).
      fetcher<{ ok: true }>(`/matches/${matchId}/messages/read`, {
        method: 'POST',
        body: JSON.stringify({}),
      }).catch(() => {
        // Best-effort: a missed watermark only leaves a stale badge.
      });
    },
    [matchId, rt],
  );

  useEffect(() => {
    if (!matchId) return;
    // Open-mark fires UNCONDITIONALLY on matchId change (sheet open): WS when
    // connected, REST otherwise. Gating it on isConnected would leave chats
    // permanently unread whenever the sheet is opened while the socket is
    // down — history lives in the query cache, so no other path would fire.
    markChatRead();
    // On close/unmount: invalidate the discussions cache so the Messages
    // badge reflects the advanced watermark on back-navigation (staleTime
    // would otherwise serve a pre-read count for up to 30s).
    return () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'me', 'discussions'] });
    };
  }, [matchId, markChatRead, queryClient]);

  // Track which server-ids we already marked read to avoid repeat writes
  // when reconcile replays the same authoritative message (dedup by id);
  // ONE watermark write per batch — never per message. Lives AFTER the
  // merged `messages` view is computed (see bottom of the hook).
  const markedReadIdsRef = useRef<Set<string>>(new Set());

  // Reset the dedup set on match switch (P2-62, run #51): the ref lives for
  // the hook's lifetime, so ids from a previous match would otherwise
  // accumulate unbounded within a session. Runs in the same pass as the
  // open-mark effect above — the new match's marks are never suppressed.
  useEffect(() => {
    markedReadIdsRef.current = new Set();
  }, [matchId]);

  // ── Send message (optimistic + WS primary, REST fallback) ──
  const sendMessage = useMutation<
    MatchMessage | undefined,
    Error,
    { content: string; clientMessageId: string }
  >({
    mutationFn: async ({ content, clientMessageId }) => {
      if (rt.isConnected()) {
        rt.emit('send-message', { matchId, content, clientMessageId });
        // Authoritative message arrives via the `new-message` echo.
        return undefined;
      }
      // REST fallback when the socket is not connected.
      return fetcher<MatchMessage>(`/matches/${matchId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, clientMessageId }),
      });
    },
    onMutate: ({ content, clientMessageId }) => {
      // P2-196: composing a message means the user has seen the backfilled
      // window — clear the "new while you were away" marker.
      setMissedMarker(null);
      const optimistic: MatchMessage = {
        id: `local-${clientMessageId}`,
        match_id: matchId ?? '',
        user_id: currentUser?.id ?? '',
        content,
        created_at: new Date().toISOString(),
        user: {
          id: currentUser?.id ?? '',
          full_name: currentUser?.fullName ?? '',
          handle: currentUser?.handle ?? '',
          avatar_url: currentUser?.avatarUrl ?? '',
        },
        client_message_id: clientMessageId,
        status: 'sending',
      };

      setLocalMessages((prev) => {
        // A retry reuses the same clientMessageId — flip the failed message
        // back to `sending` instead of appending a duplicate.
        const existing = prev.find((m) => m.client_message_id === clientMessageId);
        if (existing) {
          return prev.map((m) =>
            m.client_message_id === clientMessageId ? { ...m, status: 'sending' } : m,
          );
        }
        return [...prev, optimistic];
      });

      // If the echo never arrives (lost emit / dropped connection), surface a
      // failed state so the user can retry rather than seeing a stuck bubble.
      const timer = setTimeout(() => {
        setLocalMessages((prev) =>
          prev.map((m) =>
            m.client_message_id === clientMessageId ? { ...m, status: 'failed' } : m,
          ),
        );
        ackTimersRef.current.delete(clientMessageId);
      }, ACK_TIMEOUT_MS);
      ackTimersRef.current.set(clientMessageId, timer);
    },
    onSuccess: (data, { clientMessageId }) => {
      // REST fallback returns the created message directly → reconcile it.
      if (data && 'id' in data && data.client_message_id === clientMessageId) {
        reconcile(data);
      }
    },
    onError: (err, { clientMessageId }) => {
      setLocalMessages((prev) =>
        prev.map((m) =>
          m.client_message_id === clientMessageId ? { ...m, status: 'failed' } : m,
        ),
      );
      const timer = ackTimersRef.current.get(clientMessageId);
      if (timer) {
        clearTimeout(timer);
        ackTimersRef.current.delete(clientMessageId);
      }
      // P2-111: surface the failure reason (what happened + why) — authored
      // and localized by the sheet from the stable API code.
      if (onSendError && err instanceof FetchError) onSendError(err);
    },
  });

  const retryMessage = useCallback(
    (clientMessageId: string, content: string) => {
      sendMessage.mutate({ content, clientMessageId });
    },
    [sendMessage],
  );

  // ── Typing emitter (P2-99) ────────────────────────────────────────────────
  // Throttled: at most one WS emit per TYPING_EMIT_INTERVAL_MS while the user
  // keeps typing. The server relays to everyone except the typer; receivers
  // expire the signal after TYPING_EXPIRE_MS of silence. WS-only: typing is
  // ephemeral presence — no REST fallback, silently dropped when offline.
  const emitTyping = useCallback(() => {
    if (!rt.isConnected() || !matchId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_EMIT_INTERVAL_MS) return;
    lastTypingSentRef.current = now;
    rt.emit('typing', { matchId });
  }, [matchId, rt]);

  // P1-3: merged view = paged older history + authoritative newest window +
  // locally-appended (optimistic/real-time) messages.
  const messages = mergeMessages([...olderMessages, ...history], localMessages);

  // Batched read-mark: any newly-seen message authored by someone else marks
  // the chat read (ONE watermark write per batch — never per message). Uses
  // the merged authoritative+local view so history loads also count as read;
  // declared after `messages` on purpose.
  useEffect(() => {
    if (!matchId) return;
    let sawNew = false;
    for (const m of messages) {
      if (m.id.startsWith('local-')) continue;
      if (m.user_id === currentUser?.id) continue; // own messages never count
      if (markedReadIdsRef.current.has(m.id)) continue;
      markedReadIdsRef.current.add(m.id);
      sawNew = true;
    }
    if (sawNew) markChatRead();
  }, [messages, matchId, markChatRead, currentUser?.id]);

  return {
    ...historyQuery,
    messages,
    isConnected,
    sendMessage,
    retryMessage,
    // P1-3 pagination surface
    hasMore,
    isLoadingOlder,
    loadOlder,
    // P2-99 typing surface
    typingUserIds,
    emitTyping,
    // P2-196 reconnect-backfill surface
    missedMarker,
    dismissMissedMarker: useCallback(() => setMissedMarker(null), []),
  };
}
