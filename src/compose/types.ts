// ─── Compose: shared types (Phase 2 — the composition engine) ─────────────────
//
// Phase 2 of the studio Music Wing professional arc (docs/music-wing-professional-
// arc.md) turns UNDERSTANDING (the Phase-1 analyzer's chord progression) into
// MAKING (a voiced realization admitted by a deterministic music-theory verifier).
// It is the reharmonization envelope SCALED: the local model proposes musical
// material → a deterministic gate admits (or rejects) → best-of-n keeps the best
// admitted candidate. Coconet / Counterpoint by Convolution shipped exactly this
// generate→verify→resample loop in the Bach Doodle (Huang et al. 2019,
// arXiv:1903.07227 / arXiv:1907.06637); FuxCP encodes species counterpoint as a
// real constraint solver (Sprockeels et al. 2023).
//
// DECOUPLED by construction (like src/analysis): this module realizes a FIXED
// chord progression as N voices. It reads chord SYMBOLS (from the analyzer, a
// maker reharmonization, or anywhere) and note strings; it imports only the pure
// chord-symbol parser + note parser. It never touches inferChord, the frozen E-R
// `sourceChords` baseline, or the Gate-2 snapshot — so wiring it anywhere is a
// later, separate decision that cannot perturb the maker-arc eval.
// ─────────────────────────────────────────────────────────────────────────────

import { parseNoteToMidi } from "../note-parser.js";

/**
 * One voiced chord of a realization. `voices` are MIDI pitch numbers, one per
 * voice, interpreted low→high (voice 0 = bass) — the SATB convention. The chord
 * SYMBOL is FIXED (the realization does not change the harmony; it voices it);
 * the verifier admits the realization only if it both spells the chord and is
 * well-formed part-writing.
 */
export interface RealizedFrame {
  /** 1-based measure (or span index) this frame covers. */
  measure: number;
  /** The FIXED chord this frame realizes, e.g. "Cmaj7", "Am", "G7". "N/C" for a
   *  no-chord / rest frame (skipped by the tendency + fidelity checks). */
  chordSymbol: string;
  /** MIDI pitches, one per voice, low→high. Empty for a rest/silent frame. */
  voices: number[];
}

/** A complete N-voice realization of a chord progression. */
export interface Realization {
  /** Declared key, e.g. "C major" / "A minor" — drives the leading-tone check. */
  key: string;
  /** The frames in time order. */
  frames: RealizedFrame[];
}

// ─── Voicing-string parsing ───────────────────────────────────────────────────

/**
 * Parse a voicing string ("E2 G3 C4 E4", "C4+E4+G4", "A2 C3:h E3") into ascending
 * MIDI voices via the platform's own note parser. Whitespace- and "+"-separated;
 * duration suffixes (":h", ":q", …) are stripped (pitch analysis ignores rhythm);
 * rests ("R") are dropped. The result is SORTED ascending (bass first). A doubled
 * pitch is kept — it is a real (doubled) voice. Unparseable tokens are skipped (a
 * tolerant read, like the maker parsers).
 */
export function parseVoicing(voicing: string): number[] {
  if (!voicing?.trim()) return [];
  const out: number[] = [];
  for (const rawTok of voicing.trim().split(/[\s+]+/)) {
    if (!rawTok) continue;
    const tok = rawTok.split(":")[0]; // strip duration suffix
    if (tok === "R" || tok === "r" || tok === "") continue; // rest
    try {
      const midi = parseNoteToMidi(tok);
      if (midi >= 0) out.push(midi);
    } catch {
      // tolerant: skip a token the parser rejects (e.g. a stray word)
    }
  }
  return out.sort((a, b) => a - b);
}

/** Build a RealizedFrame from a measure number, chord symbol, and voicing string. */
export function frameFromVoicing(
  measure: number,
  chordSymbol: string,
  voicing: string,
): RealizedFrame {
  return { measure, chordSymbol, voices: parseVoicing(voicing) };
}
