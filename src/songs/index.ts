// ─── Songs Subsystem ────────────────────────────────────────────────────────
//
// Everything for the song library: types, registry, loader, MIDI ingest, config.
// ─────────────────────────────────────────────────────────────────────────────

// Types
export type {
  SongEntry,
  Measure,
  MusicalLanguage,
  Genre,
  Difficulty,
  NoteFormat,
  RegistryStats,
  SearchOptions,
} from "./types.js";

export { GENRES, DIFFICULTIES } from "./types.js";

// Registry
export {
  registerSong,
  registerSongs,
  validateSong,
  validateRegistry,
  getSong,
  getAllSongs,
  getSongsByGenre,
  getSongsByDifficulty,
  searchSongs,
  getStats,
  clearRegistry,
} from "./registry.js";

// Song loader (JSON files → registry)
export {
  loadSongsFromDir,
  loadSongFile,
  saveSong,
  initializeRegistry,
} from "./loader.js";

// MIDI ingest pipeline
export { midiToSongEntry, midiNoteToScientific } from "./midi/ingest.js";
export {
  separateHands,
  groupIntoChords,
  isChord,
  formatNote,
  formatHand,
  chordToString,
  ticksToDuration,
} from "./midi/hands.js";
export type { HandSplit } from "./midi/hands.js";
export {
  ticksPerMeasure,
  computeTotalMeasures,
  sliceIntoMeasures,
  parseTimeSignature,
  resolveTimeSignature,
} from "./midi/measures.js";
export type { MeasureBucket } from "./midi/measures.js";

// MIDI ingest types (renamed to avoid collision with src/midi/types.ts)
export type { ResolvedNote, IngestTempoEvent, TimeSigEvent } from "./midi/types.js";

// Config schemas
export {
  SongConfigSchema,
  MusicalLanguageSchema,
  MeasureOverrideSchema,
  SONG_STATUSES,
  validateConfig,
} from "./config/schema.js";
export type { SongConfig, SongStatus, MeasureOverride, ConfigError } from "./config/schema.js";

// Library manager (MIDI-first workflow)
export {
  scanLibrary,
  getLibraryProgress,
  ingestSong,
  initializeFromLibrary,
} from "./library.js";
export type { LibraryEntry, GenreProgress, LibraryProgress } from "./library.js";

// Config loader
export { loadSongConfigs, loadSongConfig, listConfigIds } from "./config/loader.js";

// Jam session
export { generateJamBrief, formatJamBrief, inferChord, computeContour, getStyleGuidance } from "./jam.js";
export type { JamBrief, JamBriefOptions, ChordMeasure, MelodyMeasure } from "./jam.js";
