// ─── Transcription Bridge Tests ──────────────────────────────────────────────
//
// The load-bearing assertion is recovery within the gates we actually
// enforce: 40 ms on onsets, 50 cents on pitch. It does NOT go through
// scorePerformance, which defaults toleranceMs to 150 and would make a
// 40 ms miss look like a pass.
//
// Repeated-note cases are both halves of the limitation: a rest between
// two A4s must stay two notes, and a re-attack with no rest (phase reset
// plus a click) must also stay two. A legato merge with no transient is
// documented in the caveat, not tested as a success.

import { describe, it, expect } from "vitest";
import {
  transcribe,
  toMidiNoteEvents,
  velocityFromRms,
  MIN_DURATION_SEC,
  MIN_CONFIDENCE,
} from "./transcribe.js";
import { sine, clickTrain, vibratoNote } from "./fixtures.js";
import { midiToHz, PITCH_FAIL_CENTS } from "./pitch.js";
import { HOUSE_TOLERANCE_MS } from "./onsets.js";

const SR = 44100;
const GATE_SEC = HOUSE_TOLERANCE_MS / 1000;

function concat(...parts: Float64Array[]): Float64Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Float64Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function mix(a: Float64Array, b: Float64Array): Float64Array {
  const n = Math.max(a.length, b.length);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  }
  return out;
}

function silence(seconds: number): Float64Array {
  return new Float64Array(Math.round(seconds * SR));
}

function tone(midi: number, seconds: number, amplitude = 1): Float64Array {
  return sine({
    frequency: midiToHz(midi),
    duration: seconds,
    sampleRate: SR,
    amplitude,
  });
}

function withClicks(samples: Float64Array, times: number[]): Float64Array {
  const duration = samples.length / SR;
  return mix(samples, clickTrain({ times, duration, sampleRate: SR }));
}

function nearest(
  notes: { time: number; note: number; centsOffset: number }[],
  time: number,
) {
  let best = notes[0];
  let bestAbs = Infinity;
  for (const n of notes) {
    const d = Math.abs(n.time - time);
    if (d < bestAbs) {
      bestAbs = d;
      best = n;
    }
  }
  return best;
}

describe("velocityFromRms", () => {
  it("maps a unit-amplitude sine RMS to 127", () => {
    expect(velocityFromRms(Math.SQRT1_2)).toBe(127);
  });

  it("clamps a vanishing RMS to 1, never 0", () => {
    expect(velocityFromRms(0)).toBe(1);
    expect(velocityFromRms(1e-12)).toBe(1);
  });
});

describe("defaults", () => {
  it("drops notes shorter than 50 ms by default", () => {
    expect(MIN_DURATION_SEC).toBe(0.05);
  });

  it("uses the same confidence floor as scorePitchWindow", () => {
    expect(MIN_CONFIDENCE).toBe(0.5);
  });
});

describe("the load-bearing round trip", () => {
  // Silence, C4, rest, E4, rest, G4. Clicks at each note start so SuperFlux
  // has a real transient. Ground truth is exact because the generators are.
  const pre = 0.4;
  const noteDur = 0.5;
  const rest = 0.3;
  const t0 = pre;
  const t1 = pre + noteDur + rest;
  const t2 = t1 + noteDur + rest;
  const expected = [
    { midi: 60, time: t0 },
    { midi: 64, time: t1 },
    { midi: 67, time: t2 },
  ];

  const samples = withClicks(
    concat(
      silence(pre),
      tone(60, noteDur),
      silence(rest),
      tone(64, noteDur),
      silence(rest),
      tone(67, noteDur),
    ),
    expected.map((e) => e.time),
  );

  it("recovers each note within 40 ms and 50 cents", () => {
    const { notes, caveat } = transcribe(samples, { sampleRate: SR });
    expect(caveat.length).toBeGreaterThan(0);
    expect(notes.length).toBeGreaterThanOrEqual(expected.length);

    for (const exp of expected) {
      const got = nearest(notes, exp.time);
      expect(got).toBeDefined();
      expect(Math.abs(got!.time - exp.time)).toBeLessThanOrEqual(GATE_SEC);
      expect(got!.note).toBe(exp.midi);
      expect(Math.abs(got!.centsOffset)).toBeLessThanOrEqual(PITCH_FAIL_CENTS);
    }
  });

  it("does not invent a note in a rest", () => {
    const { notes } = transcribe(samples, { sampleRate: SR });
    // Inside the rest, away from both neighbouring onsets by a full gate.
    const restStart = t0 + noteDur + GATE_SEC;
    const restEnd = t1 - GATE_SEC;
    const inRest = notes.filter((n) => n.time > restStart && n.time < restEnd);
    expect(inRest.length).toBe(0);
  });
});

describe("repeated notes at the same pitch", () => {
  it("stay two notes when a rest separates them", () => {
    const dur = 0.4;
    const gap = 0.25;
    const t0 = 0.3;
    const t1 = t0 + dur + gap;
    const samples = withClicks(
      concat(silence(t0), tone(69, dur), silence(gap), tone(69, dur)),
      [t0, t1],
    );
    const { notes } = transcribe(samples, { sampleRate: SR });
    expect(notes.length).toBeGreaterThanOrEqual(2);
    const a = nearest(notes, t0);
    const b = nearest(notes, t1);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).not.toBe(b);
    expect(a!.note).toBe(69);
    expect(b!.note).toBe(69);
    expect(Math.abs(a!.time - t0)).toBeLessThanOrEqual(GATE_SEC);
    expect(Math.abs(b!.time - t1)).toBeLessThanOrEqual(GATE_SEC);
  });

  it("stay two notes when re-attacked with no rest (phase reset + click)", () => {
    const dur = 0.4;
    const t0 = 0.3;
    const t1 = t0 + dur;
    // Second A4 starts at phase 0 regardless of where the first ended, so
    // the join is an amplitude/phase transient. The click is the SuperFlux
    // target. No silent samples between them.
    const samples = withClicks(
      concat(silence(t0), tone(69, dur), tone(69, dur)),
      [t0, t1],
    );
    const { notes } = transcribe(samples, { sampleRate: SR });
    expect(notes.length).toBeGreaterThanOrEqual(2);
    const a = nearest(notes, t0);
    const b = nearest(notes, t1);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).not.toBe(b);
    expect(a!.note).toBe(69);
    expect(b!.note).toBe(69);
    expect(Math.abs(b!.time - t1)).toBeLessThanOrEqual(GATE_SEC);
  });
});

describe("vibrato", () => {
  it("transcribes as one note at its centre pitch", () => {
    const pre = 0.3;
    const dur = 1.0;
    const vib = vibratoNote({
      frequency: 440,
      duration: dur,
      sampleRate: SR,
      rateHz: 5,
      depthCents: 50,
    });
    const samples = withClicks(concat(silence(pre), vib), [pre]);
    const { notes } = transcribe(samples, { sampleRate: SR });
    const around = notes.filter((n) => Math.abs(n.time - pre) < 0.15);
    expect(around.length).toBe(1);
    expect(around[0]!.note).toBe(69);
    expect(Math.abs(around[0]!.centsOffset)).toBeLessThanOrEqual(PITCH_FAIL_CENTS);
  });
});

describe("silence", () => {
  it("returns an empty array with a caveat, never throws", () => {
    const result = transcribe(new Float64Array(SR), { sampleRate: SR });
    expect(result.notes).toEqual([]);
    expect(result.caveat.length).toBeGreaterThan(0);
    expect(result.caveat).toMatch(/monophonic/i);
    expect(result.caveat).toMatch(/0\.88/);
  });
});

describe("leading voiced audio with no onset", () => {
  it("still produces a note, flagged as inferred", () => {
    // A sine that is already sounding at t=0 may not have a SuperFlux
    // transient. The leading-voiced path is what makes that a note.
    const samples = tone(69, 0.6);
    const { notes, caveat } = transcribe(samples, { sampleRate: SR });
    expect(notes.length).toBeGreaterThanOrEqual(1);
    const first = nearest(notes, 0);
    expect(first!.note).toBe(69);
    expect(first!.time).toBeLessThanOrEqual(GATE_SEC);
    if (first!.onsetInferred) {
      expect(caveat).toMatch(/inferred/i);
    }
  });
});

describe("toMidiNoteEvents", () => {
  it("drops centsOffset, confidence and onsetInferred, and sets channel 0", () => {
    const samples = withClicks(
      concat(silence(0.3), tone(60, 0.5)),
      [0.3],
    );
    const { notes } = transcribe(samples, { sampleRate: SR });
    expect(notes.length).toBeGreaterThanOrEqual(1);
    const events = toMidiNoteEvents(notes);
    expect(events.length).toBe(notes.length);
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      const n = notes[i]!;
      expect(e.note).toBe(n.note);
      expect(e.velocity).toBe(n.velocity);
      expect(e.time).toBe(n.time);
      expect(e.duration).toBe(n.duration);
      expect(e.channel).toBe(0);
      expect(e.velocity).toBeGreaterThanOrEqual(1);
      expect(e.velocity).toBeLessThanOrEqual(127);
      expect(e).not.toHaveProperty("centsOffset");
      expect(e).not.toHaveProperty("confidence");
      expect(e).not.toHaveProperty("onsetInferred");
    }
  });
});

describe("caveat", () => {
  it("names the legato-repeat limitation even when nothing was dropped", () => {
    const { caveat } = transcribe(tone(69, 0.5), { sampleRate: SR });
    expect(caveat).toMatch(/legato/i);
    expect(caveat).toMatch(/monophonic/i);
  });
});
