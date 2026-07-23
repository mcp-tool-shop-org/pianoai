import { describe, it, expect } from "vitest";
import { tonalCentroid, centroidDistance } from "./tonal-centroid.js";

function prof(map: Record<number, number>): number[] {
  const p = new Array<number>(12).fill(0);
  for (const [pc, w] of Object.entries(map)) p[Number(pc)] = w;
  return p;
}
const C = prof({ 0: 1, 4: 1, 7: 1 });
const G = prof({ 7: 1, 11: 1, 2: 1 });
const Fsharp = prof({ 6: 1, 10: 1, 1: 1 });
const Am = prof({ 9: 1, 0: 1, 4: 1 });
const Fsharpm = prof({ 6: 1, 9: 1, 1: 1 });
const d = (a: number[], b: number[]) => centroidDistance(tonalCentroid(a), tonalCentroid(b));

describe("tonalCentroid", () => {
  it("returns the 6-D origin for a silent profile", () => {
    expect(tonalCentroid(new Array<number>(12).fill(0))).toEqual(new Array<number>(6).fill(0));
  });

  it("a chord is closer to its dominant (a fifth away) than to the tritone", () => {
    expect(d(C, G)).toBeLessThan(d(C, Fsharp));
  });

  it("a chord is closer to its relative minor than to a distant minor", () => {
    // C and Am share C and E; C and F#m share nothing.
    expect(d(C, Am)).toBeLessThan(d(C, Fsharpm));
  });

  it("identical profiles have zero distance", () => {
    expect(d(C, C)).toBeCloseTo(0, 10);
  });
});
