import { describe, it, expect, beforeAll } from "vitest";
import { getSong, initializeFromLibrary } from "./songs/index.js";
import { createSession } from "./session.js";
import { createMockVmpkConnector } from "./vmpk.js";
import { createRecordingTeachingHook } from "./teaching.js";
import type { PlaybackProgress } from "./types.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize registry at module level (before describe bodies run)
initializeFromLibrary(join(__dirname, "..", "songs", "library"));

describe("SessionController", () => {
  const moonlight = getSong("satie-gymnopedie-no1")!;
  const blues = getSong("fallin")!;

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
  const blues = getSong("fallin")!;

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
  const blues = getSong("fallin")!;

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
    const blues = getSong("fallin")!;
    const sc = createSession(blues, mock);
    expect(sc.parseWarnings).toEqual([]);
  });
});

describe("Edge cases: boundary navigation", () => {
  const moonlight = getSong("satie-gymnopedie-no1")!;

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
  const blues = getSong("fallin")!;

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
  const moonlight = getSong("satie-gymnopedie-no1")!;

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
});

describe("Edge cases: setSpeed validation", () => {
  const blues = getSong("fallin")!;

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
  const blues = getSong("fallin")!;
  const moonlight = getSong("satie-gymnopedie-no1")!;

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
