// ─── ai-jam-sessions: Core Types ─────────────────────────────────────────────
//
// Session management, MIDI playback, and teaching interaction types.
// These bridge ai-music-sheets (the library) with the runtime (MIDI + voice).
// ─────────────────────────────────────────────────────────────────────────────

import type { SongEntry, Measure, Genre, Difficulty } from "./songs/types.js";
import type { MidiNoteEvent } from "./midi/types.js";
import type { MetronomeEngine } from "./playback/metronome.js";

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

/**
 * Sound engine identifiers (play_song's `engine` parameter). Single source
 * of truth — mcp-server.ts used to spell this list out at 3 separate sites
 * (the tool's zod enum, an error-message lookup, and server_info's summary
 * line) and they drifted out of sync with each other once already
 * (B-B1-004). Derive from this constant everywhere instead of re-typing
 * the literals.
 */
export const ENGINE_IDS = ["piano", "vocal", "tract", "guitar"] as const;
export type EngineId = (typeof ENGINE_IDS)[number];

/** Human-readable label for each engine id (e.g. for error messages). */
export const ENGINE_LABELS: Record<EngineId, string> = {
  piano: "piano",
  vocal: "vocal",
  tract: "vocal tract",
  guitar: "guitar",
};

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

  /**
   * Metronome click track enabled (mirrors SessionOptions.metronome).
   * Optional — added after `Session` shipped, so an external hand-built
   * `Session` (e.g. a test double implementing this interface) doesn't
   * break; `createSession()` always sets it explicitly. Undefined reads
   * the same as `false` everywhere it's consulted.
   */
  metronomeEnabled?: boolean;

  /**
   * Count-in length in bars (mirrors SessionOptions.countIn). 0 = no
   * count-in. Only actually used when metronomeEnabled is true — stored
   * here as-requested regardless, so it stays introspectable. Optional for
   * the same external-implementor reason as `metronomeEnabled`; undefined
   * reads the same as `0`.
   */
  countInBars?: number;

  /**
   * Click plays only during count-in, silent during actual playback
   * (mirrors SessionOptions.clickOnlyDuringCountIn). Optional for the same
   * external-implementor reason as `metronomeEnabled`; undefined reads the
   * same as `false`.
   */
  clickOnlyDuringCountIn?: boolean;

  /**
   * Performance recording enabled (mirrors SessionOptions.record).
   * Optional for the same external-implementor reason as
   * `metronomeEnabled`; undefined reads the same as `false`.
   */
  recordingEnabled?: boolean;
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

  /** Current playback position in seconds (MIDI file playback only). */
  positionSeconds?: number;

  /** Total duration in seconds (MIDI file playback only). */
  durationSeconds?: number;
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

  /** Enable the metronome click track during playback (default: false). */
  metronome?: boolean;

  /**
   * Count-in length in bars, clicked before playback starts (0 = none).
   * Only takes effect when `metronome` is true. Default: 1 bar when
   * `metronome` is true and `countIn` is left undefined (Logic Pro
   * convention); default 0 when `metronome` is false/omitted.
   */
  countIn?: number;

  /**
   * When true, the click plays only during the count-in and falls silent
   * once real playback begins (default: false — click continues through
   * playback, synced to effectiveTempo()).
   */
  clickOnlyDuringCountIn?: boolean;

  /**
   * Inject a metronome engine factory for tests — called once (if
   * `metronome` is true) to construct this session's MetronomeEngine
   * instance, in place of the default `createMetronome()` (which touches a
   * real AudioContext). See src/playback/metronome.ts.
   */
  metronomeFactory?: () => MetronomeEngine;

  /**
   * Opt in to recording played notes — retrieve via
   * `SessionController.getRecording()` (default: false).
   */
  record?: boolean;
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

// ─── Recording Types ────────────────────────────────────────────────────────

/**
 * A captured performance recording — produced by either playback path when
 * recording is opted into: `PlaybackController` (MIDI-file playback,
 * `source: "midi-playback"`) or `SessionController` (library-song playback,
 * `source: "session"`). Retrieve via each controller's `getRecording()`,
 * which always returns a `Recording` (with `events: []` when recording
 * wasn't enabled or nothing has played yet) rather than null/undefined.
 *
 * IMPORTANT — time units differ BY SOURCE; read the section that applies:
 *
 * `source: "session"` (SessionController / library-song playback):
 *   `events[].time` / `.duration` are NOMINAL song-time seconds — i.e.
 *   what they'd be at speed 1.0, on the `nominalBpm` tempo baseline — even
 *   though the take may have actually sounded faster/slower at whatever
 *   `speed` was in effect while each note played. This is deliberate: the
 *   recording cursor accumulates each increment's nominal duration (the
 *   played/effective-tempo duration converted back to speed-1.0 terms
 *   using the speed live at that moment), so a mid-take `setSpeed()` call
 *   still produces exact, recoverable song-time positions — only the
 *   portion of the take recorded AFTER the change picks up the new speed;
 *   nothing already recorded shifts retroactively. Pass
 *   `{ bpm: recording.nominalBpm }` into `scorePerformance()` so its own
 *   tempo assumption matches this timebase (using `song.tempo` instead
 *   would silently disagree whenever `tempoOverride` was set). Caveat:
 *   `nominalBpm` is captured ONCE when the take begins — a mid-take
 *   `setTempo()` (not `setSpeed()`) changes the nominal tempo baseline
 *   itself partway through, which this scheme does not attempt to
 *   reconcile; only `speed` changes are guaranteed exact.
 *
 * `source: "midi-playback"` (PlaybackController / MIDI-file playback):
 *   `events[].time` / `.duration` are real wall-clock seconds "as actually
 *   heard" — i.e. distorted by whatever `speed` was in effect while each
 *   note played, NOT normalized back to speed-1.0/logical time. A
 *   speed=2.0 recording of a passage has half the real-time gap between
 *   notes that a speed=1.0 recording of the same passage would. This path
 *   has no fixed nominal tempo to normalize against (there's no `bpm`
 *   concept for an arbitrary MIDI file the way there is for a library
 *   song), so it intentionally preserves "how did the student actually
 *   play this" (rushing, dragging, an uneven tempo within one take) rather
 *   than attempting to undo it. If `speedChangedDuringTake` is true, the
 *   take was played at more than one speed and there is no single bpm that
 *   converts its wall-clock times back to a consistent song-time — a
 *   scorer/consumer should warn or refuse rather than silently mis-score it.
 *
 * `startedAtMs` (both sources): wall-clock ms (`Date.now()`) stamped once
 * the take actually begins. For `source: "session"` that's AFTER any
 * count-in has finished clicking — not at the top of `play()`, which would
 * be off by the count-in's own real-world duration — immediately before
 * the first note is scheduled. It is metadata (when the take started), NOT
 * an epoch `events[].time` is computed relative to for that source (those
 * times are nominal/schedule-based — see above); don't derive session-path
 * event times from `Date.now() - startedAtMs`. For `source:
 * "midi-playback"`, `events[].time` IS computed as
 * `(Date.now() - startedAtMs) / 1000` at the moment each note-on fires, so
 * there `startedAtMs` genuinely is the epoch those times are relative to.
 */
export interface Recording {
  /** Captured note events, in the order they were played. Empty when recording wasn't enabled. See the per-source time-unit doc above. */
  events: MidiNoteEvent[];

  /**
   * Speed multiplier in effect as of the most recent play()/query (1.0 =
   * normal) — the LIVE/current value, not the speed at record-start (see
   * `speedAtStart` for that, on the midi-playback source). Useful for
   * display ("what's the dial at right now"); NOT a valid divisor/
   * multiplier for reconstructing `events[].time` from a take that
   * included a mid-take speed change — different portions of the take may
   * have played at different speeds.
   */
  speed: number;

  /** Library song id — set when recorded via SessionController, undefined for MIDI-file playback. */
  songId?: string;

  /** Wall-clock ms (Date.now()) when this recording's take actually began — see the doc above for exactly when that is per source. */
  startedAtMs: number;

  /** Which playback path produced this recording. */
  source: "midi-playback" | "session";

  /**
   * SESSION-SOURCE ONLY (`source: "session"`) — the nominal tempo (BPM at
   * speed 1.0) this recording's `events[].time` / `.duration` are
   * expressed relative to: `tempoOverride ?? song.tempo`, captured once
   * when the take began and held fixed for its duration. Pass this as
   * `scorePerformance(song, recording.events, { bpm: recording.nominalBpm })`.
   * Undefined for `source: "midi-playback"`.
   */
  nominalBpm?: number;

  /**
   * SESSION-SOURCE ONLY — `effectiveTempo()` (nominalBpm × speed) at the
   * moment this take began. Informational only (what the playback actually
   * sounded like at the start) — NOT used to interpret `events[].time`,
   * which is nominal (see `nominalBpm`). Undefined for `source:
   * "midi-playback"`.
   */
  effectiveBpmAtStart?: number;

  /**
   * MIDI-PLAYBACK-SOURCE ONLY (`source: "midi-playback"`) — the speed
   * multiplier in effect when this take began, captured once (unlike
   * `speed` above, which always reflects the current/live value).
   * Undefined for `source: "session"`, which sidesteps needing this by
   * recording nominal time directly (see `nominalBpm`).
   */
  speedAtStart?: number;

  /**
   * MIDI-PLAYBACK-SOURCE ONLY — true if `setSpeed()` was called at least
   * once after this take began, i.e. the take was not played at one
   * constant speed throughout. `events[].time` / `.duration` remain real
   * wall-clock values either way (see above) — this is a warning flag: no
   * single bpm converts a mixed-speed take's wall-clock times back to a
   * consistent song-time, so a scorer/consumer should treat this as
   * unrecoverable-to-nominal-time and warn or refuse rather than silently
   * mis-score it. Always `false`/undefined for `source: "session"`.
   */
  speedChangedDuringTake?: boolean;
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
