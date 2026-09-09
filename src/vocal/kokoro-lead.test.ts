import { describe, it, expect } from "vitest";
import { renderKokoroLead } from "./kokoro-lead.js";
import { midiToHz, estimateF0 } from "./voice-changer.js";
import type { BuiltVocalScore } from "./score-locked.js";

function sine(sr: number, hz: number, sec: number): Float32Array {
  const n = Math.floor(sr * sec);
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.sin((2 * Math.PI * hz * i) / sr);
  return pcm;
}

describe("renderKokoroLead", () => {
  it("places a retuned grain on the MIDI clock", () => {
    const sr = 48000;
    const score: BuiltVocalScore = {
      bpm: 60,
      notes: [{ id: "n0", startSec: 0.1, durationSec: 0.2, midi: 69, velocity: 0.8 }],
      lyrics: { text: "la", language: "en-US" },
      phonemes: [],
      warnings: [],
      startMeasure: 1,
      endMeasure: 1,
    };
    const { pcm, sampleRate } = renderKokoroLead(score, sine(sr, 180, 0.15), sr);
    expect(sampleRate).toBe(sr);
    const start = Math.floor(0.12 * sr);
    const f0 = estimateF0(pcm, sr, start, Math.floor(0.08 * sr));
    expect(f0).toBeGreaterThan(midiToHz(69) * 0.55);
  });
});
