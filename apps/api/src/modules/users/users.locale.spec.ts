import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * P2-264 (run #168) — users.locale preference write specs.
 *
 * Gate 3 contract: PATCH /users/me accepts locale 'ar'|'en' (whitelist),
 * persists through updateProfile's returning() shape, and the response
 * carries the resolved locale back. Invalid values are rejected by the DTO
 * (IsIn) — this spec pins the service-level persistence + return contract
 * against the stubbed db.update chain.
 */
describe('UsersService locale preference (P2-264)', () => {
  function setup(returnedRow: Record<string, unknown> | undefined) {
    const setMock = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(
          returnedRow ? [returnedRow] : [],
        ),
      }),
    });
    const db = {
      update: jest.fn().mockReturnValue({ set: setMock }),
    };
    const service = new UsersService(
      db as never,
      {} as never, // jwt (unused by updateProfile)
      {} as never, // config (unused by updateProfile)
    );
    return { service, setMock };
  }

  const ROW = {
    id: 'u1',
    phone: '+966500000001',
    full_name: 'Tester',
    handle: 'tester',
    avatar_url: null,
    preferred_location: null,
    preferred_position: null,
    role: 'Player',
    home_lat: null,
    home_lng: null,
    locale: 'en',
  };

  it('updateProfile persists locale and returns it', async () => {
    const { service, setMock } = setup(ROW);
    const out = await service.updateProfile('u1', { locale: 'en' });
    // the locale field must reach the UPDATE payload
    const payload = setMock.mock.calls[0][0];
    expect(payload.locale).toBe('en');
    // and come back in the response
    expect(out.locale).toBe('en');
  });

  it('updateProfile with locale absent leaves other fields intact and returns row locale', async () => {
    const { service } = setup(ROW);
    const out = await service.updateProfile('u1', { full_name: 'New Name' });
    expect(out.locale).toBe('en');
    expect(out.full_name).toBe('Tester'); // from the returned row, not the dto
  });

  it('updateProfile on missing user → NotFoundException', async () => {
    const { service } = setup(undefined);
    await expect(
      service.updateProfile('u1', { locale: 'ar' }),
    ).rejects.toBeInstanceOf(require('@nestjs/common').NotFoundException);
  });

  it('DTO whitelist: invalid locale string is rejected before the service', () => {
    // mirror the IsIn contract — keep this pin alongside the service specs so
    // a DTO loosening fails loudly here.
    const { UpdateProfileDto } = require('./dto/update-profile.dto');
    const dto = new UpdateProfileDto();
    dto.locale = 'fr' as never;
    const { validate } = require('class-validator');
    return validate(dto).then((errors: unknown[]) => {
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
