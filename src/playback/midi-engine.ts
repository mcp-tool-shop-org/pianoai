// ─── MIDI Playback Engine ────────────────────────────────────────────────────
//
// Plays parsed MIDI file events through any VmpkConnector (audio engine or MIDI).
// Deterministic scheduling: walks the sorted event list, sleeps between events,
// fires noteOn/noteOff at the right times. Supports speed control, pause/resume,
// and abort via AbortSignal.
//
// This is the engine that makes `ai-jam-sessions play song.mid` actually work.
// ─────────────────────────────────────────────────────────────────────────────

import type { ParsedMidi, MidiNoteEvent } from "../midi/types.js";
import type { VmpkConnector, PlaybackProgress, ProgressCallback } from "../types.js";

/** Options for MIDI playback. */
export interface MidiPlaybackOptions {
  /** Speed multiplier (0.1–4.0). Default: 1.0. */
  speed?: number;
  /** Progress callback. */
  onProgress?: ProgressCallback;
  /** AbortSignal for external cancellation. */
  signal?: AbortSignal;
}

/** Playback state. */
export type MidiPlaybackState = "idle" | "playing" | "paused" | "stopped" | "finished";

/**
 * MIDI Playback Engine.
 *
 * Takes a ParsedMidi (from the parser) and plays it through a VmpkConnector.
 * Events are scheduled sequentially — sleep between events, fire noteOn/noteOff.
 * Active notes are tracked for clean pause/stop (all-notes-off).
 */
export class MidiPlaybackEngine {
  private _state: MidiPlaybackState = "idle";
  private _speed: number = 1.0;
  private _eventIndex: number = 0;
  private _playbackTime: number = 0; // seconds into the piece (logical time)
  private _wallStartTime: number = 0;
  private _pausedAtTime: number = 0;
  private _activeNotes = new Set<string>(); // "channel-note" keys
  private _abortController: AbortController | null = null;
  private _resolveWait: (() => void) | null = null;

  constructor(
    private readonly connector: VmpkConnector,
    private readonly midi: ParsedMidi
  ) {}

  /** Current playback state. */
  get state(): MidiPlaybackState {
    return this._state;
  }

  /** Current speed multiplier. */
  get speed(): number {
    return this._speed;
  }

  /** Total duration in seconds (at speed 1.0). */
  get durationSeconds(): number {
    return this.midi.durationSeconds;
  }

  /** Current playback position in seconds (logical, at speed 1.0). */
  get positionSeconds(): number {
    return this._playbackTime;
  }

  /** Number of events played so far. */
  get eventsPlayed(): number {
    return this._eventIndex;
  }

  /** Total number of note events. */
  get totalEvents(): number {
    return this.midi.events.length;
  }

  /**
   * Play the MIDI file from the current position.
   * Resolves when playback finishes or is stopped.
   */
  async play(options: MidiPlaybackOptions = {}): Promise<void> {
    if (this._state === "playing") return;

    this._speed = options.speed ?? this._speed;
    this._state = "playing";
    this._abortController = new AbortController();
    this._wallStartTime = Date.now();

    const signal = options.signal;
    const onProgress = options.onProgress;
    const internalSignal = this._abortController.signal;

    // Build a schedule: for each event, calculate when noteOn and noteOff fire
    const events = this.midi.events;
    const totalDuration = this.midi.durationSeconds;

    try {
      while (this._eventIndex < events.length) {
        if (internalSignal.aborted || signal?.aborted) {
          this._state = "stopped";
          this.silenceAll();
          return;
        }

        const event = events[this._eventIndex];
        const targetTime = event.time; // seconds at speed 1.0

        // Sleep until this event's time
        if (targetTime > this._playbackTime) {
          const waitSeconds = (targetTime - this._playbackTime) / this._speed;
          await this.sleepInterruptible(waitSeconds * 1000, internalSignal);

          if (internalSignal.aborted || signal?.aborted) {
            this._state = "stopped";
            this.silenceAll();
            return;
          }
        }

        this._playbackTime = targetTime;

        // Fire noteOn
        const key = `${event.channel}-${event.note}`;
        this.connector.noteOn(event.note, event.velocity, event.channel);
        this._activeNotes.add(key);

        // Schedule noteOff after duration
        const offDelay = (event.duration / this._speed) * 1000;
        this.scheduleNoteOff(event, offDelay, key);

        this._eventIndex++;

        // Progress
        if (onProgress && totalDuration > 0) {
          const ratio = this._playbackTime / totalDuration;
          onProgress({
            currentMeasure: this._eventIndex,
            totalMeasures: events.length,
            ratio: Math.min(1, ratio),
            percent: `${Math.round(ratio * 100)}%`,
            elapsedMs: Date.now() - this._wallStartTime,
          });
        }
      }

      // Wait for the last notes to finish
      if (events.length > 0) {
        const lastEvent = events[events.length - 1];
        const remainingMs = (lastEvent.duration / this._speed) * 1000;
        if (remainingMs > 0) {
          await this.sleepInterruptible(remainingMs, internalSignal);
        }
      }

      if (!internalSignal.aborted && !signal?.aborted) {
        this._state = "finished";
      }
    } catch (err) {
      if (internalSignal.aborted || signal?.aborted) {
        this._state = "stopped";
      } else {
        throw err;
      }
    } finally {
      this.silenceAll();
    }
  }

  /** Pause playback. Can be resumed with play(). */
  pause(): void {
    if (this._state !== "playing") return;
    this._state = "paused";
    this._pausedAtTime = this._playbackTime;
    this._abortController?.abort();
    this.silenceAll();
  }

  /** Resume after pause. */
  async resume(options: MidiPlaybackOptions = {}): Promise<void> {
    if (this._state !== "paused") return;
    this._playbackTime = this._pausedAtTime;
    await this.play(options);
  }

  /** Stop playback and reset to beginning. */
  stop(): void {
    this._state = "stopped";
    this._abortController?.abort();
    this.silenceAll();
    this._eventIndex = 0;
    this._playbackTime = 0;
  }

  /** Change speed during playback. Takes effect on next event. */
  setSpeed(speed: number): void {
    if (speed <= 0 || speed > 4) {
      throw new Error(`Speed must be between 0 (exclusive) and 4: got ${speed}`);
    }
    this._speed = speed;
  }

  /** Reset to beginning without stopping state. */
  reset(): void {
    this._eventIndex = 0;
    this._playbackTime = 0;
    this._state = "idle";
    this._activeNotes.clear();
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  /** Send all-notes-off to silence everything. */
  private silenceAll(): void {
    try {
      this.connector.allNotesOff();
    } catch {
      /* connector may already be disconnected */
    }
    this._activeNotes.clear();
  }

  /** Schedule a noteOff after a delay. */
  private scheduleNoteOff(event: MidiNoteEvent, delayMs: number, key: string): void {
    setTimeout(() => {
      try {
        this.connector.noteOff(event.note, event.channel);
      } catch {
        /* ok */
      }
      this._activeNotes.delete(key);
    }, delayMs);
  }

  /** Sleep that can be interrupted by AbortSignal. */
  private sleepInterruptible(ms: number, signal: AbortSignal): Promise<void> {
    if (ms <= 0) return Promise.resolve();

    return new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        this._resolveWait = null;
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timer);
        this._resolveWait = null;
        resolve();
      };

      this._resolveWait = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        resolve();
      };

      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}
