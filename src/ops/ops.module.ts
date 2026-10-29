import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OpsAuthController } from './auth/ops-auth.controller';
import { OpsAuthService } from './auth/ops-auth.service';
import { OpsTokenService } from './auth/ops-token.service';
import { OpsRolesGuard } from './ops-roles.guard';
import { OpsUsersController } from './users/ops-users.controller';
import { OpsUsersService } from './users/ops-users.service';

/**
 * console endpoints, metrics (TRD §4, §6.4).
 *
 * Built: ops login (`/ops/auth`) and admin management of ops users (`/ops/users`).
 *
 * To build: worker list and vetting, requirement CRUD, shortlist candidates,
 * distribute offers, booking detail with the full audit trail, live attendance
 * board, trigger replacement, dispute queue and resolution, config and flag
 * management, metrics. Every endpoint here is role-guarded to `ops`; narrow to
 * particular ops roles with `@OpsRoles(...)` + `@UseGuards(OpsRolesGuard)`.
 */
@Module({
  imports: [AuthModule],
  controllers: [OpsAuthController, OpsUsersController],
  providers: [OpsAuthService, OpsTokenService, OpsUsersService, OpsRolesGuard],
  exports: [OpsRolesGuard],
})
export class OpsModule {}
