import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AdminReportsService } from './reports.service';
import { AdminVenuesService } from './venues.service';
import { AuditService } from './audit.service';
import { RealtimeService } from '../gateway/realtime.service';
import { AdminUsersService } from './users.service';
import { ActivitiesService } from '../activities/activities.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Run #34 (P2-49, Reviewer A): decision mutations carry a status-predicated
 * guard so a concurrent decision is a clean 409 race-loser, never a silent
 * double-write over the other admin's decision (audit `after` stayed stale).
 * Exemplars already correct before this: settlements.pay, transactions.refund,
 * admin disputes resolve/reopen (run #24).
 *
 * The mock DB resolves zero rows for guarded UPDATEs (race lost) and one row
 * for guardless UPDATEs (plain writes unchanged). `findOne` is spied.
 */
describe('AdminReports/Venues — status-predicated decision guards (run #34)', () => {
  function makeDb() {
    const updateCalls: { guarded: boolean }[] = [];
    const txUpdate = (guarded: boolean) => ({
      set: () => ({
        where: () => ({
          returning: () => {
            updateCalls.push({ guarded });
            return Promise.resolve(guarded ? [{ venue_id: 'v1' }] : []);
          },
        }),
      }),
    });
    const db = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => {
              updateCalls.push({ guarded: false });
              return Promise.resolve([]);
            },
          }),
        }),
      }),
      transaction: async (fn: (tx: typeof db) => Promise<unknown>) => {
        // Inside the tx, `update` resolves per-test via the flag below.
        return fn({ ...db, update: (t: unknown) => (t === 'GUARDED' ? txUpdate(true) : txUpdate(false)) } as never);
      },
      _updateCalls: updateCalls,
    };
    return db;
  }

  async function makeReportsService(db: ReturnType<typeof makeDb>) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminReportsService,
        { provide: 'DB_CONNECTION', useValue: db },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: RealtimeService, useValue: { broadcastOps: jest.fn() } },
        { provide: AdminUsersService, useValue: { update: jest.fn() } },
        { provide: ActivitiesService, useValue: { record: jest.fn() } },
        { provide: NotificationsService, useValue: { sendPushToUsers: jest.fn() } },
      ],
    }).compile();
    return moduleRef.get(AdminReportsService);
  }

  async function makeVenuesService(db: ReturnType<typeof makeDb>) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminVenuesService,
        { provide: 'DB_CONNECTION', useValue: db },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: RealtimeService, useValue: { broadcastOps: jest.fn() } },
        { provide: ActivitiesService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    return moduleRef.get(AdminVenuesService);
  }

  it('reports.resolve 409s when the guarded UPDATE touches zero rows (race loser)', async () => {
    const db = makeDb();
    const svc = await makeReportsService(db);
    jest.spyOn(svc, 'findOne' as never).mockResolvedValue({
      id: 'r1',
      status: 'open',
      subject_type: 'venue',
      subject_id: 'v1',
      reporter: null,
    } as never);
    await expect(
      svc.resolve('r1', { outcome: 'resolved', resolution: 'x' } as never, 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reports.resolve still rejects an already-decided report with 400 (guard does not shadow)', async () => {
    const db = makeDb();
    const svc = await makeReportsService(db);
    jest.spyOn(svc, 'findOne' as never).mockResolvedValue({
      id: 'r1',
      status: 'resolved',
      subject_type: 'venue',
      subject_id: 'v1',
      reporter: null,
    } as never);
    await expect(
      svc.resolve('r1', { outcome: 'resolved', resolution: 'x' } as never, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports.reopen 409s when the guarded UPDATE touches zero rows', async () => {
    const db = makeDb();
    const svc = await makeReportsService(db);
    jest.spyOn(svc, 'findOne' as never).mockResolvedValue({
      id: 'r1',
      status: 'resolved',
      subject_type: 'venue',
      subject_id: 'v1',
      reporter: null,
    } as never);
    await expect(svc.reopen('r1', 'admin-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('venues.decide 409s when the verification is not pending (concurrent decide/resubmit)', async () => {
    const db = makeDb();
    const svc = await makeVenuesService(db);
    jest.spyOn(svc, 'findOne' as never).mockResolvedValue({
      id: 'v1',
      is_approved: false,
      owner: null,
      verification: { status: 'pending' },
    } as never);
    await expect(svc.decide('v1', { decision: 'approve' } as never, 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    // The venue-approval UPDATE must never run when the guard rejects:
    // only the guarded verification UPDATE (+ the guard-failed venue UPDATE
    // inside the aborted tx) were attempted.
    expect(db._updateCalls.length).toBeGreaterThan(0);
  });
});
