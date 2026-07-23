import { describe, it, expect } from "vitest";
import { parseMeter } from "./meter.js";
import { segmentMeasure } from "./profile.js";
import { measureEvents } from "./events.js";
import type { Measure } from "../songs/types.js";

const M = (o: Partial<Measure> & { number: number }): Measure => ({
  number: o.number,
  rightHand: o.rightHand ?? "",
  leftHand: o.leftHand ?? "",
});

describe("segmentMeasure", () => {
  const meter44 = parseMeter("4/4");

  it("splits a 4/4 measure into 4 tactus windows", () => {
    const m = M({ number: 1, leftHand: "C3:w" });
    const segs = segmentMeasure(measureEvents(m, 0), meter44, 0, 1);
    expect(segs).toHaveLength(4);
    expect(segs.map((s) => s.beatInMeasure)).toEqual([0, 1, 2, 3]);
  });

  it("splits a 6/8 measure into 2 dotted-quarter windows", () => {
    const meter68 = parseMeter("6/8");
    const m = M({ number: 1, leftHand: "C3:h." }); // dotted half = the whole 6/8 bar
    const segs = segmentMeasure(measureEvents(m, 0), meter68, 0, 1);
    expect(segs).toHaveLength(2);
    expect(segs.map((s) => s.beatInMeasure)).toEqual([0, 1.5]);
  });

  it("a held downbeat chord dominates a passing off-beat sixteenth (the salience property)", () => {
    // LH: C-major triad, half note struck on the downbeat.
    // RH: fast passing D sixteenths interleaved with C sixteenths.
    const m = M({ number: 1, leftHand: "C3+E3+G3:h", rightHand: "C6:s D6:s C6:s D6:s" });
    const seg0 = segmentMeasure(measureEvents(m, 0), meter44, 0, 1)[0]; // window [0,1)
    // pc2 is the passing D; pc0/pc4/pc7 are the held chord tones.
    expect(seg0.profile[2]).toBeLessThan(seg0.profile[0]);
    expect(seg0.profile[2]).toBeLessThan(seg0.profile[4]);
    expect(seg0.profile[2]).toBeLessThan(seg0.profile[7]);
    // and it's a small fraction of even a single held chord tone's weight
    expect(seg0.profile[2]).toBeLessThan(seg0.profile[4] * 0.25);
  });

  it("reports the sounding bass as the lowest pitch", () => {
    const m = M({ number: 1, leftHand: "C3+E3+G3:q" });
    const seg0 = segmentMeasure(measureEvents(m, 0), meter44, 0, 1)[0];
    expect(seg0.bassPc).toBe(0); // C
    expect(seg0.bassPitch).toBe(48);
    expect(seg0.totalWeight).toBeGreaterThan(0);
  });

  it("a silent window has zero weight and no bass", () => {
    const m = M({ number: 1, leftHand: "R:w", rightHand: "R:w" });
    const segs = segmentMeasure(measureEvents(m, 0), meter44, 0, 1);
    expect(segs.every((s) => s.totalWeight === 0)).toBe(true);
    expect(segs.every((s) => s.bassPc === -1)).toBe(true);
  });
});
