// ─── Song Types ─────────────────────────────────────────────────────────────
//
// The hybrid format has three layers:
//   1. Metadata   — structured JSON (genre, key, tempo, difficulty, etc.)
//   2. Musical Language — human-readable descriptions for LLM reasoning
//   3. Code-ready — measure-by-measure note data the runtime can consume
//
// An LLM can read the "musicalLanguage" block to explain a song to a student,
// then use the "measures" array to drive MIDI playback or generate exercises.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Enums ──────────────────────────────────────────────────────────────────

/** Genres supported by the library. */
export const GENRES = [
  "classical",
  "jazz",
  "pop",
  "blues",
  "rock",
  "rnb",
  "soul",
  "latin",
  "film",
  "ragtime",
  "new-age",
  "folk",
] as const;

export type Genre = (typeof GENRES)[number];

/** Difficulty levels for song entries. */
export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** How notes are expressed in the measures array. */
export type NoteFormat = "scientific" | "midi-number" | "letter";

// ─── Musical Language Layer ─────────────────────────────────────────────────

/**
 * Human-readable musical context — the part an LLM reads to *understand*
 * the song before deciding how to teach or perform it.
 */
export interface MusicalLanguage {
  /** 1–3 sentence overview of the piece (mood, era, why it matters). */
  description: string;

  /** Musical structure: "ABA", "Verse-Chorus-Verse", "Rondo ABACA", etc. */
  structure: string;

  /** Notable moments an LLM can reference when teaching. */
  keyMoments: string[];

  /** Pedagogical notes: what the student will learn from this piece. */
  teachingGoals: string[];

  /** Style/feel hints for performance: "legato", "swing eighths", etc. */
  styleTips: string[];
}

// ─── Code-Ready Layer ───────────────────────────────────────────────────────

/**
 * A single measure of piano music, code-ready for MIDI playback or analysis.
 *
 * Notes use scientific pitch notation by default: "C4", "F#5", "Bb3".
 * Chords are space-separated: "C4 E4 G4".
 * Rests are written as "R".
 * Duration is encoded inline: "C4:q" (quarter), "E4:h" (half), "G4:w" (whole),
 * "A4:e" (eighth), "B4:s" (sixteenth). Default is quarter if omitted.
 */
export interface Measure {
  /** 1-based measure number. */
  number: number;

  /** Right-hand notes (treble clef). */
  rightHand: string;

  /** Left-hand notes (bass clef). */
  leftHand: string;

  /** Suggested fingering, e.g. "1-2-3-5" or "RH: 1-3-5, LH: 5-3-1". */
  fingering?: string;

  /** Per-measure teaching note the LLM can read aloud or display. */
  teachingNote?: string;

  /**
   * Optional dynamics/expression mark for this measure.
   * Standard markings: "pp", "p", "mp", "mf", "f", "ff", "crescendo", "decrescendo".
   */
  dynamics?: string;

  /** Tempo override for this measure (rubato, ritardando, etc.). */
  tempoOverride?: number;
}

// ─── Section Markers ────────────────────────────────────────────────────────

/**
 * A labeled section of a song (e.g., Intro, Verse, Chorus, Bridge).
 * Sections divide the measure array into named regions for teaching,
 * navigation, and structural analysis.
 */
export interface Section {
  /** Section label, e.g. "Intro", "Verse 1", "Chorus", "Coda". */
  name: string;

  /** First measure of this section (1-based, inclusive). */
  startMeasure: number;

  /** Last measure of this section (1-based, inclusive). */
  endMeasure: number;

  /** Optional description for teaching context. */
  description?: string;
}

// ─── Song Entry (the complete hybrid record) ────────────────────────────────

export interface SongEntry {
  /** Unique slug: kebab-case, e.g. "moonlight-sonata-mvt1". */
  id: string;

  /** Human-readable title. */
  title: string;

  /** Genre — must be one of the 10 canonical genres. */
  genre: Genre;

  /** Composer or artist (undefined for traditional/anonymous). */
  composer?: string;

  /** Arranger (if this is a simplified or adapted version). */
  arranger?: string;

  /** Difficulty level. */
  difficulty: Difficulty;

  /** Key signature, e.g. "C major", "A minor", "Bb major". */
  key: string;

  /** Tempo in BPM (the default/starting tempo). */
  tempo: number;

  /** Time signature, e.g. "4/4", "3/4", "6/8". */
  timeSignature: string;

  /** Approximate duration in seconds at the given tempo. */
  durationSeconds: number;

  /** The LLM-readable musical language layer. */
  musicalLanguage: MusicalLanguage;

  /** Code-ready measure data for playback and analysis. */
  measures: Measure[];

  /** Freeform tags for search/filtering. */
  tags: string[];

  /** Source/attribution for the arrangement. */
  source?: string;

  /** Optional section markers for structural navigation. */
  sections?: Section[];
}

// ─── Registry Types ─────────────────────────────────────────────────────────

/** Summary stats returned by the registry. */
export interface RegistryStats {
  totalSongs: number;
  byGenre: Record<Genre, number>;
  byDifficulty: Record<Difficulty, number>;
  totalMeasures: number;
}

/** Search options for filtering songs. */
export interface SearchOptions {
  genre?: Genre;
  difficulty?: Difficulty;
  query?: string;
  tags?: string[];
  maxDuration?: number;
  minDuration?: number;
  /** Case-insensitive substring match on key signature (e.g. "minor", "C major"). */
  key?: string;
  /** Case-insensitive substring match on composer name. */
  composer?: string;
}
