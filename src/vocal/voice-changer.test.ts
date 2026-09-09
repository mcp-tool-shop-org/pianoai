import { describe, it, expect } from "vitest";
import {
  estimateF0,
  midiToHz,
  pitchShiftPreserveDuration,
  retuneLockedTake,
} from "./voice-changer.js";

function sine(sr: number, hz: number, sec: number): Float32Array {
  const n = Math.floor(sr * sec);
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.sin((2 * Math.PI * hz * i) / sr);
  return pcm;
}

describe("voice-changer (fx-dub PERFORM step)", () => {
  it("measures a 220 Hz sine near A3", () => {
    const sr = 48000;
    const f0 = estimateF0(sine(sr, 220, 0.2), sr, Math.floor(sr * 0.04));
    expect(f0).toBeGreaterThan(200);
    expect(f0).toBeLessThan(240);
  });

  it("raises a 220 Hz take toward 440 Hz", () => {
    const sr = 48000;
    const src = sine(sr, 220, 0.25);
    const out = pitchShiftPreserveDuration(src, sr, 2);
    const f0 = estimateF0(out, sr, Math.floor(sr * 0.05), Math.floor(sr * 0.12));
    expect(f0).toBeGreaterThan(320);
  });

  it("retunes a locked take onto MIDI 69 (A4)", () => {
    const sr = 48000;
    const src = sine(sr, 180, 0.2);
    const out = retuneLockedTake(src, sr, 69, 0.2);
    expect(out.length).toBe(Math.round(0.2 * sr));
    const f0 = estimateF0(out, sr, Math.floor(sr * 0.04));
    expect(f0).toBeGreaterThan(midiToHz(69) * 0.7);
  });
});
