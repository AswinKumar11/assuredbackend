import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';

import { validateEnv } from './config/env.validation';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { SharedModule } from './shared/shared.module';
import { HealthModule } from './health/health.module';

import { AuthModule } from './auth/auth.module';
import { WorkersModule } from './workers/workers.module';
import { CompaniesModule } from './companies/companies.module';
import { RequirementsModule } from './requirements/requirements.module';
import { BookingsModule } from './bookings/bookings.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ConfirmationsModule } from './confirmations/confirmations.module';
import { ReliabilityModule } from './reliability/reliability.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DisputesModule } from './disputes/disputes.module';
import { MediaModule } from './media/media.module';
import { OpsModule } from './ops/ops.module';

@Module({
  imports: [
    NestConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        // Request id propagates into jobs (TRD §14).
        genReqId: (req) => req.id ?? crypto.randomUUID(),
        // PII discipline (TRD §13): phones, names and coordinates never reach logs.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.phone',
            'req.body.otp',
            'req.body.code',
            'req.body.password',
            'req.body.refreshToken',
            'req.body.email',
            'req.body.name',
            'req.body.lat',
            'req.body.lng',
            'res.headers["set-cookie"]',
          ],
          censor: '[redacted]',
        },
        transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
      },
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    SharedModule,
    AppConfigModule,
    QueueModule,
    HealthModule,

    AuthModule,
    WorkersModule,
    CompaniesModule,
    RequirementsModule,
    BookingsModule,
    AttendanceModule,
    ConfirmationsModule,
    ReliabilityModule,
    NotificationsModule,
    DisputesModule,
    MediaModule,
    OpsModule,
  ],
})
export class AppModule {}
