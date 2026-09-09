// ─── Constant-Q Transform Tests ──────────────────────────────────────────────
//
// The load-bearing property is the one the CQT-primary decision rests on:
// at 60 bins per octave, a 50-cent error is 2.5 bins. If that mapping ever
// drifts, the picture no longer shows the 50-cent gate and the study lock
// is wrong.
//
// The actual transform tests use a raised fmin (A3) and two octaves so a
// 32 k-point kernel FFT is enough. Default C1 / 7 octaves is a 131 k-point
// FFT and belongs to a later golden-parity pass, not this file.

import { describe, it, expect } from "vitest";
import {
  C1_HZ,
  KERNEL_SPARSITY,
  qFactor,
  binToMidi,
  midiToBin,
  cqtBinFrequencies,
  cqtKernels,
  cqt,
} from "./cqt.js";
import { sine } from "./fixtures.js";
import { isPowerOfTwo } from "./fft.js";

const SR = 44100;
const A4 = 69;
const A3_HZ = 220;
const OPTS = {
  sampleRate: SR,
  fmin: A3_HZ,
  binsPerOctave: 60,
  octaves: 2,
  hopLength: 512,
};

describe("qFactor", () => {
  it("is 1 / (2^(1/B) − 1)", () => {
    expect(qFactor(12)).toBeCloseTo(1 / (Math.pow(2, 1 / 12) - 1), 10);
    expect(qFactor(60)).toBeCloseTo(1 / (Math.pow(2, 1 / 60) - 1), 10);
  });

  it("is about 86.1 at 60 bins per octave — the C1-smearing number", () => {
    expect(qFactor(60)).toBeCloseTo(86.1, 1);
  });
});

describe("C1_HZ", () => {
  it("is MIDI 24 on the A4=440 axis", () => {
    expect(C1_HZ).toBeCloseTo(440 * Math.pow(2, (24 - 69) / 12), 12);
    expect(C1_HZ).toBeCloseTo(32.703195, 5);
  });
});

describe("binToMidi / midiToBin", () => {
  const opts = { sampleRate: SR, fmin: C1_HZ, binsPerOctave: 60, octaves: 7 };

  it("puts C1 at bin 0", () => {
    expect(midiToBin(24, opts)).toBeCloseTo(0, 10);
    expect(binToMidi(0, opts)).toBeCloseTo(24, 10);
  });

  it("puts A4 5 bins per semitone above C1", () => {
    // 69 − 24 = 45 semitones × 5 bins = 225.
    expect(midiToBin(A4, opts)).toBeCloseTo(225, 10);
    expect(binToMidi(225, opts)).toBeCloseTo(A4, 10);
  });

  it("a 50-cent-sharp A4 lands 2.5 bins above the A4 bin", () => {
    // THIS is the property the CQT-primary decision rests on.
    const a4bin = midiToBin(A4, opts);
    const sharpBin = midiToBin(A4 + 0.5, opts);
    expect(sharpBin - a4bin).toBeCloseTo(2.5, 10);
  });

  it("round-trips MIDI numbers across the default range", () => {
    for (const midi of [24, 36, 60, 69, 81, 108]) {
      expect(binToMidi(midiToBin(midi, opts), opts)).toBeCloseTo(midi, 10);
    }
  });

  it("scales: 12 bins per octave puts a semitone in one bin", () => {
    const coarse = { ...opts, binsPerOctave: 12 };
    expect(midiToBin(A4 + 1, coarse) - midiToBin(A4, coarse)).toBeCloseTo(1, 10);
  });
});

describe("cqtBinFrequencies", () => {
  it("starts at fmin and doubles every binsPerOctave steps", () => {
    const f = cqtBinFrequencies(OPTS);
    expect(f[0]).toBeCloseTo(A3_HZ, 10);
    expect(f[60]).toBeCloseTo(2 * A3_HZ, 10);
    expect(f.length).toBe(120);
  });
});

describe("cqtKernels", () => {
  it("records resolved params, including the sparsity constant", () => {
    const k = cqtKernels(OPTS);
    expect(k.params.fmin).toBe(A3_HZ);
    expect(k.params.binsPerOctave).toBe(60);
    expect(k.params.octaves).toBe(2);
    expect(k.params.sparsity).toBe(KERNEL_SPARSITY);
    expect(k.params.q).toBeCloseTo(qFactor(60), 12);
    expect(k.binCount).toBe(120);
  });

  it("uses an FFT length that is a power of two at least as long as the lowest kernel", () => {
    const k = cqtKernels(OPTS);
    expect(isPowerOfTwo(k.fftLength)).toBe(true);
    expect(k.fftLength).toBeGreaterThanOrEqual(k.lengths[0]!);
  });

  it("stores sparse kernels, not 120 full time-domain arrays", () => {
    const k = cqtKernels(OPTS);
    expect(k.nonzeroCount).toBeGreaterThan(0);
    expect(k.nonzeroCount).toBeLessThan(k.binCount * k.fftLength);
    expect(k.offsets.length).toBe(k.binCount + 1);
    expect(k.offsets[k.binCount]).toBe(k.nonzeroCount);
    expect(k.fftBins.length).toBe(k.nonzeroCount);
  });

  it("gives the lowest bin the longest kernel, the highest the shortest", () => {
    const k = cqtKernels(OPTS);
    expect(k.lengths[0]!).toBeGreaterThan(k.lengths[k.binCount - 1]!);
  });

  it("rejects a range that crosses Nyquist, and says what to change", () => {
    expect(() => cqtKernels({ sampleRate: 8000, fmin: 100, octaves: 8 }))
      .toThrow(/Nyquist/i);
  });
});

describe("cqt", () => {
  it("times frame t at t·hop / sampleRate", () => {
    const samples = sine({ frequency: 440, duration: 0.25, sampleRate: SR });
    const spec = cqt(samples, OPTS);
    expect(spec.frameTimes[0]).toBeCloseTo(0, 12);
    expect(spec.frameTimes[1]).toBeCloseTo(512 / SR, 12);
  });

  it("puts a 440 Hz tone in the A4 bin", () => {
    const samples = sine({ frequency: 440, duration: 0.5, sampleRate: SR });
    const spec = cqt(samples, { ...OPTS, hopLength: 1024 });
    const a4bin = Math.round(midiToBin(A4, OPTS));

    // A frame well inside the signal, away from the zero-padded edges.
    const t = Math.floor(spec.frameCount / 2);
    let peakBin = 0;
    let peak = -Infinity;
    for (let b = 0; b < spec.binCount; b++) {
      const v = spec.data[t * spec.binCount + b]!;
      if (v > peak) { peak = v; peakBin = b; }
    }
    expect(peakBin).toBe(a4bin);
  });

  it("puts a 50-cent-sharp A4 2.5 bins above the A4 bin in the transform itself", () => {
    const sharpHz = 440 * Math.pow(2, 50 / 1200);
    const samples = sine({ frequency: sharpHz, duration: 0.5, sampleRate: SR });
    const spec = cqt(samples, { ...OPTS, hopLength: 1024 });
    const a4bin = midiToBin(A4, OPTS);

    const t = Math.floor(spec.frameCount / 2);
    let peakBin = 0;
    let peak = -Infinity;
    for (let b = 0; b < spec.binCount; b++) {
      const v = spec.data[t * spec.binCount + b]!;
      if (v > peak) { peak = v; peakBin = b; }
    }
    // The peak is a discrete bin, so 62 or 63 both sit within one bin of 62.5.
    expect(Math.abs(peakBin - a4bin - 2.5)).toBeLessThan(1);
  });

  it("stamps hopLength from the call, not from the kernels", () => {
    const kernels = cqtKernels(OPTS);
    const samples = sine({ frequency: 440, duration: 0.2, sampleRate: SR });
    const spec = cqt(samples, { ...OPTS, hopLength: 1024 }, kernels);
    expect(spec.params.hopLength).toBe(1024);
    expect(spec.frameTimes[1]).toBeCloseTo(1024 / SR, 12);
  });

  it("rejects kernels built for a different fmin", () => {
    const kernels = cqtKernels(OPTS);
    const samples = sine({ frequency: 440, duration: 0.1, sampleRate: SR });
    expect(() => cqt(samples, { ...OPTS, fmin: 110 }, kernels))
      .toThrow(/rebuild/i);
  });
});
