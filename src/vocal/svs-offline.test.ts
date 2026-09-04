import { describe, it, expect } from "vitest";
import { renderOfflineSvs } from "./svs-offline.js";
import { generateFullSong } from "./song-generate.js";
import type { BuiltVocalScore } from "./score-locked.js";

const emptyScore: BuiltVocalScore = {
  bpm: 60,
  notes: [{ id: "n0", startSec: 0, durationSec: 0.5, midi: 60 }],
  lyrics: { text: "la", language: "en-US" },
  phonemes: [{ tSec: 0, durSec: 0.5, phoneme: "AH", kind: "vowel", timbreHint: "AH" }],
  warnings: [],
  startMeasure: 1,
  endMeasure: 1,
};

describe("renderOfflineSvs diffsinger backend", () => {
  it("refuses when DIFFSINGER_ROOT is unset", async () => {
    const prev = process.env.DIFFSINGER_ROOT;
    delete process.env.DIFFSINGER_ROOT;
    await expect(
      renderOfflineSvs(emptyScore, { backend: "diffsinger", outPath: "out.wav" }),
    ).rejects.toThrow(/DIFFSINGER_ROOT/);
    if (prev !== undefined) process.env.DIFFSINGER_ROOT = prev;
  });
});

describe("generateFullSong", () => {
  it("refuses ACE-Step as a play engine and names the MIDI-lock gap", () => {
    const prev = process.env.ACE_STEP_CMD;
    delete process.env.ACE_STEP_CMD;
    const r = generateFullSong({ lyrics: "la la", generator: "ace-step" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/cannot honor a library MIDI/i);
    expect(r.hint).toMatch(/ACE_STEP_CMD/);
    if (prev !== undefined) process.env.ACE_STEP_CMD = prev;
  });
});
