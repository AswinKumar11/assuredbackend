// Loaded before the decorated class below is defined, so `design:type` metadata
// exists no matter which entrypoint imports this first — main.ts, a test, or a
// script. Without it, implicit conversion silently stops working.
import 'reflect-metadata';

import { Type, plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

export enum Environment {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

/**
 * Infrastructure wiring only. Operational thresholds are NOT here — an env var
 * requires a deploy, which defeats the purpose (TRD §12).
 */
class EnvVars {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  // Env values are always strings; the coercion is stated explicitly rather
  // than left to implicit conversion, which depends on decorator metadata.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  REDIS_URL: string;

  @IsString()
  JWT_ACCESS_SECRET: string;

  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsString()
  OTP_PEPPER: string;

  @IsOptional() @IsString() JWT_ACCESS_TTL?: string;
  @IsOptional() @IsString() JWT_REFRESH_TTL?: string;

  @IsOptional() @IsString() R2_ACCOUNT_ID?: string;
  @IsOptional() @IsString() R2_ACCESS_KEY_ID?: string;
  @IsOptional() @IsString() R2_SECRET_ACCESS_KEY?: string;
  @IsOptional() @IsString() R2_BUCKET?: string;
  @IsOptional() @IsString() R2_ENDPOINT?: string;

  @IsOptional() @IsString() MSG91_AUTH_KEY?: string;
  @IsOptional() @IsString() MSG91_SENDER_ID?: string;
  @IsOptional() @IsString() MSG91_WEBHOOK_SECRET?: string;

  @IsOptional() @IsString() FCM_PROJECT_ID?: string;
  @IsOptional() @IsString() FCM_CLIENT_EMAIL?: string;
  @IsOptional() @IsString() FCM_PRIVATE_KEY?: string;

  // Seed-only: `npm run db:seed` creates this ADMIN if the email is not taken.
  @IsOptional() @IsString() OPS_ADMIN_EMAIL?: string;
  @IsOptional() @IsString() OPS_ADMIN_PASSWORD?: string;

  @IsOptional() @IsString() SENTRY_DSN?: string;
  @IsOptional() @IsString() LOG_LEVEL?: string;
}

export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const parsed = plainToInstance(EnvVars, raw, { enableImplicitConversion: true });
  const errors = validateSync(parsed, { skipMissingProperties: false });

  if (errors.length > 0) {
    const summary = errors.map(
      (e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
    );
    throw new Error(`Invalid environment configuration:\n  ${summary.join('\n  ')}`);
  }

  return parsed;
}
