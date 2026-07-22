// ─── Tests: E2v2 score-time gold reference channel ───────────────────────────
//
// The reference repair (design §6.2.1). What these lock:
//   - the meter-aware grid reproduces the REMI adapter's map on the corpus
//     time signatures and extends to 9/8;
//   - re-quantization is meter-aware (triplets survive; sixteenth-grid snapping
//     would mis-bin them — the Debussy fix), beat-relative, and count-preserving;
//   - validation FLAGS rubato it cannot cleanly recover, never silently keeps it;
//   - the meter-aware groove OA is 1.0 on identity and < 1.0 on real difference.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import type { TimedEvent } from "../schema.js";
import {
  meterAwareGrid,
  requantizeToScoreTime,
  validateScoreTime,
  meterAwareGrooveOA,
  buildMeterAwareGrooveHistogram,
  overlappedArea,
  DEFAULT_SCORE_SUBDIVISIONS,
} from "./score-time-gold.js";

function mkEvent(measure: number, beat: number, note: number, extra: Partial<TimedEvent> = {}): TimedEvent {
  return {
    t_seconds: 0,
    t_ticks: 0,
    dur_seconds: 0.5,
    dur_ticks: 240,
    note,
    name: `MIDI${note}`,
    velocity: 64,
    channel: 0,
    hand: "right",
    measure,
    beat,
    ...extra,
  };
}

// ─── The meter-aware grid ────────────────────────────────────────────────────

describe("meterAwareGrid", () => {
  it("mirrors the REMI adapter's SUBDIVISIONS for every corpus time signature", () => {
    // Values copied from src/dataset/remi-adapter.ts SUBDIVISIONS (single source
    // of intent: 24 subdivisions/quarter = 96/whole). 6/8 is intentionally NOT
    // asserted — the formula gives 72, the lookup 48, and 6/8 is absent from the
    // corpus (grep: 4/4, 3/4, 3/8, 9/8 only).
    const expected: Record<string, number> = { "4/4": 96, "3/4": 72, "3/8": 36, "2/4": 48, "2/2": 96 };
    for (const [ts, subdiv] of Object.entries(expected)) {
      const g = meterAwareGrid(ts);
      expect("not_computable" in g).toBe(false);
      if (!("not_computable" in g)) expect(g.subdivisionsPerMeasure).toBe(subdiv);
    }
  });

  it("extends to 9/8 (clair-de-lune), which the REMI lookup omits", () => {
    const g = meterAwareGrid("9/8");
    expect("not_computable" in g).toBe(false);
    if (!("not_computable" in g)) {
      expect(g.subdivisionsPerMeasure).toBe(108); // 9 × 96/8
      expect(g.subdivisionsPerBeat).toBe(12); // 96/8
      expect(g.beatsPerMeasure).toBe(9);
    }
  });

  it("returns not_computable on an unparseable signature — never a silent fallback", () => {
    expect("not_computable" in meterAwareGrid("common")).toBe(true);
    expect("not_computable" in meterAwareGrid("4/0")).toBe(true);
  });
});

// ─── Re-quantization: meter-aware, beat-relative, count-preserving ───────────

describe("requantizeToScoreTime", () => {
  it("leaves already-gridded onsets unchanged (no-op on the clean six)", () => {
    const clean = [mkEvent(5, 0, 60), mkEvent(5, 1, 62), mkEvent(5, 2, 64), mkEvent(5, 3, 65)];
    const r = requantizeToScoreTime(clean, "4/4");
    expect("not_computable" in r).toBe(false);
    if (!("not_computable" in r)) {
      expect(r.events.map((e) => e.beat)).toEqual([0, 1, 2, 3]);
      expect(r.perEvent.every((p) => p.residualBeats < 1e-9)).toBe(true);
    }
  });

  it("keeps TRIPLETS exact on the meter grid — the Debussy fix a sixteenth grid breaks", () => {
    // eighth-note triplet within beat 0: 0, 1/3, 2/3
    const triplet = [mkEvent(5, 0, 60), mkEvent(5, 1 / 3, 62), mkEvent(5, 2 / 3, 64)];
    const r = requantizeToScoreTime(triplet, "4/4"); // default 12/beat
    expect("not_computable" in r).toBe(false);
    if (!("not_computable" in r)) {
      // Meter-aware: residual ~0 (12/beat has slots at 4/12 = 1/3, 8/12 = 2/3).
      expect(Math.max(...r.perEvent.map((p) => p.residualBeats))).toBeLessThan(1e-3);
      // A naive sixteenth grid (4/beat) would have snapped 1/3 → 0.25, residual 0.083.
      const naive = Math.abs(1 / 3 - Math.round((1 / 3) * 4) / 4);
      expect(naive).toBeGreaterThan(0.08);
    }
  });

  it("snaps rubato micro-timing and records the residual it papers over", () => {
    // measured chopin-nocturne onsets: 1.1125, 1.1313 — two notes ~0.019 apart
    const rubato = [mkEvent(5, 1.1125, 58), mkEvent(5, 1.1313, 64)];
    const r = requantizeToScoreTime(rubato, "4/4", { scoreSubdivisionsPerBeat: 12 });
    expect("not_computable" in r).toBe(false);
    if (!("not_computable" in r)) {
      // Micro-timing removed: every onset lands exactly on a 1/12-beat slot; the
      // residual we paper over is recorded per onset. Count kept.
      expect(r.events).toHaveLength(2);
      expect(r.perEvent.every((p) => p.residualBeats > 0)).toBe(true);
      expect(r.events.every((e) => Math.abs(e.beat * 12 - Math.round(e.beat * 12)) < 1e-9)).toBe(true);
    }
  });

  it("preserves event count exactly (never merges or drops)", () => {
    const collide = [mkEvent(5, 1.10, 58), mkEvent(5, 1.11, 64), mkEvent(5, 1.12, 67)];
    const r = requantizeToScoreTime(collide, "4/4", { scoreSubdivisionsPerBeat: 12 });
    if (!("not_computable" in r)) expect(r.events).toHaveLength(3); // all three survive the shared slot
  });

  it("keeps t_ticks consistent with the snapped beat when the tick scale is recoverable", () => {
    // Two events in a measure with a real tick scale (tpb=480): beat 1 → +480 ticks.
    const evs = [
      mkEvent(5, 0.02, 60, { t_ticks: 480 * 4 * 4 + 10 }), // measure 5 start = 4 measures × 4 beats × 480
      mkEvent(5, 1.02, 62, { t_ticks: 480 * 4 * 4 + 490 }),
    ];
    const r = requantizeToScoreTime(evs, "4/4", { scoreSubdivisionsPerBeat: 4 });
    if (!("not_computable" in r)) {
      // beat 0.02 → 0.0, beat 1.02 → 1.0; ticks land on measure start and +480.
      expect(r.events[0].t_ticks).toBe(480 * 4 * 4);
      expect(r.events[1].t_ticks).toBe(480 * 4 * 4 + 480);
    }
  });
});

// ─── Validation: flags what it cannot recover ────────────────────────────────

describe("validateScoreTime", () => {
  it("passes clean, on-grid gold with near-zero residual", () => {
    const clean = [mkEvent(5, 0, 60), mkEvent(5, 1, 62), mkEvent(6, 0, 64), mkEvent(6, 2, 65)];
    const v = validateScoreTime(clean, "4/4", "test-clean", "measures 5-6");
    expect("not_computable" in v).toBe(false);
    if (!("not_computable" in v)) {
      expect(v.valid).toBe(true);
      expect(v.eventCountPreserved).toBe(true);
      expect(v.maxResidualBeats).toBeLessThan(1e-9);
      expect(v.onsetsOverTolerance).toBe(0);
    }
  });

  it("does NOT falsely flag triplets (meter-aware residual ≈ 0)", () => {
    const triplets = [mkEvent(5, 0, 60), mkEvent(5, 1 / 3, 62), mkEvent(5, 2 / 3, 64), mkEvent(6, 0, 65), mkEvent(6, 1 / 3, 67)];
    const v = validateScoreTime(triplets, "4/4", "test-debussy", "measures 5-6");
    if (!("not_computable" in v)) {
      expect(v.valid).toBe(true);
      expect(v.onsetsOverTolerance).toBe(0);
    }
  });

  it("flags heavy rubato under a tight tolerance — excluded, never silently kept", () => {
    // Onsets sitting at the half-slot of the 12/beat grid (n + 1/24), i.e.
    // maximally off — residual 1/24 ≈ 0.0417, the worst any 12/beat snap can be.
    const rubato = Array.from({ length: 10 }, (_, i) => mkEvent(5 + (i >> 1), (i % 2) * 0.5 + 1 / 24, 60 + i));
    // tolerance 1/48 (~0.021): every onset (0.0417 off) exceeds it.
    const v = validateScoreTime(rubato, "4/4", "test-rubato", "measures 5-9", {
      scoreSubdivisionsPerBeat: 12,
      toleranceBeats: 1 / 48,
      maxFractionOverTolerance: 0.1,
    });
    if (!("not_computable" in v)) {
      expect(v.onsetsOverTolerance).toBeGreaterThan(0);
      expect(v.valid).toBe(false); // fraction over tolerance exceeds 0.10
    }
  });

  it("carries the [LOCK] knobs through so Slice 3 can tune them", () => {
    const v = validateScoreTime([mkEvent(5, 0, 60), mkEvent(6, 0, 62)], "4/4", "s", "measures 5-6");
    if (!("not_computable" in v)) {
      expect(v.scoreSubdivisionsPerBeat).toBe(DEFAULT_SCORE_SUBDIVISIONS);
      expect(v.toleranceBeats).toBeGreaterThan(0);
    }
  });
});

// ─── The meter-aware groove OA (RHYTHM axis) ─────────────────────────────────

describe("meterAwareGrooveOA", () => {
  const gold = () => [
    mkEvent(5, 0, 60), mkEvent(5, 1, 62), mkEvent(5, 2, 64), mkEvent(5, 3, 65),
    mkEvent(6, 0, 67), mkEvent(6, 0.5, 65), mkEvent(6, 1, 64),
  ];

  it("is 1.0 on identity", () => {
    const oa = meterAwareGrooveOA(gold(), gold(), "4/4");
    expect(typeof oa).toBe("number");
    expect(oa as number).toBeCloseTo(1.0, 10);
  });

  it("is < 1.0 when the compared groove genuinely differs (partial overlap)", () => {
    // Shares bar-5 beats 0 and 1 with gold, differs entirely in bar 6.
    const other = [mkEvent(5, 0, 60), mkEvent(5, 1, 62), mkEvent(6, 2, 64), mkEvent(6, 3, 65)];
    const oa = meterAwareGrooveOA(gold(), other, "4/4");
    expect(oa as number).toBeGreaterThan(0);
    expect(oa as number).toBeLessThan(1);
  });

  it("does not mis-bin a triplet groove against itself (meter-aware)", () => {
    const trip = [mkEvent(5, 0, 60), mkEvent(5, 1 / 3, 62), mkEvent(5, 2 / 3, 64), mkEvent(6, 0, 65)];
    const oa = meterAwareGrooveOA(trip, trip, "4/4");
    expect(oa as number).toBeCloseTo(1.0, 10);
  });

  it("returns not_computable on empty input or unparseable meter", () => {
    expect("not_computable" in (meterAwareGrooveOA([], gold(), "4/4") as object)).toBe(true);
    expect("not_computable" in (meterAwareGrooveOA(gold(), gold(), "bad") as object)).toBe(true);
  });
});

describe("buildMeterAwareGrooveHistogram + overlappedArea", () => {
  it("normalizes to sum 1 and overlaps identically with itself", () => {
    const grid = meterAwareGrid("4/4");
    if ("not_computable" in grid) throw new Error("grid");
    const hist = buildMeterAwareGrooveHistogram(
      [mkEvent(5, 0, 60), mkEvent(5, 1, 62), mkEvent(6, 0, 64)],
      grid,
      5,
      2,
    );
    expect(hist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(overlappedArea(hist, hist)).toBeCloseTo(1, 10);
  });
});
