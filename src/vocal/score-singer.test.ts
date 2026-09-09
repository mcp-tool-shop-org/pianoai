import { describe, it, expect } from "vitest";
import { peakNormalize } from "./score-singer.js";

describe("peakNormalize", () => {
  it("scales a quiet buffer up to the target peak", () => {
    const pcm = new Float32Array([0, 0.1, -0.05]);
    const out = peakNormalize(pcm, 0.5);
    expect(Math.max(...out.map(Math.abs))).toBeCloseTo(0.5, 5);
    expect(out[1]).toBeCloseTo(0.5, 5);
  });

  it("leaves silence alone", () => {
    const pcm = new Float32Array(8);
    expect(peakNormalize(pcm, 0.5)).toEqual(pcm);
  });
});
