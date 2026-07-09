import { describe, it, expect } from "vitest";
import {
  resolvePracticeLoopConfig,
  formatMicroGoal,
  formatMaxPassesReachedGoal,
  windowSong,
  isCleanPass,
  decideRamp,
  rankWorstMeasures,
  worstMeasuresPracticeConfig,
  measureDiagnostics,
  formatMeasureDiagnosticLines,
  formatPassSummary,
  PracticeLoop,
  CLEAN_PASS_MIN_COMPLETENESS,
  DEFAULT_SPEED_START_PCT,
  DEFAULT_SPEED_TARGET_PCT,
  DEFAULT_RAMP_STEP_PCT,
  type ResolvedPracticeLoopConfig,
  type PracticePassResult,
} from "./practice-loop.js";
import { createMockVmpkConnector } from "./vmpk.js";
import type { SongEntry, VmpkConnector } from "./types.js";
import type { PerformanceResult, NoteVerdict } from "./score-performance.js";
import type { MetronomeEngine } from "./playback/metronome.js";
import { SessionController } from "./session.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeTestSong(overrides: Partial<SongEntry> = {}): SongEntry {
  return {
    id: "practice-loop-test-song",
    title: "Practice Loop Test Song",
    genre: "classical",
    difficulty: "beginner",
    key: "C major",
    tempo: 120,
    timeSignature: "4/4",
    durationSeconds: 8,
    musicalLanguage: { description: "test", structure: "test", keyMoments: [], teachingGoals: [], styleTips: [] },
    measures: [
      { number: 1, rightHand: "C4:q E4:q G4:q C5:q", leftHand: "C3:h G3:h" },
      { number: 2, rightHand: "D4:q F4:q A4:q D5:q", leftHand: "D3:h A3:h" },
      { number: 3, rightHand: "E4:q G4:q B4:q E5:q", leftHand: "E3:h B3:h" },
      { number: 4, rightHand: "F4:q A4:q C5:q F5:q", leftHand: "F3:h C4:h" },
    ],
    tags: [],
    ...overrides,
  };
}

/** A no-op MetronomeEngine that never touches real audio — countIn() resolves on a microtask, same shape as session.test.ts's own fake. */
function createFakeMetronome(): MetronomeEngine {
  let running = false;
  return {
    start() {
      running = true;
    },
    stop() {
      running = false;
    },
    setTempo() {
      /* no-op */
    },
    countIn() {
      running = true;
      return Promise.resolve().then(() => {
        running = false;
      });
    },
    isRunning() {
      return running;
    },
  };
}

/** A VmpkConnector whose playNote() calls `onNote` with a running 1-based count — lets a test trigger a deterministic mid-pass stop(). */
function createCountingConnector(onNote: (count: number) => void): VmpkConnector {
  let count = 0;
  return {
    async connect() {
      /* no-op */
    },
    async disconnect() {
      /* no-op */
    },
    status() {
      return "connected";
    },
    listPorts() {
      return [];
    },
    noteOn() {
      /* no-op */
    },
    noteOff() {
      /* no-op */
    },
    allNotesOff() {
      /* no-op */
    },
    async playNote() {
      count++;
      onNote(count);
    },
  };
}

/** A hand-built PerformanceResult fixture — bypasses scorePerformance entirely so isCleanPass/decideRamp/rankWorstMeasures/measureDiagnostics can be tested against exact, controlled verdict sets. */
function makeResult(verdicts: NoteVerdict[], overrides: Partial<PerformanceResult["metrics"]> = {}): PerformanceResult {
  const missed = verdicts.filter((v) => v.status === "missed").length;
  const matched = verdicts.length - missed;
  const completeness = verdicts.length > 0 ? Math.round((matched / verdicts.length) * 100) : 100;
  return {
    songId: "fixture",
    songTitle: "Fixture",
    metrics: {
      overallScore: completeness,
      pitchAccuracy: 100,
      timingAccuracyMs: 0,
      completeness,
      extraNoteCount: 0,
      ...overrides,
    },
    details: {
      totalExpected: verdicts.length,
      totalPlayed: matched,
      matched,
      missed: [],
      extras: [],
      timingIssues: [],
      noteVerdicts: verdicts,
      scoredAtBpm: 120,
    },
    feedback: "",
  };
}

function verdict(measure: number, status: NoteVerdict["status"], midi = 60): NoteVerdict {
  return { measure, notation: "C4:q", midi, startSec: 0, status, offsetMs: status === "missed" ? undefined : 0 };
}

const BASE_CONFIG: ResolvedPracticeLoopConfig = {
  startMeasure: 2,
  endMeasure: 3,
  speedStartPct: 70,
  speedTargetPct: 100,
  rampStepPct: 10,
};

// ─── resolvePracticeLoopConfig ──────────────────────────────────────────────

describe("resolvePracticeLoopConfig", () => {
  const song = makeTestSong();

  it("applies documented defaults", () => {
    const resolved = resolvePracticeLoopConfig(song, { startMeasure: 1, endMeasure: 2 });
    expect(resolved.speedStartPct).toBe(DEFAULT_SPEED_START_PCT);
    expect(resolved.speedTargetPct).toBe(DEFAULT_SPEED_TARGET_PCT);
    expect(resolved.rampStepPct).toBe(DEFAULT_RAMP_STEP_PCT);
    expect(resolved.maxPasses).toBeUndefined();
  });

  it("preserves explicit values over defaults", () => {
    const resolved = resolvePracticeLoopConfig(song, {
      startMeasure: 1,
      endMeasure: 2,
      speedStartPct: 60,
      speedTargetPct: 90,
      rampStepPct: 15,
      maxPasses: 4,
    });
    expect(resolved).toEqual({ startMeasure: 1, endMeasure: 2, speedStartPct: 60, speedTargetPct: 90, rampStepPct: 15, maxPasses: 4 });
  });

  it("rejects non-integer measure bounds", () => {
    expect(() => resolvePracticeLoopConfig(song, { startMeasure: 1.5, endMeasure: 2 })).toThrow(/integers/);
  });

  it("rejects measure < 1", () => {
    expect(() => resolvePracticeLoopConfig(song, { startMeasure: 0, endMeasure: 2 })).toThrow(/>= 1/);
  });

  it("rejects endMeasure < startMeasure", () => {
    expect(() => resolvePracticeLoopConfig(song, { startMeasure: 3, endMeasure: 2 })).toThrow(/must be >= startMeasure/);
  });

  it("rejects endMeasure beyond the song's length", () => {
    expect(() => resolvePracticeLoopConfig(song, { startMeasure: 1, endMeasure: 999 })).toThrow(/exceeds/);
  });

  it("rejects speedStartPct <= 0 or > 400", () => {
    expect(() => resolvePracticeLoopConfig(song, { startMeasure: 1, endMeasure: 1, speedStartPct: 0 })).toThrow(/speedStartPct/);
    expect(() => resolvePracticeLoopConfig(song, { startMeasure: 1, endMeasure: 1, speedStartPct: 500 })).toThrow(/speedStartPct/);
  });

  it("rejects speedTargetPct < speedStartPct", () => {
    expect(() =>
      resolvePracticeLoopConfig(song, { startMeasure: 1, endMeasure: 1, speedStartPct: 80, speedTargetPct: 60 })
    ).toThrow(/speedTargetPct/);
  });

  it("rejects rampStepPct <= 0", () => {
    expect(() => resolvePracticeLoopConfig(song, { startMeasure: 1, endMeasure: 1, rampStepPct: 0 })).toThrow(/rampStepPct/);
  });

  it("rejects a non-positive-integer maxPasses", () => {
    expect(() => resolvePracticeLoopConfig(song, { startMeasure: 1, endMeasure: 1, maxPasses: 0 })).toThrow(/maxPasses/);
    expect(() => resolvePracticeLoopConfig(song, { startMeasure: 1, endMeasure: 1, maxPasses: 1.5 })).toThrow(/maxPasses/);
  });
});

// ─── formatMicroGoal ─────────────────────────────────────────────────────────

describe("formatMicroGoal", () => {
  it("formats a multi-measure range", () => {
    expect(formatMicroGoal({ startMeasure: 5, endMeasure: 8 }, 75)).toBe(
      "mm. 5–8 at 75% — aim: clean pass to advance"
    );
  });

  it("formats a single-measure range without a dash", () => {
    expect(formatMicroGoal({ startMeasure: 5, endMeasure: 5 }, 100)).toBe(
      "m. 5 at 100% — aim: clean pass to advance"
    );
  });
});

// ─── windowSong ──────────────────────────────────────────────────────────────

describe("windowSong", () => {
  it("filters to only the measures in range, preserving their .number labels", () => {
    const song = makeTestSong();
    const windowed = windowSong(song, 2, 3);
    expect(windowed.measures.map((m) => m.number)).toEqual([2, 3]);
  });

  it("preserves the rest of the song unchanged (id, title, tempo, timeSignature)", () => {
    const song = makeTestSong();
    const windowed = windowSong(song, 2, 3);
    expect(windowed.id).toBe(song.id);
    expect(windowed.title).toBe(song.title);
    expect(windowed.tempo).toBe(song.tempo);
    expect(windowed.timeSignature).toBe(song.timeSignature);
  });

  it("does not mutate the original song's measures array", () => {
    const song = makeTestSong();
    windowSong(song, 2, 3);
    expect(song.measures.length).toBe(4);
  });
});

// ─── isCleanPass / CLEAN_PASS_MIN_COMPLETENESS ─────────────────────────────

describe("isCleanPass", () => {
  it("is clean when completeness is 100 and nothing is missed", () => {
    const result = makeResult([verdict(2, "correct"), verdict(2, "timing")]);
    expect(isCleanPass(result)).toBe(true);
  });

  it("is NOT clean when any verdict is missed, even with high completeness", () => {
    // 19/20 correct = 95% completeness, but the one gap is a real miss.
    const verdicts: NoteVerdict[] = [
      ...Array.from({ length: 19 }, (_, i) => verdict(2, "correct", 60 + i)),
      verdict(2, "missed", 90),
    ];
    const result = makeResult(verdicts);
    expect(result.metrics.completeness).toBeGreaterThanOrEqual(CLEAN_PASS_MIN_COMPLETENESS);
    expect(isCleanPass(result)).toBe(false);
  });

  it("is NOT clean on the degraded (INPUT_LIMIT-guard) case — empty verdicts but low completeness", () => {
    // scorePerformance's INPUT_LIMIT guard returns noteVerdicts: [] alongside
    // completeness: 0 — an isolated "no missed verdicts" check is vacuously
    // true here, so completeness is what must reject it.
    const result = makeResult([], { completeness: 0 });
    result.details.noteVerdicts = [];
    expect(isCleanPass(result)).toBe(false);
  });

  it("a wrong-pitch near-match (status: missed) fails cleanliness even though it counted as 'matched' for completeness", () => {
    const result = makeResult([verdict(2, "correct"), verdict(2, "missed")]);
    expect(isCleanPass(result)).toBe(false);
  });
});

// ─── decideRamp ──────────────────────────────────────────────────────────────

describe("decideRamp", () => {
  const cfg = { speedTargetPct: 100, rampStepPct: 10 };

  it("holds speed and does not advance when the pass is not clean", () => {
    const result = makeResult([verdict(2, "missed")]);
    const decision = decideRamp(result, 70, cfg);
    expect(decision).toEqual({ clean: false, advanced: false, nextSpeedPct: 70, completed: false });
  });

  it("ramps by rampStepPct after a clean pass below target", () => {
    const result = makeResult([verdict(2, "correct")]);
    const decision = decideRamp(result, 70, cfg);
    expect(decision).toEqual({ clean: true, advanced: true, nextSpeedPct: 80, completed: false });
  });

  it("clamps the ramp to speedTargetPct rather than overshooting", () => {
    const result = makeResult([verdict(2, "correct")]);
    const decision = decideRamp(result, 95, cfg);
    expect(decision.nextSpeedPct).toBe(100);
  });

  it("declares completion on a clean pass already at speedTargetPct", () => {
    const result = makeResult([verdict(2, "correct")]);
    const decision = decideRamp(result, 100, cfg);
    expect(decision).toEqual({ clean: true, advanced: false, nextSpeedPct: 100, completed: true });
  });
});

// ─── rankWorstMeasures / worstMeasuresPracticeConfig ───────────────────────

describe("rankWorstMeasures", () => {
  it("ranks by missed desc, then timing desc, then measure asc — skipping correct verdicts", () => {
    const verdicts: NoteVerdict[] = [
      verdict(1, "correct"),
      verdict(2, "timing"),
      verdict(3, "missed"),
      verdict(3, "missed"),
      verdict(4, "missed"),
      verdict(4, "timing"),
      verdict(4, "timing"),
      verdict(5, "missed"),
    ];
    const result = makeResult(verdicts);
    // measure 3: 2 missed, 0 timing | measure 4: 1 missed, 2 timing | measure 5: 1 missed, 0 timing | measure 2: 0 missed, 1 timing
    // sorted by missed desc: 3(2) > {4(1), 5(1)} > 2(0); tie on missed(1) broken by timing desc: 4(2 timing) before 5(0 timing)
    expect(rankWorstMeasures(result, 10)).toEqual([3, 4, 5, 2]);
  });

  it("never includes a measure with zero missed/timing verdicts", () => {
    const result = makeResult([verdict(1, "correct"), verdict(2, "missed")]);
    expect(rankWorstMeasures(result)).toEqual([2]);
  });

  it("respects the limit (default 3)", () => {
    const verdicts: NoteVerdict[] = [1, 2, 3, 4, 5].map((m) => verdict(m, "missed"));
    const result = makeResult(verdicts);
    expect(rankWorstMeasures(result)).toHaveLength(3);
    expect(rankWorstMeasures(result, 2)).toHaveLength(2);
  });

  it("returns [] for a clean take", () => {
    const result = makeResult([verdict(1, "correct"), verdict(2, "correct")]);
    expect(rankWorstMeasures(result)).toEqual([]);
  });
});

describe("worstMeasuresPracticeConfig", () => {
  it("spans from the lowest to the highest worst measure", () => {
    const verdicts: NoteVerdict[] = [verdict(2, "missed"), verdict(9, "missed"), verdict(15, "missed")];
    const result = makeResult(verdicts);
    const config = worstMeasuresPracticeConfig(result);
    expect(config).toEqual({ startMeasure: 2, endMeasure: 15 });
  });

  it("passes through overrides (e.g. a custom rampStepPct)", () => {
    const result = makeResult([verdict(4, "missed")]);
    const config = worstMeasuresPracticeConfig(result, { rampStepPct: 3 });
    expect(config).toEqual({ startMeasure: 4, endMeasure: 4, rampStepPct: 3 });
  });

  it("returns null for a clean take (nothing to drill)", () => {
    const result = makeResult([verdict(1, "correct")]);
    expect(worstMeasuresPracticeConfig(result)).toBeNull();
  });
});

// ─── measureDiagnostics / formatMeasureDiagnosticLines / formatPassSummary ─

describe("measureDiagnostics + formatMeasureDiagnosticLines", () => {
  it("counts missed/timing per measure, ascending by measure number", () => {
    const verdicts: NoteVerdict[] = [
      verdict(3, "missed"),
      verdict(2, "timing"),
      verdict(2, "timing"),
      verdict(3, "correct"),
    ];
    const result = makeResult(verdicts);
    expect(measureDiagnostics(result)).toEqual([
      { measure: 2, missed: 0, timing: 2 },
      { measure: 3, missed: 1, timing: 0 },
    ]);
  });

  it("formats lines as 'm.N: X missed, Y timing'", () => {
    const lines = formatMeasureDiagnosticLines([
      { measure: 2, missed: 0, timing: 2 },
      { measure: 3, missed: 1, timing: 0 },
    ]);
    expect(lines).toEqual(["m.2: 2 timing", "m.3: 1 missed"]);
  });
});

describe("formatPassSummary", () => {
  it("reports notes/timing/measures counts with no grade or praise language", () => {
    const result = makeResult([verdict(2, "correct"), verdict(2, "timing"), verdict(3, "missed")]);
    const summary = formatPassSummary(result);
    expect(summary).toBe("1/3 notes correct, 1 off timing, 1 missed");
    // Task-focused wording only (finding 28/35) — no grade letters, praise, or points/streak language.
    expect(summary).not.toMatch(/\b[A-F][+-]?\b/); // no letter grades
    expect(summary).not.toMatch(/great|excellent|nice|awesome|streak|points?/i);
  });

  it("handles an empty range", () => {
    expect(formatPassSummary(makeResult([]))).toBe("no notes in range");
  });
});

// ─── PracticeLoop (integration — mock connector + fake metronome) ──────────

describe("PracticeLoop", () => {
  it("a single pass that reaches a clean take at speedTargetPct completes immediately", async () => {
    const song = makeTestSong();
    const mock = createMockVmpkConnector();
    await mock.connect();

    const loop = new PracticeLoop(
      song,
      mock,
      { startMeasure: 2, endMeasure: 3, speedStartPct: 100, speedTargetPct: 100 },
      { metronomeFactory: () => createFakeMetronome() }
    );
    loop.start();
    await loop.done();

    const state = loop.getState();
    expect(state.status).toBe("completed");
    expect(state.passes).toHaveLength(1);
    expect(state.passes[0].clean).toBe(true);
    expect(state.passes[0].speedPct).toBe(100);
  });

  it("ramps +rampStepPct only after a CLEAN pass — a muted (incomplete) first pass holds speed for the next pass", async () => {
    const song = makeTestSong();
    const mock = createMockVmpkConnector();
    await mock.connect();

    const loop = new PracticeLoop(
      song,
      mock,
      { startMeasure: 2, endMeasure: 3, speedStartPct: 70, speedTargetPct: 100, rampStepPct: 10 },
      {
        metronomeFactory: () => createFakeMetronome(),
        // Mute the left hand on pass 1 only — engineers a genuinely
        // incomplete (not clean) first pass against the REAL session +
        // scoring pipeline, not just a hand-built fixture.
        onPassSessionCreated: (session: SessionController, passNumber: number) => {
          if (passNumber === 1) session.muteHand("left");
        },
      }
    );
    loop.start();
    await loop.done();

    const state = loop.getState();
    expect(state.status).toBe("completed");
    // 70(not clean, muted) -> 70(clean, adv 80) -> 80(clean, adv 90) -> 90(clean, adv 100) -> 100(clean, completed)
    expect(state.passes.map((p) => p.speedPct)).toEqual([70, 70, 80, 90, 100]);
    expect(state.passes.map((p) => p.clean)).toEqual([false, true, true, true, true]);
    expect(state.passes[0].advanced).toBe(false);
    expect(state.passes.slice(1, 4).every((p) => p.advanced)).toBe(true);
    expect(state.passes[4].advanced).toBe(false); // already at target — nothing to advance to
  }, 15000);

  it("maxPasses caps the total number of passes even when no pass is ever clean, and reports the distinct max-passes-reached status (not \"completed\")", async () => {
    const song = makeTestSong();
    const mock = createMockVmpkConnector();
    await mock.connect();

    const loop = new PracticeLoop(
      song,
      mock,
      { startMeasure: 2, endMeasure: 3, speedStartPct: 70, speedTargetPct: 100, rampStepPct: 10, maxPasses: 3 },
      {
        metronomeFactory: () => createFakeMetronome(),
        // Mute on every pass — never clean, so without maxPasses this would run forever.
        onPassSessionCreated: (session: SessionController) => session.muteHand("left"),
      }
    );
    loop.start();
    await loop.done();

    const state = loop.getState();
    // Running out of passes without ever landing a clean one at
    // speedTargetPct is NOT the same outcome as mastering the drill —
    // "completed" would misreport that (finding — max-passes-reached).
    expect(state.status).toBe("max-passes-reached");
    expect(state.status).not.toBe("completed");
    expect(state.passes).toHaveLength(3);
    expect(state.passes.every((p) => !p.clean)).toBe(true);
    expect(state.passes.every((p) => p.speedPct === 70)).toBe(true); // never advanced

    // Task-focused, honest terminal microGoal — not the stale "aim: clean
    // pass to advance" text from the last (unclean) pass, and no
    // grade/praise/ability language.
    expect(state.microGoal).toBe(formatMaxPassesReachedGoal(loop.config, state.passes));
    expect(state.microGoal).toMatch(/target speed not yet reached/);
    expect(state.microGoal).not.toMatch(/aim: clean pass to advance/);
    for (const banned of ["Great", "Excellent", "Well done", "Poor", "Bad", "Grade"]) {
      expect(state.microGoal).not.toContain(banned);
    }
  }, 15000);

  it("getState() returns a snapshot — mutating it does not affect internal state", async () => {
    const song = makeTestSong();
    const mock = createMockVmpkConnector();
    await mock.connect();

    const loop = new PracticeLoop(
      song,
      mock,
      { startMeasure: 2, endMeasure: 3, speedStartPct: 100, speedTargetPct: 100 },
      { metronomeFactory: () => createFakeMetronome() }
    );
    loop.start();
    await loop.done();

    const snapshot = loop.getState();
    snapshot.passes.push({ passNumber: 999, speedPct: 1, result: makeResult([]), clean: true, advanced: false });
    expect(loop.getState().passes).toHaveLength(1);
  });

  it("microGoal reflects the current pass's range and speed", () => {
    const song = makeTestSong();
    const mock = createMockVmpkConnector();
    const loop = new PracticeLoop(
      song,
      mock,
      { startMeasure: 2, endMeasure: 3, speedStartPct: 65 },
      { metronomeFactory: () => createFakeMetronome() }
    );
    expect(loop.getState().microGoal).toBe("mm. 2–3 at 65% — aim: clean pass to advance");
  });

  it("stop() interrupts the in-flight pass immediately and no further passes start", async () => {
    const song = makeTestSong();
    let stopFn: (() => void) | null = null;
    const connector = createCountingConnector((count) => {
      // Measure 2 RH = 4 notes (D4 F4 A4 D5); stop mid-way through, after the 2nd.
      if (count === 2 && stopFn) stopFn();
    });
    await connector.connect();

    const loop = new PracticeLoop(
      song,
      connector,
      { startMeasure: 2, endMeasure: 3, speedStartPct: 100, speedTargetPct: 100 },
      { metronomeFactory: () => createFakeMetronome() }
    );
    stopFn = () => loop.stop();

    loop.start();
    await loop.done();

    const state = loop.getState();
    expect(state.status).toBe("stopped");
    // The interrupted pass never finished, so it was never scored/pushed.
    expect(state.passes).toHaveLength(0);
  });

  it("done() resolves even if called before start() (never hangs)", async () => {
    const song = makeTestSong();
    const mock = createMockVmpkConnector();
    const loop = new PracticeLoop(song, mock, { startMeasure: 1, endMeasure: 1 }, {});
    await expect(loop.done()).resolves.toBeUndefined();
  });

  // ─── pause()/resume()/getCurrentSession() ─────────────────────────────────

  /** Bounded poll — avoids a fixed sleep while still tolerating whatever microtask/macrotask depth the abort-unwind takes to settle. */
  async function waitUntil(predicate: () => boolean, timeoutMs = 2000, stepMs = 5): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) throw new Error("waitUntil: timed out waiting for condition");
      await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
  }

  it("getCurrentSession() is null before start() and after the loop finishes, non-null mid-pass", async () => {
    const song = makeTestSong();
    let sawSessionDuringNote: SessionController | null | undefined;
    const connector = createCountingConnector(() => {
      sawSessionDuringNote = loop.getCurrentSession();
    });
    await connector.connect();
    const loop = new PracticeLoop(
      song,
      connector,
      { startMeasure: 2, endMeasure: 3, speedStartPct: 100, speedTargetPct: 100 },
      { metronomeFactory: () => createFakeMetronome() }
    );
    expect(loop.getCurrentSession()).toBeNull();

    loop.start();
    await loop.done();

    expect(sawSessionDuringNote).not.toBeNull();
    expect(sawSessionDuringNote).not.toBeUndefined();
    expect(loop.getCurrentSession()).toBeNull();
  });

  it("pause() is a no-op when nothing is playing (before start(), and after the loop has finished)", async () => {
    const song = makeTestSong();
    const mock = createMockVmpkConnector();
    await mock.connect();
    const loop = new PracticeLoop(
      song,
      mock,
      { startMeasure: 1, endMeasure: 1, speedStartPct: 100, speedTargetPct: 100 },
      { metronomeFactory: () => createFakeMetronome() }
    );

    loop.pause(); // before start() — no current session
    expect(loop.getState().paused).toBe(false);

    loop.start();
    await loop.done();

    loop.pause(); // after completion — no current session
    expect(loop.getState().paused).toBe(false);
    expect(loop.getState().status).toBe("completed"); // unaffected by the no-op pause() calls
  });

  it(
    "pause() holds the loop at the interrupted measure; resume() continues it and the loop finishes cleanly (no dropped or duplicated notes)",
    async () => {
      const song = makeTestSong();
      let pauseFn: (() => void) | null = null;
      const connector = createCountingConnector((count) => {
        // A few notes into measure 2 (RH D4:q F4:q A4:q D5:q + LH D3:h A3:h,
        // 6 notes total) — exactly which note doesn't matter to this test.
        if (count === 2 && pauseFn) {
          const fn = pauseFn;
          pauseFn = null;
          fn();
        }
      });
      await connector.connect();

      const loop = new PracticeLoop(
        song,
        connector,
        { startMeasure: 2, endMeasure: 3, speedStartPct: 100, speedTargetPct: 100 },
        { metronomeFactory: () => createFakeMetronome() }
      );
      pauseFn = () => loop.pause();

      loop.start();
      await waitUntil(() => loop.getState().paused);

      // Paused, not stopped/completed/errored — status stays "running" the
      // whole time a pause is in effect (see PracticeLoopState.paused's doc).
      expect(loop.getState().status).toBe("running");
      expect(loop.getState().paused).toBe(true);
      expect(loop.getCurrentSession()?.state).toBe("paused");

      loop.resume();
      await loop.done();

      const state = loop.getState();
      expect(state.paused).toBe(false);
      expect(state.status).toBe("completed");
      expect(state.passes).toHaveLength(1);
      // The interrupted measure's replay-on-resume must record cleanly
      // exactly once — no missed notes (dropped by the interruption) and no
      // extra notes (duplicated by the replay).
      expect(state.passes[0].clean).toBe(true);
      expect(state.passes[0].result.metrics.completeness).toBe(100);
      expect(state.passes[0].result.metrics.extraNoteCount).toBe(0);
    },
    10000,
  );

  it(
    "stop() while paused releases the pause and resolves done() (doesn't hang)",
    async () => {
      const song = makeTestSong();
      let pauseFn: (() => void) | null = null;
      const connector = createCountingConnector((count) => {
        if (count === 2 && pauseFn) {
          const fn = pauseFn;
          pauseFn = null;
          fn();
        }
      });
      await connector.connect();

      const loop = new PracticeLoop(
        song,
        connector,
        { startMeasure: 2, endMeasure: 3, speedStartPct: 100, speedTargetPct: 100 },
        { metronomeFactory: () => createFakeMetronome() }
      );
      pauseFn = () => loop.pause();

      loop.start();
      await waitUntil(() => loop.getState().paused);

      loop.stop();
      // The regression this guards: stop()ping a PAUSED loop must actually
      // unblock runLoop()'s pending waitForResume() — without releasePause()
      // in stop(), done() would hang forever here.
      await expect(loop.done()).resolves.toBeUndefined();

      const state = loop.getState();
      expect(state.status).toBe("stopped");
      expect(state.paused).toBe(false);
    },
    10000,
  );
});
