// ─── Mel Scale and Filterbank Tests ──────────────────────────────────────────
//
// The exact constants here are the guard against silently switching between the
// librosa and torchaudio conventions, which is a filed real-world bug class.
// The Slaney break at 1 kHz landing on exactly 15.0 mel is the single most
// diagnostic value: it is a whole number only in the Slaney formula.
//
// One test states the limitation the whole architecture rests on: a 50-cent
// error at C4 is a fraction of one mel filter's width, so mel cannot be the
// pitch gate. If that test ever fails, the study's finding 17 is wrong and the
// CQT-primary decision should be revisited.

import { describe, it, expect } from "vitest";
import {
  hzToMel,
  melToHz,
  melFrequencies,
  melFilterbank,
  applyFilterbank,
} from "./mel.js";

describe("hzToMel / melToHz — Slaney", () => {
  it("maps 0 Hz to 0 mel", () => {
    expect(hzToMel(0)).toBeCloseTo(0, 12);
  });

  it("maps the 1 kHz breakpoint to exactly 15 mel", () => {
    expect(hzToMel(1000)).toBeCloseTo(15.0, 10);
  });

  it("is linear below 1 kHz at 200/3 Hz per mel", () => {
    // 500 Hz / (200/3) = 7.5 mel.
    expect(hzToMel(500)).toBeCloseTo(7.5, 10);
    expect(hzToMel(200)).toBeCloseTo(3.0, 10);
    // Equal frequency steps give equal mel steps in this region.
    expect(hzToMel(400) - hzToMel(300)).toBeCloseTo(hzToMel(300) - hzToMel(200), 10);
  });

  it("is logarithmic above 1 kHz", () => {
    // Equal frequency steps give SHRINKING mel steps once past the break.
    const lower = hzToMel(3000) - hzToMel(2000);
    const upper = hzToMel(5000) - hzToMel(4000);
    expect(upper).toBeLessThan(lower);
  });

  it("round-trips across the breakpoint", () => {
    for (const hz of [0, 100, 440, 999, 1000, 1001, 4000, 11025, 22050]) {
      expect(melToHz(hzToMel(hz))).toBeCloseTo(hz, 6);
    }
  });
});

describe("hzToMel / melToHz — HTK", () => {
  it("maps 0 Hz to 0 mel", () => {
    expect(hzToMel(0, "htk")).toBeCloseTo(0, 12);
  });

  it("follows 2595·log10(1 + f/700)", () => {
    expect(hzToMel(1000, "htk")).toBeCloseTo(1000.65, 1);
    expect(hzToMel(700, "htk")).toBeCloseTo(2595 * Math.log10(2), 8);
  });

  it("round-trips", () => {
    for (const hz of [0, 100, 440, 1000, 4000, 22050]) {
      expect(melToHz(hzToMel(hz, "htk"), "htk")).toBeCloseTo(hz, 6);
    }
  });

  it("disagrees with Slaney, which is why both are exposed", () => {
    expect(hzToMel(1000, "htk")).not.toBeCloseTo(hzToMel(1000, "slaney"), 1);
  });
});

describe("the limitation that makes mel the secondary surface", () => {
  it("cannot resolve a 50-cent error at C4 within one filter step", () => {
    const c4 = 261.6255653;
    const fiftyCentsSharp = c4 * Math.pow(2, 50 / 1200);

    // The pitch error in Hz is tiny compared with the 200/3 Hz mel step.
    const errorHz = fiftyCentsSharp - c4;
    expect(errorHz).toBeGreaterThan(7);
    expect(errorHz).toBeLessThan(8);

    // Expressed in mel, the whole error is a small fraction of one step.
    const errorMel = hzToMel(fiftyCentsSharp) - hzToMel(c4);
    expect(errorMel).toBeLessThan(0.2);
  });
});

describe("melFrequencies", () => {
  it("spans fmin to fmax inclusive", () => {
    const f = melFrequencies(10, 0, 8000);
    expect(f.length).toBe(10);
    expect(f[0]).toBeCloseTo(0, 8);
    expect(f[9]).toBeCloseTo(8000, 6);
  });

  it("increases monotonically", () => {
    const f = melFrequencies(64, 30, 11025);
    for (let i = 1; i < f.length; i++) {
      expect(f[i]).toBeGreaterThan(f[i - 1]!);
    }
  });

  it("needs at least two points", () => {
    expect(() => melFrequencies(1, 0, 8000)).toThrow(/at least 2/i);
  });
});

describe("melFilterbank", () => {
  const base = { sampleRate: 44100, nFft: 2048 };

  it("has nMels rows of binCount weights", () => {
    const fb = melFilterbank({ ...base, nMels: 229 });
    expect(fb.nMels).toBe(229);
    expect(fb.binCount).toBe(1025);
    expect(fb.weights.length).toBe(229 * 1025);
    expect(fb.centerFrequencies.length).toBe(229);
  });

  it("produces only non-negative weights", () => {
    const fb = melFilterbank({ ...base, nMels: 40 });
    for (let i = 0; i < fb.weights.length; i++) {
      expect(fb.weights[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it("orders band centres ascending", () => {
    const fb = melFilterbank({ ...base, nMels: 40 });
    for (let m = 1; m < fb.nMels; m++) {
      expect(fb.centerFrequencies[m]).toBeGreaterThan(fb.centerFrequencies[m - 1]!);
    }
  });

  it("caps unnormalised triangles at 1.0", () => {
    const fb = melFilterbank({ ...base, nMels: 40, norm: null });
    for (let i = 0; i < fb.weights.length; i++) {
      expect(fb.weights[i]).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it("makes narrow low bands taller than wide high bands under Slaney norm", () => {
    const fb = melFilterbank({ ...base, nMels: 40, norm: "slaney" });
    const rowMax = (m: number): number => {
      let max = 0;
      for (let k = 0; k < fb.binCount; k++) {
        const w = fb.weights[m * fb.binCount + k]!;
        if (w > max) max = w;
      }
      return max;
    };
    // Slaney normalisation divides by bandwidth, so the narrowest (lowest)
    // band peaks highest. This is the property torchaudio's default lacks.
    expect(rowMax(0)).toBeGreaterThan(rowMax(fb.nMels - 1));
  });

  it("records its resolved parameters for the render sidecar", () => {
    const fb = melFilterbank({ ...base, nMels: 229, fmin: 30, fmax: 11025 });
    expect(fb.params.melScale).toBe("slaney");
    expect(fb.params.norm).toBe("slaney");
    expect(fb.params.fmin).toBe(30);
    expect(fb.params.fmax).toBe(11025);
    expect(fb.params.nFft).toBe(2048);
  });

  it("rejects an fmax above Nyquist with an actionable message", () => {
    expect(() => melFilterbank({ ...base, fmax: 30000 })).toThrow(/Nyquist/i);
  });

  it("rejects an inverted frequency range", () => {
    expect(() => melFilterbank({ ...base, fmin: 8000, fmax: 1000 }))
      .toThrow(/greater than/i);
  });

  it("rejects a non-positive band count", () => {
    expect(() => melFilterbank({ ...base, nMels: 0 })).toThrow(/positive integer/i);
  });
});

describe("applyFilterbank", () => {
  it("returns one value per mel band", () => {
    const fb = melFilterbank({ sampleRate: 44100, nFft: 2048, nMels: 40 });
    const spectrum = new Float64Array(fb.binCount).fill(1);
    expect(applyFilterbank(fb, spectrum).length).toBe(40);
  });

  it("gives positive energy for a flat spectrum", () => {
    const fb = melFilterbank({ sampleRate: 44100, nFft: 2048, nMels: 40 });
    const bands = applyFilterbank(fb, new Float64Array(fb.binCount).fill(1));
    for (let m = 0; m < bands.length; m++) {
      expect(bands[m]).toBeGreaterThan(0);
    }
  });

  it("gives zero for a silent spectrum", () => {
    const fb = melFilterbank({ sampleRate: 44100, nFft: 2048, nMels: 40 });
    const bands = applyFilterbank(fb, new Float64Array(fb.binCount));
    for (let m = 0; m < bands.length; m++) {
      expect(bands[m]).toBe(0);
    }
  });

  it("concentrates a single-bin spike in the bands covering it", () => {
    const fb = melFilterbank({ sampleRate: 44100, nFft: 2048, nMels: 40 });
    const spectrum = new Float64Array(fb.binCount);
    // Bin 46 of 1025 at 44.1 kHz is ≈ 990 Hz.
    spectrum[46] = 1;
    const bands = applyFilterbank(fb, spectrum);

    const active = Array.from(bands).filter((v) => v > 0);
    // A triangular bank overlaps by one, so a single bin lights a couple of
    // adjacent bands and nothing else.
    expect(active.length).toBeGreaterThan(0);
    expect(active.length).toBeLessThanOrEqual(3);
  });

  it("rejects a spectrum built for a different n_fft", () => {
    const fb = melFilterbank({ sampleRate: 44100, nFft: 2048, nMels: 40 });
    expect(() => applyFilterbank(fb, new Float64Array(513)))
      .toThrow(/different n_fft/i);
  });
});
