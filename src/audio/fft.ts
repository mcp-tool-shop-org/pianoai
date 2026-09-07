// ─── ai-jam-sessions: FFT ────────────────────────────────────────────────────
//
// A self-contained iterative radix-2 Cooley–Tukey FFT.
//
// WHY NOT A DEPENDENCY. The spectrogram study (docs/spectrogram-surface-study-
// 2026-09.md, finding 41) recommended `fft.js`. We write our own instead, for
// three reasons that matter more than the ~60 lines it costs:
//
//   1. Every n_fft this repo uses is a power of two, which is the only case
//      radix-2 needs to handle. The general-purpose library buys nothing.
//   2. A published MIT package with zero runtime deps is easier to audit than
//      one with a 2021-vintage transitive tree.
//   3. Determinism. Pure JS float64 arithmetic gives bit-identical results on
//      every platform we test on; a WASM build does not guarantee that.
//
// The transform is the standard forward DFT, X[k] = sum_n x[n]·e^(-2πikn/N).
// Twiddle factors and the bit-reversal permutation are precomputed once per
// size, so a 3000-frame spectrogram pays for them once rather than per frame.
//
// Usage:
//   const fft = new Fft(2048);
//   const mag = fft.magnitude(frame);   // Float64Array, length 1025
// ─────────────────────────────────────────────────────────────────────────────

/** True when `n` is a positive power of two (1, 2, 4, 8, …). */
export function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

/**
 * A fixed-size forward FFT.
 *
 * Construct once per transform size and reuse it. Instances are stateless
 * between calls apart from scratch buffers, so a single `Fft` may be reused
 * across every frame of a spectrogram.
 */
export class Fft {
  /** Transform size in samples. Always a power of two. */
  readonly size: number;

  /** Number of unique (non-mirrored) bins: size / 2 + 1. */
  readonly binCount: number;

  private readonly cosTable: Float64Array;
  private readonly sinTable: Float64Array;
  private readonly reverse: Uint32Array;

  // Scratch buffers, reused across calls so per-frame work allocates nothing.
  private readonly re: Float64Array;
  private readonly im: Float64Array;

  constructor(size: number) {
    if (!isPowerOfTwo(size)) {
      throw new Error(
        `FFT size must be a power of two, got ${size}. ` +
        `Use 512, 1024, 2048, or 4096.`,
      );
    }
    this.size = size;
    this.binCount = size / 2 + 1;

    const half = size / 2;
    this.cosTable = new Float64Array(half);
    this.sinTable = new Float64Array(half);
    for (let i = 0; i < half; i++) {
      // Forward transform: e^(-2πi·k/N), so sin carries the negative sign.
      const angle = (-2 * Math.PI * i) / size;
      this.cosTable[i] = Math.cos(angle);
      this.sinTable[i] = Math.sin(angle);
    }

    // Bit-reversal permutation table.
    const bits = Math.log2(size);
    this.reverse = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) {
        r = (r << 1) | ((i >>> b) & 1);
      }
      this.reverse[i] = r;
    }

    this.re = new Float64Array(size);
    this.im = new Float64Array(size);
  }

  /**
   * In-place complex forward FFT. `re` and `im` must both be exactly `size`
   * long. Most callers want {@link magnitude} instead.
   */
  transform(re: Float64Array, im: Float64Array): void {
    const n = this.size;
    if (re.length !== n || im.length !== n) {
      throw new Error(
        `FFT input length mismatch: expected ${n} real and ${n} imaginary ` +
        `samples, got ${re.length} and ${im.length}.`,
      );
    }

    // Bit-reversal permutation.
    for (let i = 0; i < n; i++) {
      const j = this.reverse[i]!;
      if (j > i) {
        const tr = re[i]!; re[i] = re[j]!; re[j] = tr;
        const ti = im[i]!; im[i] = im[j]!; im[j] = ti;
      }
    }

    // Butterflies, doubling the sub-transform length each pass.
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let base = 0; base < n; base += len) {
        for (let k = 0; k < half; k++) {
          const t = k * step;
          const wr = this.cosTable[t]!;
          const wi = this.sinTable[t]!;
          const a = base + k;
          const b = a + half;
          const xr = re[b]! * wr - im[b]! * wi;
          const xi = re[b]! * wi + im[b]! * wr;
          re[b] = re[a]! - xr;
          im[b] = im[a]! - xi;
          re[a] = re[a]! + xr;
          im[a] = im[a]! + xi;
        }
      }
    }
  }

  /**
   * Magnitude spectrum of a real-valued frame.
   *
   * The frame is zero-padded if shorter than the transform size, which is what
   * a win_length < n_fft configuration needs. Returns a fresh Float64Array of
   * length {@link binCount}, covering DC through Nyquist inclusive.
   */
  magnitude(frame: Float64Array | Float32Array | number[]): Float64Array {
    const n = this.size;
    if (frame.length > n) {
      throw new Error(
        `Frame of ${frame.length} samples does not fit an FFT of size ${n}.`,
      );
    }
    const { re, im } = this;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < frame.length; i++) re[i] = frame[i]!;

    this.transform(re, im);

    const out = new Float64Array(this.binCount);
    for (let k = 0; k < this.binCount; k++) {
      out[k] = Math.hypot(re[k]!, im[k]!);
    }
    return out;
  }

  /**
   * Power spectrum (magnitude squared) of a real-valued frame.
   *
   * Squaring here rather than in the caller avoids a needless `sqrt` per bin.
   * librosa's `melspectrogram` uses power=2.0 by default, so this is the
   * normal input to the mel filterbank.
   */
  power(frame: Float64Array | Float32Array | number[]): Float64Array {
    const n = this.size;
    if (frame.length > n) {
      throw new Error(
        `Frame of ${frame.length} samples does not fit an FFT of size ${n}.`,
      );
    }
    const { re, im } = this;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < frame.length; i++) re[i] = frame[i]!;

    this.transform(re, im);

    const out = new Float64Array(this.binCount);
    for (let k = 0; k < this.binCount; k++) {
      out[k] = re[k]! * re[k]! + im[k]! * im[k]!;
    }
    return out;
  }
}

/**
 * Centre frequency in Hz of every FFT bin, DC through Nyquist inclusive.
 *
 * Equivalent to `librosa.fft_frequencies(sr=sampleRate, n_fft=nFft)`.
 */
export function fftFrequencies(sampleRate: number, nFft: number): Float64Array {
  const bins = nFft / 2 + 1;
  const out = new Float64Array(bins);
  for (let k = 0; k < bins; k++) {
    out[k] = (k * sampleRate) / nFft;
  }
  return out;
}
