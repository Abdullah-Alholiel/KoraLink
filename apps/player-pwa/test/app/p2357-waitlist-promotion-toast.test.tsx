import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import arMessages from '@/messages/ar.json';
import enMessages from '@/messages/en.json';
import { useAppStore } from '@/store/useAppStore';
import type { Match } from '@/types';

/**
 * P2-357 (run #228): a queued player watching a FULL match must get a visible,
 * in-app transition when the host frees a spot and the API auto-promotes them
 * (wallet charged). The API admits waitlisted viewers to the match room
 * (roster-update { promoted } drives the refetch) and emits the PRIVATE
 * 'waitlist-promoted' { matchId, chargedSar } to the promoted user's personal
 * room (PR-Agent r1: the charge amount never rides the room broadcast). The
 * page toasts the move + charged amount on that event, matchId-guarded.
 */

// ── Realtime stub: on() registers handlers the test can fire ──
const rt = vi.hoisted(() => {
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  return {
    handlers,
    emit(event: string, payload: unknown) {
      handlers.get(event)?.forEach((h) => h(payload));
    },
    client: {
      on: (event: string, h: (p: unknown) => void) => {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event)!.add(h);
        return () => handlers.get(event)?.delete(h);
      },
      connect: () => undefined,
      disconnect: () => undefined,
      joinRoom: () => undefined,
      leaveRoom: () => undefined,
    },
  };
});
vi.mock('@/lib/realtime', () => ({ getRealtime: () => rt.client }));

// ── Data hooks ──
const state = vi.hoisted(() => ({ match: null as unknown }));
const mutation = vi.hoisted(() => () => ({ mutate: () => undefined, mutateAsync: async () => undefined, isPending: false }));
vi.mock('@/hooks/useMatches', () => ({
  useMatch: () => ({ data: state.match, isLoading: false, error: null, refetch: vi.fn() }),
  useMarkNoShow: mutation,
  useRemovePlayer: mutation,
}));
vi.mock('@/hooks/useDisputes', () => ({
  useAppeal: mutation,
  useOpenDispute: mutation,
  useMyDispute: () => ({ data: undefined }),
}));
vi.mock('@/hooks/useMatchActions', () => ({
  useJoinMatch: mutation,
  useLeaveMatch: mutation,
  useCancelMatch: mutation,
  useStartMatch: mutation,
  useCompleteMatch: mutation,
  useRescheduleMatch: mutation,
  useJoinWaitlist: mutation,
  useLeaveWaitlist: mutation,
}));
vi.mock('@/hooks/useWallet', () => ({ useWalletBalance: () => ({ data: { balance: 100 } }) }));
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }));
vi.mock('@/env.mjs', () => ({ env: {} }));
vi.mock('@/providers/ObservabilityProvider', () => ({ trackEvent: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/en/match/m1',
}));
vi.mock('next/image', () => ({ default: () => null }));

// ── Child components: irrelevant to the transition → render nothing ──
const Null = vi.hoisted(() => ({ default: () => null }));
vi.mock('@/components/layout/MobileFrame', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/layout/BottomNav', () => Null);
vi.mock('@/components/layout/Toast', () => Null);
vi.mock('@/components/layout/OfflineBanner', () => Null);
vi.mock('@/components/payment/PaymentSheet', () => Null);
vi.mock('@/components/push/PushNudgeCard', () => Null);
vi.mock('@/components/matches/AppealSheet', () => Null);
vi.mock('@/components/matches/AttendanceBanner', () => Null);
vi.mock('@/components/matches/AttendanceSheet', () => Null);
vi.mock('@/components/matches/CancelMatchSheet', () => Null);
vi.mock('@/components/matches/ChatSheet', () => Null);
vi.mock('@/components/matches/EmergencyCancelSheet', () => Null);
vi.mock('@/components/matches/GameDetails', () => Null);
vi.mock('@/components/matches/HostPayoutReceipt', () => Null);
vi.mock('@/components/matches/LeaveMatchSheet', () => Null);
vi.mock('@/components/matches/LocationMap', () => Null);
vi.mock('@/components/matches/MatchRulesSheet', () => Null);
vi.mock('@/components/matches/OngoingGameJoinSheet', () => Null);
vi.mock('@/components/matches/PlayerProfileSheet', () => Null);
vi.mock('@/components/matches/PostMatchSection', () => Null);
vi.mock('@/components/matches/ReportDisputeSheet', () => Null);
vi.mock('@/components/matches/ReportSheet', () => Null);
vi.mock('@/components/matches/RescheduleSheet', () => Null);
vi.mock('@/components/matches/TeamLineup', () => Null);

import MatchDetailPage from '@/app/[locale]/match/[id]/page';

const MATCH_ID = '11111111-1111-4111-8111-111111111111';

function queuedMatch(): Match {
  const scheduled = new Date(Date.now() + 2 * 86_400_000);
  return {
    id: MATCH_ID,
    title: 'Tuesday Padel',
    hostId: 'host-1',
    organizer: { id: 'host-1', name: 'Host', handle: 'host', avatarUrl: '' } as Match['organizer'],
    date: scheduled.toISOString(),
    time: '7:00 PM',
    scheduledAt: scheduled.toISOString(),
    endsAt: new Date(scheduled.getTime() + 90 * 60_000).toISOString(),
    location: 'Riyadh',
    venueName: 'KSU',
    format: '5v5',
    surface: 'Grass',
    gender: 'mixed',
    intensity: 'Casual',
    price: 37.5,
    currency: 'SAR',
    totalSpots: 10,
    filledSpots: 10,
    status: 'full',
    roster: [],
    comments: [],
    isJoined: false,
    isUserHost: false,
    waitlistCount: 3,
    yourWaitlistPosition: 1,
  };
}

/** React 19 `use()` reads a pre-fulfilled thenable synchronously. */
function fulfilled<T>(value: T): Promise<T> {
  return Object.assign(Promise.resolve(value), { status: 'fulfilled', value });
}

function renderPage(locale: 'en' | 'ar') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'ar' ? arMessages : enMessages}>
      <MatchDetailPage params={fulfilled({ id: MATCH_ID, locale })} />
    </NextIntlClientProvider>,
  );
}

const toastMessage = () => useAppStore.getState().toast?.message;

beforeEach(() => {
  rt.handlers.clear();
  state.match = queuedMatch();
  useAppStore.setState({
    user: { id: 'user-1' } as never,
    toast: null,
  });
});

describe('P2-357 — waitlist auto-promotion toast on the match page', () => {
  it('EN: waitlist-promoted for my match while queued → charged toast with the amount', () => {
    renderPage('en');
    act(() => rt.emit('waitlist-promoted', { matchId: MATCH_ID, chargedSar: 37.5 }));

    const msg = toastMessage();
    expect(msg).toBe(
      'A spot opened up — you were moved off the waitlist into the game. 37.50 SAR was charged to your wallet.',
    );
    expect(useAppStore.getState().toast?.type).toBe('success');
  });

  it('AR: charged toast renders Arabic-Indic amount digits', () => {
    renderPage('ar');
    act(() => rt.emit('waitlist-promoted', { matchId: MATCH_ID, chargedSar: 37.5 }));

    const msg = toastMessage() ?? '';
    expect(msg).toContain('٣٧٫٥٠');
    expect(msg).toContain('ريال');
    expect(msg).toContain(arMessages.waitlist.promoted);
    expect(msg).not.toMatch(/[0-9]/);
  });

  it('free promotion (chargedSar null) → plain promoted toast', () => {
    renderPage('en');
    act(() => rt.emit('waitlist-promoted', { matchId: MATCH_ID, chargedSar: null }));

    expect(toastMessage()).toBe(enMessages.waitlist.promoted);
  });

  it('promotion in ANOTHER match → NO toast (matchId guard)', () => {
    renderPage('en');
    act(() => rt.emit('waitlist-promoted', { matchId: 'other-match', chargedSar: 37.5 }));

    expect(useAppStore.getState().toast).toBeNull();
  });

  it('plain roster-update (room broadcast, no personal event) → NO toast', () => {
    renderPage('en');
    act(() => rt.emit('roster-update', { promoted: 'user-1' }));

    expect(useAppStore.getState().toast).toBeNull();
  });

  it('not queued (already on the roster) → NO toast', () => {
    state.match = { ...queuedMatch(), yourWaitlistPosition: null, isJoined: true };
    renderPage('en');
    act(() => rt.emit('waitlist-promoted', { matchId: MATCH_ID, chargedSar: 37.5 }));

    expect(useAppStore.getState().toast).toBeNull();
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderPage('en');
    unmount();
    expect(rt.handlers.get('waitlist-promoted')?.size ?? 0).toBe(0);
  });
});

describe('P2-357 — i18n parity for the new waitlist keys', () => {
  it('promoted + promotedCharged exist in BOTH en and ar waitlist namespaces', () => {
    for (const m of [enMessages, arMessages]) {
      expect(typeof m.waitlist.promoted).toBe('string');
      expect(m.waitlist.promotedCharged).toContain('{amount}');
    }
    expect(Object.keys(arMessages.waitlist).sort()).toEqual(Object.keys(enMessages.waitlist).sort());
  });
});
