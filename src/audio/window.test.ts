// ─── Window Tests ────────────────────────────────────────────────────────────
//
// The periodic-vs-symmetric distinction is the whole point of these tests. A
// symmetric Hann of length 4 is [0, 0.75, 0.75, 0], a periodic one is
// [0, 0.5, 1, 0.5]. Only the second matches librosa, so the exact values below
// are the guard against silently switching conventions.

import { describe, it, expect } from "vitest";
import { hann, hamming, blackman, rectangular, window } from "./window.js";

describe("hann", () => {
  it("is periodic, not symmetric", () => {
    const w = hann(4);
    expect(w[0]).toBeCloseTo(0, 12);
    expect(w[1]).toBeCloseTo(0.5, 12);
    expect(w[2]).toBeCloseTo(1, 12);
    expect(w[3]).toBeCloseTo(0.5, 12);

    // The symmetric form would end on 0; the periodic form does not.
    expect(w[3]).not.toBeCloseTo(0, 6);
  });

  it("peaks at 1 in the middle and starts at 0", () => {
    const w = hann(1024);
    expect(w[0]).toBeCloseTo(0, 12);
    expect(w[512]).toBeCloseTo(1, 12);
  });

  it("stays within [0, 1]", () => {
    const w = hann(256);
    for (let i = 0; i < w.length; i++) {
      expect(w[i]).toBeGreaterThanOrEqual(0);
      expect(w[i]).toBeLessThanOrEqual(1);
    }
  });
});

describe("hamming", () => {
  it("starts at 0.08 and peaks at 1.0", () => {
    const w = hamming(4);
    expect(w[0]).toBeCloseTo(0.08, 12);
    expect(w[2]).toBeCloseTo(1.0, 12);
  });

  it("never reaches zero", () => {
    const w = hamming(128);
    for (let i = 0; i < w.length; i++) {
      expect(w[i]).toBeGreaterThan(0);
    }
  });
});

describe("blackman", () => {
  it("starts at 0 and peaks at 1.0", () => {
    const w = blackman(4);
    expect(w[0]).toBeCloseTo(0, 12);
    expect(w[2]).toBeCloseTo(1.0, 12);
  });
});

describe("rectangular", () => {
  it("is all ones", () => {
    const w = rectangular(8);
    expect(Array.from(w)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });
});

describe("window", () => {
  it("dispatches by name", () => {
    expect(Array.from(window("hann", 4))).toEqual(Array.from(hann(4)));
    expect(Array.from(window("hamming", 4))).toEqual(Array.from(hamming(4)));
    expect(Array.from(window("blackman", 4))).toEqual(Array.from(blackman(4)));
    expect(Array.from(window("rectangular", 4))).toEqual(Array.from(rectangular(4)));
  });

  it("rejects an unknown name and lists the valid ones", () => {
    // Cast: the point of the test is the runtime guard behind the type.
    expect(() => window("mystery" as never, 4)).toThrow(/hann, hamming/);
  });

  it("rejects a non-positive or fractional length", () => {
    for (const bad of [0, -4, 2.5]) {
      expect(() => hann(bad)).toThrow(/positive integer/i);
    }
  });
});
