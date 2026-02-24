// ─── ai-jam-sessions: Session Engine ─────────────────────────────────────────
//
// Manages the playback session: load a song, parse measures, play through
// VMPK via the connector, track progress, handle pause/resume/stop.
//
// Teaching hooks fire at measure boundaries and key moments, allowing
// the AI teacher to speak, display tips, or push interjections.
// ─────────────────────────────────────────────────────────────────────────────

import type { SongEntry } from "./songs/types.js";
import type {
  Session,
  SessionOptions,
  SessionState,
  SyncMode,
  PlayableMeasure,
  PlaybackProgress,
  ProgressCallback,
  ParseWarning,
  Beat,
  VmpkConnector,
  TeachingHook,
} from "./types.js";
import { parseMeasure, safeParseMeasure } from "./note-parser.js";
import { createSilentTeachingHook, detectKeyMoments } from "./teaching.js";

let sessionCounter = 0;

/**
 * Create a new practice session for a song.
 */
export function createSession(
  song: SongEntry,
  connector: VmpkConnector,
  options: SessionOptions = {}
): SessionController {
  const speed = options.speed ?? 1.0;
  if (speed <= 0 || speed > 4) {
    throw new Error(`Speed must be between 0 (exclusive) and 4: got ${speed}`);
  }

  if (options.tempo !== undefined && (options.tempo < 10 || options.tempo > 400)) {
    throw new Error(`Tempo must be between 10 and 400 BPM: got ${options.tempo}`);
  }

  const session: Session = {
    id: `session-${++sessionCounter}`,
    song,
    state: "loaded",
    mode: options.mode ?? "full",
    syncMode: options.syncMode ?? "concurrent",
    currentMeasure: 0,
    tempoOverride: options.tempo ?? null,
    speed,
    loopRange: options.loopRange ?? null,
    startedAt: new Date(),
    measuresPlayed: 0,
    voiceEnabled: options.voice ?? true,
  };

  return new SessionController(
    session,
    connector,
    options.teachingHook ?? createSilentTeachingHook(),
    options.onProgress,
    options.progressInterval
  );
}

/**
 * Session controller — the main runtime interface for a practice session.
 *
 * Holds the session state + connector + teaching hook.
 * Provides play/pause/stop/skip methods.
 */
export class SessionController {
  private abortController: AbortController | null = null;
  private playableMeasures: PlayableMeasure[] = [];
  private playStartedAt: number = 0;
  private lastProgressMilestone: number = -1;
  private readonly onProgress?: ProgressCallback;
  private readonly progressInterval: number;

  /** Parse warnings collected during measure parsing (bad notes skipped). */
  readonly parseWarnings: ParseWarning[] = [];

  constructor(
    public readonly session: Session,
    private readonly connector: VmpkConnector,
    private readonly teachingHook: TeachingHook,
    onProgress?: ProgressCallback,
    progressInterval?: number
  ) {
    this.onProgress = onProgress;
    this.progressInterval = progressInterval ?? 0.1; // default: every 10%

    // Pre-parse all measures — gracefully skip bad notes
    this.reParseMeasures();
  }

  /**
   * Re-parse all measures with current effective tempo.
   * Uses safe parser — collects warnings instead of throwing.
   */
  private reParseMeasures(): void {
    this.parseWarnings.length = 0; // clear previous warnings
    const bpm = this.effectiveTempo();
    this.playableMeasures = this.session.song.measures.map((m) =>
      safeParseMeasure(m, bpm, this.parseWarnings)
    );
  }

  /**
   * Effective tempo — base tempo (override or song default) * speed multiplier.
   * This is the actual BPM used for playback timing.
   */
  effectiveTempo(): number {
    const base = this.session.tempoOverride ?? this.session.song.tempo;
    return base * this.session.speed;
  }

  /**
   * Base tempo — override or song default, without speed multiplier.
   * Useful for display ("Playing at 60 BPM × 0.5 speed").
   */
  baseTempo(): number {
    return this.session.tempoOverride ?? this.session.song.tempo;
  }

  /** Get current state. */
  get state(): SessionState {
    return this.session.state;
  }

  /** Get the current measure (1-based for display). */
  get currentMeasureDisplay(): number {
    return this.session.currentMeasure + 1;
  }

  /** Total measures in the song. */
  get totalMeasures(): number {
    return this.session.song.measures.length;
  }

  /**
   * Play the session from the current position.
   *
   * In "full" mode: plays all remaining measures.
   * In "measure" mode: plays one measure and pauses.
   * In "loop" mode: loops the specified range.
   * In "hands" mode: plays RH, then LH, then both for each measure.
   */
  async play(): Promise<void> {
    if (this.session.state === "playing") return;
    if (this.session.state === "finished") {
      // Restart from beginning
      this.session.currentMeasure = 0;
    }

    this.session.state = "playing";
    this.abortController = new AbortController();
    this.playStartedAt = Date.now();
    this.lastProgressMilestone = -1;
    const signal = this.abortController.signal;

    try {
      switch (this.session.mode) {
        case "full":
          await this.playRange(
            this.session.currentMeasure,
            this.totalMeasures - 1,
            signal
          );
          break;

        case "measure":
          await this.playRange(
            this.session.currentMeasure,
            this.session.currentMeasure,
            signal
          );
          this.session.state = "paused";
          return;

        case "loop": {
          const [start, end] = this.session.loopRange ?? [1, this.totalMeasures];
          const startIdx = start - 1; // convert to 0-based
          const endIdx = end - 1;
          // Loop forever until stopped
          while (!signal.aborted) {
            await this.playRange(startIdx, endIdx, signal);
            this.session.currentMeasure = startIdx;
          }
          break;
        }

        case "hands":
          await this.playHandsSeparate(
            this.session.currentMeasure,
            signal
          );
          this.session.state = "paused";
          return;
      }

      if (!signal.aborted) {
        this.session.state = "finished";
        // Fire song-complete hook
        await this.teachingHook.onSongComplete(
          this.session.measuresPlayed,
          this.session.song.title
        );
      }
    } catch (err) {
      if (signal.aborted) {
        // Expected — user stopped playback
        return;
      }
      throw err;
    }
  }

  /** Pause playback. */
  pause(): void {
    if (this.session.state !== "playing") return;
    this.abortController?.abort();
    this.session.state = "paused";
    this.connector.allNotesOff();
  }

  /** Stop playback and reset to beginning. */
  stop(): void {
    this.abortController?.abort();
    this.session.state = "idle";
    this.session.currentMeasure = 0;
    this.connector.allNotesOff();
  }

  /** Skip to next measure (in measure/hands mode). */
  next(): void {
    if (this.session.currentMeasure < this.totalMeasures - 1) {
      this.session.currentMeasure++;
    }
  }

  /** Go back to previous measure. */
  prev(): void {
    if (this.session.currentMeasure > 0) {
      this.session.currentMeasure--;
    }
  }

  /** Jump to a specific measure (1-based). */
  goTo(measureNumber: number): void {
    const idx = measureNumber - 1;
    if (idx >= 0 && idx < this.totalMeasures) {
      this.session.currentMeasure = idx;
    }
  }

  /** Set tempo override (10–400 BPM). */
  setTempo(bpm: number): void {
    if (bpm < 10 || bpm > 400) {
      throw new Error(`Tempo must be between 10 and 400 BPM: got ${bpm}`);
    }
    this.session.tempoOverride = bpm;
    this.reParseMeasures();
  }

  /**
   * Set speed multiplier (0.5 = half speed, 1.0 = normal, 2.0 = double).
   * Re-parses all measures with the new effective tempo.
   */
  setSpeed(speed: number): void {
    if (speed <= 0 || speed > 4) {
      throw new Error(`Speed must be between 0 (exclusive) and 4: got ${speed}`);
    }
    this.session.speed = speed;
    this.reParseMeasures();
  }

  /** Get a summary of the current session state. */
  summary(): string {
    const s = this.session;
    const speedStr = s.speed !== 1.0 ? ` × ${s.speed}x` : "";
    const lines = [
      `Session: ${s.id}`,
      `Song: ${s.song.title} (${s.song.composer ?? "Traditional"})`,
      `Genre: ${s.song.genre} | Key: ${s.song.key} | Tempo: ${this.baseTempo()} BPM${speedStr}`,
      `Mode: ${s.mode} | State: ${s.state}`,
      `Progress: measure ${this.currentMeasureDisplay} / ${this.totalMeasures}`,
      `Measures played: ${s.measuresPlayed}`,
    ];
    return lines.join("\n");
  }

  /** Build a PlaybackProgress snapshot. */
  private buildProgress(): PlaybackProgress {
    const current = this.session.measuresPlayed;
    const total = this.totalMeasures;
    const ratio = total > 0 ? current / total : 0;
    return {
      currentMeasure: this.currentMeasureDisplay,
      totalMeasures: total,
      ratio,
      percent: `${Math.round(ratio * 100)}%`,
      elapsedMs: Date.now() - this.playStartedAt,
    };
  }

  /**
   * Emit a progress notification if we've crossed the next milestone.
   * With progressInterval 0.1, fires at 10%, 20%, 30%, … 100%.
   * With progressInterval 0, fires after every measure.
   */
  private emitProgress(): void {
    if (!this.onProgress) return;

    const progress = this.buildProgress();

    if (this.progressInterval <= 0) {
      // Fire after every measure
      this.onProgress(progress);
      return;
    }

    // Check if we've crossed the next milestone
    const currentMilestone = Math.floor(progress.ratio / this.progressInterval);
    if (currentMilestone > this.lastProgressMilestone) {
      this.lastProgressMilestone = currentMilestone;
      this.onProgress(progress);
    }
  }

  // ─── Internal playback ──────────────────────────────────────────────────

  /**
   * Play a range of measures (inclusive, 0-based indices).
   * Fires teaching hooks at measure boundaries and key moments.
   *
   * In "concurrent" syncMode: voice and piano play simultaneously (duet feel).
   * In "before" syncMode: voice speaks before piano plays (lecture style).
   * Key moments always fire before playback in both modes (instructional).
   */
  private async playRange(
    startIdx: number,
    endIdx: number,
    signal: AbortSignal
  ): Promise<void> {
    const concurrent = this.session.syncMode === "concurrent";

    for (let i = startIdx; i <= endIdx; i++) {
      if (signal.aborted) return;

      this.session.currentMeasure = i;
      const pm = this.playableMeasures[i];
      const measureNum = i + 1; // 1-based for display/teaching

      // ── Teaching: check for key moments (always before playback) ──
      const keyMoments = detectKeyMoments(this.session.song, measureNum);
      for (const km of keyMoments) {
        if (signal.aborted) return;
        await this.teachingHook.onKeyMoment(km);
      }

      // ── Voice + piano: concurrent or sequential ──
      if (concurrent) {
        await Promise.all([
          this.teachingHook.onMeasureStart(
            measureNum,
            pm.source.teachingNote,
            pm.source.dynamics
          ),
          this.playMeasure(pm, signal),
        ]);
      } else {
        await this.teachingHook.onMeasureStart(
          measureNum,
          pm.source.teachingNote,
          pm.source.dynamics
        );
        await this.playMeasure(pm, signal);
      }

      this.session.measuresPlayed++;

      // ── Progress notification ──
      this.emitProgress();
    }
  }

  /**
   * Play a single measure — both hands in parallel.
   */
  private async playMeasure(
    pm: PlayableMeasure,
    signal: AbortSignal
  ): Promise<void> {
    // Play both hands simultaneously
    await Promise.all([
      this.playBeats(pm.rightBeats, signal),
      this.playBeats(pm.leftBeats, signal),
    ]);
  }

  /**
   * Play a sequence of beats serially.
   */
  private async playBeats(
    beats: Beat[],
    signal: AbortSignal
  ): Promise<void> {
    for (const beat of beats) {
      if (signal.aborted) return;

      // Play all notes in this beat simultaneously
      const notePromises = beat.notes.map((n) => this.connector.playNote(n));
      await Promise.all(notePromises);
    }
  }

  /**
   * Play hands separately then together (for "hands" mode).
   * Respects syncMode: concurrent voice plays alongside the first hand pass.
   */
  private async playHandsSeparate(
    measureIdx: number,
    signal: AbortSignal
  ): Promise<void> {
    const pm = this.playableMeasures[measureIdx];
    const measureNum = measureIdx + 1;
    const concurrent = this.session.syncMode === "concurrent";

    // ── Teaching: check key moments (always before playback) ──
    const keyMoments = detectKeyMoments(this.session.song, measureNum);
    for (const km of keyMoments) {
      if (signal.aborted) return;
      await this.teachingHook.onKeyMoment(km);
    }

    // ── Voice + first hand pass: concurrent or sequential ──
    if (concurrent) {
      await Promise.all([
        this.teachingHook.onMeasureStart(
          measureNum,
          pm.source.teachingNote,
          pm.source.dynamics
        ),
        this.playBeats(pm.rightBeats, signal),
      ]);
    } else {
      await this.teachingHook.onMeasureStart(
        measureNum,
        pm.source.teachingNote,
        pm.source.dynamics
      );
      await this.playBeats(pm.rightBeats, signal);
    }
    if (signal.aborted) return;

    // Left hand alone
    await this.playBeats(pm.leftBeats, signal);
    if (signal.aborted) return;

    // Both together
    await this.playMeasure(pm, signal);
    this.session.measuresPlayed++;
  }
}
