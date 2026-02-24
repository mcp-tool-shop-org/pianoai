// ─── ai-jam-sessions: Core Types ─────────────────────────────────────────────
//
// Session management, MIDI playback, and teaching interaction types.
// These bridge ai-music-sheets (the library) with the runtime (MIDI + voice).
// ─────────────────────────────────────────────────────────────────────────────

import type { SongEntry, Measure, Genre, Difficulty } from "./songs/types.js";

// ─── MIDI Types ─────────────────────────────────────────────────────────────

/** MIDI connection status. */
export type MidiStatus = "disconnected" | "connecting" | "connected" | "error";

/** Parsed note ready for MIDI output. */
export interface MidiNote {
  /** MIDI note number (0-127). Middle C = 60. */
  note: number;

  /** Velocity (0-127). 0 = note off. */
  velocity: number;

  /** Duration in milliseconds. */
  durationMs: number;

  /** MIDI channel (0-15). Default 0. */
  channel: number;
}

/** A parsed beat within a measure — one or more simultaneous notes. */
export interface Beat {
  /** Notes to play simultaneously (chord or single note). */
  notes: MidiNote[];

  /** Which hand: "right" or "left". */
  hand: "right" | "left";
}

/** A fully parsed measure ready for playback. */
export interface PlayableMeasure {
  /** Original measure data from the song. */
  source: Measure;

  /** Right-hand beats in chronological order. */
  rightBeats: Beat[];

  /** Left-hand beats in chronological order. */
  leftBeats: Beat[];
}

// ─── Session Types ──────────────────────────────────────────────────────────

/** Session state machine. */
export type SessionState =
  | "idle"        // No song loaded
  | "loaded"      // Song loaded, ready to play
  | "playing"     // Actively playing through MIDI
  | "paused"      // Playback paused mid-song
  | "finished";   // Song completed

/** Playback mode. */
export type PlaybackMode =
  | "full"        // Play the entire song straight through
  | "measure"     // Play one measure at a time, wait for user
  | "hands"       // Play each hand separately, then together
  | "loop";       // Loop a range of measures

/** Sync mode for voice + piano coordination. */
export type SyncMode =
  | "concurrent"  // Voice and piano play at the same time (duet feel)
  | "before";     // Voice speaks notes before piano plays (lecture style)

/** A practice session. */
export interface Session {
  /** Unique session ID. */
  id: string;

  /** The song being practiced. */
  song: SongEntry;

  /** Current session state. */
  state: SessionState;

  /** Playback mode. */
  mode: PlaybackMode;

  /** Sync mode for voice + piano coordination. */
  syncMode: SyncMode;

  /** Current measure index (0-based). */
  currentMeasure: number;

  /** Tempo override (BPM). Null = use song's default tempo. */
  tempoOverride: number | null;

  /** Speed multiplier (0.5 = half, 1.0 = normal, 2.0 = double). */
  speed: number;

  /** Measure range for loop mode [start, end] (1-based, inclusive). */
  loopRange: [number, number] | null;

  /** Session start time. */
  startedAt: Date;

  /** Total measures played in this session. */
  measuresPlayed: number;

  /** Voice feedback enabled. */
  voiceEnabled: boolean;
}

/** Progress update — emitted during playback. */
export interface PlaybackProgress {
  /** Current measure (1-based). */
  currentMeasure: number;

  /** Total measures in the song. */
  totalMeasures: number;

  /** Completion ratio (0.0 – 1.0). */
  ratio: number;

  /** Percentage string (e.g. "50%"). */
  percent: string;

  /** Elapsed time since playback started (ms). */
  elapsedMs: number;
}

/** Progress callback — called at configurable intervals during playback. */
export type ProgressCallback = (progress: PlaybackProgress) => void;

/** Options for creating a new session. */
export interface SessionOptions {
  /** Playback mode (default: "full"). */
  mode?: PlaybackMode;

  /**
   * Sync mode for voice + piano coordination (default: "concurrent").
   * "concurrent" = voice and piano play simultaneously (duet feel).
   * "before" = voice speaks notes before piano plays (lecture style).
   */
  syncMode?: SyncMode;

  /** Tempo override in BPM (default: song's tempo). */
  tempo?: number;

  /**
   * Speed multiplier (default: 1.0).
   * 0.5 = half speed (practice slow), 1.0 = normal, 2.0 = double speed.
   * Stacks with tempo override: effective tempo = (override ?? song.tempo) * speed.
   */
  speed?: number;

  /** Loop range [start, end] for loop mode. */
  loopRange?: [number, number];

  /** Enable voice feedback (default: true). */
  voice?: boolean;

  /** Teaching hook for interjections during playback. */
  teachingHook?: TeachingHook;

  /** Progress callback — called after each measure completes. */
  onProgress?: ProgressCallback;

  /**
   * Progress notification interval (0.0 – 1.0, default: 0.1 = every 10%).
   * Set to 0 to fire after every measure. Set to 1 to only fire at completion.
   */
  progressInterval?: number;
}

// ─── VMPK Types ─────────────────────────────────────────────────────────────

/** MIDI connection configuration. */
export interface VmpkConfig {
  /** MIDI output port name, regex pattern, or "auto" to auto-detect. Default: "auto" */
  portName: string | RegExp;

  /** MIDI channel (0-15). Default: 0. */
  channel: number;

  /** Default velocity (0-127). Default: 80. */
  velocity: number;
}

/** VMPK connector interface — for DI/testing. */
export interface VmpkConnector {
  /** Connect to the MIDI output port. */
  connect(): Promise<void>;

  /** Disconnect from the MIDI output port. */
  disconnect(): Promise<void>;

  /** Get current connection status. */
  status(): MidiStatus;

  /** List available MIDI output ports. */
  listPorts(): string[];

  /** Send a note-on message. */
  noteOn(note: number, velocity: number, channel?: number): void;

  /** Send a note-off message. */
  noteOff(note: number, channel?: number): void;

  /** Send all-notes-off (panic). */
  allNotesOff(channel?: number): void;

  /** Play a single MidiNote (note-on, wait, note-off). */
  playNote(note: MidiNote): Promise<void>;
}

// ─── Parse Warning ──────────────────────────────────────────────────────────

/** Warning emitted when a note/measure can't be parsed. */
export interface ParseWarning {
  /** Where the error occurred. */
  location: string;

  /** The offending token or string. */
  token: string;

  /** The error message. */
  message: string;
}

// ─── Note Parsing Types ─────────────────────────────────────────────────────

/** Duration suffix → multiplier (relative to quarter note). */
export const DURATION_MAP: Record<string, number> = {
  w: 4.0,       // whole
  "h.": 3.0,    // dotted half
  h: 2.0,       // half
  "q.": 1.5,    // dotted quarter
  ht: 4 / 3,    // half triplet (2/3 of a half = 4/3 quarter)
  q: 1.0,       // quarter
  "e.": 0.75,   // dotted eighth
  qt: 2 / 3,    // quarter triplet (2/3 of a quarter)
  e: 0.5,       // eighth
  et: 1 / 3,    // eighth triplet (2/3 of an eighth = 1/3 quarter)
  s: 0.25,      // sixteenth
};

/**
 * Map from note name to semitone offset from C.
 * Used for scientific pitch → MIDI number conversion.
 */
export const NOTE_OFFSETS: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

// ─── Teaching Hook Types ────────────────────────────────────────────────────

/** Priority level for teaching interjections. */
export type TeachingPriority = "low" | "med" | "high";

/** A teaching interjection — something the AI teacher says during practice. */
export interface TeachingInterjection {
  /** The text to speak/display. */
  text: string;

  /** Priority: low = ambient, med = useful, high = critical instruction. */
  priority: TeachingPriority;

  /** Why this interjection was triggered. */
  reason: "measure-start" | "key-moment" | "style-tip" | "encouragement" | "correction" | "custom";

  /** Source: which measure or song element triggered this. */
  source?: string;
}

/**
 * A voice directive — structured request to speak via mcp-voice-soundboard.
 * The hook produces these; the caller (CLI, LLM, test) routes them to voice_speak.
 */
export interface VoiceDirective {
  /** Text to speak. */
  text: string;

  /** Voice preset name (e.g. "narrator", "teacher"). */
  voice?: string;

  /** Speed multiplier for speech (0.5–2.0). */
  speed?: number;

  /** Whether to wait for speech to finish before continuing playback. */
  blocking: boolean;
}

/** Callback that receives voice directives. */
export type VoiceSink = (directive: VoiceDirective) => Promise<void>;

/**
 * An aside directive — structured request to push to mcp-aside inbox.
 */
export interface AsideDirective {
  /** The text to display. */
  text: string;

  /** Priority level. */
  priority: "low" | "med" | "high";

  /** Why this was triggered. */
  reason: string;

  /** Source context (e.g. "measure-3", "key-moment"). */
  source?: string;

  /** Tags for filtering. */
  tags?: string[];
}

/** Callback that receives aside directives. */
export type AsideSink = (directive: AsideDirective) => Promise<void>;

/** Options for the live feedback teaching hook. */
export interface LiveFeedbackHookOptions {
  /** Emit a voice encouragement every N measures (default: 4). */
  voiceInterval?: number;

  /** React to dynamics changes with aside tips (default: true). */
  encourageOnDynamics?: boolean;

  /** Warn about difficult passages with voice tips (default: true). */
  warnOnDifficult?: boolean;

  /** Voice preset name (default: undefined = server default). */
  voice?: string;

  /** Speech speed (default: 1.0). */
  speechSpeed?: number;
}

/**
 * Teaching hook interface — inject this into sessions to receive
 * teaching interjections during playback. Implementations can route
 * to mcp-voice-soundboard, mcp-aside, console, or anything else.
 */
export interface TeachingHook {
  /** Called before a measure plays — opportunity to announce what's coming. */
  onMeasureStart(
    measureNumber: number,
    teachingNote: string | undefined,
    dynamics: string | undefined
  ): Promise<void>;

  /** Called when a key moment in the song is reached. */
  onKeyMoment(moment: string): Promise<void>;

  /** Called when the song finishes. */
  onSongComplete(measuresPlayed: number, songTitle: string): Promise<void>;

  /** Push a custom interjection. */
  push(interjection: TeachingInterjection): Promise<void>;
}
