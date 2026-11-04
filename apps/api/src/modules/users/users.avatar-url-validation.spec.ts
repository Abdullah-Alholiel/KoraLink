import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { isValidManagedAvatarUrl } from '../../common/utils/managed-avatar';
import { UpdateProfileDto } from './dto/update-profile.dto';

/**
 * P1-71 (run #184) — avatar_url managed-path gate.
 *
 * Contract: PATCH /users/me persists ONLY managed media paths under
 * /media/avatars/ (plus '' to clear / null-absent). Any other string —
 * absolute URLs, other schemes, traversal, non-managed paths — is rejected
 * with 400 BEFORE any write. The service is the canonical gate (DTO alone is
 * bypassable by internal call sites); these specs pin the service contract.
 */
describe('UsersService avatar_url managed-path gate (P1-71)', () => {
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
    avatar_url: '/media/avatars/u1/avatar.webp',
    preferred_location: null,
    preferred_position: null,
    role: 'Player',
    home_lat: null,
    home_lng: null,
    locale: 'en',
  };

  describe('pure validator', () => {
    it.each([
      [null, true],
      [undefined, true],
      ['', true],
      ['/media/avatars/u1/avatar.webp', true],
      ['/media/avatars/u1/sub/dir/pic_2.png', true],
      ['/media/avatars/U1-a/b_c.d.jpg', true],
      ['https://evil.example/x.png', false],
      ['http://169.254.169.254/latest/meta-data', false],
      ['metadata://creds', false],
      ['javascript:alert(1)', false],
      ['/media/venues/pitch.jpg', false],
      ['/media/avatars/../secrets', false],
      ['relative/path.png', false],
      ['/media/avatars/u1/<script>', false],
      ['/media/avatars/u1/a b.png', false],
    ])('isValidManagedAvatarUrl(%j) → %j', (input, expected) => {
      expect(isValidManagedAvatarUrl(input as string | null | undefined)).toBe(
        expected as boolean,
      );
    });
  });

  describe('service gate', () => {
    it('persists a managed path', async () => {
      const { service, setMock } = setup(ROW);
      const dto = new UpdateProfileDto();
      dto.avatar_url = '/media/avatars/u1/avatar.webp';
      await service.updateProfile('u1', dto);
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ avatar_url: '/media/avatars/u1/avatar.webp' }),
      );
    });

    it.each([
      ['https://evil.example/x.png'],
      ['metadata://creds'],
      ['/media/venues/pitch.jpg'],
      ['/media/avatars/../secrets'],
    ])('rejects %j with 400 BEFORE any write', async (bad) => {
      const { service, setMock } = setup(ROW);
      const dto = new UpdateProfileDto();
      dto.avatar_url = bad;
      await expect(service.updateProfile('u1', dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(setMock).not.toHaveBeenCalled();
    });

    it("'' clears the avatar (legal)", async () => {
      const { service, setMock } = setup(ROW);
      const dto = new UpdateProfileDto();
      dto.avatar_url = '';
      await service.updateProfile('u1', dto);
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ avatar_url: '' }),
      );
    });

    it('normalizes null → "" so an explicit clear stays legal', async () => {
      const { service, setMock } = setup(ROW);
      const dto = new UpdateProfileDto();
      (dto as unknown as { avatar_url: string | null }).avatar_url = null;
      await service.updateProfile('u1', dto);
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ avatar_url: '' }),
      );
    });

    it('absent avatar_url skips the gate entirely (other fields still write)', async () => {
      const { service, setMock } = setup(ROW);
      const dto = new UpdateProfileDto();
      dto.full_name = 'New Name';
      await service.updateProfile('u1', dto);
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ full_name: 'New Name' }),
      );
      const arg = setMock.mock.calls[0][0] as Record<string, unknown>;
      expect('avatar_url' in arg).toBe(false);
    });

    it('withTimestamp contract holds: updated_at rides every update payload', async () => {
      const { service, setMock } = setup(ROW);
      const dto = new UpdateProfileDto();
      dto.avatar_url = '/media/avatars/u1/a.png';
      await service.updateProfile('u1', dto);
      const arg = setMock.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.updated_at).toBeInstanceOf(Date);
    });
  });
});
