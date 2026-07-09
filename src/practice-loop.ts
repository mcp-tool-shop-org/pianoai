// ─── ai-jam-sessions: Practice Loop ──────────────────────────────────────────
//
// Drills a measure range at reduced tempo, ramping toward full speed one
// step at a time — but ONLY after a "clean" pass (finding 30 — Duke: tempo
// varies systematically after correct passes, not on a fixed schedule).
// Every pass is recorded (SessionController's session-source recording,
// see types.ts's Recording doc) and scored against a WINDOWED sub-song
// covering just the drilled range, so a partial-song take doesn't register
// as "mostly missed" against the whole piece.
//
// Built entirely on session.ts's existing public API (createSession +
// SessionController's goTo()/play()/stop()/getRecording()) — no changes to
// session.ts's internals were needed. Each pass drives "measure" mode
// measure-by-measure across [startMeasure, endMeasure]: the first measure
// of a fresh SessionController is a "fresh start" (count-in fires once,
// recording resets to a clean nominal-time-0 buffer — see
// SessionController.play()'s isFreshStart), and every subsequent measure in
// the same pass is a resume (no re-count-in, recording keeps accumulating)
// — exactly the "one continuous recording per pass" this module needs. A
// fresh SessionController is created per PASS (not reused across passes) so
// each pass's count-in/recording-reset semantics stay simple and don't
// depend on session.ts's paused/idle/finished state-transition rules.
//
// Feedback timing (finding 29): scoring only happens AFTER a pass finishes
// — nothing here streams verdicts mid-take.
// ─────────────────────────────────────────────────────────────────────────────

import type { SongEntry } from "./songs/types.js";
import type { Recording, TeachingHook, VmpkConnector } from "./types.js";
import type { MetronomeEngine } from "./playback/metronome.js";
import { createSession, SessionController } from "./session.js";
import { scorePerformance, type PerformanceResult, type NoteVerdict } from "./score-performance.js";

// ─── Tunable defaults (documented constants — see resolvePracticeLoopConfig) ─

/** Default starting speed, as a percent of the song's own tempo (findings 24, 30, 34). */
export const DEFAULT_SPEED_START_PCT = 70;
/** Default target speed — 100% = the song's own tempo. */
export const DEFAULT_SPEED_TARGET_PCT = 100;
/** Default speed increase applied after each CLEAN pass. */
export const DEFAULT_RAMP_STEP_PCT = 5;

/**
 * Minimum completeness (0–100, matches `PerformanceResult.metrics.completeness`
 * exactly — NOT a 0–1 fraction) for a pass to count as "clean". Paired with
 * the no-missed-verdicts check below rather than used alone: completeness
 * alone would pass vacuously on `scorePerformance`'s INPUT_LIMIT degraded
 * case (which returns `completeness: 0` but ALSO `noteVerdicts: []` — an
 * empty verdicts array makes an isolated "no missed verdicts" check
 * vacuously true, so completeness is what actually rejects that case).
 */
export const CLEAN_PASS_MIN_COMPLETENESS = 95;

// ─── Config ─────────────────────────────────────────────────────────────────

export interface PracticeLoopConfig {
  /** First measure of the drilled range (1-based, inclusive). */
  startMeasure: number;
  /** Last measure of the drilled range (1-based, inclusive). */
  endMeasure: number;
  /** Starting speed, percent of the song's tempo. Default: {@link DEFAULT_SPEED_START_PCT}. */
  speedStartPct?: number;
  /** Target speed, percent of the song's tempo. Default: {@link DEFAULT_SPEED_TARGET_PCT}. */
  speedTargetPct?: number;
  /** Speed increase applied per clean pass. Default: {@link DEFAULT_RAMP_STEP_PCT}. */
  rampStepPct?: number;
  /**
   * Always `true` — tempo ramps ONLY after a clean pass, never on a fixed
   * schedule (finding 30). Not a tunable: this module has no code path that
   * honors any other value. Present in the config shape purely so the
   * design decision is visible/documented at every call site, per spec.
   */
  rampOnCleanPassOnly?: true;
  /** Optional cap on total passes — without it, the loop runs until a clean pass at speedTargetPct or an explicit stop(). */
  maxPasses?: number;
}

/** {@link PracticeLoopConfig} with every default applied. */
export interface ResolvedPracticeLoopConfig {
  startMeasure: number;
  endMeasure: number;
  speedStartPct: number;
  speedTargetPct: number;
  rampStepPct: number;
  maxPasses?: number;
}

/**
 * Validate + apply defaults to a {@link PracticeLoopConfig}. Throws a plain
 * `Error` with a descriptive message on invalid input — same convention as
 * `createSession()`'s own tempo/speed validation (session.ts) — so callers
 * (MCP tool handlers, the CLI) can catch and format it however their own
 * error-reporting convention expects.
 */
export function resolvePracticeLoopConfig(
  song: SongEntry,
  config: PracticeLoopConfig
): ResolvedPracticeLoopConfig {
  const { startMeasure, endMeasure } = config;

  if (!Number.isInteger(startMeasure) || !Number.isInteger(endMeasure)) {
    throw new Error(`startMeasure/endMeasure must be integers: got ${startMeasure}-${endMeasure}`);
  }
  if (startMeasure < 1 || endMeasure < 1) {
    throw new Error(`startMeasure/endMeasure must be >= 1: got ${startMeasure}-${endMeasure}`);
  }
  if (endMeasure < startMeasure) {
    throw new Error(`endMeasure (${endMeasure}) must be >= startMeasure (${startMeasure})`);
  }
  if (endMeasure > song.measures.length) {
    throw new Error(
      `endMeasure (${endMeasure}) exceeds "${song.title}"'s length (${song.measures.length} measures)`
    );
  }

  const speedStartPct = config.speedStartPct ?? DEFAULT_SPEED_START_PCT;
  const speedTargetPct = config.speedTargetPct ?? DEFAULT_SPEED_TARGET_PCT;
  const rampStepPct = config.rampStepPct ?? DEFAULT_RAMP_STEP_PCT;

  // Upper bound matches SessionController's own speed cap (0 exclusive .. 4,
  // i.e. 400%) — a config this module can't ever hand off to createSession()
  // successfully shouldn't be accepted here either.
  if (!(speedStartPct > 0) || speedStartPct > 400) {
    throw new Error(`speedStartPct must be between 0 (exclusive) and 400: got ${speedStartPct}`);
  }
  if (!(speedTargetPct > 0) || speedTargetPct > 400) {
    throw new Error(`speedTargetPct must be between 0 (exclusive) and 400: got ${speedTargetPct}`);
  }
  if (speedTargetPct < speedStartPct) {
    throw new Error(`speedTargetPct (${speedTargetPct}) must be >= speedStartPct (${speedStartPct})`);
  }
  if (!(rampStepPct > 0)) {
    throw new Error(`rampStepPct must be > 0: got ${rampStepPct}`);
  }
  if (config.maxPasses !== undefined && (!Number.isInteger(config.maxPasses) || config.maxPasses < 1)) {
    throw new Error(`maxPasses must be a positive integer: got ${config.maxPasses}`);
  }

  return { startMeasure, endMeasure, speedStartPct, speedTargetPct, rampStepPct, maxPasses: config.maxPasses };
}

// ─── Micro-goal ─────────────────────────────────────────────────────────────

/** "m. 5" for a single-measure range, "mm. 5–8" otherwise — shared by every micro-goal formatter below. */
function formatMeasureRange(config: Pick<ResolvedPracticeLoopConfig, "startMeasure" | "endMeasure">): string {
  return config.startMeasure === config.endMeasure
    ? `m. ${config.startMeasure}`
    : `mm. ${config.startMeasure}–${config.endMeasure}`;
}

/**
 * "mm. 5–8 at 75% — aim: clean pass to advance" (finding 31 — every pass
 * carries an explicit, task-focused micro-goal). Single-measure ranges read
 * as "m. 5" rather than "mm. 5–5".
 */
export function formatMicroGoal(
  config: Pick<ResolvedPracticeLoopConfig, "startMeasure" | "endMeasure">,
  speedPct: number
): string {
  return `${formatMeasureRange(config)} at ${speedPct}% — aim: clean pass to advance`;
}

/**
 * "target speed not yet reached — mm. 5–8 best pass: 82%" — the honest,
 * task-focused terminal text for the "max-passes-reached" status (see
 * {@link PracticeLoopStatus}'s doc): maxPasses ran out before a clean pass
 * ever landed at speedTargetPct, so this is deliberately NOT phrased like
 * `formatMicroGoal`'s "aim: clean pass to advance" (there's no next pass to
 * advance in) and NOT phrased like success. "best pass" is the highest
 * completeness (0-100, same metric `isCleanPass` gates on) among all passes
 * this run — no grade/praise language, a plain count.
 */
export function formatMaxPassesReachedGoal(
  config: Pick<ResolvedPracticeLoopConfig, "startMeasure" | "endMeasure">,
  passes: readonly PracticePassResult[]
): string {
  const best = passes.reduce((m, p) => Math.max(m, p.result.metrics.completeness), 0);
  return `target speed not yet reached — ${formatMeasureRange(config)} best pass: ${Math.round(best)}%`;
}

// ─── Windowed scoring ───────────────────────────────────────────────────────

/**
 * A derived sub-song containing only the measures in
 * `[startMeasure, endMeasure]` (inclusive, 1-based) — for scoring a single
 * practice pass in isolation. A fresh SessionController's recording clock
 * starts at nominal time 0 for whatever measure it plays FIRST (see
 * SessionController.play()'s isFreshStart reset), which for a practice pass
 * is `startMeasure`, not measure 1 of the real song. Scoring against the
 * WHOLE song would flatten every measure BEFORE `startMeasure` into the
 * front of the expected-notes timeline too — misaligning the recording
 * against the wrong measures' expected notes, and flooding the result with
 * "missed" notes for measures that were never meant to be played this pass.
 * Scoring against this windowed song instead keeps both clocks agreed:
 * its own first included measure also starts at nominal time 0.
 *
 * Preserves the original song's id/title/tempo/timeSignature and every
 * measure's own `.number` label — only the `measures` array is filtered, so
 * a returned `PerformanceResult.details.missed[].measure` /
 * `noteVerdicts[].measure` still reads as the song's real measure numbers.
 */
export function windowSong(song: SongEntry, startMeasure: number, endMeasure: number): SongEntry {
  return {
    ...song,
    measures: song.measures.filter((m) => m.number >= startMeasure && m.number <= endMeasure),
  };
}

/**
 * A pass is "clean" when it clears BOTH: completeness at/above
 * {@link CLEAN_PASS_MIN_COMPLETENESS}, AND no verdict with status "missed"
 * (which — per NoteVerdict's own doc, finding 33 — covers both truly
 * unplayed notes AND notes matched to the wrong pitch; a wrong-pitch
 * near-match still counts as "matched" for the completeness metric, but it
 * is NOT a clean pass). See {@link CLEAN_PASS_MIN_COMPLETENESS}'s own doc
 * for why both checks are needed together.
 */
export function isCleanPass(result: PerformanceResult): boolean {
  const verdicts = result.details.noteVerdicts ?? [];
  const hasMissed = verdicts.some((v) => v.status === "missed");
  return result.metrics.completeness >= CLEAN_PASS_MIN_COMPLETENESS && !hasMissed;
}

// ─── Ramp decision (pure — directly testable against hand-built fixtures) ──

export interface RampDecision {
  clean: boolean;
  /** True if this pass's cleanliness actually pushed the speed up (false when already at target, or not clean). */
  advanced: boolean;
  /** The speed the NEXT pass (if any) should run at. */
  nextSpeedPct: number;
  /** True when the drill is mastered — a clean pass at speedTargetPct — and the loop should stop. */
  completed: boolean;
}

/**
 * Given a scored pass and the speed it just ran at, decide what happens
 * next: ramp +rampStepPct after a clean pass (findings 30/34), hold speed
 * after a pass that wasn't clean, or declare the drill complete once a
 * clean pass lands AT speedTargetPct. Pure — no I/O, no session state —
 * so "ramp only on a clean pass" is testable directly against hand-built
 * PerformanceResult fixtures without needing a real/mock playback session.
 */
export function decideRamp(
  result: PerformanceResult,
  currentSpeedPct: number,
  config: Pick<ResolvedPracticeLoopConfig, "speedTargetPct" | "rampStepPct">
): RampDecision {
  const clean = isCleanPass(result);
  if (!clean) {
    return { clean: false, advanced: false, nextSpeedPct: currentSpeedPct, completed: false };
  }
  if (currentSpeedPct >= config.speedTargetPct) {
    return { clean: true, advanced: false, nextSpeedPct: currentSpeedPct, completed: true };
  }
  const nextSpeedPct = Math.min(config.speedTargetPct, currentSpeedPct + config.rampStepPct);
  return { clean: true, advanced: nextSpeedPct !== currentSpeedPct, nextSpeedPct, completed: false };
}

// ─── Worst-measures drill (findings 26, 30) ─────────────────────────────────

/**
 * Rank measures by (missed desc, timing desc, measure asc) — mirrors
 * piano-roll.ts's `renderFocusStripLines`/`rankWorstMeasures` ranking
 * exactly (that function is module-private in a consume-only file, so this
 * is an intentional, small duplication rather than a shared import).
 * Skips "correct" verdicts; a measure with zero missed/timing verdicts
 * never appears. Returns at most `limit` measure numbers.
 */
export function rankWorstMeasures(result: PerformanceResult, limit = 3): number[] {
  const verdicts: NoteVerdict[] = result.details.noteVerdicts ?? [];
  const counts = new Map<number, { missed: number; timing: number }>();
  for (const v of verdicts) {
    if (v.status === "correct") continue;
    const c = counts.get(v.measure) ?? { missed: 0, timing: 0 };
    if (v.status === "missed") c.missed++;
    else c.timing++;
    counts.set(v.measure, c);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].missed - a[1].missed || b[1].timing - a[1].timing || a[0] - b[0])
    .slice(0, limit)
    .map(([measure]) => measure);
}

/**
 * Build a {@link PracticeLoopConfig} targeting the up-to-3 worst measures
 * from a prior `PerformanceResult` (findings 26, 30). PracticeLoop only
 * knows how to drill a CONTIGUOUS range, so the config spans from the
 * lowest to the highest of the worst measure numbers — when the worst
 * measures already cluster together (the common case: a hard run of notes
 * usually spans a few consecutive measures), that span is tight and
 * meaningful; if they happen to be scattered across the song, the span
 * necessarily widens to cover the gap. Returns `null` when there are no
 * missed/timing verdicts to target (a clean take — nothing to drill).
 */
export function worstMeasuresPracticeConfig(
  result: PerformanceResult,
  overrides: Partial<Omit<PracticeLoopConfig, "startMeasure" | "endMeasure">> = {}
): PracticeLoopConfig | null {
  const worst = rankWorstMeasures(result, 3);
  if (worst.length === 0) return null;
  return {
    startMeasure: Math.min(...worst),
    endMeasure: Math.max(...worst),
    ...overrides,
  };
}

// ─── Per-measure diagnostic + task-focused summaries (finding 28, 35) ──────

export interface MeasureDiagnostic {
  measure: number;
  missed: number;
  timing: number;
}

/**
 * Per-measure missed/timing counts from a scored take, measure-ascending
 * (a diagnostic listing, not a "worst first" ranking — see
 * {@link rankWorstMeasures} for that). Counts only — no grades, no
 * praise/ability language (finding 28).
 */
export function measureDiagnostics(result: PerformanceResult): MeasureDiagnostic[] {
  const verdicts: NoteVerdict[] = result.details.noteVerdicts ?? [];
  const counts = new Map<number, { missed: number; timing: number }>();
  for (const v of verdicts) {
    if (v.status === "correct") continue;
    const c = counts.get(v.measure) ?? { missed: 0, timing: 0 };
    if (v.status === "missed") c.missed++;
    else c.timing++;
    counts.set(v.measure, c);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([measure, c]) => ({ measure, ...c }));
}

/** Render {@link measureDiagnostics}' output as "m.N: X missed, Y timing" lines. */
export function formatMeasureDiagnosticLines(diagnostics: MeasureDiagnostic[]): string[] {
  return diagnostics.map((d) => {
    const parts: string[] = [];
    if (d.missed > 0) parts.push(`${d.missed} missed`);
    if (d.timing > 0) parts.push(`${d.timing} timing`);
    return `m.${d.measure}: ${parts.join(", ") || "no issues"}`;
  });
}

/**
 * Task-focused one-line summary of a scored pass — notes/timing/measures
 * counts only. No grades, no praise/ability language, no points/streaks
 * (findings 28, 35). Use `result.feedback` instead when grades/praise-style
 * markdown IS wanted (e.g. score_last_take's fuller post-hoc report).
 */
export function formatPassSummary(result: PerformanceResult): string {
  const verdicts: NoteVerdict[] = result.details.noteVerdicts ?? [];
  const missed = verdicts.filter((v) => v.status === "missed").length;
  const timing = verdicts.filter((v) => v.status === "timing").length;
  const correct = verdicts.filter((v) => v.status === "correct").length;
  const total = correct + missed + timing;
  if (total === 0) return "no notes in range";
  const parts = [`${correct}/${total} notes correct`];
  if (timing > 0) parts.push(`${timing} off timing`);
  if (missed > 0) parts.push(`${missed} missed`);
  return parts.join(", ");
}

// ─── PracticeLoop ───────────────────────────────────────────────────────────

export interface PracticePassResult {
  /** 1-based pass number within this loop run. */
  passNumber: number;
  /** Speed this pass actually ran at (percent of the song's tempo). */
  speedPct: number;
  /** This pass's take, scored against the windowed drill range (see {@link windowSong}). */
  result: PerformanceResult;
  /** Whether this pass cleared the clean-pass thresholds (see {@link isCleanPass}). */
  clean: boolean;
  /** Whether this pass's cleanliness advanced the speed for the next pass. */
  advanced: boolean;
}

/**
 * "max-passes-reached" is a DISTINCT terminal status from "completed" —
 * exhausting `maxPasses` without ever landing a clean pass at
 * `speedTargetPct` is not the same outcome as actually mastering the drill,
 * and reporting it as "completed" would tell the player they'd finished
 * when the target speed was never reached. See runLoop()'s maxPasses branch
 * and {@link formatMaxPassesReachedGoal}.
 */
export type PracticeLoopStatus = "running" | "completed" | "max-passes-reached" | "stopped" | "error";

export interface PracticeLoopState {
  config: ResolvedPracticeLoopConfig;
  songId: string;
  status: PracticeLoopStatus;
  /** 1-based; 0 before the first pass has started. */
  currentPassNumber: number;
  currentSpeedPct: number;
  passes: PracticePassResult[];
  microGoal: string;
  /** Populated only when status is "error". */
  error?: string;
  /**
   * True while an external pause() (see PracticeLoop.pause()) is holding the
   * in-flight pass — distinct from `status`, which stays "running" the
   * whole time a pause is in effect (pausing doesn't change the loop's
   * overall run status, only whether the CURRENT pass's audio is playing).
   */
  paused: boolean;
}

export interface PracticeLoopHooks {
  teachingHook?: TeachingHook;
  metronomeFactory?: () => MetronomeEngine;
  /**
   * Called once per pass, right after that pass's SessionController is
   * created but before it starts playing — lets a caller adjust it (e.g.
   * mute a hand for a hands-separate drill variant), or — in tests —
   * deliberately engineer an incomplete pass to exercise the
   * ramp-only-on-a-clean-pass gate against the real session/scoring
   * pipeline instead of only a hand-built PerformanceResult fixture.
   */
  onPassSessionCreated?: (session: SessionController, passNumber: number) => void;
  /** Fired after each pass finishes and is scored. Not fired for a pass aborted mid-flight by stop(). */
  onPassComplete?: (pass: PracticePassResult, recording: Recording) => void;
}

/**
 * Loops a measure range at reduced tempo, one discrete pass at a time,
 * ramping toward full speed only after a clean pass. See this module's
 * header comment for the "how" (built entirely on session.ts's existing
 * public API — no new PlaybackMode, no session.ts internals touched).
 *
 * Usage:
 *   const loop = new PracticeLoop(song, connector, { startMeasure: 5, endMeasure: 8 });
 *   loop.start();       // runs passes in the background
 *   loop.getState();    // poll progress at any time
 *   await loop.done();  // or await full completion
 *   loop.stop();        // interrupt — aborts the in-flight pass, no further passes start
 */
export class PracticeLoop {
  readonly song: SongEntry;
  readonly config: ResolvedPracticeLoopConfig;

  private readonly connector: VmpkConnector;
  private readonly hooks: PracticeLoopHooks;
  private state: PracticeLoopState;
  private currentSession: SessionController | null = null;
  private stopRequested = false;
  private runPromise: Promise<void> | null = null;
  private _paused = false;
  private resumeWaiters: Array<() => void> = [];

  constructor(song: SongEntry, connector: VmpkConnector, config: PracticeLoopConfig, hooks: PracticeLoopHooks = {}) {
    this.song = song;
    this.connector = connector;
    this.config = resolvePracticeLoopConfig(song, config);
    this.hooks = hooks;
    this.state = {
      config: this.config,
      songId: song.id,
      status: "running",
      currentPassNumber: 0,
      currentSpeedPct: this.config.speedStartPct,
      passes: [],
      microGoal: formatMicroGoal(this.config, this.config.speedStartPct),
      paused: false,
    };
  }

  /** A snapshot of current progress — safe to call at any time, including mid-pass. Never returns a reference callers could mutate. */
  getState(): PracticeLoopState {
    return { ...this.state, passes: [...this.state.passes], paused: this._paused };
  }

  /**
   * The in-flight pass's session, or null between passes (or once the loop
   * has stopped/completed). Exposed so an external caller (mcp-server.ts's
   * pause_playback/resume/set_speed) can route to the ACTUAL audio a running
   * practice loop is playing — e.g. to pause/resume it, or to inspect its
   * state — without this class growing bespoke pass-through methods for
   * every SessionController capability.
   */
  getCurrentSession(): SessionController | null {
    return this.currentSession;
  }

  /** Start running passes in the background. No-op if already started (call once). */
  start(): void {
    if (this.runPromise) return;
    this.runPromise = this.runLoop().catch((err) => {
      this.state.status = "error";
      this.state.error = err instanceof Error ? err.message : String(err);
    });
  }

  /** Resolves once the loop has stopped running for any reason (completed, stopped, or errored). */
  done(): Promise<void> {
    return this.runPromise ?? Promise.resolve();
  }

  /** Interrupt playback immediately and stop after the in-flight pass is aborted — no further passes start. */
  stop(): void {
    this.stopRequested = true;
    this.currentSession?.stop();
    // A paused loop's runLoop() is blocked awaiting waitForResume() (see the
    // per-measure loop below) — without flushing it here, stop()ping a
    // PAUSED loop would never actually unblock runLoop(), and done() would
    // hang forever (the race stopActive() (mcp-server.ts) guards against
    // with a bounded wait — flushing here is what makes that wait normally
    // resolve near-instantly instead of needing its timeout fallback).
    this.releasePause();
  }

  /**
   * Pause the in-flight pass, if one is currently playing — the loop holds
   * at the interrupted measure and won't start the next one until resume()
   * is called. No-op if nothing is playing (between passes, already paused,
   * or the loop has stopped/completed).
   */
  pause(): void {
    if (this._paused || !this.currentSession || this.currentSession.state !== "playing") return;
    this._paused = true;
    this.currentSession.pause();
  }

  /** Resume a pass paused via pause(). No-op if not currently paused. */
  resume(): void {
    if (!this._paused) return;
    this.releasePause();
  }

  /** Clears the pause flag and wakes anything blocked in waitForResume() — shared by resume() and stop() (see stop()'s doc). */
  private releasePause(): void {
    if (!this._paused) return;
    this._paused = false;
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    for (const w of waiters) w();
  }

  private waitForResume(): Promise<void> {
    return new Promise((resolve) => this.resumeWaiters.push(resolve));
  }

  private async runLoop(): Promise<void> {
    let speed = this.config.speedStartPct;

    while (!this.stopRequested) {
      if (this.config.maxPasses !== undefined && this.state.passes.length >= this.config.maxPasses) {
        // Distinct from "completed" (finding — max-passes-reached): running
        // out of passes without ever landing a clean one at speedTargetPct
        // is NOT the same outcome as mastering the drill. The microGoal is
        // rewritten to say so honestly instead of leaving the last pass's
        // now-stale "aim: clean pass to advance" text in place.
        this.state.status = "max-passes-reached";
        this.state.microGoal = formatMaxPassesReachedGoal(this.config, this.state.passes);
        return;
      }

      const passNumber = this.state.passes.length + 1;
      this.state.currentPassNumber = passNumber;
      this.state.currentSpeedPct = speed;
      this.state.microGoal = formatMicroGoal(this.config, speed);

      const session = createSession(this.song, this.connector, {
        mode: "measure",
        speed: speed / 100,
        metronome: true,
        record: true,
        teachingHook: this.hooks.teachingHook,
        metronomeFactory: this.hooks.metronomeFactory,
      });
      this.currentSession = session;
      this.hooks.onPassSessionCreated?.(session, passNumber);

      for (let m = this.config.startMeasure; m <= this.config.endMeasure; m++) {
        if (this.stopRequested) break;
        session.goTo(m);
        await session.play();
        if (this.stopRequested) break;
        if (this._paused) {
          // pause() aborted the measure that was just playing mid-flight
          // (session.play() above already returned once the abort
          // propagated) and put the session into "paused" state. Block here
          // until resume()/stop() releases it, then — unless we're actually
          // stopping — decrement `m` so the for-loop's own `m++` lands back
          // on this SAME measure: session.state is still "paused" (goTo()
          // wasn't called again), so the next play() call below replays
          // measure `m` from its own start — the same "resume replays the
          // interrupted measure" convention session.ts's own "measure" mode
          // pause/resume already uses (see SessionController.play()'s
          // isFreshStart).
          await this.waitForResume();
          if (this.stopRequested) break;
          m--;
        }
      }
      this.currentSession = null;

      if (this.stopRequested) {
        this.state.status = "stopped";
        return;
      }

      // ── Score AFTER the pass finishes — never mid-take (finding 29) ──
      const recording = session.getRecording();
      const sub = windowSong(this.song, this.config.startMeasure, this.config.endMeasure);
      const result = scorePerformance(sub, recording.events, { bpm: recording.nominalBpm });
      const decision = decideRamp(result, speed, this.config);

      const passResult: PracticePassResult = {
        passNumber,
        speedPct: speed,
        result,
        clean: decision.clean,
        advanced: decision.advanced,
      };
      this.state.passes.push(passResult);
      this.hooks.onPassComplete?.(passResult, recording);

      if (decision.completed) {
        this.state.status = "completed";
        return;
      }
      speed = decision.nextSpeedPct;
    }

    this.state.status = "stopped";
  }
}
