// ─── Tests: E2 Model-Continuation Gate ────────────────────────────────────────
//
// The locked bar under test: FUTURE_MODEL_GROOVE_MARGIN = 0.15 —
// grooveOA(model, gold) must exceed grooveOA(shuffled, gold) by ≥ 0.15.
//
// Anchor identities that make the gate trustworthy:
//   model ≡ gold            → modelVsGold = 1.0, margin = 1 − shuffledVsGold
//   model ≡ shuffled(gold)  → margin = 0 exactly (the control can never clear)
//   model empty / 1-bar gold → not_computable, clearsBar false, audited
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import type { TimedEvent } from "../schema.js";
import {
  FUTURE_MODEL_GROOVE_MARGIN,
  shuffleBars,
  isNotComputable,
  type ResolvedPair,
  type PairRecord,
} from "./phrase-continuation.js";
import {
  scoreModelContinuation,
  aggregateModelContinuations,
  alignContinuationMeasures,
} from "./model-continuation.js";
import { synthTimedEventsFromRemi } from "./llm-runner.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function mkEvent(measure: number, beat: number, note: number): TimedEvent {
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
  };
}

/**
 * Gold continuation: 4 bars in 4/4 with DISTINCT per-bar onset patterns, so
 * shuffling bar order genuinely changes the phrase-level groove histogram.
 */
function goldEvents(): TimedEvent[] {
  return [
    // bar 5: quarters on every beat
    mkEvent(5, 0, 60), mkEvent(5, 1, 62), mkEvent(5, 2, 64), mkEvent(5, 3, 65),
    // bar 6: eighth-note cluster at the front
    mkEvent(6, 0, 67), mkEvent(6, 0.5, 65), mkEvent(6, 1, 64), mkEvent(6, 1.5, 62),
    // bar 7: sparse — beats 0 and 2 only
    mkEvent(7, 0, 60), mkEvent(7, 2, 64),
    // bar 8: syncopated five-note figure
    mkEvent(8, 0, 62), mkEvent(8, 1, 64), mkEvent(8, 1.5, 65), mkEvent(8, 2, 67), mkEvent(8, 3, 72),
  ];
}

function mkPair(targetEvents: TimedEvent[]): ResolvedPair {
  const promptRecord: PairRecord = {
    id: "test-song:m001-004:prompt",
    scope: {
      song_id: "test-song",
      phrase_window: "measures 1-4",
      time_signature: "4/4",
      window_role: "prompt",
      continuation_target_window: [5, 8],
    },
    observation: { midi_sidecar: { timed_events: [mkEvent(1, 0, 60)] } },
  };
  const targetRecord: PairRecord = {
    id: "test-song:m005-008:target",
    scope: {
      song_id: "test-song",
      phrase_window: "measures 5-8",
      time_signature: "4/4",
      window_role: "continuation_target",
      paired_prompt_record_id: promptRecord.id,
    },
    observation: { midi_sidecar: { timed_events: targetEvents } },
  };
  return { promptRecord, targetRecord };
}

// ─── The anchor identities ───────────────────────────────────────────────────

describe("scoreModelContinuation — anchor identities", () => {
  it("perfect model (model ≡ gold): modelVsGold = 1.0 and margin = 1 − shuffledVsGold", () => {
    const pair = mkPair(goldEvents());
    const score = scoreModelContinuation(pair, goldEvents());

    expect(score.grooveOA_modelVsGold).toBeCloseTo(1.0, 10);
    expect(isNotComputable(score.grooveOA_shuffledVsGold)).toBe(false);
    const shuffledVsGold = score.grooveOA_shuffledVsGold as number;
    // The fixture's bars are pattern-distinct, so the deterministic shuffle
    // must genuinely change the groove (if this fails the fixture is broken).
    expect(shuffledVsGold).toBeLessThan(1.0);
    expect(score.margin).toBeCloseTo(1.0 - shuffledVsGold, 10);
    // A perfect continuation must clear the 0.15 bar on this fixture.
    expect(score.clearsBar).toBe(true);
  });

  it("control model (model ≡ shuffled(gold)): margin = 0 exactly — the negative control can never clear", () => {
    const gold = goldEvents();
    const pair = mkPair(gold);
    const shuffled = shuffleBars(gold);
    expect(isNotComputable(shuffled)).toBe(false);

    const score = scoreModelContinuation(pair, shuffled as TimedEvent[]);
    expect(score.margin).not.toBeNull();
    expect(score.margin as number).toBeCloseTo(0, 10);
    expect(score.clearsBar).toBe(false);
  });

  it("empty model output: not_computable margin, clearsBar false", () => {
    const pair = mkPair(goldEvents());
    const score = scoreModelContinuation(pair, []);
    expect(isNotComputable(score.grooveOA_modelVsGold)).toBe(true);
    expect(score.margin).toBeNull();
    expect(score.clearsBar).toBe(false);
    expect(score.modelEventCount).toBe(0);
  });

  it("single-bar gold: shuffle control not computable → margin null, audited", () => {
    const oneBar = [mkEvent(5, 0, 60), mkEvent(5, 2, 64)];
    const pair = mkPair(oneBar);
    const score = scoreModelContinuation(pair, oneBar);
    expect(isNotComputable(score.grooveOA_shuffledVsGold)).toBe(true);
    expect(score.margin).toBeNull();
    expect(score.clearsBar).toBe(false);

    const agg = aggregateModelContinuations("test", [score]);
    expect(agg.computablePairCount).toBe(0);
    expect(
      agg.notComputableAudit.some((a) => a.metric === "grooveOA_shuffledVsGold"),
    ).toBe(true);
  });

  it("scores absolute-numbered and Bar_1-relative continuations identically (bar anchoring)", () => {
    const pair = mkPair(goldEvents());
    // The same perfect continuation, but labeled from measure 1 instead of 5 —
    // the convention the one-shot example teaches. Must score identically.
    const relabeled = goldEvents().map((e) => ({ ...e, measure: e.measure - 4 }));
    const absolute = scoreModelContinuation(pair, goldEvents());
    const relative = scoreModelContinuation(pair, relabeled);
    expect(relative.grooveOA_modelVsGold).toBeCloseTo(
      absolute.grooveOA_modelVsGold as number,
      10,
    );
    expect(relative.margin).toBeCloseTo(absolute.margin as number, 10);
    expect(relative.clearsBar).toBe(absolute.clearsBar);

    // The helper is idempotent and gap-preserving.
    const aligned = alignContinuationMeasures(relabeled, 5);
    expect(alignContinuationMeasures(aligned, 5)).toEqual(aligned);
    const gappy = alignContinuationMeasures([mkEvent(1, 0, 60), mkEvent(3, 0, 62)], 5);
    expect(gappy.map((e) => e.measure)).toEqual([5, 7]);
  });

  it("records gold/model bar and event counts", () => {
    const pair = mkPair(goldEvents());
    const model = [mkEvent(5, 0, 60), mkEvent(6, 0, 62)];
    const score = scoreModelContinuation(pair, model);
    expect(score.goldEventCount).toBe(15);
    expect(score.goldBarCount).toBe(4);
    expect(score.modelEventCount).toBe(2);
    expect(score.modelBarCount).toBe(2);
  });

  it("a partially-overlapping continuation lands between the anchors", () => {
    const pair = mkPair(goldEvents());
    // Right rhythm in bars 5-6, silence after — half the groove mass in place.
    const partial = [
      mkEvent(5, 0, 60), mkEvent(5, 1, 62), mkEvent(5, 2, 64), mkEvent(5, 3, 65),
      mkEvent(6, 0, 67), mkEvent(6, 0.5, 65), mkEvent(6, 1, 64), mkEvent(6, 1.5, 62),
    ];
    const score = scoreModelContinuation(pair, partial);
    const oa = score.grooveOA_modelVsGold as number;
    expect(oa).toBeGreaterThan(0);
    expect(oa).toBeLessThan(1);
  });
});

// ─── The locked bar itself ───────────────────────────────────────────────────

describe("the preregistered bar", () => {
  it("is the locked 0.15 from phrase-continuation.ts, not a local copy", () => {
    expect(FUTURE_MODEL_GROOVE_MARGIN).toBe(0.15);
    const pair = mkPair(goldEvents());
    const agg = aggregateModelContinuations("test", [
      scoreModelContinuation(pair, goldEvents()),
    ]);
    expect(agg.bar).toBe(FUTURE_MODEL_GROOVE_MARGIN);
  });
});

// ─── Aggregation ─────────────────────────────────────────────────────────────

describe("aggregateModelContinuations", () => {
  it("separates all-pairs clear rate from computable-subset means", () => {
    const pair = mkPair(goldEvents());
    const perfect = scoreModelContinuation(pair, goldEvents());
    const control = scoreModelContinuation(
      pair,
      shuffleBars(goldEvents()) as TimedEvent[],
    );
    const broken = scoreModelContinuation(pair, []);

    const agg = aggregateModelContinuations("mix", [perfect, control, broken]);
    expect(agg.pairCount).toBe(3);
    expect(agg.computablePairCount).toBe(2);
    expect(agg.pairsClearingBar).toBe(1); // only the perfect one
    expect(agg.clearRateAllPairs).toBeCloseTo(1 / 3);
    // Means restricted to the computable subset, so the identity holds exactly:
    expect(agg.meanMargin).toBeCloseTo(
      (agg.meanModelVsGold as number) - (agg.meanShuffledVsGold as number),
      10,
    );
    expect(agg.minMargin).toBeCloseTo(0, 10);
    expect(agg.maxMargin).toBeCloseTo(perfect.margin as number, 10);
  });

  it("handles an empty score list without dividing by zero", () => {
    const agg = aggregateModelContinuations("empty", []);
    expect(agg.pairCount).toBe(0);
    expect(agg.meanMargin).toBeNull();
    expect(agg.clearRateAllPairs).toBeNull();
    expect(agg.aggregateClearsBar).toBe(false);
  });
});

// ─── REMI → events conversion (the path model output takes) ──────────────────

describe("synthTimedEventsFromRemi (exported for the gate)", () => {
  it("maps Bar_1 onto the target phrase's start measure and positions onto beats", () => {
    const tokens = [
      "Bar_1", "Position_0", "Pitch_60", "Velocity_64", "Duration_4",
      "Position_24", "Pitch_62", "Velocity_60", "Duration_4",
      "Bar_2", "Position_48", "Pitch_64", "Velocity_62", "Duration_8",
    ];
    const events = synthTimedEventsFromRemi(tokens, "measures 5-8", "4/4");
    expect(events).toHaveLength(3);
    expect(events[0].measure).toBe(5);
    expect(events[0].beat).toBe(0);
    expect(events[1].measure).toBe(5);
    expect(events[1].beat).toBeCloseTo(1); // Position_24 of 96 in 4/4
    expect(events[2].measure).toBe(6);
    expect(events[2].beat).toBeCloseTo(2); // Position_48 of 96
    expect(events[2].note).toBe(64);
  });

  it("round-trips into the scorer: a REMI continuation scores against gold", () => {
    const pair = mkPair(goldEvents());
    // Reconstruct gold's bar-5 quarters via REMI (Position 0/24/48/72).
    const tokens = [
      "Bar_1",
      "Position_0", "Pitch_60", "Velocity_64", "Duration_4",
      "Position_24", "Pitch_62", "Velocity_64", "Duration_4",
      "Position_48", "Pitch_64", "Velocity_64", "Duration_4",
      "Position_72", "Pitch_65", "Velocity_64", "Duration_4",
    ];
    const events = synthTimedEventsFromRemi(tokens, "measures 5-8", "4/4");
    const score = scoreModelContinuation(pair, events);
    expect(score.margin).not.toBeNull();
    const oa = score.grooveOA_modelVsGold as number;
    expect(oa).toBeGreaterThan(0); // bar-5 mass aligns
    expect(oa).toBeLessThan(1); // bars 6-8 missing
  });
});
