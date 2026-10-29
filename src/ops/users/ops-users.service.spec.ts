import { OpsRole, OpsUser, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { verifyPassword } from '../../shared/auth/password';
import { AppException } from '../../shared/errors/app.exception';
import { OpsTokenService } from '../auth/ops-token.service';
import { OpsUsersService } from './ops-users.service';

const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const TARGET_ID = '00000000-0000-4000-8000-000000000002';

const opsUser = (overrides: Partial<OpsUser> = {}): OpsUser => ({
  id: TARGET_ID,
  email: 'priya@assuredgig.in',
  passwordHash: 'scrypt$hash',
  totpSecret: 'secret',
  role: OpsRole.OPS,
  disabledAt: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  ...overrides,
});

type WriteArgs = { where?: { id: string }; data: Partial<OpsUser> };

describe('OpsUsersService', () => {
  let create: jest.Mock<Promise<OpsUser>, [WriteArgs]>;
  let update: jest.Mock<Promise<OpsUser>, [WriteArgs]>;
  let findUnique: jest.Mock<Promise<OpsUser | null>, [unknown]>;
  let revokeAllForUser: jest.Mock<Promise<void>, [string, string]>;
  let service: OpsUsersService;

  const echo = ({ data }: WriteArgs): Promise<OpsUser> => Promise.resolve(opsUser(data));
  const lastWrite = (mock: jest.Mock<Promise<OpsUser>, [WriteArgs]>): Partial<OpsUser> =>
    mock.mock.calls[mock.mock.calls.length - 1][0].data;

  beforeEach(() => {
    create = jest.fn(echo);
    update = jest.fn(echo);
    findUnique = jest.fn<Promise<OpsUser | null>, [unknown]>().mockResolvedValue(opsUser());
    revokeAllForUser = jest.fn<Promise<void>, [string, string]>().mockResolvedValue(undefined);

    service = new OpsUsersService(
      { opsUser: { create, update, findUnique } } as unknown as PrismaService,
      { revokeAllForUser } as unknown as OpsTokenService,
    );
  });

  describe('create', () => {
    it('stores a hash of the password, never the password, and never returns secrets', async () => {
      const result = await service.create({
        email: 'priya@assuredgig.in',
        password: 'a-long-initial-password',
        role: OpsRole.READ_ONLY,
      });

      const stored = lastWrite(create).passwordHash ?? '';
      expect(stored).not.toContain('a-long-initial-password');
      await expect(verifyPassword('a-long-initial-password', stored)).resolves.toBe(true);
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('totpSecret');
      expect(result.role).toBe(OpsRole.READ_ONLY);
    });

    it('maps a duplicate email to CONFLICT', async () => {
      create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.create({ email: 'priya@assuredgig.in', password: 'a-long-initial-password' }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  describe('update', () => {
    it('refuses to let an admin change their own account', async () => {
      await expect(
        service.update(ADMIN_ID, ADMIN_ID, { role: OpsRole.OPS }),
      ).rejects.toBeInstanceOf(AppException);
      expect(update).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND for an unknown user', async () => {
      findUnique.mockResolvedValue(null);
      await expect(service.update(ADMIN_ID, TARGET_ID, { disabled: true })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('disabling sets disabledAt and ends every session', async () => {
      const result = await service.update(ADMIN_ID, TARGET_ID, { disabled: true });

      expect(lastWrite(update).disabledAt).toBeInstanceOf(Date);
      expect(revokeAllForUser).toHaveBeenCalledWith(TARGET_ID, 'disabled_by_admin');
      expect(result.disabled).toBe(true);
    });

    it('re-enabling clears disabledAt and leaves sessions alone', async () => {
      await service.update(ADMIN_ID, TARGET_ID, { disabled: false });

      expect(lastWrite(update)).toEqual({ disabledAt: null });
      expect(revokeAllForUser).not.toHaveBeenCalled();
    });

    it('changes the role', async () => {
      const result = await service.update(ADMIN_ID, TARGET_ID, { role: OpsRole.ADMIN });

      expect(lastWrite(update)).toEqual({ role: OpsRole.ADMIN });
      expect(result.role).toBe(OpsRole.ADMIN);
    });
  });

  describe('resetPassword', () => {
    it('replaces the hash and ends every session', async () => {
      await service.resetPassword(TARGET_ID, { password: 'a-brand-new-password' });

      const stored = lastWrite(update).passwordHash ?? '';
      await expect(verifyPassword('a-brand-new-password', stored)).resolves.toBe(true);
      expect(revokeAllForUser).toHaveBeenCalledWith(TARGET_ID, 'password_reset_by_admin');
    });
  });
});
