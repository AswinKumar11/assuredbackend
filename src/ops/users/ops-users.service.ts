import { Injectable } from '@nestjs/common';
import { OpsUser, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { hashPassword } from '../../shared/auth/password';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { OpsTokenService } from '../auth/ops-token.service';
import {
  CreateOpsUserDto,
  OpsUserResponse,
  ResetOpsPasswordDto,
  UpdateOpsUserDto,
} from './dto/ops-user.dto';

@Injectable()
export class OpsUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: OpsTokenService,
  ) {}

  async create(dto: CreateOpsUserDto): Promise<OpsUserResponse> {
    const passwordHash = await hashPassword(dto.password);
    try {
      const user = await this.prisma.opsUser.create({
        data: { email: dto.email, passwordHash, role: dto.role },
      });
      return toResponse(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(ErrorCode.CONFLICT, 'An ops user with this email already exists');
      }
      throw error;
    }
  }

  /**
   * Role change and enable/disable. An admin cannot change their own account
   * here — that rule alone guarantees the platform always keeps at least one
   * active admin, because the caller is one.
   */
  async update(actorId: string, id: string, dto: UpdateOpsUserDto): Promise<OpsUserResponse> {
    if (actorId === id) {
      throw new AppException(ErrorCode.FORBIDDEN, 'You cannot change your own role or status');
    }
    await this.findOrThrow(id);

    const data: Prisma.OpsUserUpdateInput = {};
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.disabled !== undefined) data.disabledAt = dto.disabled ? new Date() : null;

    const user = await this.prisma.opsUser.update({ where: { id }, data });

    if (dto.disabled === true) {
      await this.tokens.revokeAllForUser(id, 'disabled_by_admin');
    }

    return toResponse(user);
  }

  async resetPassword(id: string, dto: ResetOpsPasswordDto): Promise<OpsUserResponse> {
    await this.findOrThrow(id);

    const user = await this.prisma.opsUser.update({
      where: { id },
      data: { passwordHash: await hashPassword(dto.password) },
    });
    await this.tokens.revokeAllForUser(id, 'password_reset_by_admin');

    return toResponse(user);
  }

  private async findOrThrow(id: string): Promise<OpsUser> {
    const user = await this.prisma.opsUser.findUnique({ where: { id } });
    if (!user) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Ops user not found');
    }
    return user;
  }
}

/** The one place an OpsUser leaves the service — passwordHash and totpSecret never do. */
function toResponse(user: OpsUser): OpsUserResponse {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    disabled: user.disabledAt !== null,
    disabledAt: user.disabledAt,
    createdAt: user.createdAt,
  };
}
