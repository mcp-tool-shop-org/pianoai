// ─── analysis-sections.test.ts ────────────────────────────────────────────────
//
// Tests for scripts/analysis-sections.ts: per-measure feature vectors, the
// self-similarity/checkerboard-novelty section-boundary lens, the
// min-section-length guard, and the practice-segment framing.
//
// Fixtures were verified empirically against the actual implementation while
// building it — including a real off-by-one bug this process caught (the
// checkerboard kernel's peak index is the FIRST measure of the section it
// opens, not the last measure of the section before it; buildSections had it
// backwards until this was probed). See analysis-sections.ts's Peak
// interface comment for the corrected convention these tests rely on.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import type { Measure } from "../src/songs/types.js";
import { analyzeSections, toPracticeSegment } from "./analysis-sections.js";

function m(number: number, rightHand: string, leftHand: string): Measure {
  return { number, rightHand, leftHand };
}

describe("analyzeSections — boundary detection [60]", () => {
  it("places a boundary exactly at the seam of two homogeneous blocks with a texture+register change", () => {
    const measures: Measure[] = [];
    for (let i = 1; i <= 8; i++) measures.push(m(i, "C5:s D5:s E5:s F5:s G5:s A5:s B5:s C6:s", "C2:w"));
    for (let i = 9; i <= 16; i++) measures.push(m(i, "C4:w", "C2:s D2:s E2:s F2:s G2:s A2:s B2:s C3:s"));

    const result = analyzeSections(measures, "4/4");

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toMatchObject({ startMeasure: 1, endMeasure: 8, noveltyScore: 0 });
    expect(result.sections[1].startMeasure).toBe(9);
    expect(result.sections[1].endMeasure).toBe(16);
    expect(result.sections[1].noveltyScore).toBeGreaterThan(0);
  });

  it("finds no internal boundary in a fully homogeneous song (uniform novelty stays at/below 0)", () => {
    const measures: Measure[] = [];
    for (let i = 1; i <= 16; i++) measures.push(m(i, "C4:q E4:q G4:q C5:q", "C3:w"));

    const result = analyzeSections(measures, "4/4");

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toMatchObject({ startMeasure: 1, endMeasure: 16, noveltyScore: 0 });
  });

  it("every section's noveltyScore is the score of the peak that OPENS it, 0 for the first section", () => {
    const measures: Measure[] = [];
    for (let i = 1; i <= 8; i++) measures.push(m(i, "C5:s D5:s E5:s F5:s G5:s A5:s B5:s C6:s", "C2:w"));
    for (let i = 9; i <= 16; i++) measures.push(m(i, "C4:w", "C2:s D2:s E2:s F2:s G2:s A2:s B2:s C3:s"));

    const result = analyzeSections(measures, "4/4");
    expect(result.sections[0].noveltyScore).toBe(0);
    expect(result.sections[1].noveltyScore).toBeGreaterThan(0);
  });
});

describe("analyzeSections — min-section-length guard", () => {
  it("absorbs a too-short middle block rather than carving out a sliver section", () => {
    // A (8m, busy treble) / B (2m, a wholly different single sustained
    // pitch) / C (8m, back to the A-like pattern). Without the guard, two
    // boundaries would fire (A/B seam and B/C seam), creating a 2-measure
    // middle section — shorter than MIN_SECTION_LENGTH(4). The guard must
    // keep every resulting section at least 4 measures.
    const measures: Measure[] = [];
    for (let i = 1; i <= 8; i++) measures.push(m(i, "C5:s D5:s E5:s F5:s G5:s A5:s B5:s C6:s", "C2:w"));
    for (let i = 9; i <= 10; i++) measures.push(m(i, "F2:w", "F5:w"));
    for (let i = 11; i <= 18; i++) measures.push(m(i, "C5:s D5:s E5:s F5:s G5:s A5:s B5:s C6:s", "C2:w"));

    const result = analyzeSections(measures, "4/4");

    for (const s of result.sections) {
      const length = s.endMeasure - s.startMeasure + 1;
      expect(length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("analyzeSections — edge cases", () => {
  it("returns one honestly-labeled whole-song section for a song too short to have any internal boundary (<3 measures)", () => {
    const measures = [m(1, "C4:w", "C3:w"), m(2, "D4:w", "D3:w")];
    const result = analyzeSections(measures, "4/4");

    expect(result.sections).toEqual([{ startMeasure: 1, endMeasure: 2, noveltyScore: 0 }]);
    expect(result.practiceSegments).toHaveLength(1);
    expect(result.practiceSegments[0].note).toMatch(/No internal section boundary detected/);
  });

  it("returns empty sections and practiceSegments for a song with no measures at all", () => {
    const result = analyzeSections([], "4/4");
    expect(result).toEqual({ sections: [], practiceSegments: [] });
  });
});

describe("analyzeSections — practice-segment framing [61]", () => {
  it("phrases a detected section as a practice unit with correct length and boundary language", () => {
    const measures: Measure[] = [];
    for (let i = 1; i <= 8; i++) measures.push(m(i, "C5:s D5:s E5:s F5:s G5:s A5:s B5:s C6:s", "C2:w"));
    for (let i = 9; i <= 16; i++) measures.push(m(i, "C4:w", "C2:s D2:s E2:s F2:s G2:s A2:s B2:s C3:s"));

    const result = analyzeSections(measures, "4/4");

    expect(result.practiceSegments).toHaveLength(2);
    expect(result.practiceSegments[0]).toMatchObject({ startMeasure: 1, endMeasure: 8, lengthMeasures: 8 });
    expect(result.practiceSegments[0].note).toMatch(/Practice measures 1-8 \(8 measures\)/);
    expect(result.practiceSegments[1]).toMatchObject({ startMeasure: 9, endMeasure: 16, lengthMeasures: 8 });
  });

  it("singularizes the measure-count word for a 1-measure segment", () => {
    // A vacuous version of this test (asserting only inside `if
    // (oneMeasureSegment)`) used to live here — it could never fire:
    // MIN_SECTION_LENGTH (4) guarantees every section analyzeSections can
    // actually produce is >= 4 measures, so `lengthMeasures === 1` is
    // unreachable through the public entry point and the assertion always
    // silently no-opped, whether or not singularization was correct. Test
    // toPracticeSegment directly instead — it's exported specifically for this.
    const oneMeasure = toPracticeSegment({ startMeasure: 5, endMeasure: 5, noveltyScore: 1.2 }, false);
    expect(oneMeasure.lengthMeasures).toBe(1);
    expect(oneMeasure.note).toContain("1 measure)");
    expect(oneMeasure.note).not.toContain("1 measures)");

    const twoMeasures = toPracticeSegment({ startMeasure: 5, endMeasure: 6, noveltyScore: 1.2 }, false);
    expect(twoMeasures.lengthMeasures).toBe(2);
    expect(twoMeasures.note).toContain("2 measures)");
  });
});

describe("analyzeSections — determinism", () => {
  it("is byte-identical across repeated calls on the same input", () => {
    const measures: Measure[] = [];
    for (let i = 1; i <= 12; i++) measures.push(m(i, `C${4 + (i % 3)}:q E4:q G4:q C5:q`, "C3:w"));

    const first = analyzeSections(measures, "3/4");
    const second = analyzeSections(measures, "3/4");
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
