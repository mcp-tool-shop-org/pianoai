// ─── ai-jam-sessions: Synthetic Audio Fixtures ───────────────────────────────
//
// Deterministic generators for the analysis-layer tests. There is no golden
// data from librosa yet and this chunk does not run the suite, so later
// chunks need signals whose ground truth is known by construction: a sine at
// a named frequency, a harmonic stack, a click train at named times, a linear
// chirp, and a vibrato note whose rate and depth in cents are parameters.
//
// No file I/O, no unseeded randomness. Every sample is a closed-form function
// of (index, options), so two calls with the same options are bit-identical.
//
// Usage:
//   const a4 = sine({ frequency: 440, duration: 1, sampleRate: 44100 });
//   const clicks = clickTrain({ times: [0.5, 1.0, 1.5], duration: 2, sampleRate: 44100 });
// ─────────────────────────────────────────────────────────────────────────────

function sampleCount(duration: number, sampleRate: number): number {
  if (!(duration > 0)) {
    throw new Error(`duration must be positive, got ${duration}.`);
  }
  if (!(sampleRate > 0)) {
    throw new Error(`sampleRate must be positive, got ${sampleRate}.`);
  }
  return Math.round(duration * sampleRate);
}

function resolveAmplitude(amplitude: number | undefined): number {
  const a = amplitude ?? 1;
  if (!(a >= 0)) {
    throw new Error(`amplitude must be non-negative, got ${a}.`);
  }
  return a;
}

/** Options for {@link sine}. */
export interface SineOptions {
  frequency: number;
  duration: number;
  sampleRate: number;
  /** Peak amplitude. Defaults to 1. */
  amplitude?: number;
  /** Initial phase in radians. Defaults to 0. */
  phase?: number;
}

/** A pure sinusoid of the given frequency, duration and amplitude. */
export function sine(options: SineOptions): Float64Array {
  const { frequency, duration, sampleRate, phase = 0 } = options;
  const amplitude = resolveAmplitude(options.amplitude);
  if (!(frequency >= 0)) {
    throw new Error(`frequency must be non-negative, got ${frequency}.`);
  }
  const n = sampleCount(duration, sampleRate);
  const out = new Float64Array(n);
  const omega = (2 * Math.PI * frequency) / sampleRate;
  for (let i = 0; i < n; i++) {
    out[i] = amplitude * Math.sin(omega * i + phase);
  }
  return out;
}

/** Options for {@link harmonicStack}. */
export interface HarmonicStackOptions {
  fundamental: number;
  duration: number;
  sampleRate: number;
  /**
   * Relative amplitudes of partials 1, 2, 3, … . Defaults to
   * `[1, 0.5, 0.25, 0.125]`, a four-partial saw-ish stack.
   */
  amplitudes?: number[];
}

/**
 * Sum of integer harmonics of `fundamental`. Partial k (1-based) has
 * frequency `k * fundamental` and the amplitude at `amplitudes[k - 1]`.
 */
export function harmonicStack(options: HarmonicStackOptions): Float64Array {
  const { fundamental, duration, sampleRate } = options;
  const amplitudes = options.amplitudes ?? [1, 0.5, 0.25, 0.125];
  if (!(fundamental > 0)) {
    throw new Error(`fundamental must be positive, got ${fundamental}.`);
  }
  if (amplitudes.length < 1) {
    throw new Error(`harmonicStack needs at least one partial.`);
  }
  const n = sampleCount(duration, sampleRate);
  const out = new Float64Array(n);
  for (let h = 0; h < amplitudes.length; h++) {
    const freq = fundamental * (h + 1);
    const amp = amplitudes[h]!;
    const omega = (2 * Math.PI * freq) / sampleRate;
    for (let i = 0; i < n; i++) {
      out[i] += amp * Math.sin(omega * i);
    }
  }
  return out;
}

/** Options for {@link clickTrain}. */
export interface ClickTrainOptions {
  /** Click times in seconds, each mapped to the nearest sample. */
  times: number[];
  duration: number;
  sampleRate: number;
  /** Peak amplitude of each click. Defaults to 1. */
  amplitude?: number;
  /**
   * Width of each click in samples. 1 (the default) is a unit impulse, which
   * is what an onset detector should fire on. Wider clicks are a rectangular
   * burst centred on the named time.
   */
  widthSamples?: number;
}

/**
 * Impulses at known times. The onset-detector test's ground truth: each
 * entry in `times` is a sample-accurate event the detector should report.
 */
export function clickTrain(options: ClickTrainOptions): Float64Array {
  const { times, duration, sampleRate } = options;
  const amplitude = resolveAmplitude(options.amplitude);
  const widthSamples = options.widthSamples ?? 1;
  if (!Number.isInteger(widthSamples) || widthSamples < 1) {
    throw new Error(`widthSamples must be a positive integer, got ${widthSamples}.`);
  }
  const n = sampleCount(duration, sampleRate);
  const out = new Float64Array(n);
  const half = Math.floor(widthSamples / 2);
  for (const t of times) {
    if (!(t >= 0) || t > duration) {
      throw new Error(
        `click time ${t} s is outside [0, ${duration}] s.`,
      );
    }
    const centre = Math.round(t * sampleRate);
    const start = Math.max(0, centre - half);
    const stop = Math.min(n, start + widthSamples);
    for (let i = start; i < stop; i++) out[i] = amplitude;
  }
  return out;
}

/** Options for {@link chirp}. */
export interface ChirpOptions {
  startFrequency: number;
  endFrequency: number;
  duration: number;
  sampleRate: number;
  amplitude?: number;
}

/**
 * Linear chirp from `startFrequency` to `endFrequency` over `duration`.
 * Instantaneous frequency is f0 + (f1 − f0) · t / T, integrated so the
 * phase is continuous.
 */
export function chirp(options: ChirpOptions): Float64Array {
  const { startFrequency, endFrequency, duration, sampleRate } = options;
  const amplitude = resolveAmplitude(options.amplitude);
  if (!(startFrequency >= 0) || !(endFrequency >= 0)) {
    throw new Error(
      `chirp frequencies must be non-negative, got ${startFrequency} and ${endFrequency}.`,
    );
  }
  const n = sampleCount(duration, sampleRate);
  const out = new Float64Array(n);
  const slope = (endFrequency - startFrequency) / duration;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    // φ(t) = 2π (f0 t + slope t² / 2)
    const phase = 2 * Math.PI * (startFrequency * t + 0.5 * slope * t * t);
    out[i] = amplitude * Math.sin(phase);
  }
  return out;
}

/** Options for {@link vibratoNote}. */
export interface VibratoNoteOptions {
  frequency: number;
  duration: number;
  sampleRate: number;
  /** Vibrato rate in Hz. */
  rateHz: number;
  /** Peak-to-centre depth in cents. 50 means ±50 cents. */
  depthCents: number;
  amplitude?: number;
}

/**
 * A sustained note with sinusoidal vibrato. Instantaneous frequency is
 * `frequency · 2^((depthCents/1200) · sin(2π · rateHz · t))`, integrated so
 * the phase is continuous. This is the SuperFlux max-filter's failure-mode
 * fixture: plain spectral flux over-fires on the wobble, SuperFlux should not.
 */
export function vibratoNote(options: VibratoNoteOptions): Float64Array {
  const { frequency, duration, sampleRate, rateHz, depthCents } = options;
  const amplitude = resolveAmplitude(options.amplitude);
  if (!(frequency > 0)) {
    throw new Error(`frequency must be positive, got ${frequency}.`);
  }
  if (!(rateHz >= 0)) {
    throw new Error(`rateHz must be non-negative, got ${rateHz}.`);
  }
  if (!(depthCents >= 0)) {
    throw new Error(`depthCents must be non-negative, got ${depthCents}.`);
  }
  const n = sampleCount(duration, sampleRate);
  const out = new Float64Array(n);
  const depthRatio = depthCents / 1200;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    // Emit at the CURRENT phase, then integrate forward. Advancing first puts
    // sample 0 one step ahead of zero phase, a one-sample lead: tiny in absolute
    // terms (23 microseconds) but it breaks this generator's own contract that
    // depthCents = 0 reduces exactly to `sine`, and a fixture that does not
    // match its closed form cannot serve as a reference. Caught at juncture 1
    // by this module's own test.
    out[i] = amplitude * Math.sin(phase);
    const inst = frequency * Math.pow(2, depthRatio * Math.sin(2 * Math.PI * rateHz * t));
    phase += (2 * Math.PI * inst) / sampleRate;
  }
  return out;
}
