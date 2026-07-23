import { describe, it, expect } from "vitest";
import { toLabelSpan, scoreTimeline, aggregateScores } from "./mireval.js";

// The scorer IS the measurement instrument — these tests prove it discriminates
// right from wrong (per the "validate the instrument before trusting it" rule).

describe("scoreTimeline — discrimination", () => {
  const ref = [toLabelSpan(0, 4, "C")];

  it("identical estimate ⇒ perfect on all three levels", () => {
    expect(scoreTimeline(ref, [toLabelSpan(0, 4, "C")])).toMatchObject({
      rootAcc: 1, majMinAcc: 1, fullAcc: 1, refBeats: 4,
    });
  });

  it("wrong root ⇒ zero everywhere", () => {
    expect(scoreTimeline(ref, [toLabelSpan(0, 4, "G")])).toMatchObject({ rootAcc: 0, majMinAcc: 0, fullAcc: 0 });
  });

  it("right root, wrong third (C vs Cm) ⇒ root passes, maj/min + full fail", () => {
    const s = scoreTimeline(ref, [toLabelSpan(0, 4, "Cm")]);
    expect(s.rootAcc).toBe(1);
    expect(s.majMinAcc).toBe(0);
    expect(s.fullAcc).toBe(0);
  });

  it("right root + same maj/min, deeper quality differs (C vs C7) ⇒ maj/min passes, full fails", () => {
    const s = scoreTimeline(ref, [toLabelSpan(0, 4, "C7")]);
    expect(s.rootAcc).toBe(1);
    expect(s.majMinAcc).toBe(1);
    expect(s.fullAcc).toBe(0);
  });

  it("half-covered estimate ⇒ ~0.5 (unlabeled remainder counts against)", () => {
    const s = scoreTimeline(ref, [toLabelSpan(0, 2, "C")]);
    expect(s.rootAcc).toBeCloseTo(0.5, 6);
    expect(s.fullAcc).toBeCloseTo(0.5, 6);
  });

  it("no-chord reference regions are excluded from the denominator", () => {
    const refWithGap = [toLabelSpan(0, 4, "C"), toLabelSpan(4, 8, "N/C")];
    const s = scoreTimeline(refWithGap, [toLabelSpan(0, 8, "C")]);
    expect(s.refBeats).toBe(4); // only the real-chord region is scored
    expect(s.rootAcc).toBe(1);
  });
});

describe("scoreTimeline — multi-span", () => {
  const ref = [toLabelSpan(0, 4, "C"), toLabelSpan(4, 8, "G")];

  it("exact two-chord match ⇒ perfect over 8 beats", () => {
    expect(scoreTimeline(ref, [toLabelSpan(0, 4, "C"), toLabelSpan(4, 8, "G")])).toMatchObject({
      rootAcc: 1, refBeats: 8,
    });
  });

  it("one held chord over a two-chord reference ⇒ half", () => {
    expect(scoreTimeline(ref, [toLabelSpan(0, 8, "C")]).rootAcc).toBeCloseTo(0.5, 6);
  });
});

describe("aggregateScores", () => {
  it("combines section scores duration-weighted", () => {
    const a = { rootAcc: 1, majMinAcc: 1, fullAcc: 1, refBeats: 4 };
    const b = { rootAcc: 0.5, majMinAcc: 0.5, fullAcc: 0, refBeats: 4 };
    const agg = aggregateScores([a, b]);
    expect(agg.rootAcc).toBeCloseTo(0.75, 6);
    expect(agg.fullAcc).toBeCloseTo(0.5, 6);
    expect(agg.refBeats).toBe(8);
  });
});
