// ─── Metronome Type Surface (pure — imports nothing) ────────────────────────
//
// Split out of metronome.ts for one load-bearing reason: metronome.ts
// dynamically imports node-web-audio-api (a Node-only native package), and
// TypeScript resolves even dynamic import() specifiers — so any module that
// so much as `import type`s from metronome.ts drags that resolution into its
// graph. src/types.ts needs MetronomeEngine, and the browser cockpit's
// isolated typecheck follows src/types.ts into here, where node-web-audio-api
// is not installed (CI's isolated cockpit job catches it; the root
// node_modules masks it locally). This file is the dependency-free boundary:
// type-only consumers import from here and never see the native import.
// metronome.ts re-exports everything, so existing `./playback/metronome.js`
// imports keep working unchanged.

// ─── Minimal Audio Surface (injectable/mockable) ────────────────────────────
//
// Only the handful of AudioParam/node members a click envelope actually
// touches — deliberately not the full lib.dom.d.ts AudioContext surface.
// node-web-audio-api's real AudioContext satisfies this structurally; tests
// pass a lightweight fake instead (see metronome.test.ts's fake context).

export interface MetronomeAudioParam {
  value: number;
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  exponentialRampToValueAtTime(value: number, endTime: number): unknown;
}

export interface MetronomeOscillator {
  type: string;
  frequency: MetronomeAudioParam;
  connect(destination: unknown): unknown;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface MetronomeGain {
  gain: MetronomeAudioParam;
  connect(destination: unknown): unknown;
  disconnect(): void;
}

/** The minimal AudioContext surface the metronome needs. */
export interface MetronomeAudioContext {
  readonly currentTime: number;
  readonly destination: unknown;
  createOscillator(): MetronomeOscillator;
  createGain(): MetronomeGain;
}

// ─── Public interface ────────────────────────────────────────────────────────

export interface MetronomeEngine {
  /**
   * Start continuous clicking at `bpm`, accenting beat 1 of every
   * `timeSignatureBeats`-beat bar. Cleanly supersedes any previous
   * start()/countIn() in progress (stops it first) — never double-schedules.
   *
   * `startAtMs` (default 0) seeds the internal beat-phase clock so the
   * accent pattern can be preserved across a restart — e.g. a mid-session
   * tempo change that needs to re-anchor phase, or resuming somewhere other
   * than a bar boundary. With the default 0, beat 1 of bar 1 fires
   * immediately.
   */
  start(bpm: number, timeSignatureBeats: number, startAtMs?: number): void;

  /** Stop all clicking and clear every pending timer. Safe to call anytime, running or not. */
  stop(): void;

  /**
   * Change tempo live. If a click is currently pending (mid start() or mid
   * countIn()), reschedules it at the new interval — anchored to the last
   * click that actually fired, so the beat phase stays locked instead of
   * jumping. No-op if nothing is currently scheduled.
   */
  setTempo(bpm: number): void;

  /**
   * Click-only count-in for `bars` bars, using the current bpm/
   * timeSignatureBeats (from the constructor options, or the most recent
   * start()/setTempo() call) — or, when `opts.bpm`/`opts.timeSignatureBeats`
   * are supplied, those values instead. Either way, the values are applied
   * BEFORE the first click fires, so the whole count-in (including its
   * very first accent) uses them — this is how a caller configures tempo/
   * time-signature ahead of a count-in without a start()/setTempo() call
   * of its own firing an unwanted click first. Resolves one beat-interval
   * after the last count-in click fires — i.e. exactly when the downbeat
   * *after* the count-in would land (Logic Pro convention: a 1-bar
   * count-in on "1 2 3 4" hands off exactly on the next "1", not on top of
   * the 4th click).
   *
   * `bars <= 0` resolves immediately with no clicks fired ("0 = none").
   * A concurrent stop() resolves (not hangs) any in-flight countIn().
   */
  countIn(bars: number, opts?: { bpm?: number; timeSignatureBeats?: number }): Promise<void>;

  /** True while either countIn() or start() is actively scheduling clicks. */
  isRunning(): boolean;
}
