import { describe, it, expect } from "vitest";
import { loadEngineG2P } from "./g2p.js";

describe("loadEngineG2P", () => {
  it("syllabifies a dictionary word via vocal-synth-engine", async () => {
    const g2p = await loadEngineG2P();
    const hello = g2p.wordToSyllables("hello");
    expect(hello.length).toBeGreaterThanOrEqual(2);
    expect(hello.some((s) => s.nucleus.length > 0)).toBe(true);
  });
});
