// ─── pure-logic.test.ts ────────────────────────────────────────────────────────
//
// apps/cockpit has no test infrastructure at all (F-8ecee53e — no
// vitest/testing-library dependency in its package.json, no test script).
// Per this wave's brief: do NOT build a browser harness this wave. This file
// covers ONLY the pure, DOM-free functions importable directly from
// synth.ts — confirmed by inspection: synth.ts's module-level code never
// touches AudioContext/window/document (those only appear inside function
// bodies like connect()/noteOn()/playReferenceTone(), none of which this file
// calls). createSynth() itself is also DOM-free — it just builds closures;
// nothing instantiates a real AudioContext until .connect() is called.
//
// main.ts is deliberately NOT imported here: it calls
// `boot().catch(console.error)` unconditionally at module top level, which
// touches `document`/`window` immediately on import and would throw in this
// Node/vitest environment. Its bpm-clamp contract (F-6d555506, "bpm clamp
// rejects negative/NaN" on the import path) is therefore left to the
// coordinator's frontend verifier lenses rather than a test in this file —
// see the swarm output's `skipped` entry for this specific sub-item.
//
// FL1-001 (keyboard-editing scope hardening) — SKIPPED, same reason as the
// bpm-clamp note above. isRollEditContext() and isActivatableControl() (both
// in main.ts) remain internal, unexported, DOM-bound functions —
// isRollEditContext() reads document.activeElement/getElementById directly,
// and isActivatableControl(), though it only touches its Element argument,
// is only reachable by importing main.ts, which still runs boot() at module
// top level on import. Neither was extracted into a DOM-free importable form
// by the fix, so there is nothing new to unit-test from this pure/Node file.
// The keyboard-scope behavior they implement is covered by the coordinator's
// manual/verifier check, not by an automated test here.
//
// F-B1-001 / F-59d3148a (state persistence) — RESOLVED. The pure serialize/
// deserialize/migrate surface flagged as missing below now lives in
// persistence.ts, a DOM-free module mirroring synth.ts's own import-safe
// pattern (main.ts is the only place that touches actual localStorage, and
// every call there is try/catch-wrapped for private-mode/quota safety). See
// the "serializeCockpitState / deserializeCockpitState round-trip" describe
// block below for coverage.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { analyzeInterval, createSynth, TUNINGS } from "./synth.js";
import {
  serializeCockpitState, deserializeCockpitState, CURRENT_SCHEMA_VERSION,
} from "./persistence.js";

// F-B1-001 (state persistence, Stage C) — the gap flagged in the note above
// (persistence code now lives in persistence.ts, a DOM-free module mirroring
// synth.ts, specifically so it's importable here).
describe("serializeCockpitState / deserializeCockpitState round-trip (pins F-B1-001)", () => {
  const sample = {
    score: [{ midi: 60, startSec: 0, durationSec: 0.5, velocity: 100 }],
    bpm: 120, engine: "grand", voice: "kokoro-af-heart",
    tuning: "equal", refPitch: 440, mode: "instrument" as const,
  };

  it("round-trips a well-formed state exactly", () => {
    const json = serializeCockpitState(sample);
    const restored = deserializeCockpitState(json);
    expect(restored).toEqual({ v: CURRENT_SCHEMA_VERSION, ...sample });
  });

  it("stamps the current schema version regardless of what the caller passes", () => {
    const json = serializeCockpitState(sample);
    expect(JSON.parse(json).v).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("returns null for corrupt JSON instead of throwing", () => {
    expect(() => deserializeCockpitState("{not json")).not.toThrow();
    expect(deserializeCockpitState("{not json")).toBeNull();
  });

  it("returns null for a foreign/unrecognised schema version", () => {
    expect(deserializeCockpitState(JSON.stringify({ ...sample, v: 999, score: [] }))).toBeNull();
  });

  it("returns null when score isn't an array", () => {
    expect(deserializeCockpitState(JSON.stringify({ ...sample, score: "nope" }))).toBeNull();
  });

  it("drops individual malformed notes instead of failing the whole restore", () => {
    const raw = JSON.stringify({
      v: 1, bpm: 120, engine: "grand", voice: "kokoro-af-heart",
      tuning: "equal", refPitch: 440, mode: "instrument",
      score: [
        { midi: 60, startSec: 0, durationSec: 0.5, velocity: 100 },
        { midi: NaN, startSec: 0, durationSec: 0.5, velocity: 100 }, // bad midi
        { midi: 64, startSec: 1, durationSec: 0.5, velocity: 999 },  // bad velocity
      ],
    });
    const restored = deserializeCockpitState(raw);
    expect(restored?.score.length).toBe(1);
    expect(restored?.score[0].midi).toBe(60);
  });

  it("falls back to safe defaults for missing/invalid scalar fields", () => {
    const restored = deserializeCockpitState(JSON.stringify({ score: [] }));
    expect(restored).not.toBeNull();
    expect(Number.isFinite(restored!.bpm)).toBe(true);
    expect(Number.isFinite(restored!.refPitch)).toBe(true);
    expect(restored!.mode).toBe("instrument");
  });
});

describe("serializeCockpitState / deserializeCockpitState — schema v2 customCents (pins F-A1-004)", () => {
  const CUSTOM_CENTS = [0, 12, -7, 3, 9, -15, 0, 6, -11, 18, -4, 10];
  const v2Sample = {
    score: [{ midi: 60, startSec: 0, durationSec: 0.5, velocity: 100 }],
    bpm: 120, engine: "grand", voice: "kokoro-af-heart",
    tuning: "custom", refPitch: 440, mode: "instrument" as const,
    customCents: CUSTOM_CENTS,
  };

  it("round-trips a v2 state with a custom-cents tuning exactly (full 12-entry array preserved)", () => {
    const json = serializeCockpitState(v2Sample);
    expect(JSON.parse(json).v).toBe(2);
    const restored = deserializeCockpitState(json);
    expect(restored).toEqual({ v: CURRENT_SCHEMA_VERSION, ...v2Sample });
    expect(restored!.customCents).toEqual(CUSTOM_CENTS);
  });

  it("migrates a v1 blob (no customCents field at all) to a valid v2 state without throwing", () => {
    const v1Raw = JSON.stringify({
      v: 1,
      score: [{ midi: 60, startSec: 0, durationSec: 0.5, velocity: 100 }],
      bpm: 100, engine: "grand", voice: "kokoro-af-heart",
      tuning: "equal", refPitch: 440, mode: "instrument",
      // genuinely absent — a real pre-F-A1-004 v1 autosave blob never had this key
    });
    expect(() => deserializeCockpitState(v1Raw)).not.toThrow();
    const restored = deserializeCockpitState(v1Raw);
    expect(restored).not.toBeNull();
    expect(restored!.v).toBe(CURRENT_SCHEMA_VERSION);
    expect(restored!.customCents).toBeUndefined();
    expect(restored!.tuning).toBe("equal");
    expect(restored!.bpm).toBe(100);
    expect(restored!.score).toHaveLength(1);
  });

  it("returns null for a not-yet-existing future schema version (v:3)", () => {
    const raw = JSON.stringify({
      v: 3,
      score: [],
      bpm: 120, engine: "grand", voice: "kokoro-af-heart",
      tuning: "equal", refPitch: 440, mode: "instrument",
    });
    expect(deserializeCockpitState(raw)).toBeNull();
  });

  it("returns null for an invalid schema version (v:0)", () => {
    const raw = JSON.stringify({
      v: 0,
      score: [],
      bpm: 120, engine: "grand", voice: "kokoro-af-heart",
      tuning: "equal", refPitch: 440, mode: "instrument",
    });
    expect(deserializeCockpitState(raw)).toBeNull();
  });
});

describe("analyzeInterval — octave folding (pins F-41e28586)", () => {
  it("reports 12 semitones as P8 (Octave), not P1 (Unison)", () => {
    // Before the fix: `semitones = ((midi2 - midi1) % 12 + 12) % 12` folded
    // 12 to 0 via a plain modulo, so the built-in P8 test button (semitones:
    // 12) matched PURE_INTERVALS[0] and reported a pure 2:1 octave as a
    // "WOLF unison" with +1200 cents deviation.
    const result = analyzeInterval(60, 72, TUNINGS.equal, 440);
    expect(result.intervalName).toBe("P8 (Octave)");
    // Equal temperament defines the octave as exactly a 2:1 ratio, so a true
    // octave has ~0 deviation from "pure" — not the ~1200 cents a
    // misclassified unison would report.
    expect(Math.abs(result.deviationCents)).toBeLessThan(0.01);
  });

  it("still reports a true unison (0 semitones) as P1 (Unison), not folded away by the fix", () => {
    // Companion check for the same bug: before the fix, BOTH 0 and 12
    // semitones collided on PURE_INTERVALS[0] via the plain `% 12` fold.
    // This proves the fix actually distinguishes the two inputs rather than
    // just moving the collision somewhere else (e.g. always reporting P8).
    const result = analyzeInterval(60, 60, TUNINGS.equal, 440);
    expect(result.intervalName).toBe("P1 (Unison)");
    expect(Math.abs(result.deviationCents)).toBeLessThan(0.01);
  });

  it("reports a perfect fifth (7 semitones, unaffected by the octave-folding fix) correctly", () => {
    const result = analyzeInterval(60, 67, TUNINGS.equal, 440);
    expect(result.intervalName).toBe("P5");
  });

  it("reports 24 semitones (2 octaves) distinctly from a true unison", () => {
    const result = analyzeInterval(60, 84, TUNINGS.equal, 440);
    expect(result.intervalName).not.toBe("P1 (Unison)");
    expect(result.intervalName.toLowerCase()).toContain("octave");
    expect(Math.abs(result.deviationCents)).toBeLessThan(0.01);
  });
});

describe("createSynth().setRefPitch — NaN/non-finite guard (pins F-a8db61fa)", () => {
  it("leaves refPitch unchanged (finite) when given NaN instead of propagating it", () => {
    // Math.max(392, Math.min(494, NaN)) === NaN — Math.min/max propagate
    // NaN silently. parseInt('') from an emptied #ref-pitch input yields
    // exactly this NaN. Before the fix, every subsequent midiToFreq call
    // would return NaN, bricking noteOn with a non-finite AudioParam throw.
    const synth = createSynth();
    const before = synth.getRefPitch();
    expect(Number.isFinite(before)).toBe(true);

    synth.setRefPitch(NaN);

    const after = synth.getRefPitch();
    expect(Number.isFinite(after)).toBe(true);
    expect(after).toBe(before);
  });

  it("rejects Infinity the same way as NaN (leaves refPitch unchanged)", () => {
    const synth = createSynth();
    const before = synth.getRefPitch();
    synth.setRefPitch(Infinity);
    expect(synth.getRefPitch()).toBe(before);
    synth.setRefPitch(-Infinity);
    expect(synth.getRefPitch()).toBe(before);
  });

  it("still applies a normal, valid, in-range refPitch", () => {
    const synth = createSynth();
    synth.setRefPitch(442);
    expect(synth.getRefPitch()).toBe(442);
  });

  it("still clamps an out-of-range but finite refPitch to [392, 494]", () => {
    const synth = createSynth();
    synth.setRefPitch(1000);
    expect(synth.getRefPitch()).toBe(494);
    synth.setRefPitch(1);
    expect(synth.getRefPitch()).toBe(392);
  });
});
