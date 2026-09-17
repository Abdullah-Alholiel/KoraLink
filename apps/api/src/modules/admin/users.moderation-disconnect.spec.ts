import type { SQL } from 'drizzle-orm';
import { Test } from '@nestjs/testing';
import { AdminUsersService } from './users.service';
import { AuditService } from './audit.service';
import { RealtimeService } from '../gateway/realtime.service';
import { ActivitiesService } from '../activities/activities.service';
import { AppGateway } from '../gateway/app.gateway';

/**
 * P1-50 (run #57): an admin ban/suspension force-disconnects the target's
 * live WS sockets. The per-message gate (app.gateway requireActiveUser) blocks
 * the NEXT action; the disconnect makes enforcement immediate — the client's
 * reconnect re-runs the handshake, which now refuses. Unban and
 * suspension-lift must NOT disconnect (nothing to enforce).
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

async function makeService(db: ReturnType<typeof makeDb>) {
  const disconnectUser = jest.fn();
  const moduleRef = await Test.createTestingModule({
    providers: [
      AdminUsersService,
      { provide: 'DB_CONNECTION', useValue: db },
      { provide: AuditService, useValue: { log: jest.fn() } },
      { provide: RealtimeService, useValue: { broadcastOps: jest.fn() } },
      { provide: ActivitiesService, useValue: { record: jest.fn() } },
      { provide: AppGateway, useValue: { disconnectUser } },
    ],
  }).compile();

  const svc = moduleRef.get(AdminUsersService);
  jest.spyOn(svc, 'findOne').mockResolvedValue({
    id: USER_ID,
    role: 'Player',
    deleted_at: null,
    banned_at: null,
    suspended_until: null,
  } as never);
  return { svc, disconnectUser };
}

describe('AdminUsersService.update — moderation force-disconnect (P1-50, run #57)', () => {
  it('ban → force-disconnects the target user sockets', async () => {
    const { svc, disconnectUser } = await makeService(makeDb());

    await svc.update(USER_ID, { banned: true }, 'admin-1');

    expect(disconnectUser).toHaveBeenCalledTimes(1);
    expect(disconnectUser).toHaveBeenCalledWith(USER_ID);
  });

  it('suspend → force-disconnects the target user sockets', async () => {
    const { svc, disconnectUser } = await makeService(makeDb());

    await svc.update(USER_ID, { suspendedUntil: new Date(Date.now() + 86_400_000).toISOString() }, 'admin-1');

    expect(disconnectUser).toHaveBeenCalledTimes(1);
    expect(disconnectUser).toHaveBeenCalledWith(USER_ID);
  });

  it('unban → does NOT disconnect', async () => {
    const { svc, disconnectUser } = await makeService(makeDb());

    await svc.update(USER_ID, { banned: false }, 'admin-1');

    expect(disconnectUser).not.toHaveBeenCalled();
  });

  it('suspension lift (suspendedUntil: null) → does NOT disconnect', async () => {
    const { svc, disconnectUser } = await makeService(makeDb());

    await svc.update(USER_ID, { suspendedUntil: null }, 'admin-1');

    expect(disconnectUser).not.toHaveBeenCalled();
  });
});
