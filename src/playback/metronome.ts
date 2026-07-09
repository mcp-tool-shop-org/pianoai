// ─── Metronome Engine ────────────────────────────────────────────────────────
//
// Synthesizes click-track audio (accented downbeat + unaccented beats) using
// node-web-audio-api primitives — the same lazy-AudioContext pattern as
// src/audio-engine.ts's loadAudioContext(), scoped down to exactly what a
// click needs. The audio side is injectable (`audioContextFactory`) so tests
// can run without a real audio device — pass a lightweight fake instead of
// touching node-web-audio-api at all (see metronome.test.ts).
//
// Scheduling rides on a plain setTimeout chain, the same approach already
// used by src/playback/midi-engine.ts (no sample-accurate Web Audio
// lookahead scheduler exists anywhere in this codebase yet — this follows
// that precedent rather than introducing a new one). Each click's *timing*
// is therefore only as precise as Node's timer wheel, but each click's own
// *envelope* is scheduled against the AudioContext's own clock
// (ctx.currentTime), so the click itself still sounds clean.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Lazy Import (mirrors src/audio-engine.ts's loadAudioContext) ──────────
// Don't load the native binary until the metronome is actually used.

let _AudioContext: any = null;

async function loadAudioContext(): Promise<any> {
  if (!_AudioContext) {
    const mod = await import("node-web-audio-api");
    _AudioContext = mod.AudioContext;
  }
  return _AudioContext;
}

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

/**
 * Default factory: lazily create a real node-web-audio-api AudioContext.
 * "interactive" (not audio-engine.ts's "playback") is deliberate here — a
 * metronome's entire purpose is to be a low-latency timing reference, so we
 * trade audio-engine.ts's buffer-efficiency-favoring hint for the
 * lower-latency one. See metronome.ts's module doc / dispatch report for the
 * full reasoning.
 */
async function defaultAudioContextFactory(): Promise<MetronomeAudioContext> {
  const AC = await loadAudioContext();
  return new AC({ latencyHint: "interactive" }) as MetronomeAudioContext;
}

function isThenable(value: unknown): value is Promise<MetronomeAudioContext> {
  return !!value && typeof (value as { then?: unknown }).then === "function";
}

// ─── Click Synthesis ─────────────────────────────────────────────────────────

/** Accented (beat 1) click frequency, Hz. */
export const DEFAULT_ACCENT_FREQ_HZ = 1600;
/** Unaccented click frequency, Hz. */
export const DEFAULT_BEAT_FREQ_HZ = 1100;
/** Click burst duration, ms — within the 15–30ms "short burst" range. */
export const DEFAULT_CLICK_DURATION_MS = 20;
/** Peak gain (0–1) for accented clicks. */
export const DEFAULT_ACCENT_GAIN = 0.9;
/** Peak gain (0–1) for unaccented clicks. */
export const DEFAULT_BEAT_GAIN = 0.6;
/** Fallback tempo when an invalid bpm is supplied (never throws — see sanitizeBpm). */
export const DEFAULT_BPM = 120;
/** Fallback beats-per-bar when an invalid value is supplied. */
export const DEFAULT_TIME_SIGNATURE_BEATS = 4;

interface ClickToneConfig {
  accentFreqHz: number;
  beatFreqHz: number;
  clickDurationMs: number;
  accentGain: number;
  beatGain: number;
}

/**
 * Synthesize and fire a single click burst against ctx's own clock.
 * Short sine/triangle burst with a fast attack + exponential decay envelope
 * — a "tick", not a sustained tone. Accent (beat 1) gets a higher pitch and
 * louder peak than the regular beat click.
 */
function synthesizeClick(ctx: MetronomeAudioContext, accent: boolean, cfg: ClickToneConfig): void {
  const now = ctx.currentTime;
  const durationSec = cfg.clickDurationMs / 1000;
  const freq = accent ? cfg.accentFreqHz : cfg.beatFreqHz;
  const peak = accent ? cfg.accentGain : cfg.beatGain;

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;

  const gain = ctx.createGain();
  // Envelope: (near-)silence -> fast attack -> exponential decay to
  // (near-)silence. exponentialRampToValueAtTime can't target exactly 0
  // (it's a divide-by-the-target-value ramp under the hood), so we start
  // and end at a small epsilon rather than 0 — the same convention
  // audio-engine.ts uses for its own decay envelopes.
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.01);
}

// ─── Options ────────────────────────────────────────────────────────────────

export interface MetronomeOptions {
  /** Initial tempo in BPM (default 120). Overridden by start()'s bpm arg or setTempo(). */
  bpm?: number;
  /** Initial beats-per-bar, e.g. 4 for 4/4 (default 4). Overridden by start()'s timeSignatureBeats arg. */
  timeSignatureBeats?: number;
  /** Frequency for the accented (beat 1) click, Hz. Default 1600. */
  accentFreqHz?: number;
  /** Frequency for unaccented clicks, Hz. Default 1100. */
  beatFreqHz?: number;
  /** Click burst duration, ms. Default 20 (within the spec's 15–30ms range). */
  clickDurationMs?: number;
  /** Peak gain for accented clicks (0–1). Default 0.9. */
  accentGain?: number;
  /** Peak gain for unaccented clicks (0–1). Default 0.6. */
  beatGain?: number;
  /**
   * Inject a fake/mock audio context factory for tests — avoids touching a
   * real audio device. Defaults to a lazy node-web-audio-api loader that
   * mirrors src/audio-engine.ts's loadAudioContext() pattern. May return a
   * value synchronously (as test doubles typically will) or a Promise (as
   * the real default factory does) — both are handled.
   */
  audioContextFactory?: () => MetronomeAudioContext | Promise<MetronomeAudioContext>;
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

// ─── Implementation ──────────────────────────────────────────────────────────

function sanitizeBpm(bpm: number): number {
  return Number.isFinite(bpm) && bpm > 0 ? bpm : DEFAULT_BPM;
}

function sanitizeBeats(beats: number): number {
  const n = Math.floor(beats);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_TIME_SIGNATURE_BEATS;
}

/**
 * Design note on countIn(bars, opts?)'s signature: `bars` is the only
 * required argument, because a count-in always precedes (and typically
 * shares the tempo of) the start() that follows it — most callers that
 * already configured the engine via the constructor or a prior
 * start()/setTempo() call don't need to pass anything else. `opts` exists
 * for the caller that HASN'T done that yet and can't afford a start()/
 * setTempo() call of its own (which would fire an immediate click) just to
 * set tempo/beats before counting in — see SessionController.play(), which
 * constructs its metronome with no options and must configure it from the
 * session's own effective tempo/time-signature before the count-in clicks
 * (finding: count-in was clicking at the engine's built-in 120bpm/4-beat
 * defaults instead of the song's own values). Without `opts`, countIn()
 * always uses whatever bpm/timeSignatureBeats is already current at the
 * moment it's called.
 */
export function createMetronome(opts: MetronomeOptions = {}): MetronomeEngine {
  const clickCfg: ClickToneConfig = {
    accentFreqHz: opts.accentFreqHz ?? DEFAULT_ACCENT_FREQ_HZ,
    beatFreqHz: opts.beatFreqHz ?? DEFAULT_BEAT_FREQ_HZ,
    clickDurationMs: opts.clickDurationMs ?? DEFAULT_CLICK_DURATION_MS,
    accentGain: opts.accentGain ?? DEFAULT_ACCENT_GAIN,
    beatGain: opts.beatGain ?? DEFAULT_BEAT_GAIN,
  };
  const audioContextFactory = opts.audioContextFactory ?? defaultAudioContextFactory;

  let bpm = sanitizeBpm(opts.bpm ?? DEFAULT_BPM);
  let timeSignatureBeats = sanitizeBeats(opts.timeSignatureBeats ?? DEFAULT_TIME_SIGNATURE_BEATS);

  // ── Lazy audio context (memoized) ──
  // `resolvedCtx` lets every click *after* the first synthesize synchronously
  // (no microtask hop) — important both for real playback precision and for
  // tests using a synchronous fake factory, which resolve on the very first
  // click with no extra `await` needed.
  let resolvedCtx: MetronomeAudioContext | null = null;
  let ctxPromise: Promise<MetronomeAudioContext> | null = null;

  function safeSynthesize(ctx: MetronomeAudioContext, accent: boolean): void {
    try {
      synthesizeClick(ctx, accent, clickCfg);
    } catch {
      // A synth failure should never take the scheduling loop down with it —
      // a silent beat is preferable to a crashed session.
    }
  }

  function fireClick(accent: boolean): void {
    if (resolvedCtx) {
      safeSynthesize(resolvedCtx, accent);
      return;
    }
    if (!ctxPromise) {
      const maybeCtx = audioContextFactory();
      if (isThenable(maybeCtx)) {
        ctxPromise = maybeCtx.then((ctx) => {
          resolvedCtx = ctx;
          return ctx;
        });
        void ctxPromise.then((ctx) => safeSynthesize(ctx, accent)).catch(() => { /* swallow — see safeSynthesize */ });
        return;
      }
      // Factory returned synchronously (typical for test doubles) — resolve
      // immediately, no microtask hop.
      resolvedCtx = maybeCtx;
      safeSynthesize(resolvedCtx, accent);
      return;
    }
    // A real async context creation is already in flight from an earlier
    // click — queue onto it rather than kicking off a second creation.
    void ctxPromise.then((ctx) => safeSynthesize(ctx, accent)).catch(() => { /* swallow */ });
  }

  // ── Scheduling state ──
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingAction: (() => void) | null = null;
  let running = false;
  let runToken = 0;
  let beatIndex = 0; // 0-based beat count since the current run's logical start
  let lastFireAt = 0; // Date.now() ms of the most recently fired click
  let pendingStops: Array<() => void> = []; // countIn() resolvers a concurrent stop() must also resolve

  function clearPendingTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pendingAction = null;
  }

  function beatIntervalMs(): number {
    return 60000 / bpm;
  }

  /** Cancel whatever run (start() or countIn()) is currently active. Never leaks timers. */
  function resetRun(): void {
    runToken++;
    clearPendingTimer();
    running = false;
    if (pendingStops.length > 0) {
      const resolvers = pendingStops;
      pendingStops = [];
      for (const resolve of resolvers) resolve();
    }
  }

  /** Arm a single timer for `action`, delay anchored to lastFireAt + the *current* bpm's interval. */
  function armTimer(action: () => void): void {
    pendingAction = action;
    const delay = Math.max(0, lastFireAt + beatIntervalMs() - Date.now());
    timer = setTimeout(() => {
      timer = null;
      pendingAction = null;
      action();
    }, delay);
    // Never let a pending click keep the process alive (Node-only API; no-op
    // under other runtimes where setTimeout doesn't return an unref-able handle).
    (timer as unknown as { unref?: () => void }).unref?.();
  }

  /**
   * Fire the next beat, then either schedule the one after it
   * (`continueAfter()` true) or wait one more beat-interval of silence and
   * call `onDone` (`continueAfter()` false) — that trailing silent interval
   * is what turns a click run into a proper count-*in* rather than a
   * click-and-immediately-overlap.
   */
  function fireAndContinue(token: number, continueAfter: () => boolean, onDone: () => void): void {
    if (token !== runToken) return; // superseded by a later stop()/start()/countIn()

    lastFireAt = Date.now();
    const accent = beatIndex % timeSignatureBeats === 0;
    beatIndex++;
    fireClick(accent);

    if (!continueAfter()) {
      armTimer(() => {
        running = false;
        onDone();
      });
      return;
    }

    armTimer(() => fireAndContinue(token, continueAfter, onDone));
  }

  return {
    start(newBpm: number, newTimeSignatureBeats: number, startAtMs = 0): void {
      resetRun();
      bpm = sanitizeBpm(newBpm);
      timeSignatureBeats = sanitizeBeats(newTimeSignatureBeats);
      const interval = beatIntervalMs();
      beatIndex = interval > 0 ? Math.max(0, Math.floor(startAtMs / interval)) : 0;
      running = true;
      const token = runToken;
      fireAndContinue(token, () => true, () => { /* start() never "completes" on its own — only stop() ends it */ });
    },

    stop(): void {
      resetRun();
    },

    setTempo(newBpm: number): void {
      bpm = sanitizeBpm(newBpm);
      if (timer !== null && pendingAction) {
        // Same token, same continuation — re-arming re-schedules the
        // *existing* run (start()'s infinite loop or countIn()'s bounded
        // one) at the new tempo, anchored to lastFireAt; it is not a new
        // run, so runToken does not change and beat phase is preserved.
        const action = pendingAction;
        clearPendingTimer();
        armTimer(action);
      }
    },

    countIn(bars: number, opts?: { bpm?: number; timeSignatureBeats?: number }): Promise<void> {
      // Apply overrides BEFORE totalBeats/timing is computed, so the whole
      // count-in (bar length, beat-1 accent placement, click interval) is
      // consistent with them — see the design note above createMetronome().
      if (opts?.bpm !== undefined) bpm = sanitizeBpm(opts.bpm);
      if (opts?.timeSignatureBeats !== undefined) timeSignatureBeats = sanitizeBeats(opts.timeSignatureBeats);

      const totalBeats = Math.max(0, Math.floor(bars)) * timeSignatureBeats;
      if (totalBeats <= 0) return Promise.resolve();

      resetRun();
      beatIndex = 0;
      running = true;
      const token = runToken;
      let firedCount = 0;

      return new Promise<void>((resolve) => {
        let settled = false;
        const settle = () => {
          if (settled) return;
          settled = true;
          pendingStops = pendingStops.filter((r) => r !== settle);
          resolve();
        };
        pendingStops.push(settle); // a concurrent stop() resolves (not hangs) this promise

        fireAndContinue(
          token,
          () => {
            firedCount++;
            return firedCount < totalBeats;
          },
          settle
        );
      });
    },

    isRunning(): boolean {
      return running;
    },
  };
}
