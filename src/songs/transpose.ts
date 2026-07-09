// ─── Song Transposition ─────────────────────────────────────────────────────
//
// Transposes all notes in a SongEntry by a given number of semitones.
// Handles scientific pitch notation: "C4:q", "F#5:h", "C4+E4+G4:q", "R".
// ─────────────────────────────────────────────────────────────────────────────

import type { SongEntry, Measure } from "./types.js";
import { parseNoteToMidi, midiToNoteName } from "../note-parser.js";

// Key signature map: semitone offset → key name
const KEY_MAP: Record<string, number> = {
  "C major": 0, "C# major": 1, "Db major": 1, "D major": 2,
  "D# major": 3, "Eb major": 3, "E major": 4, "F major": 5,
  "F# major": 6, "Gb major": 6, "G major": 7,
  "G# major": 8, "Ab major": 8, "A major": 9,
  "A# major": 10, "Bb major": 10, "B major": 11,
  "C minor": 0, "C# minor": 1, "Db minor": 1, "D minor": 2,
  "D# minor": 3, "Eb minor": 3, "E minor": 4, "F minor": 5,
  "F# minor": 6, "Gb minor": 6, "G minor": 7,
  "G# minor": 8, "Ab minor": 8, "A minor": 9,
  "A# minor": 10, "Bb minor": 10, "B minor": 11,
};

const MAJOR_KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

/**
 * Transpose a single note token (e.g., "C4" or "F#5") by semitones.
 * Returns the transposed note. Rests ("R") pass through unchanged.
 */
function transposeNoteStr(noteStr: string, semitones: number): string {
  const trimmed = noteStr.trim();
  if (trimmed === "R" || trimmed === "r") return trimmed;

  const midi = parseNoteToMidi(trimmed);
  if (midi < 0) return trimmed; // rest

  const transposed = midi + semitones;
  if (transposed < 0 || transposed > 127) {
    throw new Error(`Transposition puts "${trimmed}" out of MIDI range (${transposed})`);
  }

  return midiToNoteName(transposed);
}

/**
 * Transpose one "note[:duration]" part (e.g., "C4" or "E4:q"),
 * preserving any duration suffix.
 */
function transposeTokenPart(part: string, semitones: number): string {
  const colonIdx = part.indexOf(":");
  if (colonIdx >= 0) {
    const noteStr = part.substring(0, colonIdx);
    const duration = part.substring(colonIdx); // includes the ":"
    return `${transposeNoteStr(noteStr, semitones)}${duration}`;
  }
  return transposeNoteStr(part, semitones);
}

/**
 * Transpose a hand string (e.g., "C4:q E4:q G4:h" or "C4+E4+G4:q").
 *
 * Handles:
 * - Single notes with duration: "C4:q"
 * - Chords ("+"-joined simultaneous notes, as emitted by the MIDI ingest
 *   and consumed by parseChordToken): "C4+E4+G4:q", "C4:q+E4:q"
 * - Rests: "R:q" or "R"
 * - Multiple beats separated by spaces with durations
 */
function transposeHandString(hand: string, semitones: number): string {
  if (!hand || hand.trim() === "" || hand.trim() === "R") return hand;

  // Split into space-separated tokens
  const tokens = hand.split(/\s+/);
  const result: string[] = [];

  for (const token of tokens) {
    if (!token) continue;

    // Chord tokens join simultaneous notes with "+" — transpose each
    // joined note, keeping any per-part duration suffix in place.
    // Non-chord tokens are a single-element split, handled identically.
    result.push(
      token
        .split("+")
        .map((part) => transposeTokenPart(part, semitones))
        .join("+")
    );
  }

  return result.join(" ");
}

/**
 * Compute the new key signature after transposition.
 */
function transposeKey(key: string, semitones: number): string {
  const offset = KEY_MAP[key];
  if (offset === undefined) return key; // unknown key, pass through

  const isMinor = key.includes("minor");
  const newOffset = ((offset + semitones) % 12 + 12) % 12;
  const keyName = isMinor ? MINOR_KEYS[newOffset] : MAJOR_KEYS[newOffset];
  return `${keyName} ${isMinor ? "minor" : "major"}`;
}

/**
 * Transpose a SongEntry by a given number of semitones.
 *
 * Returns a new SongEntry with:
 * - All notes in all measures shifted by `semitones`
 * - Key signature updated
 * - ID suffixed with transposition info
 * - Title annotated with new key
 *
 * @param song - The song to transpose
 * @param semitones - Number of semitones to shift (positive = up, negative = down)
 * @returns A new SongEntry (original is not modified)
 */
export function transposeSong(song: SongEntry, semitones: number): SongEntry {
  // JavaScript's NaN comparisons are always false, so the MIDI-range guard
  // in transposeNoteStr (`transposed < 0 || transposed > 127`) silently
  // lets a NaN semitones value slip through uncaught — reject it once,
  // loudly, at the entry point instead (F-1b8c194a).
  if (!Number.isFinite(semitones) || !Number.isInteger(semitones)) {
    throw new Error(`semitones must be a finite integer: got ${semitones}`);
  }
  if (semitones === 0) return { ...song };

  const newKey = transposeKey(song.key, semitones);
  const direction = semitones > 0 ? "up" : "down";
  const absSemitones = Math.abs(semitones);

  const newMeasures: Measure[] = song.measures.map((m) => ({
    ...m,
    rightHand: transposeHandString(m.rightHand, semitones),
    leftHand: transposeHandString(m.leftHand, semitones),
  }));

  return {
    ...song,
    id: `${song.id}-transposed-${direction}${absSemitones}`,
    title: `${song.title} (${newKey})`,
    key: newKey,
    measures: newMeasures,
  };
}
