// ─── ai-jam-sessions: Analysis Windows ───────────────────────────────────────
//
// Window functions for STFT analysis, in the PERIODIC (a.k.a. "fftbins")
// convention that librosa and scipy use by default.
//
// The periodic/symmetric distinction is a real correctness trap, not a detail.
// scipy's `get_window(..., fftbins=True)` — which is what `librosa.stft` calls —
// divides by N, giving a window whose last sample is NOT the mirror of its
// first. The symmetric form divides by N-1 and is meant for filter design, not
// spectral analysis. Getting this wrong shifts every magnitude by a fraction of
// a bin and silently breaks golden-fixture parity with librosa.
//
// Blackman is included only so the Web Audio comparison in the study is
// reproducible. The Web Audio spec mandates a Blackman window on AnalyserNode
// and offers no way to switch it off, which is why the study excluded that node
// from the analysis path (docs/spectrogram-surface-study-2026-09.md, finding
// 42). Nothing in the normal pipeline should reach for it.
//
// Usage:
//   const w = hann(2048);            // periodic, matches librosa
//   const w = window("hann", 2048);  // by name, for schema-driven callers
// ─────────────────────────────────────────────────────────────────────────────

/** Window functions this module can build. */
export type WindowName = "hann" | "hamming" | "blackman" | "rectangular";

function assertLength(length: number): void {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error(`Window length must be a positive integer, got ${length}.`);
  }
}

/**
 * Periodic Hann window: w[i] = 0.5 − 0.5·cos(2πi/N).
 *
 * The default for every STFT in this repo, and what librosa uses.
 */
export function hann(length: number): Float64Array {
  assertLength(length);
  const w = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / length);
  }
  return w;
}

/**
 * Periodic Hamming window: w[i] = 0.54 − 0.46·cos(2πi/N).
 *
 * Used by the Audio Spectrogram Transformer's front end (study finding 14), so
 * it is available for anyone reproducing that recipe.
 */
export function hamming(length: number): Float64Array {
  assertLength(length);
  const w = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / length);
  }
  return w;
}

/**
 * Periodic Blackman window: w[i] = 0.42 − 0.5·cos(2πi/N) + 0.08·cos(4πi/N).
 *
 * Present for parity with Web Audio's AnalyserNode only. Do not use it for
 * analysis — see the header note.
 */
export function blackman(length: number): Float64Array {
  assertLength(length);
  const w = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    const x = (2 * Math.PI * i) / length;
    w[i] = 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
  }
  return w;
}

/** All-ones window. Equivalent to applying no window at all. */
export function rectangular(length: number): Float64Array {
  assertLength(length);
  return new Float64Array(length).fill(1);
}

/**
 * Build a window by name.
 *
 * Callers that take a window from a tool schema should route through here, so
 * an unknown name fails loudly at the boundary rather than silently defaulting.
 */
export function window(name: WindowName, length: number): Float64Array {
  switch (name) {
    case "hann": return hann(length);
    case "hamming": return hamming(length);
    case "blackman": return blackman(length);
    case "rectangular": return rectangular(length);
    default: {
      const exhaustive: never = name;
      throw new Error(
        `Unknown window "${String(exhaustive)}". ` +
        `Expected one of: hann, hamming, blackman, rectangular.`,
      );
    }
  }
}
