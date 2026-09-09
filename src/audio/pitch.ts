// ─── ai-jam-sessions: Pitch Tracking ─────────────────────────────────────────
//
// YIN (de Cheveigné & Kawahara 2002) plus the cents-against-target gate.
//
// WHY OUR OWN YIN RATHER THAN A MODEL. Chunk 2 researched this and recommended
// it, and the reasoning holds: SwiftF0 is MIT and small but its published range
// starts around G1, which misses the bottom of the piano, and taking it would
// mean an ONNX runtime plus a weights file in an MIT npm package for a job a
// classical estimator does well on clean, monophonic, synthetic-to-lightly-
// recorded audio. The study's own numbers put pYIN at 0.919 raw pitch accuracy
// at 50 cents (finding 18); our gate IS 50 cents, so the classical estimator
// sits comfortably inside the tolerance we actually enforce. A neural tracker
// stays available later as a cross-check on hard material, which is how the
// Python vocal clock already uses one.
//
// WHAT THIS IS NOT. It is monophonic. On a chord or a mix it will report
// something confident and wrong. Polyphonic reference audio needs a different
// estimator; the study names RMVPE for that case (finding 36). The guard here
// is `confidence`, which callers must actually check rather than reading `f0Hz`
// unconditionally.
//
// THE GATE. Thresholds come from the study's finding 8 in the vocal wave, which
// this repo already enforces on the singing route: fail beyond 50 cents, warn
// beyond 25, and a median-vs-mean disagreement past 40 cents means the track is
// UNTRACKABLE rather than out of tune. That last one matters. An octave error
// produces a confident 1200-cent offset, and reporting "1200 cents sharp"
// instead of "I could not follow this" is the difference between a useful gate
// and a misleading one.
//
// Usage:
//   const track = trackPitch(samples, { sampleRate: 44100 });
//   const verdict = scorePitchWindow(track, 69, 0.5, 1.2);   // A4 from 0.5–1.2 s
// ─────────────────────────────────────────────────────────────────────────────

/** Default absolute threshold on the cumulative mean normalised difference. */
export const YIN_THRESHOLD = 0.15;

/** Beyond this many cents from target, a note FAILS the gate. */
export const PITCH_FAIL_CENTS = 50;

/** Beyond this many cents from target, a note WARNS. */
export const PITCH_WARN_CENTS = 25;

/**
 * If the mean and median cent offsets disagree by more than this, the track is
 * reported UNTRACKABLE rather than out of tune. Catches octave errors, which
 * otherwise present as a confident 1200-cent report.
 */
export const OCTAVE_TRIPWIRE_CENTS = 40;

/** Options for {@link trackPitch}. */
export interface PitchOptions {
  sampleRate: number;
  /** Analysis frame length in samples. Defaults to 2048. */
  frameLength?: number;
  /** Samples between frames. Defaults to 512, matching the STFT hop. */
  hopLength?: number;
  /** Lowest detectable frequency in Hz. Defaults to 55 (A1). */
  fmin?: number;
  /** Highest detectable frequency in Hz. Defaults to 2000 (roughly B6). */
  fmax?: number;
  /** Absolute YIN threshold. Defaults to {@link YIN_THRESHOLD}. */
  threshold?: number;
}

/** One frame's pitch estimate. */
export interface PitchFrame {
  /** Frame centre in seconds. */
  timeSec: number;
  /** Estimated fundamental in Hz, or null when no periodic candidate was found. */
  f0Hz: number | null;
  /**
   * Periodicity in [0, 1], as 1 − d'(τ). Low values mean the frame is noisy,
   * silent, or polyphonic. Callers MUST check this before trusting `f0Hz`.
   */
  confidence: number;
  /** Fractional MIDI number of `f0Hz`, or null when unvoiced. */
  midi: number | null;
}

/** A pitch track over a whole signal. */
export interface PitchTrack {
  frames: PitchFrame[];
  params: Required<PitchOptions>;
}

/** Convert a frequency in Hz to a fractional MIDI number. */
export function hzToMidi(hz: number): number {
  if (!(hz > 0)) {
    throw new Error(`Frequency must be positive to convert to MIDI, got ${hz}.`);
  }
  return 69 + 12 * Math.log2(hz / 440);
}

/** Convert a fractional MIDI number to Hz. */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Signed cent difference from `targetMidi` to `hz`. Positive means sharp.
 */
export function centsFromTarget(hz: number, targetMidi: number): number {
  if (!(hz > 0)) {
    throw new Error(`Frequency must be positive, got ${hz}.`);
  }
  return 1200 * Math.log2(hz / midiToHz(targetMidi));
}

function resolveOptions(options: PitchOptions): Required<PitchOptions> {
  const {
    sampleRate,
    frameLength = 2048,
    hopLength = 512,
    fmin = 55,
    fmax = 2000,
    threshold = YIN_THRESHOLD,
  } = options;

  if (!(sampleRate > 0)) {
    throw new Error(`sampleRate must be positive, got ${sampleRate}.`);
  }
  if (!Number.isInteger(frameLength) || frameLength < 4) {
    throw new Error(`frameLength must be an integer of at least 4, got ${frameLength}.`);
  }
  if (!Number.isInteger(hopLength) || hopLength < 1) {
    throw new Error(`hopLength must be a positive integer, got ${hopLength}.`);
  }
  if (!(fmax > fmin)) {
    throw new Error(`fmax (${fmax}) must exceed fmin (${fmin}).`);
  }

  // YIN compares a window against itself shifted by up to tauMax, so the frame
  // must hold both: window + tauMax <= frameLength, with window = frameLength/2.
  const window = Math.floor(frameLength / 2);
  const tauMax = Math.floor(sampleRate / fmin);
  if (tauMax > window) {
    throw new Error(
      `fmin ${fmin} Hz needs a lag of ${tauMax} samples, but a frameLength of ` +
      `${frameLength} only allows ${window}. Raise frameLength to at least ` +
      `${tauMax * 2}, or raise fmin.`,
    );
  }

  return { sampleRate, frameLength, hopLength, fmin, fmax, threshold };
}

/**
 * YIN on a single frame.
 *
 * Steps 1–5 of the paper: squared difference, cumulative mean normalisation,
 * absolute threshold, local-minimum refinement, parabolic interpolation.
 * Returns null Hz when no candidate clears the threshold and the global minimum
 * is itself unconvincing.
 */
export function yinFrame(
  frame: ArrayLike<number>,
  options: PitchOptions,
): { f0Hz: number | null; confidence: number } {
  const opts = resolveOptions({ ...options, frameLength: frame.length });
  const { sampleRate, fmin, fmax, threshold } = opts;

  const window = Math.floor(frame.length / 2);
  const tauMin = Math.max(1, Math.ceil(sampleRate / fmax));
  const tauMax = Math.min(window - 1, Math.floor(sampleRate / fmin));

  if (tauMax <= tauMin) {
    return { f0Hz: null, confidence: 0 };
  }

  // Step 1: squared difference function.
  const diff = new Float64Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < window; j++) {
      const delta = frame[j]! - frame[j + tau]!;
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // Step 2: cumulative mean normalised difference. d'(0) is 1 by definition.
  const cmnd = new Float64Array(tauMax + 1);
  cmnd[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    runningSum += diff[tau]!;
    cmnd[tau] = runningSum > 0 ? (diff[tau]! * tau) / runningSum : 1;
  }

  // Steps 3–4: first dip below the absolute threshold, then walk down to the
  // bottom of that dip. Taking the FIRST qualifying dip rather than the global
  // minimum is what suppresses octave errors, and is the whole point of the
  // absolute-threshold step.
  let bestTau = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cmnd[tau]! < threshold) {
      let t = tau;
      while (t + 1 <= tauMax && cmnd[t + 1]! < cmnd[t]!) t++;
      bestTau = t;
      break;
    }
  }

  if (bestTau < 0) {
    // Nothing cleared the threshold. Fall back to the global minimum so the
    // caller still gets a confidence number, but report it honestly.
    let minTau = tauMin;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cmnd[tau]! < cmnd[minTau]!) minTau = tau;
    }
    const periodicity = 1 - cmnd[minTau]!;
    return {
      f0Hz: null,
      confidence: periodicity > 0 ? periodicity : 0,
    };
  }

  // Step 5: parabolic interpolation around the chosen lag, for sub-sample
  // precision. Without it the quantisation error at high pitch alone can
  // exceed the gate: at A4 and 44.1 kHz one lag step is about 20 cents.
  let refined = bestTau;
  if (bestTau > 0 && bestTau < tauMax) {
    const s0 = cmnd[bestTau - 1]!;
    const s1 = cmnd[bestTau]!;
    const s2 = cmnd[bestTau + 1]!;
    const denom = 2 * (s0 - 2 * s1 + s2);
    if (denom !== 0) {
      const shift = (s0 - s2) / denom;
      // A parabolic vertex more than half a sample away means the three points
      // were not a clean dip; keep the integer lag in that case.
      if (Math.abs(shift) <= 1) refined = bestTau + shift;
    }
  }

  const periodicity = 1 - cmnd[bestTau]!;
  return {
    f0Hz: sampleRate / refined,
    confidence: periodicity > 0 ? Math.min(1, periodicity) : 0,
  };
}

/**
 * Track pitch across a whole signal.
 *
 * Frames are centred on `t · hopLength` to match {@link stft} and the CQT, so a
 * pitch contour drawn over either lines up without an offset correction.
 */
export function trackPitch(
  samples: ArrayLike<number>,
  options: PitchOptions,
): PitchTrack {
  const opts = resolveOptions(options);
  const { sampleRate, frameLength, hopLength } = opts;

  const n = samples.length;
  const frameCount = 1 + Math.floor(n / hopLength);
  const half = Math.floor(frameLength / 2);
  const buffer = new Float64Array(frameLength);
  const frames: PitchFrame[] = [];

  for (let t = 0; t < frameCount; t++) {
    const centre = t * hopLength;
    const start = centre - half;

    // Zero-pad at the edges rather than reflect: a mirrored waveform has the
    // same period as the original, so reflection would invent periodicity in
    // exactly the frames where there is least evidence.
    for (let i = 0; i < frameLength; i++) {
      const idx = start + i;
      buffer[i] = idx >= 0 && idx < n ? samples[idx]! : 0;
    }

    const { f0Hz, confidence } = yinFrame(buffer, opts);
    frames.push({
      timeSec: centre / sampleRate,
      f0Hz,
      confidence,
      midi: f0Hz === null ? null : hzToMidi(f0Hz),
    });
  }

  return { frames, params: opts };
}

/** The verdict for one note window. */
export interface PitchVerdict {
  status: "correct" | "warn" | "fail" | "untrackable";
  /** Median cent offset from target across the voiced frames. Null when untrackable. */
  centsMedian: number | null;
  /** Mean cent offset. Null when untrackable. */
  centsMean: number | null;
  /** Standard deviation of the cent offsets, a scatter measure. Null when untrackable. */
  centsStdDev: number | null;
  /** How many frames in the window were voiced enough to use. */
  voicedFrames: number;
  /** How many frames the window covered at all. */
  totalFrames: number;
  /** Human-readable reason, always populated. */
  detail: string;
}

/**
 * Score a pitch track against one target note over a time window.
 *
 * Reports the MEDIAN offset rather than the mean, because a single octave-error
 * frame drags a mean by 1200 cents and a median not at all. The mean is still
 * returned, and the two disagreeing by more than
 * {@link OCTAVE_TRIPWIRE_CENTS} is what triggers `untrackable`.
 */
export function scorePitchWindow(
  track: PitchTrack,
  targetMidi: number,
  startSec: number,
  endSec: number,
  minConfidence = 0.5,
): PitchVerdict {
  if (!(endSec > startSec)) {
    throw new Error(
      `Window end (${endSec}) must be after start (${startSec}).`,
    );
  }

  const inWindow = track.frames.filter(
    (f) => f.timeSec >= startSec && f.timeSec <= endSec,
  );
  const voiced = inWindow.filter(
    (f) => f.f0Hz !== null && f.confidence >= minConfidence,
  );

  if (voiced.length === 0) {
    return {
      status: "untrackable",
      centsMedian: null,
      centsMean: null,
      centsStdDev: null,
      voicedFrames: 0,
      totalFrames: inWindow.length,
      detail:
        `No frame between ${startSec.toFixed(3)} s and ${endSec.toFixed(3)} s ` +
        `was voiced above confidence ${minConfidence}. The note may be silent, ` +
        `too quiet, or polyphonic. This is not an out-of-tune verdict.`,
    };
  }

  const cents = voiced
    .map((f) => centsFromTarget(f.f0Hz!, targetMidi))
    .sort((a, b) => a - b);

  const mid = Math.floor(cents.length / 2);
  const median = cents.length % 2 === 1
    ? cents[mid]!
    : (cents[mid - 1]! + cents[mid]!) / 2;

  const mean = cents.reduce((a, b) => a + b, 0) / cents.length;
  const variance =
    cents.reduce((acc, c) => acc + (c - mean) * (c - mean), 0) / cents.length;
  const stdDev = Math.sqrt(variance);

  if (Math.abs(mean - median) > OCTAVE_TRIPWIRE_CENTS) {
    return {
      status: "untrackable",
      centsMedian: median,
      centsMean: mean,
      centsStdDev: stdDev,
      voicedFrames: voiced.length,
      totalFrames: inWindow.length,
      detail:
        `Mean (${mean.toFixed(1)} c) and median (${median.toFixed(1)} c) ` +
        `disagree by more than ${OCTAVE_TRIPWIRE_CENTS} c, which means the ` +
        `tracker jumped octaves rather than the note being mistuned. Reported ` +
        `as untrackable, not as out of tune.`,
    };
  }

  const magnitude = Math.abs(median);
  const status = magnitude > PITCH_FAIL_CENTS
    ? "fail"
    : magnitude > PITCH_WARN_CENTS
      ? "warn"
      : "correct";

  const direction = median >= 0 ? "sharp" : "flat";
  return {
    status,
    centsMedian: median,
    centsMean: mean,
    centsStdDev: stdDev,
    voicedFrames: voiced.length,
    totalFrames: inWindow.length,
    detail:
      `${Math.abs(median).toFixed(1)} cents ${direction} of target, ` +
      `median over ${voiced.length} voiced frame(s), scatter ` +
      `${stdDev.toFixed(1)} c. Thresholds: warn above ${PITCH_WARN_CENTS} c, ` +
      `fail above ${PITCH_FAIL_CENTS} c.`,
  };
}
