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
  MidiNote,
  VmpkConnector,
  TeachingHook,
  Recording,
} from "./types.js";
import type { MidiNoteEvent } from "./midi/types.js";
import { parseMeasure, safeParseMeasure } from "./note-parser.js";
import { createSilentTeachingHook, detectKeyMoments } from "./teaching.js";
import { createMetronome, type MetronomeEngine } from "./playback/metronome.js";

let sessionCounter = 0;

/**
 * Beats-per-bar from a song's time signature string ("4/4" -> 4, "3/4" -> 3,
 * "6/8" -> 6). Same numerator-is-beat-count convention already used by
 * flattenSongToExpected (score-performance.ts) and cli.ts's duration
 * estimate — the metronome accents every `beatsNum`-th click, matching how
 * this codebase already treats "beats per measure" elsewhere.
 */
function beatsPerMeasureFromTimeSignature(timeSignature: string): number {
  const [beatsNum] = timeSignature.split("/").map(Number);
  return beatsNum || 4;
}

/** Total duration (seconds) of a sequential beat list — each beat's duration comes from its (shared, chord-wide) note duration. */
function beatsTotalDurationSec(beats: Beat[]): number {
  let total = 0;
  for (const beat of beats) {
    total += (beat.notes[0]?.durationMs ?? 0) / 1000;
  }
  return total;
}

/**
 * A measure's nominal duration (seconds) — the longer of its two hands'
 * total beat duration. Uses Math.max rather than assuming both hands sum to
 * the same total: well-formed measures should match, but this stays correct
 * (and matches whichever hand is actually the long pole) if they don't.
 */
function measureDurationSec(pm: PlayableMeasure): number {
  return Math.max(beatsTotalDurationSec(pm.rightBeats), beatsTotalDurationSec(pm.leftBeats));
}

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

  const metronomeEnabled = options.metronome ?? false;
  // Default 1 bar of count-in when metronome is on and countIn wasn't
  // specified (Logic Pro convention); default 0 (none) otherwise. Stored
  // as-requested even if metronome is off, so it stays introspectable —
  // play() is what actually gates on metronomeEnabled before using it.
  const countInBars = Math.max(0, Math.floor(options.countIn ?? (metronomeEnabled ? 1 : 0)));

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
    metronomeEnabled,
    countInBars,
    clickOnlyDuringCountIn: options.clickOnlyDuringCountIn ?? false,
    recordingEnabled: options.record ?? false,
  };

  const metronome = metronomeEnabled
    ? (options.metronomeFactory ?? createMetronome)()
    : undefined;

  return new SessionController(
    session,
    connector,
    options.teachingHook ?? createSilentTeachingHook(),
    options.onProgress,
    options.progressInterval,
    metronome
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

  /** Hand mute state — muted hands are silenced during playback. */
  private _mutedHands: { left: boolean; right: boolean } = { left: false, right: false };

  /**
   * Recording buffer for the library-song playback path (source:
   * "session"). `nominalBpm`/`effectiveBpmAtStart` are (re)populated once
   * per fresh start (see play()) — the 0 defaults here are pre-first-play
   * sentinels, not meaningful tempi. See getRecording() and the Recording
   * type doc (types.ts) for the nominal-time contract this buffer
   * implements.
   */
  private _recording: {
    events: MidiNoteEvent[];
    startedAtMs: number;
    nominalBpm: number;
    effectiveBpmAtStart: number;
  } = { events: [], startedAtMs: 0, nominalBpm: 0, effectiveBpmAtStart: 0 };

  /**
   * Running "seconds since this play() call's fresh start" cursor used to
   * synthesize recorded note times from the schedule (not wall-clock —
   * unlike the MIDI-file path, this path's beat durations are already
   * deterministic, computed from playableMeasures at effectiveTempo()).
   * Persists across playRange()/playHandsSeparate() calls within one
   * fresh-started play() so loop mode and hands mode both produce one
   * continuously-increasing timeline rather than restarting per call.
   */
  private _recordCursorSec: number = 0;

  constructor(
    public readonly session: Session,
    private readonly connector: VmpkConnector,
    private readonly teachingHook: TeachingHook,
    onProgress?: ProgressCallback,
    progressInterval?: number,
    private readonly metronome?: MetronomeEngine
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

    // Captured before we overwrite state below — distinguishes a true fresh
    // start (loaded/idle/finished-restart) from a resume-from-pause.
    // Count-in and the recording clock only reset on a fresh start:
    // "measure" mode calls play() once per measure and must not re-trigger
    // either (a count-in before every single measure would be absurd, and a
    // recording that reset every measure would only ever hold one measure).
    const isFreshStart = this.session.state !== "paused";

    this.session.state = "playing";
    this.abortController = new AbortController();
    this.playStartedAt = Date.now();
    this.lastProgressMilestone = -1;
    const signal = this.abortController.signal;

    if (isFreshStart) {
      this._recordCursorSec = 0;
      // startedAtMs is stamped later, below — once we're actually past any
      // count-in — so 0 here is a sentinel (never a real Date.now() value),
      // not "the take started at the Unix epoch." nominalBpm/
      // effectiveBpmAtStart are captured once, now, per the Recording
      // type's session-source contract (see types.ts).
      this._recording = {
        events: [],
        startedAtMs: 0,
        nominalBpm: this.session.tempoOverride ?? this.session.song.tempo,
        effectiveBpmAtStart: this.effectiveTempo(),
      };
    }

    const countInBars = this.session.countInBars ?? 0;

    try {
      if (this.metronome && this.session.metronomeEnabled) {
        if (isFreshStart && countInBars > 0) {
          // Click-only — no notes play until this resolves. A concurrent
          // pause()/stop() calls metronome.stop() directly (see below),
          // which resolves this promise early rather than leaving it
          // hanging. Configure the metronome's tempo/time-signature from
          // this session's own effective values BEFORE it starts clicking:
          // createMetronome() (see createSession()) is constructed with no
          // options, so without this the count-in silently clicked at the
          // engine's built-in defaults (120 BPM / 4 beats) instead of this
          // song's actual tempo/time signature and speed.
          await this.metronome.countIn(countInBars, {
            bpm: this.effectiveTempo(),
            timeSignatureBeats: beatsPerMeasureFromTimeSignature(this.session.song.timeSignature),
          });
        }
        if (!signal.aborted && !this.session.clickOnlyDuringCountIn) {
          this.metronome.start(
            this.effectiveTempo(),
            beatsPerMeasureFromTimeSignature(this.session.song.timeSignature)
          );
        }
      }
      if (signal.aborted) return; // pause()/stop() fired during count-in

      // Stamp the take's real start here — after any count-in has finished
      // clicking, immediately before the first note is actually scheduled
      // — not at the top of play(): the count-in itself takes real
      // wall-clock time, so stamping earlier put startedAtMs ahead of when
      // playback truly began, by the count-in's own duration. The `=== 0`
      // guard (0 is _recording's reset sentinel, never a real Date.now()
      // value) makes this a once-per-take stamp: a later resume-from-pause
      // (isFreshStart=false) leaves an already-stamped value alone, and a
      // resume that follows a count-in that was aborted mid-click (so the
      // first attempt never reached this line) stamps it here instead, on
      // whichever attempt actually gets through.
      if (this._recording.startedAtMs === 0) {
        this._recording.startedAtMs = Date.now();
      }

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
    } finally {
      // Always silence the click when play() exits — finished normally,
      // paused/stopped mid-flight, errored, or (measure/hands mode)
      // returned early after a single pass. A safe no-op when the
      // metronome was never started (clickOnlyDuringCountIn, or a count-in
      // that got aborted before start() ran) — see MetronomeEngine.stop().
      this.metronome?.stop();
    }
  }

  /** Pause playback. */
  pause(): void {
    if (this.session.state !== "playing") return;
    this.abortController?.abort();
    this.session.state = "paused";
    this.connector.allNotesOff();
    // Silence the click immediately, same as allNotesOff() above — without
    // this, a pause() during count-in (or during the continuous click
    // track) would leave the metronome clicking until play()'s eventual
    // async unwind reaches its finally block.
    this.metronome?.stop();
  }

  /** Stop playback and reset to beginning. */
  stop(): void {
    this.abortController?.abort();
    this.session.state = "idle";
    this.session.currentMeasure = 0;
    this.connector.allNotesOff();
    this.metronome?.stop();
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
    // Keep an already-running click in sync — see MetronomeEngine.setTempo
    // (reschedules the pending click anchored to the last one that fired,
    // rather than resetting phase). No-op if the metronome isn't running.
    this.metronome?.setTempo(this.effectiveTempo());
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
    this.metronome?.setTempo(this.effectiveTempo());
  }

  /**
   * Mute a hand — the muted hand will be silenced during playback.
   * Takes effect on the next measure (current measure plays out).
   */
  muteHand(hand: "left" | "right"): void {
    this._mutedHands[hand] = true;
  }

  /**
   * Unmute a previously muted hand.
   */
  unmuteHand(hand: "left" | "right"): void {
    this._mutedHands[hand] = false;
  }

  /** Check whether a hand is currently muted. */
  isHandMuted(hand: "left" | "right"): boolean {
    return this._mutedHands[hand];
  }

  /**
   * Get the current recording (`source: "session"`). See the `Recording`
   * type for time-unit semantics. Always returns a valid Recording —
   * `events` is empty when `record` wasn't enabled or nothing has played
   * yet, never null/undefined.
   */
  getRecording(): Recording {
    return {
      events: [...this._recording.events],
      speed: this.session.speed,
      songId: this.session.song.id,
      startedAtMs: this._recording.startedAtMs,
      source: "session",
      nominalBpm: this._recording.nominalBpm,
      effectiveBpmAtStart: this._recording.effectiveBpmAtStart,
    };
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

      // Schedule-based recording clock — see _recordCursorSec's doc comment.
      const measureStartSec = this._recordCursorSec;

      // ── Voice + piano: concurrent or sequential ──
      if (concurrent) {
        await Promise.all([
          this.teachingHook.onMeasureStart(
            measureNum,
            pm.source.teachingNote,
            pm.source.dynamics
          ),
          this.playMeasure(pm, signal, measureStartSec),
        ]);
      } else {
        await this.teachingHook.onMeasureStart(
          measureNum,
          pm.source.teachingNote,
          pm.source.dynamics
        );
        await this.playMeasure(pm, signal, measureStartSec);
      }

      if (signal.aborted) {
        // pause()/stop() interrupted this measure mid-flight — playBeats()
        // bailed out partway through, so this measure was only PARTIALLY
        // recorded, yet a resume() replays it from its own start in full.
        // Without rewinding, the already-recorded partial notes would be
        // duplicated by the replay, AND the replay's notes would be
        // stamped at the wrong (already-advanced) cursor position. Roll
        // back to this measure's start so the eventual replay records it
        // cleanly, exactly once.
        this.rewindRecordingTo(measureStartSec);
        return;
      }

      this._recordCursorSec = measureStartSec + measureDurationSec(pm);
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
    signal: AbortSignal,
    measureStartSec: number
  ): Promise<void> {
    // Play both hands simultaneously, respecting mute state
    const hands: Promise<void>[] = [];
    if (!this._mutedHands.right) hands.push(this.playBeats(pm.rightBeats, signal, measureStartSec));
    if (!this._mutedHands.left) hands.push(this.playBeats(pm.leftBeats, signal, measureStartSec));
    await Promise.all(hands);
  }

  /**
   * Play a sequence of beats serially. `startSec` is this hand's recording
   * cursor position (seconds since play()'s fresh start) at the first beat
   * — used only to synthesize recorded note times/durations from the
   * schedule (not real wall-clock: unlike PlaybackController's MIDI-file
   * path, this path's beat durations are already deterministic).
   */
  private async playBeats(
    beats: Beat[],
    signal: AbortSignal,
    startSec: number
  ): Promise<void> {
    let offsetSec = startSec;
    for (const beat of beats) {
      if (signal.aborted) return;

      if (this.session.recordingEnabled) {
        for (const n of beat.notes) this.recordNote(n, offsetSec);
      }

      // Play all notes in this beat simultaneously
      try {
        const notePromises = beat.notes.map((n) => this.connector.playNote(n));
        await Promise.all(notePromises);
      } catch (err) {
        this.connector.allNotesOff();
        throw err;
      }

      // Advance by this beat's NOMINAL duration (see toNominalSec) — the
      // note's own durationMs is at effective/played tempo (speed already
      // applied), so this keeps offsetSec — and therefore every recorded
      // note's timestamp — in nominal song-time regardless of speed.
      offsetSec += this.toNominalSec((beat.notes[0]?.durationMs ?? 0) / 1000);
    }
  }

  /**
   * Append a played MidiNote to the recording buffer. Rests (note < 0)
   * aren't real note-on events and are skipped — nothing to score them
   * against.
   */
  private recordNote(n: MidiNote, timeSec: number): void {
    if (n.note < 0) return;
    const event: MidiNoteEvent = {
      note: n.note,
      velocity: n.velocity,
      time: timeSec,
      // n.durationMs is at effective/played tempo — convert to nominal so
      // it stays consistent with `time` (see toNominalSec + the Recording
      // type's session-source contract in types.ts).
      duration: this.toNominalSec(n.durationMs / 1000),
      channel: n.channel,
    };
    this._recording.events.push(event);
  }

  /**
   * Convert an effective/played-tempo duration (seconds — as already baked
   * into a parsed Beat's MidiNote.durationMs by reParseMeasures(), which
   * parses at effectiveTempo()) to NOMINAL song-time seconds: what it
   * would be at speed 1.0, on the `nominalBpm` baseline captured at this
   * take's start (see _recording.nominalBpm). effectiveTempo() = nominalBpm
   * * speed, and duration is inversely proportional to tempo, so
   * effectiveSec = nominalSec / speed --> nominalSec = effectiveSec *
   * speed. Reads `this.session.speed` LIVE (not a value captured once) so
   * a mid-take setSpeed() converts exactly: only increments recorded
   * *after* the change pick up the new speed, matching how setSpeed() ->
   * reParseMeasures() already re-computed every not-yet-played measure's
   * MidiNote.durationMs at the new effectiveTempo() by the time this runs.
   */
  private toNominalSec(effectiveSec: number): number {
    return effectiveSec * this.session.speed;
  }

  /**
   * Roll back the recording after a mid-span pause/abort — see
   * playRange()/playHandsSeparate(), both of which call this when
   * signal.aborted is discovered true right after their playback span (a
   * measure, or one hands-mode phase) returns early instead of completing.
   * Rewinds `_recordCursorSec` to `spanStartSec` and drops every recorded
   * event at or after that point, undoing exactly (and only) the
   * interrupted span's bookkeeping — so the next play() call replays and
   * re-records it cleanly, exactly once, at the correct nominal time. A
   * harmless no-op (beyond the cursor rewind) when recording isn't
   * enabled, since `_recording.events` is already empty.
   */
  private rewindRecordingTo(spanStartSec: number): void {
    this._recordCursorSec = spanStartSec;
    this._recording.events = this._recording.events.filter((e) => e.time < spanStartSec);
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
    // Schedule-based recording clock, threaded through all three passes
    // (RH alone, LH alone, both together) so a recording of "hands" mode
    // captures all three as one continuously-increasing timeline rather
    // than three overlapping ones. `spanStartSec` is this whole measure's
    // start — kept separately from `cursor` (which advances per-phase) so
    // a mid-phase abort can roll ALL THREE phases back to one clean point
    // (see rewindRecordingTo): a resume() always restarts this method from
    // phase 1 (there is no partial-phase resume), so anything recorded by
    // an interrupted attempt — whichever phase it reached — must be
    // discarded in full, not just the one phase that got cut short.
    const spanStartSec = this._recordCursorSec;
    let cursor = spanStartSec;

    // ── Teaching: check key moments (always before playback) ──
    const keyMoments = detectKeyMoments(this.session.song, measureNum);
    for (const km of keyMoments) {
      if (signal.aborted) return;
      await this.teachingHook.onKeyMoment(km);
    }

    // ── Voice + first hand pass: concurrent or sequential ──
    if (concurrent) {
      const firstHandBeats = this._mutedHands.right ? [] : pm.rightBeats;
      await Promise.all([
        this.teachingHook.onMeasureStart(
          measureNum,
          pm.source.teachingNote,
          pm.source.dynamics
        ),
        firstHandBeats.length > 0 ? this.playBeats(firstHandBeats, signal, cursor) : Promise.resolve(),
      ]);
    } else {
      await this.teachingHook.onMeasureStart(
        measureNum,
        pm.source.teachingNote,
        pm.source.dynamics
      );
      if (!this._mutedHands.right) {
        await this.playBeats(pm.rightBeats, signal, cursor);
      }
    }
    if (signal.aborted) {
      this.rewindRecordingTo(spanStartSec);
      return;
    }
    // The RH pass's scheduled duration always advances the cursor, even
    // when the hand is muted — recorded times follow the measure's
    // schedule, not what happened to be muted at record time, so a muted
    // vs. unmuted recording of the same measure stays time-aligned.
    // Converted to nominal seconds, same as playBeats' own cursor (see
    // toNominalSec) — this hand's beats were parsed at effectiveTempo().
    cursor += this.toNominalSec(beatsTotalDurationSec(pm.rightBeats));
    this._recordCursorSec = cursor;

    // Left hand alone
    if (!this._mutedHands.left) {
      await this.playBeats(pm.leftBeats, signal, cursor);
    }
    if (signal.aborted) {
      this.rewindRecordingTo(spanStartSec);
      return;
    }
    cursor += this.toNominalSec(beatsTotalDurationSec(pm.leftBeats));
    this._recordCursorSec = cursor;

    // Both together
    await this.playMeasure(pm, signal, cursor);
    if (signal.aborted) {
      this.rewindRecordingTo(spanStartSec);
      return;
    }
    this._recordCursorSec = cursor + this.toNominalSec(measureDurationSec(pm));
    this.session.measuresPlayed++;
  }
}
