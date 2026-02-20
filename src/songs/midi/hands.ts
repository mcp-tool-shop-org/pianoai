// ─── Hand Separation & Chord Detection ───────────────────────────────────────
//
// Splits notes into right hand / left hand by a configurable split point,
// groups simultaneous notes into chords, and formats them as notation strings.
// ─────────────────────────────────────────────────────────────────────────────

import type { ResolvedNote } from "./types.js";

// ─── Constants ───────────────────────────────────────────────────────────────

export const DEFAULT_SPLIT_POINT = 60; // Middle C (C4)
export const DEFAULT_CHORD_TOLERANCE = 10; // ticks

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

// ─── Public API ──────────────────────────────────────────────────────────────

/** Result of splitting notes into two hands. */
export interface HandSplit {
  rightHand: ResolvedNote[];
  leftHand: ResolvedNote[];
}

/**
 * Separate notes into right hand and left hand based on split point.
 */
export function separateHands(
  notes: ResolvedNote[],
  splitPoint: number = DEFAULT_SPLIT_POINT,
): HandSplit {
  const rightHand: ResolvedNote[] = [];
  const leftHand: ResolvedNote[] = [];

  for (const note of notes) {
    if (note.noteNumber >= splitPoint) {
      rightHand.push(note);
    } else {
      leftHand.push(note);
    }
  }

  return { rightHand, leftHand };
}

/**
 * Group simultaneous notes (within a tick tolerance window) into chords.
 */
export function groupIntoChords(
  notes: ResolvedNote[],
  tolerance: number = DEFAULT_CHORD_TOLERANCE,
): ResolvedNote[][] {
  if (notes.length === 0) return [];

  const groups: ResolvedNote[][] = [];
  let current: ResolvedNote[] = [notes[0]];

  for (let i = 1; i < notes.length; i++) {
    if (notes[i].startTick - current[0].startTick <= tolerance) {
      current.push(notes[i]);
    } else {
      groups.push(current);
      current = [notes[i]];
    }
  }
  groups.push(current);
  return groups;
}

/**
 * Detect if a group of notes forms a chord (2+ simultaneous notes).
 */
export function isChord(group: ResolvedNote[]): boolean {
  return group.length > 1;
}

// ─── Note Formatting ─────────────────────────────────────────────────────────

/**
 * Convert a MIDI note number to scientific pitch notation.
 * 60 → "C4", 69 → "A4", 48 → "C3"
 */
export function midiNoteToScientific(noteNumber: number): string {
  const octave = Math.floor(noteNumber / 12) - 1;
  const name = NOTE_NAMES[noteNumber % 12];
  return `${name}${octave}`;
}

/**
 * Convert ticks duration to a note duration suffix.
 */
export function ticksToDuration(ticks: number, ticksPerBeat: number): string {
  const ratio = ticks / ticksPerBeat;

  if (Math.abs(ratio - 4) < 0.15) return "w";
  if (Math.abs(ratio - 3) < 0.15) return "h.";
  if (Math.abs(ratio - 2) < 0.15) return "h";
  if (Math.abs(ratio - 1.5) < 0.15) return "q.";
  if (Math.abs(ratio - 4 / 3) < 0.1) return "ht";
  if (Math.abs(ratio - 1) < 0.15) return "q";
  if (Math.abs(ratio - 0.75) < 0.05) return "e.";
  if (Math.abs(ratio - 2 / 3) < 0.08) return "qt";
  if (Math.abs(ratio - 0.5) < 0.1) return "e";
  if (Math.abs(ratio - 1 / 3) < 0.06) return "et";
  if (Math.abs(ratio - 0.25) < 0.06) return "s";

  if (ratio >= 3) return "w";
  if (ratio >= 1.5) return "h";
  if (ratio >= 0.75) return "q";
  if (ratio >= 0.375) return "e";
  return "s";
}

/**
 * Format a single note as scientific notation with duration suffix.
 */
export function formatNote(note: ResolvedNote, ticksPerBeat: number): string {
  const name = midiNoteToScientific(note.noteNumber);
  const dur = ticksToDuration(note.durationTicks, ticksPerBeat);
  return `${name}:${dur}`;
}

/**
 * Format a chord group to the string representation.
 * Single note: "C4:q"
 * Chord: "C4 E4 G4:q" (sorted low to high, duration from longest note)
 */
export function chordToString(chord: ResolvedNote[], ticksPerBeat: number): string {
  if (chord.length === 1) return formatNote(chord[0], ticksPerBeat);

  const maxDur = Math.max(...chord.map(n => n.durationTicks));
  const dur = ticksToDuration(maxDur, ticksPerBeat);
  const noteNames = [...chord]
    .sort((a, b) => a.noteNumber - b.noteNumber)
    .map(n => midiNoteToScientific(n.noteNumber))
    .join("+");
  return `${noteNames}:${dur}`;
}

/**
 * Format a hand's notes into a single notation string.
 * Groups into chords, formats each, joins with spaces.
 * Returns "R:w" (whole rest) if the hand has no notes.
 */
export function formatHand(
  notes: ResolvedNote[],
  ticksPerBeat: number,
  chordTolerance: number = DEFAULT_CHORD_TOLERANCE,
): string {
  if (notes.length === 0) return "R:w";
  const chords = groupIntoChords(notes, chordTolerance);
  return chords.map(c => chordToString(c, ticksPerBeat)).join(" ");
}
