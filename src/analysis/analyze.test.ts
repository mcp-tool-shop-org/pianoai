import { describe, it, expect } from "vitest";
import { analyzeHarmony } from "./analyze.js";
import type { Measure, SongEntry } from "../songs/types.js";

function song(measures: Measure[], over: Partial<SongEntry> = {}): SongEntry {
  return {
    id: "t",
    title: "T",
    genre: "classical",
    difficulty: "beginner",
    key: "C major",
    tempo: 120,
    timeSignature: "4/4",
    durationSeconds: 10,
    musicalLanguage: { description: "", structure: "", keyMoments: [], teachingGoals: [], styleTips: [] },
    measures,
    tags: [],
    ...over,
  };
}

describe("analyzeHarmony", () => {
  it("produces a per-measure chord view (C then G)", () => {
    const s = song([
      { number: 1, leftHand: "C3+E3+G3:w", rightHand: "R:w" },
      { number: 2, leftHand: "G2+B2+D3:w", rightHand: "R:w" },
    ]);
    const a = analyzeHarmony(s);
    expect(a.perMeasure.map((p) => p.symbol)).toEqual(["C", "G"]);
    expect(a.perMeasure.every((p) => p.confidence > 0)).toBe(true);
  });

  it("merges same-symbol segments into spans on a contiguous timeline", () => {
    const s = song([
      { number: 1, leftHand: "C3+E3+G3:w", rightHand: "R:w" },
      { number: 2, leftHand: "G2+B2+D3:w", rightHand: "R:w" },
    ]);
    const a = analyzeHarmony(s);
    expect(a.spans.map((sp) => sp.symbol)).toEqual(["C", "G"]);
    expect(a.spans[0]).toMatchObject({ startBeat: 0, endBeat: 4, segments: 4 });
    expect(a.spans[1]).toMatchObject({ startBeat: 4, endBeat: 8, segments: 4 });
  });

  it("resolves harmonic rhythm — two chords inside one measure", () => {
    const s = song([{ number: 1, leftHand: "C3+E3+G3:h G2+B2+D3:h", rightHand: "R:w" }]);
    const a = analyzeHarmony(s);
    // The harmonic rhythm (the real value) is in the beat-resolution spans.
    expect(a.spans.map((sp) => sp.symbol)).toEqual(["C", "G"]);
    expect(a.spans[0]).toMatchObject({ startBeat: 0, endBeat: 2 });
    expect(a.spans[1]).toMatchObject({ startBeat: 2, endBeat: 4 });
    // The per-measure view is a single lossy summary of a two-chord bar — it
    // must name a real chord present in the bar, not go silent.
    expect(a.perMeasure).toHaveLength(1);
    expect(a.perMeasure[0].symbol).not.toBe("N/C");
  });

  it("honors a measure range while keeping absolute beat positions", () => {
    const s = song([
      { number: 1, leftHand: "C3+E3+G3:w", rightHand: "R:w" },
      { number: 2, leftHand: "G2+B2+D3:w", rightHand: "R:w" },
    ]);
    const a = analyzeHarmony(s, { measureRange: [2, 2] });
    expect(a.perMeasure).toHaveLength(1);
    expect(a.perMeasure[0]).toMatchObject({ measure: 2, symbol: "G" });
    expect(a.spans).toHaveLength(1);
    expect(a.spans[0]).toMatchObject({ symbol: "G", startBeat: 4, endBeat: 8 });
  });

  it("labels a silent measure N/C", () => {
    const s = song([{ number: 1, leftHand: "R:w", rightHand: "R:w" }]);
    const a = analyzeHarmony(s);
    expect(a.perMeasure[0].symbol).toBe("N/C");
    expect(a.spans[0].symbol).toBe("N/C");
  });

  it("segmentation:'hcdf' groups an arpeggio that beat-mode fragments (the mechanism)", () => {
    // A bare C-major arpeggio: beat-mode roots each single-note beat separately
    // (C, E, G, C → 4 spans); HCDF's smoothed change function sees one stable
    // C-major region → one span. (This is the mechanism; the reference
    // measurement shows it costs block-chord boundary precision — see the
    // receipt. Default stays "beat".)
    const s = song([{ number: 1, leftHand: "C3:q E3:q G3:q C4:q", rightHand: "R:w" }]);
    const beat = analyzeHarmony(s, { segmentation: "beat" });
    const hcdf = analyzeHarmony(s, { segmentation: "hcdf", hcdfSmooth: 2 });
    expect(beat.spans.length).toBeGreaterThan(1);
    expect(hcdf.spans.length).toBeLessThan(beat.spans.length);
    expect(hcdf.spans).toHaveLength(1);
    expect(hcdf.spans[0].root).toBe(0); // roots the whole region on C
  });
});
