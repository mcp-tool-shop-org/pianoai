// ─── Decibel Scaling Tests ───────────────────────────────────────────────────
//
// These pin the librosa defaults (ref=1.0, amin=1e-10, top_db=80 when asked)
// and, more importantly, pin the DIFFERENCE between absolute and peak-relative
// scaling. The absolute path must be stable under trimming; the peak-relative
// path must not be. Both properties are tested, because a change that made them
// agree would break either reproducibility or rendering.

import { describe, it, expect } from "vitest";
import { powerToDb, amplitudeToDb } from "./db.js";

describe("powerToDb", () => {
  it("maps unit power to 0 dB", () => {
    expect(powerToDb([1])[0]).toBeCloseTo(0, 12);
  });

  it("maps a factor of 100 in power to 20 dB", () => {
    expect(powerToDb([100])[0]).toBeCloseTo(20, 12);
    expect(powerToDb([0.01])[0]).toBeCloseTo(-20, 12);
  });

  it("floors silence at amin rather than -Infinity", () => {
    // 10·log10(1e-10) = -100.
    expect(powerToDb([0])[0]).toBeCloseTo(-100, 10);
    expect(Number.isFinite(powerToDb([0])[0]!)).toBe(true);
  });

  it("scales against an explicit numeric reference", () => {
    expect(powerToDb([1], { ref: 100 })[0]).toBeCloseTo(-20, 12);
  });

  it("makes the loudest value 0 dB under ref: max", () => {
    const out = powerToDb([100, 1], { ref: "max" });
    expect(out[0]).toBeCloseTo(0, 12);
    expect(out[1]).toBeCloseTo(-20, 12);
  });

  it("clamps to topDb below the output peak", () => {
    const out = powerToDb([1, 0], { topDb: 80 });
    expect(out[0]).toBeCloseTo(0, 12);
    // Unclamped this would be -100; the 80 dB floor lifts it.
    expect(out[1]).toBeCloseTo(-80, 10);
  });

  it("leaves the result unclamped when topDb is null", () => {
    const out = powerToDb([1, 0], { topDb: null });
    expect(out[1]).toBeCloseTo(-100, 10);
  });

  it("is stable under trimming with the default absolute reference", () => {
    const full = powerToDb([100, 1, 0.01]);
    const trimmed = powerToDb([1, 0.01]);
    // The same input value yields the same dB regardless of its neighbours.
    expect(trimmed[0]).toBeCloseTo(full[1]!, 12);
    expect(trimmed[1]).toBeCloseTo(full[2]!, 12);
  });

  it("is NOT stable under trimming with ref: max, by design", () => {
    const full = powerToDb([100, 1], { ref: "max" });
    const trimmed = powerToDb([1], { ref: "max" });
    expect(full[1]).toBeCloseTo(-20, 12);
    expect(trimmed[0]).toBeCloseTo(0, 12);
  });

  it("falls back to an absolute reference for all-silent input", () => {
    const out = powerToDb([0, 0], { ref: "max" });
    expect(Number.isNaN(out[0]!)).toBe(false);
    expect(out[0]).toBeCloseTo(-100, 10);
  });

  it("rejects invalid parameters", () => {
    expect(() => powerToDb([1], { ref: 0 })).toThrow(/positive/i);
    expect(() => powerToDb([1], { amin: 0 })).toThrow(/amin/i);
    expect(() => powerToDb([1], { topDb: -5 })).toThrow(/topDb/i);
  });

  it("returns one output per input", () => {
    expect(powerToDb([1, 2, 3, 4]).length).toBe(4);
    expect(powerToDb([]).length).toBe(0);
  });
});

describe("amplitudeToDb", () => {
  it("maps unit amplitude to 0 dB", () => {
    expect(amplitudeToDb([1])[0]).toBeCloseTo(0, 12);
  });

  it("maps a factor of 10 in amplitude to 20 dB", () => {
    // Amplitude 10 is power 100, which is 20 dB.
    expect(amplitudeToDb([10])[0]).toBeCloseTo(20, 12);
    expect(amplitudeToDb([0.1])[0]).toBeCloseTo(-20, 12);
  });

  it("agrees with powerToDb on the squared input", () => {
    const amps = [1, 2, 5, 0.25];
    const viaAmplitude = amplitudeToDb(amps);
    const viaPower = powerToDb(amps.map((a) => a * a));
    for (let i = 0; i < amps.length; i++) {
      expect(viaAmplitude[i]).toBeCloseTo(viaPower[i]!, 10);
    }
  });

  it("honours ref: max the same way", () => {
    const out = amplitudeToDb([10, 1], { ref: "max" });
    expect(out[0]).toBeCloseTo(0, 12);
    expect(out[1]).toBeCloseTo(-20, 12);
  });
});
