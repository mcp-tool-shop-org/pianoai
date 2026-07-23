import { describe, it, expect } from "vitest";
import { rootSalience, findRoot } from "./root.js";

/** Build a 12-dim profile from a {pc: weight} map. */
function prof(map: Record<number, number>): number[] {
  const p = new Array<number>(12).fill(0);
  for (const [pc, w] of Object.entries(map)) p[Number(pc)] = w;
  return p;
}

describe("rootSalience", () => {
  it("a C-major triad is most salient on C, not on E or G", () => {
    const s = rootSalience(prof({ 0: 1, 4: 1, 7: 1 }));
    expect(s[0]).toBeGreaterThan(s[4]);
    expect(s[0]).toBeGreaterThan(s[7]);
    expect(s.indexOf(Math.max(...s))).toBe(0);
  });
});

describe("findRoot", () => {
  it("roots a C-major triad on C with a clear margin", () => {
    const r = findRoot(prof({ 0: 1, 4: 1, 7: 1 }));
    expect(r.root).toBe(0);
    expect(r.margin).toBeGreaterThan(0.2);
  });

  it("roots an A-minor triad on A (A wins over C — root is not the bass by accident)", () => {
    const r = findRoot(prof({ 9: 1, 0: 1, 4: 1 }));
    expect(r.root).toBe(9);
  });

  it("a G7 roots on G", () => {
    const r = findRoot(prof({ 7: 1, 11: 1, 2: 1, 5: 1 }));
    expect(r.root).toBe(7);
  });

  it("uses the bass ONLY to break a near-tie (C6 vs Am)", () => {
    // C6 = C E G A: C (18) barely edges A (17) — a genuine near-tie.
    const c6 = prof({ 0: 1, 4: 1, 7: 1, 9: 1 });
    // No bass → the PC content wins: C.
    expect(findRoot(c6, -1).root).toBe(0);
    // Bass on A (the near-tied runner-up) → the bass breaks it toward A.
    const withBassA = findRoot(c6, 9);
    expect(withBassA.root).toBe(9);
    expect(withBassA.bassDecided).toBe(true);
    // Bass on C (already the winner) → no tiebreak needed, still C.
    expect(findRoot(c6, 0).root).toBe(0);
  });

  it("never lets the bass override a decisive winner", () => {
    // A clear C major triad with a spurious low B (pc 11) as bass must stay C.
    const r = findRoot(prof({ 0: 3, 4: 3, 7: 3, 11: 0.1 }), 11);
    expect(r.root).toBe(0);
    expect(r.bassDecided).toBe(false);
  });

  it("returns -1 for a silent (all-zero) profile", () => {
    expect(findRoot(new Array<number>(12).fill(0)).root).toBe(-1);
  });
});
