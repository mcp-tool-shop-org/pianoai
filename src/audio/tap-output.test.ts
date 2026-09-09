// ─── createTapOutput — disconnected engines ──────────────────────────────────
//
// No AudioContext. "The method exists" is a weak assertion; throwing
// before connect() exercises the ensureConnected guard for real.

import { describe, it, expect } from "vitest";
import { createAudioEngine } from "../audio-engine.js";
import { createGuitarEngine } from "../guitar-engine.js";
import { createVocalEngine } from "../vocal-engine.js";
import { createTractEngine } from "../vocal-tract-engine.js";
import { createSampleEngine } from "../sample-engine.js";
import { createVocalSynthEngine } from "../vocal-synth-adapter.js";

describe("createTapOutput throws before connect", () => {
  it("piano", () => {
    expect(() => createAudioEngine().createTapOutput?.()).toThrow(/not connected/);
  });

  it("guitar", () => {
    expect(() => createGuitarEngine().createTapOutput?.()).toThrow(/not connected/);
  });

  it("vocal", () => {
    expect(() => createVocalEngine().createTapOutput?.()).toThrow(/not connected/);
  });

  it("tract", () => {
    expect(() => createTractEngine().createTapOutput?.()).toThrow(/not connected/);
  });

  it("sample", () => {
    expect(() =>
      createSampleEngine({ samplesDir: "unused" }).createTapOutput?.(),
    ).toThrow(/not connected/);
  });

  it("synth", () => {
    expect(() => createVocalSynthEngine().createTapOutput?.()).toThrow(/not connected/);
  });
});
