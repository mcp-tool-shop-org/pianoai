import { describe, it, expect } from "vitest";
import {
  keyConsistency,
  spansToWeightedRoots,
  labelsToWeightedRoots,
  harmonicRhythm,
} from "./proxies.js";
import type { ChordSpan, HarmonicAnalysis } from "./types.js";

describe("keyConsistency", () => {
  it("duration-weighted fraction of roots diatonic to the key", () => {
    // C, G, A are in C major; C# is not. Equal durations ⇒ 3/4.
    const items = [
      { root: 0, durBeats: 1 },
      { root: 7, durBeats: 1 },
      { root: 9, durBeats: 1 },
      { root: 1, durBeats: 1 },
    ];
    const kc = keyConsistency(items, "C major");
    expect(kc.inKey).toBe(3);
    expect(kc.total).toBe(4);
    expect(kc.ratio).toBeCloseTo(0.75, 6);
  });

  it("excludes no-chord roots (negative)", () => {
    const kc = keyConsistency([{ root: -1, durBeats: 5 }, { root: 0, durBeats: 1 }], "C major");
    expect(kc.total).toBe(1);
    expect(kc.ratio).toBe(1);
  });

  it("flags an unparseable key", () => {
    const kc = keyConsistency([{ root: 0, durBeats: 1 }], "nonsense");
    expect(kc.keyUnparseable).toBe(true);
    expect(kc.ratio).toBe(0);
  });

  it("converts spans and symbol-labels to weighted roots", () => {
    const spans = [{ root: 0, startBeat: 0, endBeat: 2 }] as ChordSpan[];
    expect(spansToWeightedRoots(spans)).toEqual([{ root: 0, durBeats: 2 }]);
    expect(labelsToWeightedRoots([{ symbol: "Am7", durBeats: 4 }, { symbol: "N/C", durBeats: 1 }])).toEqual([
      { root: 9, durBeats: 4 },
      { root: -1, durBeats: 1 },
    ]);
  });
});

describe("harmonicRhythm", () => {
  it("computes chords-per-measure and mean span length", () => {
    const analysis = {
      spans: [
        { root: 0, startBeat: 0, endBeat: 4 },
        { root: 7, startBeat: 4, endBeat: 8 },
        { root: -1, startBeat: 8, endBeat: 12 }, // a no-chord span (not counted)
      ] as ChordSpan[],
      perMeasure: [{ measure: 1 }, { measure: 2 }, { measure: 3 }],
    } as HarmonicAnalysis;
    const hr = harmonicRhythm(analysis);
    expect(hr.chordSpans).toBe(2);
    expect(hr.measures).toBe(3);
    expect(hr.chordsPerMeasure).toBeCloseTo(2 / 3, 6);
    expect(hr.meanSpanBeats).toBe(4);
  });
});
