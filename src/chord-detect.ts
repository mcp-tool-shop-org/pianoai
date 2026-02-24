// ─── ai-jam-sessions: Chord Detection ────────────────────────────────────────
//
// Simple chord detection from a set of MIDI note numbers.
// Maps pitch-class sets to chord names. Designed for the playback HUD.
//
// Usage:
//   import { detectChord } from "./chord-detect.js";
//   const chord = detectChord([60, 64, 67]);  // → "C"
//   const chord = detectChord([55, 58, 62]);  // → "Gm"
// ─────────────────────────────────────────────────────────────────────────────

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Chord pattern: intervals from root as a sorted set of semitones. */
interface ChordPattern {
  intervals: number[];
  suffix: string;
}

/**
 * Known chord patterns, ordered by priority (simpler chords first).
 * When multiple patterns match, the first match wins.
 */
const PATTERNS: ChordPattern[] = [
  // Triads
  { intervals: [0, 4, 7],     suffix: "" },       // major
  { intervals: [0, 3, 7],     suffix: "m" },      // minor
  { intervals: [0, 3, 6],     suffix: "dim" },    // diminished
  { intervals: [0, 4, 8],     suffix: "aug" },    // augmented
  { intervals: [0, 5, 7],     suffix: "sus4" },   // suspended 4th
  { intervals: [0, 2, 7],     suffix: "sus2" },   // suspended 2nd

  // Seventh chords
  { intervals: [0, 4, 7, 11], suffix: "maj7" },   // major 7th
  { intervals: [0, 3, 7, 10], suffix: "m7" },     // minor 7th
  { intervals: [0, 4, 7, 10], suffix: "7" },      // dominant 7th
  { intervals: [0, 3, 6, 10], suffix: "m7b5" },   // half-diminished
  { intervals: [0, 3, 6, 9],  suffix: "dim7" },   // fully diminished 7th
  { intervals: [0, 4, 8, 11], suffix: "maj7#5" }, // augmented major 7th
  { intervals: [0, 3, 7, 11], suffix: "mMaj7" },  // minor-major 7th
];

/**
 * Detect a chord from a set of MIDI note numbers.
 *
 * Returns a chord name string (e.g. "Cm7", "F#", "Bbdim") or null
 * if no known pattern matches. Prefers the bass note as root when
 * multiple roots could match.
 */
export function detectChord(midiNotes: number[]): string | null {
  if (midiNotes.length < 2) return null;

  // Extract unique pitch classes
  const pitchClasses = [...new Set(midiNotes.map(n => n % 12))].sort((a, b) => a - b);
  if (pitchClasses.length < 2) return null;

  // Find the bass note (lowest MIDI) — prefer it as root
  const bassNote = Math.min(...midiNotes);
  const bassPc = bassNote % 12;

  // Try each of the 12 possible roots, but try bass note first
  const rootOrder = [bassPc, ...Array.from({ length: 12 }, (_, i) => i).filter(r => r !== bassPc)];

  for (const root of rootOrder) {
    const intervals = pitchClasses.map(pc => (pc - root + 12) % 12).sort((a, b) => a - b);

    for (const pattern of PATTERNS) {
      if (matchesPattern(intervals, pattern.intervals)) {
        const name = NOTE_NAMES[root] + pattern.suffix;
        // Add slash bass if the bass note isn't the root
        if (bassPc !== root && midiNotes.length >= 3) {
          return `${name}/${NOTE_NAMES[bassPc]}`;
        }
        return name;
      }
    }
  }

  return null;
}

/**
 * Check if a set of intervals matches a chord pattern.
 * The input intervals may be a superset (extra notes are OK for
 * matching triads within 7th chords), but the pattern intervals
 * must all be present.
 */
function matchesPattern(intervals: number[], pattern: number[]): boolean {
  return pattern.every(p => intervals.includes(p));
}

/**
 * Get note names from MIDI numbers (for HUD display).
 * Returns compact note names like "C4 E4 G4".
 */
export function midiNotesToNames(midiNotes: number[]): string {
  return midiNotes
    .sort((a, b) => a - b)
    .map(midi => {
      const octave = Math.floor(midi / 12) - 1;
      const noteIndex = midi % 12;
      return `${NOTE_NAMES[noteIndex]}${octave}`;
    })
    .join(" ");
}
