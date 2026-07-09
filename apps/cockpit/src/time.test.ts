// ─── time.test.ts ───────────────────────────────────────────────────────────
//
// Pure, DOM-free coverage for time.ts's beat<->second conversion chokepoint
// (the cockpit beat-model wave — see time.ts's file header for why the app
// stores beats rather than seconds). Importable directly under Node/vitest,
// same as pure-logic.test.ts covers synth.ts/persistence.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  BPM_MIN, BPM_MAX, DEFAULT_BPM, QUANTIZE_GRID_BEATS,
  beatsToSeconds, secondsToBeats, quantizeBeats, clampBpm,
} from "./time.js";

describe("beatsToSeconds / secondsToBeats — round-trip", () => {
  it("converts 1 beat at 60bpm to exactly 1 second", () => {
    expect(beatsToSeconds(1, 60)).toBe(1);
  });

  it("converts 1 beat at 120bpm to exactly 0.5 seconds", () => {
    expect(beatsToSeconds(1, 120)).toBe(0.5);
  });

  it("converts 2 seconds at 120bpm to exactly 4 beats", () => {
    expect(secondsToBeats(2, 120)).toBe(4);
  });

  it("round-trips beats -> seconds -> beats at an arbitrary bpm", () => {
    const bpm = 137;
    const beats = 5.25;
    const seconds = beatsToSeconds(beats, bpm);
    expect(secondsToBeats(seconds, bpm)).toBeCloseTo(beats, 10);
  });

  it("round-trips seconds -> beats -> seconds at an arbitrary bpm", () => {
    const bpm = 73;
    const seconds = 12.4;
    const beats = secondsToBeats(seconds, bpm);
    expect(beatsToSeconds(beats, bpm)).toBeCloseTo(seconds, 10);
  });

  it("0 beats is always 0 seconds regardless of bpm", () => {
    expect(beatsToSeconds(0, 20)).toBe(0);
    expect(beatsToSeconds(0, 400)).toBe(0);
  });

  it("0 seconds is always 0 beats regardless of bpm", () => {
    expect(secondsToBeats(0, 20)).toBe(0);
    expect(secondsToBeats(0, 400)).toBe(0);
  });
});

describe("beatsToSeconds / secondsToBeats — bpm changes actually change the conversion (the point of storing beats)", () => {
  it("the same beat position lands at a different second at a different bpm", () => {
    const beats = 4;
    const atSlowTempo = beatsToSeconds(beats, 60);
    const atFastTempo = beatsToSeconds(beats, 120);
    expect(atSlowTempo).toBe(4);
    expect(atFastTempo).toBe(2);
    expect(atFastTempo).not.toBe(atSlowTempo);
  });

  it("doubling bpm halves the seconds for a fixed beat duration", () => {
    const beats = 8;
    expect(beatsToSeconds(beats, 200)).toBeCloseTo(beatsToSeconds(beats, 100) / 2, 10);
  });

  it("the same second position maps to a different beat position at a different bpm", () => {
    const seconds = 1;
    expect(secondsToBeats(seconds, 60)).toBe(1);
    expect(secondsToBeats(seconds, 120)).toBe(2);
  });
});

describe("beatsToSeconds / secondsToBeats — non-finite/non-positive bpm guard", () => {
  it("falls back to DEFAULT_BPM (120) for beatsToSeconds when bpm is NaN, 0, negative, or Infinity", () => {
    const expected = beatsToSeconds(4, DEFAULT_BPM);
    expect(beatsToSeconds(4, NaN)).toBe(expected);
    expect(beatsToSeconds(4, 0)).toBe(expected);
    expect(beatsToSeconds(4, -60)).toBe(expected);
    expect(beatsToSeconds(4, Infinity)).toBe(expected);
  });

  it("falls back to DEFAULT_BPM (120) for secondsToBeats when bpm is NaN, 0, negative, or Infinity", () => {
    const expected = secondsToBeats(4, DEFAULT_BPM);
    expect(secondsToBeats(4, NaN)).toBe(expected);
    expect(secondsToBeats(4, 0)).toBe(expected);
    expect(secondsToBeats(4, -60)).toBe(expected);
    expect(secondsToBeats(4, Infinity)).toBe(expected);
  });

  it("never returns NaN/Infinity for a garbage bpm (would otherwise corrupt every downstream beat/second calc)", () => {
    for (const badBpm of [NaN, 0, -1, Infinity, -Infinity]) {
      expect(Number.isFinite(beatsToSeconds(4, badBpm))).toBe(true);
      expect(Number.isFinite(secondsToBeats(4, badBpm))).toBe(true);
    }
  });
});

describe("clampBpm", () => {
  it("passes a valid in-range bpm through unchanged", () => {
    expect(clampBpm(140)).toBe(140);
  });

  it("clamps above BPM_MAX down to BPM_MAX", () => {
    expect(clampBpm(BPM_MAX + 1000)).toBe(BPM_MAX);
  });

  it("clamps below BPM_MIN up to BPM_MIN", () => {
    expect(clampBpm(BPM_MIN - 1000)).toBe(BPM_MIN);
  });

  it("falls back to `prev` (not DEFAULT_BPM) for a non-finite candidate", () => {
    expect(clampBpm(NaN, 90)).toBe(90);
    expect(clampBpm(Infinity, 90)).toBe(90);
    expect(clampBpm(-Infinity, 90)).toBe(90);
  });

  it("falls back to DEFAULT_BPM when no `prev` is given and the candidate is non-finite", () => {
    expect(clampBpm(NaN)).toBe(DEFAULT_BPM);
  });
});

describe("quantizeBeats", () => {
  it("snaps to the nearest grid line at the default quarter-beat grid", () => {
    expect(quantizeBeats(0.1)).toBe(0);
    expect(quantizeBeats(0.2)).toBeCloseTo(0.25, 10);
    expect(quantizeBeats(1.0)).toBe(1);
    expect(quantizeBeats(1.13)).toBeCloseTo(1.25, 10);
  });

  it("never returns a negative beat position, even for negative input", () => {
    expect(quantizeBeats(-0.5)).toBe(0);
    expect(quantizeBeats(-100)).toBe(0);
  });

  it("respects a custom grid size", () => {
    expect(quantizeBeats(0.6, 0.5)).toBeCloseTo(0.5, 10);
    expect(quantizeBeats(0.8, 0.5)).toBeCloseTo(1.0, 10);
    expect(quantizeBeats(1.9, 1)).toBe(2);
  });

  it("QUANTIZE_GRID_BEATS is the default grid (changing it would change quantizeBeats() with no args)", () => {
    expect(quantizeBeats(QUANTIZE_GRID_BEATS * 3)).toBeCloseTo(QUANTIZE_GRID_BEATS * 3, 10);
  });

  it("falls back to a non-negative passthrough for a non-finite/non-positive grid instead of corrupting placement", () => {
    expect(quantizeBeats(3.7, 0)).toBe(3.7);
    expect(quantizeBeats(3.7, -1)).toBe(3.7);
    expect(quantizeBeats(3.7, NaN)).toBe(3.7);
    expect(quantizeBeats(-3.7, 0)).toBe(0);
  });
});
