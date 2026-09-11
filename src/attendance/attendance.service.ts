import { Injectable } from '@nestjs/common';
import {
  ActorType,
  Attendance,
  AttendanceKind,
  AttendanceVerdict,
  BookingStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PlatformConfigService } from '../config/config.service';
import { ConfigKey, FeatureFlagKey } from '../config/config-keys';
import { BookingsService } from '../bookings/bookings.service';
import { AppException } from '../shared/errors/app.exception';
import { ErrorCode, ErrorCodeValue } from '../shared/errors/error-codes';
import { AttendancePipelineService } from './pipeline/attendance-pipeline.service';
import {
  AttendanceSubmission,
  BookingContext,
  PipelineThresholds,
} from './pipeline/pipeline.types';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: AttendancePipelineService,
    private readonly bookings: BookingsService,
    private readonly config: PlatformConfigService,
  ) {}

  /**
   * Step 10 of the pipeline: commit. Transition the booking, append the event
   * and persist evidence and all flags — in one transaction, so a rejected
   * check-in still leaves a record ops can inspect.
   */
  async submit(submission: AttendanceSubmission): Promise<Attendance> {
    const booking = await this.loadBooking(submission.bookingId);
    const thresholds = await this.resolveThresholds(submission.kind);

    const result = await this.pipeline.run({
      submission,
      booking,
      thresholds,
      serverReceivedAt: new Date(),
      rejections: [],
      flags: [],
    });

    // Duplicate submission collapses onto one row (unique on bookingId + kind),
    // so a client retrying an offline queue cannot create a second record.
    const attendance = await this.prisma.attendance.upsert({
      where: { bookingId_kind: { bookingId: booking.id, kind: submission.kind } },
      create: {
        bookingId: booking.id,
        kind: submission.kind,
        photoObjectKey: submission.photoObjectKey,
        lat: submission.lat,
        lng: submission.lng,
        accuracyM: submission.accuracyM,
        code: submission.code,
        deviceWallClockAt: submission.deviceWallClockAt,
        deviceUptimeMs: submission.deviceUptimeMs,
        derivedCaptureAt: result.derivedCaptureAt,
        verdict: result.verdict,
        rejectionReasons: result.rejectionReasons,
        flags: result.flags,
        distanceM: result.distanceM,
        faceConfidence: result.faceConfidence,
        integrityPayload: submission.integrity?.raw as Prisma.InputJsonValue | undefined,
      },
      // An existing record is the authority; a retry must not overwrite the
      // verdict that was already reached on the original evidence.
      update: {},
    });

    if (result.verdict === AttendanceVerdict.REJECTED) {
      throw new AppException(
        this.primaryCode(result.rejectionReasons),
        'Attendance was not accepted',
        { reasons: result.rejectionReasons, flags: result.flags, attendanceId: attendance.id },
      );
    }

    await this.bookings.transition({
      bookingId: booking.id,
      to:
        submission.kind === AttendanceKind.CHECK_IN
          ? BookingStatus.CHECKED_IN
          : BookingStatus.CHECKED_OUT,
      actorType: ActorType.WORKER,
      actorId: submission.workerId,
      evidenceRef: attendance.id,
      metadata: { flags: result.flags, distanceM: result.distanceM ?? null },
    });

    return attendance;
  }

  private async loadBooking(bookingId: string): Promise<BookingContext> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { requirement: { include: { company: true } } },
    });

    if (!booking) throw new AppException(ErrorCode.NOT_FOUND, 'Booking not found');
    return booking;
  }

  /** Every threshold comes from the config service. None is a constant here. */
  private async resolveThresholds(kind: AttendanceKind): Promise<PipelineThresholds> {
    const isCheckIn = kind === AttendanceKind.CHECK_IN;

    const [
      geofenceRadiusM,
      locationAccuracyCeilingM,
      windowBeforeMin,
      windowAfterMin,
      timeSkewToleranceMs,
      implausibleSpeedKmh,
      faceMinConfidence,
      mediaMaxBytes,
      faceVerificationEnabled,
    ] = await Promise.all([
      this.config.getNumber(ConfigKey.GEOFENCE_RADIUS_M),
      this.config.getNumber(ConfigKey.LOCATION_ACCURACY_CEILING_M),
      this.config.getNumber(
        isCheckIn ? ConfigKey.CHECK_IN_WINDOW_BEFORE_MIN : ConfigKey.CHECK_OUT_WINDOW_BEFORE_MIN,
      ),
      this.config.getNumber(
        isCheckIn ? ConfigKey.CHECK_IN_WINDOW_AFTER_MIN : ConfigKey.CHECK_OUT_WINDOW_AFTER_MIN,
      ),
      this.config.getNumber(ConfigKey.TIME_SKEW_TOLERANCE_MS),
      this.config.getNumber(ConfigKey.IMPLAUSIBLE_SPEED_KMH),
      this.config.getNumber(ConfigKey.FACE_MATCH_MIN_CONFIDENCE),
      this.config.getNumber(ConfigKey.MEDIA_MAX_BYTES),
      this.config.isEnabled(FeatureFlagKey.FACE_VERIFICATION),
    ]);

    return {
      geofenceRadiusM,
      locationAccuracyCeilingM,
      windowBeforeMin,
      windowAfterMin,
      timeSkewToleranceMs,
      implausibleSpeedKmh,
      faceMinConfidence,
      mediaMaxBytes,
      faceVerificationEnabled,
    };
  }

  /** The client renders one code; the full list travels in `details`. */
  private primaryCode(reasons: string[]): ErrorCodeValue {
    return (reasons[0] as ErrorCodeValue) ?? ErrorCode.VALIDATION_FAILED;
  }
}
