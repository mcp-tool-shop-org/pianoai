// ─── Maker: deterministic chord voicer ───────────────────────────────────────
//
// The "deterministic renderer" of the neuro-symbolic decomposition (design study
// Q1): the model chooses a chord SYMBOL, this function renders a concrete voicing
// that spells it — exactly, by construction. Grounded in:
//   - Chord Jazzification (Chen et al., ISMIR 2020): a two-stage coloring→voicing
//     split outperforms end-to-end chord generation.
//   - PAL / Program-of-Thoughts (Gao 2022 arXiv:2211.10435; Chen 2022
//     arXiv:2211.12588): emit the high-level choice, offload the deterministic
//     part to a non-learned component.
// And measured directly in the maker-arc re-gate: a strong model's chords paired
// with auto-generated root-position voicings pass verifyHarmony's fidelity gate
// 100% of the time, vs 37% when a 7B generates the voicing tokens itself.
//
// The vocabulary is EXACTLY what verifyHarmony's parseChordSymbol accepts, so a
// voicing produced here always passes chord fidelity by construction — the whole
// point of the decomposition.
// ─────────────────────────────────────────────────────────────────────────────

import { parseChordSymbol } from "./verify-harmony.js";

/** Pitch-class → name (sharps). inferChord only compares pitch classes, so any
 *  enharmonic spelling is accepted; sharps are a deterministic canonical choice. */
const PC_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export interface VoicingOptions {
  /** Octave the root is placed in (left-hand register). Default 2. */
  rootOctave?: number;
}

/**
 * Render a deterministic root-position voicing for a chord symbol, ascending
 * from `rootOctave`. Each chord tone is placed at the next octave up whenever its
 * pitch class would fall at or below the previous note's — so the voicing is
 * strictly ascending and spans one to two octaves in the bass/tenor register.
 *
 * Returns null for a symbol outside verifyHarmony's vocabulary (the measurement
 * boundary — a chord the engine cannot confirm should never be voiced blind).
 *
 * Guarantee: `inferChord(voiceChord(sym))` is canonically equivalent to `sym`
 * for every sym in the vocabulary — proven in voicer.test.ts against the real
 * chord engine.
 */
export function voiceChord(symbol: string, opts: VoicingOptions = {}): string | null {
  const parsed = parseChordSymbol(symbol);
  if (!parsed) return null;
  const rootOctave = opts.rootOctave ?? 2;

  let octave = rootOctave;
  let prevPc = -1;
  const notes: string[] = [];
  for (const iv of parsed.intervals) {
    const pc = (parsed.rootPc + iv) % 12;
    if (pc <= prevPc) octave++; // keep strictly ascending
    prevPc = pc;
    notes.push(`${PC_NAMES[pc]}${octave}`);
  }
  return notes.join(" ");
}

/**
 * Render a per-measure reharmonization from chord symbols alone: pairs each
 * measure with a deterministically-voiced chord. Measures whose symbol is out of
 * vocabulary are dropped (they cannot be voiced and would fail fidelity anyway).
 */
export function renderReharmonization(
  chords: Array<{ measure: number; intendedChord: string }>,
  opts: VoicingOptions = {},
): Array<{ measure: number; intendedChord: string; voicing: string }> {
  const out: Array<{ measure: number; intendedChord: string; voicing: string }> = [];
  for (const c of chords) {
    const voicing = voiceChord(c.intendedChord, opts);
    if (voicing !== null) out.push({ measure: c.measure, intendedChord: c.intendedChord, voicing });
  }
  return out;
}
