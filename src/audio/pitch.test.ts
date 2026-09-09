// ─── Pitch Tracking Tests ────────────────────────────────────────────────────
//
// The tolerances here are deliberately tighter than the gate they serve. The
// gate fails a note beyond 50 cents, so an estimator that were only accurate to
// 50 cents would make the gate meaningless. These tests hold YIN to a few cents
// on synthetic tones, which is the headroom the study's finding 18 predicts.

import { describe, it, expect } from "vitest";
import {
  hzToMidi,
  midiToHz,
  centsFromTarget,
  yinFrame,
  trackPitch,
  scorePitchWindow,
  PITCH_FAIL_CENTS,
  PITCH_WARN_CENTS,
  OCTAVE_TRIPWIRE_CENTS,
} from "./pitch.js";
import { sine, harmonicStack, vibratoNote } from "./fixtures.js";

const SR = 44100;

describe("hzToMidi / midiToHz", () => {
  it("pins A4 at MIDI 69 and 440 Hz", () => {
    expect(hzToMidi(440)).toBeCloseTo(69, 10);
    expect(midiToHz(69)).toBeCloseTo(440, 10);
  });

  it("puts middle C at MIDI 60", () => {
    expect(midiToHz(60)).toBeCloseTo(261.6255653, 6);
    expect(hzToMidi(261.6255653)).toBeCloseTo(60, 6);
  });

  it("round-trips across the range", () => {
    for (const midi of [21, 36, 48, 60, 69, 84, 108]) {
      expect(hzToMidi(midiToHz(midi))).toBeCloseTo(midi, 8);
    }
  });

  it("makes an octave 12 semitones", () => {
    expect(hzToMidi(880) - hzToMidi(440)).toBeCloseTo(12, 10);
  });

  it("rejects a non-positive frequency", () => {
    expect(() => hzToMidi(0)).toThrow(/positive/i);
  });
});

describe("centsFromTarget", () => {
  it("is zero on target", () => {
    expect(centsFromTarget(440, 69)).toBeCloseTo(0, 10);
  });

  it("is 100 cents per semitone", () => {
    expect(centsFromTarget(midiToHz(70), 69)).toBeCloseTo(100, 8);
    expect(centsFromTarget(midiToHz(68), 69)).toBeCloseTo(-100, 8);
  });

  it("signs sharp positive and flat negative", () => {
    expect(centsFromTarget(450, 69)).toBeGreaterThan(0);
    expect(centsFromTarget(430, 69)).toBeLessThan(0);
  });

  it("reads an octave error as 1200 cents", () => {
    expect(centsFromTarget(880, 69)).toBeCloseTo(1200, 8);
  });
});

describe("yinFrame", () => {
  it("finds a pure tone within a few cents", () => {
    for (const hz of [110, 220, 440, 880]) {
      const frame = sine({ sampleRate: SR, frequency: hz, duration: 2048 / SR });
      const { f0Hz, confidence } = yinFrame(frame, { sampleRate: SR });
      expect(f0Hz).not.toBeNull();
      expect(Math.abs(centsFromTarget(f0Hz!, hzToMidi(hz)))).toBeLessThan(10);
      expect(confidence).toBeGreaterThan(0.8);
    }
  });

  it("finds the fundamental of a harmonic stack, not a harmonic", () => {
    // The octave-error case YIN's absolute-threshold step exists to prevent.
    const frame = harmonicStack({
      sampleRate: SR,
      fundamental: 220,
      duration: 2048 / SR,
      amplitudes: [1, 0.8, 0.6, 0.4, 0.2, 0.1],
    });
    const { f0Hz } = yinFrame(frame, { sampleRate: SR });
    expect(f0Hz).not.toBeNull();
    expect(Math.abs(centsFromTarget(f0Hz!, hzToMidi(220)))).toBeLessThan(15);
  });

  it("reports low confidence and no pitch on silence", () => {
    const { f0Hz, confidence } = yinFrame(new Float64Array(2048), { sampleRate: SR });
    expect(f0Hz).toBeNull();
    expect(confidence).toBeLessThan(0.5);
  });

  it("resolves a 50-cent error, the gate's own threshold", () => {
    // If the estimator could not separate these two, the gate would be noise.
    const onPitch = sine({ sampleRate: SR, frequency: 440, duration: 2048 / SR });
    const sharp = sine({
      sampleRate: SR,
      frequency: 440 * Math.pow(2, 50 / 1200),
      duration: 2048 / SR,
    });

    const a = yinFrame(onPitch, { sampleRate: SR }).f0Hz!;
    const b = yinFrame(sharp, { sampleRate: SR }).f0Hz!;

    expect(centsFromTarget(a, 69)).toBeCloseTo(0, 0);
    expect(centsFromTarget(b, 69)).toBeGreaterThan(40);
    expect(centsFromTarget(b, 69)).toBeLessThan(60);
  });

  it("rejects an fmin the frame is too short to resolve", () => {
    expect(() => yinFrame(new Float64Array(256), { sampleRate: SR, fmin: 55 }))
      .toThrow(/Raise frameLength/i);
  });
});

describe("trackPitch", () => {
  it("times frames on the hop grid, matching the STFT", () => {
    const samples = sine({ sampleRate: SR, frequency: 440, duration: 0.5 });
    const track = trackPitch(samples, { sampleRate: SR, hopLength: 512 });
    expect(track.frames[0]!.timeSec).toBeCloseTo(0, 12);
    expect(track.frames[1]!.timeSec).toBeCloseTo(512 / SR, 12);
    expect(track.frames[10]!.timeSec).toBeCloseTo((10 * 512) / SR, 12);
  });

  it("holds a steady tone steady across the whole track", () => {
    const samples = sine({ sampleRate: SR, frequency: 440, duration: 1.0 });
    const track = trackPitch(samples, { sampleRate: SR });
    const voiced = track.frames.filter((f) => f.f0Hz !== null && f.confidence > 0.8);

    expect(voiced.length).toBeGreaterThan(20);
    for (const f of voiced) {
      expect(Math.abs(centsFromTarget(f.f0Hz!, 69))).toBeLessThan(15);
    }
  });

  it("populates midi alongside f0Hz", () => {
    const samples = sine({ sampleRate: SR, frequency: 440, duration: 0.3 });
    const track = trackPitch(samples, { sampleRate: SR });
    const voiced = track.frames.find((f) => f.f0Hz !== null)!;
    expect(voiced.midi).toBeCloseTo(hzToMidi(voiced.f0Hz!), 10);
  });

  it("leaves silence unvoiced", () => {
    const track = trackPitch(new Float64Array(SR), { sampleRate: SR });
    const voiced = track.frames.filter((f) => f.f0Hz !== null && f.confidence > 0.5);
    expect(voiced.length).toBe(0);
  });
});

describe("scorePitchWindow", () => {
  function trackOf(hz: number, duration = 1.0) {
    return trackPitch(sine({ sampleRate: SR, frequency: hz, duration }), {
      sampleRate: SR,
    });
  }

  it("passes a note on target", () => {
    const v = scorePitchWindow(trackOf(440), 69, 0.2, 0.8);
    expect(v.status).toBe("correct");
    expect(Math.abs(v.centsMedian!)).toBeLessThan(PITCH_WARN_CENTS);
    expect(v.voicedFrames).toBeGreaterThan(10);
  });

  it("warns between the warn and fail thresholds", () => {
    // 35 cents sharp: past warn, short of fail.
    const v = scorePitchWindow(trackOf(440 * Math.pow(2, 35 / 1200)), 69, 0.2, 0.8);
    expect(v.status).toBe("warn");
    expect(v.centsMedian).toBeGreaterThan(PITCH_WARN_CENTS);
    expect(v.centsMedian).toBeLessThan(PITCH_FAIL_CENTS);
  });

  it("fails past the 50-cent gate", () => {
    // 80 cents sharp.
    const v = scorePitchWindow(trackOf(440 * Math.pow(2, 80 / 1200)), 69, 0.2, 0.8);
    expect(v.status).toBe("fail");
    expect(v.centsMedian).toBeGreaterThan(PITCH_FAIL_CENTS);
  });

  it("signs a flat note negative", () => {
    const v = scorePitchWindow(trackOf(440 * Math.pow(2, -80 / 1200)), 69, 0.2, 0.8);
    expect(v.status).toBe("fail");
    expect(v.centsMedian).toBeLessThan(0);
    expect(v.detail).toMatch(/flat/);
  });

  it("calls silence untrackable rather than out of tune", () => {
    const track = trackPitch(new Float64Array(SR), { sampleRate: SR });
    const v = scorePitchWindow(track, 69, 0.2, 0.8);
    expect(v.status).toBe("untrackable");
    expect(v.centsMedian).toBeNull();
    expect(v.detail).toMatch(/not an out-of-tune verdict/i);
  });

  it("reports vibrato around its centre rather than failing it", () => {
    // A singer's vibrato swings well past 50 cents instantaneously. The median
    // over the window is what the gate should see, not the extremes.
    const samples = vibratoNote({
      sampleRate: SR,
      frequency: 440,
      duration: 1.0,
      rateHz: 5.5,
      depthCents: 60,
    });
    const track = trackPitch(samples, { sampleRate: SR });
    const v = scorePitchWindow(track, 69, 0.2, 0.8);

    expect(v.status).toBe("correct");
    expect(Math.abs(v.centsMedian!)).toBeLessThan(PITCH_WARN_CENTS);
    // The scatter is what reveals the vibrato; the median hides it by design.
    expect(v.centsStdDev).toBeGreaterThan(10);
  });

  it("rejects an inverted window", () => {
    expect(() => scorePitchWindow(trackOf(440), 69, 0.8, 0.2))
      .toThrow(/must be after/i);
  });

  it("exposes the octave tripwire as a constant the caller can read", () => {
    expect(OCTAVE_TRIPWIRE_CENTS).toBe(40);
    expect(PITCH_WARN_CENTS).toBeLessThan(PITCH_FAIL_CENTS);
  });
});
