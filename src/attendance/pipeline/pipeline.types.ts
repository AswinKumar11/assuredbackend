import { AttendanceKind, Booking, Requirement, Company } from '@prisma/client';

import { ErrorCodeValue } from '../../shared/errors/error-codes';

/** What the client submitted. All of it is data, none of it is a verdict. */
export interface AttendanceSubmission {
  bookingId: string;
  workerId: string;
  kind: AttendanceKind;
  photoObjectKey?: string;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  code?: string;
  deviceWallClockAt?: Date;
  deviceUptimeMs?: number;
  /** Client's own opinion about whether it was inside the fence. Advisory only. */
  clientVerdict?: 'inside' | 'outside';
  /** Play Integrity / DeviceCheck payload and mock-location signal. */
  integrity?: {
    mockLocationDetected?: boolean;
    provider?: string;
    raw?: Record<string, unknown>;
  };
}

export type BookingContext = Booking & {
  requirement: Requirement & { company: Company };
};

/** Thresholds resolved once per submission, all from the config service. */
export interface PipelineThresholds {
  geofenceRadiusM: number;
  locationAccuracyCeilingM: number;
  windowBeforeMin: number;
  windowAfterMin: number;
  timeSkewToleranceMs: number;
  implausibleSpeedKmh: number;
  faceMinConfidence: number;
  mediaMaxBytes: number;
  faceVerificationEnabled: boolean;
}

export interface PipelineContext {
  submission: AttendanceSubmission;
  booking: BookingContext;
  thresholds: PipelineThresholds;
  serverReceivedAt: Date;

  /** Filled in by the time-arbitration stage; later stages depend on it. */
  derivedCaptureAt?: Date;
  distanceM?: number;
  faceConfidence?: number;

  /** Hard failures. A non-empty list means the verdict is REJECTED. */
  rejections: ErrorCodeValue[];
  /** Soft signals. Never reject on their own; ops sees all of them. */
  flags: string[];
}

export interface PipelineStage {
  readonly name: string;
  run(context: PipelineContext): Promise<void>;
}

export const reject = (context: PipelineContext, code: ErrorCodeValue): void => {
  if (!context.rejections.includes(code)) context.rejections.push(code);
};

export const flag = (context: PipelineContext, signal: string): void => {
  if (!context.flags.includes(signal)) context.flags.push(signal);
};
