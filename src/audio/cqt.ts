// ─── ai-jam-sessions: Constant-Q Transform ───────────────────────────────────
//
// True per-bin CQT kernels, Brown & Puckette 1992, stored sparse in the
// frequency domain. A pseudo-CQT binned from one long STFT will not do: at C3
// a 20-cent bin is about 1.5 Hz, which no practical FFT bin resolves.
//
// THE Q-FACTOR THAT DRIVES THE DESIGN. At 60 bins per octave,
// Q = 1 / (2^(1/60) − 1) ≈ 86.1, so the C1 kernel (32.7 Hz, 44.1 kHz) is
// ≈ 116,000 samples, 2.63 seconds of context. The lock pages the render at
// about 6 seconds, which means the bottom octave is smeared across nearly
// half a page. That is a LEGIBILITY problem, not a gate problem: the pitch
// gate is the f0 tracker and onsets are SuperFlux on mel. Recursive octave
// downsampling (Schörkhuber & Klapuri 2010) would shrink the work; this
// module does not take that complexity. Direct sparse kernels at whatever
// fmin the caller passes, documented smearing, recommendation in the
// chunk-2 handoff.
//
// KERNEL STORAGE. Each kernel is a windowed complex exponential, FFT'd,
// thresholded, conjugated and scaled. We store indices plus values, not 420
// full time-domain arrays — that is the entire point of Brown & Puckette.
// The threshold is KERNEL_SPARSITY, a named constant, because it trades
// sparsity against kernel accuracy and someone will want to tune it.
//
// Windows are the repo's periodic Hann, not Brown's Hamming, so a CQT frame
// and an STFT frame of the same length are comparable. Pad-centre the
// time-domain kernel inside the FFT buffer, matching the STFT convention.
//
// Usage:
//   const spec = cqt(samples, { sampleRate: 44100 });
//   binToMidi(midiToBin(69, opts), opts) === 69
// ─────────────────────────────────────────────────────────────────────────────

import { Fft, isPowerOfTwo } from "./fft.js";
import { hann } from "./window.js";
import type { TimeFrequencyData } from "./stft.js";

/**
 * MIDI note 24, C1, in Hz. Default `fmin`. Computed from A4 = 440 rather
 * than hard-coded as 32.7, so bin 0 is exactly C1 on the same axis the
 * piano roll uses.
 */
export const C1_HZ = 440 * Math.pow(2, (24 - 69) / 12);

/**
 * Drop spectral-kernel coefficients whose magnitude is below this fraction
 * of that kernel's peak.
 *
 * 0.01 is the same number librosa exposes as `sparsity=0.01`, used here as
 * a peak-relative cutoff rather than librosa's L1-mass quantile: simpler to
 * audit, and close in spirit to Blankertz's absolute 0.0054 Hamming-sidelobe
 * threshold, which does not transfer to a Hann kernel. Raising this makes
 * kernels sparser and slightly less accurate; lowering it keeps more of the
 * sidelobes. Tune HERE, not per call, so a render sidecar stamped from
 * `cqtKernels().params` stays comparable across runs.
 */
export const KERNEL_SPARSITY = 0.01;

/** Parameters for {@link cqtKernels} and {@link cqt}. */
export interface CqtOptions {
  sampleRate: number;
  /** Lowest bin centre in Hz. Defaults to {@link C1_HZ}. */
  fmin?: number;
  /** Bins per octave. Defaults to 60 (20 cents). */
  binsPerOctave?: number;
  /** Number of octaves above `fmin`. Defaults to 7 (C1–C8). */
  octaves?: number;
  /**
   * Samples between successive frames. Defaults to 512. Explicit, not an
   * implicit function of sampleRate: an automatic 480-at-48 kHz switch is
   * the kind of hidden behaviour that makes two runs disagree for reasons
   * nobody can see in the call.
   */
  hopLength?: number;
}

/** Resolved CQT parameters, including derived kernel metadata. */
export interface CqtParams extends Required<CqtOptions> {
  fftLength: number;
  q: number;
  sparsity: number;
  binCount: number;
}

/**
 * Sparse frequency-domain CQT kernels. CSR-style: bin `k` occupies
 * `offsets[k] .. offsets[k+1]` in `fftBins` / `real` / `imag`.
 */
export interface CqtKernels {
  binCount: number;
  fftLength: number;
  q: number;
  /** Centre frequency in Hz of each bin. */
  frequencies: Float64Array;
  /** Time-domain kernel length N_k of each bin, in samples. */
  lengths: Float64Array;
  /** Start index of each bin's coefficients; length `binCount + 1`. */
  offsets: Uint32Array;
  /** FFT-bin indices of the kept coefficients. */
  fftBins: Uint32Array;
  real: Float64Array;
  imag: Float64Array;
  nonzeroCount: number;
  params: CqtParams;
}

/** A computed CQT spectrogram. `binCount` is `binsPerOctave * octaves`. */
export interface CqtSpectrogram extends TimeFrequencyData {
  params: Required<CqtOptions>;
  /** Centre frequency in Hz of each bin, matching {@link CqtKernels.frequencies}. */
  frequencies: Float64Array;
}

/** Q-factor for a given bins-per-octave: 1 / (2^(1/B) − 1). */
export function qFactor(binsPerOctave: number): number {
  if (!(binsPerOctave > 0)) {
    throw new Error(`binsPerOctave must be positive, got ${binsPerOctave}.`);
  }
  return 1 / (Math.pow(2, 1 / binsPerOctave) - 1);
}

function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  const p = 2 ** Math.ceil(Math.log2(n));
  if (!isPowerOfTwo(p)) {
    throw new Error(`Failed to round ${n} up to a power of two (got ${p}).`);
  }
  return p;
}

function resolveOptions(options: CqtOptions): Required<CqtOptions> {
  const {
    sampleRate,
    fmin = C1_HZ,
    binsPerOctave = 60,
    octaves = 7,
    hopLength = 512,
  } = options;

  if (!(sampleRate > 0)) {
    throw new Error(`sampleRate must be positive, got ${sampleRate}.`);
  }
  if (!(fmin > 0)) {
    throw new Error(`fmin must be positive, got ${fmin}.`);
  }
  if (!Number.isInteger(binsPerOctave) || binsPerOctave < 1) {
    throw new Error(`binsPerOctave must be a positive integer, got ${binsPerOctave}.`);
  }
  if (!Number.isInteger(octaves) || octaves < 1) {
    throw new Error(`octaves must be a positive integer, got ${octaves}.`);
  }
  if (!Number.isInteger(hopLength) || hopLength < 1) {
    throw new Error(`hopLength must be a positive integer, got ${hopLength}.`);
  }

  const nyquist = sampleRate / 2;
  const fmax = fmin * Math.pow(2, octaves);
  if (fmax > nyquist) {
    throw new Error(
      `Top CQT bin is ${fmax.toFixed(1)} Hz, which exceeds Nyquist ` +
      `(${nyquist} Hz) at sampleRate ${sampleRate}. Lower octaves or fmin, ` +
      `or resample.`,
    );
  }

  return { sampleRate, fmin, binsPerOctave, octaves, hopLength };
}

/**
 * MIDI number of a CQT bin, fractional. Bin 0 is `fmin`; 60 bins per
 * octave means 5 bins per semitone, so 50 cents is 2.5 bins.
 */
export function binToMidi(bin: number, options: CqtOptions): number {
  const { fmin, binsPerOctave } = resolveOptions(options);
  const hz = fmin * Math.pow(2, bin / binsPerOctave);
  return 69 + 12 * Math.log2(hz / 440);
}

/**
 * CQT bin (fractional) of a MIDI number. Inverse of {@link binToMidi}.
 */
export function midiToBin(midi: number, options: CqtOptions): number {
  const { fmin, binsPerOctave } = resolveOptions(options);
  const hz = 440 * Math.pow(2, (midi - 69) / 12);
  return binsPerOctave * Math.log2(hz / fmin);
}

/** Centre frequency in Hz of every CQT bin. */
export function cqtBinFrequencies(options: CqtOptions): Float64Array {
  const opts = resolveOptions(options);
  const binCount = opts.binsPerOctave * opts.octaves;
  const out = new Float64Array(binCount);
  for (let k = 0; k < binCount; k++) {
    out[k] = opts.fmin * Math.pow(2, k / opts.binsPerOctave);
  }
  return out;
}

/**
 * Build sparse frequency-domain CQT kernels for the given options.
 *
 * Expensive relative to applying them: each bin is an FFT of the longest
 * kernel. Build once, reuse across clips that share a sample rate.
 */
export function cqtKernels(options: CqtOptions): CqtKernels {
  const opts = resolveOptions(options);
  const { sampleRate, fmin, binsPerOctave, octaves } = opts;
  const q = qFactor(binsPerOctave);
  const binCount = binsPerOctave * octaves;

  const frequencies = new Float64Array(binCount);
  const lengths = new Float64Array(binCount);
  for (let k = 0; k < binCount; k++) {
    const fk = fmin * Math.pow(2, k / binsPerOctave);
    frequencies[k] = fk;
    lengths[k] = Math.ceil((q * sampleRate) / fk);
  }

  const maxLen = lengths[0]!;
  const fftLength = nextPowerOfTwo(maxLen);
  const fft = new Fft(fftLength);

  const offsets = new Uint32Array(binCount + 1);
  const binIndices: number[][] = [];
  const binReal: number[][] = [];
  const binImag: number[][] = [];
  let nonzero = 0;

  const re = new Float64Array(fftLength);
  const im = new Float64Array(fftLength);

  for (let k = 0; k < binCount; k++) {
    const len = lengths[k]!;
    const win = hann(len);
    const offset = Math.floor((fftLength - len) / 2);

    re.fill(0);
    im.fill(0);
    for (let n = 0; n < len; n++) {
      // T[n] = (w[n] / N_k) · exp(2π i Q n / N_k). Brown & Puckette 1992
      // via Blankertz's reconstruction of the spectral-kernel method.
      const angle = (2 * Math.PI * q * n) / len;
      const scale = win[n]! / len;
      re[offset + n] = scale * Math.cos(angle);
      im[offset + n] = scale * Math.sin(angle);
    }

    fft.transform(re, im);

    let peak = 0;
    for (let i = 0; i < fftLength; i++) {
      const mag = Math.hypot(re[i]!, im[i]!);
      if (mag > peak) peak = mag;
    }
    const thresh = KERNEL_SPARSITY * peak;

    const idxs: number[] = [];
    const rvals: number[] = [];
    const ivals: number[] = [];
    const invN = 1 / fftLength;
    for (let i = 0; i < fftLength; i++) {
      const mag = Math.hypot(re[i]!, im[i]!);
      if (mag <= thresh) continue;
      // Store conj(S) / N so applying is a straight complex multiply-accumulate
      // against the frame FFT (Blankertz eq. 10).
      idxs.push(i);
      rvals.push(re[i]! * invN);
      ivals.push(-im[i]! * invN);
    }
    binIndices.push(idxs);
    binReal.push(rvals);
    binImag.push(ivals);
    nonzero += idxs.length;
    offsets[k + 1] = nonzero;
  }

  const fftBins = new Uint32Array(nonzero);
  const real = new Float64Array(nonzero);
  const imag = new Float64Array(nonzero);
  let cursor = 0;
  for (let k = 0; k < binCount; k++) {
    const idxs = binIndices[k]!;
    const rvals = binReal[k]!;
    const ivals = binImag[k]!;
    for (let j = 0; j < idxs.length; j++) {
      fftBins[cursor] = idxs[j]!;
      real[cursor] = rvals[j]!;
      imag[cursor] = ivals[j]!;
      cursor++;
    }
  }

  return {
    binCount,
    fftLength,
    q,
    frequencies,
    lengths,
    offsets,
    fftBins,
    real,
    imag,
    nonzeroCount: nonzero,
    params: {
      ...opts,
      fftLength,
      q,
      sparsity: KERNEL_SPARSITY,
      binCount,
    },
  };
}

/**
 * Constant-Q magnitude spectrogram.
 *
 * Frame t is centred on sample `t · hopLength`, matching {@link stft}. Edge
 * frames zero-pad rather than reflect, because a C1 kernel is longer than a
 * typical clip's reflect-pad budget (`reflectPad` requires pad < length).
 * librosa.cqt defaults to the same `pad_mode='constant'`.
 */
export function cqt(
  samples: ArrayLike<number>,
  options: CqtOptions,
  kernels?: CqtKernels,
): CqtSpectrogram {
  const resolved = resolveOptions(options);
  const kset = kernels ?? cqtKernels(resolved);
  const { hopLength, sampleRate } = resolved;
  const { fftLength, binCount, frequencies } = kset;

  if (kernels) {
    if (
      resolved.sampleRate !== kset.params.sampleRate ||
      resolved.fmin !== kset.params.fmin ||
      resolved.binsPerOctave !== kset.params.binsPerOctave ||
      resolved.octaves !== kset.params.octaves
    ) {
      throw new Error(
        `cqt() was given kernels built for sampleRate=${kset.params.sampleRate}, ` +
        `fmin=${kset.params.fmin}, binsPerOctave=${kset.params.binsPerOctave}, ` +
        `octaves=${kset.params.octaves}, but the call asked for ` +
        `sampleRate=${resolved.sampleRate}, fmin=${resolved.fmin}, ` +
        `binsPerOctave=${resolved.binsPerOctave}, octaves=${resolved.octaves}. ` +
        `Rebuild the kernels, or omit them.`,
      );
    }
  }

  const n = samples.length;
  const frameCount = 1 + Math.floor(n / hopLength);
  const fft = new Fft(fftLength);
  const re = new Float64Array(fftLength);
  const im = new Float64Array(fftLength);
  const half = Math.floor(fftLength / 2);

  const data = new Float64Array(frameCount * binCount);
  const frameTimes = new Float64Array(frameCount);

  for (let t = 0; t < frameCount; t++) {
    const centre = t * hopLength;
    frameTimes[t] = centre / sampleRate;
    const start = centre - half;

    re.fill(0);
    im.fill(0);
    for (let i = 0; i < fftLength; i++) {
      const idx = start + i;
      re[i] = idx >= 0 && idx < n ? samples[idx]! : 0;
    }

    fft.transform(re, im);

    for (let b = 0; b < binCount; b++) {
      const begin = kset.offsets[b]!;
      const end = kset.offsets[b + 1]!;
      let sumRe = 0;
      let sumIm = 0;
      for (let p = begin; p < end; p++) {
        const fi = kset.fftBins[p]!;
        const xr = re[fi]!;
        const xi = im[fi]!;
        const kr = kset.real[p]!;
        const ki = kset.imag[p]!;
        sumRe += xr * kr - xi * ki;
        sumIm += xr * ki + xi * kr;
      }
      data[t * binCount + b] = Math.hypot(sumRe, sumIm);
    }
  }

  return {
    frameCount,
    binCount,
    data,
    frameTimes,
    params: resolved,
    frequencies,
  };
}
