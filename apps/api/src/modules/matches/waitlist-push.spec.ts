import { MatchWaitlistService, type WaitlistPromotion } from './waitlist.service';
import type { ActivitiesService } from '../activities/activities.service';
import type { AppGateway } from '../gateway/app.gateway';
import type { RealtimeService } from '../gateway/realtime.service';
import type { NotificationsService } from '../notifications/notifications.service';

/**
 * P2-95 (run #70): a waitlist promotion now PUSHES. Before this slice the
 * push-text catalog carried `waitlist_promoted` with NO caller — the promoted
 * player only got an in-app activity row, so someone away from the app never
 * learned a spot opened for them (Reviewer B, run #70).
 *
 * The notify path is fire-and-forget by contract: a failure in the activity
 * leg OR the push leg must never throw to the caller that just committed the
 * promotion.
 */

const promotion: WaitlistPromotion = {
  userId: 'user-1',
  previousPosition: 2,
  matchTitle: 'Tuesday Padel @ KSU',
  chargedSar: null,
};

function makeService(overrides: {
  activities?: Partial<ActivitiesService>;
  notifications?: Partial<NotificationsService>;
  gateway?: Partial<AppGateway>;
  realtime?: Partial<RealtimeService>;
} = {}) {
  const activities = { record: jest.fn(async () => undefined), ...overrides.activities };
  const gateway = { broadcastRosterUpdate: jest.fn(), ...overrides.gateway };
  const realtime = { emitToUser: jest.fn(), ...overrides.realtime };
  const notifications = {
    sendPushToUsers: jest.fn(async () => 1),
    ...overrides.notifications,
  };

  const svc = new MatchWaitlistService(
    {} as never, // db — unused on the notify path
    activities as unknown as ActivitiesService,
    gateway as unknown as AppGateway,
    notifications as unknown as NotificationsService,
    realtime as unknown as RealtimeService,
  );
  return { svc, activities, gateway, realtime, notifications };
}

describe('MatchWaitlistService.notifyPromotion — charged-amount surface (run #200, P2-333)', () => {
  const chargedPromotion: WaitlistPromotion = {
    userId: 'user-1',
    previousPosition: 2,
    matchTitle: 'Tuesday Padel @ KSU',
    chargedSar: 37,
  };

  it('a CHARGED promotion names the exact amount in the push vars', async () => {
    const { svc, notifications } = makeService();

    await svc.notifyPromotion(chargedPromotion, 'match-1');

    expect(notifications.sendPushToUsers).toHaveBeenCalledWith(['user-1'], {
      key: 'waitlist_promoted',
      vars: { title: 'Tuesday Padel @ KSU', amount: '37.00' },
      data: { type: 'waitlist-promoted', matchId: 'match-1' },
      category: 'match',
    });
  });

  it('a FREE promotion (chargedSar null) keeps the plain invite copy — no amount var', async () => {
    const { svc, notifications } = makeService();

    await svc.notifyPromotion({ ...promotion, chargedSar: null }, 'match-1');

    expect(notifications.sendPushToUsers).toHaveBeenCalledWith(['user-1'], {
      key: 'waitlist_promoted',
      vars: { title: 'Tuesday Padel @ KSU' },
      data: { type: 'waitlist-promoted', matchId: 'match-1' },
      category: 'match',
    });
  });
});

describe('MatchWaitlistService.notifyPromotion — P2-95 push fan-out (run #70)', () => {
  it('sends the waitlist_promoted push with the semantic key + match deep-link data', async () => {
    const { svc, notifications } = makeService();

    await svc.notifyPromotion(promotion, 'match-1');

    expect(notifications.sendPushToUsers).toHaveBeenCalledTimes(1);
    expect(notifications.sendPushToUsers).toHaveBeenCalledWith(['user-1'], {
      key: 'waitlist_promoted',
      vars: { title: 'Tuesday Padel @ KSU' },
      data: { type: 'waitlist-promoted', matchId: 'match-1' },
      category: 'match',
    });
  });

  it('still records the activity + roster broadcast (fan-out order preserved)', async () => {
    const { svc, activities, gateway, notifications } = makeService();

    await svc.notifyPromotion(promotion, 'match-1');

    expect(activities.record).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'waitlist_promoted', matchId: 'match-1' }),
    );
    expect(gateway.broadcastRosterUpdate).toHaveBeenCalledWith('match-1', {
      promoted: 'user-1',
    });
    expect(notifications.sendPushToUsers).toHaveBeenCalled();
  });

  it('swallows a push failure — the promotion fan-out never throws', async () => {
    const { svc, notifications } = makeService({
      notifications: { sendPushToUsers: jest.fn(async () => {
        throw new Error('web-push 410 gone');
      }) },
    });

    await expect(svc.notifyPromotion(promotion, 'match-1')).resolves.toBeUndefined();
    expect(notifications.sendPushToUsers).toHaveBeenCalledTimes(1);
  });

  it('swallows an activity failure and still attempts the push', async () => {
    const { svc, notifications } = makeService({
      activities: { record: jest.fn(async () => {
        throw new Error('activity insert failed');
      }) },
    });

    await expect(svc.notifyPromotion(promotion, 'match-1')).resolves.toBeUndefined();
    expect(notifications.sendPushToUsers).toHaveBeenCalledTimes(1);
  });
});

describe('MatchWaitlistService.notifyPromotion — P2-357 private charge surface', () => {
  it('room broadcast keeps { promoted } ONLY — no chargedSar to the match room (PR-Agent r1: private finance)', async () => {
    const { svc, gateway } = makeService();

    await svc.notifyPromotion({ ...promotion, chargedSar: 37.5 }, 'match-1');

    expect(gateway.broadcastRosterUpdate).toHaveBeenCalledWith('match-1', {
      promoted: 'user-1',
    });
  });

  it('a CHARGED promotion emits waitlist-promoted { matchId, chargedSar } to the promoted user ONLY', async () => {
    const { svc, realtime } = makeService();

    await svc.notifyPromotion({ ...promotion, chargedSar: 37.5 }, 'match-1');

    expect(realtime.emitToUser).toHaveBeenCalledTimes(1);
    expect(realtime.emitToUser).toHaveBeenCalledWith('user-1', 'waitlist-promoted', {
      matchId: 'match-1',
      chargedSar: 37.5,
    });
  });

  it('a FREE promotion emits chargedSar: null on the personal event', async () => {
    const { svc, realtime } = makeService();

    await svc.notifyPromotion({ ...promotion, chargedSar: null }, 'match-1');

    expect(realtime.emitToUser).toHaveBeenCalledWith('user-1', 'waitlist-promoted', {
      matchId: 'match-1',
      chargedSar: null,
    });
  });
});
