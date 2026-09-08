// ─── Measured tracker error on v0 synthetic takes (2026-09-08) ───────────────
//
// Run over all 108 published jam-actions-acoustic-v0 records, comparing
// YIN / SuperFlux to the recipe's applied cents and delay. These numbers
// are the estimator error that v1 guard bands must clear (rule 6).
//
// Pitch, when YIN locks (|measured−applied| < 100 c, not untrackable):
//   n=23/36 of clean+sharp kinds; p95 = 0.179 c; max = 0.191 c.
// Pitch, including octave jumps: p50 still 0.15 c but p95 is thousands
//   of cents — those are untrackable, not scatter around the true pitch.
//
// Onset (signed, measured − sounded): always early. mean −17.4 ms,
//   p50 −15.8 ms, abs p95 28.0 ms, abs max 37.2 ms.
//
// sharp_30 applied clearance to the 25 c warn gate is 3.0–7.7 c.
//   Locked: 3.0 c >> 0.179 c, so the clearance SURVIVES locked YIN error.
//   Unlocked: all 4 Bach prelude mm.1 sharp_30 records are untrackable
//   (octave jumps of −300 to −3100 c). Gold is still pitch_warn from the
//   recipe. That is a published v0 defect (rule 2: labels vs what the
//   tools measure). Not fixed here; v0 is frozen.
// ─────────────────────────────────────────────────────────────────────────────

/** p95 |YIN median − applied cents| on takes where the tracker locked. */
export const MEASURED_YIN_LOCKED_P95_CENTS = 0.179;

/** Max locked |error| observed. */
export const MEASURED_YIN_LOCKED_MAX_CENTS = 0.191;

/** p95 |onset time − sounded time| in ms (includes the early bias). */
export const MEASURED_ONSET_ABS_P95_MS = 28.025;

/** Max |onset error| observed, ms. */
export const MEASURED_ONSET_ABS_MAX_MS = 37.199;

/**
 * Pitch-boundary clearance used in v1. 5 c is >> locked p95 0.179 c and
 * still inside the warn/fail gap (25 c). 1 c would not be honest.
 */
export const V1_PITCH_CLEARANCE_CENTS = 5;

/**
 * Timing-boundary clearance used in v1. Must exceed onset abs p95 (28 ms)
 * and the observed max (37 ms), so a worst-case early detection cannot
 * walk a fail across the 40 ms gate.
 */
// 38 ms of clearance beyond the 40 ms gate, so a late_fail take is rendered at
// 78 ms. That was justified as 1.36x the 28 ms abs-p95 onset error measured on
// v0, and 1.36x a p95 would be thin if the error were really that spread out.
//
// Measured on the takes this construction actually keeps, it is not. All 27
// late_fail records measure 59.9 ms — min, median, p95 and max identical, zero
// variance. The detector is systematically ~18 ms early here and nothing else,
// so the real margin is 59.9 against a 40 ms gate: 19.9 ms clear of a constant,
// known bias rather than 1.36 sigma of noise.
//
// Safer than the stated reason, but the stated reason came from a different
// construction. Recorded so the next person sizing this band uses the number
// that governs it.
export const V1_ONSET_CLEARANCE_MS = 38;
/** Measured onset deviation on every kept late_fail take. Zero variance. */
export const MEASURED_F5_LATE_ONSET_MS = 59.9;

export const V1_PITCH_WARN_CENTS = 25;
export const V1_PITCH_FAIL_CENTS = 50;
export const V1_TIMING_MS = 40;
