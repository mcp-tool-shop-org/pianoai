// ─── Compose: the voicing-spec decompose renderer (membership by construction) ─
//
// Phase 2, Session 2, Slice B1a. Session 1 measured that base qwen2.5:7b emits
// the right voice COUNT every sample but DRIFTS off the fixed harmony — it voices
// C major as C–E–G–B (adds a colour 7th), CHANGING the chord instead of voicing
// it, so it scores 0/10 under BOTH the strict and relaxed gates (membership is
// orthogonal to style). A stronger prompt only REDUCES drift (finding 13, Lu et
// al. 2021 NeuroLogic); it never eliminates it.
//
// The fix is by CONSTRUCTION (findings 11–13 — Willard & Louf 2023 Outlines,
// llama.cpp GBNF, PAL/PoT Gao 2022 / Chen 2022): the model never emits raw
// pitches. It emits a VOICING SPEC — an inversion (which chord tone is in the
// bass) + a chord-tone selection per voice (doublings = repeats) — and this
// DETERMINISTIC renderer maps the spec onto the FIXED chord's exact pitch classes.
// Membership becomes IMPOSSIBLE to violate, because every rendered pitch is drawn
// from the chord's own pcs by index. This is the Session-1 `voiceChord` decompose
// (which gave 100% chord fidelity on the reharmonization surface) extended from a
// single root-position rendering to arbitrary inversions + doublings the model
// chooses.
//
// The renderer is ROBUST to a confused model by design: out-of-range, negative,
// or non-integer indices wrap into the chord's tones; a wrong-length list is
// padded (doubling up from the root) or truncated to the exact voice count. So
// the WORST a bad spec can do is poor voice-leading (which the gate then judges) —
// never a non-chord tone and never a wrong voice count. Membership + structure +
// within-frame spacing (≤ octave) + ascending order (no crossing) are all
// guaranteed here; the gate judges the genuinely inter-frame rules (parallels,
// hidden, overlap, leap, tendency).
// ─────────────────────────────────────────────────────────────────────────────

import { parseChordSymbol } from "../maker/verify-harmony.js";
import type { ChordProgression } from "./realize.js";
import type { Realization, RealizedFrame } from "./types.js";

/** Bass octave (scientific pitch, C4 = MIDI 60) when a spec omits one. */
export const DEFAULT_BASS_OCTAVE = 3;

/**
 * One frame's voicing choice — the high-level, membership-safe decompose the
 * model emits (never raw pitches). `degrees` are CHORD-TONE INDICES low→high:
 * 0 = the root, 1 = the next chord tone up, 2 = the next, … The FIRST entry is
 * the bass, so its index IS the inversion (0 = root position, 1 = first
 * inversion, …). A repeated index is a DOUBLING. The list is repaired to the
 * requested voice count; any index is taken modulo the chord's tone count, so it
 * always names a real chord tone.
 */
export interface VoicingSpec {
  /** 1-based measure this spec voices (joined to the progression). */
  measure: number;
  /** Chord-tone indices low→high (first = bass = the inversion; repeats = doublings). */
  degrees: number[];
  /** Bass octave (scientific pitch). Default DEFAULT_BASS_OCTAVE. */
  bassOctave?: number;
}

const clampMidi = (m: number): number => Math.max(0, Math.min(127, m));

/** Coerce any value to a valid chord-tone index 0..len-1 (wraps; tolerant). */
function normalizeIndex(raw: unknown, len: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || len <= 0) return 0;
  return ((Math.round(n) % len) + len) % len;
}

/** MIDI of pitch class `pc` in scientific octave `octave` (C4 = 60). */
function pcInOctave(pc: number, octave: number): number {
  return clampMidi((octave + 1) * 12 + pc);
}

/** Lowest MIDI with pitch class `pc` strictly above `prev`. */
function lowestAbove(pc: number, prev: number): number {
  let midi = prev + 1;
  midi += (((pc - midi) % 12) + 12) % 12;
  return clampMidi(midi);
}

/**
 * Repair a raw degree list to EXACTLY `n` chord-tone indices. Empty → a default
 * close voicing (root, 3rd, 5th, root, …). Short → padded by continuing that
 * cycle (doubling up from the root). Long → truncated. Every entry is normalized
 * into range. The first entry (the bass / inversion) is always preserved when
 * present.
 */
export function repairDegrees(raw: number[] | undefined, len: number, n: number): number[] {
  const cleaned = (raw ?? []).map((d) => normalizeIndex(d, len));
  const out = cleaned.slice(0, n);
  while (out.length < n) out.push(out.length % len); // continue a close-position stack
  return out;
}

/**
 * Render a voicing spec onto a chord symbol's EXACT pitch classes as `n`
 * ascending MIDI voices. Membership is guaranteed by construction (every pitch is
 * a chord tone). Returns a REST frame (empty voices) only when the chord symbol
 * is outside the verifier vocabulary — it cannot be voiced without inventing
 * pitches, so it is honestly left empty (the structure gate then resamples it).
 */
export function renderVoicingSpec(
  chordSymbol: string,
  spec: Pick<VoicingSpec, "degrees" | "bassOctave">,
  voices: number,
): RealizedFrame["voices"] {
  const parsed = parseChordSymbol(chordSymbol);
  if (!parsed) return [];
  const pcs = parsed.pcs; // root-ordered chord tones
  const n = Math.max(1, voices);
  const degrees = repairDegrees(spec.degrees, pcs.length, n);
  const bassOctave = Number.isFinite(spec.bassOctave) ? (spec.bassOctave as number) : DEFAULT_BASS_OCTAVE;

  const midis: number[] = [];
  let prev = -Infinity;
  for (let i = 0; i < n; i++) {
    const pc = pcs[degrees[i]];
    const midi = i === 0 ? pcInOctave(pc, bassOctave) : lowestAbove(pc, prev);
    midis.push(midi);
    prev = midi;
  }
  return midis;
}

/**
 * Render a full progression from per-measure voicing specs into a Realization.
 * A measure with no spec (the model omitted it) or an out-of-vocabulary chord
 * becomes a REST frame — exactly like the raw-note path — so best-of-n resamples
 * it via the structure gate. Every SOUNDING frame is membership-correct by
 * construction. Pure + deterministic (no LLM, no HTTP).
 */
export function renderSpecRealization(
  progression: ChordProgression,
  specs: VoicingSpec[],
  voices: number,
): Realization {
  const byMeasure = new Map<number, VoicingSpec>();
  for (const s of specs) if (Number.isFinite(s.measure)) byMeasure.set(s.measure, s);

  const frames: RealizedFrame[] = progression.chords.map((c) => {
    const spec = byMeasure.get(c.measure);
    if (!spec || !c.chordSymbol || c.chordSymbol === "N/C") {
      return { measure: c.measure, chordSymbol: c.chordSymbol, voices: [] };
    }
    return { measure: c.measure, chordSymbol: c.chordSymbol, voices: renderVoicingSpec(c.chordSymbol, spec, voices) };
  });
  return { key: progression.key, frames };
}
