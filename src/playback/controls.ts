// ─── Real-Time Playback Controls ────────────────────────────────────────────
//
// Wraps MidiPlaybackEngine with an event-driven control layer.
// External systems (teaching hooks, singing, UI) subscribe to playback events
// and react in real time. All state changes flow through here.
// ─────────────────────────────────────────────────────────────────────────────

import type { ParsedMidi, MidiNoteEvent } from "../midi/types.js";
import type { VmpkConnector, TeachingHook, ProgressCallback } from "../types.js";
import { MidiPlaybackEngine } from "./midi-engine.js";
import type { MidiPlaybackState } from "./midi-engine.js";
import { midiToNoteName } from "../note-parser.js";

// ─── Event Types ────────────────────────────────────────────────────────────

/** Events emitted during playback. */
export type PlaybackEventType =
  | "stateChange"
  | "noteOn"
  | "noteOff"
  | "speedChange"
  | "progress"
  | "error";

/** Payload for playback events. */
export interface PlaybackEvent {
  type: PlaybackEventType;
  /** Playback position in seconds (at speed 1.0) when this event occurred. */
  positionSeconds: number;
  /** Current playback state. */
  state: MidiPlaybackState;
}

export interface NoteOnEvent extends PlaybackEvent {
  type: "noteOn";
  note: number;
  noteName: string;
  velocity: number;
  channel: number;
  duration: number;
  eventIndex: number;
  totalEvents: number;
}

export interface NoteOffEvent extends PlaybackEvent {
  type: "noteOff";
  note: number;
  noteName: string;
  channel: number;
}

export interface StateChangeEvent extends PlaybackEvent {
  type: "stateChange";
  previousState: MidiPlaybackState;
}

export interface SpeedChangeEvent extends PlaybackEvent {
  type: "speedChange";
  previousSpeed: number;
  newSpeed: number;
}

export interface ProgressEvent extends PlaybackEvent {
  type: "progress";
  ratio: number;
  percent: string;
  eventsPlayed: number;
  totalEvents: number;
  elapsedMs: number;
}

export interface ErrorEvent extends PlaybackEvent {
  type: "error";
  error: Error;
}

/** Union of all event types. */
export type AnyPlaybackEvent =
  | NoteOnEvent
  | NoteOffEvent
  | StateChangeEvent
  | SpeedChangeEvent
  | ProgressEvent
  | ErrorEvent;

/** Listener callback. */
export type PlaybackListener = (event: AnyPlaybackEvent) => void;

// ─── Options ────────────────────────────────────────────────────────────────

export interface PlaybackControlOptions {
  /** Speed multiplier (0.1–4.0). Default: 1.0. */
  speed?: number;
  /** Start playback from a specific time offset in seconds. */
  startAtSeconds?: number;
  /** Teaching hook to invoke during playback. */
  teachingHook?: TeachingHook;
  /** Progress callback (in addition to event-based listeners). */
  onProgress?: ProgressCallback;
  /** AbortSignal for external cancellation. */
  signal?: AbortSignal;
}

// ─── PlaybackController ─────────────────────────────────────────────────────

/**
 * Real-time playback controller for MIDI files.
 *
 * Wraps MidiPlaybackEngine with:
 * - Event listeners (noteOn, noteOff, stateChange, speedChange, progress)
 * - Teaching hook integration (fires at note boundaries)
 * - Clean pause/resume/stop with hook notification
 * - Speed change during playback with listener notification
 */
export class PlaybackController {
  private engine: MidiPlaybackEngine;
  private listeners = new Map<PlaybackEventType | "*", Set<PlaybackListener>>();
  private _teachingHook: TeachingHook | null = null;
  private _lastState: MidiPlaybackState = "idle";

  private wrappedConnector: VmpkConnector | null = null;
  private playbackGeneration = 0;

  constructor(
    private readonly connector: VmpkConnector,
    public readonly midi: ParsedMidi
  ) {
    this.engine = new MidiPlaybackEngine(connector, midi);
  }

  // ─── State Accessors ────────────────────────────────────────────────────

  get state(): MidiPlaybackState { return this.engine.state; }
  get speed(): number { return this.engine.speed; }
  get durationSeconds(): number { return this.engine.durationSeconds; }
  get positionSeconds(): number { return this.engine.positionSeconds; }
  get eventsPlayed(): number { return this.engine.eventsPlayed; }
  get totalEvents(): number { return this.engine.totalEvents; }

  // ─── Event System ───────────────────────────────────────────────────────

  /** Subscribe to a specific event type or "*" for all events. */
  on(type: PlaybackEventType | "*", listener: PlaybackListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(type)?.delete(listener);
    };
  }

  /** Remove a listener. */
  off(type: PlaybackEventType | "*", listener: PlaybackListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  /** Remove all listeners. */
  removeAllListeners(): void {
    this.listeners.clear();
  }

  private emit(event: AnyPlaybackEvent): void {
    // Fire type-specific listeners
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      for (const fn of typeListeners) {
        try { fn(event); } catch (e) { console.error('Playback listener error:', e); }
      }
    }
    // Fire wildcard listeners
    const allListeners = this.listeners.get("*");
    if (allListeners) {
      for (const fn of allListeners) {
        try { fn(event); } catch (e) { console.error('Playback listener error:', e); }
      }
    }
  }

  private emitStateChange(previousState: MidiPlaybackState): void {
    if (this.engine.state === previousState) return;
    this.emit({
      type: "stateChange",
      state: this.engine.state,
      previousState,
      positionSeconds: this.engine.positionSeconds,
    });
    this._lastState = this.engine.state;
  }

  // ─── Playback Controls ──────────────────────────────────────────────────

  /**
   * Start or resume MIDI playback with real-time event emission.
   *
   * Wraps the underlying engine, intercepting noteOn/noteOff events
   * to fire listeners and invoke teaching hooks at note boundaries.
   */
  async play(options: PlaybackControlOptions = {}): Promise<void> {
    const previousState = this.engine.state;
    this._teachingHook = options.teachingHook ?? null;

    const startingFresh =
      previousState === "idle" ||
      previousState === "stopped" ||
      previousState === "finished";

    if (startingFresh) {
      const generation = ++this.playbackGeneration;
      this.wrappedConnector = this.createWrappedConnector(generation);
      this.engine = new MidiPlaybackEngine(this.wrappedConnector, this.midi);
    }

    // Emit state change
    const onProgress: ProgressCallback = (p) => {
      this.emit({
        type: "progress",
        state: this.engine.state,
        positionSeconds: this.engine.positionSeconds,
        ratio: p.ratio,
        percent: p.percent,
        eventsPlayed: p.currentMeasure,
        totalEvents: p.totalMeasures,
        elapsedMs: p.elapsedMs,
      });
      options.onProgress?.(p);
    };

    this.emitStateChange(previousState);

    try {
      await this.engine.play({
        speed: options.speed,
        startAtSeconds: options.startAtSeconds,
        onProgress,
        signal: options.signal,
      });
    } catch (err) {
      this.emit({
        type: "error",
        state: this.engine.state,
        positionSeconds: this.engine.positionSeconds,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      throw err;
    } finally {
      this.emitStateChange(this._lastState);

      // Notify teaching hook of completion
      if (this._teachingHook && this.engine.state === "finished") {
        try {
          await this._teachingHook.onSongComplete(
            this.engine.eventsPlayed,
            this.midi.trackNames[0] ?? "MIDI file"
          );
        } catch { /* hook errors don't break playback */ }
      }
    }
  }

  /** Pause playback. Fires stateChange event. */
  pause(): void {
    const prev = this.engine.state;
    this.engine.pause();
    this.emitStateChange(prev);
  }

  /** Resume playback after pause. Fires stateChange event. */
  async resume(options: PlaybackControlOptions = {}): Promise<void> {
    if (this.engine.state !== "paused") return;
    const prev = this.engine.state;
    this.emitStateChange(prev);
    try {
      await this.engine.resume({
        speed: options.speed,
        onProgress: options.onProgress,
        signal: options.signal,
      });
    } catch (err) {
      this.emit({
        type: "error",
        state: this.engine.state,
        positionSeconds: this.engine.positionSeconds,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      throw err;
    } finally {
      this.emitStateChange(this._lastState);
    }
  }

  /** Stop playback and reset. Fires stateChange event. */
  stop(): void {
    const prev = this.engine.state;
    this.engine.stop();
    this.playbackGeneration++;
    this.emitStateChange(prev);
  }

  /** Change playback speed. Fires speedChange event. Takes effect on next note. */
  setSpeed(speed: number): void {
    const prev = this.engine.speed;
    this.engine.setSpeed(speed);
    this.emit({
      type: "speedChange",
      state: this.engine.state,
      positionSeconds: this.engine.positionSeconds,
      previousSpeed: prev,
      newSpeed: speed,
    });
  }

  /** Reset to beginning. */
  reset(): void {
    const prev = this.engine.state;
    this.engine.reset();
    this.emitStateChange(prev);
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  /**
   * Create a connector wrapper that intercepts noteOn/noteOff to emit events
   * and invoke teaching hooks.
   */
  private createWrappedConnector(generation: number): VmpkConnector {
    const self = this;
    const inner = this.connector;

    return {
      connect: () => inner.connect(),
      disconnect: () => inner.disconnect(),
      status: () => inner.status(),
      listPorts: () => inner.listPorts(),

      noteOn(note: number, velocity: number, channel?: number) {
        if (generation !== self.playbackGeneration) return;
        inner.noteOn(note, velocity, channel);

        const ch = channel ?? 0;
        const eventIndex = self.engine.eventsPlayed + 1;
        const event: NoteOnEvent = {
          type: "noteOn",
          state: self.engine.state,
          positionSeconds: self.engine.positionSeconds,
          note,
          noteName: midiToNoteName(note),
          velocity,
          channel: ch,
          duration: 0, // filled by engine scheduling
          eventIndex,
          totalEvents: self.midi.events.length,
        };
        self.emit(event);

        // Fire teaching hook (non-blocking — don't await)
        if (self._teachingHook) {
          const noteName = midiToNoteName(note);
          self._teachingHook.onMeasureStart(
            eventIndex, // use event index as measure proxy for MIDI files
            `Note: ${noteName} (${note}) vel=${velocity}`,
            undefined
          ).catch(() => { /* hook errors don't break playback */ });
        }
      },

      noteOff(note: number, channel?: number) {
        if (generation !== self.playbackGeneration) return;
        inner.noteOff(note, channel);

        self.emit({
          type: "noteOff",
          state: self.engine.state,
          positionSeconds: self.engine.positionSeconds,
          note,
          noteName: midiToNoteName(note),
          channel: channel ?? 0,
        });
      },

      allNotesOff(channel?: number) {
        if (generation !== self.playbackGeneration) return;
        inner.allNotesOff(channel);
      },

      playNote: (midiNote) => {
        if (generation !== self.playbackGeneration) {
          return Promise.resolve();
        }
        return inner.playNote(midiNote);
      },
    };
  }
}

/**
 * Create a PlaybackController for a parsed MIDI file.
 * Shorthand for `new PlaybackController(connector, midi)`.
 */
export function createPlaybackController(
  connector: VmpkConnector,
  midi: ParsedMidi
): PlaybackController {
  return new PlaybackController(connector, midi);
}
