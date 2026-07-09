import { describe, it, expect, beforeAll } from "vitest";
import { getSong, initializeFromLibrary } from "./songs/index.js";
import { createSession } from "./session.js";
import { createMockVmpkConnector } from "./vmpk.js";
import { createRecordingTeachingHook } from "./teaching.js";
import type { PlaybackProgress, SongEntry, VmpkConnector } from "./types.js";
import type { MetronomeEngine } from "./playback/metronome.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Retrieve a song or throw a descriptive error (never returns null). */
function requireSong(id: string): SongEntry {
  const song = getSong(id);
  if (!song) throw new Error(`Song not found: ${id}`);
  return song;
}

beforeAll(() => {
  initializeFromLibrary(join(__dirname, "..", "songs", "library"));
});

describe("SessionController", () => {
  let moonlight: SongEntry;
  let blues: SongEntry;

  beforeAll(() => {
    moonlight = requireSong("satie-gymnopedie-no1");
    blues = requireSong("fallin");
  });

  it("creates a session in 'loaded' state", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock);
    expect(sc.state).toBe("loaded");
    expect(sc.session.song.id).toBe("satie-gymnopedie-no1");
    expect(sc.totalMeasures).toBe(79);
  });

  it("reports correct tempo", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock);
    expect(sc.effectiveTempo()).toBe(89); // song default
  });

  it("respects tempo override", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock, { tempo: 100 });
    expect(sc.effectiveTempo()).toBe(100);
  });

  it("plays through all measures in full mode", async () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(blues, mock);
    await mock.connect();

    await sc.play();

    expect(sc.state).toBe("finished");
    expect(sc.session.measuresPlayed).toBe(25);
  });

  it("plays one measure in measure mode then pauses", async () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock, { mode: "measure" });
    await mock.connect();

    await sc.play();

    expect(sc.state).toBe("paused");
    expect(sc.session.currentMeasure).toBe(0); // still on first measure
    expect(sc.session.measuresPlayed).toBe(1);
  });

  it("advances with next() in measure mode", async () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock, { mode: "measure" });

    sc.next();
    expect(sc.currentMeasureDisplay).toBe(2);

    sc.next();
    expect(sc.currentMeasureDisplay).toBe(3);

    sc.prev();
    expect(sc.currentMeasureDisplay).toBe(2);
  });

  it("goTo jumps to specific measure", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock);

    sc.goTo(5); // 1-based
    expect(sc.currentMeasureDisplay).toBe(5);
    expect(sc.session.currentMeasure).toBe(4); // 0-based internal
  });

  it("stop resets to beginning", async () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock, { mode: "measure" });
    await mock.connect();

    await sc.play(); // plays measure 1
    sc.next();
    sc.stop();

    expect(sc.state).toBe("idle");
    expect(sc.session.currentMeasure).toBe(0);
  });

  it("setTempo re-parses measures", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock);

    sc.setTempo(200);
    expect(sc.effectiveTempo()).toBe(200);
    expect(sc.session.tempoOverride).toBe(200);
  });

  it("setTempo rejects out-of-range values", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock);

    expect(() => sc.setTempo(5)).toThrow("10 and 400");
    expect(() => sc.setTempo(500)).toThrow("10 and 400");
  });

  it("rejects invalid initial tempo", () => {
    const mock = createMockVmpkConnector();
    expect(() => createSession(moonlight, mock, { tempo: 5 })).toThrow("10 and 400");
    expect(() => createSession(moonlight, mock, { tempo: 500 })).toThrow("10 and 400");
  });

  it("summary includes song info", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock);
    const summary = sc.summary();

    expect(summary).toContain("Gymnopedie No. 1");
    expect(summary).toContain("Satie");
    expect(summary).toContain("classical");
    expect(summary).toContain("89 BPM");
  });

  it("records MIDI events through mock connector", async () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock, { mode: "measure" });
    await mock.connect();

    await sc.play(); // plays one measure

    // Should have playNote events
    const playNotes = mock.events.filter((e) => e.type === "playNote");
    expect(playNotes.length).toBeGreaterThan(0);

    // First note should be a valid MIDI number
    expect(playNotes[0].note).toBeGreaterThanOrEqual(0);
    expect(playNotes[0].note).toBeLessThanOrEqual(127);
  });

  it("hands mode plays RH, LH, then both", async () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock, { mode: "hands" });
    await mock.connect();

    await sc.play();

    expect(sc.state).toBe("paused");
    // In hands mode, we play 3x the notes for one measure (RH, LH, both)
    const playNotes = mock.events.filter((e) => e.type === "playNote");
    expect(playNotes.length).toBeGreaterThan(0);
  });
});

describe("MockVmpkConnector", () => {
  it("tracks connect/disconnect", async () => {
    const mock = createMockVmpkConnector();
    expect(mock.status()).toBe("disconnected");

    await mock.connect();
    expect(mock.status()).toBe("connected");

    await mock.disconnect();
    expect(mock.status()).toBe("disconnected");
  });

  it("records noteOn/noteOff events", () => {
    const mock = createMockVmpkConnector();
    mock.noteOn(60, 100, 0);
    mock.noteOff(60, 0);

    expect(mock.events).toEqual([
      { type: "noteOn", note: 60, velocity: 100, channel: 0 },
      { type: "noteOff", note: 60, channel: 0 },
    ]);
  });

  it("records allNotesOff", () => {
    const mock = createMockVmpkConnector();
    mock.allNotesOff(0);
    expect(mock.events[0].type).toBe("allNotesOff");
  });

  it("listPorts returns mock port", () => {
    const mock = createMockVmpkConnector();
    expect(mock.listPorts()).toEqual(["Mock Port 1"]);
  });
});

describe("Speed control", () => {
  let blues: SongEntry;
  beforeAll(() => { blues = requireSong("fallin"); });

  it("defaults speed to 1.0", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(blues, mock);
    expect(sc.session.speed).toBe(1.0);
    expect(sc.effectiveTempo()).toBe(blues.tempo);
  });

  it("applies speed multiplier to effective tempo", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(blues, mock, { speed: 0.5 });
    expect(sc.session.speed).toBe(0.5);
    expect(sc.effectiveTempo()).toBe(blues.tempo * 0.5);
  });

  it("stacks speed with tempo override", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(blues, mock, { tempo: 100, speed: 0.5 });
    expect(sc.baseTempo()).toBe(100);
    expect(sc.effectiveTempo()).toBe(50);
  });

  it("setSpeed changes speed and re-parses", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(blues, mock);
    sc.setSpeed(2.0);
    expect(sc.session.speed).toBe(2.0);
    expect(sc.effectiveTempo()).toBe(blues.tempo * 2.0);
  });

  it("rejects invalid speed values", () => {
    const mock = createMockVmpkConnector();
    expect(() => createSession(blues, mock, { speed: 0 })).toThrow();
    expect(() => createSession(blues, mock, { speed: -1 })).toThrow();
    expect(() => createSession(blues, mock, { speed: 5 })).toThrow();
  });

  it("summary shows speed when not 1.0", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(blues, mock, { speed: 0.75 });
    expect(sc.summary()).toContain("0.75x");
  });
});

describe("Progress tracking", () => {
  let blues: SongEntry;
  beforeAll(() => { blues = requireSong("fallin"); });

  it("fires progress after every measure when interval=0", async () => {
    const mock = createMockVmpkConnector();
    const events: PlaybackProgress[] = [];
    const sc = createSession(blues, mock, {
      onProgress: (p) => events.push({ ...p }),
      progressInterval: 0,
    });
    await mock.connect();
    await sc.play();

    expect(events.length).toBe(25); // one per measure
    expect(events[0].currentMeasure).toBe(1);
    expect(events[24].currentMeasure).toBe(25);
    expect(events[24].percent).toBe("100%");
  });

  it("fires progress at 10% milestones (default)", async () => {
    const mock = createMockVmpkConnector();
    const events: PlaybackProgress[] = [];
    const sc = createSession(blues, mock, {
      onProgress: (p) => events.push({ ...p }),
      // default: progressInterval = 0.1
    });
    await mock.connect();
    await sc.play();

    // 25 measures → milestones at 4%, 8%, 12%, …, 96%, 100%
    // With floor(ratio/0.1), fires at milestones 0,1,2,3,...10
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThanOrEqual(25);
  });

  it("does not fire when no callback is set", async () => {
    const mock = createMockVmpkConnector();
    // No onProgress — should not throw
    const sc = createSession(blues, mock);
    await mock.connect();
    await sc.play();
    expect(sc.state).toBe("finished");
  });

  it("progress includes elapsed time", async () => {
    const mock = createMockVmpkConnector();
    const events: PlaybackProgress[] = [];
    const sc = createSession(blues, mock, {
      onProgress: (p) => events.push({ ...p }),
      progressInterval: 0,
    });
    await mock.connect();
    await sc.play();

    expect(events[0].elapsedMs).toBeGreaterThanOrEqual(0);
  });
});

describe("Parse warnings", () => {
  it("exposes parseWarnings array (empty for valid songs)", () => {
    const mock = createMockVmpkConnector();
    const blues = requireSong("fallin");
    const sc = createSession(blues, mock);
    expect(sc.parseWarnings).toEqual([]);
  });
});

describe("Edge cases: boundary navigation", () => {
  let moonlight: SongEntry;
  beforeAll(() => { moonlight = requireSong("satie-gymnopedie-no1"); });

  it("next() at last measure stays on last measure", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock);

    sc.goTo(79); // go to last measure (1-based)
    expect(sc.currentMeasureDisplay).toBe(79);

    sc.next(); // should not go past last
    expect(sc.currentMeasureDisplay).toBe(79);
    expect(sc.session.currentMeasure).toBe(78); // 0-based
  });

  it("prev() at first measure stays on first measure", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock);

    expect(sc.currentMeasureDisplay).toBe(1);
    sc.prev(); // should not go below 0
    expect(sc.currentMeasureDisplay).toBe(1);
    expect(sc.session.currentMeasure).toBe(0);
  });

  it("goTo(0) is ignored (1-based: invalid)", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock);

    sc.goTo(5); // move to measure 5
    sc.goTo(0); // invalid — should be ignored
    expect(sc.currentMeasureDisplay).toBe(5); // unchanged
  });

  it("goTo(-1) is ignored", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock);

    sc.goTo(3);
    sc.goTo(-1); // invalid
    expect(sc.currentMeasureDisplay).toBe(3); // unchanged
  });

  it("goTo beyond totalMeasures is ignored", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock);

    sc.goTo(3);
    sc.goTo(100); // way past 79 measures
    expect(sc.currentMeasureDisplay).toBe(3); // unchanged
  });

  it("goTo(totalMeasures) lands on last measure", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock);

    sc.goTo(moonlight.measures.length);
    expect(sc.currentMeasureDisplay).toBe(79);
    expect(sc.session.currentMeasure).toBe(78);
  });
});

describe("Edge cases: loop mode", () => {
  let blues: SongEntry;
  beforeAll(() => { blues = requireSong("fallin"); });

  it("loop mode creates session with loopRange", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(blues, mock, {
      mode: "loop",
      loopRange: [1, 4],
    });

    expect(sc.session.mode).toBe("loop");
    expect(sc.session.loopRange).toEqual([1, 4]);
  });

  it("loop mode defaults loopRange to null", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(blues, mock, { mode: "loop" });

    expect(sc.session.mode).toBe("loop");
    expect(sc.session.loopRange).toBeNull();
  });

  it("loop mode with stop() via progress callback halts playback", async () => {
    const mock = createMockVmpkConnector();
    let progressCount = 0;
    const sc = createSession(blues, mock, {
      mode: "loop",
      loopRange: [1, 2],
      onProgress: () => {
        progressCount++;
        if (progressCount >= 4) {
          // Stop after 2 loop iterations (2 measures × 2)
          sc.stop();
        }
      },
      progressInterval: 0,
    });
    await mock.connect();

    await sc.play();
    expect(sc.state).toBe("idle");
    expect(sc.session.measuresPlayed).toBeGreaterThanOrEqual(4);
  });
});

describe("Edge cases: play/pause/stop state machine", () => {
  let moonlight: SongEntry;
  beforeAll(() => { moonlight = requireSong("satie-gymnopedie-no1"); });

  it("play() on already-playing session is no-op", async () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock, { mode: "measure" });
    await mock.connect();

    // Start playing
    await sc.play();
    expect(sc.state).toBe("paused"); // measure mode pauses after one

    // Now set state to playing manually to test guard
    sc.session.state = "playing";
    await sc.play(); // should return immediately
    expect(sc.session.state).toBe("playing"); // unchanged
  });

  it("play() after finished restarts from beginning", async () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock);
    await mock.connect();

    await sc.play();
    expect(sc.state).toBe("finished");

    // Play again — should restart
    await sc.play();
    expect(sc.state).toBe("finished");
    expect(sc.session.measuresPlayed).toBe(158); // 79 + 79
  });

  it("pause() on non-playing session is no-op", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock);

    sc.pause(); // state is "loaded", not "playing"
    expect(sc.state).toBe("loaded"); // unchanged
  });

  it("stop() sends allNotesOff to connector", async () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock, { mode: "measure" });
    await mock.connect();

    await sc.play();
    mock.events.length = 0; // clear events

    sc.stop();
    const offEvents = mock.events.filter((e) => e.type === "allNotesOff");
    expect(offEvents.length).toBe(1);
  });

  it("stop() works from paused state (B-SRV-002)", async () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(moonlight, mock, { mode: "measure" });
    await mock.connect();

    await sc.play(); // measure mode pauses after first measure
    expect(sc.state).toBe("paused");

    mock.events.length = 0;
    sc.stop();
    // stop() resets to idle and sends allNotesOff — no orphaned state
    expect(sc.state).toBe("idle");
    const offEvents = mock.events.filter((e) => e.type === "allNotesOff");
    expect(offEvents.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Hand mute/unmute (FT-CORE-019)", () => {
  let song: SongEntry;
  beforeAll(() => { song = requireSong("satie-gymnopedie-no1"); });

  it("muteHand/unmuteHand toggles state", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(song, mock);
    expect(sc.isHandMuted("left")).toBe(false);
    expect(sc.isHandMuted("right")).toBe(false);

    sc.muteHand("left");
    expect(sc.isHandMuted("left")).toBe(true);
    expect(sc.isHandMuted("right")).toBe(false);

    sc.unmuteHand("left");
    expect(sc.isHandMuted("left")).toBe(false);
  });

  it("muted hand produces fewer note events during playback", async () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(song, mock, { mode: "measure" });
    await mock.connect();

    // Play one measure with both hands
    await sc.play();
    const bothHandsNotes = mock.events.filter(e => e.type === "noteOn").length;

    // Play again with left hand muted
    mock.events.length = 0;
    const sc2 = createSession(song, mock, { mode: "measure" });
    sc2.muteHand("left");
    await sc2.play();
    const rightOnlyNotes = mock.events.filter(e => e.type === "noteOn").length;

    // Muting left should produce fewer or equal notes (right only)
    expect(rightOnlyNotes).toBeLessThanOrEqual(bothHandsNotes);
  });

  it("muting both hands produces zero note events", async () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(song, mock, { mode: "measure" });
    await mock.connect();

    sc.muteHand("left");
    sc.muteHand("right");
    await sc.play();
    const notes = mock.events.filter(e => e.type === "noteOn").length;
    expect(notes).toBe(0);
  });
});

describe("Edge cases: setSpeed validation", () => {
  let blues: SongEntry;
  beforeAll(() => { blues = requireSong("fallin"); });

  it("setSpeed(0) throws", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(blues, mock);
    expect(() => sc.setSpeed(0)).toThrow();
  });

  it("setSpeed(-1) throws", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(blues, mock);
    expect(() => sc.setSpeed(-1)).toThrow();
  });

  it("setSpeed(5) throws (over max 4)", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(blues, mock);
    expect(() => sc.setSpeed(5)).toThrow();
  });

  it("setSpeed(4) is accepted (boundary)", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(blues, mock);
    sc.setSpeed(4);
    expect(sc.session.speed).toBe(4);
  });

  it("setSpeed(0.01) is accepted (near-zero boundary)", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(blues, mock);
    sc.setSpeed(0.01);
    expect(sc.session.speed).toBe(0.01);
  });
});

describe("SyncMode", () => {
  let blues: SongEntry;
  let moonlight: SongEntry;
  beforeAll(() => {
    blues = requireSong("fallin");
    moonlight = requireSong("satie-gymnopedie-no1");
  });

  it("defaults syncMode to concurrent", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(blues, mock);
    expect(sc.session.syncMode).toBe("concurrent");
  });

  it("accepts syncMode: before", () => {
    const mock = createMockVmpkConnector();
    const sc = createSession(blues, mock, { syncMode: "before" });
    expect(sc.session.syncMode).toBe("before");
  });

  it("concurrent mode: voice and playback run in parallel", async () => {
    const mock = createMockVmpkConnector();
    const hook = createRecordingTeachingHook();
    const sc = createSession(blues, mock, {
      syncMode: "concurrent",
      teachingHook: hook,
    });
    await mock.connect();
    await sc.play();

    expect(sc.state).toBe("finished");
    expect(sc.session.measuresPlayed).toBe(25);
    const starts = hook.events.filter((e) => e.type === "measure-start");
    expect(starts.length).toBe(25);
  });

  it("before mode: voice completes before playback starts", async () => {
    const mock = createMockVmpkConnector();
    const hook = createRecordingTeachingHook();
    const sc = createSession(blues, mock, {
      syncMode: "before",
      teachingHook: hook,
    });
    await mock.connect();
    await sc.play();

    expect(sc.state).toBe("finished");
    expect(sc.session.measuresPlayed).toBe(25);
    const starts = hook.events.filter((e) => e.type === "measure-start");
    expect(starts.length).toBe(25);
  });

  it("hands mode respects syncMode: concurrent", async () => {
    const mock = createMockVmpkConnector();
    const hook = createRecordingTeachingHook();
    const sc = createSession(moonlight, mock, {
      mode: "hands",
      syncMode: "concurrent",
      teachingHook: hook,
    });
    await mock.connect();
    await sc.play();

    expect(sc.state).toBe("paused");
    const starts = hook.events.filter((e) => e.type === "measure-start");
    expect(starts.length).toBe(1);
  });

  it("hands mode respects syncMode: before", async () => {
    const mock = createMockVmpkConnector();
    const hook = createRecordingTeachingHook();
    const sc = createSession(moonlight, mock, {
      mode: "hands",
      syncMode: "before",
      teachingHook: hook,
    });
    await mock.connect();
    await sc.play();

    expect(sc.state).toBe("paused");
    const starts = hook.events.filter((e) => e.type === "measure-start");
    expect(starts.length).toBe(1);
  });
});

// ─── Metronome + Recording (Wave S1) ────────────────────────────────────────

/**
 * Minimal deterministic song fixture for metronome/recording tests — real
 * library songs are fine for the pre-existing describe blocks above, but
 * these tests need exact, hand-computable note timings, so they build their
 * own tiny song rather than depending on real library content.
 *
 * 120 BPM, 4/4. Right hand: 4 distinct quarter notes/measure (0.5s apart).
 * Left hand: 2 distinct half notes/measure (1.0s apart) — both hands sum to
 * exactly 2.0s/measure, so the two measures land at t=[0,2) and t=[2,4).
 * Every pitch across both measures is unique, so recorded events can be
 * looked up by MIDI note number without depending on array order (RH/LH
 * play concurrently, so their exact push order isn't a documented contract).
 */
function makeMetronomeTestSong(overrides: Partial<SongEntry> = {}): SongEntry {
  return {
    id: "metronome-test-song",
    title: "Metronome Test Song",
    genre: "classical",
    difficulty: "beginner",
    key: "C major",
    tempo: 120,
    timeSignature: "4/4",
    durationSeconds: 4,
    musicalLanguage: {
      description: "test",
      structure: "test",
      keyMoments: [],
      teachingGoals: [],
      styleTips: [],
    },
    measures: [
      { number: 1, rightHand: "C4:q E4:q G4:q C5:q", leftHand: "C3:h G3:h" },
      { number: 2, rightHand: "D4:q F4:q A4:q D5:q", leftHand: "D3:h A3:h" },
    ],
    tags: [],
    ...overrides,
  };
}

/**
 * A fake MetronomeEngine for session-orchestration tests — mirrors the real
 * MetronomeEngine's countIn()/stop() contract (stop() resolves a pending
 * countIn() rather than hanging it) without touching any audio. Records
 * every call as a string in `calls` so tests can assert call order/args.
 *
 * `autoResolveCountIn` (default true): when false, countIn() stays pending
 * until the test calls the returned `resolveCountIn()` (or the session
 * calls stop()) — used by tests that need to observe "no notes played yet"
 * while a count-in is still in flight.
 */
function createFakeMetronome(opts: { autoResolveCountIn?: boolean } = {}): {
  engine: MetronomeEngine;
  calls: string[];
  /**
   * Every countIn() invocation's (bars, opts) — additive, alongside `calls`
   * (whose `countIn(${bars})` string format is unchanged) — lets tests
   * assert exactly what tempo/beats a count-in was configured with without
   * touching the existing `calls`-based assertions.
   */
  countInCalls: Array<{ bars: number; opts?: { bpm?: number; timeSignatureBeats?: number } }>;
  resolveCountIn: () => void;
} {
  const calls: string[] = [];
  const countInCalls: Array<{ bars: number; opts?: { bpm?: number; timeSignatureBeats?: number } }> = [];
  let running = false;
  let pendingResolvers: Array<() => void> = [];

  function drainPending(): void {
    const resolvers = pendingResolvers;
    pendingResolvers = [];
    running = false;
    for (const resolve of resolvers) resolve();
  }

  const engine: MetronomeEngine = {
    start(bpm, timeSignatureBeats, startAtMs) {
      calls.push(`start(${bpm},${timeSignatureBeats}${startAtMs !== undefined ? "," + startAtMs : ""})`);
      running = true;
    },
    stop() {
      calls.push("stop");
      drainPending();
    },
    setTempo(bpm) {
      calls.push(`setTempo(${bpm})`);
    },
    countIn(bars, countInOpts) {
      calls.push(`countIn(${bars})`);
      countInCalls.push({ bars, opts: countInOpts });
      running = true;
      if (opts.autoResolveCountIn ?? true) {
        return Promise.resolve().then(() => { running = false; });
      }
      return new Promise<void>((resolve) => {
        pendingResolvers.push(resolve);
      });
    },
    isRunning() {
      return running;
    },
  };

  return { engine, calls, countInCalls, resolveCountIn: drainPending };
}

/**
 * A minimal VmpkConnector whose playNote() calls `onNote` with a running
 * 1-based count across the connector's whole lifetime. Used to trigger a
 * synchronous mid-measure pause() at an exact, deterministic note — real
 * timers/wall-clock delays aren't reliable enough for "pause between note 2
 * and note 3" against the mock connector's effectively-synchronous
 * playNote() (see the pause/resume recording-integrity test below).
 */
function createCountingConnector(onNote: (count: number) => void): VmpkConnector {
  let count = 0;
  return {
    async connect() { /* no-op */ },
    async disconnect() { /* no-op */ },
    status() { return "connected"; },
    listPorts() { return []; },
    noteOn() { /* no-op */ },
    noteOff() { /* no-op */ },
    allNotesOff() { /* no-op */ },
    async playNote() {
      count++;
      onNote(count);
    },
  };
}

describe("Metronome integration", () => {
  let song: SongEntry;
  beforeAll(() => { song = makeMetronomeTestSong(); });

  it("metronome disabled (default): the metronome factory is never invoked", async () => {
    const mock = createMockVmpkConnector();
    let factoryCalls = 0;
    const sc = createSession(song, mock, {
      metronomeFactory: () => { factoryCalls++; return createFakeMetronome().engine; },
    });
    await mock.connect();
    await sc.play();
    expect(factoryCalls).toBe(0);
  });

  it("metronome: true with no countIn specified defaults to a 1-bar count-in", async () => {
    const mock = createMockVmpkConnector();
    const { engine, calls } = createFakeMetronome();
    const sc = createSession(song, mock, { metronome: true, metronomeFactory: () => engine });
    expect(sc.session.countInBars).toBe(1);
    await mock.connect();
    await sc.play();
    expect(calls).toContain("countIn(1)");
  });

  it("countIn: 0 skips count-in but still starts the continuous click", async () => {
    const mock = createMockVmpkConnector();
    const { engine, calls } = createFakeMetronome();
    const sc = createSession(song, mock, { metronome: true, countIn: 0, metronomeFactory: () => engine });
    await mock.connect();
    await sc.play();
    expect(calls.some((c) => c.startsWith("countIn"))).toBe(false);
    expect(calls.some((c) => c.startsWith("start("))).toBe(true);
  });

  it("clickOnlyDuringCountIn: true counts in but never starts the continuous click", async () => {
    const mock = createMockVmpkConnector();
    const { engine, calls } = createFakeMetronome();
    const sc = createSession(song, mock, {
      metronome: true,
      countIn: 1,
      clickOnlyDuringCountIn: true,
      metronomeFactory: () => engine,
    });
    await mock.connect();
    await sc.play();
    expect(calls).toContain("countIn(1)");
    expect(calls.some((c) => c.startsWith("start("))).toBe(false);
  });

  it("start() is called with the effective tempo and the song's time-signature beat count", async () => {
    const mock = createMockVmpkConnector();
    const { engine, calls } = createFakeMetronome();
    const sc = createSession(song, mock, {
      metronome: true,
      countIn: 0,
      speed: 2.0,
      metronomeFactory: () => engine,
    });
    await mock.connect();
    await sc.play();
    expect(calls).toContain(`start(${song.tempo * 2.0},4)`);
  });

  it("count-in is configured with the session's effective tempo and time-signature beats — not the metronome engine's own defaults (F-count-in-config)", async () => {
    const mock = createMockVmpkConnector();
    const song = makeMetronomeTestSong({ tempo: 90, timeSignature: "3/4" });
    const { engine, countInCalls } = createFakeMetronome();
    const sc = createSession(song, mock, {
      metronome: true,
      countIn: 1,
      speed: 0.5,
      metronomeFactory: () => engine,
    });
    await mock.connect();
    await sc.play();

    expect(countInCalls).toHaveLength(1);
    expect(countInCalls[0].bars).toBe(1);
    // 90 BPM * 0.5 speed = 45 effective BPM; "3/4" -> 3 beats/bar. Before
    // the fix, createMetronome() was constructed with no options (see
    // createSession()), so the count-in silently used the engine's
    // built-in defaults (120 BPM / 4 beats) instead of this song's own
    // values.
    expect(countInCalls[0].opts).toEqual({ bpm: 45, timeSignatureBeats: 3 });
  });

  it("startedAtMs is stamped after the count-in resolves, not at play()'s own start (previously off by the count-in's duration)", async () => {
    const mock = createMockVmpkConnector();
    const song = makeMetronomeTestSong();
    const { engine, resolveCountIn } = createFakeMetronome({ autoResolveCountIn: false });
    const sc = createSession(song, mock, {
      metronome: true,
      countIn: 1,
      record: true,
      metronomeFactory: () => engine,
    });
    await mock.connect();

    const playPromise = sc.play();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Still mid count-in (the fake metronome hasn't resolved it yet) — the
    // take hasn't truly started, so startedAtMs must still be at its unset
    // sentinel (0), not already stamped from play()'s own entry.
    expect(sc.getRecording().startedAtMs).toBe(0);

    const beforeResolve = Date.now();
    await new Promise((r) => setTimeout(r, 20)); // simulate the count-in's real wall-clock duration
    resolveCountIn();
    await playPromise;

    const rec = sc.getRecording();
    // Stamped at/after the count-in's actual resolution — a stamp taken at
    // play()'s own start would be strictly earlier than beforeResolve.
    expect(rec.startedAtMs).toBeGreaterThanOrEqual(beforeResolve);
  });

  it("no notes play until the count-in resolves", async () => {
    const mock = createMockVmpkConnector();
    const { engine, resolveCountIn } = createFakeMetronome({ autoResolveCountIn: false });
    const sc = createSession(song, mock, { metronome: true, countIn: 1, metronomeFactory: () => engine });
    await mock.connect();

    const playPromise = sc.play();
    // play() should be synchronously suspended inside `await
    // this.metronome.countIn(...)` at this point — give the microtask
    // queue a few idle turns as extra insurance either way.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(mock.events.some((e) => e.type === "playNote")).toBe(false);

    resolveCountIn();
    await playPromise;

    expect(mock.events.some((e) => e.type === "playNote")).toBe(true);
  });

  it("pause() during count-in stops the metronome and play() returns with no notes played", async () => {
    const mock = createMockVmpkConnector();
    const { engine, calls } = createFakeMetronome({ autoResolveCountIn: false });
    const sc = createSession(song, mock, { metronome: true, countIn: 1, metronomeFactory: () => engine });
    await mock.connect();

    const playPromise = sc.play();
    await Promise.resolve();
    await Promise.resolve();
    sc.pause();
    await playPromise;

    expect(calls).toContain("stop");
    expect(mock.events.some((e) => e.type === "playNote")).toBe(false);
    expect(sc.state).toBe("paused");
  });

  it("resuming from pause (measure mode) does not re-trigger count-in", async () => {
    const mock = createMockVmpkConnector();
    const { engine, calls } = createFakeMetronome();
    const sc = createSession(song, mock, { mode: "measure", metronome: true, metronomeFactory: () => engine });
    await mock.connect();

    await sc.play(); // measure 1 — fresh start, should count in
    expect(calls.filter((c) => c.startsWith("countIn")).length).toBe(1);

    await sc.play(); // measure 2 — resume from paused, must NOT count in again
    expect(calls.filter((c) => c.startsWith("countIn")).length).toBe(1);
  });

  it("restarting a finished session (fresh start) re-triggers count-in", async () => {
    const mock = createMockVmpkConnector();
    const { engine, calls } = createFakeMetronome();
    const sc = createSession(song, mock, { metronome: true, metronomeFactory: () => engine });
    await mock.connect();

    await sc.play(); // full mode — plays through to "finished"
    expect(sc.state).toBe("finished");
    expect(calls.filter((c) => c.startsWith("countIn")).length).toBe(1);

    await sc.play(); // finished -> playing is a fresh restart
    expect(calls.filter((c) => c.startsWith("countIn")).length).toBe(2);
  });

  it("setSpeed/setTempo propagate the new effective tempo to the metronome (click sync)", () => {
    const mock = createMockVmpkConnector();
    const { engine, calls } = createFakeMetronome();
    const sc = createSession(song, mock, { metronome: true, metronomeFactory: () => engine });

    sc.setSpeed(2.0);
    expect(calls).toContain(`setTempo(${song.tempo * 2.0})`);

    sc.setTempo(90);
    expect(calls).toContain(`setTempo(${90 * 2.0})`);
  });

  it("stop() during active playback silences the metronome immediately", async () => {
    const mock = createMockVmpkConnector();
    const { engine, calls } = createFakeMetronome();
    const sc = createSession(song, mock, {
      mode: "measure",
      metronome: true,
      countIn: 0,
      metronomeFactory: () => engine,
    });
    await mock.connect();
    await sc.play();
    calls.length = 0;
    sc.stop();
    expect(calls).toContain("stop");
  });
});

describe("Recording (session/library path)", () => {
  it("getRecording() is empty when record is not enabled (default)", async () => {
    const mock = createMockVmpkConnector();
    const song = makeMetronomeTestSong();
    const sc = createSession(song, mock);
    await mock.connect();
    await sc.play();

    const rec = sc.getRecording();
    expect(rec.events).toEqual([]);
    expect(rec.source).toBe("session");
  });

  it("captures notes with schedule-based times/durations when record is enabled", async () => {
    const mock = createMockVmpkConnector();
    const song = makeMetronomeTestSong();
    const sc = createSession(song, mock, { record: true });
    await mock.connect();
    await sc.play();

    const rec = sc.getRecording();
    expect(rec.source).toBe("session");
    expect(rec.songId).toBe(song.id);
    expect(rec.events.length).toBe(12); // (4 RH + 2 LH) notes/measure x 2 measures

    // Every pitch in this fixture is unique, so events can be looked up by
    // MIDI note number regardless of the RH/LH concurrent push order.
    const byNote = new Map(rec.events.map((e) => [e.note, e]));
    const at = (midi: number) => {
      const e = byNote.get(midi);
      if (!e) throw new Error(`no recorded event for MIDI note ${midi}`);
      return e;
    };

    // Measure 1 (t starts at 0) — right hand: C4 E4 G4 C5, quarters @120bpm = 0.5s apart.
    expect(at(60).time).toBeCloseTo(0, 5);
    expect(at(60).duration).toBeCloseTo(0.5, 5);
    expect(at(64).time).toBeCloseTo(0.5, 5);
    expect(at(67).time).toBeCloseTo(1.0, 5);
    expect(at(72).time).toBeCloseTo(1.5, 5);

    // Measure 1 — left hand: C3 G3, halves @120bpm = 1.0s apart.
    expect(at(48).time).toBeCloseTo(0, 5);
    expect(at(48).duration).toBeCloseTo(1.0, 5);
    expect(at(55).time).toBeCloseTo(1.0, 5);

    // Measure 2 starts at t=2.0 (measure 1's nominal 2.0s duration).
    expect(at(62).time).toBeCloseTo(2.0, 5); // D4
    expect(at(65).time).toBeCloseTo(2.5, 5); // F4
    expect(at(69).time).toBeCloseTo(3.0, 5); // A4
    expect(at(74).time).toBeCloseTo(3.5, 5); // D5
    expect(at(50).time).toBeCloseTo(2.0, 5); // D3
    expect(at(57).time).toBeCloseTo(3.0, 5); // A3
  });

  it("getRecording().speed reflects the session's current speed, not the speed at record-start", () => {
    const mock = createMockVmpkConnector();
    const song = makeMetronomeTestSong();
    const sc = createSession(song, mock, { record: true, speed: 0.5 });

    expect(sc.getRecording().speed).toBe(0.5);
    sc.setSpeed(2.0);
    expect(sc.getRecording().speed).toBe(2.0);
  });

  it("measure mode accumulates one continuous recording across multiple play() calls", async () => {
    const mock = createMockVmpkConnector();
    const song = makeMetronomeTestSong();
    const sc = createSession(song, mock, { mode: "measure", record: true });
    await mock.connect();

    await sc.play(); // measure 1
    expect(sc.getRecording().events.length).toBe(6);

    sc.next();
    await sc.play(); // measure 2
    expect(sc.getRecording().events.length).toBe(12);
    // Measure 2's notes should be recorded starting at t=2.0, continuing the
    // same clock rather than restarting at t=0.
    const byNote = new Map(sc.getRecording().events.map((e) => [e.note, e]));
    expect(byNote.get(62)?.time).toBeCloseTo(2.0, 5); // D4
  });

  it("stop() resets the recording on the next fresh play() (does not carry over)", async () => {
    const mock = createMockVmpkConnector();
    const song = makeMetronomeTestSong();
    const sc = createSession(song, mock, { mode: "measure", record: true });
    await mock.connect();

    await sc.play(); // measure 1
    expect(sc.getRecording().events.length).toBe(6);

    sc.stop();
    await sc.play(); // fresh start after stop() — measure 1 again
    expect(sc.getRecording().events.length).toBe(6); // not 12 — old recording discarded
  });
});

// ─── Recording: nominal-time contract (session-path fix-up) ────────────────
//
// The session path records event times/durations in NOMINAL song-time
// seconds (what they'd be at speed 1.0), not at played/effective-tempo —
// unlike the MIDI-playback path (PlaybackController), which stays
// wall-clock/at-played-speed (see controls.test.ts's "speed tracking"
// describe block). This makes a mid-take setSpeed() exactly recoverable:
// only the portion of the take recorded after the change picks up the new
// speed, and nothing already recorded shifts retroactively.

describe("Recording — nominal-time contract (session path)", () => {
  it("nominalBpm reflects tempoOverride when set, captured once at record start", async () => {
    const mock = createMockVmpkConnector();
    const song = makeMetronomeTestSong();
    const sc = createSession(song, mock, { record: true, tempo: 90 });
    await mock.connect();
    await sc.play();

    const rec = sc.getRecording();
    expect(rec.nominalBpm).toBe(90);
    expect(rec.effectiveBpmAtStart).toBe(90); // speed defaults to 1.0
  });

  it("nominalBpm falls back to song.tempo when there's no tempoOverride", async () => {
    const mock = createMockVmpkConnector();
    const song = makeMetronomeTestSong();
    const sc = createSession(song, mock, { record: true });
    await mock.connect();
    await sc.play();

    expect(sc.getRecording().nominalBpm).toBe(song.tempo);
  });

  it("effectiveBpmAtStart is nominalBpm * speed-at-start, distinct from nominalBpm when speed != 1", async () => {
    const mock = createMockVmpkConnector();
    const song = makeMetronomeTestSong();
    const sc = createSession(song, mock, { record: true, speed: 0.5 });
    await mock.connect();
    await sc.play();

    const rec = sc.getRecording();
    expect(rec.nominalBpm).toBe(120);
    expect(rec.effectiveBpmAtStart).toBe(60);
  });

  it("a mid-take setSpeed() still lands recorded events at the correct NOMINAL time — exactly recoverable", async () => {
    const mock = createMockVmpkConnector();
    const song = makeMetronomeTestSong();
    const sc = createSession(song, mock, { mode: "measure", record: true });
    await mock.connect();

    await sc.play(); // measure 1 at speed 1.0
    sc.next();
    sc.setSpeed(2.0); // speed changes mid-take, before measure 2 plays
    await sc.play(); // measure 2 — actually plays at 2x, but should still record at the SAME nominal times a speed-1.0 take would

    const rec = sc.getRecording();
    expect(rec.nominalBpm).toBe(120); // captured at record-start (measure 1), unaffected by the later setSpeed()
    expect(rec.events.length).toBe(12);

    const byNote = new Map(rec.events.map((e) => [e.note, e]));
    // Measure 1 (speed 1.0 throughout): unaffected, same as the baseline test above.
    expect(byNote.get(60)?.time).toBeCloseTo(0, 5);
    expect(byNote.get(48)?.duration).toBeCloseTo(1.0, 5);
    // Measure 2's nominal positions are identical to a speed-1.0 take — the
    // speed=2.0 actually used to PLAY it doesn't shift them.
    expect(byNote.get(62)?.time).toBeCloseTo(2.0, 5); // D4
    expect(byNote.get(62)?.duration).toBeCloseTo(0.5, 5);
    expect(byNote.get(65)?.time).toBeCloseTo(2.5, 5); // F4
    expect(byNote.get(69)?.time).toBeCloseTo(3.0, 5); // A4
    expect(byNote.get(74)?.time).toBeCloseTo(3.5, 5); // D5
    expect(byNote.get(50)?.time).toBeCloseTo(2.0, 5); // D3
    expect(byNote.get(50)?.duration).toBeCloseTo(1.0, 5);
    expect(byNote.get(57)?.time).toBeCloseTo(3.0, 5); // A3
  });
});

// ─── Recording: pause/resume integrity (mid-measure abort fix-up) ──────────

describe("Recording — pause/resume mid-measure integrity", () => {
  it("pause mid-measure then resume records each note exactly once at correct nominal times", async () => {
    const song = makeMetronomeTestSong();
    let pauseFn: (() => void) | null = null;
    const connector = createCountingConnector((count) => {
      // Measure 1 (LH muted) = 4 RH notes (count 1-4). Pause partway
      // through measure 2's RH notes (count 5-8) — right after the 2nd
      // note (count 6), so the interrupted attempt has recorded D4 and F4
      // before playRange() ever notices the abort.
      if (count === 6 && pauseFn) pauseFn();
    });
    const sc = createSession(song, connector, { record: true });
    pauseFn = () => sc.pause();
    sc.muteHand("left"); // removes RH/LH concurrency so note order is fully deterministic
    await connector.connect();

    await sc.play(); // runs until the engineered pause() fires mid measure-2

    expect(sc.state).toBe("paused");
    expect(sc.session.currentMeasure).toBe(1); // still measure 2 (0-based) — not advanced past it

    await sc.play(); // resume — plays the rest of the song
    expect(sc.state).toBe("finished");

    const rec = sc.getRecording();
    expect(rec.events).toHaveLength(8); // 4 RH notes/measure x 2 measures, each exactly once — no duplicates
    const notes = rec.events.map((e) => e.note).sort((a, b) => a - b);
    expect(notes).toEqual([60, 62, 64, 65, 67, 69, 72, 74]);

    const byNote = new Map(rec.events.map((e) => [e.note, e]));
    // Measure 1 (nominal t starts at 0): C4 E4 G4 C5 quarters @120bpm = 0.5s apart.
    expect(byNote.get(60)?.time).toBeCloseTo(0, 5);
    expect(byNote.get(64)?.time).toBeCloseTo(0.5, 5);
    expect(byNote.get(67)?.time).toBeCloseTo(1.0, 5);
    expect(byNote.get(72)?.time).toBeCloseTo(1.5, 5);
    // Measure 2 (nominal t starts at 2.0, unshifted by the pause/resume): D4 F4 A4 D5.
    // Before the fix, the interrupted attempt's D4/F4 would have stayed in
    // the recording (duplicated by the replay) AND the replay would have
    // recorded from a cursor already advanced to t=4.0 instead of t=2.0.
    expect(byNote.get(62)?.time).toBeCloseTo(2.0, 5);
    expect(byNote.get(65)?.time).toBeCloseTo(2.5, 5);
    expect(byNote.get(69)?.time).toBeCloseTo(3.0, 5);
    expect(byNote.get(74)?.time).toBeCloseTo(3.5, 5);
  });

  it("hands mode: pause mid-phase then resume records the measure exactly once (all three phases discarded and replayed together)", async () => {
    const song = makeMetronomeTestSong();
    let pauseFn: (() => void) | null = null;
    const connector = createCountingConnector((count) => {
      // RH-alone phase = 4 notes (C4 E4 G4 C5). Pause after the 2nd (E4),
      // mid-phase — well before the LH-alone or both-together phases run.
      if (count === 2 && pauseFn) pauseFn();
    });
    const sc = createSession(song, connector, { mode: "hands", record: true });
    pauseFn = () => sc.pause();
    await connector.connect();

    await sc.play(); // interrupted mid RH-alone phase of measure 1
    expect(sc.state).toBe("paused");
    expect(sc.getRecording().events).toHaveLength(0); // the partial RH-alone attempt was fully rewound

    await sc.play(); // resume — replays all three phases of measure 1 from scratch
    expect(sc.state).toBe("paused"); // hands mode always pauses after one measure

    const rec = sc.getRecording();
    // One full hands-mode measure records 3 passes: RH alone (4 notes), LH
    // alone (2 notes), then both together (4 + 2 = 6) = 12 total — and,
    // critically, no leftover events from the interrupted first attempt.
    expect(rec.events).toHaveLength(12);
  });
});
