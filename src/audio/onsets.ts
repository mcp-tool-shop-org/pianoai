// ─── ai-jam-sessions: SuperFlux Onset Detection ──────────────────────────────
//
// SuperFlux, Böck & Widmer 2013, not plain spectral flux. Vibrato is the
// failure mode on the vocal route; the maximum-filter trick cuts false
// positives by up to 60% on that material by comparing each bin to the
// max of its frequency neighbours in the previous frame, so energy that
// merely slid sideways does not look like an onset.
//
// THE SURFACE. The brief says log-mel via chunk 1's filterbank, and that is
// what `detectOnsets` builds. The max-filter itself walks any
// TimeFrequencyData, so a CQT (60 bins/octave, 20 cents) can be handed in
// too — and that is the surface where a 50-cent vibrato actually moves
// between bins. On 229 Slaney mels a 50-cent wobble at A4 is in-bin
// (finding 17 again), so the vibrato-suppression proof lives on the CQT.
//
// OUTPUT is onset times in seconds, derived from frameTimes, never a raw
// frame index the caller has to convert. Scores are reported at both 40 ms
// (this repo's house gate) and 50 ms (mir_eval), because publishing only
// one makes our numbers incomparable to published work.
//
// CONFIDENCE. State-of-the-art onset F1 is about 0.88 (Joysingh et al. 2024),
// so roughly one in eight detected onsets is wrong before any timing
// arithmetic. The caveat string is part of the return. Audio-derived onsets
// must never silently override the MIDI-truth gate.
//
// Usage:
//   const result = detectOnsets(samples, { sampleRate: 44100 });
//   const scores = scoreOnsets(result.onsets.map(o => o.time), clickTimes);
// ─────────────────────────────────────────────────────────────────────────────

import { stft, type TimeFrequencyData } from "./stft.js";
import { melFilterbank, applyFilterbank } from "./mel.js";
import { powerToDb } from "./db.js";

/** This repo's timing gate. */
export const HOUSE_TOLERANCE_MS = 40;
/** mir_eval's published convention (Raffel et al. 2014). */
export const MIR_EVAL_TOLERANCE_MS = 50;

/**
 * Shipped on every onset result. SOTA F1 ≈ 0.88 means an audio-derived
 * onset is a proposal, not a verdict.
 */
export const ONSET_DETECTOR_CAVEAT =
  "Onset F1 of state-of-the-art detectors is about 0.88, so roughly one in " +
  "eight detections is wrong before any timing arithmetic. These times are " +
  "an audio-derived proposal; they must not silently override the MIDI-truth gate.";

/** Options for {@link detectOnsets}. */
export interface OnsetOptions {
  sampleRate: number;
  /** STFT size. Defaults to 2048. */
  nFft?: number;
  /** Hop in samples. Defaults to 512 (~11.6 ms at 44.1 kHz). */
  hopLength?: number;
  /** Mel bands. Defaults to 229, the study's music setting. */
  nMels?: number;
  /** Lowest mel frequency in Hz. Defaults to 30. */
  fmin?: number;
  /** Highest mel frequency in Hz. Defaults to min(11025, Nyquist). */
  fmax?: number;
  /**
   * Width of the SuperFlux maximum filter in mel bins. Must be odd.
   * Defaults to 3, i.e. bins k−1, k, k+1 — Böck & Widmer's setting.
   */
  maxFilterBins?: number;
  /**
   * Peak-picker threshold in units of the peak-normalised novelty curve.
   * Defaults to 0.15.
   *
   * RAISED FROM 0.07 AT JUNCTURE 2, on measurement. A 5 Hz / 50-cent vibrato on
   * a pure tone produced spurious onsets once per vibrato cycle at 0.07, with
   * novelty strengths of 0.11 to 0.16 against the real onset's 1.00. Widening
   * the maximum filter barely helped (six false onsets at 3 bins, still three at
   * 11), because at this filterbank's resolution the excursion already fits
   * inside a 3-bin filter; the residue is a threshold matter, not a width one.
   * Sweeping delta put the knee at 0.15, where the false onsets vanish while a
   * deliberately soft onset (0.15 amplitude following a full-scale one) still
   * survives, and keeps surviving out to 0.25.
   *
   * The tradeoff to know: this threshold is PEAK-NORMALISED, so a clip with one
   * very loud onset raises the bar for every quieter one in the same clip. Pass
   * a lower delta explicitly when analysing material with a wide dynamic range.
   */
  delta?: number;
  /** Past window for the moving-maximum test, in seconds. Defaults to 0.03. */
  preMax?: number;
  /** Future window for the moving-maximum test, in seconds. Defaults to 0.03. */
  postMax?: number;
  /** Past window for the moving-average test, in seconds. Defaults to 0.10. */
  preAvg?: number;
  /** Future window for the moving-average test, in seconds. Defaults to 0.07. */
  postAvg?: number;
  /** Merge onsets closer than this, in seconds. Defaults to 0.03. */
  combine?: number;
}

export interface OnsetEvent {
  /** Peak time in seconds, taken from the spectrogram's frameTimes. */
  time: number;
  /** Height of the (peak-normalised) novelty curve at this frame. */
  strength: number;
}

export interface OnsetResult {
  onsets: OnsetEvent[];
  /** SuperFlux novelty curve, peak-normalised to 1. */
  novelty: Float64Array;
  frameTimes: Float64Array;
  caveat: string;
  params: Required<OnsetOptions>;
}

export interface OnsetScore {
  toleranceMs: number;
  precision: number;
  recall: number;
  f1: number;
  matched: number;
  falsePositives: number;
  falseNegatives: number;
}

function resolveOnsetOptions(options: OnsetOptions): Required<OnsetOptions> {
  const {
    sampleRate,
    nFft = 2048,
    hopLength = 512,
    nMels = 229,
    fmin = 30,
    fmax = Math.min(11025, sampleRate / 2),
    maxFilterBins = 3,
    delta = 0.15,
    preMax = 0.03,
    postMax = 0.03,
    preAvg = 0.10,
    postAvg = 0.07,
    combine = 0.03,
  } = options;

  if (!(sampleRate > 0)) {
    throw new Error(`sampleRate must be positive, got ${sampleRate}.`);
  }
  if (!Number.isInteger(maxFilterBins) || maxFilterBins < 1 || maxFilterBins % 2 === 0) {
    throw new Error(
      `maxFilterBins must be a positive odd integer, got ${maxFilterBins}. ` +
      `Use 3 (Böck & Widmer) or 1 (plain flux, no neighbourhood).`,
    );
  }
  if (!(delta >= 0)) {
    throw new Error(`delta must be non-negative, got ${delta}.`);
  }
  return {
    sampleRate, nFft, hopLength, nMels, fmin, fmax, maxFilterBins,
    delta, preMax, postMax, preAvg, postAvg, combine,
  };
}

/**
 * Maximum filter along frequency for one frame. Width is odd; radius
 * `(width − 1) / 2` bins on each side, edges clamp.
 */
export function maxFilterFrame(
  frame: ArrayLike<number>,
  width: number,
): Float64Array {
  const n = frame.length;
  const radius = Math.floor(width / 2);
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let max = -Infinity;
    const lo = Math.max(0, k - radius);
    const hi = Math.min(n - 1, k + radius);
    for (let j = lo; j <= hi; j++) {
      const v = frame[j]!;
      if (v > max) max = v;
    }
    out[k] = max;
  }
  return out;
}

/**
 * SuperFlux novelty curve of any time-frequency grid.
 *
 * For each frame t > 0, bin k: max(0, X[t,k] − max_{k' near k} X[t−1,k']).
 * Summed over frequency. Frame 0 is 0. Not normalised — callers that peak-
 * pick should scale.
 */
export function superfluxNovelty(
  tf: TimeFrequencyData,
  maxFilterBins = 3,
): Float64Array {
  if (!Number.isInteger(maxFilterBins) || maxFilterBins < 1 || maxFilterBins % 2 === 0) {
    throw new Error(`maxFilterBins must be a positive odd integer, got ${maxFilterBins}.`);
  }
  const { frameCount, binCount, data } = tf;
  const novelty = new Float64Array(frameCount);
  if (frameCount < 2) return novelty;

  const prev = new Float64Array(binCount);
  for (let k = 0; k < binCount; k++) prev[k] = data[k]!;
  const filtered = maxFilterFrame(prev, maxFilterBins);

  for (let t = 1; t < frameCount; t++) {
    const row = t * binCount;
    let sum = 0;
    for (let k = 0; k < binCount; k++) {
      const d = data[row + k]! - filtered[k]!;
      if (d > 0) sum += d;
    }
    novelty[t] = sum;
    for (let k = 0; k < binCount; k++) prev[k] = data[row + k]!;
    const next = maxFilterFrame(prev, maxFilterBins);
    for (let k = 0; k < binCount; k++) filtered[k] = next[k]!;
  }
  return novelty;
}

/**
 * Plain (half-wave-rectified) spectral flux, no maximum filter. Exposed so
 * a test can show SuperFlux firing less on vibrato than this does.
 */
export function spectralFluxNovelty(tf: TimeFrequencyData): Float64Array {
  return superfluxNovelty(tf, 1);
}

function framesFor(seconds: number, hopLength: number, sampleRate: number): number {
  return Math.max(0, Math.round((seconds * sampleRate) / hopLength));
}

function peakPick(
  novelty: Float64Array,
  frameTimes: Float64Array,
  opts: Required<OnsetOptions>,
): OnsetEvent[] {
  const { hopLength, sampleRate, delta, preMax, postMax, preAvg, postAvg, combine } = opts;
  const preMaxF = Math.max(1, framesFor(preMax, hopLength, sampleRate));
  const postMaxF = Math.max(1, framesFor(postMax, hopLength, sampleRate));
  const preAvgF = framesFor(preAvg, hopLength, sampleRate);
  const postAvgF = framesFor(postAvg, hopLength, sampleRate);
  const n = novelty.length;
  const picked: OnsetEvent[] = [];

  for (let t = 0; t < n; t++) {
    const v = novelty[t]!;
    if (v < delta) continue;

    let isMax = true;
    const maxLo = Math.max(0, t - preMaxF);
    const maxHi = Math.min(n - 1, t + postMaxF);
    for (let j = maxLo; j <= maxHi; j++) {
      if (j !== t && novelty[j]! > v) { isMax = false; break; }
    }
    if (!isMax) continue;

    let mean = 0;
    let count = 0;
    const avgLo = Math.max(0, t - preAvgF);
    const avgHi = Math.min(n - 1, t + postAvgF);
    for (let j = avgLo; j <= avgHi; j++) {
      mean += novelty[j]!;
      count++;
    }
    mean = count > 0 ? mean / count : 0;
    if (v < mean + delta) continue;

    picked.push({ time: frameTimes[t]!, strength: v });
  }

  if (combine <= 0 || picked.length < 2) return picked;

  const merged: OnsetEvent[] = [];
  for (const event of picked) {
    const last = merged[merged.length - 1];
    if (last && event.time - last.time < combine) {
      if (event.strength > last.strength) merged[merged.length - 1] = event;
    } else {
      merged.push(event);
    }
  }
  return merged;
}

function logMelSpectrogram(
  samples: ArrayLike<number>,
  opts: Required<OnsetOptions>,
): TimeFrequencyData {
  const spec = stft(samples, {
    sampleRate: opts.sampleRate,
    nFft: opts.nFft,
    hopLength: opts.hopLength,
    power: 2,
  });
  const fb = melFilterbank({
    sampleRate: opts.sampleRate,
    nFft: opts.nFft,
    nMels: opts.nMels,
    fmin: opts.fmin,
    fmax: opts.fmax,
  });

  const data = new Float64Array(spec.frameCount * fb.nMels);
  const scratch = new Float64Array(spec.binCount);
  for (let t = 0; t < spec.frameCount; t++) {
    const src = t * spec.binCount;
    for (let k = 0; k < spec.binCount; k++) scratch[k] = spec.data[src + k]!;
    const bands = applyFilterbank(fb, scratch);
    data.set(bands, t * fb.nMels);
  }

  const logData = powerToDb(data);
  return {
    frameCount: spec.frameCount,
    binCount: fb.nMels,
    data: logData,
    frameTimes: spec.frameTimes,
    // powerToDb has already run: these cells are decibels, and a consumer that
    // converts them again gets a plausible-looking picture of nothing.
    scale: "db",
  };
}

function normalisePeak(values: Float64Array): Float64Array {
  let peak = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i]! > peak) peak = values[i]!;
  }
  if (!(peak > 0)) return values;
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = values[i]! / peak;
  return out;
}

/**
 * Detect onsets in a rendered take. Builds a log-mel spectrogram, runs
 * SuperFlux, peak-picks, and returns times in seconds plus the caveat.
 */
export function detectOnsets(
  samples: ArrayLike<number>,
  options: OnsetOptions,
): OnsetResult {
  const opts = resolveOnsetOptions(options);
  const tf = logMelSpectrogram(samples, opts);
  const raw = superfluxNovelty(tf, opts.maxFilterBins);
  const novelty = normalisePeak(raw);
  const onsets = peakPick(novelty, tf.frameTimes, opts);
  return {
    onsets,
    novelty,
    frameTimes: tf.frameTimes,
    caveat: ONSET_DETECTOR_CAVEAT,
    params: opts,
  };
}

function matchOnsets(
  detected: number[],
  reference: number[],
  toleranceSec: number,
): { matched: number; falsePositives: number; falseNegatives: number } {
  const det = detected.slice().sort((a, b) => a - b);
  const ref = reference.slice().sort((a, b) => a - b);
  const used = new Array(det.length).fill(false);
  let matched = 0;

  for (const r of ref) {
    let best = -1;
    let bestAbs = Infinity;
    for (let i = 0; i < det.length; i++) {
      if (used[i]) continue;
      const d = Math.abs(det[i]! - r);
      if (d <= toleranceSec && d < bestAbs) {
        bestAbs = d;
        best = i;
      }
    }
    if (best >= 0) {
      used[best] = true;
      matched++;
    }
  }

  return {
    matched,
    falsePositives: det.length - matched,
    falseNegatives: ref.length - matched,
  };
}

function f1Of(precision: number, recall: number): number {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

/**
 * Score detected onset times against a reference list at one or more
 * tolerances. Always pass both {@link HOUSE_TOLERANCE_MS} and
 * {@link MIR_EVAL_TOLERANCE_MS} so the two figures travel together.
 */
export function scoreOnsets(
  detected: number[],
  reference: number[],
  tolerancesMs: number[] = [HOUSE_TOLERANCE_MS, MIR_EVAL_TOLERANCE_MS],
): OnsetScore[] {
  return tolerancesMs.map((toleranceMs) => {
    if (!(toleranceMs >= 0)) {
      throw new Error(`toleranceMs must be non-negative, got ${toleranceMs}.`);
    }
    const { matched, falsePositives, falseNegatives } =
      matchOnsets(detected, reference, toleranceMs / 1000);
    const precision = detected.length === 0 ? 0 : matched / detected.length;
    const recall = reference.length === 0 ? 0 : matched / reference.length;
    return {
      toleranceMs,
      precision,
      recall,
      f1: f1Of(precision, recall),
      matched,
      falsePositives,
      falseNegatives,
    };
  });
}
