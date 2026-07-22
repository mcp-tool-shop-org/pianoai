// ─── Tests: E2v2 conjunctive two-axis scoring + item screen ──────────────────
//
// Locks the repaired instrument's behavior (design §6.2.3–6.2.4):
//   - the conjunctive gate needs BOTH axes (rhythm AND tonal) to clear — a
//     right-rhythm/wrong-notes continuation cannot pass on rhythm alone;
//   - margins are over the FOIL, not a permutation of gold;
//   - the item screen is model-blind and drops items where gold and foil don't
//     separate (the E2v2 analog of the v1 dead-pair problem);
//   - the aggregate reports exact paired significance per axis and a conjunctive
//     headline.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import type { TimedEvent } from "../schema.js";
import { isNotComputable, type ResolvedPair, type PairRecord } from "./phrase-continuation.js";
import {
  scoreE2v2Continuation,
  screenItemE2v2,
  aggregateE2v2,
  E2V2_TONAL_MARGIN,
} from "./model-continuation.js";

function mkEvent(measure: number, beat: number, note: number): TimedEvent {
  return {
    t_seconds: 0, t_ticks: 0, dur_seconds: 0.5, dur_ticks: 240,
    note, name: `MIDI${note}`, velocity: 64, channel: 0, hand: "right", measure, beat,
  };
}

function goldEvents(): TimedEvent[] {
  return [
    mkEvent(5, 0, 60), mkEvent(5, 1, 62), mkEvent(5, 2, 64), mkEvent(5, 3, 65),
    mkEvent(6, 0, 67), mkEvent(6, 0.5, 65), mkEvent(6, 1, 64), mkEvent(6, 1.5, 62),
    mkEvent(7, 0, 60), mkEvent(7, 2, 64),
    mkEvent(8, 0, 62), mkEvent(8, 1, 64), mkEvent(8, 1.5, 65), mkEvent(8, 2, 67), mkEvent(8, 3, 72),
  ];
}

function mkPair(targetEvents: TimedEvent[]): ResolvedPair {
  const promptRecord: PairRecord = {
    id: "test-song:m001-004:prompt",
    scope: { song_id: "test-song", phrase_window: "measures 1-4", time_signature: "4/4", window_role: "prompt", continuation_target_window: [5, 8] },
    observation: { midi_sidecar: { timed_events: [mkEvent(1, 0, 60)] } },
  };
  const targetRecord: PairRecord = {
    id: "test-song:m005-008:target",
    scope: { song_id: "test-song", phrase_window: "measures 5-8", time_signature: "4/4", window_role: "continuation_target", paired_prompt_record_id: promptRecord.id },
    observation: { midi_sidecar: { timed_events: targetEvents } },
  };
  return { promptRecord, targetRecord };
}

/** A foil clearly different from gold on BOTH axes: an out-of-key pitch (pc 1)
 *  at off-grid slots gold never uses. */
function differentFoil(): TimedEvent[] {
  return [mkEvent(5, 0.25, 61), mkEvent(6, 0.75, 61), mkEvent(7, 1.25, 61), mkEvent(8, 2.5, 61)];
}

// ─── The conjunctive scorer ──────────────────────────────────────────────────

describe("scoreE2v2Continuation", () => {
  it("a perfect model (≡ gold) beats a clearly-different foil on BOTH axes → clears", () => {
    const pair = mkPair(goldEvents());
    const s = scoreE2v2Continuation(pair, goldEvents(), differentFoil(), { foilLabel: "markov" });
    expect(s.rhythm.margin).not.toBeNull();
    expect(s.tonal.margin).not.toBeNull();
    expect(s.rhythm.margin as number).toBeGreaterThan(0);
    expect(s.tonal.margin as number).toBeGreaterThan(0);
    expect(s.clearsBar).toBe(true);
    expect(s.foilLabel).toBe("markov");
  });

  it("the foil-as-model earns margin ≈ 0 on both axes and cannot clear", () => {
    const pair = mkPair(goldEvents());
    const foil = differentFoil();
    const s = scoreE2v2Continuation(pair, foil, foil);
    expect(s.rhythm.margin as number).toBeCloseTo(0, 10);
    expect(s.tonal.margin as number).toBeCloseTo(0, 10);
    expect(s.clearsBar).toBe(false);
  });

  it("CONJUNCTIVE: right rhythm + wrong notes clears rhythm but NOT the gate", () => {
    const pair = mkPair(goldEvents());
    // gold's exact onsets, but every pitch replaced by an out-of-key note (pc 1).
    const rightRhythmWrongNotes = goldEvents().map((e) => ({ ...e, note: 61 }));
    const s = scoreE2v2Continuation(pair, rightRhythmWrongNotes, differentFoil());
    // Rhythm axis clears (onsets identical to gold, foil's differ).
    expect(s.rhythm.margin as number).toBeGreaterThan(0.15);
    // Tonal axis does not: pc1 gives ~0 model tonal OA, foil also pc1 → margin ~0.
    expect(s.tonal.margin as number).toBeLessThan(E2V2_TONAL_MARGIN);
    expect(s.clearsBar).toBe(false); // the conjunction closes the Goodhart hole
  });

  it("empty model output → not_computable margins, cannot clear", () => {
    const pair = mkPair(goldEvents());
    const s = scoreE2v2Continuation(pair, [], differentFoil());
    expect(isNotComputable(s.rhythm.modelVsGold)).toBe(true);
    expect(s.rhythm.margin).toBeNull();
    expect(s.tonal.margin).toBeNull();
    expect(s.clearsBar).toBe(false);
  });
});

// ─── The model-blind item screen ─────────────────────────────────────────────

describe("screenItemE2v2", () => {
  it("qualifies an item where gold and foil separate on both axes", () => {
    const pair = mkPair(goldEvents());
    const screen = screenItemE2v2(pair, differentFoil());
    expect(screen.rhythmSeparation as number).toBeGreaterThan(0.15);
    expect(screen.tonalSeparation as number).toBeGreaterThan(0.15);
    expect(screen.qualifies).toBe(true);
  });

  it("screens out an item where the foil is indistinguishable from gold (dead pair)", () => {
    const pair = mkPair(goldEvents());
    // Foil == gold → zero separation on both axes → cannot gate anything.
    const screen = screenItemE2v2(pair, goldEvents());
    expect(screen.rhythmSeparation as number).toBeCloseTo(0, 10);
    expect(screen.tonalSeparation as number).toBeCloseTo(0, 10);
    expect(screen.qualifies).toBe(false);
    expect(screen.reason).toMatch(/below separation bar/);
  });

  it("requires BOTH axes — a tonal-only match does not qualify", () => {
    const pair = mkPair(goldEvents());
    // Foil with gold's exact pitches (tonal sep ≈ 0) but very different rhythm.
    const tonalTwin = goldEvents().map((e, i) => ({ ...e, measure: 5 + (i % 4), beat: (i * 0.5) % 4 }));
    const screen = screenItemE2v2(pair, tonalTwin);
    // tonal separation is ~0 (same pitch content), so the item is screened out
    // regardless of rhythm.
    expect(screen.tonalSeparation as number).toBeLessThan(0.15);
    expect(screen.qualifies).toBe(false);
  });
});

// ─── The aggregate ───────────────────────────────────────────────────────────

describe("aggregateE2v2", () => {
  it("all-clearing items → both-axes significant and conjunctive clear", () => {
    const pair = mkPair(goldEvents());
    const scores = Array.from({ length: 5 }, () =>
      scoreE2v2Continuation(pair, goldEvents(), differentFoil()),
    );
    const agg = aggregateE2v2("perfect", scores, { alpha: 0.05, seed: 1 });
    expect(agg.pairsClearingBar).toBe(5);
    expect(agg.aggregateClearsBar).toBe(true);
    // 5 all-positive margins → exact permutation p = 1/32 < 0.05 on each axis.
    expect(agg.rhythm.permutationTest.pValue).toBeCloseTo(1 / 32, 6);
    expect(agg.tonal.permutationTest.pValue).toBeCloseTo(1 / 32, 6);
    expect(agg.bothAxesSignificant).toBe(true);
  });

  it("foil-level items → neither axis significant, no conjunctive clear", () => {
    const pair = mkPair(goldEvents());
    const foil = differentFoil();
    const scores = Array.from({ length: 5 }, () => scoreE2v2Continuation(pair, foil, foil));
    const agg = aggregateE2v2("control", scores, { alpha: 0.05, seed: 1 });
    expect(agg.aggregateClearsBar).toBe(false);
    expect(agg.bothAxesSignificant).toBe(false);
    expect(agg.pairsClearingBar).toBe(0);
  });

  it("audits not-computable axes instead of fabricating margins", () => {
    const pair = mkPair(goldEvents());
    const scores = [scoreE2v2Continuation(pair, [], differentFoil())];
    const agg = aggregateE2v2("broken", scores);
    expect(agg.computablePairCount).toBe(0);
    expect(agg.notComputableAudit.some((a) => a.side === "model")).toBe(true);
  });
});
