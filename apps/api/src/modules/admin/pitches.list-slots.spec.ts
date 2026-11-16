import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AdminPitchesService } from './pitches.service';
import { AuditService } from './audit.service';
import { RealtimeService } from '../gateway/realtime.service';
import { PartnerService } from '../partner/partner.service';

/**
 * Run #93 (Reviewer-A hardening): admin slot listing must forward the
 * AUTHENTICATED admin id to PartnerService.listSlots — never a '' sentinel.
 * Today the Admin branch inside partner.service makes ownerId moot
 * (`sql`true`` scope), but a future non-Admin path with '' would silently
 * query `owner_id = ''` and read as an empty schedule (defense-in-depth).
 *
 * Symmetry pin: the (actorId, role) pair passed for the admin delegation
 * must equal what the partner controller passes for a VenueOwner — only the
 * role differs ('Admin' vs the partner's own role).
 */
describe('AdminPitchesService.listSlots — forwards the authenticated admin id (run #93)', () => {
  const ADMIN_ID = '0b7f6c1e-1111-4222-8333-444455556666';
  const listSlotsSpy = jest.fn().mockResolvedValue([]);

  async function makeService(partnerOverrides: Partial<Record<string, jest.Mock>> = {}) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminPitchesService,
        { provide: 'DB_CONNECTION', useValue: {} },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: RealtimeService, useValue: { broadcastOps: jest.fn() } },
        {
          provide: PartnerService,
          useValue: {
            listSlots: listSlotsSpy,
            ...partnerOverrides,
          },
        },
      ],
    }).compile();

    return moduleRef.get(AdminPitchesService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    listSlotsSpy.mockResolvedValue([]);
  });

  function stubFindOne(
    svc: AdminPitchesService,
    behavior: 'resolve' | 'reject' = 'resolve',
  ) {
    return jest
      .spyOn(svc as unknown as { findOne: (id: string) => Promise<unknown> }, 'findOne')
      [behavior === 'resolve' ? 'mockResolvedValue' : 'mockRejectedValue'](
        behavior === 'resolve' ? { id: 'pitch-1' } : new NotFoundException('Pitch not found.'),
      );
  }

  it('forwards the authenticated adminId (NOT a "" sentinel) with the Admin role', async () => {
    const svc = await makeService();
    stubFindOne(svc);
    await svc.listSlots('pitch-1', '2026-10-01', '2026-10-08', ADMIN_ID);
    expect(listSlotsSpy).toHaveBeenCalledWith(ADMIN_ID, 'Admin', 'pitch-1', '2026-10-01', '2026-10-08');
  });

  it('keeps VenueOwner delegation symmetry — only the role differs from the partner path', async () => {
    const svc = await makeService();
    stubFindOne(svc);
    await svc.listSlots('pitch-1', '2026-10-01', '2026-10-08', ADMIN_ID);
    // Partner controller: this.partner.listSlots(user.sub, user.role, id, from, to)
    // Admin delegation now uses the identical (actorId, role, …) shape.
    expect(listSlotsSpy.mock.calls[0][0]).toBe(ADMIN_ID);
    expect(listSlotsSpy.mock.calls[0][1]).toBe('Admin');
  });

  it('still 404-guards via findOne before delegating for a missing pitch', async () => {
    const svc = await makeService();
    const findOneSpy = stubFindOne(svc, 'reject');

    await expect(svc.listSlots('missing', '2026-10-01', '2026-10-08', ADMIN_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(findOneSpy).toHaveBeenCalledWith('missing');
    // Guard fires BEFORE the delegation — no partner call is attempted.
    expect(listSlotsSpy).not.toHaveBeenCalled();
  });
});
