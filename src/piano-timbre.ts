// ─── Shared piano-timbre helpers (oscillator fallback) ──────────────────────
//
// The product's default path has always been sine-additive (audio-engine.ts
// and apps/cockpit/src/synth.ts). Oscillators with uncapped highs + a
// ratio-6 compressor are harsh. These numbers are the fallback-synth
// envelope: velocity-dependent lowpass, gentler compressor. The sampled
// Concert Grand is the preferred engine when samples are on disk.

/** Gentler than the old ratio-6 / threshold -15 squash. */
export const PIANO_COMPRESSOR = {
  threshold: -24,
  knee: 18,
  ratio: 2.5,
  attack: 0.008,
  release: 0.28,
} as const;

/**
 * Lowpass cutoff for a piano-like oscillator voice.
 * Soft playing stays warm (~1.8 kHz); forte opens to ~6.5 kHz.
 * Never the old 18 kHz brick-wall that let every partial through.
 */
export function velocityLowpassHz(midiNote: number, velocity01: number): number {
  const vel = Math.max(0, Math.min(1, velocity01));
  const velHz = 1800 + vel * vel * 4700;
  const register = midiNote > 72 ? 1.12 : midiNote < 48 ? 0.88 : 1;
  return Math.max(1400, Math.min(7200, velHz * register));
}
