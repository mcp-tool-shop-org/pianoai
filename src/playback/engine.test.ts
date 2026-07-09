// ─── MIDI Playback Engine Tests ──────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeMidi } from "midi-file";
import { parseMidiBuffer } from "../midi/parser.js";
import { MidiPlaybackEngine } from "./midi-engine.js";
import { calculateSchedule, totalDurationMs, clusterEvents } from "./timing.js";
import type { VmpkConnector, MidiStatus, MidiNote } from "../types.js";
import type { MidiNoteEvent } from "../midi/types.js";

// ─── Test Helpers ───────────────────────────────────────────────────────────

/** Build a minimal MIDI buffer for testing. */
function buildMidi(notes: Array<{
  note: number;
  velocity: number;
  startTick: number;
  endTick: number;
}>, bpm = 120, ticksPerBeat = 480): Uint8Array {
  const usPerBeat = Math.round(60_000_000 / bpm);
  type MidiEvent = { deltaTime: number; type: string; [key: string]: any };
  const events: MidiEvent[] = [];

  events.push({ deltaTime: 0, type: "setTempo", meta: true, microsecondsPerBeat: usPerBeat });

  const raw: Array<{ tick: number; event: MidiEvent }> = [];
  for (const n of notes) {
    raw.push({ tick: n.startTick, event: { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: n.note, velocity: n.velocity } });
    raw.push({ tick: n.endTick, event: { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: n.note, velocity: 0 } });
  }
  raw.sort((a, b) => a.tick - b.tick);

  let prevTick = 0;
  for (const r of raw) {
    r.event.deltaTime = r.tick - prevTick;
    prevTick = r.tick;
    events.push(r.event);
  }
  events.push({ deltaTime: 0, type: "endOfTrack", meta: true });

  return new Uint8Array(writeMidi({
    header: { format: 0 as const, numTracks: 1, ticksPerBeat },
    tracks: [events],
  } as any));
}

/** Create a mock VmpkConnector that records calls. */
function createMockConnector(): VmpkConnector & {
  calls: Array<{ method: string; args: any[] }>;
} {
  const calls: Array<{ method: string; args: any[] }> = [];
  return {
    calls,
    async connect() { calls.push({ method: "connect", args: [] }); },
    async disconnect() { calls.push({ method: "disconnect", args: [] }); },
    status(): MidiStatus { return "connected"; },
    listPorts() { return ["Mock"]; },
    noteOn(note: number, velocity: number, channel?: number) {
      calls.push({ method: "noteOn", args: [note, velocity, channel] });
    },
    noteOff(note: number, channel?: number) {
      calls.push({ method: "noteOff", args: [note, channel] });
    },
    allNotesOff(channel?: number) {
      calls.push({ method: "allNotesOff", args: [channel] });
    },
    async playNote(midiNote: MidiNote) {
      calls.push({ method: "playNote", args: [midiNote] });
    },
  };
}

// ─── Engine Tests ───────────────────────────────────────────────────────────

describe("MidiPlaybackEngine", () => {
  // T-B-* (Stage B real-timer-race fix): three tests below (pause-mid-flight,
  // stop-mid-flight, pause+resume+stop-again) use vi.useFakeTimers() to
  // deterministically control the engine's internal setTimeout-based
  // scheduling (sleepInterruptible / scheduleNoteOff in midi-engine.ts, both
  // plain global setTimeout) instead of racing it against a real wall-clock
  // wait. This afterEach unconditionally restores real timers after EVERY
  // test in this describe block (a safe no-op for tests that never faked
  // them, e.g. "respects speed multiplier" below, which genuinely measures
  // real elapsed time and must keep doing so), so a thrown assertion
  // mid-test can never leak fake timers into a later test — mirrors the
  // established pattern in src/dataset/provenance-url-verifier.test.ts
  // (F-24c7adee).
  afterEach(() => {
    vi.useRealTimers();
  });

  it("plays all notes in order", async () => {
    // 3 quarter notes at 120 BPM (C, E, G)
    const buf = buildMidi([
      { note: 60, velocity: 100, startTick: 0, endTick: 480 },
      { note: 64, velocity: 90, startTick: 480, endTick: 960 },
      { note: 67, velocity: 80, startTick: 960, endTick: 1440 },
    ]);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const engine = new MidiPlaybackEngine(connector, parsed);

    await engine.play({ speed: 4 }); // max allowed speed — fast

    // Should have called noteOn for all 3 notes
    const noteOns = connector.calls.filter((c) => c.method === "noteOn");
    expect(noteOns.length).toBe(3);
    expect(noteOns[0].args[0]).toBe(60);
    expect(noteOns[1].args[0]).toBe(64);
    expect(noteOns[2].args[0]).toBe(67);

    expect(engine.state).toBe("finished");
    expect(engine.eventsPlayed).toBe(3);
  });

  it("respects speed multiplier", async () => {
    const buf = buildMidi([
      { note: 60, velocity: 100, startTick: 0, endTick: 480 },
    ]);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const engine = new MidiPlaybackEngine(connector, parsed);

    const start = Date.now();
    await engine.play({ speed: 4 }); // max allowed speed (0.1-4, MidiPlaybackEngine.setSpeed's bound)
    const elapsed = Date.now() - start;

    // At 4x speed, a 0.5s note should take ~125ms — well under a 1x bound.
    expect(elapsed).toBeLessThan(300);
    expect(engine.state).toBe("finished");
  });

  it("can be stopped mid-playback", async () => {
    // A long sequence of notes
    const notes = [];
    for (let i = 0; i < 20; i++) {
      notes.push({ note: 60 + (i % 12), velocity: 100, startTick: i * 480, endTick: (i + 1) * 480 });
    }
    const buf = buildMidi(notes);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const engine = new MidiPlaybackEngine(connector, parsed);

    // Start playing at normal speed, then stop after a brief delay
    const playPromise = engine.play({ speed: 2.0 });
    setTimeout(() => engine.stop(), 50);
    await playPromise;

    expect(engine.state).toBe("stopped");
    // Should have played some but not all notes
    expect(engine.eventsPlayed).toBeLessThan(20);

    // allNotesOff should have been called (cleanup)
    const panics = connector.calls.filter((c) => c.method === "allNotesOff");
    expect(panics.length).toBeGreaterThan(0);
  });

  it("fires noteOn with correct velocity", async () => {
    const buf = buildMidi([
      { note: 60, velocity: 42, startTick: 0, endTick: 480 },
    ]);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const engine = new MidiPlaybackEngine(connector, parsed);

    await engine.play({ speed: 4 });

    const noteOns = connector.calls.filter((c) => c.method === "noteOn");
    expect(noteOns[0].args).toEqual([60, 42, 0]); // note, velocity, channel
  });

  it("handles empty MIDI (no events)", async () => {
    const buf = buildMidi([]);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const engine = new MidiPlaybackEngine(connector, parsed);

    await engine.play({ speed: 4 });

    expect(engine.state).toBe("finished");
    expect(engine.eventsPlayed).toBe(0);
  });

  it("reports correct eventsPlayed and totalEvents", async () => {
    const buf = buildMidi([
      { note: 60, velocity: 100, startTick: 0, endTick: 480 },
      { note: 64, velocity: 100, startTick: 480, endTick: 960 },
    ]);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const engine = new MidiPlaybackEngine(connector, parsed);

    expect(engine.totalEvents).toBe(2);
    expect(engine.eventsPlayed).toBe(0);

    await engine.play({ speed: 4 });

    expect(engine.eventsPlayed).toBe(2);
  });

  // ── pause/resume/stop state machine (pins F-ca978f89) ──────────────────
  //
  // pause() and stop() both interrupt playback via the same
  // _abortController. Before the fix, BOTH of play()'s abort-check branches
  // unconditionally set `this._state = "stopped"` — so pause() would set
  // 'paused' synchronously, then the suspended play() loop would wake up on
  // the next microtask tick and immediately clobber it back to 'stopped'.
  // resume() (and MidiPlaybackEngine.resume()) both guard on
  // state === 'paused', so after any pause() the pause/resume feature was a
  // silent no-op. The fix tracks pause-vs-stop intent via a private
  // `_pauseRequested` flag, set by pause() and cleared by stop().

  it("pause() sets state to 'paused' (not 'stopped') and resume() continues without replaying finished notes", async () => {
    // Kept small (5 notes, not 20): resume() below must run at a real,
    // capped speed (MidiPlaybackEngine.setSpeed's post-F-d50cccd7 bound of
    // 0.1-4, so it can no longer "speed: 100" fast-forward through many
    // notes instantly) — a small note count keeps this test's wall-clock
    // cost reasonable while still proving the invariant: >=1 note before
    // pause, >=1 remaining note after resume, none replayed, none dropped.
    const NOTE_COUNT = 5;
    const notes = [];
    for (let i = 0; i < NOTE_COUNT; i++) {
      notes.push({ note: 60 + (i % 12), velocity: 100, startTick: i * 480, endTick: (i + 1) * 480 });
    }
    const buf = buildMidi(notes);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const engine = new MidiPlaybackEngine(connector, parsed);

    vi.useFakeTimers();
    const playPromise = engine.play({ speed: 2.0 });
    // Let a handful of notes fire, then pause mid-flight (well inside the
    // inter-note sleep window at this speed). Deterministic fake-timer
    // advance replaces the original real `setTimeout(resolve, 50)` race
    // against the engine's own real-timer scheduling (T-B-* fix, Stage B):
    // the 50ms simulated advance is queued and flushed synchronously with
    // respect to the engine's internal setTimeout calls, so exactly one
    // note fires here on every run, not "usually one note, occasionally a
    // different count under CI load."
    await vi.advanceTimersByTimeAsync(50);
    engine.pause();
    await playPromise;

    // The load-bearing assertion: pause() must land on 'paused', not
    // 'stopped'.
    expect(engine.state).toBe("paused");
    const playedBeforeResume = engine.eventsPlayed;
    expect(playedBeforeResume).toBeGreaterThan(0);
    expect(playedBeforeResume).toBeLessThan(NOTE_COUNT);

    const noteOnsBeforeResume = connector.calls.filter((c) => c.method === "noteOn").length;
    expect(noteOnsBeforeResume).toBe(playedBeforeResume);

    // Before the fix, state was already clobbered to 'stopped' by this point,
    // so resume() (guarded on state === 'paused') would have silently no-op'd
    // and playback would never continue.
    const resumePromise = engine.resume({ speed: 4 });
    // Fire every remaining fake timer (inter-note sleeps + note-off timers)
    // until the queue drains, which happens exactly when play() reaches
    // "finished" and stops scheduling new ones — equivalent to "wait for it
    // to actually finish," just without any real wall-clock wait.
    await vi.runAllTimersAsync();
    await resumePromise;

    expect(engine.state).toBe("finished");
    expect(engine.eventsPlayed).toBe(NOTE_COUNT);

    // Full invariant: every note fired exactly once, in order — none
    // replayed from the top, none dropped.
    const noteOnsAfterResume = connector.calls.filter((c) => c.method === "noteOn");
    expect(noteOnsAfterResume.length).toBe(NOTE_COUNT);
    expect(noteOnsAfterResume.map((c) => c.args[0])).toEqual(notes.map((n) => n.note));
  });

  it("stop() still transitions to 'stopped' (not 'paused'), and resume() no-ops afterward", async () => {
    const notes = [];
    for (let i = 0; i < 20; i++) {
      notes.push({ note: 60 + (i % 12), velocity: 100, startTick: i * 480, endTick: (i + 1) * 480 });
    }
    const buf = buildMidi(notes);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const engine = new MidiPlaybackEngine(connector, parsed);

    vi.useFakeTimers();
    const playPromise = engine.play({ speed: 2.0 });
    // Deterministic fake-timer advance — see the pause() test above for why
    // this replaces the original real 50ms race (T-B-* fix, Stage B).
    await vi.advanceTimersByTimeAsync(50);
    engine.stop();
    await playPromise;

    expect(engine.state).toBe("stopped");
    const noteOnsAtStop = connector.calls.filter((c) => c.method === "noteOn").length;
    expect(noteOnsAtStop).toBeGreaterThan(0);
    expect(noteOnsAtStop).toBeLessThan(20);

    // resume() is guarded on state === 'paused'; after a real stop() it must
    // remain a no-op — no additional notes fire, state stays 'stopped'.
    await engine.resume({ speed: 4 });
    expect(engine.state).toBe("stopped");
    expect(connector.calls.filter((c) => c.method === "noteOn").length).toBe(noteOnsAtStop);
  });

  it("a stop() issued after a prior pause()+resume() cycle still ends in 'stopped' (pause intent from the earlier cycle does not leak in)", async () => {
    const notes = [];
    for (let i = 0; i < 20; i++) {
      notes.push({ note: 60 + (i % 12), velocity: 100, startTick: i * 480, endTick: (i + 1) * 480 });
    }
    const buf = buildMidi(notes);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const engine = new MidiPlaybackEngine(connector, parsed);

    // First pause/resume cycle.
    vi.useFakeTimers();
    const firstPlay = engine.play({ speed: 2.0 });
    // Deterministic fake-timer advance — see the pause() test above for why
    // this replaces the original real 50ms race (T-B-* fix, Stage B).
    await vi.advanceTimersByTimeAsync(50);
    engine.pause();
    await firstPlay;
    expect(engine.state).toBe("paused");

    // Resume, then stop while genuinely playing (not paused) this time —
    // this is the scenario a naive "set once, never clear" flag would get
    // wrong: a stale _pauseRequested=true left over from the earlier pause()
    // could make this stop() incorrectly resolve to 'paused'.
    const resumePromise = engine.resume({ speed: 2.0 });
    await vi.advanceTimersByTimeAsync(50);
    engine.stop();
    await resumePromise;

    expect(engine.state).toBe("stopped");
  });
});

// ─── Timing Utility Tests ───────────────────────────────────────────────────

describe("timing utilities", () => {
  const events: MidiNoteEvent[] = [
    { note: 60, velocity: 100, time: 0, duration: 0.5, channel: 0 },
    { note: 64, velocity: 90, time: 0.5, duration: 0.5, channel: 0 },
    { note: 67, velocity: 80, time: 1.0, duration: 0.5, channel: 0 },
  ];

  it("calculateSchedule at speed 1.0", () => {
    const scheduled = calculateSchedule(events, 1.0);
    expect(scheduled[0].scheduledOnMs).toBeCloseTo(0);
    expect(scheduled[1].scheduledOnMs).toBeCloseTo(500);
    expect(scheduled[2].scheduledOnMs).toBeCloseTo(1000);
    expect(scheduled[0].scheduledOffMs).toBeCloseTo(500);
  });

  it("calculateSchedule at speed 2.0 (double time)", () => {
    const scheduled = calculateSchedule(events, 2.0);
    expect(scheduled[0].scheduledOnMs).toBeCloseTo(0);
    expect(scheduled[1].scheduledOnMs).toBeCloseTo(250);
    expect(scheduled[2].scheduledOnMs).toBeCloseTo(500);
  });

  it("totalDurationMs", () => {
    expect(totalDurationMs(events, 1.0)).toBeCloseTo(1500);
    expect(totalDurationMs(events, 2.0)).toBeCloseTo(750);
    expect(totalDurationMs([], 1.0)).toBe(0);
  });

  it("clusterEvents groups simultaneous notes", () => {
    const chord: MidiNoteEvent[] = [
      { note: 60, velocity: 100, time: 0, duration: 1, channel: 0 },
      { note: 64, velocity: 100, time: 0, duration: 1, channel: 0 },
      { note: 67, velocity: 100, time: 0, duration: 1, channel: 0 },
      { note: 72, velocity: 100, time: 1, duration: 1, channel: 0 },
    ];
    const clusters = clusterEvents(chord, 5);
    expect(clusters.length).toBe(2);
    expect(clusters[0].length).toBe(3); // chord
    expect(clusters[1].length).toBe(1); // single note
  });
});
