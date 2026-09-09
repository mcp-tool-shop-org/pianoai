// ─── SuperFlux Onset Tests ───────────────────────────────────────────────────
//
// Two properties have to survive: times come out in seconds, and both the
// 40 ms house gate and the 50 ms mir_eval convention are scored. The vibrato
// comparison is the reason SuperFlux exists; it runs on a CQT because that
// is the surface where a 50-cent wobble actually leaves its bin.

import { describe, it, expect } from "vitest";
import {
  HOUSE_TOLERANCE_MS,
  MIR_EVAL_TOLERANCE_MS,
  ONSET_DETECTOR_CAVEAT,
  maxFilterFrame,
  superfluxNovelty,
  spectralFluxNovelty,
  detectOnsets,
  scoreOnsets,
} from "./onsets.js";
import { clickTrain, vibratoNote, sine } from "./fixtures.js";
import { cqt } from "./cqt.js";

const SR = 44100;

describe("named tolerances", () => {
  it("are 40 ms in-house and 50 ms mir_eval", () => {
    expect(HOUSE_TOLERANCE_MS).toBe(40);
    expect(MIR_EVAL_TOLERANCE_MS).toBe(50);
  });
});

describe("maxFilterFrame", () => {
  it("with width 3, bin k sees the max of k−1, k, k+1", () => {
    const row = [1, 3, 2, 8, 0];
    const out = maxFilterFrame(row, 3);
    expect(Array.from(out)).toEqual([3, 3, 8, 8, 8]);
  });

  it("with width 1 is a copy — that is plain flux's neighbourhood", () => {
    const row = [1, 4, 2];
    expect(Array.from(maxFilterFrame(row, 1))).toEqual([1, 4, 2]);
  });
});

describe("scoreOnsets", () => {
  it("reports both tolerances and a perfect F1 when every click is exact", () => {
    const times = [0.5, 1.0, 1.5];
    const scores = scoreOnsets(times, times);
    expect(scores.map((s) => s.toleranceMs)).toEqual([
      HOUSE_TOLERANCE_MS,
      MIR_EVAL_TOLERANCE_MS,
    ]);
    for (const s of scores) {
      expect(s.f1).toBe(1);
      expect(s.matched).toBe(3);
      expect(s.falsePositives).toBe(0);
      expect(s.falseNegatives).toBe(0);
    }
  });

  it("counts a 45 ms miss as a hit at 50 ms and a miss at 40 ms", () => {
    const scores = scoreOnsets([0.545], [0.5]);
    const at40 = scores.find((s) => s.toleranceMs === 40)!;
    const at50 = scores.find((s) => s.toleranceMs === 50)!;
    expect(at40.matched).toBe(0);
    expect(at50.matched).toBe(1);
  });

  it("is 0/0/0 on two empty lists rather than NaN", () => {
    const [s] = scoreOnsets([], [], [40]);
    expect(s!.f1).toBe(0);
    expect(s!.precision).toBe(0);
    expect(s!.recall).toBe(0);
  });
});

describe("detectOnsets", () => {
  it("returns times in seconds, not frame indices, and carries the caveat", () => {
    const times = [0.4, 0.9, 1.4];
    const samples = clickTrain({ times, duration: 2, sampleRate: SR });
    const result = detectOnsets(samples, { sampleRate: SR });
    expect(result.caveat).toBe(ONSET_DETECTOR_CAVEAT);
    expect(result.onsets.length).toBeGreaterThan(0);
    for (const onset of result.onsets) {
      expect(onset.time).toBeGreaterThanOrEqual(0);
      expect(onset.time).toBeLessThan(2.1);
      // A frame index of 0.4 s at hop 512 would be ~34; we want seconds.
      expect(onset.time).toBeLessThan(5);
    }
  });

  it("finds a click train within the 40 ms house tolerance", () => {
    const times = [0.5, 1.0, 1.5];
    const samples = clickTrain({ times, duration: 2, sampleRate: SR });
    const result = detectOnsets(samples, { sampleRate: SR });
    const detected = result.onsets.map((o) => o.time);
    const [house, mir] = scoreOnsets(detected, times);
    expect(house!.toleranceMs).toBe(40);
    expect(mir!.toleranceMs).toBe(50);
    expect(house!.recall).toBeGreaterThan(0.5);
  });

  it("rejects an even maxFilterBins and says to use 3 or 1", () => {
    expect(() => detectOnsets(new Float64Array(2048), {
      sampleRate: SR, maxFilterBins: 2,
    })).toThrow(/odd integer/i);
  });
});

describe("SuperFlux vs plain flux on vibrato", () => {
  it("fires less on a 50-cent vibrato than plain flux, on a CQT", () => {
    // 50 cents at 60 bins/octave is 2.5 bins, so the max-filter neighbourhood
    // of 3 bins actually sees the wobble. On 229 Slaney mels the same wobble
    // is in-bin below ~2 kHz and this comparison would be a wash — that is
    // why the proof uses the CQT, via TimeFrequencyData.
    const note = vibratoNote({
      frequency: 440, duration: 1.0, sampleRate: SR, rateHz: 5, depthCents: 50,
    });
    const spec = cqt(note, {
      sampleRate: SR, fmin: 220, binsPerOctave: 60, octaves: 2, hopLength: 512,
    });
    const superflux = superfluxNovelty(spec, 3);
    const plain = spectralFluxNovelty(spec);

    // Skip the attack; compare energy in the sustained vibrato.
    const skip = 20;
    let superSum = 0;
    let plainSum = 0;
    for (let t = skip; t < superflux.length; t++) {
      superSum += superflux[t]!;
      plainSum += plain[t]!;
    }
    expect(plainSum).toBeGreaterThan(0);
    expect(superSum).toBeLessThan(plainSum);
  });

  it("does not treat a steady sine as a stream of onsets", () => {
    const note = sine({ frequency: 440, duration: 1.0, sampleRate: SR });
    const result = detectOnsets(note, { sampleRate: SR });
    // A single attack at t≈0 is allowed; the rest of a steady pitch is not.
    const later = result.onsets.filter((o) => o.time > 0.1);
    expect(later.length).toBeLessThanOrEqual(1);
  });
});
