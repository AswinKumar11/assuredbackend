import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OpsRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest } from '../shared/auth/current-principal';
import { AppException } from '../shared/errors/app.exception';
import { ErrorCode } from '../shared/errors/error-codes';

export const OPS_ROLES_KEY = 'assuredgig:ops-roles';

/** Narrows an `ops` endpoint to particular ops roles, e.g. `@OpsRoles(OpsRole.ADMIN)`. */
export const OpsRoles = (...roles: OpsRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(OPS_ROLES_KEY, roles);

/**
 * Runs after the global JwtAuthGuard and RolesGuard, so the caller is already
 * known to hold an `ops` token. The ops role and disabled flag are read from
 * the database on every request rather than trusted from the token: a demoted
 * or disabled user loses access at once, not when their access token expires.
 */
@Injectable()
export class OpsRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (!principal || principal.role !== 'ops') {
      throw new AppException(ErrorCode.FORBIDDEN, 'Not permitted for this role');
    }

    const user = await this.prisma.opsUser.findUnique({
      where: { id: principal.sub },
      select: { role: true, disabledAt: true },
    });
    if (!user || user.disabledAt !== null) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, 'Session ended, sign in again');
    }

    const required = this.reflector.getAllAndOverride<OpsRole[]>(OPS_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && required.length > 0 && !required.includes(user.role)) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Not permitted for this role');
    }

    return true;
  }
}
