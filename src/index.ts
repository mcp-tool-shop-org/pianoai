// ─── ai-jam-sessions ────────────────────────────────────────────────────────
//
// Piano player — plays songs through speakers or MIDI.
// Built-in piano engine included. No external software required.
//
// Usage:
//   import { createSession, createAudioEngine, getSong } from "ai-jam-sessions";
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

// Export guitar engine (physically-modeled plucked string synthesis)
export { createGuitarEngine } from "./guitar-engine.js";
export type { GuitarEngineOptions } from "./guitar-engine.js";

// Export guitar tab roll (interactive HTML editor)
export { renderGuitarTab } from "./guitar-tab-roll.js";
export type { GuitarTabOptions } from "./guitar-tab-roll.js";

// Export guitar voice presets and tuning
export {
  GUITAR_VOICE_IDS,
  GUITAR_VOICES,
  GUITAR_TUNINGS,
  GUITAR_TUNING_IDS,
  GUITAR_TUNING_PARAMS,
  getGuitarVoice,
  listGuitarVoices,
  suggestGuitarVoice,
  getMergedGuitarVoice,
  loadGuitarUserTuning,
  saveGuitarUserTuning,
  resetGuitarUserTuning,
} from "./guitar-voices.js";
export type {
  GuitarVoiceConfig,
  GuitarVoiceId,
  GuitarTuning,
  GuitarTuningParam,
  GuitarUserTuning,
} from "./guitar-voices.js";

// Export vocal synth engine (additive synthesis with Kokoro voice presets)
export { createVocalSynthEngine, listVocalSynthPresets } from "./vocal-synth-adapter.js";
export type { VocalSynthOptions, VocalSynthTelemetry } from "./vocal-synth-adapter.js";

// Export layered engine (fan-out connector — play multiple engines at once)
export { createLayeredEngine } from "./layered-engine.js";
export type { LayeredEngineOptions } from "./layered-engine.js";

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

// Export piano-roll renderer
export { renderPianoRoll } from "./piano-roll.js";
export type { PianoRollOptions, PianoRollColorMode } from "./piano-roll.js";

// Export scored piano-roll renderer — a post-take diagnostic overlay built
// from a score-performance.ts PerformanceResult (see NoteVerdict).
export { renderScoredPianoRoll } from "./piano-roll.js";
export type { NoteVerdict, PerformanceResult } from "./score-performance.js";

// Export the practice loop — drills a measure range at reduced tempo,
// ramping toward full speed only after a clean pass. See practice-loop.ts's
// header comment for the design (built entirely on SessionController's
// existing public API).
export {
  PracticeLoop,
  resolvePracticeLoopConfig,
  formatMicroGoal,
  windowSong,
  isCleanPass,
  decideRamp,
  rankWorstMeasures,
  worstMeasuresPracticeConfig,
  measureDiagnostics,
  formatMeasureDiagnosticLines,
  formatPassSummary,
  CLEAN_PASS_MIN_COMPLETENESS,
  DEFAULT_SPEED_START_PCT,
  DEFAULT_SPEED_TARGET_PCT,
  DEFAULT_RAMP_STEP_PCT,
} from "./practice-loop.js";
export type {
  PracticeLoopConfig,
  ResolvedPracticeLoopConfig,
  PracticePassResult,
  PracticeLoopStatus,
  PracticeLoopState,
  PracticeLoopHooks,
  RampDecision,
  MeasureDiagnostic,
} from "./practice-loop.js";

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

// Export metronome engine (click track — count-in + continuous click)
export { createMetronome } from "./playback/metronome.js";
export type { MetronomeEngine, MetronomeOptions } from "./playback/metronome.js";

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
  PlaybackControllerOptions,
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
  Recording,
} from "./types.js";

export { DURATION_MAP, NOTE_OFFSETS } from "./types.js";

// Export the maker harmony verifier (the maker loop's verification gate)
export {
  verifyHarmony,
  formatHarmonyVerdict,
  parseChordSymbol,
  chordSymbolsEquivalent,
  keyToPitchClasses,
  DEFAULT_MAX_CHROMATIC_RATIO,
} from "./maker/verify-harmony.js";
export type {
  MelodyMeasureInput,
  ReharmonizedMeasure,
  VerifyHarmonyOptions,
  HarmonyVerdict,
  ChordFidelityMeasure,
  ConsonanceLabel,
  ConsonanceMeasure,
  ConsonanceKind,
  VoiceLeadingMove,
  ParsedChordSymbol,
} from "./maker/verify-harmony.js";
