import { describe, it, expect } from "vitest";
import { velocityLowpassHz, PIANO_COMPRESSOR } from "./piano-timbre.js";

describe("velocityLowpassHz", () => {
  it("is lower for piano than for forte at middle C", () => {
    expect(velocityLowpassHz(60, 0.2)).toBeLessThan(velocityLowpassHz(60, 0.9));
  });

  it("stays inside a piano-like band (never the old 18 kHz path)", () => {
    for (const midi of [36, 60, 84]) {
      for (const vel of [0, 0.3, 0.7, 1]) {
        const hz = velocityLowpassHz(midi, vel);
        expect(hz).toBeGreaterThanOrEqual(1400);
        expect(hz).toBeLessThanOrEqual(7200);
      }
    }
  });

  it("clamps out-of-range velocity", () => {
    expect(velocityLowpassHz(60, -1)).toBe(velocityLowpassHz(60, 0));
    expect(velocityLowpassHz(60, 2)).toBe(velocityLowpassHz(60, 1));
  });
});

describe("PIANO_COMPRESSOR", () => {
  it("is gentler than the old ratio-6 squash", () => {
    expect(PIANO_COMPRESSOR.ratio).toBeLessThan(6);
    expect(PIANO_COMPRESSOR.threshold).toBeLessThan(-15);
  });
});

describe("cockpit copy lockstep", () => {
  // apps/cockpit/src/piano-timbre.ts is a structural duplicate (the cockpit
  // tsconfig cannot import src/). Comments may differ; the CODE may not.
  // This pin is what makes the "keep in sync" header enforceable — without
  // it the two surfaces drift the first time one side gets a tweak.
  it("apps/cockpit/src/piano-timbre.ts code body is byte-identical to src/piano-timbre.ts", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const strip = (p: string) =>
      readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8")
        .split(/\r?\n/)
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && l.trim() !== "")
        .join("\n");
    expect(strip("../apps/cockpit/src/piano-timbre.ts")).toBe(strip("./piano-timbre.ts"));
  });
});
