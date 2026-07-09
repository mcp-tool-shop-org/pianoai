// ─── MetronomeEngine Unit Tests ──────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createMetronome,
  DEFAULT_ACCENT_FREQ_HZ,
  DEFAULT_BEAT_FREQ_HZ,
  DEFAULT_ACCENT_GAIN,
  DEFAULT_BEAT_GAIN,
} from "./metronome.js";
import type { MetronomeAudioContext } from "./metronome.js";

// ─── Test Helpers ───────────────────────────────────────────────────────────

interface RecordedClick {
  freq: number;
  gainPeak: number;
}

/**
 * A synchronous fake AudioContext — no real audio device touched. Records
 * each click's oscillator frequency + gain envelope peak so tests can assert
 * accent vs. regular-beat behavior without any real audio device.
 */
function createFakeAudioContext(): { ctx: MetronomeAudioContext; clicks: RecordedClick[] } {
  const clicks: RecordedClick[] = [];
  let lastOscFreq = 0;

  const ctx: MetronomeAudioContext = {
    currentTime: 0,
    destination: {},
    createOscillator() {
      const osc = {
        type: "sine",
        frequency: {
          value: 0,
          setValueAtTime() { /* noop */ },
          linearRampToValueAtTime() { /* noop */ },
          exponentialRampToValueAtTime() { /* noop */ },
        },
        connect() { /* noop */ },
        start() { /* noop */ },
        stop() { /* noop */ },
      };
      lastOscFreq = 0;
      Object.defineProperty(osc.frequency, "value", {
        get: () => lastOscFreq,
        set: (v: number) => { lastOscFreq = v; },
      });
      return osc;
    },
    createGain() {
      const record: RecordedClick = { freq: lastOscFreq, gainPeak: 0 };
      clicks.push(record);
      return {
        gain: {
          value: 0,
          setValueAtTime() { /* noop */ },
          linearRampToValueAtTime(v: number) { record.gainPeak = v; },
          exponentialRampToValueAtTime() { /* noop */ },
        },
        connect() { /* noop */ },
        disconnect() { /* noop */ },
      };
    },
  };

  return { ctx, clicks };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("createMetronome", () => {
  // Mirrors the established pattern in playback/engine.test.ts (F-24c7adee):
  // unconditionally restore real timers after every test in this file so a
  // thrown assertion mid-test can never leak fake timers into a later test.
  afterEach(() => {
    vi.useRealTimers();
  });

  it("can be constructed without options and without touching audio until start()/countIn() is called", () => {
    expect(() => createMetronome()).not.toThrow();
    const m = createMetronome();
    expect(m.isRunning()).toBe(false);
  });

  describe("start()", () => {
    it("fires an accented click immediately at beat 1", () => {
      const { ctx, clicks } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx });

      m.start(120, 4);

      expect(clicks.length).toBe(1);
      expect(clicks[0].freq).toBe(DEFAULT_ACCENT_FREQ_HZ);
      expect(clicks[0].gainPeak).toBeCloseTo(DEFAULT_ACCENT_GAIN, 5);
      expect(m.isRunning()).toBe(true);

      m.stop();
    });

    it("schedules beats at the correct interval and accents only beat 1 of each bar", async () => {
      vi.useFakeTimers();
      const { ctx, clicks } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx });

      m.start(120, 4); // 500ms/beat, 4 beats/bar
      expect(clicks.length).toBe(1); // beat 1 (bar 1) — accent

      await vi.advanceTimersByTimeAsync(500); // beat 2
      await vi.advanceTimersByTimeAsync(500); // beat 3
      await vi.advanceTimersByTimeAsync(500); // beat 4
      await vi.advanceTimersByTimeAsync(500); // beat 5 = bar 2 beat 1 — accent again

      expect(clicks.length).toBe(5);
      expect(clicks.map((c) => c.freq)).toEqual([
        DEFAULT_ACCENT_FREQ_HZ,
        DEFAULT_BEAT_FREQ_HZ,
        DEFAULT_BEAT_FREQ_HZ,
        DEFAULT_BEAT_FREQ_HZ,
        DEFAULT_ACCENT_FREQ_HZ,
      ]);
      expect(clicks.map((c) => c.gainPeak)).toEqual([
        DEFAULT_ACCENT_GAIN,
        DEFAULT_BEAT_GAIN,
        DEFAULT_BEAT_GAIN,
        DEFAULT_BEAT_GAIN,
        DEFAULT_ACCENT_GAIN,
      ]);

      m.stop();
    });

    it("accents every beat 1 for a 3/4 (3-beat) bar", async () => {
      vi.useFakeTimers();
      const { ctx, clicks } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx });

      m.start(180, 3); // 333.33ms/beat, 3 beats/bar
      await vi.advanceTimersByTimeAsync(2000); // well past 2 full bars

      expect(clicks.length).toBeGreaterThanOrEqual(6);
      const accentIdxs = clicks.map((c, i) => (c.freq === DEFAULT_ACCENT_FREQ_HZ ? i : -1)).filter((i) => i >= 0);
      // Beat indices 0, 3, 6, ... are accented for a 3-beat bar.
      expect(accentIdxs).toEqual(accentIdxs.map((_, i) => i * 3));

      m.stop();
    });

    it("supersedes a previous run cleanly — no leaked timer from the old run", async () => {
      vi.useFakeTimers();
      const { ctx, clicks } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx });

      m.start(60, 4); // 1000ms/beat — would tick again at +1000ms if left running
      expect(clicks.length).toBe(1);

      m.start(120, 4); // supersede before the 1000ms timer fires; now 500ms/beat
      expect(clicks.length).toBe(2); // just the restart's own immediate beat 1

      await vi.advanceTimersByTimeAsync(500);
      expect(clicks.length).toBe(3); // only the new 500ms-cadence tick

      // +1000ms relative to the second start() is exactly where the STALE
      // 1000ms-cadence timer from the first start() would also have fired,
      // if it had leaked.
      await vi.advanceTimersByTimeAsync(500);
      expect(clicks.length).toBe(4); // exactly one more — not two

      m.stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(clicks.length).toBe(4); // stop() actually stopped it — nothing further

      expect(m.isRunning()).toBe(false);
    });

    it("startAtMs seeds the beat phase — off a bar boundary is not accented", () => {
      const { ctx, clicks } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx });

      // 120bpm -> 500ms/beat. startAtMs=1000 -> beatIndex = floor(1000/500) = 2
      // -> beat index 2 within a 4-beat bar -> 2 % 4 !== 0 -> not accented.
      m.start(120, 4, 1000);
      expect(clicks.length).toBe(1);
      expect(clicks[0].freq).toBe(DEFAULT_BEAT_FREQ_HZ);

      m.stop();
    });

    it("startAtMs on a bar boundary is accented", () => {
      const { ctx, clicks } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx });

      // startAtMs=2000 -> beatIndex = floor(2000/500) = 4 -> 4 % 4 === 0 -> accented.
      m.start(120, 4, 2000);
      expect(clicks.length).toBe(1);
      expect(clicks[0].freq).toBe(DEFAULT_ACCENT_FREQ_HZ);

      m.stop();
    });

    it("sanitizes invalid bpm/timeSignatureBeats instead of throwing", () => {
      const { ctx, clicks } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx });

      expect(() => m.start(NaN, 0)).not.toThrow();
      expect(clicks.length).toBe(1); // still fired one click using sane fallback defaults

      m.stop();
    });
  });

  describe("stop()", () => {
    it("kills pending timers — no further clicks after stop()", async () => {
      vi.useFakeTimers();
      const { ctx, clicks } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx });

      m.start(120, 4);
      expect(clicks.length).toBe(1);

      m.stop();
      expect(m.isRunning()).toBe(false);

      await vi.advanceTimersByTimeAsync(10_000);
      expect(clicks.length).toBe(1); // nothing further fired
    });

    it("is a safe no-op when nothing is running", () => {
      const { ctx } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx });
      expect(() => m.stop()).not.toThrow();
      expect(() => m.stop()).not.toThrow(); // idempotent
    });
  });

  describe("setTempo()", () => {
    it("reschedules the pending click without dropping or double-firing a beat", async () => {
      vi.useFakeTimers();
      const { ctx, clicks } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx });

      m.start(60, 4); // 1000ms/beat
      expect(clicks.length).toBe(1);

      await vi.advanceTimersByTimeAsync(400); // not due yet at the old tempo
      expect(clicks.length).toBe(1);

      m.setTempo(120); // 500ms/beat — reschedule anchored to lastFireAt (still t=0)
      // 400ms already elapsed since the last click; new interval is 500ms,
      // so the next click should land ~100ms from now, not another 600ms away.
      await vi.advanceTimersByTimeAsync(99);
      expect(clicks.length).toBe(1); // not yet
      await vi.advanceTimersByTimeAsync(2);
      expect(clicks.length).toBe(2); // fires right around the 100ms mark

      m.stop();
    });

    it("is a safe no-op when nothing is running", () => {
      const { ctx } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx });
      expect(() => m.setTempo(150)).not.toThrow();
      expect(m.isRunning()).toBe(false);
    });

    it("keeps countIn's bounded completion (does not turn it into an infinite run)", async () => {
      vi.useFakeTimers();
      const { ctx, clicks } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx, bpm: 120, timeSignatureBeats: 4 });

      let resolved = false;
      const p = m.countIn(1).then(() => { resolved = true; }); // 4 clicks total
      expect(clicks.length).toBe(1);

      await vi.advanceTimersByTimeAsync(500);
      m.setTempo(240); // speed up mid count-in — 250ms/beat from here
      await vi.advanceTimersByTimeAsync(250);
      await vi.advanceTimersByTimeAsync(250);
      expect(clicks.length).toBe(4); // exactly 4 clicks — setTempo didn't add or drop any
      expect(resolved).toBe(false); // trailing interval still pending

      await vi.advanceTimersByTimeAsync(250); // the trailing silent interval, now at the new tempo
      expect(clicks.length).toBe(4); // no 5th click
      expect(resolved).toBe(true);

      await p;
    });
  });

  describe("countIn()", () => {
    it("resolves immediately with no clicks when bars <= 0", async () => {
      const { ctx, clicks } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx });

      await m.countIn(0);
      expect(clicks.length).toBe(0);
      expect(m.isRunning()).toBe(false);

      await m.countIn(-3);
      expect(clicks.length).toBe(0);
    });

    it("resolves after exactly bars*beats clicks, one beat-interval after the last", async () => {
      vi.useFakeTimers();
      const { ctx, clicks } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx, bpm: 120, timeSignatureBeats: 4 });

      let resolved = false;
      const p = m.countIn(1).then(() => { resolved = true; }); // 1 bar x 4 beats = 4 clicks

      expect(clicks.length).toBe(1); // beat 1 fires synchronously

      await vi.advanceTimersByTimeAsync(500); // beat 2
      await vi.advanceTimersByTimeAsync(500); // beat 3
      await vi.advanceTimersByTimeAsync(500); // beat 4 (last count-in click)
      expect(clicks.length).toBe(4);
      expect(resolved).toBe(false); // one trailing beat-interval of silence remains

      await vi.advanceTimersByTimeAsync(500); // the trailing interval
      expect(clicks.length).toBe(4); // no 5th click was fired
      expect(resolved).toBe(true);

      await p;
    });

    it("opts.bpm/opts.timeSignatureBeats override the constructor-configured tempo and beat count for this count-in", async () => {
      vi.useFakeTimers();
      const { ctx, clicks } = createFakeAudioContext();
      // Constructed at 60bpm/4 beats — countIn()'s opts should override both.
      const m = createMetronome({ audioContextFactory: () => ctx, bpm: 60, timeSignatureBeats: 4 });

      let resolved = false;
      const p = m.countIn(1, { bpm: 120, timeSignatureBeats: 3 }).then(() => { resolved = true; }); // 1 bar x 3 beats = 3 clicks at 500ms/beat

      expect(clicks.length).toBe(1); // beat 1 fires synchronously, accented

      await vi.advanceTimersByTimeAsync(500); // beat 2 — at the OVERRIDDEN 500ms/beat, not the constructor's 1000ms/beat
      await vi.advanceTimersByTimeAsync(500); // beat 3 (last count-in click, since totalBeats = 1*3)
      expect(clicks.length).toBe(3);
      expect(resolved).toBe(false); // trailing interval still pending

      await vi.advanceTimersByTimeAsync(500); // the trailing interval, still at 500ms
      expect(clicks.length).toBe(3); // no 4th click — confirms timeSignatureBeats=3 (not the constructor's 4) was honored
      expect(resolved).toBe(true);
      expect(clicks.map((c) => c.freq)).toEqual([
        DEFAULT_ACCENT_FREQ_HZ, DEFAULT_BEAT_FREQ_HZ, DEFAULT_BEAT_FREQ_HZ,
      ]);

      await p;
    });

    it("opts applied before the first click means the accent pattern itself reflects the overridden timeSignatureBeats", async () => {
      vi.useFakeTimers();
      const { ctx, clicks } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx, bpm: 120, timeSignatureBeats: 4 });

      const p = m.countIn(2, { timeSignatureBeats: 3 }); // 2 bars x 3 beats = 6 clicks, not 2x4=8
      await vi.advanceTimersByTimeAsync(500 * 6);
      await p;

      expect(clicks.length).toBe(6);
      const accentIdxs = clicks.map((c, i) => (c.freq === DEFAULT_ACCENT_FREQ_HZ ? i : -1)).filter((i) => i >= 0);
      expect(accentIdxs).toEqual([0, 3]); // beat 1 of each 3-beat bar — 4-beat accenting would have given [0, 4]
    });

    it("2 bars of 3/4 fires exactly 6 clicks, all accented on beat 1 of each bar", async () => {
      vi.useFakeTimers();
      const { ctx, clicks } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx, bpm: 120, timeSignatureBeats: 3 });

      const p = m.countIn(2); // 2 bars x 3 beats = 6 clicks
      await vi.advanceTimersByTimeAsync(500 * 6);
      await p;

      expect(clicks.length).toBe(6);
      expect(clicks.map((c) => c.freq)).toEqual([
        DEFAULT_ACCENT_FREQ_HZ, DEFAULT_BEAT_FREQ_HZ, DEFAULT_BEAT_FREQ_HZ,
        DEFAULT_ACCENT_FREQ_HZ, DEFAULT_BEAT_FREQ_HZ, DEFAULT_BEAT_FREQ_HZ,
      ]);
    });

    it("a concurrent stop() resolves the promise early instead of hanging", async () => {
      vi.useFakeTimers();
      const { ctx, clicks } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx, bpm: 120, timeSignatureBeats: 4 });

      const p = m.countIn(2); // 2 bars x 4 beats = 8 clicks — never gets there
      expect(clicks.length).toBe(1);

      m.stop();
      await p; // must resolve, not hang

      await vi.advanceTimersByTimeAsync(5000);
      expect(clicks.length).toBe(1); // no more clicks after stop()
      expect(m.isRunning()).toBe(false);
    });

    it("a fresh start() after countIn() resolves plays through without re-clicking the count-in", async () => {
      vi.useFakeTimers();
      const { ctx, clicks } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx, bpm: 120, timeSignatureBeats: 4 });

      await (async () => {
        const p = m.countIn(1); // 4 clicks
        await vi.advanceTimersByTimeAsync(500 * 4);
        await p;
      })();
      expect(clicks.length).toBe(4);

      m.start(120, 4); // hand off into continuous playback — fresh accented beat 1
      expect(clicks.length).toBe(5);
      expect(clicks[4].freq).toBe(DEFAULT_ACCENT_FREQ_HZ);

      m.stop();
    });
  });

  describe("audio context injection", () => {
    it("supports an async audioContextFactory (not just a synchronous one)", async () => {
      const { ctx, clicks } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => Promise.resolve(ctx) });

      m.start(120, 4);
      // Real macrotask boundary — guarantees every pending microtask (however
      // many hops the async factory resolution takes) has flushed by the
      // time this fires, without hard-coding a microtask-hop count.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(clicks.length).toBe(1);
      expect(clicks[0].freq).toBe(DEFAULT_ACCENT_FREQ_HZ);

      m.stop();
    });

    it("click envelope: silence -> attack ramp -> decay ramp, then the oscillator starts and stops", () => {
      const calls: string[] = [];
      const ctx: MetronomeAudioContext = {
        currentTime: 0,
        destination: {},
        createOscillator: () => ({
          type: "sine",
          frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect: () => {},
          start: () => { calls.push("osc.start"); },
          stop: () => { calls.push("osc.stop"); },
        }),
        createGain: () => ({
          gain: {
            value: 0,
            setValueAtTime: () => { calls.push("gain.setValueAtTime"); },
            linearRampToValueAtTime: () => { calls.push("gain.linearRamp"); },
            exponentialRampToValueAtTime: () => { calls.push("gain.expRamp"); },
          },
          connect: () => {},
          disconnect: () => {},
        }),
      };

      const m = createMetronome({ audioContextFactory: () => ctx });
      m.start(120, 4);

      expect(calls).toEqual([
        "gain.setValueAtTime",
        "gain.linearRamp",
        "gain.expRamp",
        "osc.start",
        "osc.stop",
      ]);

      m.stop();
    });

    it("a synth failure is swallowed — the scheduling loop keeps running", async () => {
      vi.useFakeTimers();
      let calls = 0;
      const throwingCtx: MetronomeAudioContext = {
        currentTime: 0,
        destination: {},
        createOscillator: () => {
          calls++;
          throw new Error("synthetic audio failure");
        },
        createGain: () => ({
          gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect: () => {},
          disconnect: () => {},
        }),
      };

      const m = createMetronome({ audioContextFactory: () => throwingCtx });
      expect(() => m.start(120, 4)).not.toThrow();
      expect(calls).toBe(1);

      await vi.advanceTimersByTimeAsync(500);
      expect(calls).toBe(2); // the loop kept scheduling despite the synth throwing
      expect(m.isRunning()).toBe(true);

      m.stop();
    });
  });

  describe("isRunning()", () => {
    it("reflects the countIn()/start()/stop() lifecycle", async () => {
      vi.useFakeTimers();
      const { ctx } = createFakeAudioContext();
      const m = createMetronome({ audioContextFactory: () => ctx });

      expect(m.isRunning()).toBe(false);

      m.start(120, 4);
      expect(m.isRunning()).toBe(true);
      m.stop();
      expect(m.isRunning()).toBe(false);

      const p = m.countIn(1); // 1 bar x 4 beats (default timeSignatureBeats)
      expect(m.isRunning()).toBe(true);
      await vi.advanceTimersByTimeAsync(500 * 4); // 3 remaining beats + trailing interval
      expect(m.isRunning()).toBe(false);
      await p;
    });
  });
});
