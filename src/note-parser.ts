// ─── ai-jam-sessions: Note Parser ────────────────────────────────────────────
//
// Converts scientific pitch notation (e.g. "C4:q", "F#5:e", "Bb3:h")
// into MIDI note numbers and durations for playback.
// ─────────────────────────────────────────────────────────────────────────────

import { NOTE_OFFSETS, DURATION_MAP } from "./types.js";
import type { MidiNote, Beat, PlayableMeasure, ParseWarning } from "./types.js";
import type { Measure } from "./songs/types.js";

/**
 * Parse a scientific pitch string into a MIDI note number.
 *
 * Examples:
 *   "C4"  → 60  (middle C)
 *   "A4"  → 69  (concert A)
 *   "F#5" → 78
 *   "Bb3" → 58
 *   "R"   → -1  (rest)
 */
export function parseNoteToMidi(noteStr: string): number {
  const trimmed = noteStr.trim();

  if (trimmed === "R" || trimmed === "r") return -1; // rest

  // Match: letter + optional accidental + octave
  // e.g. "C4", "F#5", "Bb3", "G#4"
  const match = trimmed.match(/^([A-Ga-g])(#|b)?(\d)$/);
  if (!match) {
    throw new Error(`Invalid note: "${noteStr}"`);
  }

  const [, letter, accidental, octaveStr] = match;
  const base = NOTE_OFFSETS[letter.toUpperCase()];
  if (base === undefined) {
    throw new Error(`Unknown note letter: "${letter}"`);
  }

  const octave = parseInt(octaveStr, 10);
  let midi = (octave + 1) * 12 + base;

  if (accidental === "#") midi += 1;
  if (accidental === "b") midi -= 1;

  if (midi < 0 || midi > 127) {
    throw new Error(`MIDI note out of range: ${midi} (from "${noteStr}")`);
  }

  return midi;
}

/**
 * Parse a duration suffix into a multiplier relative to a quarter note.
 *
 * ":w" → 4.0 (whole), ":h" → 2.0 (half), ":q" → 1.0 (quarter),
 * ":e" → 0.5 (eighth), ":s" → 0.25 (sixteenth).
 * Default (no suffix) → 1.0 (quarter).
 */
export function parseDuration(suffix: string): number {
  const mult = DURATION_MAP[suffix];
  if (mult === undefined) {
    throw new Error(`Unknown duration suffix: "${suffix}"`);
  }
  return mult;
}

/**
 * Convert a BPM tempo + duration multiplier → milliseconds.
 *
 * At 120 BPM, a quarter note = 500ms.
 * A half note at 120 BPM = 1000ms.
 */
export function durationToMs(multiplier: number, bpm: number): number {
  const quarterMs = 60_000 / bpm;
  return quarterMs * multiplier;
}

/**
 * Parse a single note token like "C4:q" or "R:h" into a MidiNote.
 *
 * @param token   - e.g. "C4:q", "F#5:e", "Bb3:h", "R:q"
 * @param bpm     - tempo in beats per minute
 * @param channel - MIDI channel (0-15)
 * @param velocity - MIDI velocity (0-127)
 */
export function parseNoteToken(
  token: string,
  bpm: number,
  channel = 0,
  velocity = 80
): MidiNote {
  const trimmed = token.trim();
  const parts = trimmed.split(":");

  const noteStr = parts[0];
  const durationSuffix = parts[1] ?? "q"; // default to quarter note

  const midi = parseNoteToMidi(noteStr);
  const mult = parseDuration(durationSuffix);
  const durationMs = durationToMs(mult, bpm);

  return {
    note: midi,
    velocity: midi === -1 ? 0 : velocity, // rests have 0 velocity
    durationMs,
    channel,
  };
}

/**
 * Parse a hand string like "C4:q E4:q G4:q" into an array of Beats.
 *
 * Each space-separated token becomes a sequential beat.
 * Chords use "+" to join simultaneous notes: "C4+E4+G4:q"
 * The duration suffix on the last note applies to all chord tones.
 */
export function parseHandString(
  handStr: string,
  hand: "right" | "left",
  bpm: number,
  channel = 0,
  velocity = 80
): Beat[] {
  if (!handStr || handStr.trim() === "") return [];

  const tokens = handStr.trim().split(/\s+/);
  return tokens.map((token) => {
    if (token.includes("+")) {
      return parseChordToken(token, hand, bpm, channel, velocity);
    }
    return {
      notes: [parseNoteToken(token, bpm, channel, velocity)],
      hand,
    };
  });
}

/**
 * Parse a chord token like "C4+E4+G4:q" into a Beat with multiple notes.
 * The duration suffix from the last sub-token applies to all notes.
 */
function parseChordToken(
  token: string,
  hand: "right" | "left",
  bpm: number,
  channel: number,
  velocity: number
): Beat {
  const parts = token.split("+");
  // Find the duration from the part that has one (last part has ":dur")
  let sharedDuration = "q";
  for (const part of parts) {
    if (part.includes(":")) {
      sharedDuration = part.split(":")[1];
    }
  }
  const notes = parts.map((part) => {
    if (part.includes(":")) {
      return parseNoteToken(part, bpm, channel, velocity);
    }
    return parseNoteToken(`${part}:${sharedDuration}`, bpm, channel, velocity);
  });
  return { notes, hand };
}

/**
 * Parse a full Measure into a PlayableMeasure with MIDI-ready beats.
 */
export function parseMeasure(
  measure: Measure,
  bpm: number,
  velocity = 80
): PlayableMeasure {
  return {
    source: measure,
    rightBeats: parseHandString(measure.rightHand, "right", bpm, 0, velocity),
    leftBeats: parseHandString(measure.leftHand, "left", bpm, 0, velocity),
  };
}

/**
 * Safely parse a note token — returns null on error instead of throwing.
 * Collects a warning in the provided array when parsing fails.
 */
export function safeParseNoteToken(
  token: string,
  bpm: number,
  location: string,
  warnings: ParseWarning[],
  channel = 0,
  velocity = 80
): MidiNote | null {
  try {
    return parseNoteToken(token, bpm, channel, velocity);
  } catch (err) {
    warnings.push({
      location,
      token,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Safe version of parseHandString — skips bad tokens, collects warnings.
 */
export function safeParseHandString(
  handStr: string,
  hand: "right" | "left",
  bpm: number,
  measureNumber: number,
  warnings: ParseWarning[],
  channel = 0,
  velocity = 80
): Beat[] {
  if (!handStr || handStr.trim() === "") return [];

  const tokens = handStr.trim().split(/\s+/);
  const beats: Beat[] = [];

  for (const token of tokens) {
    if (token.includes("+")) {
      // Chord token — parse each sub-note
      try {
        beats.push(parseChordToken(token, hand, bpm, channel, velocity));
      } catch (err) {
        warnings.push({
          location: `measure ${measureNumber} ${hand} hand`,
          token,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      const note = safeParseNoteToken(
        token,
        bpm,
        `measure ${measureNumber} ${hand} hand`,
        warnings,
        channel,
        velocity
      );
      if (note) {
        beats.push({ notes: [note], hand });
      }
    }
  }

  return beats;
}

/**
 * Safe version of parseMeasure — skips bad notes, collects warnings.
 */
export function safeParseMeasure(
  measure: Measure,
  bpm: number,
  warnings: ParseWarning[],
  velocity = 80
): PlayableMeasure {
  return {
    source: measure,
    rightBeats: safeParseHandString(measure.rightHand, "right", bpm, measure.number, warnings, 0, velocity),
    leftBeats: safeParseHandString(measure.leftHand, "left", bpm, measure.number, warnings, 0, velocity),
  };
}

/**
 * Convert a MIDI note number back to a note name (for display).
 *
 * 60 → "C4", 69 → "A4", 78 → "F#5"
 */
export function midiToNoteName(midi: number): string {
  if (midi < 0) return "R";

  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return `${noteNames[noteIndex]}${octave}`;
}

// ─── Sing-Along Conversion ──────────────────────────────────────────────────

/** Sing-along mode for note narration. */
export type SingAlongMode = "note-names" | "solfege" | "contour" | "syllables";

/** Solfege mapping: note name (with optional accidental) → solfege syllable. */
const SOLFEGE_MAP: Record<string, string> = {
  C: "Do", "C#": "Di", Db: "Ra",
  D: "Re", "D#": "Ri", Eb: "Me",
  E: "Mi",
  F: "Fa", "F#": "Fi", Gb: "Se",
  G: "Sol", "G#": "Si", Ab: "Le",
  A: "La", "A#": "Li", Bb: "Te",
  B: "Ti",
};

/**
 * Convert a single note string (e.g. "C4", "F#5") to a singable syllable.
 *
 * - "note-names": "C", "F sharp", "B flat"
 * - "solfege": "Do", "Fi", "Te"
 * - "syllables": always "da"
 * - "contour": falls back to letter (contour handled at measure level)
 */
export function noteToSingable(noteStr: string, mode: SingAlongMode): string {
  const trimmed = noteStr.trim();
  if (trimmed === "R" || trimmed === "r") return mode === "syllables" ? "..." : "rest";

  const match = trimmed.match(/^([A-Ga-g])(#|b)?(\d)?$/);
  if (!match) return trimmed; // pass through unparseable

  const [, letter, accidental] = match;
  const upperLetter = letter.toUpperCase();

  switch (mode) {
    case "note-names": {
      const acc = accidental === "#" ? " sharp" : accidental === "b" ? " flat" : "";
      return `${upperLetter}${acc}`;
    }
    case "solfege": {
      const key = accidental ? `${upperLetter}${accidental}` : upperLetter;
      return SOLFEGE_MAP[key] ?? upperLetter;
    }
    case "syllables":
      return "da";
    case "contour":
      return upperLetter; // fallback — contour handled at measure level
  }
}

/** Options for measure-level singable text generation. */
export interface SingAlongTextOptions {
  mode: SingAlongMode;
  hand: "right" | "left" | "both";
}

/**
 * Convert a hand string (e.g. "C4:q E4:q G4:q") to singable text.
 *
 * For "contour" mode, compares consecutive MIDI pitches and returns
 * direction words: "up", "down", "same".
 *
 * For other modes, maps each note token through noteToSingable and
 * joins with "... " (speech pause).
 */
export function handToSingableText(
  handStr: string,
  mode: SingAlongMode
): string {
  if (!handStr || handStr.trim() === "") return "";

  const tokens = handStr.trim().split(/\s+/);

  if (mode === "contour") {
    if (tokens.length <= 1) return "hold";
    const midis = tokens.map((t) => {
      const noteStr = t.split(":")[0];
      try {
        return parseNoteToMidi(noteStr);
      } catch {
        return -1;
      }
    });
    const dirs: string[] = [];
    for (let i = 1; i < midis.length; i++) {
      if (midis[i] < 0 || midis[i - 1] < 0) {
        dirs.push("rest");
        continue;
      }
      const diff = midis[i] - midis[i - 1];
      dirs.push(diff > 0 ? "up" : diff < 0 ? "down" : "same");
    }
    return dirs.join("... ");
  }

  // note-names, solfege, syllables
  const syllables = tokens.map((t) => {
    const noteStr = t.split(":")[0];
    return noteToSingable(noteStr, mode);
  });
  return syllables.join("... ");
}

/**
 * Convert a Measure to singable text for voice narration.
 *
 * Returns the singable syllables for the specified hand(s).
 * When hand="both", right hand text comes first, then "Left hand:" prefix.
 */
export function measureToSingableText(
  measure: { rightHand: string; leftHand: string },
  options: SingAlongTextOptions
): string {
  const { mode, hand } = options;

  if (hand === "right") return handToSingableText(measure.rightHand, mode);
  if (hand === "left") return handToSingableText(measure.leftHand, mode);

  // both
  const right = handToSingableText(measure.rightHand, mode);
  const left = handToSingableText(measure.leftHand, mode);
  if (!left) return right;
  if (!right) return left;
  return `${right}. Left hand: ${left}`;
}
