// ─── capture.test.ts ─────────────────────────────────────────────────────────
//
// Pure, DOM-free coverage for capture.ts (Wave C3 — record-arm capture).
// Importable directly under Node/vitest, same as the rest of this app's
// pure modules. `createCaptureEngine()` takes an injected `beatAtAudioTime`
// function (see capture.ts's own doc comment on why) — tests build a fake
// one from transport.ts's already-tested `currentBeat`/`TransportAnchor` so
// the audio-time->beat half of the pipeline exercises the SAME formula
// main.ts wires in for real (`transport.beatAtAudioTime`), not a
// reimplementation.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  calibrateTimestamp, sampleClockOffset, mapTimeStampToAudioTime,
  shouldIgnoreRepeat,
  createCoarseDetector, recordTimestampSample, isCoarseTimestampStream,
  COARSE_BUCKET_MS, COARSE_DETECT_WINDOW,
  blendTowardGrid, deriveQuantizeView, capturedNoteToInit,
  computeCountInClicks, canCapture, hasPendingCountIn,
  shouldRefuseUndoWhileRecording, shouldRefuseSelectionOpWhileRecording, createHeldPitchTracker,
  createCaptureEngine,
  DEFAULT_CALIBRATION, DEFAULT_QUANTIZE_STRENGTH,
  type CapturedNote, type SourceCalibration,
} from "./capture.js";
import { currentBeat, type TransportAnchor } from "./transport.js";
import { QUANTIZE_GRID_BEATS } from "./time.js";

/** A realistic beatAtAudioTime fake built from transport.ts's own
 *  currentBeat — mirrors exactly what main.ts injects in production
 *  (`transport.beatAtAudioTime`). Default anchor: playback started at
 *  audio time 0, beat 0, 120bpm (2 beats/sec) — chosen so 0.5s of audio
 *  time = 1 beat, clean round numbers throughout these tests. */
function fakeBeatAtAudioTime(anchor: TransportAnchor = { audioTime: 0, beat: 0, bpm: 120 }) {
  return (audioTime: number) => currentBeat(anchor, audioTime);
}

describe("calibrateTimestamp", () => {
  it("returns the timestamp unchanged at the default (zero) calibration", () => {
    expect(calibrateTimestamp(1000, "qwerty", DEFAULT_CALIBRATION)).toBe(1000);
  });

  it("subtracts the source's calibration offset", () => {
    const cal: SourceCalibration = { qwerty: 30, onscreen: 10, midi: 5 };
    expect(calibrateTimestamp(1000, "qwerty", cal)).toBe(970);
    expect(calibrateTimestamp(1000, "onscreen", cal)).toBe(990);
    expect(calibrateTimestamp(1000, "midi", cal)).toBe(995);
  });

  it("a negative calibration shifts the timestamp LATER", () => {
    const cal: SourceCalibration = { qwerty: -20, onscreen: 0, midi: 0 };
    expect(calibrateTimestamp(1000, "qwerty", cal)).toBe(1020);
  });
});

describe("sampleClockOffset / mapTimeStampToAudioTime", () => {
  it("maps a timestamp equal to the sample instant to the sampled audio time", () => {
    const offset = sampleClockOffset(1000, 5);
    expect(mapTimeStampToAudioTime(1000, offset)).toBe(5);
  });

  it("maps a later timestamp forward by the same delta, in seconds", () => {
    const offset = sampleClockOffset(1000, 0);
    expect(mapTimeStampToAudioTime(1500, offset)).toBeCloseTo(0.5, 10);
  });

  it("maps an earlier timestamp BACKWARD (negative delta) correctly", () => {
    const offset = sampleClockOffset(1000, 2);
    expect(mapTimeStampToAudioTime(700, offset)).toBeCloseTo(1.7, 10);
  });
});

describe("shouldIgnoreRepeat", () => {
  it("true for repeat:true", () => {
    expect(shouldIgnoreRepeat(true)).toBe(true);
  });
  it("false for repeat:false", () => {
    expect(shouldIgnoreRepeat(false)).toBe(false);
  });
});

describe("coarse-timestamp detector", () => {
  it("a fresh detector is never coarse", () => {
    expect(isCoarseTimestampStream(createCoarseDetector())).toBe(false);
  });

  it("stays clean below the window size even with multiples of 100", () => {
    let d = createCoarseDetector();
    for (let i = 0; i < COARSE_DETECT_WINDOW - 1; i++) d = recordTimestampSample(d, i * 100);
    expect(isCoarseTimestampStream(d)).toBe(false);
  });

  it("flags coarse once the FULL window is all exact multiples of the bucket size", () => {
    let d = createCoarseDetector();
    for (let i = 0; i < COARSE_DETECT_WINDOW; i++) d = recordTimestampSample(d, i * COARSE_BUCKET_MS);
    expect(isCoarseTimestampStream(d)).toBe(true);
  });

  it("stays clean when samples are high-resolution (not exact multiples)", () => {
    let d = createCoarseDetector();
    const values = [12.4, 118.9, 233.1, 340.7, 455.2];
    for (const v of values) d = recordTimestampSample(d, v);
    expect(isCoarseTimestampStream(d)).toBe(false);
  });

  it("one stray high-resolution sample among coarse ones keeps the window clean", () => {
    let d = createCoarseDetector();
    d = recordTimestampSample(d, 0);
    d = recordTimestampSample(d, 100);
    d = recordTimestampSample(d, 200.5); // breaks the streak
    d = recordTimestampSample(d, 300);
    d = recordTimestampSample(d, 400);
    expect(isCoarseTimestampStream(d)).toBe(false);
  });

  it("the window is a ROLLING window — an old non-coarse sample ages out", () => {
    let d = createCoarseDetector();
    d = recordTimestampSample(d, 12.5); // will age out
    for (let i = 1; i <= COARSE_DETECT_WINDOW; i++) d = recordTimestampSample(d, i * COARSE_BUCKET_MS);
    expect(isCoarseTimestampStream(d)).toBe(true);
  });

  it("recordTimestampSample does not mutate the input state (pure)", () => {
    const d0 = createCoarseDetector();
    const d1 = recordTimestampSample(d0, 100);
    expect(d0.samples).toHaveLength(0);
    expect(d1.samples).toHaveLength(1);
  });
});

describe("blendTowardGrid", () => {
  it("strength 0 leaves the raw value untouched", () => {
    expect(blendTowardGrid(0.1, 0.25, 0)).toBe(0.1);
  });

  it("strength 1 fully snaps to the grid", () => {
    expect(blendTowardGrid(0.1, 0.25, 1)).toBeCloseTo(0, 10);
    expect(blendTowardGrid(0.9, 0.25, 1)).toBeCloseTo(1, 10);
  });

  it("strength 0.5 lands halfway between raw and snapped", () => {
    // 0.1 snaps to 0 at grid=0.25 -> halfway = 0.05
    expect(blendTowardGrid(0.1, 0.25, 0.5)).toBeCloseTo(0.05, 10);
  });

  it("a value already exactly on the grid is unaffected at any strength", () => {
    expect(blendTowardGrid(0.5, 0.25, 1)).toBeCloseTo(0.5, 10);
    expect(blendTowardGrid(0.5, 0.25, 0.3)).toBeCloseTo(0.5, 10);
  });
});

describe("deriveQuantizeView", () => {
  it("strength 1 (default expressive) snaps both start and end to the grid", () => {
    // start 0.1 -> 0; end (0.1+0.9=1.0) already on grid -> 1.0; duration 1.0
    const view = deriveQuantizeView(0.1, 0.9, 1);
    expect(view.startBeat).toBeCloseTo(0, 10);
    expect(view.durationBeats).toBeCloseTo(1, 10);
  });

  it("strength 0 reproduces the raw start/duration exactly", () => {
    const view = deriveQuantizeView(0.13, 0.87, 0);
    expect(view.startBeat).toBeCloseTo(0.13, 10);
    expect(view.durationBeats).toBeCloseTo(0.87, 10);
  });

  it("floors duration at one grid step even for a near-zero raw duration", () => {
    const view = deriveQuantizeView(1, 0.001, 1, 0.25);
    expect(view.durationBeats).toBeGreaterThanOrEqual(0.25);
  });

  it("never returns a negative startBeat even for a raw value near zero", () => {
    const view = deriveQuantizeView(0.01, 0.5, 1);
    expect(view.startBeat).toBeGreaterThanOrEqual(0);
  });

  it("respects a custom grid", () => {
    // grid = 1 (whole beat): 0.6 snaps to 1
    const view = deriveQuantizeView(0.6, 0.3, 1, 1);
    expect(view.startBeat).toBeCloseTo(1, 10);
  });
});

describe("capturedNoteToInit", () => {
  function note(overrides: Partial<CapturedNote> = {}): CapturedNote {
    return { midi: 60, velocity: 100, source: "qwerty", rawStartBeat: 0.1, rawDurationBeats: 0.9, degraded: false, ...overrides };
  }

  it("bakes the quantized view into startBeat/durationBeats", () => {
    const init = capturedNoteToInit(note(), 1);
    expect(init.startBeat).toBeCloseTo(0, 10);
    expect(init.durationBeats).toBeCloseTo(1, 10);
  });

  it("preserves rawStartBeat/rawDurationBeats UNCHANGED regardless of strength (reversibility)", () => {
    const init = capturedNoteToInit(note(), 1);
    expect(init.rawStartBeat).toBe(0.1);
    expect(init.rawDurationBeats).toBe(0.9);
  });

  it("at strength 0, the view equals the raw values exactly (fully reversible round-trip)", () => {
    const init = capturedNoteToInit(note(), 0);
    expect(init.startBeat).toBeCloseTo(init.rawStartBeat!, 10);
    expect(init.durationBeats).toBeCloseTo(init.rawDurationBeats!, 10);
  });

  it("carries midi/velocity through unchanged", () => {
    const init = capturedNoteToInit(note({ midi: 67, velocity: 42 }), 1);
    expect(init.midi).toBe(67);
    expect(init.velocity).toBe(42);
  });

  it("a DEGRADED note is fully quantized (strength forced to 1) even when configured strength is 0", () => {
    const init = capturedNoteToInit(note({ degraded: true }), 0);
    expect(init.startBeat).toBeCloseTo(0, 10); // fully snapped, NOT the raw 0.1
    // raw fields are still preserved even though the view ignored strength
    expect(init.rawStartBeat).toBe(0.1);
  });

  it("default quantize strength constant is 1 (fully snapped, per finding 23's default)", () => {
    expect(DEFAULT_QUANTIZE_STRENGTH).toBe(1);
  });
});

describe("computeCountInClicks", () => {
  it("defaults to one bar of 4/4 — 4 clicks", () => {
    const clicks = computeCountInClicks();
    expect(clicks).toHaveLength(4);
    expect(clicks.map((c) => c.beat)).toEqual([0, 1, 2, 3]);
  });

  it("beat 0 is accented; the rest are not", () => {
    const clicks = computeCountInClicks();
    expect(clicks[0].accented).toBe(true);
    expect(clicks.slice(1).every((c) => !c.accented)).toBe(true);
  });

  it("2 bars of 4/4 accents beat 0 AND beat 4 (the second bar's downbeat)", () => {
    const clicks = computeCountInClicks(2, 4);
    expect(clicks).toHaveLength(8);
    expect(clicks[0].accented).toBe(true);
    expect(clicks[4].accented).toBe(true);
    expect(clicks[1].accented).toBe(false);
  });

  it("supports a non-4/4 meter", () => {
    const clicks = computeCountInClicks(1, 3);
    expect(clicks).toHaveLength(3);
  });

  it("0 bars produces no clicks", () => {
    expect(computeCountInClicks(0, 4)).toEqual([]);
  });
});

describe("canCapture (record-phase gating)", () => {
  it("false while idle", () => {
    expect(canCapture("idle")).toBe(false);
  });
  it("false during the count-in — findings 24/25, the count-in is functional", () => {
    expect(canCapture("counting-in")).toBe(false);
  });
  it("true once actually recording", () => {
    expect(canCapture("recording")).toBe(true);
  });
});

describe("hasPendingCountIn (Lens-I finding 3 — count-in cancel matrix)", () => {
  it("true only while counting-in", () => {
    expect(hasPendingCountIn("counting-in")).toBe(true);
  });
  it("false while idle", () => {
    expect(hasPendingCountIn("idle")).toBe(false);
  });
  it("false once actually recording — the count-in has already finished by then", () => {
    expect(hasPendingCountIn("recording")).toBe(false);
  });
});

describe("shouldRefuseUndoWhileRecording (Lens-I finding 1)", () => {
  it("true while actively recording", () => {
    expect(shouldRefuseUndoWhileRecording("recording")).toBe(true);
  });
  it("false while idle — full undo depth applies", () => {
    expect(shouldRefuseUndoWhileRecording("idle")).toBe(false);
  });
  it("false during the count-in — nothing has been captured yet, so nothing to corrupt", () => {
    expect(shouldRefuseUndoWhileRecording("counting-in")).toBe(false);
  });
});

describe("shouldRefuseSelectionOpWhileRecording (Wave C4 interplay guard)", () => {
  it("true while actively recording — marquee/clipboard ops must not race live capture writes", () => {
    expect(shouldRefuseSelectionOpWhileRecording("recording")).toBe(true);
  });
  it("false while idle", () => {
    expect(shouldRefuseSelectionOpWhileRecording("idle")).toBe(false);
  });
  it("false during the count-in — capture hasn't started writing to the score yet", () => {
    expect(shouldRefuseSelectionOpWhileRecording("counting-in")).toBe(false);
  });
  it("agrees with shouldRefuseUndoWhileRecording on every phase (same gating condition, named separately)", () => {
    const phases = ["idle", "counting-in", "recording"] as const;
    for (const phase of phases) {
      expect(shouldRefuseSelectionOpWhileRecording(phase)).toBe(shouldRefuseUndoWhileRecording(phase));
    }
  });
});

describe("createCaptureEngine — basic noteOn/noteOff", () => {
  it("isPassEmpty() is true before any pass starts", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    expect(engine.isPassEmpty()).toBe(true);
  });

  it("noteOn opens a note; isPassEmpty() flips to false", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(1000, 0));
    engine.startPass(0);
    engine.noteOn("qwerty", 60, 100, 1000);
    expect(engine.isPassEmpty()).toBe(false);
  });

  it("a matched noteOn/noteOff produces one finished note with the correct raw timing", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime()); // 120bpm, 2 beats/sec
    engine.setClockOffset(sampleClockOffset(1000, 0)); // perf 1000ms <-> audio 0s
    engine.startPass(0);
    engine.noteOn("qwerty", 60, 100, 1000); // audio 0s -> beat 0
    engine.noteOff("qwerty", 60, 1500);     // audio 0.5s -> beat 1
    const result = engine.endPass(4);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].rawStartBeat).toBeCloseTo(0, 10);
    expect(result.notes[0].rawDurationBeats).toBeCloseTo(1, 10);
    expect(result.notes[0].midi).toBe(60);
  });

  it("noteOff with no matching open note is a no-op and returns false", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(0, 0));
    engine.startPass(0);
    expect(engine.noteOff("midi", 60, 100)).toBe(false);
  });

  it("repeat:true is ignored — no note opens", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(0, 0));
    engine.startPass(0);
    const res = engine.noteOn("qwerty", 60, 100, 0, true);
    expect(res.captured).toBe(false);
    expect(engine.isPassEmpty()).toBe(true);
  });

  it("a second noteOn before the matching noteOff (retrigger) closes the stale note and opens a fresh one", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(1000, 0));
    engine.startPass(0);
    engine.noteOn("midi", 60, 100, 1000); // beat 0
    engine.noteOn("midi", 60, 110, 1500); // retrigger at beat 1 — closes the first at duration 1
    const result = engine.endPass(4);
    // one finished from the retrigger-close, one still open force-closed by endPass
    expect(result.notes).toHaveLength(2);
    expect(result.notes[0].rawDurationBeats).toBeCloseTo(1, 10);
    expect(result.notes[1].velocity).toBe(110);
  });

  it("mapToBeat floors at the pass's own start beat", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    // Offset sampled such that timeStampMs=0 maps to a NEGATIVE audio time
    // relative to a pass that starts at beat 4.
    engine.setClockOffset(sampleClockOffset(1000, 0));
    engine.startPass(4);
    engine.noteOn("qwerty", 60, 100, 0); // would map to well before beat 4
    engine.noteOff("qwerty", 60, 0);
    const result = engine.endPass(8);
    expect(result.notes[0].rawStartBeat).toBeGreaterThanOrEqual(4);
  });

  it("without a sampled ClockOffset, mapToBeat degrades to the pass start instead of NaN", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.startPass(2);
    engine.noteOn("qwerty", 60, 100, 99999);
    engine.noteOff("qwerty", 60, 199999);
    const result = engine.endPass(6);
    expect(Number.isFinite(result.notes[0].rawStartBeat)).toBe(true);
    expect(result.notes[0].rawStartBeat).toBe(2);
  });
});

describe("createCaptureEngine — pass boundaries / cycle semantics", () => {
  it("endPass force-closes a still-open note at the boundary", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(1000, 0));
    engine.startPass(0);
    engine.noteOn("midi", 64, 90, 1000); // beat 0, never released
    const result = engine.endPass(4); // cycle end at beat 4
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].rawDurationBeats).toBeCloseTo(4, 10);
  });

  it("endPass reports a still-held note in stillHeld", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(1000, 0));
    engine.startPass(0);
    engine.noteOn("midi", 64, 90, 1000);
    const result = engine.endPass(4);
    expect(result.stillHeld).toEqual([{ source: "midi", midi: 64, velocity: 90 }]);
  });

  it("startPass with carryOver re-opens a sustained note at the new pass's start", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(1000, 0));
    engine.startPass(0);
    engine.noteOn("midi", 64, 90, 1000);
    const pass1 = engine.endPass(4);
    engine.startPass(4, pass1.stillHeld);
    const ghosts = engine.getGhostNotes(4);
    const openGhost = ghosts.find((g) => g.open);
    expect(openGhost).toBeDefined();
    expect(openGhost!.rawStartBeat).toBeCloseTo(4, 10);
  });

  it("a fresh pass without carryOver starts with nothing open", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(0, 0));
    engine.startPass(0);
    engine.noteOn("qwerty", 60, 100, 0);
    engine.endPass(4);
    engine.startPass(4); // no carryOver
    expect(engine.isPassEmpty()).toBe(true);
  });

  it("endPass resets the pass — isPassEmpty() is true immediately after, before the next startPass", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(0, 0));
    engine.startPass(0);
    engine.noteOn("qwerty", 60, 100, 0);
    engine.noteOff("qwerty", 60, 500);
    engine.endPass(4);
    expect(engine.isPassEmpty()).toBe(true);
  });

  it("overdub across multiple cycles: each endPass returns only THAT cycle's notes, not earlier ones", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(1000, 0));
    engine.startPass(0);
    engine.noteOn("qwerty", 60, 100, 1000);
    engine.noteOff("qwerty", 60, 1250); // 0.5 beat
    const pass1 = engine.endPass(4);
    engine.startPass(4);
    engine.noteOn("qwerty", 62, 100, 3000);
    engine.noteOff("qwerty", 62, 3250);
    const pass2 = engine.endPass(8);
    expect(pass1.notes).toHaveLength(1);
    expect(pass1.notes[0].midi).toBe(60);
    expect(pass2.notes).toHaveLength(1);
    expect(pass2.notes[0].midi).toBe(62);
  });
});

describe("createCaptureEngine — getGhostNotes", () => {
  it("an open note grows its raw duration as nowBeat advances", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(1000, 0));
    engine.startPass(0);
    engine.noteOn("qwerty", 60, 100, 1000); // beat 0
    const early = engine.getGhostNotes(0.5);
    const later = engine.getGhostNotes(2);
    expect(early[0].rawDurationBeats).toBeCloseTo(0.5, 10);
    expect(later[0].rawDurationBeats).toBeCloseTo(2, 10);
  });

  it("a finished note's ghost has a stable id across repeated calls", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(1000, 0));
    engine.startPass(0);
    engine.noteOn("qwerty", 60, 100, 1000);
    engine.noteOff("qwerty", 60, 1500);
    const a = engine.getGhostNotes(3)[0].ghostId;
    const b = engine.getGhostNotes(5)[0].ghostId;
    expect(a).toBe(b);
  });

  it("an open note's ghost id is stable across ticks and distinct from a finished one", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(1000, 0));
    engine.startPass(0);
    engine.noteOn("midi", 60, 100, 1000);
    const g1 = engine.getGhostNotes(1)[0].ghostId;
    const g2 = engine.getGhostNotes(2)[0].ghostId;
    expect(g1).toBe(g2);
  });

  it("open flag is true for a still-sounding note and false once closed", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(1000, 0));
    engine.startPass(0);
    engine.noteOn("qwerty", 60, 100, 1000);
    expect(engine.getGhostNotes(1)[0].open).toBe(true);
    engine.noteOff("qwerty", 60, 1500);
    expect(engine.getGhostNotes(2)[0].open).toBe(false);
  });

  it("reports both finished and open notes together mid-pass", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(1000, 0));
    engine.startPass(0);
    engine.noteOn("qwerty", 60, 100, 1000);
    engine.noteOff("qwerty", 60, 1500);
    engine.noteOn("midi", 64, 90, 1500);
    const ghosts = engine.getGhostNotes(2);
    expect(ghosts).toHaveLength(2);
    expect(ghosts.filter((g) => g.open)).toHaveLength(1);
    expect(ghosts.filter((g) => !g.open)).toHaveLength(1);
  });
});

describe("createCaptureEngine — calibration", () => {
  it("getCalibration() starts at the defaults", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    expect(engine.getCalibration()).toEqual(DEFAULT_CALIBRATION);
  });

  it("setCalibration() merges a partial update without disturbing other sources", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setCalibration({ qwerty: 30 });
    expect(engine.getCalibration()).toEqual({ qwerty: 30, onscreen: 0, midi: 0 });
  });

  it("a positive QWERTY calibration shifts a captured note's raw start EARLIER", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(1000, 0));
    engine.setCalibration({ qwerty: 500 }); // 500ms = 1 beat at 120bpm
    engine.startPass(0);
    engine.noteOn("qwerty", 60, 100, 2000); // uncalibrated would map to beat 2
    engine.noteOff("qwerty", 60, 2100);
    const result = engine.endPass(4);
    expect(result.notes[0].rawStartBeat).toBeCloseTo(1, 10); // shifted one beat earlier
  });
});

describe("createCaptureEngine — quantize strength setting", () => {
  it("defaults to DEFAULT_QUANTIZE_STRENGTH", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    expect(engine.getQuantizeStrength()).toBe(DEFAULT_QUANTIZE_STRENGTH);
  });

  it("setQuantizeStrength() clamps to [0, 1]", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setQuantizeStrength(5);
    expect(engine.getQuantizeStrength()).toBe(1);
    engine.setQuantizeStrength(-2);
    expect(engine.getQuantizeStrength()).toBe(0);
  });

  it("getGhostNotes uses the configured strength for the live view", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(1000, 0));
    engine.setQuantizeStrength(0);
    engine.startPass(0);
    engine.noteOn("qwerty", 60, 100, 1010); // slightly off-grid raw start
    engine.noteOff("qwerty", 60, 1500);
    const ghost = engine.getGhostNotes(2)[0];
    expect(ghost.startBeat).toBeCloseTo(ghost.rawStartBeat, 6);
  });
});

describe("createCaptureEngine — coarse-timestamp degradation", () => {
  it("isDegraded() is false for a clean source", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(0, 0));
    engine.startPass(0);
    engine.noteOn("qwerty", 60, 100, 12.5);
    expect(engine.isDegraded("qwerty")).toBe(false);
  });

  it("flips to degraded after enough exact-100ms-multiple noteOns, and newlyDegraded fires exactly once", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(0, 0));
    engine.startPass(0);
    const flags: boolean[] = [];
    for (let i = 0; i < COARSE_DETECT_WINDOW; i++) {
      flags.push(engine.noteOn("qwerty", 60 + i, 100, i * COARSE_BUCKET_MS).newlyDegraded);
      engine.noteOff("qwerty", 60 + i, i * COARSE_BUCKET_MS + 50);
    }
    expect(engine.isDegraded("qwerty")).toBe(true);
    expect(flags.filter(Boolean)).toHaveLength(1); // fires exactly once, on the transition
  });

  it("degradation is per-source — a coarse QWERTY stream does not degrade MIDI", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(0, 0));
    engine.startPass(0);
    for (let i = 0; i < COARSE_DETECT_WINDOW; i++) {
      engine.noteOn("qwerty", 60, 100, i * COARSE_BUCKET_MS);
      engine.noteOff("qwerty", 60, i * COARSE_BUCKET_MS + 10);
    }
    expect(engine.isDegraded("qwerty")).toBe(true);
    expect(engine.isDegraded("midi")).toBe(false);
  });

  it("a captured note from a degraded source is fully quantized in its finished output", () => {
    const engine = createCaptureEngine(fakeBeatAtAudioTime());
    engine.setClockOffset(sampleClockOffset(1000, 0));
    engine.setQuantizeStrength(0); // configured for "keep raw" — degraded should override this
    engine.startPass(0);
    for (let i = 0; i < COARSE_DETECT_WINDOW; i++) {
      engine.noteOn("qwerty", 60, 100, 1000 + i * COARSE_BUCKET_MS);
      engine.noteOff("qwerty", 60, 1000 + i * COARSE_BUCKET_MS + COARSE_BUCKET_MS / 2);
    }
    const result = engine.endPass(20);
    const last = result.notes[result.notes.length - 1];
    expect(last.degraded).toBe(true);
    const init = capturedNoteToInit(last, engine.getQuantizeStrength());
    // Fully snapped despite configured strength 0.
    const snapped = deriveQuantizeView(last.rawStartBeat, last.rawDurationBeats, 1, QUANTIZE_GRID_BEATS);
    expect(init.startBeat).toBeCloseTo(snapped.startBeat, 10);
  });
});

// ─── HeldPitchTracker + cross-source noteOff routing (Lens-I finding 2) ─────
//
// main.ts's heldMidi used to be a plain Set<number> — pitch-only, with no
// memory of which SOURCE opened a given pitch. createHeldPitchTracker is the
// DOM-free replacement main.ts now wires in; these tests cover the tracker
// in isolation, then the end-to-end sequence through a real CaptureEngine.

describe("HeldPitchTracker", () => {
  it("first opener wins — a second source's open() for an already-held pitch is a no-op", () => {
    const t = createHeldPitchTracker();
    t.open(60, "qwerty");
    t.open(60, "midi"); // main.ts's midiKeyDown would never actually call this
    // (its own has() check returns early first) — the tracker no-ops it too.
    expect(t.close(60)).toBe("qwerty"); // the OPENER, not the second press
  });

  it("has() is false before any open() and after a matching close()", () => {
    const t = createHeldPitchTracker();
    expect(t.has(60)).toBe(false);
    t.open(60, "qwerty");
    expect(t.has(60)).toBe(true);
    t.close(60);
    expect(t.has(60)).toBe(false);
  });

  it("close() on a pitch that was never opened returns undefined and stays a no-op", () => {
    const t = createHeldPitchTracker();
    expect(t.close(60)).toBeUndefined();
    expect(t.has(60)).toBe(false);
  });

  it("close() clears the entry so a later open() re-registers a fresh opener", () => {
    const t = createHeldPitchTracker();
    t.open(60, "qwerty");
    t.close(60);
    t.open(60, "midi");
    expect(t.close(60)).toBe("midi");
  });

  it("tracks multiple pitches independently", () => {
    const t = createHeldPitchTracker();
    t.open(60, "qwerty");
    t.open(64, "midi");
    expect(t.close(60)).toBe("qwerty");
    expect(t.close(64)).toBe("midi");
  });

  it("clear() drops every held pitch at once (main.ts's panic())", () => {
    const t = createHeldPitchTracker();
    t.open(60, "qwerty");
    t.open(64, "midi");
    t.clear();
    expect(t.has(60)).toBe(false);
    expect(t.has(64)).toBe(false);
  });
});

describe("cross-source noteOff routing end-to-end (Lens-I finding 2)", () => {
  it("qwerty-down -> midi-down (deduped) -> midi-up (routes via the OPENER) -> qwerty-up (no-op): exactly one note, correct duration, no carryover phantoms across 3 cycles", () => {
    const tracker = createHeldPitchTracker();
    const engine = createCaptureEngine((audioTime) => audioTime); // 1:1 fake audio-time->beat clock
    engine.setClockOffset(sampleClockOffset(0, 0));
    engine.startPass(0);

    // qwerty-down 60 @ t=0
    expect(tracker.has(60)).toBe(false); // main.ts's midiKeyDown would proceed
    tracker.open(60, "qwerty");
    engine.noteOn("qwerty", 60, 100, 0);

    // midi-down 60 — heldMidi already has 60, so main.ts's midiKeyDown
    // returns before EVER calling engine.noteOn("midi", ...). Nothing to do
    // here except confirm the dedup would fire.
    expect(tracker.has(60)).toBe(true);

    // midi-up 60 @ t=1000ms (mapTimeStampToAudioTime divides ms by 1000, so
    // this is 1 second of audio time = 1 beat under the identity clock
    // above) — closes via the OPENER's source ("qwerty"), not the
    // releasing event's own source ("midi").
    const opener = tracker.close(60);
    expect(opener).toBe("qwerty");
    engine.noteOff(opener!, 60, 1000);

    // qwerty-up 60 — heldMidi.has(60) is now false; main.ts's midiKeyUp
    // early-returns without calling the engine again.
    expect(tracker.has(60)).toBe(false);

    // Cycle 1 ends: exactly one finished note, correct duration, nothing
    // left open.
    let result = engine.endPass(4);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].rawStartBeat).toBeCloseTo(0, 10);
    expect(result.notes[0].rawDurationBeats).toBeCloseTo(1, 10);
    expect(result.stillHeld).toHaveLength(0);

    // Cycles 2 and 3 — nothing was left open, so carryOver seeds nothing,
    // and neither cycle captures a phantom note.
    for (let cycle = 0; cycle < 2; cycle++) {
      const start = 4 + cycle * 4;
      engine.startPass(start, result.stillHeld);
      result = engine.endPass(start + 4);
      expect(result.notes).toHaveLength(0);
      expect(result.stillHeld).toHaveLength(0);
    }
  });

  it("characterizes the pre-fix bug: a noteOff routed under the WRONG source silently strands the note across every subsequent cycle", () => {
    // This does NOT exercise HeldPitchTracker at all — it proves
    // CaptureEngine's noteOff is (and must remain) strictly keyed by
    // "source:midi", so the fix HAS to live in the caller's routing (main.ts
    // + HeldPitchTracker), not in the engine itself.
    const engine = createCaptureEngine((audioTime) => audioTime);
    engine.setClockOffset(sampleClockOffset(0, 0));

    engine.startPass(0);
    engine.noteOn("qwerty", 60, 100, 0); // qwerty opens it
    expect(engine.noteOff("midi", 60, 1)).toBe(false); // wrong source — no-op
    let result = engine.endPass(4); // cycle 1 ends with the note still open
    expect(result.notes).toHaveLength(1); // force-closed at the boundary
    expect(result.stillHeld).toEqual([{ source: "qwerty", midi: 60, velocity: 100 }]);

    engine.startPass(4, result.stillHeld); // carryOver re-opens the phantom
    result = engine.endPass(8);
    expect(result.stillHeld).toEqual([{ source: "qwerty", midi: 60, velocity: 100 }]);

    engine.startPass(8, result.stillHeld);
    result = engine.endPass(12); // cycle 3 — the phantom persists forever
    expect(result.notes).toHaveLength(1);
    expect(result.stillHeld).toEqual([{ source: "qwerty", midi: 60, velocity: 100 }]);
  });
});
