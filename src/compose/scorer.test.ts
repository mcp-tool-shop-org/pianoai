// ─── Tests: the preference scorer (ranking, behind the gate) ─────────────────
//
// The scorer only ORDERS admitted candidates — it never gates. These tests pin
// each heuristic's DIRECTION (smoother > jumpier, complete > incomplete, good
// doubling > bad, contrary > similar) and determinism. Absolute values are not
// asserted beyond the [0,1] bound — the scorer is a ranking signal, not a metric.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { scoreRealization, DEFAULT_SCORE_WEIGHTS } from "./scorer.js";
import { frameFromVoicing, type Realization } from "./types.js";

function realize(key: string, frames: Array<[number, string, string]>): Realization {
  return { key, frames: frames.map(([m, c, v]) => frameFromVoicing(m, c, v)) };
}

describe("scoreRealization — smoothness", () => {
  it("prefers small voice motion over large leaps", () => {
    const smooth = realize("C major", [
      [1, "C", "C3 E3 G3 C4"],
      [2, "C", "C3 E3 G3 C4"],
    ]);
    const jumpy = realize("C major", [
      [1, "C", "C3 E3 G3 C4"],
      [2, "C", "C4 E4 G4 C5"], // whole texture up an octave
    ]);
    const s = scoreRealization(smooth);
    const j = scoreRealization(jumpy);
    expect(s.smoothness).toBeGreaterThan(j.smoothness);
    expect(s.smoothness).toBe(1);
    expect(j.smoothness).toBe(0);
  });
});

describe("scoreRealization — completeness", () => {
  it("prefers a complete triad over one missing its third", () => {
    const complete = realize("C major", [[1, "C", "C3 E3 G3"]]);
    const noThird = realize("C major", [[1, "C", "C3 G3 C4"]]);
    expect(scoreRealization(complete).completeness).toBeGreaterThan(
      scoreRealization(noThird).completeness,
    );
    expect(scoreRealization(complete).completeness).toBe(1);
  });
});

describe("scoreRealization — doubling quality", () => {
  it("prefers doubling the root over the third, and never the leading tone", () => {
    const doubleRoot = realize("C major", [[1, "C", "C3 E3 G3 C4"]]);
    const doubleThird = realize("C major", [[1, "C", "C3 E3 G3 E4"]]);
    // V chord doubling the leading tone (B is the 3rd of G AND the LT of C major)
    const doubleLeadingTone = realize("C major", [[1, "G", "G2 B2 D3 B3"]]);
    const root = scoreRealization(doubleRoot).doublingQuality;
    const third = scoreRealization(doubleThird).doublingQuality;
    const lt = scoreRealization(doubleLeadingTone).doublingQuality;
    expect(root).toBeGreaterThan(third);
    expect(third).toBeGreaterThan(lt);
    expect(root).toBe(1);
  });
});

describe("scoreRealization — outer-voice motion", () => {
  it("prefers contrary/oblique outer motion over similar motion", () => {
    // bass up, soprano down = contrary.
    const contrary = realize("C major", [
      [1, "C", "C3 E3 G3 C5"],
      [2, "C6", "E3 G3 C4 A4"],
    ]);
    // bass up, soprano up = similar.
    const similar = realize("C major", [
      [1, "C", "C3 E3 G3 C4"],
      [2, "C", "E3 G3 C4 E4"],
    ]);
    expect(scoreRealization(contrary).outerContrary).toBe(1);
    expect(scoreRealization(similar).outerContrary).toBe(0);
  });
});

describe("scoreRealization — overall", () => {
  it("is deterministic and bounded to [0,1]", () => {
    const r = realize("C major", [
      [1, "C", "C3 E3 G3 C4"],
      [2, "G", "G2 D3 G3 B3"],
      [3, "C", "C3 E3 G3 C4"],
    ]);
    const a = scoreRealization(r);
    const b = scoreRealization(r);
    expect(a).toEqual(b);
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(1);
    expect(a.weights).toEqual(DEFAULT_SCORE_WEIGHTS);
  });
});
