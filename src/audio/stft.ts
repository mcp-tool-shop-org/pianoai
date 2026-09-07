// ─── ai-jam-sessions: Short-Time Fourier Transform ───────────────────────────
//
// Framing, padding and the STFT itself, matching librosa 0.11's conventions so
// that golden fixtures generated from librosa are a meaningful check.
//
// THE CONVENTIONS THAT MATTER, all of which are silent errors if wrong:
//
//   • center=true pads the signal by n_fft/2 on both sides using REFLECT mode,
//     so frame t is centred on sample t·hop rather than starting there. Without
//     it every reported onset time is early by half a window, which at
//     n_fft=2048 and 44.1 kHz is 23 ms — over half of this repo's 40 ms
//     timing gate, from a padding flag.
//   • The window is periodic, not symmetric. See window.ts.
//   • Frame count with centring is 1 + floor(samples / hop), which is what
//     librosa produces and what the time axis is derived from.
//
// Usage:
//   const spec = stft(samples, { sampleRate: 44100, nFft: 2048, hopLength: 512 });
//   spec.frameTimes[t]  // centre of frame t, in seconds
// ─────────────────────────────────────────────────────────────────────────────

import { Fft } from "./fft.js";
import { window as makeWindow, type WindowName } from "./window.js";

/** Parameters for {@link stft} and {@link frameSignal}. */
export interface StftOptions {
  sampleRate: number;
  /** Transform size. Must be a power of two. Defaults to 2048. */
  nFft?: number;
  /**
   * Samples between successive frames. Defaults to nFft / 4, which is librosa's
   * default. The study's recommended music setting is 512 at 44.1 kHz, giving
   * an 11.6 ms hop (findings 11, 16).
   */
  hopLength?: number;
  /** Window length. Defaults to nFft. Must not exceed it. */
  winLength?: number;
  /** Window function. Defaults to `hann`. */
  windowName?: WindowName;
  /**
   * Pad by nFft/2 on both sides so frames are centred on their timestamps.
   * Defaults to true, matching librosa.
   */
  center?: boolean;
}

/** A computed spectrogram, stored row-major as `frameCount × binCount`. */
export interface Spectrogram {
  /** Number of time frames. */
  frameCount: number;
  /** Number of frequency bins per frame: nFft / 2 + 1. */
  binCount: number;
  /**
   * Flat `frameCount * binCount` matrix, row-major: frame t bin k is at
   * `t * binCount + k`.
   */
  data: Float64Array;
  /** Centre time in seconds of each frame. */
  frameTimes: Float64Array;
  /** The resolved parameters, for stamping into a render sidecar. */
  params: Required<StftOptions>;
}

/**
 * Reflect-pad a signal by `pad` samples on each side.
 *
 * Matches numpy's `mode="reflect"`, which mirrors WITHOUT repeating the edge
 * sample: [a,b,c,d,e] padded by 2 becomes [c,b,a,b,c,d,e,d,c].
 */
export function reflectPad(
  samples: ArrayLike<number>,
  pad: number,
): Float64Array {
  const n = samples.length;
  if (pad === 0) {
    const copy = new Float64Array(n);
    for (let i = 0; i < n; i++) copy[i] = samples[i]!;
    return copy;
  }
  if (pad < 0) {
    throw new Error(`Pad width must be non-negative, got ${pad}.`);
  }
  if (n < 2) {
    throw new Error(
      `Cannot reflect-pad a signal of ${n} sample(s); need at least 2.`,
    );
  }
  if (pad >= n) {
    throw new Error(
      `Cannot reflect-pad by ${pad} samples: the signal is only ${n} long, ` +
      `and reflect mode needs pad < length. Use a smaller n_fft or a longer clip.`,
    );
  }

  const out = new Float64Array(n + 2 * pad);
  for (let i = 0; i < pad; i++) out[i] = samples[pad - i]!;
  for (let i = 0; i < n; i++) out[pad + i] = samples[i]!;
  for (let k = 0; k < pad; k++) out[pad + n + k] = samples[n - 2 - k]!;
  return out;
}

/** Resolve defaults and validate, shared by {@link frameSignal} and {@link stft}. */
function resolveOptions(options: StftOptions): Required<StftOptions> {
  const {
    sampleRate,
    nFft = 2048,
    hopLength = Math.floor(nFft / 4),
    winLength = nFft,
    windowName = "hann",
    center = true,
  } = options;

  if (!(sampleRate > 0)) {
    throw new Error(`sampleRate must be positive, got ${sampleRate}.`);
  }
  if (!Number.isInteger(hopLength) || hopLength < 1) {
    throw new Error(`hopLength must be a positive integer, got ${hopLength}.`);
  }
  if (winLength > nFft) {
    throw new Error(
      `winLength ${winLength} cannot exceed nFft ${nFft}. ` +
      `Increase nFft or shorten the window.`,
    );
  }
  return { sampleRate, nFft, hopLength, winLength, windowName, center };
}

/**
 * Number of frames {@link stft} will produce for a signal of `sampleCount`
 * samples. Exposed so callers can size a render before doing the work.
 */
export function frameCountFor(
  sampleCount: number,
  hopLength: number,
  nFft: number,
  center = true,
): number {
  if (center) return 1 + Math.floor(sampleCount / hopLength);
  return sampleCount >= nFft
    ? 1 + Math.floor((sampleCount - nFft) / hopLength)
    : 0;
}

/**
 * Split a signal into overlapping windowed frames.
 *
 * Returns a flat `frameCount × winLength` matrix, row-major, with the window
 * already applied. Separated from {@link stft} so onset and pitch code can
 * reuse the exact same framing rather than re-deriving it.
 */
export function frameSignal(
  samples: ArrayLike<number>,
  options: StftOptions,
): { frames: Float64Array; frameCount: number; frameLength: number } {
  const opts = resolveOptions(options);
  const { nFft, hopLength, winLength, windowName, center } = opts;

  const padded = center ? reflectPad(samples, Math.floor(nFft / 2)) : samples;
  const frameCount = frameCountFor(samples.length, hopLength, nFft, center);
  const win = makeWindow(windowName, winLength);

  // A centred window shorter than nFft sits in the middle of the frame, which
  // is what librosa does when win_length < n_fft.
  const offset = Math.floor((nFft - winLength) / 2);

  const frames = new Float64Array(frameCount * winLength);
  for (let t = 0; t < frameCount; t++) {
    const start = t * hopLength + offset;
    const row = t * winLength;
    for (let i = 0; i < winLength; i++) {
      const idx = start + i;
      const s = idx < padded.length ? padded[idx]! : 0;
      frames[row + i] = s * win[i]!;
    }
  }

  return { frames, frameCount, frameLength: winLength };
}

/**
 * Compute a magnitude or power spectrogram.
 *
 * `power` selects what the cells hold: 1 for magnitude, 2 for power (magnitude
 * squared). librosa's `melspectrogram` uses power=2, and the mel filterbank in
 * this repo expects that, so 2 is the default.
 */
export function stft(
  samples: ArrayLike<number>,
  options: StftOptions & { power?: 1 | 2 },
): Spectrogram {
  const opts = resolveOptions(options);
  const power = options.power ?? 2;
  const { nFft, hopLength, sampleRate } = opts;

  const { frames, frameCount, frameLength } = frameSignal(samples, opts);
  const fft = new Fft(nFft);
  const binCount = fft.binCount;

  const data = new Float64Array(frameCount * binCount);
  const scratch = new Float64Array(nFft);

  for (let t = 0; t < frameCount; t++) {
    scratch.fill(0);
    const row = t * frameLength;
    for (let i = 0; i < frameLength; i++) scratch[i] = frames[row + i]!;

    const spectrum = power === 2 ? fft.power(scratch) : fft.magnitude(scratch);
    data.set(spectrum, t * binCount);
  }

  const frameTimes = new Float64Array(frameCount);
  for (let t = 0; t < frameCount; t++) {
    frameTimes[t] = (t * hopLength) / sampleRate;
  }

  return { frameCount, binCount, data, frameTimes, params: opts };
}
