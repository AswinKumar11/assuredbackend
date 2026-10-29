import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { RolesGuard } from '../shared/auth/roles.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoggingOtpSender, OTP_SENDER } from './otp-sender';
import { RateLimitService } from './rate-limit.service';
import { TokenService } from './token.service';

/**
 * otp, sessions, tokens, device binding, guards (TRD §4, §7).
 *
 * The two guards are registered globally and in order: JwtAuthGuard establishes
 * identity, RolesGuard decides whether the endpoint accepts it. That makes the
 * API fail-closed — an endpoint without `@Public()` is authenticated whether or
 * not its author remembered to think about it.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        // expiresIn is typed as a `ms` template-literal union; the value is a
        // validated env string, so it is asserted rather than re-parsed here.
        signOptions: {
          expiresIn: config.get<string>('JWT_ACCESS_TTL') ?? '15m',
        } as JwtSignOptions,
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    RateLimitService,
    { provide: OTP_SENDER, useClass: LoggingOtpSender },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [JwtModule, TokenService, RateLimitService],
})
export class AuthModule {}
