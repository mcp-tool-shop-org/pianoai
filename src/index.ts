// ─── pianoai ────────────────────────────────────────────────────────────────
//
// Piano player — plays songs through speakers or MIDI.
// Built-in piano engine included. No external software required.
//
// Usage:
//   import { createSession, createAudioEngine, getSong } from "@mcptoolshop/pianoai";
// ─────────────────────────────────────────────────────────────────────────────

// Re-export song library
export {
  getAllSongs,
  getSong,
  getSongsByGenre,
  getSongsByDifficulty,
  searchSongs,
  getStats,
  registerSong,
  validateSong,
  clearRegistry,
  initializeRegistry,
  saveSong,
  loadSongFile,
  loadSongsFromDir,
  midiToSongEntry,
  GENRES,
  DIFFICULTIES,
} from "./songs/index.js";

export type {
  SongEntry,
  Measure,
  MusicalLanguage,
  Genre,
  Difficulty,
} from "./songs/types.js";

// Export session engine
export { createSession, SessionController } from "./session.js";

// Export piano engine (built-in audio — plays through speakers)
export { createAudioEngine } from "./audio-engine.js";

// Export vocal engine (sustained vowel synthesis — pitched to MIDI notes)
export { createVocalEngine } from "./vocal-engine.js";
export type { VocalEngineOptions } from "./vocal-engine.js";

// Export tract engine (Pink Trombone physical vocal tract model)
export { createTractEngine, TRACT_VOICE_IDS } from "./vocal-tract-engine.js";
export type { TractEngineOptions, TractVoiceId } from "./vocal-tract-engine.js";

// Export MIDI connector (optional — for routing to external MIDI software)
export { createVmpkConnector, createMockVmpkConnector } from "./vmpk.js";

// Export note parser
export {
  parseNoteToMidi,
  parseDuration,
  durationToMs,
  parseNoteToken,
  parseHandString,
  parseMeasure,
  safeParseNoteToken,
  safeParseHandString,
  safeParseMeasure,
  midiToNoteName,
  noteToSingable,
  handToSingableText,
  measureToSingableText,
} from "./note-parser.js";

export type { SingAlongMode, SingAlongTextOptions } from "./note-parser.js";

// Export teaching engine
export {
  createConsoleTeachingHook,
  createSilentTeachingHook,
  createRecordingTeachingHook,
  createCallbackTeachingHook,
  createVoiceTeachingHook,
  createAsideTeachingHook,
  createSingAlongHook,
  createLiveFeedbackHook,
  composeTeachingHooks,
  detectKeyMoments,
} from "./teaching.js";

export type {
  TeachingEvent,
  TeachingCallbacks,
  VoiceHookOptions,
  AsideHookOptions,
  SingAlongHookOptions,
} from "./teaching.js";

// Export MIDI file parser
export { parseMidiFile, parseMidiBuffer } from "./midi/parser.js";
export type { MidiNoteEvent, TempoEvent, ParsedMidi } from "./midi/types.js";

// Export MIDI playback engine
export { MidiPlaybackEngine } from "./playback/midi-engine.js";
export type {
  MidiPlaybackOptions,
  MidiPlaybackState,
} from "./playback/midi-engine.js";

// Export playback timing utilities
export {
  calculateSchedule,
  totalDurationMs,
  clusterEvents,
  sliceEventsByTime,
} from "./playback/timing.js";
export type { ScheduledEvent } from "./playback/timing.js";

// Export real-time playback controller
export { PlaybackController, createPlaybackController } from "./playback/controls.js";
export type {
  PlaybackEventType,
  PlaybackEvent,
  NoteOnEvent,
  NoteOffEvent,
  StateChangeEvent,
  SpeedChangeEvent,
  ProgressEvent,
  ErrorEvent,
  AnyPlaybackEvent,
  PlaybackListener,
  PlaybackControlOptions,
} from "./playback/controls.js";

// Export MIDI singing + feedback hooks
export {
  createSingOnMidiHook,
  midiNoteToSingable,
  clusterToSingable,
  contourDirection,
} from "./teaching/sing-on-midi.js";
export type { SingOnMidiOptions } from "./teaching/sing-on-midi.js";

export { createMidiFeedbackHook } from "./teaching/midi-feedback.js";
export type { MidiFeedbackOptions } from "./teaching/midi-feedback.js";

// Export MIDI live feedback (position-aware)
export { createLiveMidiFeedbackHook } from "./teaching/live-midi-feedback.js";
export type { LiveMidiFeedbackOptions } from "./teaching/live-midi-feedback.js";

// Export position tracker
export { PositionTracker, createPositionTracker } from "./playback/position.js";
export type { PositionSnapshot, PositionCallback } from "./playback/position.js";

// Export voice filter
export { filterClusterForVoice } from "./teaching/sing-on-midi.js";
export type { SingVoiceFilter } from "./teaching/sing-on-midi.js";

// Export playback schemas
export {
  PlaySourceSchema,
  LibraryPlaySchema,
  FilePlaySchema,
  UrlPlaySchema,
  PlaybackOptionsSchema,
} from "./schemas.js";
export type { PlaySource, PlaybackOptions } from "./schemas.js";

// Export types
export type {
  Session,
  SessionOptions,
  SessionState,
  PlaybackMode,
  SyncMode,
  PlaybackProgress,
  ProgressCallback,
  ParseWarning,
  MidiNote,
  Beat,
  PlayableMeasure,
  MidiStatus,
  VmpkConfig,
  VmpkConnector,
  TeachingHook,
  TeachingInterjection,
  TeachingPriority,
  VoiceDirective,
  VoiceSink,
  AsideDirective,
  AsideSink,
  LiveFeedbackHookOptions,
} from "./types.js";

export { DURATION_MAP, NOTE_OFFSETS } from "./types.js";
