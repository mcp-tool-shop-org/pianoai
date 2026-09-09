import { describe, it, expect } from "vitest";
import {
  MIDI_LO, MIDI_HI, ROOT_STEP_SEMITONES, SOURCE_VELOCITY_LAYERS, VELOCITY_RANGES,
  holmNoteName, holmSourceStem, cockpitFileName, pianoRoots, nearestRoot,
  playbackRateFor, velocityLayer, maxRootGapSemitones,
} from "./salamander-prune-plan.js";

describe("pianoRoots", () => {
  it("covers A0–C8 in minor thirds (~30 roots)", () => {
    const roots = pianoRoots();
    expect(roots[0]).toBe(MIDI_LO);
    expect(roots[roots.length - 1]).toBe(MIDI_HI);
    expect(roots.length).toBe(1 + (MIDI_HI - MIDI_LO) / ROOT_STEP_SEMITONES);
    expect(roots.length).toBe(30);
    for (let i = 1; i < roots.length; i++) {
      expect(roots[i] - roots[i - 1]).toBe(3);
    }
  });

  it("every MIDI 21–108 is within 1.5 semitones of a root", () => {
    const roots = pianoRoots();
    expect(maxRootGapSemitones(roots)).toBeLessThanOrEqual(1.5);
    for (let m = MIDI_LO; m <= MIDI_HI; m++) {
      const r = nearestRoot(m, roots);
      expect(Math.abs(m - r)).toBeLessThanOrEqual(1.5);
    }
  });
});

describe("holmNoteName", () => {
  it("maps the Holm minor-third grid", () => {
    expect(holmNoteName(21)).toBe("A0");
    expect(holmNoteName(24)).toBe("C1");
    expect(holmNoteName(27)).toBe("D#1");
    expect(holmNoteName(30)).toBe("F#1");
    expect(holmNoteName(60)).toBe("C4");
    expect(holmNoteName(108)).toBe("C8");
  });

  it("source stems include the pinned velocity layers", () => {
    expect(holmSourceStem(60, SOURCE_VELOCITY_LAYERS[0])).toBe("C4v4");
    expect(holmSourceStem(21, SOURCE_VELOCITY_LAYERS[2])).toBe("A0v16");
    expect(cockpitFileName(60, 1)).toBe("60-v1.ogg");
  });
});

describe("nearestRoot / playbackRateFor / velocityLayer", () => {
  const roots = pianoRoots();

  it("returns the note itself when it is a root", () => {
    expect(nearestRoot(60, roots)).toBe(60);
    expect(playbackRateFor(60, 60)).toBe(1);
  });

  it("repitches a neighbor by a semitone", () => {
    expect(nearestRoot(61, roots)).toBe(60);
    expect(playbackRateFor(61, 60)).toBeCloseTo(Math.pow(2, 1 / 12), 10);
    expect(nearestRoot(59, roots)).toBe(60);
    expect(playbackRateFor(59, 60)).toBeCloseTo(Math.pow(2, -1 / 12), 10);
  });

  it("picks the three pinned velocity bands", () => {
    expect(VELOCITY_RANGES).toHaveLength(3);
    expect(SOURCE_VELOCITY_LAYERS).toEqual([4, 10, 16]);
    expect(velocityLayer(1)).toBe(0);
    expect(velocityLayer(42)).toBe(0);
    expect(velocityLayer(43)).toBe(1);
    expect(velocityLayer(85)).toBe(1);
    expect(velocityLayer(86)).toBe(2);
    expect(velocityLayer(127)).toBe(2);
  });
});
