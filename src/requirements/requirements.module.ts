import { Module } from '@nestjs/common';

import { RequirementsController } from './requirements.controller';
import { RequirementsService } from './requirements.service';

/**
 * shift requirements, shortlisting (TRD §4).
 *
 * Requirement CRUD is public for now (no ops auth wired up yet) — every route
 * on RequirementsController carries @Public(). Remove that once ops auth
 * lands and gate behind @Roles('ops') instead.
 *
 * Still to build: candidate shortlisting by role, home distance (haversine,
 * GeoService), availability and reliability score; offer distribution
 * creating OFFERED bookings per seat. Several workers may hold an OFFERED row
 * on one seat — only one may occupy it, enforced by the partial unique index
 * in prisma/manual/001_seat_hold_unique.sql.
 */
@Module({
  controllers: [RequirementsController],
  providers: [RequirementsService],
  exports: [RequirementsService],
})
export class RequirementsModule {}
