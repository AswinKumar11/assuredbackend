import { Injectable } from '@nestjs/common';
import { OpsRole } from '@prisma/client';

import { RateLimitService } from '../../auth/rate-limit.service';
import { TokenPair } from '../../auth/token.service';
import { PlatformConfigService } from '../../config/config.service';
import { ConfigKey } from '../../config/config-keys';
import { PrismaService } from '../../prisma/prisma.service';
import { dummyPasswordHash, verifyPassword } from '../../shared/auth/password';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { OpsTokenService } from './ops-token.service';

const HOUR_SECONDS = 3600;

export interface OpsLoginResult extends TokenPair {
  opsUserId: string;
  email: string;
  role: OpsRole;
}

@Injectable()
export class OpsAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformConfig: PlatformConfigService,
    private readonly rateLimit: RateLimitService,
    private readonly tokens: OpsTokenService,
  ) {}

  /**
   * Email and password. Unknown email, wrong password and disabled account all
   * return the same error, so the endpoint does not reveal which emails exist.
   */
  async login(email: string, password: string, ip: string): Promise<OpsLoginResult> {
    const [perEmail, perIp] = await Promise.all([
      this.platformConfig.getNumber(ConfigKey.OPS_LOGIN_MAX_PER_EMAIL_PER_HOUR),
      this.platformConfig.getNumber(ConfigKey.OPS_LOGIN_MAX_PER_IP_PER_HOUR),
    ]);
    await this.rateLimit.consume(`ops-login:email:${email}`, perEmail, HOUR_SECONDS);
    await this.rateLimit.consume(`ops-login:ip:${ip}`, perIp, HOUR_SECONDS);

    const user = await this.prisma.opsUser.findUnique({ where: { email } });
    const passwordOk = await verifyPassword(
      password,
      user?.passwordHash ?? (await dummyPasswordHash()),
    );

    if (!user || !passwordOk || user.disabledAt !== null) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, 'Email or password is incorrect');
    }

    const pair = await this.tokens.issueSession(user.id);
    return { ...pair, opsUserId: user.id, email: user.email, role: user.role };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken);
  }

  async logout(opsUserId: string): Promise<void> {
    await this.tokens.revokeAllForUser(opsUserId, 'logout');
  }
}
