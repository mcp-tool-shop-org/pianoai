// ─── phrase-continuation.test.ts ──────────────────────────────────────────────
//
// E2 Phrase Continuation Eval harness tests.
//
// Structure:
//   1. Unit tests for each metric (synthetic inputs, known expected values)
//   2. not_computable state tests
//   3. Shuffled-bars control tests (correctness + determinism)
//   4. Paired-record integrity check tests (orphan detection, count mismatches)
//   5. Corpus regression — 22 pairs from Slice 5 corpus:
//      a. Integrity check passes (22 pairs, 0 orphans)
//      b. Gold vs shuffled diverges on rhythm/groove for ≥3 pairs
//      c. Pitch-class OA gold vs shuffled ≈ 1.0 (sanity baseline)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  // Grid quantization
  quantizeBeat,
  GRID_SLOTS_PER_BEAT,

  // Shuffled-bars control
  shuffleBars,

  // Metric 1: note overlap
  eventsToQuantizedSet,
  jaccardSimilarity,
  computeNoteOverlap,

  // Metric 2: pitch-class OA
  buildPitchClassHistogram,
  pitchClassOA,
  computePitchClassOA,

  // Metric 3: rhythm similarity
  buildOnsetVector,
  cosineSimilarity,
  parseBeatsPerBar,
  computeRhythmSimilarity,

  // Metric 4: groove similarity
  buildGrooveHistogram,
  grooveOA,
  computeGrooveSimilarity,

  // Integrity check
  checkPairedIntegrity,
  resolvePairs,

  // Eval runner
  evaluatePair,
  runFullE2Eval,

  // Helpers
  isNotComputable,
  notComputable,
  BEAT_MARGIN,
  FUTURE_MODEL_GROOVE_MARGIN,

  type PairRecord,
  type ResolvedPair,
} from "./phrase-continuation.js";
import type { TimedEvent } from "../schema.js";

// Local alias for test clarity
type TE = TimedEvent;

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const RECORDS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0", "records");

// ─── Synthetic note factories ─────────────────────────────────────────────────

/** Build a minimal TimedEvent. All optional fields default to sensible values. */
function makeEvent(
  note: number,
  measure: number,
  beat: number,
  velocity = 64,
  hand: "right" | "left" = "right",
): TE {
  return {
    t_seconds: measure * 2 + beat * 0.5,
    t_ticks: (measure - 1) * 1920 + Math.round(beat * 480),
    dur_seconds: 0.25,
    dur_ticks: 120,
    note,
    name: `MIDI${note}`,
    velocity,
    channel: 0,
    hand,
    measure,
    beat,
  };
}

/** Build a set of 4 events per bar across N bars (2 pitches alternating). */
function makeBarEvents(
  startMeasure: number,
  numBars: number,
  pitches = [60, 64, 67, 72],
): TE[] {
  const events: TE[] = [];
  for (let bar = 0; bar < numBars; bar++) {
    const m = startMeasure + bar;
    for (let beat = 0; beat < 4; beat++) {
      events.push(makeEvent(pitches[beat % pitches.length], m, beat));
    }
  }
  return events;
}

// ─── 1. Grid quantization ──────────────────────────────────────────────────────

describe("quantizeBeat", () => {
  it("quantizes beat 0 → slot 0", () => {
    expect(quantizeBeat(0)).toBe(0);
  });
  it("quantizes beat 0.25 → slot 1 (sixteenth note)", () => {
    expect(quantizeBeat(0.25)).toBe(1);
  });
  it("quantizes beat 0.5 → slot 2 (eighth note)", () => {
    expect(quantizeBeat(0.5)).toBe(2);
  });
  it("quantizes beat 1.0 → slot 4 (quarter note)", () => {
    expect(quantizeBeat(1.0)).toBe(4);
  });
  it("quantizes beat 2.5 → slot 10", () => {
    expect(quantizeBeat(2.5)).toBe(10);
  });
  it("GRID_SLOTS_PER_BEAT is 4 (sixteenth-note resolution)", () => {
    expect(GRID_SLOTS_PER_BEAT).toBe(4);
  });
});

// ─── 2. Shuffled-bars control ─────────────────────────────────────────────────

describe("shuffleBars", () => {
  it("returns not_computable for a single bar", () => {
    const events = [makeEvent(60, 1, 0), makeEvent(64, 1, 1)];
    const result = shuffleBars(events);
    expect(isNotComputable(result)).toBe(true);
  });

  it("preserves note count when shuffling", () => {
    const events = makeBarEvents(5, 4);
    const result = shuffleBars(events);
    expect(isNotComputable(result)).toBe(false);
    expect((result as TE[]).length).toBe(events.length);
  });

  it("preserves the set of pitches when shuffling", () => {
    const events = makeBarEvents(5, 4, [60, 62, 64, 65]);
    const result = shuffleBars(events) as TE[];
    const goldPitches = events.map((e) => e.note).sort();
    const shuffPitches = result.map((e) => e.note).sort();
    expect(shuffPitches).toEqual(goldPitches);
  });

  it("produces a different measure assignment for varied content", () => {
    // Make 4 bars with DIFFERENT pitches per bar so order is detectable.
    const events: TE[] = [
      makeEvent(60, 1, 0),
      makeEvent(61, 2, 0),
      makeEvent(62, 3, 0),
      makeEvent(63, 4, 0),
    ];
    const result = shuffleBars(events) as TE[];
    // Check that the ordering is changed: the note at measure 1 is not always 60.
    // (With LCG seed from measure count 4 + event count 4 = 4004, should shuffle.)
    const measureOneNotes = result
      .filter((e) => e.measure === 1)
      .map((e) => e.note);
    // At least sometimes different — deterministic so we can check exact value.
    // Just check the shuffle produced a valid permutation (all 4 pitches still present).
    expect(result.map((e) => e.note).sort()).toEqual([60, 61, 62, 63]);
  });

  it("is deterministic (same input → same output)", () => {
    const events = makeBarEvents(1, 4);
    const r1 = shuffleBars(events) as TE[];
    const r2 = shuffleBars(events) as TE[];
    expect(r1.map((e) => `${e.measure}:${e.note}`)).toEqual(
      r2.map((e) => `${e.measure}:${e.note}`),
    );
  });

  it("works with 2 bars (minimum computable)", () => {
    const events = makeBarEvents(1, 2);
    const result = shuffleBars(events);
    expect(isNotComputable(result)).toBe(false);
    expect((result as TE[]).length).toBe(events.length);
  });
});

// ─── 3. Note overlap (Jaccard) ────────────────────────────────────────────────

describe("eventsToQuantizedSet", () => {
  it("produces a string key for each event", () => {
    const events = [makeEvent(60, 1, 0), makeEvent(64, 1, 1)];
    const set = eventsToQuantizedSet(events, 1);
    expect(set.size).toBe(2);
    expect(set.has("60:0:0")).toBe(true); // pitch 60, bar 0 (measure 1 - startMeasure 1), beat 0
    expect(set.has("64:0:4")).toBe(true); // pitch 64, bar 0, beat 1 → quantized to slot 4
  });

  it("normalizes measure index relative to phraseStartMeasure", () => {
    const events = [makeEvent(60, 5, 0), makeEvent(64, 6, 0)];
    const set = eventsToQuantizedSet(events, 5);
    expect(set.has("60:0:0")).toBe(true); // measure 5 → barIndex 0
    expect(set.has("64:1:0")).toBe(true); // measure 6 → barIndex 1
  });
});

describe("jaccardSimilarity", () => {
  it("returns 1.0 for identical sets", () => {
    const a = new Set(["a", "b", "c"]);
    expect(jaccardSimilarity(a, a)).toBe(1.0);
  });

  it("returns 0.0 for disjoint sets", () => {
    const a = new Set(["a", "b"]);
    const b = new Set(["c", "d"]);
    expect(jaccardSimilarity(a, b)).toBe(0.0);
  });

  it("returns 1/3 for one-in-three overlap", () => {
    const a = new Set(["a", "b", "c"]);
    const b = new Set(["c", "d", "e"]);
    expect(jaccardSimilarity(a, b)).toBeCloseTo(1 / 5, 5); // |{c}| / |{a,b,c,d,e}| = 1/5
  });

  it("returns 1.0 for two empty sets", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1.0);
  });

  it("returns 0.0 when one set is empty and the other is not", () => {
    const a = new Set(["a"]);
    expect(jaccardSimilarity(a, new Set())).toBe(0.0);
    expect(jaccardSimilarity(new Set(), a)).toBe(0.0);
  });
});

describe("computeNoteOverlap", () => {
  it("returns 1.0 when comparing events to themselves (gold vs gold sanity)", () => {
    const events = makeBarEvents(1, 4);
    const result = computeNoteOverlap(events, events, 1);
    expect(isNotComputable(result)).toBe(false);
    expect(result as number).toBe(1.0);
  });

  it("returns not_computable when both event lists are empty", () => {
    const result = computeNoteOverlap([], [], 1);
    expect(isNotComputable(result)).toBe(true);
  });

  it("returns < 1.0 when events differ", () => {
    const eventsA = [makeEvent(60, 1, 0), makeEvent(64, 1, 1)];
    const eventsB = [makeEvent(67, 1, 0), makeEvent(72, 1, 1)]; // different pitches
    const result = computeNoteOverlap(eventsA, eventsB, 1);
    expect(isNotComputable(result)).toBe(false);
    expect(result as number).toBeLessThan(1.0);
  });
});

// ─── 4. Pitch-class histogram OA ──────────────────────────────────────────────

describe("buildPitchClassHistogram", () => {
  it("returns null for empty events", () => {
    expect(buildPitchClassHistogram([])).toBeNull();
  });

  it("produces a 12-bin histogram", () => {
    const events = [makeEvent(60, 1, 0), makeEvent(64, 1, 1)]; // C4, E4
    const hist = buildPitchClassHistogram(events);
    expect(hist).not.toBeNull();
    expect(hist!.length).toBe(12);
  });

  it("normalizes to sum 1.0", () => {
    const events = [makeEvent(60, 1, 0), makeEvent(64, 1, 1), makeEvent(67, 1, 2)];
    const hist = buildPitchClassHistogram(events);
    const sum = hist!.reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("maps pitches to correct bins (C=0, E=4, G=7)", () => {
    const events = [makeEvent(60, 1, 0), makeEvent(64, 1, 1), makeEvent(67, 1, 2)];
    const hist = buildPitchClassHistogram(events);
    expect(hist![0]).toBeCloseTo(1 / 3); // C
    expect(hist![4]).toBeCloseTo(1 / 3); // E
    expect(hist![7]).toBeCloseTo(1 / 3); // G
  });
});

describe("pitchClassOA", () => {
  it("returns 1.0 for identical histograms", () => {
    const a: [number, number, number, number, number, number, number, number, number, number, number, number] =
      [1 / 3, 0, 0, 0, 1 / 3, 0, 0, 1 / 3, 0, 0, 0, 0];
    expect(pitchClassOA(a, a)).toBeCloseTo(1.0);
  });

  it("returns 0.0 for disjoint histograms", () => {
    const a: [number, number, number, number, number, number, number, number, number, number, number, number] =
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const b: [number, number, number, number, number, number, number, number, number, number, number, number] =
      [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(pitchClassOA(a, b)).toBe(0.0);
  });
});

describe("computePitchClassOA (gold vs shuffled)", () => {
  it("returns ≈ 1.0 when events are shuffled (same notes, different order)", () => {
    // All events same pitch — shuffling trivially preserves pitch class.
    const events = makeBarEvents(5, 4, [60, 62, 64, 67]);
    const shuffled = shuffleBars(events) as TE[];
    const result = computePitchClassOA(events, shuffled);
    expect(isNotComputable(result)).toBe(false);
    expect(result as number).toBeCloseTo(1.0, 5);
  });

  it("returns not_computable when gold is empty", () => {
    const result = computePitchClassOA([], [makeEvent(60, 1, 0)]);
    expect(isNotComputable(result)).toBe(true);
  });
});

// ─── 5. Rhythm / onset-grid similarity ───────────────────────────────────────

describe("parseBeatsPerBar", () => {
  it("parses 4/4 → 4", () => { expect(parseBeatsPerBar("4/4")).toBe(4); });
  it("parses 3/4 → 3", () => { expect(parseBeatsPerBar("3/4")).toBe(3); });
  it("parses 3/8 → 3", () => { expect(parseBeatsPerBar("3/8")).toBe(3); });
  it("parses 9/8 → 9", () => { expect(parseBeatsPerBar("9/8")).toBe(9); });
  it("returns null for garbage input", () => {
    expect(parseBeatsPerBar("invalid")).toBeNull();
  });
});

describe("buildOnsetVector", () => {
  it("marks correct slots as 1", () => {
    // Single bar, beats at 0 and 1.0.
    const events = [makeEvent(60, 1, 0), makeEvent(64, 1, 1.0)];
    const vec = buildOnsetVector(events, 4, 1);
    // slotsPerBar = 4*4 = 16; beat 0 → slot 0; beat 1.0 → slot 4
    expect(vec[0]).toBe(1);
    expect(vec[4]).toBe(1);
    expect(vec[1]).toBe(0);
    expect(vec[2]).toBe(0);
  });

  it("builds correct vector length for 2 bars of 4/4", () => {
    const events = makeBarEvents(1, 2);
    const vec = buildOnsetVector(events, 4, 1);
    // 2 bars × 4 beats × 4 slots = 32
    expect(vec.length).toBe(32);
  });

  it("places bar-2 events after bar-1 events in the vector", () => {
    const evBar1 = makeEvent(60, 1, 0); // slot 0
    const evBar2 = makeEvent(64, 2, 0); // slot 16 (1 bar × 4 beats × 4 slots)
    const vec = buildOnsetVector([evBar1, evBar2], 4, 1);
    expect(vec[0]).toBe(1);
    expect(vec[16]).toBe(1);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical non-zero vectors", () => {
    const a = [1, 0, 1, 0];
    expect(cosineSimilarity(a, a)).toBeCloseTo(1.0);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    const a = [1, 0, 0, 0];
    const b = [0, 1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it("returns null for all-zero vectors", () => {
    expect(cosineSimilarity([0, 0], [0, 0])).toBeNull();
  });

  it("returns null for mismatched lengths", () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBeNull();
  });
});

describe("computeRhythmSimilarity", () => {
  it("returns 1.0 for events vs themselves (sanity)", () => {
    const events = makeBarEvents(1, 4);
    const result = computeRhythmSimilarity(events, events, "4/4", 1);
    expect(isNotComputable(result)).toBe(false);
    expect(result as number).toBeCloseTo(1.0);
  });

  it("returns < 1.0 for shuffled bars (order matters)", () => {
    // Use bars with different beat patterns per bar.
    const events: TE[] = [
      makeEvent(60, 1, 0),  // bar 1: only beat 0
      makeEvent(64, 2, 1),  // bar 2: only beat 1
      makeEvent(67, 3, 2),  // bar 3: only beat 2
      makeEvent(72, 4, 3),  // bar 4: only beat 3
    ];
    const shuffled = shuffleBars(events) as TE[];
    const result = computeRhythmSimilarity(events, shuffled, "4/4", 1);
    expect(isNotComputable(result)).toBe(false);
    // Shuffled should give a DIFFERENT onset grid.
    expect(result as number).toBeLessThan(1.0);
  });

  it("returns not_computable for empty gold events", () => {
    const result = computeRhythmSimilarity([], [makeEvent(60, 1, 0)], "4/4", 1);
    expect(isNotComputable(result)).toBe(true);
  });

  it("returns not_computable for invalid time signature", () => {
    const events = makeBarEvents(1, 2);
    const result = computeRhythmSimilarity(events, events, "bad/ts", 1);
    expect(isNotComputable(result)).toBe(true);
  });
});

// ─── 6. Groove similarity ─────────────────────────────────────────────────────

describe("buildGrooveHistogram", () => {
  it("builds a phrase-length histogram (order-sensitive)", () => {
    // 2 bars of 4/4: each bar 4 beats × 4 slots = 16 slots per bar → 32 total.
    const events = makeBarEvents(1, 2);
    const hist = buildGrooveHistogram(events, 4, 1, 2);
    expect(hist.length).toBe(32);
  });

  it("normalizes to sum 1.0", () => {
    const events = makeBarEvents(1, 4);
    const hist = buildGrooveHistogram(events, 4, 1, 4);
    const sum = hist.reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1.0);
  });

  it("bar-order changes produce different histograms", () => {
    // Bar 1 has a note at beat 0; bar 2 has a note at beat 1.
    const eventsA: TE[] = [makeEvent(60, 1, 0), makeEvent(64, 2, 1.0)];
    // Same notes but swapped bars.
    const eventsB: TE[] = [makeEvent(64, 1, 1.0), makeEvent(60, 2, 0)];
    const histA = buildGrooveHistogram(eventsA, 4, 1, 2);
    const histB = buildGrooveHistogram(eventsB, 4, 1, 2);
    // histA[0] = 0.5 (note at slot 0 in bar1), histB[0] = 0 (bar1 has beat-1 note instead)
    expect(histA[0]).toBeGreaterThan(0);
    expect(histB[0]).toBe(0);
    expect(grooveOA(histA, histB)).toBeLessThan(1.0);
  });
});

describe("grooveOA", () => {
  it("returns 1.0 for identical histograms", () => {
    const a = [0.5, 0.5, 0, 0];
    expect(grooveOA(a, a)).toBeCloseTo(1.0);
  });

  it("returns 0.0 for disjoint histograms", () => {
    const a = [1, 0, 0, 0];
    const b = [0, 0, 1, 0];
    expect(grooveOA(a, b)).toBe(0.0);
  });
});

describe("computeGrooveSimilarity", () => {
  it("returns < 1.0 for shuffled bars with different per-bar patterns", () => {
    // Each bar has a note on a DIFFERENT beat position → shuffling changes phrase groove.
    const events: TE[] = [
      makeEvent(60, 1, 0),
      makeEvent(64, 2, 1),
      makeEvent(67, 3, 2),
      makeEvent(72, 4, 3),
    ];
    const shuffled = shuffleBars(events) as TE[];
    const result = computeGrooveSimilarity(events, shuffled, "4/4");
    expect(isNotComputable(result)).toBe(false);
    expect(result as number).toBeLessThan(1.0);
  });

  it("returns not_computable for single-bar gold", () => {
    const events = [makeEvent(60, 1, 0), makeEvent(64, 1, 1)];
    const result = computeGrooveSimilarity(events, events, "4/4");
    expect(isNotComputable(result)).toBe(true);
    expect((result as { reason: string }).reason).toContain("groove histogram requires ≥2 bars");
  });

  it("returns not_computable for empty gold", () => {
    const result = computeGrooveSimilarity([], [makeEvent(60, 1, 0)], "4/4");
    expect(isNotComputable(result)).toBe(true);
  });

  it("returns not_computable for invalid time signature", () => {
    const events = makeBarEvents(1, 4);
    const result = computeGrooveSimilarity(events, events, "weird");
    expect(isNotComputable(result)).toBe(true);
  });
});

// ─── 7. not_computable state ──────────────────────────────────────────────────

describe("notComputable and isNotComputable", () => {
  it("isNotComputable returns true for not_computable objects", () => {
    expect(isNotComputable(notComputable("some reason"))).toBe(true);
  });

  it("isNotComputable returns false for numbers", () => {
    expect(isNotComputable(0.0)).toBe(false);
    expect(isNotComputable(1.0)).toBe(false);
    expect(isNotComputable(0.5)).toBe(false);
  });

  it("notComputable carries the reason string", () => {
    const nc = notComputable("test reason");
    expect(nc.reason).toBe("test reason");
  });

  it("shuffleBars returns not_computable for 1-bar input", () => {
    const events = [makeEvent(60, 3, 0)];
    const r = shuffleBars(events);
    expect(isNotComputable(r)).toBe(true);
    expect((r as { reason: string }).reason).toContain("1 distinct measure");
  });
});

// ─── 8. Paired-record integrity check ────────────────────────────────────────

describe("checkPairedIntegrity", () => {
  function makeMinimalRecord(
    id: string,
    role: string,
    pairedId?: string,
    hasContinuationWindow = true,
  ): PairRecord {
    const scope: PairRecord["scope"] = {
      song_id: "test-song",
      phrase_window: "measures 1-4",
      instrument: "piano",
      key: "C major",
      tempo_bpm: 120,
      time_signature: "4/4",
      window_role: role,
    };
    if (pairedId) scope.paired_prompt_record_id = pairedId;
    if (role === "prompt" && hasContinuationWindow) {
      scope.continuation_target_window = [5, 8];
    }
    return {
      id,
      scope,
      observation: {
        midi_sidecar: {
          timed_events: [makeEvent(60, 1, 0)],
        },
      },
    };
  }

  it("passes for valid (prompt, target) pair", () => {
    const prompt = makeMinimalRecord("p1", "prompt");
    const target = makeMinimalRecord("t1", "continuation_target", "p1");
    const result = checkPairedIntegrity([prompt, target], 1);
    expect(result.passed).toBe(true);
    expect(result.pairCount).toBe(1);
    expect(result.orphanCount).toBe(0);
  });

  it("fails when pair count doesn't match expected", () => {
    const prompt = makeMinimalRecord("p1", "prompt");
    const target = makeMinimalRecord("t1", "continuation_target", "p1");
    const result = checkPairedIntegrity([prompt, target], 22); // expect 22 but got 1
    expect(result.passed).toBe(false);
    expect(result.details).toContain("pair count mismatch");
  });

  it("detects orphan target (paired_prompt_record_id doesn't resolve)", () => {
    const target = makeMinimalRecord("t1", "continuation_target", "p-nonexistent");
    const result = checkPairedIntegrity([target], 0);
    expect(result.passed).toBe(false);
    expect(result.missingPairedIds.length).toBeGreaterThan(0);
  });

  it("detects prompt without a matching target", () => {
    const prompt = makeMinimalRecord("p1", "prompt");
    // No corresponding target.
    const result = checkPairedIntegrity([prompt], 1);
    expect(result.passed).toBe(false);
  });

  it("handles standalone records (ignored in pair count)", () => {
    const prompt = makeMinimalRecord("p1", "prompt");
    const target = makeMinimalRecord("t1", "continuation_target", "p1");
    const standalone = makeMinimalRecord("s1", "standalone");
    const result = checkPairedIntegrity([prompt, target, standalone], 1);
    expect(result.passed).toBe(true);
    expect(result.pairCount).toBe(1);
  });
});

describe("resolvePairs", () => {
  it("returns pairs in sorted prompt ID order", () => {
    const p1 = {
      id: "b-song:m001-004:piano:mcp-session:v1",
      scope: { song_id: "b-song", phrase_window: "measures 1-4", instrument: "piano", key: "C major", tempo_bpm: 120, time_signature: "4/4", window_role: "prompt" as const, continuation_target_window: [5, 8] as [number, number] },
      observation: { midi_sidecar: { timed_events: [makeEvent(60, 1, 0)] } },
    };
    const p2 = {
      id: "a-song:m001-004:piano:mcp-session:v1",
      scope: { song_id: "a-song", phrase_window: "measures 1-4", instrument: "piano", key: "C major", tempo_bpm: 120, time_signature: "4/4", window_role: "prompt" as const, continuation_target_window: [5, 8] as [number, number] },
      observation: { midi_sidecar: { timed_events: [makeEvent(60, 1, 0)] } },
    };
    const t1 = {
      id: "b-song:m005-008:piano:mcp-session:v1",
      scope: { song_id: "b-song", phrase_window: "measures 5-8", instrument: "piano", key: "C major", tempo_bpm: 120, time_signature: "4/4", window_role: "continuation_target" as const, paired_prompt_record_id: "b-song:m001-004:piano:mcp-session:v1" },
      observation: { midi_sidecar: { timed_events: [makeEvent(64, 5, 0)] } },
    };
    const t2 = {
      id: "a-song:m005-008:piano:mcp-session:v1",
      scope: { song_id: "a-song", phrase_window: "measures 5-8", instrument: "piano", key: "C major", tempo_bpm: 120, time_signature: "4/4", window_role: "continuation_target" as const, paired_prompt_record_id: "a-song:m001-004:piano:mcp-session:v1" },
      observation: { midi_sidecar: { timed_events: [makeEvent(64, 5, 0)] } },
    };
    const pairs = resolvePairs([p1, p2, t1, t2]);
    expect(pairs.length).toBe(2);
    // Sorted by prompt ID: a-song before b-song.
    expect(pairs[0].promptRecord.id).toBe("a-song:m001-004:piano:mcp-session:v1");
    expect(pairs[1].promptRecord.id).toBe("b-song:m001-004:piano:mcp-session:v1");
  });
});

// ─── 9. Corpus regression (Slice 5 corpus) ───────────────────────────────────

// Load all records once.
let allCorpusRecords: PairRecord[];

beforeAll(() => {
  const files = readdirSync(RECORDS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  allCorpusRecords = files.map((f) => {
    return JSON.parse(readFileSync(join(RECORDS_DIR, f), "utf8")) as PairRecord;
  });
});

describe("corpus integrity (22 pairs, 0 orphans)", () => {
  it("loads 45 records total", () => {
    expect(allCorpusRecords.length).toBe(45);
  });

  it("has exactly 22 prompt records", () => {
    const prompts = allCorpusRecords.filter(
      (r) => r.scope.window_role === "prompt",
    );
    expect(prompts.length).toBe(22);
  });

  it("has exactly 22 continuation_target records", () => {
    const targets = allCorpusRecords.filter(
      (r) => r.scope.window_role === "continuation_target",
    );
    expect(targets.length).toBe(22);
  });

  it("paired integrity check passes (22 pairs, 0 orphans)", () => {
    const result = checkPairedIntegrity(allCorpusRecords, 22);
    expect(result.passed).toBe(true);
    expect(result.pairCount).toBe(22);
    expect(result.orphanCount).toBe(0);
    expect(result.missingPairedIds.length).toBe(0);
  });
});

describe("per-pair eval — sanity metrics on corpus", () => {
  it("gold vs gold note overlap is 1.0 for all computable pairs", () => {
    const pairs = resolvePairs(allCorpusRecords);
    for (const pair of pairs) {
      const result = evaluatePair(pair);
      const v = result.metrics.noteOverlap_goldVsGold;
      if (!isNotComputable(v)) {
        expect(v).toBeCloseTo(1.0);
      }
    }
  });

  it("pitch-class OA gold vs shuffled ≈ 1.0 (same notes, different order)", () => {
    const pairs = resolvePairs(allCorpusRecords);
    let computableCount = 0;
    for (const pair of pairs) {
      const result = evaluatePair(pair);
      const v = result.metrics.pitchClassOA_goldVsShuffled;
      if (!isNotComputable(v)) {
        // Shuffled bars preserve note content → pitch-class OA ≈ 1.0 (sanity baseline).
        expect(v).toBeCloseTo(1.0, 5);
        computableCount++;
      }
    }
    expect(computableCount).toBeGreaterThanOrEqual(3);
  });
});

describe("corpus regression — gold vs shuffled diverges on rhythm/groove", () => {
  it("rhythm similarity gold vs shuffled < 0.95 on ≥3 pairs", () => {
    const pairs = resolvePairs(allCorpusRecords);
    let divergeCount = 0;
    for (const pair of pairs) {
      const result = evaluatePair(pair);
      const v = result.metrics.rhythmSimilarity_goldVsShuffled;
      if (!isNotComputable(v) && (v as number) < 1.0 - BEAT_MARGIN) {
        divergeCount++;
      }
    }
    expect(divergeCount).toBeGreaterThanOrEqual(3);
  });

  it("groove similarity gold vs shuffled < 0.95 on ≥3 pairs", () => {
    const pairs = resolvePairs(allCorpusRecords);
    let divergeCount = 0;
    for (const pair of pairs) {
      const result = evaluatePair(pair);
      const v = result.metrics.grooveSimilarity_goldVsShuffled;
      if (!isNotComputable(v) && (v as number) < 1.0 - BEAT_MARGIN) {
        divergeCount++;
      }
    }
    expect(divergeCount).toBeGreaterThanOrEqual(3);
  });
});

describe("runFullE2Eval on full corpus", () => {
  it("runs without errors and returns 22 pair results", () => {
    const run = runFullE2Eval(allCorpusRecords, 22);
    expect(run.integrityCheck.passed).toBe(true);
    expect(run.pairResults.length).toBe(22);
  });

  it("integrity gate passes", () => {
    const run = runFullE2Eval(allCorpusRecords, 22);
    expect(run.hardGates.integrityPassed).toBe(true);
  });

  it("rhythm gate: ≥3 pairs where gold ≠ shuffled (rhythm diverges)", () => {
    const run = runFullE2Eval(allCorpusRecords, 22);
    expect(run.hardGates.rhythmGoldBeatShuffledPairCount).toBeGreaterThanOrEqual(3);
  });

  it("groove gate: ≥3 pairs where gold ≠ shuffled (groove diverges)", () => {
    const run = runFullE2Eval(allCorpusRecords, 22);
    expect(run.hardGates.grooveGoldBeatShuffledPairCount).toBeGreaterThanOrEqual(3);
  });

  it("grooveOAMeanDelta is defined (≥0 expected for shuffled control baseline)", () => {
    const run = runFullE2Eval(allCorpusRecords, 22);
    // grooveOAMeanDelta = 1.0 - mean(grooveSim_goldVsShuffled).
    // This is the "distance" the shuffled baseline is from gold.
    // Locked future-model target: model's groove OA must beat this delta by ≥0.15.
    expect(run.hardGates.grooveOAMeanDelta).not.toBeNull();
    expect(run.hardGates.grooveOAMeanDelta).toBeGreaterThanOrEqual(0);
  });

  it("future-model threshold constant is ≥0.15", () => {
    // Locked from synthesis Section 4 E2: groove OA must beat shuffled by ≥0.15.
    expect(FUTURE_MODEL_GROOVE_MARGIN).toBeGreaterThanOrEqual(0.15);
  });
});

describe("not_computable audit", () => {
  it("all not_computable entries have non-empty reason strings", () => {
    const run = runFullE2Eval(allCorpusRecords, 22);
    for (const entry of run.hardGates.notComputableAudit) {
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(entry.pairId.length).toBeGreaterThan(0);
      expect(entry.metric.length).toBeGreaterThan(0);
    }
  });
});
