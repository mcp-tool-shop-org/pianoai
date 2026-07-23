import { describe, it, expect } from "vitest";
import { identifyChord } from "./chord-id.js";

function prof(map: Record<number, number>): number[] {
  const p = new Array<number>(12).fill(0);
  for (const [pc, w] of Object.entries(map)) p[Number(pc)] = w;
  return p;
}

describe("identifyChord — triads", () => {
  it("names a C-major triad 'C' with full coverage", () => {
    const id = identifyChord(prof({ 0: 1, 4: 1, 7: 1 }), 0, 0.4);
    expect(id.symbol).toBe("C");
    expect(id.quality).toBe("maj");
    expect(id.coverage).toBeCloseTo(1, 5);
  });
  it("names an A-minor triad 'Am'", () => {
    expect(identifyChord(prof({ 9: 1, 0: 1, 4: 1 }), 9, 0.2).symbol).toBe("Am");
  });
  it("names a root+fourth (no third) 'sus4'", () => {
    expect(identifyChord(prof({ 0: 0.4, 5: 0.35, 7: 0.25 }), 0, 0.3).symbol).toBe("Csus4");
  });
});

describe("identifyChord — conservative extension escalation", () => {
  it("escalates to a dominant 7th when the b7 is salient", () => {
    expect(identifyChord(prof({ 0: 0.28, 4: 0.26, 7: 0.24, 10: 0.22 }), 0, 0.4).symbol).toBe("C7");
  });
  it("names a full major-7th", () => {
    expect(identifyChord(prof({ 0: 1, 4: 1, 7: 1, 11: 1 }), 0, 0.4).symbol).toBe("Cmaj7");
  });
  it("DROPS a weak passing 7th — stays a triad (the conservatism the ACE lit prescribes)", () => {
    const id = identifyChord(prof({ 0: 0.35, 4: 0.32, 7: 0.3, 10: 0.03 }), 0, 0.4);
    expect(id.symbol).toBe("C"); // the 3% b7 is an ornament, not a chord tone
  });
  it("names a fully-diminished 7th", () => {
    expect(identifyChord(prof({ 0: 0.25, 3: 0.25, 6: 0.25, 9: 0.25 }), 0, 0.3).symbol).toBe("Cdim7");
  });
  it("names a half-diminished 7th (m7b5)", () => {
    expect(identifyChord(prof({ 0: 0.3, 3: 0.3, 6: 0.25, 10: 0.15 }), 0, 0.3).symbol).toBe("Cm7b5");
  });
});

describe("identifyChord — confidence", () => {
  it("full coverage + clear root ⇒ high confidence", () => {
    const id = identifyChord(prof({ 0: 1, 4: 1, 7: 1 }), 0, 0.5);
    expect(id.confidence).toBeGreaterThan(0.6);
  });
  it("heavy non-chord weight ⇒ lower coverage ⇒ lower confidence", () => {
    // C triad but 40% of the weight is a chromatic Db (pc1).
    const id = identifyChord(prof({ 0: 0.2, 4: 0.2, 7: 0.2, 1: 0.4 }), 0, 0.1);
    expect(id.coverage).toBeCloseTo(0.6, 5);
    expect(id.confidence).toBeLessThan(0.4);
  });
  it("a silent profile is N/C with zero confidence", () => {
    const id = identifyChord(new Array<number>(12).fill(0), -1, 0);
    expect(id.symbol).toBe("N/C");
    expect(id.confidence).toBe(0);
  });
});
