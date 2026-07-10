// ─── analysis-chords.ts — Windowed Chord Template Matching ───────────────────
//
// Wave W-H (harness upgrade). Deterministic, LLM-free harmonic analysis pass
// consumed by annotate-batch.ts's --analyze brief. Closes the calibration gap
// docs/harvest-pilot-report.md called out: "No chord/harmony detection...
// every chord symbol in [pilot] annotations is a generic textbook form
// applied to the song's key, not a verified transcription of what this
// specific arrangement plays."
//
// This module ALSO hosts the note-string/timing parsing primitives shared by
// analysis-patterns.ts and analysis-sections.ts (parseHandEvents and
// friends). They live here — not in annotate-batch.ts, which owns the brief
// that imports analyzeChords/analyzePatterns/analyzeSections — specifically
// to keep the import graph a DAG: annotate-batch.ts -> {this file,
// analysis-patterns.ts, analysis-sections.ts} -> nothing of ours. Putting the
// shared primitives in annotate-batch.ts instead would make it import FROM
// and BE IMPORTED BY the analysis modules at once — a circular ES module
// dependency. That can work in practice (function declarations hoist across
// the whole cycle before any module body runs) but it's fragile: a future
// edit that turns one of these into a `const foo = () => {}` would silently
// break it. Not worth the risk for a codebase-wide guarantee this doc leans
// on ("byte-identical" determinism). annotate-batch.ts keeps its OWN
// non-timing parseHandString (range/repeat detection doesn't need timing);
// this file's parseHandEvents is the timing-aware sibling the three
// analysis passes need and that one function doesn't provide.
//
// Design grounding (docs/feature-pass-v1.5-dispatch.md, "Study-swarm 2",
// findings 46-53, "The design -> Wave W-H"):
//   - Template vocabulary is EXACTLY major/minor/diminished/augmented triads
//     plus dominant/major/minor sevenths [46, 47, 52, 53] — no extensions,
//     no inversions, no half-diminished (the pedagogical tier and the
//     achievable-accuracy tier coincide at triad+seventh).
//   - Duration-weighted pitch-class profiles, not raw verticality slices
//     [49] — a passing sixteenth contributes far less mass than a sustained
//     chord tone, which is the cheap mitigation the finding recommends.
//   - Key-profile bias toward the stated key's diatonic set [50] — a small
//     multiplicative nudge for ambiguous windows, never strong enough to
//     overturn a window with clear, unambiguous raw evidence (see
//     KEY_BIAS_FACTOR below).
//   - Per-genre + per-texture confidence gating [48, 51]: arpeggiated
//     textures and jazz/latin/soul/rnb (rootless-voicing-prone genres) only
//     surface windows that clear a HIGH confidence bar, and those get
//     `implied: true` rather than presented as a flat fact.
// ─────────────────────────────────────────────────────────────────────────────

import { type Measure, type Genre, parseTimeSignature } from "../src/songs/index.js";
import { JamError } from "../src/errors.js";

// ─── Shared parsing primitives (used by all three analysis passes) ────────────

/** A single onset within a measure: the pitches that start sounding together, when (in quarter-note beats from the measure's start), and for how long. */
export interface HandOnset {
  /** MIDI note numbers sounding at this onset, chord tones expanded, ascending. Always non-empty. */
  pitches: number[];
  /** Onset start time within the measure, in quarter-note beats (0-based; "beat" here always means a quarter-note pulse, independent of time signature — see measureBeatsFromTimeSignature). */
  startBeat: number;
  /** Onset duration, in quarter-note beats. */
  durationBeats: number;
}

/**
 * Duration-suffix -> quarter-note-beat length. Mirrors src/songs/midi/hands.ts's
 * ticksToDuration exactly (that function goes ticks->code via these same
 * ratio thresholds; this is the inverse, code->beats). Every code
 * ticksToDuration can ever emit is a key here — confirmed by reading its
 * full ratio table, including the fallback bands, which only ever resolve
 * to one of these 11 strings. Unrecognized codes are a malformed-input
 * signal (hand-authored test fixtures), not something real ingested data
 * produces; durationCodeToBeats throws rather than guessing.
 */
export const DURATION_CODE_BEATS: Record<string, number> = {
  w: 4,
  "h.": 3,
  h: 2,
  "q.": 1.5,
  ht: 4 / 3,
  q: 1,
  "e.": 0.75,
  qt: 2 / 3,
  e: 0.5,
  et: 1 / 3,
  s: 0.25,
};

/** Sharps-only pitch-class names, matching midi/hands.ts's NOTE_NAMES convention (kept consistent with the rest of AnalysisBrief, which already spells pitches this way via midiNoteToScientific). */
export const PITCH_CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

const NOTE_TOKEN_RE = /^([A-G]#?)(-?\d+)$/;
const PITCH_CLASS: Record<string, number> = {
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
};

/**
 * Note-name -> MIDI. Intentionally duplicated from annotate-batch.ts's
 * private noteNameToMidi (same regex, same table, same formula) rather than
 * imported — see the file-header note on why these modules don't import
 * from annotate-batch.ts. Kept private; not part of this module's public
 * surface.
 */
function noteNameToMidi(name: string): number {
  const m = NOTE_TOKEN_RE.exec(name);
  if (!m) {
    throw new JamError({
      code: "INPUT_PARSE_ERROR",
      message: `Unrecognized note token "${name}" while analyzing measures`,
      hint: "Expected scientific pitch notation like \"C4\" or \"F#5\" (the ingest pipeline's own output format).",
    });
  }
  const [, letter, octaveStr] = m;
  const pitchClass = PITCH_CLASS[letter];
  const octave = parseInt(octaveStr, 10);
  return pitchClass + (octave + 1) * 12;
}

function durationCodeToBeats(code: string | undefined): number {
  if (code === undefined) return 1; // "Default is quarter if omitted" (Measure JSDoc, src/songs/types.ts)
  const beats = DURATION_CODE_BEATS[code];
  if (beats === undefined) {
    throw new JamError({
      code: "INPUT_PARSE_ERROR",
      message: `Unrecognized duration code ":${code}" while analyzing measures`,
      hint: `Expected one of: ${Object.keys(DURATION_CODE_BEATS).join(", ")} (the ingest pipeline's own vocabulary, from midi/hands.ts's ticksToDuration).`,
    });
  }
  return beats;
}

/**
 * Parse a hand notation string ("C4:q D4+F#4:e R:w") into a time-ordered
 * list of onsets, each carrying its beat position within the measure and
 * its chord-expanded, ascending-sorted pitch list. This is the timing-aware
 * sibling of annotate-batch.ts's parseHandString: that function answers
 * "what pitches sound in this measure" (range/repeat detection, no timing
 * needed); this one additionally answers "when, and for how long" — what
 * duration-weighted pitch-class profiles, onset-simultaneity texture
 * classification, and melodic interval sequences all need. A bare "R"
 * token amid other tokens (e.g. "C4:q R:q E4:h") advances the beat cursor
 * without producing an onset, mirroring parseHandString's own defensive
 * handling of that case.
 */
export function parseHandEvents(hand: string): HandOnset[] {
  if (!hand || hand === "R:w") return [];
  const tokens = hand.trim().split(/\s+/);
  const events: HandOnset[] = [];
  let cursor = 0;
  for (const tok of tokens) {
    const [pitchPart, durCode] = tok.split(":");
    const durationBeats = durationCodeToBeats(durCode);
    if (pitchPart !== "R") {
      const pitches = pitchPart.split("+").map(noteNameToMidi).sort((a, b) => a - b);
      events.push({ pitches, startBeat: cursor, durationBeats });
    }
    cursor += durationBeats;
  }
  return events;
}

/** Total quarter-note beats in one measure of the given time signature (e.g. "4/4" -> 4, "6/8" -> 3, "3/4" -> 3). Reuses the repo's own parseTimeSignature (numerator/denominator sanitization, 4/4 fallback on garbage input) rather than re-parsing the string by hand. */
export function measureBeatsFromTimeSignature(timeSignature: string): number {
  const { numerator, denominator } = parseTimeSignature(timeSignature);
  return numerator * (4 / denominator);
}

/** Onsets whose start falls within [startBeat, endBeat). Used to split a measure's onsets across a half-measure boundary for texture classification (an onset's *duration* can straddle the boundary — pitchClassProfile below handles that by clipping overlap — but for "which half does this onset belong to," its start time is the natural, simple answer). */
function onsetsStartingIn(onsets: HandOnset[], startBeat: number, endBeat: number): HandOnset[] {
  return onsets.filter((o) => o.startBeat >= startBeat && o.startBeat < endBeat);
}

/** Round to 3 decimal places for stable, readable JSON output (floating-point ops here are already deterministic run-to-run; this is purely for legibility). Shared by all three analysis passes. */
export function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/**
 * Duration-weighted pitch-class profile across a beat window, combining
 * both hands' onsets. Each onset contributes its OVERLAP with the window
 * (clipped, not its full duration) at every pitch class it sounds — this is
 * the finding-49 mitigation: a passing tone that's mostly outside the
 * window (or brief within it) contributes little mass; a sustained chord
 * tone that fills the window contributes a lot. Index i = pitch class i
 * (0=C .. 11=B).
 */
export function pitchClassProfile(
  rightOnsets: HandOnset[],
  leftOnsets: HandOnset[],
  startBeat: number,
  endBeat: number,
): number[] {
  const profile = new Array(12).fill(0) as number[];
  accumulateProfile(profile, rightOnsets, startBeat, endBeat);
  accumulateProfile(profile, leftOnsets, startBeat, endBeat);
  return profile;
}

function accumulateProfile(profile: number[], onsets: HandOnset[], startBeat: number, endBeat: number): void {
  for (const onset of onsets) {
    const onsetEnd = onset.startBeat + onset.durationBeats;
    const overlap = Math.min(onsetEnd, endBeat) - Math.max(onset.startBeat, startBeat);
    if (overlap <= 0) continue;
    for (const pitch of onset.pitches) {
      profile[((pitch % 12) + 12) % 12] += overlap;
    }
  }
}

// ─── Texture classification [48, 51] ───────────────────────────────────────

export type TextureClass = "block" | "arpeggiated";

/**
 * Mean simultaneous pitches per onset at/above this counts as "block chord"
 * texture (multiple notes struck together); below it counts as
 * "arpeggiated" (mostly single-note onsets, characteristic of broken
 * chords/arpeggios/single melodic lines outlining harmony over time rather
 * than stacking it). A plain block triad averages exactly 3; a broken triad
 * (three separate single-note onsets) averages exactly 1 — 2.0 sits cleanly
 * between those two textbook cases.
 */
const BLOCK_MEAN_PITCHES_PER_ONSET = 2.0;

/**
 * Classify a window's onset-simultaneity texture from a flat list of onsets
 * (typically both hands' onsets for the window, order doesn't matter here).
 * An onset with 2+ simultaneous pitches is "struck together"; texture is
 * the mean pitch-count per onset compared against BLOCK_MEAN_PITCHES_PER_ONSET.
 */
export function classifyTexture(onsets: HandOnset[]): TextureClass {
  if (onsets.length === 0) return "block"; // no signal either way; analyzeChords never calls this on an empty window (empty profiles are skipped upstream), so this default is inert in practice
  let totalPitches = 0;
  for (const o of onsets) totalPitches += o.pitches.length;
  const mean = totalPitches / onsets.length;
  return mean >= BLOCK_MEAN_PITCHES_PER_ONSET ? "block" : "arpeggiated";
}

// ─── Chord template vocabulary [46, 47, 52, 53] ────────────────────────────

export type ChordQuality = "maj" | "min" | "dim" | "aug" | "dom7" | "maj7" | "min7";

interface ChordTemplateDef {
  quality: ChordQuality;
  intervals: number[]; // semitones from root
}

/** Triads + sevenths ONLY — no extensions (9/11/13), no inversions, no half-diminished. This IS the achievable-accuracy tier [47, 52] and the teaching-vocabulary tier [53] at once; nothing outside it is deterministically claimed. */
const CHORD_TEMPLATES: ChordTemplateDef[] = [
  { quality: "maj", intervals: [0, 4, 7] },
  { quality: "min", intervals: [0, 3, 7] },
  { quality: "dim", intervals: [0, 3, 6] },
  { quality: "aug", intervals: [0, 4, 8] },
  { quality: "dom7", intervals: [0, 4, 7, 10] },
  { quality: "maj7", intervals: [0, 4, 7, 11] },
  { quality: "min7", intervals: [0, 3, 7, 10] },
];

const QUALITY_SUFFIX: Record<ChordQuality, string> = {
  maj: "", min: "m", dim: "dim", aug: "aug", dom7: "7", maj7: "maj7", min7: "m7",
};

function chordLabel(root: number, quality: ChordQuality): string {
  return `${PITCH_CLASS_NAMES[root]}${QUALITY_SUFFIX[quality]}`;
}

// ─── Key detection [50] ─────────────────────────────────────────────────────
//
// Config `key` fields are self-reported and, per the dispatch's own pilot
// finding, wrong often enough (roughly half the pilot corpus) that biasing
// template matching toward a stated key blindly can actively HURT accuracy
// on those songs — the bias would nudge candidates toward a key the music
// doesn't actually establish. The fix is content-based key detection:
// Krumhansl-Schmuckler correlation of the song's own duration-weighted
// pitch-class distribution against 24 candidate key profiles (12 major +
// 12 minor tonic rotations), Temperley-refined [50: Temperley 1999, Music
// Perception 17(1), "What's Key for Key? The Krumhansl-Schmuckler
// Key-Finding Algorithm Reconsidered" — revises Krumhansl & Kessler's 1982
// probe-tone weights against a corpus rather than a listening experiment].
// The best-correlating rotation is the detected key; analyzeChords prefers
// it over the stated key for buildKeyBias whenever detection clears a
// confidence floor, and flags a mismatch when the two disagree with a
// strong margin — the stated key stays in the brief for context, but
// harmony claims (the bias, the summary line) follow the content.

const TONIC_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function parseKey(key: string): { tonicPc: number; mode: "major" | "minor" } | null {
  const m = /^([A-G])(#|b)?\s+(major|minor)$/i.exec(key.trim());
  if (!m) return null;
  const [, letter, accidental, modeStr] = m;
  let pc = TONIC_SEMITONE[letter.toUpperCase()];
  if (accidental === "#") pc = (pc + 1) % 12;
  if (accidental === "b") pc = (pc + 11) % 12;
  return { tonicPc: pc, mode: modeStr.toLowerCase() === "major" ? "major" : "minor" };
}

function formatKeyName(tonicPc: number, mode: "major" | "minor"): string {
  return `${PITCH_CLASS_NAMES[tonicPc]} ${mode}`;
}

/**
 * Temperley's (1999) revised Krumhansl-Schmuckler profile weights, indexed
 * from the tonic (index 0 = scale degree 1, ascending chromatically from
 * there — NOT yet aligned to any absolute pitch class; rotateProfileToTonic
 * does that alignment). Cross-checked against Essentia's open-source
 * key.cpp (MTG/essentia), which ships both Krumhansl & Kessler's original
 * probe-tone weights and Temperley's corpus-revised weights under these
 * exact names — used here because finding 50 specifically cites Temperley's
 * refinement, and a second independent source (an established MIR library)
 * confirms the digits rather than relying on one memory of the paper.
 */
const TEMPERLEY_MAJOR_PROFILE: readonly number[] = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];
const TEMPERLEY_MINOR_PROFILE: readonly number[] = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0];

/** Rotate a tonic-indexed profile so index i holds the weight for absolute pitch class i, given a candidate tonic pitch class. */
function rotateProfileToTonic(profile: readonly number[], tonicPc: number): number[] {
  const rotated = new Array(12).fill(0) as number[];
  for (let pc = 0; pc < 12; pc++) rotated[pc] = profile[(((pc - tonicPc) % 12) + 12) % 12];
  return rotated;
}

/**
 * Standard Pearson correlation coefficient — the Krumhansl-Schmuckler
 * algorithm's own comparison metric. Deliberately NOT cosine similarity:
 * both the key profiles and real pitch-class distributions have a nonzero
 * baseline (every pitch class gets some weight/mass), so mean-centering
 * matters for a meaningful correlation — cosine similarity would conflate
 * "matches the shape" with "has a similar overall magnitude." Returns 0 for
 * a degenerate (zero-variance) side rather than NaN.
 */
function pearsonCorrelation(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

export interface KeyDetectionResult {
  tonicPc: number;
  mode: "major" | "minor";
  /** Pearson correlation of the profile against this key's profile, roughly -1..1. */
  correlation: number;
  /** correlation minus the runner-up candidate's correlation — how decisively this key beat the next-best guess, among all 24. */
  margin: number;
}

/**
 * Below this detection margin, key detection is too ambiguous to override
 * the stated key (see analyzeChords' bias-source choice). Calibrated
 * against this repo's own library (see the (a)-(d) verification run this
 * module's fix was shipped with): confidently tonal songs land well above
 * 0.1 margin; only short/sparse/ambiguous windows fall near 0.
 */
const KEY_DETECTION_CONFIDENCE_FLOOR = 0.05;

/**
 * Below this detection margin, a detected-vs-stated disagreement is too
 * weak a signal to raise as a LOUD keyMismatch — it's reported (detectedKey
 * still reflects it) but not flagged. Deliberately a higher bar than
 * KEY_DETECTION_CONFIDENCE_FLOOR: "confident enough to use for bias" and
 * "confident enough to declare the stated key wrong" are different claims,
 * and the second one is louder, so it earns a stricter floor.
 */
const KEY_MISMATCH_STRONG_MARGIN = 0.15;

/**
 * Krumhansl-Schmuckler/Temperley key detection [50] over a duration-
 * weighted pitch-class profile (see buildSongPitchClassProfile). Scores all
 * 24 candidate keys (12 tonics x major/minor) by Pearson correlation,
 * returns the best. Sorted deterministically (correlation desc, tonic asc,
 * major-before-minor) so ties resolve the same way every run. Returns null
 * for a silent profile (nothing to correlate against — an all-rests song
 * has no key to detect).
 */
export function detectKey(profile: number[]): KeyDetectionResult | null {
  if (profile.every((v) => v === 0)) return null;

  const candidates: { tonicPc: number; mode: "major" | "minor"; correlation: number }[] = [];
  for (let tonicPc = 0; tonicPc < 12; tonicPc++) {
    candidates.push({ tonicPc, mode: "major", correlation: pearsonCorrelation(profile, rotateProfileToTonic(TEMPERLEY_MAJOR_PROFILE, tonicPc)) });
    candidates.push({ tonicPc, mode: "minor", correlation: pearsonCorrelation(profile, rotateProfileToTonic(TEMPERLEY_MINOR_PROFILE, tonicPc)) });
  }
  candidates.sort((a, b) => b.correlation - a.correlation || a.tonicPc - b.tonicPc || (a.mode === b.mode ? 0 : a.mode === "major" ? -1 : 1));

  const best = candidates[0];
  const runnerUp = candidates[1].correlation;
  return { tonicPc: best.tonicPc, mode: best.mode, correlation: round3(best.correlation), margin: round3(best.correlation - runnerUp) };
}

/**
 * Duration-weighted pitch-class profile for a WHOLE song (every measure's
 * both-hand onsets, summed). Distinct from the per-window profiles the
 * chord pass scores: key detection wants the song's overall tonal center,
 * not a 1-2 beat slice, so this deliberately re-walks all measures rather
 * than reusing any single window's profile.
 */
export function buildSongPitchClassProfile(measures: Measure[], measureBeats: number): number[] {
  const profile = new Array(12).fill(0) as number[];
  for (const m of measures) {
    const rh = parseHandEvents(m.rightHand);
    const lh = parseHandEvents(m.leftHand);
    const measureProfile = pitchClassProfile(rh, lh, 0, measureBeats);
    for (let pc = 0; pc < 12; pc++) profile[pc] += measureProfile[pc];
  }
  return profile;
}

/** Pearson correlation of a profile against one specific (already-parsed) key's profile — used for statedKeyFit, where we want THAT key's fit, not necessarily the best of the 24. */
function correlationForKey(profile: number[], parsed: { tonicPc: number; mode: "major" | "minor" }): number {
  const table = parsed.mode === "major" ? TEMPERLEY_MAJOR_PROFILE : TEMPERLEY_MINOR_PROFILE;
  return round3(pearsonCorrelation(profile, rotateProfileToTonic(table, parsed.tonicPc)));
}

// ─── Key-profile bias [50] ──────────────────────────────────────────────────

/** Exported for direct testing of the key-bias tiebreak mechanism (see matchTemplates below) — analyzeChords is the intended whole-song entry point; this and buildKeyBias/matchTemplates are the lower-level primitives it's built from. */
export interface KeyBias {
  diatonic: Set<string>; // "<rootPc>:<quality>" entries that get boosted
}

interface DiatonicDegree {
  semitone: number;
  triad: ChordQuality;
  seventh: ChordQuality | null;
}

// I ii iii IV V vi vii°
const MAJOR_DEGREES: DiatonicDegree[] = [
  { semitone: 0, triad: "maj", seventh: "maj7" },
  { semitone: 2, triad: "min", seventh: "min7" },
  { semitone: 4, triad: "min", seventh: "min7" },
  { semitone: 5, triad: "maj", seventh: "maj7" },
  { semitone: 7, triad: "maj", seventh: "dom7" },
  { semitone: 9, triad: "min", seventh: "min7" },
  { semitone: 11, triad: "dim", seventh: null }, // vii's diatonic 7th is half-diminished (m7b5) — outside our vocabulary, so no seventh entry
];

// i ii° III iv v VI VII (natural minor)
const NATURAL_MINOR_DEGREES: DiatonicDegree[] = [
  { semitone: 0, triad: "min", seventh: "min7" },
  { semitone: 2, triad: "dim", seventh: null },
  { semitone: 3, triad: "maj", seventh: "maj7" },
  { semitone: 5, triad: "min", seventh: "min7" },
  { semitone: 7, triad: "min", seventh: "min7" },
  { semitone: 8, triad: "maj", seventh: "maj7" },
  { semitone: 10, triad: "maj", seventh: "dom7" },
];

/**
 * Harmonic-minor extras: raising the natural minor's 7th scale degree (the
 * leading tone) turns the v triad from minor into major/dominant and adds a
 * leading-tone diminished triad. This is the single most common minor-key
 * cadential chord in tonal pop/blues/folk writing (a natural-minor-only
 * bias would systematically miss it) — verified by this module's own
 * synthetic fixtures (analysis-chords.test.ts's buildKeyBias minor-key
 * tests assert the raised-leading-tone V/V7/vii° entries directly for A
 * minor), not by pointing at one corpus song's stated key: a real song's
 * config `key` field is exactly the kind of self-reported claim the [50]
 * key-detection pass above exists to check (finding 1 of the Lens-H pass —
 * roughly half the pilot corpus's stated keys didn't match their content),
 * so "song X is in key Y" is no longer a safe empirical anchor for a design
 * rationale in this file.
 */
const HARMONIC_MINOR_EXTRA_DEGREES: DiatonicDegree[] = [
  { semitone: 7, triad: "maj", seventh: "dom7" }, // V (raised leading tone)
  { semitone: 11, triad: "dim", seventh: null }, // vii° (raised leading tone)
];

/** Shared by buildKeyBias(key: string) and analyzeChords' detected-key path (which already has a parsed {tonicPc, mode} and shouldn't round-trip through a formatted string just to re-parse it). */
function buildKeyBiasFromParsed(parsed: { tonicPc: number; mode: "major" | "minor" }): KeyBias {
  const degrees = parsed.mode === "major" ? MAJOR_DEGREES : [...NATURAL_MINOR_DEGREES, ...HARMONIC_MINOR_EXTRA_DEGREES];
  const diatonic = new Set<string>();
  for (const d of degrees) {
    const root = (parsed.tonicPc + d.semitone) % 12;
    diatonic.add(`${root}:${d.triad}`);
    if (d.seventh) diatonic.add(`${root}:${d.seventh}`);
  }
  return { diatonic };
}

export function buildKeyBias(key: string): KeyBias | null {
  const parsed = parseKey(key);
  if (!parsed) return null; // unparseable key string -> no bias, raw template match only (safe default)
  return buildKeyBiasFromParsed(parsed);
}

/**
 * Modest multiplicative boost for templates whose (root, quality) is
 * diatonic to the stated key. Deliberately small: this is a tiebreak lever
 * for AMBIGUOUS windows [50], not a license to override clear raw evidence.
 * A window with an unambiguous, strongly-separated best match keeps its
 * winner regardless of key-bias (an 8% multiplicative nudge cannot flip a
 * large raw-score gap); it only tips close calls toward the key's own
 * harmony, which is exactly the "cheap accuracy lever" the finding
 * describes.
 */
const KEY_BIAS_FACTOR = 1.08;

// ─── Template matching ──────────────────────────────────────────────────────

/** Exported for direct testing (see KeyBias above). */
export interface TemplateMatch {
  root: number;
  quality: ChordQuality;
  score: number;
}

function vectorNorm(v: number[]): number {
  let sum = 0;
  for (const x of v) sum += x * x;
  return Math.sqrt(sum);
}

/**
 * Any 3-note triad is, by construction, ALSO a subset of several different
 * 4-note seventh chords (add any unheard 7th to a root-position triad and
 * you get a "valid" seventh template match) — cosine similarity alone
 * scores those supersets only slightly below the true triad (a clean,
 * completely unambiguous triad match still leaves an ~0.87-scoring
 * seventh-chord "sibling" one dot-product away, because 3 of its 4 tones
 * are real). That caps the raw best-vs-runner-up margin around 0.13 for
 * even a perfect match — useless as a confidence signal (HIGH_CONFIDENCE_CUT
 * would be unreachable in practice; empirically confirmed while calibrating
 * these thresholds against synthetic fixtures before writing this module's
 * tests). The fix: a template tone with literally ZERO corroborating
 * profile mass (the pitch class never sounds anywhere in the window, not
 * "sounds quietly") is `unheard` evidence AGAINST that template, not
 * neutral — apply a multiplicative penalty per unheard tone. This also
 * directly implements finding 51 (rootless voicings are the hard-failure
 * class): a hypothesized root with zero mass at its own root pitch class
 * gets penalized like any other unheard tone, so a rootless shell voicing
 * can never win with high confidence on the "obvious" root.
 */
const UNHEARD_TONE_PENALTY = 0.4;

/**
 * Score every (root, quality) combination against a pitch-class profile via
 * cosine similarity between the (duration-weighted) profile vector and the
 * template's binary chord-tone vector, then apply UNHEARD_TONE_PENALTY per
 * template tone with zero profile mass (see that constant's comment), then
 * the key-profile bias. Cosine naturally normalizes across template sizes
 * (triad norm sqrt(3) vs seventh norm sqrt(4)) before the penalty is even
 * applied: a seventh only outscores the plain triad sharing its root when
 * the profile has real corroborating mass on that 7th scale degree AND that
 * degree is nonzero, not merely because it "explains more" of the window.
 * Returns [] for an all-silent window (nothing to match). Sorted best-first;
 * ties broken by construction order (root ascending, then CHORD_TEMPLATES
 * array order) via JS's stable sort — deterministic given a fixed template
 * table and fixed iteration order.
 */
export function matchTemplates(profile: number[], keyBias: KeyBias | null): TemplateMatch[] {
  const profileNorm = vectorNorm(profile);
  if (profileNorm === 0) return [];

  const matches: TemplateMatch[] = [];
  for (let root = 0; root < 12; root++) {
    for (const tmpl of CHORD_TEMPLATES) {
      let dot = 0;
      let unheardTones = 0;
      for (const iv of tmpl.intervals) {
        const mass = profile[(root + iv) % 12];
        dot += mass;
        if (mass === 0) unheardTones++;
      }
      const templateNorm = Math.sqrt(tmpl.intervals.length);
      let score = (dot / (profileNorm * templateNorm)) * UNHEARD_TONE_PENALTY ** unheardTones;
      // NOT clamped to 1 here (fixed: a Math.min(1, ...) used to sit on this
      // line). A raw score can be at or near the cosine ceiling of 1 before
      // bias is even applied (a clean, fully-heard match); clamping the
      // BIASED score at that point silently "wastes" less of the 8% nudge
      // on a near-ceiling winner than on a lower-scoring nested sibling
      // (e.g. the same triad's own seventh), artificially SHRINKING the
      // margin between them — confirmed empirically: a clean C-major triad
      // diatonic to its own key scored a real 0.626 margin against its
      // nested Cmaj7 sibling under the old clamp, well above what the
      // margin-exclusion fix below needs it to be. Every consumer of
      // `score` either compares it relatively (sort, margin) or runs it
      // through clamp01 at the very end (buildChordWindow's confidence) —
      // nothing needs an individual candidate's score pre-clamped to <=1.
      if (keyBias && keyBias.diatonic.has(`${root}:${tmpl.quality}`)) {
        score = score * KEY_BIAS_FACTOR;
      }
      matches.push({ root, quality: tmpl.quality, score });
    }
  }
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// ─── Nested-template margin exclusion ──────────────────────────────────────
//
// matchTemplates' own doc comment already names the problem: every triad has
// a same-root, one-unheard-tone seventh "sibling" (add the unheard tone to
// the triad and you get a technically-valid seventh template match), which
// caps best-vs-runner-up margin around 0.13 even for a perfect, unambiguous
// match — because the runner-up used for that margin was, until this fix,
// whatever scored second-highest OVERALL, including that near-tautological
// sibling. A COMPLETE, cleanly-heard seventh chord (all 4 tones sounding)
// has the opposite problem: it wins outright over its own subset triad (see
// ROOTLESS_SHELL_RATIO's derivation below for why — the seventh's raw score
// architecturally exceeds the triad's whenever the 7th tone carries
// meaningful duration weight), but the margin against that SAME subset triad
// was still ~0.13 — below NORMAL_CONFIDENCE_FLOOR (0.15), so a slam-dunk,
// all-four-tones-sounding G7 was silently DROPPED, never emitted at all.
// Zero sevenths corpus-wide in jazz was the symptom.
//
// The fix: a template whose tone set is a subset OR superset of the
// winner's isn't a genuinely competing interpretation — it's the same
// evidence read at a different grain. Exclude nested candidates from the
// margin comparison entirely; the true runner-up is the best-scoring
// template that does NOT share this relationship with the winner.

/** Absolute pitch classes a (root, quality) template covers. */
function templateToneSet(root: number, quality: ChordQuality): Set<number> {
  const def = CHORD_TEMPLATES.find((t) => t.quality === quality)!;
  return new Set(def.intervals.map((iv) => (root + iv) % 12));
}

/** True when `a`'s tones are wholly contained in `b`'s, or vice versa (equal sets count too — a defensive case that can't occur with this module's own fixed-quality templates, but "identical" is trivially "nested"). */
function isNestedToneSet(a: Set<number>, b: Set<number>): boolean {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const pc of small) if (!large.has(pc)) return false;
  return true;
}

/**
 * The best-scoring candidate in `matches` whose tone set is NOT nested
 * (subset/superset) with `winner`'s — i.e. the true competing
 * interpretation, for confidence-margin purposes. Scans in `matches`'
 * existing best-first order and returns the first non-nested hit, so it's
 * still "the best of the genuine alternatives," not just "second place."
 * `winner` need not be `matches[0]` (the rootless-shell reinterpretation
 * below can substitute a different candidate as the winner after the fact).
 * Returns 0 if every other candidate is nested with the winner (a
 * degenerate case in practice — the template vocabulary is small enough
 * that unrelated triads/sevenths always exist — but a safe floor either way).
 */
function findMarginRunnerUpScore(matches: TemplateMatch[], winner: TemplateMatch): number {
  const winnerTones = templateToneSet(winner.root, winner.quality);
  for (const cand of matches) {
    if (cand.root === winner.root && cand.quality === winner.quality) continue;
    if (isNestedToneSet(winnerTones, templateToneSet(cand.root, cand.quality))) continue;
    return cand.score;
  }
  return 0;
}

// ─── Rootless-shell reinterpretation [51] ──────────────────────────────────
//
// A diminished (or augmented) triad's tones can, by construction, ALSO be a
// strict subset of some dominant-7th template's tones (see
// shellDominant7Root's derivation). When a window's mass is (almost)
// entirely explained by exactly those 3 tones and the reinterpreted dom7's
// root is diatonically plausible, the "diminished triad" is almost always
// misreading a rootless jazz "3-5-7" shell voicing (Levine 1989, The Jazz
// Piano Book — the canonical shells/rootless-voicings curriculum cited at
// finding 63) rather than a real diminished chord: rootless voicings are
// BACHI's own named hard-failure class for symbolic chord recognition [51].
//
// "Clean" is judged by how much of the window's TOTAL profile mass sits on
// the triad's own 3 tones (see CLEAN_SHELL_MASS_FRACTION) — deliberately
// NOT by comparing the reinterpreted dom7's own score against some
// theoretical ceiling. An earlier version of this fix tried the latter and
// it was WRONG: the dom7's dot product is architecturally identical to the
// triad's own dot product whenever the triad has 0 unheard tones (the
// dom7's only unheard tone is its own root; its other three tones are
// exactly the triad's three), and both scores divide by the SAME
// profileNorm — so the dom7-to-triad score RATIO is a fixed constant
// (sqrt(3)/2 * UNHEARD_TONE_PENALTY) regardless of how much other mass sits
// elsewhere in the profile. That ratio cannot distinguish a clean 3-tone
// shell from a genuine 4-tone diminished-seventh chord; only the mass
// fraction can (confirmed empirically: this file's "genuine full dim7"
// fixture keeps a near-constant dom7/triad ratio while its mass fraction
// drops well below a clean shell's).

/**
 * The dominant-7th whose rootless "3-5-7" shell (3rd, 5th, b7th — the root
 * omitted) is tone-for-tone identical to a diminished triad built on the
 * dom7's OWN 3rd. Derivation: dom7 intervals from its root are [0,4,7,10];
 * the upper three (4,7,10), taken relative to the "4", are offsets [0,3,7]
 * from THAT tone... concretely (7-4)=3 and (10-7)=3, i.e. two stacked minor
 * thirds — exactly a diminished triad shape, rooted a major third (4
 * semitones) above the dom7's own root. Solving for the dom7's root given a
 * diminished triad's own root: dom7Root = dimRoot - 4 (mod 12). Checked
 * exhaustively that an augmented triad's tones can NEVER be a 3-tone subset
 * of any dom7 template in this vocabulary (none of a dom7's four 3-tone
 * subsets form an augmented [0,4,8] shape) — so this only ever resolves for
 * `quality === "dim"` in practice. Kept general (checking the actual tone
 * sets rather than hardcoding "dim only") so that reasoning stays visible
 * and verifiable in the code rather than asserted in a comment.
 */
function shellDominant7Root(triadRoot: number, quality: ChordQuality): number | null {
  if (quality !== "dim" && quality !== "aug") return null;
  const candidateRoot = (((triadRoot - 4) % 12) + 12) % 12;
  const dom7Tones = templateToneSet(candidateRoot, "dom7");
  const triadTones = templateToneSet(triadRoot, quality);
  for (const pc of triadTones) if (!dom7Tones.has(pc)) return null;
  return candidateRoot;
}

/**
 * Fraction of the window's TOTAL profile mass that must sit on the winning
 * triad's own 3 tones for a same-shape dominant-7th to count as a "clean"
 * rootless shell — i.e. the window is (almost) fully explained by exactly
 * those 3 tones, with no fourth tone materially contradicting that
 * reading. 0.98 sits comfortably above a genuine 4-tone diminished-seventh
 * chord's mass fraction (confirmed empirically against this file's
 * "genuine full dim7" fixture, where all four tones carry real, comparable
 * duration weight and the fraction lands well below this cut) and
 * comfortably below 1.0 (so trivial float noise from unrelated overlapping
 * onsets can't flip a truly clean shell to "not clean").
 */
const CLEAN_SHELL_MASS_FRACTION = 0.98;

interface ShellReinterpretation {
  match: TemplateMatch;
  /** True only when the shell existed structurally + cleanly but its root wasn't diatonically plausible — the "keep the dim/aug label, but hedge harder" branch. */
  ambiguous: boolean;
}

/**
 * Given the current best (dim/aug) candidate, decide whether it's really a
 * rootless dominant-7th shell. Three outcomes: (1) not dim/aug, or no
 * structural shell exists, or the shell isn't clean -> null, caller keeps
 * the original winner untouched; (2) clean shell + diatonically plausible
 * root -> relabel to the dom7, unambiguous; (3) clean shell but NOT
 * diatonically plausible -> keep the dim/aug label, but flag it as
 * ambiguous so the caller hedges (forces implied:true, caps confidence).
 * `profile` is the window's own pitch-class-mass array — needed to measure
 * how much mass sits outside the triad's 3 tones (see
 * CLEAN_SHELL_MASS_FRACTION).
 */
function resolveRootlessShell(best: TemplateMatch, matches: TemplateMatch[], profile: number[], keyBias: KeyBias | null): ShellReinterpretation | null {
  const dom7Root = shellDominant7Root(best.root, best.quality);
  if (dom7Root === null) return null;
  const shell = matches.find((cand) => cand.root === dom7Root && cand.quality === "dom7");
  if (!shell) return null; // defensive only — matchTemplates always scores every (root, quality) combo

  const triadTones = templateToneSet(best.root, best.quality);
  let explainedMass = 0;
  let totalMass = 0;
  for (let pc = 0; pc < 12; pc++) {
    totalMass += profile[pc];
    if (triadTones.has(pc)) explainedMass += profile[pc];
  }
  const isCleanShell = totalMass > 0 && explainedMass / totalMass >= CLEAN_SHELL_MASS_FRACTION;
  if (!isCleanShell) return null; // real mass exists outside the 3-tone shell — leave the dim/aug reading alone

  const diatonicallyPlausible = keyBias !== null && keyBias.diatonic.has(`${dom7Root}:dom7`);
  if (diatonicallyPlausible) return { match: shell, ambiguous: false };
  return { match: best, ambiguous: true };
}

/** Confidence ceiling applied when a clean rootless-shell shape was found but its dom7 reinterpretation wasn't diatonically plausible (resolveRootlessShell's `ambiguous` branch) — high enough to still clear HIGH_CONFIDENCE_CUT (so the hedged label CAN surface), low enough to never read as "highly confident" the way an uncontested clean match otherwise would. */
const AMBIGUOUS_SHELL_CONFIDENCE_CAP = 0.6;

// ─── Per-genre + per-texture gating [48, 51] ───────────────────────────────

/** Only these genres are hard-gated by name (rootless voicings, fast harmonic rhythm, and non-chord tones are the documented hard-failure class for symbolic recognition [51]) — every OTHER genre is gated purely by texture. */
const HARD_GATED_GENRES = new Set<Genre>(["jazz", "latin", "soul", "rnb"]);

/**
 * Windows above this confidence clear the high bar for gated (arpeggiated-
 * texture OR hard-genre) windows and are emitted with implied:true.
 * Calibrated empirically against this module's own scoring formula, not
 * picked round: the cleanest possible case (a profile whose only mass sits
 * on exactly one triad's 3 tones, nothing else sounding at all) tops out
 * around a 0.65 margin — matchTemplates' own doc comment explains why
 * (every triad has a same-root, one-unheard-tone seventh "sibling" that
 * survives the unheard-tone penalty at ~0.35-0.37). A cut at 0.75 would be
 * unreachable by ANY input, silently dead-coding the implied:true path
 * entirely — confirmed by probing this exact scenario while calibrating.
 * 0.5 sits below that real ceiling (so an unambiguous window in a gated
 * context CAN still surface, hedged) while staying well above
 * NORMAL_CONFIDENCE_FLOOR and the ~0.03-0.15 range typical ambiguous/
 * rootless windows land in.
 */
const HIGH_CONFIDENCE_CUT = 0.5;

/** Baseline sanity floor for ungated (block-texture, non-hard-genre) windows — filters pure noise/total ties without materially restricting normal emission (well within the ~0.65 ceiling described above). */
const NORMAL_CONFIDENCE_FLOOR = 0.15;

function requiresHighConfidenceGate(genre: Genre, texture: TextureClass): boolean {
  return texture === "arpeggiated" || HARD_GATED_GENRES.has(genre);
}

// ─── Per-window analysis ────────────────────────────────────────────────────

export interface ChordWindow {
  measure: number;
  /** Present only when this measure used the half-measure segmentation (1 = first half, 2 = second half). Absent for a whole-measure window. */
  half?: 1 | 2;
  label: string;
  root: string;
  quality: ChordQuality;
  /** Normalized template-match margin (best score minus runner-up score), 0-1. */
  confidence: number;
  /** Present+true only when this window cleared the high-confidence gate for an arpeggiated texture or a hard-gated genre — treat as inferred/hedged harmony, not a flat transcription fact. */
  implied?: true;
}

function buildChordWindow(
  measure: number,
  half: 1 | 2 | undefined,
  matches: TemplateMatch[],
  profile: number[],
  texture: TextureClass,
  genre: Genre,
  keyBias: KeyBias | null,
): ChordWindow | null {
  if (matches.length === 0) return null;

  const original = matches[0];
  let winner = original;
  let forceImplied = false;
  let confidenceCap = 1;

  if (original.quality === "dim" || original.quality === "aug") {
    const shell = resolveRootlessShell(original, matches, profile, keyBias);
    if (shell) {
      winner = shell.match; // either the reinterpreted dom7, or the original dim/aug kept-but-hedged
      forceImplied = true;
      if (shell.ambiguous) confidenceCap = AMBIGUOUS_SHELL_CONFIDENCE_CAP;
    }
  }

  // Margin is always computed against the ORIGINAL (dim/aug) candidate's
  // tone set, even when `winner` ends up relabeled to its dom7 shell. Both
  // labels describe the SAME 3 confidently-established tones; the margin
  // question is "how sure are we these tones — as opposed to some
  // genuinely different reading — are what's sounding," not "how sure are
  // we about the dom7 label specifically." The latter would structurally
  // always look weak (a seventh's own raw score is architecturally lower
  // than the triad sharing its tones — matchTemplates' own doc comment),
  // which would make every reinterpreted window fail the confidence gate
  // regardless of how clean the underlying evidence actually is —
  // confirmed empirically while building this fix, then corrected.
  const runnerUpScore = findMarginRunnerUpScore(matches, original);
  const confidence = Math.min(clamp01(original.score - runnerUpScore), confidenceCap);
  const gated = requiresHighConfidenceGate(genre, texture) || forceImplied;
  const floor = gated ? HIGH_CONFIDENCE_CUT : NORMAL_CONFIDENCE_FLOOR;
  if (confidence < floor) return null;

  return {
    measure,
    ...(half !== undefined ? { half } : {}),
    label: chordLabel(winner.root, winner.quality),
    root: PITCH_CLASS_NAMES[winner.root],
    quality: winner.quality,
    confidence: round3(confidence),
    ...(gated ? { implied: true as const } : {}),
  };
}

// ─── Whole-song analysis ────────────────────────────────────────────────────

export interface ChordProgressionSummary {
  label: string;
  /** Number of emitted windows carrying this label. */
  windows: number;
  /** windows / total windows CONSIDERED (emitted + suppressed), 0-1 — see the module-level note on ChordAnalysis.summary for why this denominator changed from "emitted only." */
  coverage: number;
}

export interface ChordAnalysis {
  /** Content-detected key [50], e.g. "C major" — see detectKey. Falls back to the stated key, reformatted, when the song has no notes to detect from at all. */
  detectedKey: string;
  /** Correlation margin (best vs. runner-up) behind detectedKey, 0 when nothing could be detected (silent song). Higher = more decisive. */
  detectedKeyConfidence: number;
  /** Pearson correlation of the song's content against the STATED key's own profile specifically (not necessarily the best of the 24) — how well the config's `key` field fits what actually sounds, independent of what got detected. 0 when the stated key string doesn't parse. */
  statedKeyFit: number;
  /** Present+true only when detectedKey disagrees with the stated key AND the detection margin clears KEY_MISMATCH_STRONG_MARGIN — a loud, deliberately rare signal (not every minor disagreement is worth flagging). See the summary string for the human-readable form. */
  keyMismatch?: true;
  windows: ChordWindow[];
  /** Main progression candidates by coverage, descending. */
  progression: ChordProgressionSummary[];
  /**
   * One-line human-readable rollup, for a reader who only wants the
   * headline. Three parts, each conditional: (1) a keyMismatch note when
   * one fired ("harmony claims must follow content"); (2) the progression
   * breakdown, or the "no windows" message; (3) a low-coverage caveat when
   * emitted windows cover under 80% of the windows considered — the
   * progression breakdown's own percentages sum to 100% of the LABELED
   * subset by construction (see ChordProgressionSummary.coverage), which
   * silently hides how much of the song has NO label at all (dropped by the
   * confidence gate, or genuinely ambiguous) unless this caveat says so.
   */
  summary: string;
}

function summarizeProgression(windows: ChordWindow[], totalWindows: number): ChordProgressionSummary[] {
  const counts = new Map<string, number>();
  for (const w of windows) counts.set(w.label, (counts.get(w.label) ?? 0) + 1);
  const list: ChordProgressionSummary[] = [...counts.entries()].map(([label, count]) => ({
    label,
    windows: count,
    coverage: totalWindows > 0 ? round3(count / totalWindows) : 0,
  }));
  list.sort((a, b) => b.coverage - a.coverage || a.label.localeCompare(b.label));
  return list;
}

/** Below this fraction of emitted-vs-considered windows, the summary line gets an explicit low-coverage caveat — see ChordAnalysis.summary. */
const SUMMARY_COVERAGE_CAVEAT_FLOOR = 0.8;

function formatSummaryLine(
  progression: ChordProgressionSummary[],
  emittedWindows: number,
  totalWindows: number,
  keyMismatchNote: string | null,
): string {
  const parts: string[] = [];
  if (keyMismatchNote) parts.push(keyMismatchNote);

  if (progression.length === 0) {
    parts.push("No chord windows detected (measures were rest-only, or nothing cleared the confidence gate).");
    return parts.join(" ");
  }

  const top = progression.slice(0, 5).map((p) => `${p.label} (${Math.round(p.coverage * 100)}%)`);
  parts.push(`Main progression candidates by coverage: ${top.join(", ")}.`);

  const emittedCoverage = totalWindows > 0 ? emittedWindows / totalWindows : 0;
  if (emittedCoverage < SUMMARY_COVERAGE_CAVEAT_FLOOR) {
    parts.push(
      `Labels cover ${Math.round(emittedCoverage * 100)}% of measures — the rest didn't clear the confidence gate (ambiguous windows, rootless voicings, or ties), not evidence they're silent.`,
    );
  }
  return parts.join(" ");
}

/**
 * Windowed pitch-class-profile chord analysis for a whole song. For every
 * non-silent measure, scores BOTH a whole-measure window and a two-half
 * segmentation, picks whichever scores better [design: "pick the
 * better-scoring segmentation per measure"], then gates emission by texture
 * + genre. `timeSignature` should be the ingested/resolved value
 * (SongEntry.timeSignature), not the raw config field, matching how the
 * rest of the analysis brief already sources it.
 *
 * `key` is the STATED (config) key — used for statedKeyFit and as the
 * fallback bias source when content-based detection [50] is too ambiguous
 * to trust. The bias every window is actually scored against, and the
 * diatonic-plausibility check the rootless-shell reinterpretation [51]
 * uses, both come from the DETECTED key whenever detection clears
 * KEY_DETECTION_CONFIDENCE_FLOOR.
 */
export function analyzeChords(measures: Measure[], key: string, genre: Genre, timeSignature: string): ChordAnalysis {
  const measureBeats = measureBeatsFromTimeSignature(timeSignature);
  const half = measureBeats / 2;

  const songProfile = buildSongPitchClassProfile(measures, measureBeats);
  const detected = detectKey(songProfile);
  const statedParsed = parseKey(key);
  const statedKeyFit = statedParsed ? correlationForKey(songProfile, statedParsed) : 0;

  const useDetected = detected !== null && detected.margin >= KEY_DETECTION_CONFIDENCE_FLOOR;
  const biasSource = useDetected ? { tonicPc: detected!.tonicPc, mode: detected!.mode } : statedParsed;
  const keyBias = biasSource ? buildKeyBiasFromParsed(biasSource) : null;

  const detectedKey = detected
    ? formatKeyName(detected.tonicPc, detected.mode)
    : statedParsed
      ? formatKeyName(statedParsed.tonicPc, statedParsed.mode)
      : key;
  const detectedKeyConfidence = detected ? detected.margin : 0;
  const keyMismatch =
    detected !== null &&
    statedParsed !== null &&
    detected.margin >= KEY_MISMATCH_STRONG_MARGIN &&
    (detected.tonicPc !== statedParsed.tonicPc || detected.mode !== statedParsed.mode);

  const windows: ChordWindow[] = [];
  let totalWindows = 0;

  for (const m of measures) {
    const rh = parseHandEvents(m.rightHand);
    const lh = parseHandEvents(m.leftHand);
    if (rh.length === 0 && lh.length === 0) continue; // full-measure rest, nothing to analyze

    const wholeProfile = pitchClassProfile(rh, lh, 0, measureBeats);
    const wholeMatches = matchTemplates(wholeProfile, keyBias);
    const wholeScore = wholeMatches.length > 0 ? wholeMatches[0].score : 0;

    const half1Profile = pitchClassProfile(rh, lh, 0, half);
    const half2Profile = pitchClassProfile(rh, lh, half, measureBeats);
    const half1Matches = matchTemplates(half1Profile, keyBias);
    const half2Matches = matchTemplates(half2Profile, keyBias);
    // Both halves must independently carry a match — conservative, so one
    // strong half never masks a genuinely silent/ambiguous other half.
    const halfScore =
      half1Matches.length > 0 && half2Matches.length > 0 ? Math.min(half1Matches[0].score, half2Matches[0].score) : -1;

    if (halfScore > wholeScore) {
      totalWindows += 2;
      const tex1 = classifyTexture([...onsetsStartingIn(rh, 0, half), ...onsetsStartingIn(lh, 0, half)]);
      const tex2 = classifyTexture([...onsetsStartingIn(rh, half, measureBeats), ...onsetsStartingIn(lh, half, measureBeats)]);
      const w1 = buildChordWindow(m.number, 1, half1Matches, half1Profile, tex1, genre, keyBias);
      const w2 = buildChordWindow(m.number, 2, half2Matches, half2Profile, tex2, genre, keyBias);
      if (w1) windows.push(w1);
      if (w2) windows.push(w2);
    } else {
      totalWindows += 1;
      const tex = classifyTexture([...rh, ...lh]);
      const w = buildChordWindow(m.number, undefined, wholeMatches, wholeProfile, tex, genre, keyBias);
      if (w) windows.push(w);
    }
  }

  const progression = summarizeProgression(windows, totalWindows);
  const keyMismatchNote = keyMismatch
    ? `Stated key ${key}, content indicates ${detectedKey} (margin ${detectedKeyConfidence}) — harmony claims must follow content.`
    : null;

  return {
    detectedKey,
    detectedKeyConfidence,
    statedKeyFit,
    ...(keyMismatch ? { keyMismatch: true as const } : {}),
    windows,
    progression,
    summary: formatSummaryLine(progression, windows.length, totalWindows, keyMismatchNote),
  };
}
