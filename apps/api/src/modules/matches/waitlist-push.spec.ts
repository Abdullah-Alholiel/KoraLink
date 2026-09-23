import { MatchWaitlistService, type WaitlistPromotion } from './waitlist.service';
import type { ActivitiesService } from '../activities/activities.service';
import type { AppGateway } from '../gateway/app.gateway';
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
};

function makeService(overrides: {
  activities?: Partial<ActivitiesService>;
  notifications?: Partial<NotificationsService>;
  gateway?: Partial<AppGateway>;
} = {}) {
  const activities = { record: jest.fn(async () => undefined), ...overrides.activities };
  const gateway = { broadcastRosterUpdate: jest.fn(), ...overrides.gateway };
  const notifications = {
    sendPushToUsers: jest.fn(async () => 1),
    ...overrides.notifications,
  };

  const svc = new MatchWaitlistService(
    {} as never, // db — unused on the notify path
    activities as unknown as ActivitiesService,
    gateway as unknown as AppGateway,
    notifications as unknown as NotificationsService,
  );
  return { svc, activities, gateway, notifications };
}

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
