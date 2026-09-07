// ─── FFT Tests ───────────────────────────────────────────────────────────────
//
// Every case here is a transform with a hand-checkable closed form, so a
// regression points at a specific defect rather than "the numbers moved".

import { describe, it, expect } from "vitest";
import { Fft, isPowerOfTwo, fftFrequencies } from "./fft.js";

describe("isPowerOfTwo", () => {
  it("accepts powers of two", () => {
    for (const n of [1, 2, 4, 8, 512, 1024, 2048, 4096]) {
      expect(isPowerOfTwo(n)).toBe(true);
    }
  });

  it("rejects non-powers, zero, negatives and fractions", () => {
    for (const n of [0, 3, 6, 100, 1000, -8, 2.5]) {
      expect(isPowerOfTwo(n)).toBe(false);
    }
  });
});

describe("Fft construction", () => {
  it("rejects a non-power-of-two size with an actionable message", () => {
    expect(() => new Fft(1000)).toThrow(/power of two/i);
    expect(() => new Fft(1000)).toThrow(/2048/);
  });

  it("reports binCount as size / 2 + 1", () => {
    expect(new Fft(8).binCount).toBe(5);
    expect(new Fft(2048).binCount).toBe(1025);
  });
});

describe("Fft.magnitude", () => {
  it("puts all energy of a DC signal in bin 0", () => {
    const fft = new Fft(8);
    const mag = fft.magnitude(new Float64Array(8).fill(1));

    // DFT of N ones is [N, 0, 0, …].
    expect(mag[0]).toBeCloseTo(8, 10);
    for (let k = 1; k < mag.length; k++) {
      expect(mag[k]).toBeCloseTo(0, 10);
    }
  });

  it("spreads an impulse flat across every bin", () => {
    const fft = new Fft(8);
    const impulse = new Float64Array(8);
    impulse[0] = 1;
    const mag = fft.magnitude(impulse);

    // DFT of a unit impulse at n=0 is 1 everywhere.
    for (let k = 0; k < mag.length; k++) {
      expect(mag[k]).toBeCloseTo(1, 10);
    }
  });

  it("puts a bin-aligned cosine in exactly that bin, at N/2", () => {
    const N = 8;
    const k0 = 2;
    const fft = new Fft(N);
    const x = new Float64Array(N);
    for (let n = 0; n < N; n++) {
      x[n] = Math.cos((2 * Math.PI * k0 * n) / N);
    }
    const mag = fft.magnitude(x);

    // A real cosine splits its energy between +k and −k, so the one-sided
    // magnitude at k0 is N/2.
    expect(mag[k0]).toBeCloseTo(N / 2, 10);
    for (let k = 0; k < mag.length; k++) {
      if (k !== k0) expect(mag[k]).toBeCloseTo(0, 10);
    }
  });

  it("returns binCount values", () => {
    const fft = new Fft(64);
    expect(fft.magnitude(new Float64Array(64)).length).toBe(33);
  });

  it("zero-pads a frame shorter than the transform", () => {
    const fft = new Fft(8);
    // Four ones padded to eight is not the same as eight ones: DC becomes 4.
    const mag = fft.magnitude(new Float64Array(4).fill(1));
    expect(mag[0]).toBeCloseTo(4, 10);
  });

  it("rejects a frame longer than the transform", () => {
    const fft = new Fft(8);
    expect(() => fft.magnitude(new Float64Array(16))).toThrow(/does not fit/i);
  });
});

describe("Fft.power", () => {
  it("equals magnitude squared", () => {
    const N = 16;
    const fft = new Fft(N);
    const x = new Float64Array(N);
    for (let n = 0; n < N; n++) x[n] = Math.sin(n) + 0.5 * Math.cos(3 * n);

    const mag = fft.magnitude(x);
    const pow = fft.power(x);

    for (let k = 0; k < mag.length; k++) {
      expect(pow[k]).toBeCloseTo(mag[k]! * mag[k]!, 8);
    }
  });
});

describe("Fft.transform", () => {
  it("rejects mismatched buffer lengths", () => {
    const fft = new Fft(8);
    expect(() => fft.transform(new Float64Array(4), new Float64Array(8)))
      .toThrow(/length mismatch/i);
  });
});

describe("Fft.inverse", () => {
  it("round-trips a real cosine through transform then inverse", () => {
    const N = 16;
    const k0 = 3;
    const fft = new Fft(N);
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let n = 0; n < N; n++) {
      re[n] = Math.cos((2 * Math.PI * k0 * n) / N);
    }
    const original = Float64Array.from(re);

    fft.transform(re, im);
    fft.inverse(re, im);

    for (let n = 0; n < N; n++) {
      expect(re[n]).toBeCloseTo(original[n]!, 10);
      expect(im[n]).toBeCloseTo(0, 10);
    }
  });

  it("turns a spectrum of all ones into an impulse of amplitude 1", () => {
    // IFFT of [1, 1, …, 1] is δ[n], which is the pair of the unnormalised
    // forward convention (DFT of [1, 1, …, 1] is [N, 0, …, 0]).
    const N = 8;
    const fft = new Fft(N);
    const re = new Float64Array(N).fill(1);
    const im = new Float64Array(N);
    fft.inverse(re, im);
    expect(re[0]).toBeCloseTo(1, 10);
    for (let n = 1; n < N; n++) expect(re[n]).toBeCloseTo(0, 10);
    for (let n = 0; n < N; n++) expect(im[n]).toBeCloseTo(0, 10);
  });

  it("rejects mismatched buffer lengths", () => {
    const fft = new Fft(8);
    expect(() => fft.inverse(new Float64Array(4), new Float64Array(8)))
      .toThrow(/length mismatch/i);
  });
});

describe("fftFrequencies", () => {
  it("spans DC to Nyquist inclusive", () => {
    const f = fftFrequencies(44100, 2048);
    expect(f.length).toBe(1025);
    expect(f[0]).toBe(0);
    expect(f[1024]).toBeCloseTo(22050, 6);
  });

  it("spaces bins at sampleRate / nFft", () => {
    const f = fftFrequencies(44100, 2048);
    expect(f[1]! - f[0]!).toBeCloseTo(44100 / 2048, 10);
  });
});
