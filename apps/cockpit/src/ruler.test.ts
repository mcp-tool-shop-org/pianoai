// ─── ruler.test.ts ───────────────────────────────────────────────────────────
//
// Pure, DOM-free coverage for ruler.ts's px<->beat mapping, bar/tick
// layout, loop-region drag normalization, and auto-scroll-follow threshold
// math (Wave C2a) — same "plain numbers in, plain numbers/objects out, no
// window/document" testability as time.test.ts/transport.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  pxToBeat, beatToPx, snapToWholeBeat, computeRulerTicks, normalizeRegion,
  computeFollowScroll, MIN_REGION_BEATS,
} from "./ruler.js";
import { PX_PER_BEAT, SCORE_BEATS } from "./time.js";

describe("pxToBeat / beatToPx — round trip", () => {
  it("converts a pixel offset to the matching beat position", () => {
    expect(pxToBeat(PX_PER_BEAT)).toBe(1);
    expect(pxToBeat(PX_PER_BEAT * 4)).toBe(4);
  });

  it("converts a beat position to the matching pixel offset", () => {
    expect(beatToPx(1)).toBe(PX_PER_BEAT);
    expect(beatToPx(4)).toBe(PX_PER_BEAT * 4);
  });

  it("round-trips an arbitrary fractional beat position", () => {
    const beat = 12.375;
    expect(pxToBeat(beatToPx(beat))).toBeCloseTo(beat, 10);
  });

  it("0px is beat 0 and beat 0 is 0px", () => {
    expect(pxToBeat(0)).toBe(0);
    expect(beatToPx(0)).toBe(0);
  });
});

describe("snapToWholeBeat", () => {
  it("rounds to the nearest whole beat", () => {
    expect(snapToWholeBeat(0.4)).toBe(0);
    expect(snapToWholeBeat(0.6)).toBe(1);
    expect(snapToWholeBeat(3.5)).toBe(4); // round-half-up, matches Math.round
  });

  it("passes an already-whole beat through unchanged", () => {
    expect(snapToWholeBeat(5)).toBe(5);
  });

  it("never returns a negative beat", () => {
    expect(snapToWholeBeat(-0.5)).toBe(0);
    expect(snapToWholeBeat(-10)).toBe(0);
  });
});

describe("computeRulerTicks", () => {
  it("defaults to one tick per beat across the full SCORE_BEATS width", () => {
    const ticks = computeRulerTicks();
    expect(ticks).toHaveLength(SCORE_BEATS + 1); // inclusive of beat 0 AND the final beat
    expect(ticks[0].beat).toBe(0);
    expect(ticks[ticks.length - 1].beat).toBe(SCORE_BEATS);
  });

  it("flags every 4th beat (default 4/4) as a bar line, starting at beat 0", () => {
    const ticks = computeRulerTicks(8);
    expect(ticks.filter((t) => t.isBar).map((t) => t.beat)).toEqual([0, 4, 8]);
  });

  it("assigns 1-indexed, sequential bar numbers", () => {
    const ticks = computeRulerTicks(12);
    const bars = ticks.filter((t) => t.isBar);
    expect(bars.map((t) => t.barNumber)).toEqual([1, 2, 3, 4]);
  });

  it("leaves barNumber null on non-bar ticks", () => {
    const ticks = computeRulerTicks(4);
    const nonBar = ticks.filter((t) => !t.isBar);
    expect(nonBar.length).toBeGreaterThan(0);
    expect(nonBar.every((t) => t.barNumber === null)).toBe(true);
  });

  it("computes each tick's px from its beat via PX_PER_BEAT", () => {
    const ticks = computeRulerTicks(2);
    expect(ticks.map((t) => t.px)).toEqual([0, PX_PER_BEAT, PX_PER_BEAT * 2]);
  });

  it("respects a custom beatsPerBar", () => {
    const ticks = computeRulerTicks(6, 3);
    expect(ticks.filter((t) => t.isBar).map((t) => t.beat)).toEqual([0, 3, 6]);
  });

  it("returns a single bar-1 tick for totalBeats=0", () => {
    expect(computeRulerTicks(0)).toEqual([{ beat: 0, px: 0, isBar: true, barNumber: 1 }]);
  });

  it("returns an empty array for a negative or non-finite totalBeats", () => {
    expect(computeRulerTicks(-1)).toEqual([]);
    expect(computeRulerTicks(NaN)).toEqual([]);
    expect(computeRulerTicks(Infinity)).toEqual([]);
  });

  it("floors a fractional totalBeats rather than producing a partial tick", () => {
    const ticks = computeRulerTicks(4.7);
    expect(ticks[ticks.length - 1].beat).toBe(4);
  });

  it("falls back to 4/4 for a non-finite or non-positive beatsPerBar", () => {
    const expected = computeRulerTicks(8, 4).map((t) => t.isBar);
    expect(computeRulerTicks(8, 0).map((t) => t.isBar)).toEqual(expected);
    expect(computeRulerTicks(8, NaN).map((t) => t.isBar)).toEqual(expected);
    expect(computeRulerTicks(8, -2).map((t) => t.isBar)).toEqual(expected);
  });
});

describe("normalizeRegion", () => {
  it("orders a left-to-right drag as [start, end]", () => {
    expect(normalizeRegion(2, 6)).toEqual({ startBeat: 2, endBeat: 6 });
  });

  it("orders a right-to-left drag identically to the equivalent left-to-right drag", () => {
    expect(normalizeRegion(6, 2)).toEqual({ startBeat: 2, endBeat: 6 });
  });

  it("snaps both endpoints to whole beats", () => {
    expect(normalizeRegion(2.4, 6.6)).toEqual({ startBeat: 2, endBeat: 7 });
  });

  it("expands a degenerate (no-movement) drag to the minimum length", () => {
    expect(normalizeRegion(5, 5)).toEqual({ startBeat: 5, endBeat: 6 });
  });

  it("expands a drag shorter than the minimum length forward from the snapped start", () => {
    // Both endpoints snap into the same whole beat (5) — same result as a click.
    expect(normalizeRegion(5.1, 5.3)).toEqual({ startBeat: 5, endBeat: 6 });
  });

  it("accepts a custom minimum length", () => {
    expect(normalizeRegion(5, 5, 4)).toEqual({ startBeat: 5, endBeat: 9 });
  });

  it("leaves a region already at or above the minimum length untouched", () => {
    expect(normalizeRegion(0, 10)).toEqual({ startBeat: 0, endBeat: 10 });
  });

  it("floors startBeat at 0 for a drag that starts before the timeline", () => {
    expect(normalizeRegion(-5, 3)).toEqual({ startBeat: 0, endBeat: 3 });
  });

  it("clamps endBeat to maxBeat when the drag overshoots the score, without disturbing a valid startBeat", () => {
    expect(normalizeRegion(60, 70, MIN_REGION_BEATS, SCORE_BEATS))
      .toEqual({ startBeat: 60, endBeat: SCORE_BEATS });
  });

  it("pulls startBeat back too when clamping would otherwise produce a too-short region at the max edge", () => {
    // A degenerate click 0 beats from the end: endBeat can't exceed
    // maxBeat, so startBeat must retreat to preserve the minimum length.
    expect(normalizeRegion(SCORE_BEATS, SCORE_BEATS, MIN_REGION_BEATS, SCORE_BEATS))
      .toEqual({ startBeat: SCORE_BEATS - 1, endBeat: SCORE_BEATS });
  });

  it("is unaffected by maxBeat when the region is entirely within range", () => {
    expect(normalizeRegion(2, 6, MIN_REGION_BEATS, SCORE_BEATS)).toEqual({ startBeat: 2, endBeat: 6 });
  });

  it("ignores maxBeat entirely when it is Infinity (the default)", () => {
    expect(normalizeRegion(1000, 1010)).toEqual({ startBeat: 1000, endBeat: 1010 });
  });
});

describe("computeFollowScroll", () => {
  it("returns null when the playhead is well within the visible width", () => {
    expect(computeFollowScroll(100, 0, 1000, 5000)).toBeNull();
  });

  it("returns null exactly AT the trigger threshold (not yet past it)", () => {
    // scrollLeft=0, clientWidth=1000, triggerFraction=0.7 -> threshold px 700
    expect(computeFollowScroll(700, 0, 1000, 5000)).toBeNull();
  });

  it("triggers just past the threshold and jumps forward by the jump fraction", () => {
    // threshold 700; playhead at 701 -> triggers; target = 0 + 1000*0.5 = 500
    expect(computeFollowScroll(701, 0, 1000, 5000)).toBe(500);
  });

  it("measures the threshold from the CURRENT scrollLeft, not from 0", () => {
    // scrollLeft=2000, clientWidth=1000 -> threshold px 2700
    expect(computeFollowScroll(2701, 2000, 1000, 5000)).toBe(2500);
    expect(computeFollowScroll(2600, 2000, 1000, 5000)).toBeNull();
  });

  it("clamps the jump target to maxScrollLeft", () => {
    // target would be 2000 + 500 = 2500, but max is only 2200.
    expect(computeFollowScroll(2701, 2000, 1000, 2200)).toBe(2200);
  });

  it("never returns a negative scrollLeft", () => {
    expect(computeFollowScroll(50, -100, 1000, 5000, 0.01)).toBeGreaterThanOrEqual(0);
  });

  it("returns null for a zero or negative clientWidth (not yet laid out)", () => {
    expect(computeFollowScroll(100, 0, 0, 5000)).toBeNull();
    expect(computeFollowScroll(100, 0, -10, 5000)).toBeNull();
  });

  it("respects custom trigger/jump fractions", () => {
    // triggerFraction=0.5 -> threshold 500; jumpFraction=0.25 -> target 250
    expect(computeFollowScroll(501, 0, 1000, 5000, 0.5, 0.25)).toBe(250);
  });
});
