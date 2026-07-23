import { describe, it, expect } from "vitest";
import { detectRegions } from "./hcdf.js";
import type { Segment } from "./types.js";

/** Build a beat Segment from a {pc: weight} profile. */
function seg(startBeat: number, map: Record<number, number>): Segment {
  const profile = new Array<number>(12).fill(0);
  for (const [pc, w] of Object.entries(map)) profile[Number(pc)] = w;
  const total = profile.reduce((a, b) => a + b, 0);
  const pcs = Object.keys(map).map(Number);
  const bassPc = pcs.length ? Math.min(...pcs) : -1;
  return {
    startBeat,
    endBeat: startBeat + 1,
    measure: 1,
    beatInMeasure: startBeat,
    profile,
    bassPc,
    bassPitch: bassPc >= 0 ? 48 + bassPc : -1,
    totalWeight: total,
  };
}

const C = { 0: 1, 4: 1, 7: 1 };
const G = { 7: 1, 11: 1, 2: 1 };

describe("detectRegions", () => {
  it("groups identical consecutive chords into one region", () => {
    const regions = detectRegions([seg(0, C), seg(1, C), seg(2, C)], 0.5, 0);
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({ startBeat: 0, endBeat: 3, segments: 3, silent: false });
  });

  it("splits a real harmonic change into two regions at the boundary", () => {
    const regions = detectRegions([seg(0, C), seg(1, C), seg(2, G), seg(3, G)], 0.5, 0);
    expect(regions).toHaveLength(2);
    expect(regions[0]).toMatchObject({ startBeat: 0, endBeat: 2 });
    expect(regions[1]).toMatchObject({ startBeat: 2, endBeat: 4 });
  });

  it("smoothing groups an arpeggio's partial voicings into one region", () => {
    // The Session-1/2 failure case: an arpeggio whose beats each emphasize
    // different chord tones. Raw centroids are far apart (partial voicings on
    // the tonnetz); the smoothing window (radius 2) lets each beat see the whole
    // C-major chord, so they stay ONE region instead of fragmenting into C/E/C.
    const arp = [seg(0, { 0: 1, 4: 1 }), seg(1, { 4: 1, 7: 1 }), seg(2, { 7: 1, 0: 1 }), seg(3, { 0: 1, 4: 1 })];
    expect(detectRegions(arp, 0.5, 2)).toHaveLength(1);
    // ...and without smoothing they DO fragment (documents why smoothing exists).
    expect(detectRegions(arp, 0.5, 0).length).toBeGreaterThan(1);
  });

  it("makes a silent segment its own no-chord region and breaks the run", () => {
    const regions = detectRegions([seg(0, C), seg(1, {}), seg(2, C)], 0.5, 0);
    expect(regions).toHaveLength(3);
    expect(regions[1]).toMatchObject({ silent: true });
    expect(regions[0].silent).toBe(false);
    expect(regions[2].silent).toBe(false);
  });
});
