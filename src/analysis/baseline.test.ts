import { describe, it, expect } from "vitest";
import { baselineLeftHand, baselinePooledBothHands } from "./baseline.js";
import type { Measure, SongEntry } from "../songs/types.js";

function song(measures: Measure[]): SongEntry {
  return {
    id: "t", title: "T", genre: "classical", difficulty: "beginner", key: "C major",
    tempo: 120, timeSignature: "4/4", durationSeconds: 10,
    musicalLanguage: { description: "", structure: "", keyMoments: [], teachingGoals: [], styleTips: [] },
    measures, tags: [],
  };
}

describe("baseline (the incumbent pooled inferChord)", () => {
  it("baselineLeftHand reproduces the current jam-brief behavior (left hand only)", () => {
    const s = song([
      { number: 1, leftHand: "C3:q E3:q G3:q", rightHand: "R:w" },
      { number: 2, leftHand: "G2:q B2:q D3:q F3:q", rightHand: "R:w" },
    ]);
    expect(baselineLeftHand(s)).toEqual([
      { measure: 1, symbol: "C" },
      { measure: 2, symbol: "G7" },
    ]);
  });

  it("baselinePooledBothHands pools both hands (differs when the RH changes the harmony)", () => {
    const s = song([{ number: 1, leftHand: "C3:q", rightHand: "Eb4:q G4:q" }]);
    // Left hand alone is just a C; pooling in the RH's Eb + G makes it C minor.
    expect(baselineLeftHand(s)[0].symbol).toBe("C");
    expect(baselinePooledBothHands(s)[0].symbol).toBe("Cm");
  });
});
