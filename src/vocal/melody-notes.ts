// Extract a monophonic melody (highest pitch per beat, right hand) from a
// library song and turn it into ScoreNotes for the lyric aligner.

import { parseMeasure } from "../note-parser.js";
import type { SongEntry } from "../songs/types.js";
import type { ScoreNote } from "./types.js";

export interface MelodyNoteOptions {
  /** Inclusive 1-based measure range. Defaults to the whole song. */
  startMeasure?: number;
  endMeasure?: number;
  /** BPM used to convert durations. Defaults to song.tempo. */
  tempo?: number;
  /** Speed multiplier applied on top of tempo (same as Session.effectiveTempo). */
  speed?: number;
  /** Octave-place the phrase into G3–E4. Additive-only; tract sings written pitch. */
  fitVoiceRange?: boolean;
}

export interface MelodyExtractResult {
  notes: ScoreNote[];
  warnings: string[];
  startMeasure: number;
  endMeasure: number;
  effectiveBpm: number;
}

/**
 * Highest sounding pitch in a beat, skipping rests (midi === -1).
 */
function highestMidi(midis: number[]): number | null {
  const sounding = midis.filter((n) => n >= 0);
  if (sounding.length === 0) return null;
  return Math.max(...sounding);
}

export function extractMelodyNotes(
  song: SongEntry,
  options: MelodyNoteOptions = {},
): MelodyExtractResult {
  const start = Math.max(1, options.startMeasure ?? 1);
  const end = Math.min(song.measures.length, options.endMeasure ?? song.measures.length);
  const warnings: string[] = [];
  if (start > end) {
    warnings.push(`empty measure range ${start}-${end}`);
    return { notes: [], warnings, startMeasure: start, endMeasure: end, effectiveBpm: song.tempo };
  }

  const base = options.tempo ?? song.tempo;
  const speed = options.speed ?? 1;
  const bpm = base * speed;
  const notes: ScoreNote[] = [];
  let t = 0;
  let idx = 0;

  for (const measure of song.measures) {
    if (measure.number < start || measure.number > end) continue;
    const pm = parseMeasure(measure, bpm);
    const beats = pm.rightBeats.length > 0 ? pm.rightBeats : pm.leftBeats;
    if (beats.length === 0) {
      warnings.push(`measure ${measure.number} has no notes`);
      continue;
    }
    for (const beat of beats) {
      const durMs = beat.notes[0]?.durationMs ?? 0;
      const durSec = durMs / 1000;
      const midi = highestMidi(beat.notes.map((n) => n.note));
      if (midi === null) {
        t += durSec;
        continue;
      }
      const vel = beat.notes.find((n) => n.note === midi)?.velocity ?? 80;
      notes.push({
        id: `m${measure.number}-${idx}`,
        startSec: t,
        durationSec: Math.max(0.001, durSec),
        midi,
        velocity: vel / 127,
      });
      idx += 1;
      t += durSec;
    }
  }

  if (notes.length === 0) {
    warnings.push(`no sounding melody notes in measures ${start}-${end}`);
  }

  let outNotes = notes;
  if (options.fitVoiceRange) {
    const placed = placePhraseInVoiceRange(notes);
    outNotes = placed.notes;
    if (placed.shift !== 0) {
      warnings.push(
        `melody transposed ${placed.shift} semitones into a sung range (median MIDI ${placed.medianBefore} → ${placed.medianAfter})`,
      );
    }
  }

  return {
    notes: outNotes,
    warnings,
    startMeasure: start,
    endMeasure: end,
    effectiveBpm: bpm,
  };
}

/** Comfortable speech-like F0 for additive formant presets: G3–E4.
 *  Front vowels (EE) have F1 ~300 Hz; G4 (392 Hz) sits above that and
 *  collapses into a metallic shriek (Joliveau 2004 / Titze 2008). */
const VOICE_RANGE_LOW = 55;  // G3
const VOICE_RANGE_HIGH = 64; // E4

export function placePhraseInVoiceRange(notes: ScoreNote[]): {
  notes: ScoreNote[];
  shift: number;
  medianBefore: number;
  medianAfter: number;
} {
  if (notes.length === 0) {
    return { notes, shift: 0, medianBefore: 0, medianAfter: 0 };
  }
  const sorted = [...notes.map((n) => n.midi)].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  let shift = 0;
  while (median + shift > VOICE_RANGE_HIGH) shift -= 12;
  while (median + shift < VOICE_RANGE_LOW) shift += 12;
  if (shift === 0) {
    return { notes, shift: 0, medianBefore: median, medianAfter: median };
  }
  return {
    notes: notes.map((n) => ({ ...n, midi: n.midi + shift })),
    shift,
    medianBefore: median,
    medianAfter: median + shift,
  };
}

const VIBRATO_MIN_NOTE_SEC = 0.4;

/** Phrase-moving vibrato: ~5.5 Hz rising toward 6.3 Hz, skipped on short notes. */
export function applyPhraseVibrato(notes: ScoreNote[]): ScoreNote[] {
  const n = Math.max(1, notes.length - 1);
  return notes.map((note, i) => {
    if (note.durationSec < VIBRATO_MIN_NOTE_SEC) return note;
    return {
      ...note,
      vibrato: {
        rateHz: 5.5 + 0.8 * (i / n),
        depthCents: 50,
        onsetSec: Math.min(0.25, note.durationSec * 0.4),
      },
    };
  });
}
