import { describe, it, expect } from "vitest";
import { renderTractScore, TRACT_VOWELS } from "./tract-render.js";
import type { BuiltVocalScore } from "./score-locked.js";

describe("TRACT_VOWELS", () => {
  it("puts /i/ further forward than /ɑ/", () => {
    expect(TRACT_VOWELS.IY.tongueIndex).toBeGreaterThan(TRACT_VOWELS.AA.tongueIndex);
  });
});

describe("renderTractScore", () => {
  it("emits a voiced buffer for a short AH on middle C", () => {
    const score: BuiltVocalScore = {
      bpm: 60,
      notes: [{ id: "n0", startSec: 0.05, durationSec: 0.25, midi: 60, velocity: 0.8 }],
      lyrics: { text: "ah", language: "en-US" },
      phonemes: [{ tSec: 0.05, durSec: 0.25, phoneme: "AH", kind: "vowel", timbreHint: "AH" }],
      warnings: [],
      startMeasure: 1,
      endMeasure: 1,
    };
    const { pcm, sampleRate } = renderTractScore(score);
    expect(sampleRate).toBe(48000);
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) {
      const a = Math.abs(pcm[i]);
      if (a > peak) peak = a;
    }
    expect(peak).toBeGreaterThan(0.01);
  });

  it("changes the spectrum when the vowel moves from AA to IY", () => {
    const aa = renderTractScore({
      bpm: 60,
      notes: [{ id: "n0", startSec: 0, durationSec: 0.35, midi: 60, velocity: 0.8 }],
      lyrics: { text: "ah", language: "en-US" },
      phonemes: [{ tSec: 0, durSec: 0.35, phoneme: "AA", kind: "vowel" }],
      warnings: [],
      startMeasure: 1,
      endMeasure: 1,
    });
    const iy = renderTractScore({
      bpm: 60,
      notes: [{ id: "n0", startSec: 0, durationSec: 0.35, midi: 60, velocity: 0.8 }],
      lyrics: { text: "ee", language: "en-US" },
      phonemes: [{ tSec: 0, durSec: 0.35, phoneme: "IY", kind: "vowel" }],
      warnings: [],
      startMeasure: 1,
      endMeasure: 1,
    });
    let diff = 0;
    const n = Math.min(aa.pcm.length, iy.pcm.length);
    for (let i = 0; i < n; i++) diff += Math.abs(aa.pcm[i] - iy.pcm[i]);
    expect(diff / n).toBeGreaterThan(0.01);
  });

  it("puts inhale noise in an opening rest (breath context filling)", () => {
    const { pcm, sampleRate } = renderTractScore({
      bpm: 60,
      notes: [{ id: "n0", startSec: 0.4, durationSec: 0.2, midi: 60, velocity: 0.8 }],
      lyrics: { text: "ah", language: "en-US" },
      phonemes: [{ tSec: 0.4, durSec: 0.2, phoneme: "AH", kind: "vowel" }],
      warnings: [],
      startMeasure: 1,
      endMeasure: 1,
    });
    const from = Math.floor(0.15 * sampleRate);
    const to = Math.floor(0.35 * sampleRate);
    let sum = 0;
    for (let i = from; i < to; i++) sum += pcm[i] * pcm[i];
    const rms = Math.sqrt(sum / (to - from));
    expect(rms).toBeGreaterThan(0.005);
  });
});
