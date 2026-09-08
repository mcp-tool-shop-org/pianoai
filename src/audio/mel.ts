// ─── ai-jam-sessions: Mel Scale and Filterbank ───────────────────────────────
//
// The mel scale in both conventions, and the triangular filterbank that maps an
// FFT power spectrum onto mel bands.
//
// TWO CONVENTIONS, PINNED ON PURPOSE. librosa defaults to Slaney mel with
// Slaney normalisation; torchaudio defaults to HTK mel with no normalisation
// (study finding 43). They disagree, the disagreement is a filed bug class
// (finding 44), and neither is "the" mel scale. So this module takes both as
// explicit parameters with no ambient default beyond librosa's, and callers
// that expose mel through a tool schema MUST surface `melScale` and `norm`
// rather than hiding them. A spectrogram labelled only "mel" is not
// reproducible.
//
// WHAT MEL CANNOT DO. Slaney mel is LINEAR below 1 kHz, at 200/3 ≈ 66.67 Hz per
// step. A 50-cent error at C4 is 7.7 Hz, about one ninth of a single filter's
// spacing, so it is invisible here by construction (study finding 17). That is
// why mel is the secondary panel in this repo and never the pitch gate. Mel is
// for onsets, timbre and legibility to audio models trained on it; cents come
// from a pitch tracker over a constant-Q or raw spectrum.
//
// Usage:
//   const fb = melFilterbank({ sampleRate: 44100, nFft: 2048, nMels: 229 });
//   const bands = applyFilterbank(fb, powerSpectrum);
// ─────────────────────────────────────────────────────────────────────────────

import { fftFrequencies } from "./fft.js";

/** Which mel formula to use. `slaney` matches librosa; `htk` matches torchaudio. */
export type MelScale = "slaney" | "htk";

/** Filterbank normalisation. `slaney` matches librosa's default; `null` matches torchaudio's. */
export type MelNorm = "slaney" | null;

// Slaney-scale breakpoints. Below 1 kHz the scale is linear at f_sp Hz per mel
// step; above it, logarithmic. These exact constants are what librosa uses.
const F_MIN = 0.0;
const F_SP = 200.0 / 3.0;              // 66.666… Hz per mel below the break
const MIN_LOG_HZ = 1000.0;             // the linear/log breakpoint
const MIN_LOG_MEL = (MIN_LOG_HZ - F_MIN) / F_SP;   // exactly 15.0
const LOG_STEP = Math.log(6.4) / 27.0; // mel step size in the log region

/** Convert a frequency in Hz to mels. */
export function hzToMel(hz: number, scale: MelScale = "slaney"): number {
  if (scale === "htk") {
    return 2595.0 * Math.log10(1.0 + hz / 700.0);
  }
  if (hz >= MIN_LOG_HZ) {
    return MIN_LOG_MEL + Math.log(hz / MIN_LOG_HZ) / LOG_STEP;
  }
  return (hz - F_MIN) / F_SP;
}

/** Convert mels back to a frequency in Hz. Inverse of {@link hzToMel}. */
export function melToHz(mel: number, scale: MelScale = "slaney"): number {
  if (scale === "htk") {
    return 700.0 * (Math.pow(10.0, mel / 2595.0) - 1.0);
  }
  if (mel >= MIN_LOG_MEL) {
    return MIN_LOG_HZ * Math.exp(LOG_STEP * (mel - MIN_LOG_MEL));
  }
  return F_MIN + F_SP * mel;
}

/**
 * `count` frequencies in Hz, spaced evenly on the mel scale between `fmin` and
 * `fmax` inclusive. Equivalent to `librosa.mel_frequencies`.
 */
export function melFrequencies(
  count: number,
  fmin: number,
  fmax: number,
  scale: MelScale = "slaney",
): Float64Array {
  if (!Number.isInteger(count) || count < 2) {
    throw new Error(`Need at least 2 mel frequencies, got ${count}.`);
  }
  const minMel = hzToMel(fmin, scale);
  const maxMel = hzToMel(fmax, scale);
  const out = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = melToHz(minMel + ((maxMel - minMel) * i) / (count - 1), scale);
  }
  return out;
}

/** Parameters for {@link melFilterbank}. */
export interface MelFilterbankOptions {
  sampleRate: number;
  nFft: number;
  /** Number of mel bands. The study recommends 229 for music (finding 15). */
  nMels?: number;
  /** Lowest frequency in Hz. Defaults to 0. */
  fmin?: number;
  /** Highest frequency in Hz. Defaults to Nyquist. */
  fmax?: number;
  /** Mel formula. Defaults to `slaney` (librosa). */
  melScale?: MelScale;
  /** Filter normalisation. Defaults to `slaney` (librosa). */
  norm?: MelNorm;
}

/** A triangular mel filterbank, stored row-major as `nMels × binCount`. */
export interface MelFilterbank {
  /** Number of mel bands (rows). */
  nMels: number;
  /** Number of FFT bins per row: nFft / 2 + 1. */
  binCount: number;
  /** Flat `nMels * binCount` weight matrix, row-major. */
  weights: Float64Array;
  /** Centre frequency in Hz of each mel band. */
  centerFrequencies: Float64Array;
  /** The resolved parameters, for stamping into a render sidecar. */
  params: Required<Omit<MelFilterbankOptions, "norm">> & { norm: MelNorm };
}

/**
 * Build a triangular mel filterbank.
 *
 * Equivalent to `librosa.filters.mel`. Each of the `nMels` rows is a triangle
 * spanning three consecutive mel-spaced frequencies, rising from the first to
 * the second and falling to the third.
 */
export function melFilterbank(options: MelFilterbankOptions): MelFilterbank {
  const {
    sampleRate,
    nFft,
    nMels = 229,
    fmin = 0.0,
    fmax = sampleRate / 2,
    melScale = "slaney",
    norm = "slaney",
  } = options;

  if (!(sampleRate > 0)) {
    throw new Error(`sampleRate must be positive, got ${sampleRate}.`);
  }
  if (!Number.isInteger(nMels) || nMels < 1) {
    throw new Error(`nMels must be a positive integer, got ${nMels}.`);
  }
  if (!(fmax > fmin)) {
    throw new Error(`fmax (${fmax}) must be greater than fmin (${fmin}).`);
  }
  if (fmax > sampleRate / 2) {
    throw new Error(
      `fmax ${fmax} Hz exceeds Nyquist (${sampleRate / 2} Hz) for a ` +
      `${sampleRate} Hz signal. Lower fmax or resample.`,
    );
  }

  const binCount = nFft / 2 + 1;
  const binFreqs = fftFrequencies(sampleRate, nFft);

  // nMels + 2 edges: each band uses a sliding window of three.
  const edges = melFrequencies(nMels + 2, fmin, fmax, melScale);

  const weights = new Float64Array(nMels * binCount);
  const centers = new Float64Array(nMels);

  for (let m = 0; m < nMels; m++) {
    const lowerEdge = edges[m]!;
    const center = edges[m + 1]!;
    const upperEdge = edges[m + 2]!;
    centers[m] = center;

    const lowerSpan = center - lowerEdge;
    const upperSpan = upperEdge - center;
    const row = m * binCount;

    for (let k = 0; k < binCount; k++) {
      const f = binFreqs[k]!;
      // Rising edge, then falling edge; the band is their minimum, floored at 0.
      const rising = lowerSpan > 0 ? (f - lowerEdge) / lowerSpan : 0;
      const falling = upperSpan > 0 ? (upperEdge - f) / upperSpan : 0;
      const w = Math.min(rising, falling);
      weights[row + k] = w > 0 ? w : 0;
    }

    if (norm === "slaney") {
      // Normalise so each band integrates to a constant rather than growing
      // with bandwidth. librosa: enorm = 2 / (edges[m+2] - edges[m]).
      const enorm = 2.0 / (upperEdge - lowerEdge);
      for (let k = 0; k < binCount; k++) {
        weights[row + k] = weights[row + k]! * enorm;
      }
    }
  }

  return {
    nMels,
    binCount,
    weights,
    centerFrequencies: centers,
    params: { sampleRate, nFft, nMels, fmin, fmax, melScale, norm },
  };
}

/**
 * Apply a filterbank to one power spectrum, producing one mel band vector.
 *
 * The spectrum must have exactly `filterbank.binCount` entries.
 */
export function applyFilterbank(
  filterbank: MelFilterbank,
  spectrum: ArrayLike<number>,
): Float64Array {
  const { nMels, binCount, weights } = filterbank;
  if (spectrum.length !== binCount) {
    throw new Error(
      `Spectrum has ${spectrum.length} bins but the filterbank expects ` +
      `${binCount}. Was it built for a different n_fft?`,
    );
  }
  const out = new Float64Array(nMels);
  for (let m = 0; m < nMels; m++) {
    const row = m * binCount;
    let sum = 0;
    for (let k = 0; k < binCount; k++) {
      const w = weights[row + k]!;
      if (w !== 0) sum += w * spectrum[k]!;
    }
    out[m] = sum;
  }
  return out;
}
