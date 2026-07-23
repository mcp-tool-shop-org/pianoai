// ─── Tests: the soft style-typicality cost (a scorer axis, never a gate) ─────
//
// The axis must (1) compute sensible voicing-texture features, (2) score
// typicality in (0,1] with an exact-match = 1, (3) rank only — and, critically,
// (4) be DEFAULT-OFF so it changes no existing score (weight 0). Finding 19: this
// is a distributional tripwire, never a per-item quality verdict.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  styleFeatures,
  buildStyleReference,
  styleTypicality,
} from "./style-cost.js";
import { scoreRealization, DEFAULT_SCORE_WEIGHTS } from "./scorer.js";
import { frameFromVoicing, type Realization } from "./types.js";

function realize(key: string, frames: Array<[number, string, string]>): Realization {
  return { key, frames: frames.map(([m, c, v]) => frameFromVoicing(m, c, v)) };
}

const IV_I = realize("C major", [
  [1, "C", "C3 E3 G3 C4"],
  [2, "G", "G2 D3 G3 B3"],
  [3, "C", "C3 E3 G3 C4"],
]);
const PARALLEL = realize("C major", [
  [1, "C", "C3 E3 G3 C4"],
  [2, "Dm", "D3 F3 A3 D4"],
  [3, "C", "C3 E3 G3 C4"],
]);

describe("styleFeatures", () => {
  it("reports 0 parallel fraction for clean part-writing, > 0 for a parallel block", () => {
    expect(styleFeatures(IV_I).parallelFraction).toBe(0);
    expect(styleFeatures(PARALLEL).parallelFraction).toBeGreaterThan(0);
  });

  it("computes bounded, finite texture features", () => {
    const f = styleFeatures(IV_I);
    expect(f.parallelFraction).toBeGreaterThanOrEqual(0);
    expect(f.parallelFraction).toBeLessThanOrEqual(1);
    expect(f.contraryFraction).toBeGreaterThanOrEqual(0);
    expect(f.contraryFraction).toBeLessThanOrEqual(1);
    expect(Number.isFinite(f.meanMotion)).toBe(true);
    expect(Number.isFinite(f.meanUpperSpacing)).toBe(true);
  });
});

describe("buildStyleReference + styleTypicality", () => {
  it("scores an exact-match realization as maximally typical (≈1)", () => {
    const ref = buildStyleReference("test", [IV_I]); // means = IV_I's features, std 0 → floored
    expect(styleTypicality(IV_I, ref)).toBeCloseTo(1, 6);
  });

  it("scores an atypical realization below a typical one", () => {
    const ref = buildStyleReference("chorale-ish", [IV_I]);
    expect(styleTypicality(PARALLEL, ref)).toBeLessThan(styleTypicality(IV_I, ref));
  });

  it("stays within (0,1]", () => {
    const ref = buildStyleReference("chorale-ish", [IV_I]);
    const t = styleTypicality(PARALLEL, ref);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThanOrEqual(1);
  });

  it("aggregates a multi-item corpus into per-feature mean + std", () => {
    const ref = buildStyleReference("mix", [IV_I, PARALLEL]);
    expect(ref.n).toBe(2);
    for (const stats of Object.values(ref.features)) {
      expect(Number.isFinite(stats.mean)).toBe(true);
      expect(stats.std).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("scorer integration — A2 is opt-in and default-inert", () => {
  it("defaults styleTypicality weight to 0", () => {
    expect(DEFAULT_SCORE_WEIGHTS.styleTypicality).toBe(0);
  });

  it("does NOT change the default score whether or not a reference is supplied", () => {
    const ref = buildStyleReference("test", [IV_I]);
    const withoutRef = scoreRealization(PARALLEL);
    const withRef = scoreRealization(PARALLEL, DEFAULT_SCORE_WEIGHTS, { styleReference: ref });
    // weight is 0 → the axis cannot move the overall score
    expect(withRef.score).toBeCloseTo(withoutRef.score, 12);
    // but the axis VALUE is reported (neutral 1 without a ref; computed with one)
    expect(withoutRef.styleTypicality).toBe(1);
    expect(withRef.styleTypicality).toBeGreaterThan(0);
    expect(withRef.styleTypicality).toBeLessThanOrEqual(1);
  });

  it("influences the score ONLY when a caller opts in with a weight + reference", () => {
    const ref = buildStyleReference("chorale-ish", [IV_I]);
    const weights = { ...DEFAULT_SCORE_WEIGHTS, styleTypicality: 0.5 };
    const typical = scoreRealization(IV_I, weights, { styleReference: ref });
    const atypical = scoreRealization(PARALLEL, weights, { styleReference: ref });
    // with the axis weighted, the in-band realization's axis beats the out-of-band one
    expect(typical.styleTypicality).toBeGreaterThan(atypical.styleTypicality);
    expect(typical.score).toBeGreaterThanOrEqual(0);
    expect(typical.score).toBeLessThanOrEqual(1);
  });
});
