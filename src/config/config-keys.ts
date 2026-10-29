/**
 * The operational knobs. Every one of these lives in the `config` table and is
 * editable by ops without a deploy (TRD §12). The values below are seed
 * defaults only — they are written to the database once and then owned by ops.
 *
 * Open items BT-3 (skew tolerance) and BT-6 (visibility flags) are answered
 * here as defaults, deliberately permissive, to be tightened with pilot data.
 */
export const ConfigKey = {
  // Attendance pipeline (TRD §8)
  GEOFENCE_RADIUS_M: 'attendance.geofence_radius_m',
  LOCATION_ACCURACY_CEILING_M: 'attendance.location_accuracy_ceiling_m',
  CHECK_IN_WINDOW_BEFORE_MIN: 'attendance.check_in_window_before_min',
  CHECK_IN_WINDOW_AFTER_MIN: 'attendance.check_in_window_after_min',
  CHECK_OUT_WINDOW_BEFORE_MIN: 'attendance.check_out_window_before_min',
  CHECK_OUT_WINDOW_AFTER_MIN: 'attendance.check_out_window_after_min',
  TIME_SKEW_TOLERANCE_MS: 'attendance.time_skew_tolerance_ms',
  IMPLAUSIBLE_SPEED_KMH: 'attendance.implausible_speed_kmh',
  FACE_MATCH_MIN_CONFIDENCE: 'attendance.face_match_min_confidence',
  MEDIA_MAX_BYTES: 'attendance.media_max_bytes',

  // Bookings and no-show (TRD §10)
  OFFER_TTL_MIN: 'bookings.offer_ttl_min',
  NO_SHOW_GRACE_MIN: 'bookings.no_show_grace_min',
  CANCELLATION_FREE_WINDOW_HOURS: 'bookings.cancellation_free_window_hours',

  // Confirmations
  CONFIRM_DAY_BEFORE_HOUR_IST: 'confirmations.day_before_hour_ist',
  CONFIRM_MORNING_OF_HOUR_IST: 'confirmations.morning_of_hour_ist',
  CONFIRM_ESCALATION_AFTER_MIN: 'confirmations.escalation_after_min',

  // Reliability (BT-1 — formula versioned from day one)
  RELIABILITY_FORMULA_VERSION: 'reliability.formula_version',
  RELIABILITY_WEIGHTS: 'reliability.weights',

  // Notifications
  PUSH_FALLBACK_AFTER_MIN: 'notifications.push_fallback_after_min',

  // Media retention (BT-4 — pending a legal answer)
  ATTENDANCE_MEDIA_RETENTION_DAYS: 'media.attendance_retention_days',

  // Rate limits (BT-7 — tune against MSG91 cost)
  OTP_MAX_PER_PHONE_PER_HOUR: 'auth.otp_max_per_phone_per_hour',
  OTP_MAX_PER_IP_PER_HOUR: 'auth.otp_max_per_ip_per_hour',
  OTP_MAX_ATTEMPTS: 'auth.otp_max_attempts',
  OTP_TTL_SECONDS: 'auth.otp_ttl_seconds',
  OPS_LOGIN_MAX_PER_EMAIL_PER_HOUR: 'auth.ops_login_max_per_email_per_hour',
  OPS_LOGIN_MAX_PER_IP_PER_HOUR: 'auth.ops_login_max_per_ip_per_hour',
} as const;

export type ConfigKeyValue = (typeof ConfigKey)[keyof typeof ConfigKey];

export const FeatureFlagKey = {
  SCORE_VISIBLE_TO_WORKER: 'flags.score_visible_to_worker',
  BROWSE_OPEN_SHIFTS: 'flags.browse_open_shifts',
  DOCUMENT_UPLOAD: 'flags.document_upload',
  FACE_VERIFICATION: 'flags.face_verification',
} as const;

export type FeatureFlagKeyValue = (typeof FeatureFlagKey)[keyof typeof FeatureFlagKey];

/** Seed defaults. Ops owns these after first write. */
export const CONFIG_DEFAULTS: Record<ConfigKeyValue, unknown> = {
  [ConfigKey.GEOFENCE_RADIUS_M]: 150,
  [ConfigKey.LOCATION_ACCURACY_CEILING_M]: 100,
  [ConfigKey.CHECK_IN_WINDOW_BEFORE_MIN]: 30,
  [ConfigKey.CHECK_IN_WINDOW_AFTER_MIN]: 30,
  [ConfigKey.CHECK_OUT_WINDOW_BEFORE_MIN]: 30,
  [ConfigKey.CHECK_OUT_WINDOW_AFTER_MIN]: 120,
  // BT-3: start permissive, flag rather than reject, tighten with data.
  [ConfigKey.TIME_SKEW_TOLERANCE_MS]: 5 * 60 * 1000,
  [ConfigKey.IMPLAUSIBLE_SPEED_KMH]: 150,
  [ConfigKey.FACE_MATCH_MIN_CONFIDENCE]: 0.6,
  [ConfigKey.MEDIA_MAX_BYTES]: 5 * 1024 * 1024,

  [ConfigKey.OFFER_TTL_MIN]: 60,
  [ConfigKey.NO_SHOW_GRACE_MIN]: 30,
  [ConfigKey.CANCELLATION_FREE_WINDOW_HOURS]: 24,

  [ConfigKey.CONFIRM_DAY_BEFORE_HOUR_IST]: 18,
  [ConfigKey.CONFIRM_MORNING_OF_HOUR_IST]: 7,
  [ConfigKey.CONFIRM_ESCALATION_AFTER_MIN]: 60,

  [ConfigKey.RELIABILITY_FORMULA_VERSION]: 'v1',
  [ConfigKey.RELIABILITY_WEIGHTS]: {
    completed: 1,
    lateCheckIn: -1,
    noShow: -5,
    lateCancellation: -3,
  },

  [ConfigKey.PUSH_FALLBACK_AFTER_MIN]: 10,

  // BT-4: aligned to the dispute window pending legal input.
  [ConfigKey.ATTENDANCE_MEDIA_RETENTION_DAYS]: 90,

  [ConfigKey.OTP_MAX_PER_PHONE_PER_HOUR]: 5,
  [ConfigKey.OTP_MAX_PER_IP_PER_HOUR]: 20,
  [ConfigKey.OTP_MAX_ATTEMPTS]: 5,
  [ConfigKey.OTP_TTL_SECONDS]: 300,
  [ConfigKey.OPS_LOGIN_MAX_PER_EMAIL_PER_HOUR]: 10,
  [ConfigKey.OPS_LOGIN_MAX_PER_IP_PER_HOUR]: 30,
};

export const FLAG_DEFAULTS: Record<FeatureFlagKeyValue, boolean> = {
  [FeatureFlagKey.SCORE_VISIBLE_TO_WORKER]: false,
  [FeatureFlagKey.BROWSE_OPEN_SHIFTS]: false,
  [FeatureFlagKey.DOCUMENT_UPLOAD]: false,
  [FeatureFlagKey.FACE_VERIFICATION]: false,
};
