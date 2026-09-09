// ─── Ensemble Tests ──────────────────────────────────────────────────────────
//
// The load-bearing property is that a chord is exact. Everything else here is a
// bound: state stays finite over a long session, an unknown id fails loudly, and
// a note-off for something not held is ordinary rather than fatal.

import { describe, it, expect, vi } from "vitest";
import { Ensemble, RELEASE_LOOKBACK_SEC } from "./ensemble.js";
import { AudioStream } from "./stream.js";
import { sine } from "./fixtures.js";

vi.setConfig({ testTimeout: 30_000 });

const SR = 44100;

function pianoTrio(): Ensemble {
  const e = new Ensemble();
  e.addInstrument({ id: "piano", label: "Concert Grand" });
  e.addInstrument({ id: "guitar", label: "Nylon" });
  e.addInstrument({ id: "voice", label: "Vocal" });
  return e;
}

describe("intent channel — the chord is exact, not estimated", () => {
  it("reports a three-note chord exactly, which is the whole point", () => {
    // A transcriber would have to infer this from audio. We sent it.
    const e = pianoTrio();
    for (const n of [60, 64, 67]) e.noteOn("piano", { note: n, velocity: 90, atSec: 1 });

    const v = e.view(1.5);
    const piano = v.instruments.find((i) => i.id === "piano")!;
    expect(piano.sounding.map((s) => s.note)).toEqual([60, 64, 67]);
    expect(piano.sounding.map((s) => s.name)).toEqual(["C4", "E4", "G4"]);
    expect(v.chord).toEqual([60, 64, 67]);
    expect(v.chordNames).toEqual(["C4", "E4", "G4"]);
  });

  it("merges every instrument into one chord, deduplicated", () => {
    const e = pianoTrio();
    e.noteOn("piano", { note: 60, velocity: 90, atSec: 0 });
    e.noteOn("guitar", { note: 60, velocity: 80, atSec: 0 }); // doubled unison
    e.noteOn("voice", { note: 67, velocity: 70, atSec: 0 });

    const v = e.view(0.5);
    expect(v.chord).toEqual([60, 67]);
    expect(v.instruments.find((i) => i.id === "guitar")!.sounding).toHaveLength(1);
  });

  it("tracks how long each note has been held", () => {
    const e = pianoTrio();
    e.noteOn("piano", { note: 60, velocity: 90, atSec: 2 });
    expect(e.view(2.75).instruments[0]!.sounding[0]!.heldSec).toBeCloseTo(0.75, 6);
  });

  it("releases on note-off and remembers it briefly", () => {
    const e = pianoTrio();
    e.noteOn("piano", { note: 60, velocity: 90, atSec: 0 });
    e.noteOff("piano", 60, 0.5);

    const piano = e.view(0.6).instruments[0]!;
    expect(piano.sounding).toHaveLength(0);
    expect(piano.recentlyReleased).toHaveLength(1);
    expect(piano.recentlyReleased[0]!.heldSec).toBeCloseTo(0.5, 6);
  });

  it("forgets releases beyond the lookback", () => {
    const e = pianoTrio();
    e.noteOn("piano", { note: 60, velocity: 90, atSec: 0 });
    e.noteOff("piano", 60, 0.1);
    const later = 0.1 + RELEASE_LOOKBACK_SEC + 1;
    expect(e.view(later).instruments[0]!.recentlyReleased).toHaveLength(0);
  });

  it("treats a repeated note-on as re-articulation, not a second voice", () => {
    // Otherwise a trill grows the held map without bound.
    const e = pianoTrio();
    e.noteOn("piano", { note: 60, velocity: 90, atSec: 0 });
    e.noteOn("piano", { note: 60, velocity: 110, atSec: 0.2 });

    const piano = e.view(0.3).instruments[0]!;
    expect(piano.sounding).toHaveLength(1);
    expect(piano.sounding[0]!.velocity).toBe(110);
    expect(piano.noteOnCount).toBe(2);
  });

  it("keeps state finite across a long session", () => {
    const e = pianoTrio();
    for (let i = 0; i < 5000; i++) {
      const note = 21 + (i % 88);
      e.noteOn("piano", { note, velocity: 80, atSec: i * 0.01 });
      e.noteOff("piano", note, i * 0.01 + 0.005);
    }
    const piano = e.view(60).instruments[0]!;
    expect(piano.sounding).toHaveLength(0);
    expect(piano.recentlyReleased.length).toBeLessThanOrEqual(64);
    expect(piano.noteOnCount).toBe(5000);
  });

  it("clears everything on allNotesOff", () => {
    const e = pianoTrio();
    for (const n of [60, 64, 67]) e.noteOn("piano", { note: n, velocity: 90, atSec: 0 });
    e.allNotesOff("piano", 1);
    expect(e.view(1).instruments[0]!.sounding).toHaveLength(0);
  });
});

describe("guards", () => {
  it("names the registered instruments when given an unknown id", () => {
    const e = pianoTrio();
    expect(() => e.noteOn("banjo", { note: 60, velocity: 90, atSec: 0 }))
      .toThrow(/unknown instrument "banjo".*piano, guitar, voice/s);
  });

  it("refuses a duplicate id rather than silently merging two instruments", () => {
    const e = pianoTrio();
    expect(() => e.addInstrument({ id: "piano" })).toThrow(/already registered/i);
  });

  it("ignores a note-off for something not held", () => {
    // Engines send all-notes-off sweeps; throwing would make cleanup fatal.
    const e = pianoTrio();
    expect(() => e.noteOff("piano", 60, 1)).not.toThrow();
    expect(e.view(1).instruments[0]!.recentlyReleased).toHaveLength(0);
  });

  it("rejects an out-of-range note", () => {
    const e = pianoTrio();
    expect(() => e.noteOn("piano", { note: 200, velocity: 90, atSec: 0 }))
      .toThrow(/0-127/);
  });
});

describe("acoustic channel", () => {
  it("is null without a tap, and that is not the same as silent", () => {
    const e = pianoTrio();
    e.noteOn("piano", { note: 60, velocity: 90, atSec: 0 });
    const piano = e.view(0.5).instruments[0]!;
    expect(piano.acoustic).toBeNull();
    expect(piano.disagreement).toBeNull();
    expect(piano.sounding).toHaveLength(1); // still exactly known
  });

  it("carries a snapshot when a tap is attached, and adds the caveat", () => {
    const e = new Ensemble();
    const stream = new AudioStream({ sampleRate: SR, label: "piano" });
    e.addInstrument({ id: "piano", stream });
    stream.push(sine({ frequency: 440, duration: 0.5, sampleRate: SR }));

    const v = e.view(0.5);
    expect(v.instruments[0]!.acoustic).not.toBeNull();
    expect(v.caveat).toMatch(/exact rather than estimated/i);
  });

  it("flags a held note that the tap cannot hear", () => {
    const e = new Ensemble();
    const stream = new AudioStream({ sampleRate: SR, label: "piano" });
    e.addInstrument({ id: "piano", stream });
    stream.push(new Float64Array(SR)); // one second of silence

    e.noteOn("piano", { note: 60, velocity: 90, atSec: 0 });
    const piano = e.view(1.0).instruments[0]!; // held well past the tap's lag
    expect(piano.disagreement).toMatch(/measures nothing pitched/i);
  });

  it("does not flag a note younger than the tap's own latency", () => {
    // Silence in the measurement is EXPECTED before the analysis window fills.
    const e = new Ensemble();
    const stream = new AudioStream({ sampleRate: SR, label: "piano" });
    e.addInstrument({ id: "piano", stream });
    stream.push(new Float64Array(SR));

    e.noteOn("piano", { note: 60, velocity: 90, atSec: 0 });
    expect(e.view(0.005).instruments[0]!.disagreement).toBeNull();
  });

  it("does not fire on a chord the monophonic tap cannot resolve", () => {
    // The regression. A real triad renders audio that YIN correctly refuses to
    // name, so the earlier check fired on EVERY chord the piano played. Found by
    // running the whole chain on a real graph; the sine-based test below missed
    // it because a single sine is monophonic by construction.
    const e = new Ensemble();
    const stream = new AudioStream({ sampleRate: SR, label: "piano" });
    e.addInstrument({ id: "piano", stream });
    stream.push(new Float64Array(SR)); // audio present, no single resolvable pitch

    for (const n of [60, 64, 67]) e.noteOn("piano", { note: n, velocity: 90, atSec: 0 });
    expect(e.view(1.0).instruments[0]!.disagreement).toBeNull();
  });

  it("still fires when a SINGLE held note is inaudible", () => {
    // Narrowing to one note must not disable the check that earns its keep.
    const e = new Ensemble();
    const stream = new AudioStream({ sampleRate: SR, label: "piano" });
    e.addInstrument({ id: "piano", stream });
    stream.push(new Float64Array(SR));

    e.noteOn("piano", { note: 60, velocity: 90, atSec: 0 });
    expect(e.view(1.0).instruments[0]!.disagreement).toMatch(/C4 held .* nothing pitched/);
  });

  it("does not treat a chord as a disagreement", () => {
    // The tap is monophonic. A chord it cannot resolve is its documented
    // limitation, not a finding about the render.
    const e = new Ensemble();
    const stream = new AudioStream({ sampleRate: SR, label: "piano" });
    e.addInstrument({ id: "piano", stream });
    stream.push(sine({ frequency: 261.63, duration: 1, sampleRate: SR }));

    for (const n of [60, 64, 67]) e.noteOn("piano", { note: n, velocity: 90, atSec: 0 });
    expect(e.view(0.9).instruments[0]!.disagreement).toBeNull();
  });
});
