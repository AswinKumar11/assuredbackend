import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { TokenPair } from '../../auth/token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Principal } from '../../shared/auth/current-principal';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Shorter than the worker's 30 days: a console session should not outlive a working week. */
const OPS_REFRESH_TTL_DAYS = 7;

/**
 * Ops console sessions. Mirrors TokenService's rotation and reuse detection,
 * without device binding, and without revoking other sessions on login — an
 * ops user may legitimately have the console open on two machines.
 */
@Injectable()
export class OpsTokenService {
  private readonly logger = new Logger(OpsTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issueSession(opsUserId: string): Promise<TokenPair> {
    const { accessToken, refreshToken, expiresIn } = await this.mint(opsUserId, randomUUID());
    return { accessToken, refreshToken, expiresIn };
  }

  async rotate(refreshToken: string): Promise<TokenPair> {
    const existing = await this.prisma.opsRefreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { opsUser: { select: { disabledAt: true } } },
    });

    if (!existing) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, 'Refresh token is not recognised');
    }

    if (existing.replacedById !== null) {
      await this.revokeFamily(existing.familyId, 'refresh_token_reuse_detected');
      this.logger.error(
        { opsUserId: existing.opsUserId, familyId: existing.familyId },
        'Ops refresh token reuse detected — family revoked',
      );
      throw new AppException(ErrorCode.SESSION_SUPERSEDED, 'Session ended, sign in again');
    }

    if (existing.revokedAt !== null || existing.opsUser.disabledAt !== null) {
      throw new AppException(ErrorCode.SESSION_SUPERSEDED, 'Session ended, sign in again');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, 'Refresh token has expired');
    }

    const next = await this.mint(existing.opsUserId, existing.familyId);

    await this.prisma.opsRefreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), revokedReason: 'rotated', replacedById: next.issuedId },
    });

    return {
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
      expiresIn: next.expiresIn,
    };
  }

  async revokeAllForUser(opsUserId: string, reason: string): Promise<void> {
    await this.prisma.opsRefreshToken.updateMany({
      where: { opsUserId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.opsRefreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async mint(
    opsUserId: string,
    familyId: string,
  ): Promise<TokenPair & { issuedId: string }> {
    const principal: Principal = { sub: opsUserId, role: 'ops' };
    const accessToken = await this.jwt.signAsync(principal);

    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + OPS_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

    const record = await this.prisma.opsRefreshToken.create({
      data: { opsUserId, familyId, tokenHash: hashToken(refreshToken), expiresAt },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTtlSeconds(),
      issuedId: record.id,
    };
  }

  private accessTtlSeconds(): number {
    const raw = this.config.get<string>('JWT_ACCESS_TTL') ?? '900s';
    const match = /^(\d+)\s*([smhd]?)$/.exec(raw.trim());
    if (!match) return 900;
    const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] || 's'] ?? 1;
    return Number(match[1]) * multiplier;
  }
}
