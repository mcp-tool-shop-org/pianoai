// ─── ai-jam-sessions: Decibel Scaling ────────────────────────────────────────
//
// Amplitude and power to decibels, matching librosa 0.11 exactly.
//
// WHY THE `ref` PARAMETER IS LOAD-BEARING. librosa defaults to `ref=1.0`, an
// ABSOLUTE reference. Whisper's reference implementation instead clamps
// relative to the loudest value in the clip (study finding 45). Those differ in
// a way that bites: under a peak-relative reference, trimming a clip changes
// every value in it, so the same note analysed inside two different windows
// gets two different numbers. That is fine for feeding a neural net that
// normalises anyway, and fatal for a golden-fixture test or a stored gate
// result.
//
// So this module splits them:
//   • `powerToDb` / `amplitudeToDb` default to ref=1.0 and top_db=null.
//     Absolute, stable under trimming, and what analysis and tests use.
//   • Peak-relative behaviour is opt-in via `ref: "max"` and an explicit
//     `topDb`, and belongs to RENDERING, where spending the colormap's range
//     on the loudest 80 dB is exactly what you want (study findings 21, 46).
//
// Usage:
//   powerToDb(spec)                              // absolute, unclamped
//   powerToDb(spec, { ref: "max", topDb: 80 })   // the display convention
// ─────────────────────────────────────────────────────────────────────────────

/** Options for {@link powerToDb} and {@link amplitudeToDb}. */
export interface DbOptions {
  /**
   * Reference value the result is scaled against.
   *
   * A number is used directly. The string `"max"` uses the largest value in
   * the input, which makes 0 dB the peak and every other value negative.
   * Defaults to 1.0, matching librosa.
   */
  ref?: number | "max";

  /**
   * Floor applied to the input before taking the logarithm, so that silence
   * produces a finite number instead of -Infinity. Defaults to 1e-10, matching
   * librosa.
   */
  amin?: number;

  /**
   * Dynamic range in dB. When set, values more than `topDb` below the loudest
   * output value are clamped up to that floor. `null` (the default) leaves the
   * result unclamped.
   *
   * Note this clamps relative to the peak of the OUTPUT regardless of what
   * `ref` was, which is what librosa does.
   */
  topDb?: number | null;
}

function resolveRef(values: ArrayLike<number>, ref: number | "max"): number {
  if (ref === "max") {
    let max = -Infinity;
    for (let i = 0; i < values.length; i++) {
      const v = values[i]!;
      if (v > max) max = v;
    }
    // An all-silent input has no meaningful peak; fall back to the absolute
    // reference rather than producing NaN across the board.
    return max > 0 ? max : 1.0;
  }
  if (!(ref > 0)) {
    throw new Error(`db reference must be positive, got ${ref}.`);
  }
  return ref;
}

/**
 * Convert a power spectrogram (amplitude squared) to decibels.
 *
 * Equivalent to `librosa.power_to_db`. Operates on a flat array; a 2-D
 * spectrogram should be passed as its backing buffer so that `topDb` clamps
 * against the peak of the whole image rather than per frame.
 */
export function powerToDb(
  power: ArrayLike<number>,
  options: DbOptions = {},
): Float64Array {
  const { ref = 1.0, amin = 1e-10, topDb = null } = options;

  if (!(amin > 0)) {
    throw new Error(`amin must be positive, got ${amin}.`);
  }
  if (topDb !== null && !(topDb >= 0)) {
    throw new Error(`topDb must be non-negative or null, got ${topDb}.`);
  }

  const refValue = resolveRef(power, ref);
  const refDb = 10 * Math.log10(Math.max(amin, refValue));

  const out = new Float64Array(power.length);
  let peak = -Infinity;
  for (let i = 0; i < power.length; i++) {
    const v = 10 * Math.log10(Math.max(amin, power[i]!)) - refDb;
    out[i] = v;
    if (v > peak) peak = v;
  }

  if (topDb !== null && Number.isFinite(peak)) {
    const floor = peak - topDb;
    for (let i = 0; i < out.length; i++) {
      if (out[i]! < floor) out[i] = floor;
    }
  }

  return out;
}

/**
 * Convert an amplitude (magnitude) spectrogram to decibels.
 *
 * Equivalent to `librosa.amplitude_to_db`, which is defined as
 * `power_to_db(S**2, ref=ref**2, amin=amin**2)`. Passing a magnitude
 * spectrogram to {@link powerToDb} by mistake is a silent factor-of-two error
 * in the result, so prefer whichever of the two matches what you actually hold.
 */
export function amplitudeToDb(
  amplitude: ArrayLike<number>,
  options: DbOptions = {},
): Float64Array {
  const { ref = 1.0, amin = 1e-5, topDb = null } = options;

  const squared = new Float64Array(amplitude.length);
  for (let i = 0; i < amplitude.length; i++) {
    const v = amplitude[i]!;
    squared[i] = v * v;
  }

  const squaredRef: number | "max" = ref === "max" ? "max" : ref * ref;

  return powerToDb(squared, { ref: squaredRef, amin: amin * amin, topDb });
}
