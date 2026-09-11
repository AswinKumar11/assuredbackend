import { Module } from '@nestjs/common';

import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';

/**
 * Businesses — ops-managed in MVP (TRD §4).
 * Company carries the geofence centre the attendance pipeline reads.
 *
 * Company CRUD is public for now (no ops auth wired up yet) — every route
 * on CompaniesController carries @Public(). Remove that once ops auth lands
 * and gate behind @Roles('ops') instead.
 */
@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
