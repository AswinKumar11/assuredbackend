import { Injectable } from '@nestjs/common';
import { AttendanceKind, BookingStatus } from '@prisma/client';

import { GeoService } from '../../shared/geo/geo.service';
import { TimeArbitrationService } from '../../shared/time/time-arbitration.service';
import { ErrorCode } from '../../shared/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { flag, PipelineContext, PipelineStage, reject } from './pipeline.types';

/** 1. Booking eligibility — status permits the event, worker owns the booking. */
@Injectable()
export class BookingEligibilityStage implements PipelineStage {
  readonly name = 'booking_eligibility';

  async run(ctx: PipelineContext): Promise<void> {
    const { booking, submission } = ctx;

    if (booking.workerId !== submission.workerId) {
      // Ownership is checked on every worker endpoint (TRD §13). This is not a
      // validation flag — it is a refusal.
      reject(ctx, ErrorCode.FORBIDDEN);
      return;
    }

    if (
      booking.status === BookingStatus.CANCELLED_BY_OPS ||
      booking.requirement.status === 'CANCELLED'
    ) {
      reject(ctx, ErrorCode.SHIFT_CANCELLED);
      return;
    }

    const permitted: BookingStatus[] =
      submission.kind === AttendanceKind.CHECK_IN
        ? [BookingStatus.ACCEPTED, BookingStatus.CONFIRMED]
        : [BookingStatus.CHECKED_IN];

    if (!permitted.includes(booking.status)) {
      reject(ctx, ErrorCode.ILLEGAL_TRANSITION);
    }

    return Promise.resolve();
  }
}

/** 2. Media — the key exists, belongs to this worker, within limits. */
@Injectable()
export class MediaStage implements PipelineStage {
  readonly name = 'media';

  async run(ctx: PipelineContext): Promise<void> {
    const key = ctx.submission.photoObjectKey;
    if (!key) {
      flag(ctx, 'NO_PHOTO');
      return;
    }

    // Keys are server-generated and namespaced by worker and booking, so a
    // mismatch means the client addressed someone else's object (TRD §9).
    const expectedPrefix = `attendance/${ctx.submission.workerId}/${ctx.booking.id}/`;
    if (!key.startsWith(expectedPrefix)) {
      reject(ctx, ErrorCode.FORBIDDEN);
      return;
    }

    // TODO(media): HEAD the object in R2 to confirm existence, size and type
    // against thresholds.mediaMaxBytes before accepting the evidence.
    return Promise.resolve();
  }
}

/** 3. Time arbitration — derive the plausible capture instant (TRD §8.3). */
@Injectable()
export class TimeArbitrationStage implements PipelineStage {
  readonly name = 'time_arbitration';

  constructor(
    private readonly prisma: PrismaService,
    private readonly time: TimeArbitrationService,
  ) {}

  async run(ctx: PipelineContext): Promise<void> {
    const { submission, serverReceivedAt } = ctx;

    if (!submission.deviceWallClockAt || submission.deviceUptimeMs === undefined) {
      // No triple submitted: server receipt is all we have, and we say so.
      ctx.derivedCaptureAt = serverReceivedAt;
      flag(ctx, 'NO_TIMING_TRIPLE');
      return;
    }

    // The worker's previous event pins a device uptime reading to a trusted
    // server instant. Without it a late offline upload cannot be placed.
    const previous = await this.prisma.attendance.findFirst({
      where: {
        booking: { workerId: submission.workerId },
        deviceUptimeMs: { not: null },
      },
      orderBy: { serverReceivedAt: 'desc' },
      select: { deviceUptimeMs: true, serverReceivedAt: true },
    });

    const result = this.time.arbitrate(
      {
        deviceWallClockAt: submission.deviceWallClockAt,
        deviceUptimeMs: submission.deviceUptimeMs,
        serverReceivedAt,
      },
      previous?.deviceUptimeMs != null
        ? {
            deviceUptimeMs: Number(previous.deviceUptimeMs),
            serverReceivedAt: previous.serverReceivedAt,
          }
        : null,
      ctx.thresholds.timeSkewToleranceMs,
    );

    ctx.derivedCaptureAt = result.derivedCaptureAt;
    for (const f of result.flags) flag(ctx, f);
  }
}

/** 4. Window — the derived capture instant, not the submission time. */
@Injectable()
export class WindowStage implements PipelineStage {
  readonly name = 'window';

  async run(ctx: PipelineContext): Promise<void> {
    const captureAt = ctx.derivedCaptureAt;
    if (!captureAt) return Promise.resolve();

    const anchor =
      ctx.submission.kind === AttendanceKind.CHECK_IN
        ? ctx.booking.requirement.startsAt
        : ctx.booking.requirement.endsAt;

    const opensAt = new Date(anchor.getTime() - ctx.thresholds.windowBeforeMin * 60_000);
    const closesAt = new Date(anchor.getTime() + ctx.thresholds.windowAfterMin * 60_000);

    if (captureAt < opensAt || captureAt > closesAt) {
      reject(ctx, ErrorCode.OUTSIDE_WINDOW);
    }

    return Promise.resolve();
  }
}

/** 5. Accuracy — a vague fix cannot support a geofence claim. */
@Injectable()
export class AccuracyStage implements PipelineStage {
  readonly name = 'accuracy';

  async run(ctx: PipelineContext): Promise<void> {
    const accuracy = ctx.submission.accuracyM;
    if (accuracy === undefined) {
      flag(ctx, 'NO_ACCURACY_REPORTED');
      return Promise.resolve();
    }

    if (accuracy > ctx.thresholds.locationAccuracyCeilingM) {
      reject(ctx, ErrorCode.LOCATION_ACCURACY_LOW);
    }

    return Promise.resolve();
  }
}

/** 6. Geofence — recomputed server-side regardless of the client's verdict. */
@Injectable()
export class GeofenceStage implements PipelineStage {
  readonly name = 'geofence';

  constructor(private readonly geo: GeoService) {}

  async run(ctx: PipelineContext): Promise<void> {
    const { lat, lng } = ctx.submission;
    if (lat === undefined || lng === undefined) {
      reject(ctx, ErrorCode.OUTSIDE_GEOFENCE);
      return Promise.resolve();
    }

    const company = ctx.booking.requirement.company;
    const radiusM = company.geofenceRadiusM ?? ctx.thresholds.geofenceRadiusM;
    const distanceM = this.geo.distanceMetres({ lat, lng }, { lat: company.lat, lng: company.lng });

    ctx.distanceM = distanceM;

    if (distanceM > radiusM) {
      reject(ctx, ErrorCode.OUTSIDE_GEOFENCE);
    }

    // A client that claimed "inside" while the server computes "outside" is
    // worth seeing even when the verdict already reflects the truth.
    if (ctx.submission.clientVerdict === 'inside' && distanceM > radiusM) {
      flag(ctx, 'CLIENT_VERDICT_DISAGREES');
    }

    return Promise.resolve();
  }
}

/** 7. Integrity — mock location rejects; secondary signals only flag. */
@Injectable()
export class IntegrityStage implements PipelineStage {
  readonly name = 'integrity';

  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
  ) {}

  async run(ctx: PipelineContext): Promise<void> {
    if (ctx.submission.integrity?.mockLocationDetected) {
      reject(ctx, ErrorCode.INTEGRITY_REJECTED);
      flag(ctx, 'MOCK_LOCATION');
      // Raised to ops even though the verdict already refuses it.
    }

    const { lat, lng } = ctx.submission;
    if (lat === undefined || lng === undefined || !ctx.derivedCaptureAt) return;

    // Coordinates repeated to full precision suggest a replayed fix.
    const identical = await this.prisma.attendance.findFirst({
      where: {
        lat,
        lng,
        booking: { workerId: { not: ctx.submission.workerId } },
      },
      select: { id: true },
    });
    if (identical) flag(ctx, 'COORDINATES_REPEATED');

    // Implausible implied travel speed since this worker's last observation.
    const previous = await this.prisma.attendance.findFirst({
      where: {
        booking: { workerId: ctx.submission.workerId },
        lat: { not: null },
        derivedCaptureAt: { not: null },
      },
      orderBy: { derivedCaptureAt: 'desc' },
      select: { lat: true, lng: true, derivedCaptureAt: true },
    });

    if (previous?.lat != null && previous.lng != null && previous.derivedCaptureAt) {
      const speed = this.geo.impliedSpeedKmh(
        { lat: previous.lat, lng: previous.lng },
        previous.derivedCaptureAt,
        { lat, lng },
        ctx.derivedCaptureAt,
      );
      if (speed !== null && speed > ctx.thresholds.implausibleSpeedKmh) {
        flag(ctx, 'IMPLAUSIBLE_SPEED');
      }
    }
  }
}

/**
 * 8. Face verification — flags for review, never auto-rejects (BE-CHK-06).
 * Provider choice is BT-2 and decides whether biometric data leaves the country.
 */
@Injectable()
export class FaceVerificationStage implements PipelineStage {
  readonly name = 'face_verification';

  async run(ctx: PipelineContext): Promise<void> {
    if (!ctx.thresholds.faceVerificationEnabled || !ctx.submission.photoObjectKey) {
      return Promise.resolve();
    }

    // TODO(BT-2): call the chosen provider behind an interface, as with MSG91
    // and FCM, so it stays swappable by configuration.
    const confidence = ctx.faceConfidence;
    if (confidence === undefined) {
      flag(ctx, 'FACE_NOT_VERIFIED');
      return Promise.resolve();
    }

    if (confidence < ctx.thresholds.faceMinConfidence) {
      flag(ctx, 'FACE_LOW_CONFIDENCE');
    }

    return Promise.resolve();
  }
}

/** 9. Code — required only where the shift is high-value. */
@Injectable()
export class ShiftCodeStage implements PipelineStage {
  readonly name = 'shift_code';

  async run(ctx: PipelineContext): Promise<void> {
    if (!ctx.booking.requirement.highValue) return Promise.resolve();

    // TODO: compare against the code issued for this requirement, in constant time.
    if (!ctx.submission.code) {
      reject(ctx, ErrorCode.INVALID_CODE);
    }

    return Promise.resolve();
  }
}
