import { Test } from '@nestjs/testing';
import { AdminUsersService } from './users.service';
import { AuditService } from './audit.service';
import { RealtimeService } from '../gateway/realtime.service';
import { ActivitiesService } from '../activities/activities.service';
import { AppGateway } from '../gateway/app.gateway';

/**
 * P1-50 (run #57) + P2-77 (run #60): admin moderation actions force-disconnect
 * the target's live WS sockets whenever the POST-WRITE account state still
 * forbids acting — banned, or suspended into the future. The per-message gate
 * (app.gateway requireActiveUser) blocks the NEXT action; the disconnect makes
 * enforcement immediate — the client's reconnect re-runs the handshake, which
 * now refuses.
 *
 * Keyed on the post-write row (not the request delta), which closes P2-77
 * (Reviewer A, run #58): unban-while-still-suspended used to skip the
 * disconnect because the delta (banned_at → null) read as "nothing to
 * enforce", leaving a live socket under active suspension. A pure unban/lift
 * of a fully clean account — and an expired suspension — still disconnects
 * nothing.
 */

const USER_ID = 'user-live-1';

function makeDb() {
  return {
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
  };
}

async function makeService(afterOverrides: Record<string, unknown> = {}) {
  const disconnectUser = jest.fn();
  const moduleRef = await Test.createTestingModule({
    providers: [
      AdminUsersService,
      { provide: 'DB_CONNECTION', useValue: makeDb() },
      { provide: AuditService, useValue: { log: jest.fn() } },
      { provide: RealtimeService, useValue: { broadcastOps: jest.fn() } },
      { provide: ActivitiesService, useValue: { record: jest.fn() } },
      { provide: AppGateway, useValue: { disconnectUser } },
    ],
  }).compile();

  const svc = moduleRef.get(AdminUsersService);
  const cleanRow = {
    id: USER_ID,
    role: 'Player',
    deleted_at: null,
    banned_at: null,
    suspended_until: null,
  };
  // findOne is called twice per update(): `before` (pre-write read) then
  // `after` (post-write re-read). The after call returns the override row so
  // each test simulates the committed post-write state.
  let call = 0;
  jest.spyOn(svc, 'findOne').mockImplementation((async () => {
    call += 1;
    return call === 1 ? cleanRow : { ...cleanRow, ...afterOverrides };
  }) as never);
  return { svc, disconnectUser };
}

const FUTURE = new Date(Date.now() + 86_400_000);

describe('AdminUsersService.update — moderation force-disconnect (P1-50/P2-77)', () => {
  it('ban → force-disconnects the target user sockets', async () => {
    const { svc, disconnectUser } = await makeService({ banned_at: FUTURE });

    await svc.update(USER_ID, { banned: true }, 'admin-1');

    expect(disconnectUser).toHaveBeenCalledTimes(1);
    expect(disconnectUser).toHaveBeenCalledWith(USER_ID);
  });

  it('suspend → force-disconnects the target user sockets', async () => {
    const { svc, disconnectUser } = await makeService({ suspended_until: FUTURE });

    await svc.update(USER_ID, { suspendedUntil: FUTURE.toISOString() }, 'admin-1');

    expect(disconnectUser).toHaveBeenCalledTimes(1);
    expect(disconnectUser).toHaveBeenCalledWith(USER_ID);
  });

  it('unban of a fully clean account → does NOT disconnect', async () => {
    const { svc, disconnectUser } = await makeService();

    await svc.update(USER_ID, { banned: false }, 'admin-1');

    expect(disconnectUser).not.toHaveBeenCalled();
  });

  it('suspension lift (suspendedUntil: null) of a clean account → does NOT disconnect', async () => {
    const { svc, disconnectUser } = await makeService();

    await svc.update(USER_ID, { suspendedUntil: null }, 'admin-1');

    expect(disconnectUser).not.toHaveBeenCalled();
  });

  // ── P2-77 (run #60): post-write-keyed disconnect ──

  it('P2-77: unban while STILL SUSPENDED → disconnects (suspension stays live)', async () => {
    const { svc, disconnectUser } = await makeService({ suspended_until: FUTURE });

    await svc.update(USER_ID, { banned: false }, 'admin-1');

    expect(disconnectUser).toHaveBeenCalledTimes(1);
    expect(disconnectUser).toHaveBeenCalledWith(USER_ID);
  });

  it('P2-77: suspension lift while STILL BANNED → disconnects (ban stays live)', async () => {
    const { svc, disconnectUser } = await makeService({ banned_at: FUTURE });

    await svc.update(USER_ID, { suspendedUntil: null }, 'admin-1');

    expect(disconnectUser).toHaveBeenCalledTimes(1);
    expect(disconnectUser).toHaveBeenCalledWith(USER_ID);
  });

  it('P2-77: expired suspension in the post-write row → does NOT disconnect', async () => {
    const { svc, disconnectUser } = await makeService({
      suspended_until: new Date(Date.now() - 3_600_000),
    });

    await svc.update(USER_ID, { banned: false }, 'admin-1');

    expect(disconnectUser).not.toHaveBeenCalled();
  });
});
