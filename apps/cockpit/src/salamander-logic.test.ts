import { describe, it, expect } from "vitest";
import {
  nearestRoot, playbackRateFor, velocityLayer, fileFor, rootsCoverPiano, layersOrdered,
  type SampleLayer, type SampleFileRef,
} from "./salamander-logic.js";

const roots = [21, 24, 27, 60, 63, 105, 108];
const layers: SampleLayer[] = [
  { id: 0, velLo: 1, velHi: 42 },
  { id: 1, velLo: 43, velHi: 85 },
  { id: 2, velLo: 86, velHi: 127 },
];

describe("salamander-logic", () => {
  it("nearestRoot + playbackRate for a neighbor semitone", () => {
    expect(nearestRoot(60, roots)).toBe(60);
    expect(nearestRoot(61, roots)).toBe(60);
    expect(playbackRateFor(61, 60)).toBeCloseTo(Math.pow(2, 1 / 12), 10);
    expect(nearestRoot(59, roots)).toBe(60);
  });

  it("velocityLayer uses inclusive bands", () => {
    expect(velocityLayer(1, layers)).toBe(0);
    expect(velocityLayer(42, layers)).toBe(0);
    expect(velocityLayer(43, layers)).toBe(1);
    expect(velocityLayer(127, layers)).toBe(2);
  });

  it("fileFor matches root+layer", () => {
    const files: SampleFileRef[] = [
      { midi: 60, layer: 1, file: "60-v1.ogg", rootMidi: 60 },
    ];
    expect(fileFor(60, 1, files)?.file).toBe("60-v1.ogg");
    expect(fileFor(60, 0, files)).toBeNull();
  });

  it("rootsCoverPiano and layersOrdered validate a legal pack shape", () => {
    const full: number[] = [];
    for (let m = 21; m <= 108; m += 3) full.push(m);
    expect(rootsCoverPiano(full)).toBe(true);
    expect(rootsCoverPiano([60])).toBe(false);
    expect(layersOrdered(layers)).toBe(true);
    expect(layersOrdered([{ id: 0, velLo: 1, velHi: 127 }])).toBe(true);
    expect(layersOrdered([{ id: 0, velLo: 1, velHi: 40 }, { id: 1, velLo: 50, velHi: 127 }])).toBe(false);
  });
});

describe("samplerHandlesVoice", () => {
  it("routes only the Concert Grand preset to the sampler", async () => {
    const { samplerHandlesVoice } = await import("./salamander-logic.js");
    expect(samplerHandlesVoice("grand")).toBe(true);
    for (const v of ["upright", "electric", "honkytonk", "musicbox", "bright", "synth-pad", "organ", "bell", "strings"]) {
      expect(samplerHandlesVoice(v)).toBe(false);
    }
  });
});
