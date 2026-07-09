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
//
// Cockpit beat-model wave (module split): main.ts's score/time/scheduling
// logic was split into state.ts, time.ts, and transport.ts, each DOM-free
// for the same reason synth.ts/persistence.ts are — see time.test.ts,
// state.test.ts, and transport.test.ts (siblings of this file) for their
// coverage. This file keeps its original scope (synth.ts + persistence.ts)
// rather than absorbing those three; it only grew here where persistence.ts
// itself changed (the v1/v2->v3 seconds->beats migration, below).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { analyzeInterval, createSynth, TUNINGS } from "./synth.js";
import {
  serializeCockpitState, deserializeCockpitState, CURRENT_SCHEMA_VERSION,
} from "./persistence.js";
import { BPM_MIN, BPM_MAX, DEFAULT_BPM, secondsToBeats } from "./time.js";

// F-B1-001 (state persistence, Stage C) — the gap flagged in the note above
// (persistence code now lives in persistence.ts, a DOM-free module mirroring
// synth.ts, specifically so it's importable here).
//
// Schema v3 (cockpit beat-based time model, see time.ts's file header):
// CURRENT_SCHEMA_VERSION is now 3, and the notes serializeCockpitState
// writes/deserializeCockpitState reads-as-current are BEATS-shaped
// (startBeat/durationBeats) rather than the old seconds shape. The three
// describe blocks below cover, respectively: a plain v3 round-trip, the
// custom-cents behavior (F-A1-004) carried forward through the new schema,
// and (further down) the v1/v2->v3 migration specifics (real fixture,
// idempotency, the v1/v2 funnel, garbage rejection).
describe("serializeCockpitState / deserializeCockpitState round-trip (pins F-B1-001)", () => {
  const sample = {
    score: [{ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 }],
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
      v: CURRENT_SCHEMA_VERSION, bpm: 120, engine: "grand", voice: "kokoro-af-heart",
      tuning: "equal", refPitch: 440, mode: "instrument",
      score: [
        { midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 },
        { midi: NaN, startBeat: 0, durationBeats: 1, velocity: 100 }, // bad midi
        { midi: 64, startBeat: 1, durationBeats: 1, velocity: 999 },  // bad velocity
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

  it("returns null for a not-yet-existing future schema version (v:4)", () => {
    const raw = JSON.stringify({
      v: 4,
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

describe("serializeCockpitState / deserializeCockpitState — custom-cents tuning persistence (pins F-A1-004)", () => {
  const CUSTOM_CENTS = [0, 12, -7, 3, 9, -15, 0, 6, -11, 18, -4, 10];
  const v3Sample = {
    score: [{ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 }],
    bpm: 120, engine: "grand", voice: "kokoro-af-heart",
    tuning: "custom", refPitch: 440, mode: "instrument" as const,
    customCents: CUSTOM_CENTS,
  };

  it("round-trips a v3 state with a custom-cents tuning exactly (full 12-entry array preserved)", () => {
    const json = serializeCockpitState(v3Sample);
    expect(JSON.parse(json).v).toBe(CURRENT_SCHEMA_VERSION);
    const restored = deserializeCockpitState(json);
    expect(restored).toEqual({ v: CURRENT_SCHEMA_VERSION, ...v3Sample });
    expect(restored!.customCents).toEqual(CUSTOM_CENTS);
  });

  it("migrates a v1 blob (no customCents field at all, seconds notes) to v3 without throwing, leaving customCents undefined", () => {
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
    // secondsToBeats(0.5, 100) = 0.5 * 100/60.
    expect(restored!.score[0].durationBeats).toBeCloseTo(0.8333333, 5);
  });
});

describe("persistence schema v3 — beat-based notes migrated from legacy v1/v2 seconds (cockpit beat-model wave)", () => {
  it("migrates a real v2 fixture (seconds notes + customCents) to v3 beats using the SAVED bpm", () => {
    // A genuine pre-migration v2 autosave blob: seconds-based notes, bpm=90.
    // secondsToBeats(sec, 90) = sec * 90/60 = sec * 1.5.
    const v2Raw = JSON.stringify({
      v: 2,
      score: [
        { midi: 60, startSec: 0, durationSec: 0.5, velocity: 100 },
        { midi: 64, startSec: 2, durationSec: 1, velocity: 90, vowel: "a", breathiness: 0.3 },
      ],
      bpm: 90, engine: "grand", voice: "kokoro-af-heart",
      tuning: "custom", refPitch: 440, mode: "instrument",
      customCents: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100],
    });
    const restored = deserializeCockpitState(v2Raw);
    expect(restored).not.toBeNull();
    expect(restored!.v).toBe(CURRENT_SCHEMA_VERSION);
    expect(restored!.score).toEqual([
      { midi: 60, startBeat: 0, durationBeats: 0.75, velocity: 100 },
      { midi: 64, startBeat: 3, durationBeats: 1.5, velocity: 90, vowel: "a", breathiness: 0.3 },
    ]);
    expect(restored!.customCents).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100]);
  });

  it("funnels v1 (no customCents, seconds notes) through the identical seconds->beats conversion as v2", () => {
    const v1Raw = JSON.stringify({
      v: 1,
      score: [{ midi: 60, startSec: 1, durationSec: 0.5, velocity: 100 }],
      bpm: 120, engine: "grand", voice: "kokoro-af-heart",
      tuning: "equal", refPitch: 440, mode: "instrument",
    });
    const restored = deserializeCockpitState(v1Raw);
    expect(restored).not.toBeNull();
    expect(restored!.v).toBe(CURRENT_SCHEMA_VERSION);
    // secondsToBeats(1, 120) = 2 beats; secondsToBeats(0.5, 120) = 1 beat.
    expect(restored!.score).toEqual([{ midi: 60, startBeat: 2, durationBeats: 1, velocity: 100 }]);
  });

  it("treats a missing `v` field the same as v1 (same leniency as the pre-v2 reader)", () => {
    const raw = JSON.stringify({
      score: [{ midi: 60, startSec: 1, durationSec: 1, velocity: 100 }],
      bpm: 60, engine: "grand", voice: "kokoro-af-heart",
      tuning: "equal", refPitch: 440, mode: "instrument",
    });
    const restored = deserializeCockpitState(raw);
    expect(restored).not.toBeNull();
    // secondsToBeats(1, 60) = 1 beat (1 sec = 1 beat at 60bpm).
    expect(restored!.score).toEqual([{ midi: 60, startBeat: 1, durationBeats: 1, velocity: 100 }]);
  });

  it("is idempotent: re-serializing and re-deserializing an already-migrated v3 state does not re-apply the conversion", () => {
    const v2Raw = JSON.stringify({
      v: 2,
      score: [{ midi: 60, startSec: 2, durationSec: 1, velocity: 100 }],
      bpm: 90, engine: "grand", voice: "kokoro-af-heart",
      tuning: "equal", refPitch: 440, mode: "instrument",
    });
    const firstMigration = deserializeCockpitState(v2Raw)!;
    const { v: _v, ...rest } = firstMigration;
    const reSerialized = serializeCockpitState(rest);
    const secondPass = deserializeCockpitState(reSerialized);
    expect(secondPass).toEqual(firstMigration);
  });

  it("rejects a v1/v2 note whose seconds fields are garbage without failing the whole restore", () => {
    const raw = JSON.stringify({
      v: 1, bpm: 120, engine: "grand", voice: "kokoro-af-heart",
      tuning: "equal", refPitch: 440, mode: "instrument",
      score: [
        { midi: 60, startSec: 0, durationSec: 0.5, velocity: 100 },
        { midi: 62, startSec: -1, durationSec: 0.5, velocity: 100 }, // negative startSec
        { midi: 64, startSec: 0, durationSec: NaN, velocity: 100 },  // non-finite durationSec
      ],
    });
    const restored = deserializeCockpitState(raw);
    expect(restored?.score).toHaveLength(1);
    expect(restored?.score[0]).toEqual({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
  });

  it("rejects a v3 note whose beats fields are garbage (negative/non-finite) without failing the whole restore", () => {
    const raw = JSON.stringify({
      v: CURRENT_SCHEMA_VERSION, bpm: 120, engine: "grand", voice: "kokoro-af-heart",
      tuning: "equal", refPitch: 440, mode: "instrument",
      score: [
        { midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 },
        { midi: 62, startBeat: -1, durationBeats: 1, velocity: 100 },      // negative startBeat
        { midi: 64, startBeat: 0, durationBeats: Infinity, velocity: 100 }, // non-finite durationBeats
      ],
    });
    const restored = deserializeCockpitState(raw);
    expect(restored?.score).toHaveLength(1);
    expect(restored?.score[0]).toEqual({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
  });
});

// Wave C0 adversarial-verify fix (MEDIUM): "migration bpm vs restored bpm
// divergence on corrupt blobs". Before this fix, the persisted `bpm` field
// was only finite-checked (falling back to 120 for a non-number), never
// clamped — the legacy seconds->beats conversion below went through
// secondsToBeats, whose internal safeBpm() substitutes DEFAULT_BPM (120)
// for a non-finite/<=0 bpm but otherwise passes the raw value straight
// through, while the RETURNED/restored state kept that same raw
// (unclamped) bpm. main.ts's restoreFromStorage funnels that raw bpm
// through importScore's OWN clampBpm call, so a blob with bpm:0 had its
// notes converted to beats at 120bpm (safeBpm's substitution) but the
// restored session then played back at bpm:20 (clampBpm's floor) — a 6x
// tempo mismatch between how the notes were laid out and how they
// actually play. The fix clamps bpm ONCE, in the sanitizer, so the
// conversion and the returned state can never disagree again.
describe("deserializeCockpitState — bpm is clamped ONCE so conversion and restored state always agree (Wave C0 fix)", () => {
  it("a corrupt {bpm:0} blob no longer converts notes at 120bpm while restoring the session at 20bpm (the exact regression from the finding)", () => {
    const raw = JSON.stringify({
      v: 2, bpm: 0, engine: "grand", voice: "kokoro-af-heart",
      tuning: "equal", refPitch: 440, mode: "instrument",
      score: [{ midi: 60, startSec: 2, durationSec: 1, velocity: 100 }],
    });
    const restored = deserializeCockpitState(raw);
    expect(restored).not.toBeNull();
    // Clamped to BPM_MIN (20), not silently substituted to DEFAULT_BPM
    // (120) the way the old safeBpm-only conversion path effectively was.
    expect(restored!.bpm).toBe(BPM_MIN);
    // The conversion used the SAME clamped bpm (20), not 120 — so
    // re-deriving the expected beats from the RESTORED bpm (rather than a
    // hardcoded number) is the actual regression check: this is the
    // "conversion and restored state use the SAME value" property, not
    // just a specific number.
    expect(restored!.score[0].startBeat).toBeCloseTo(secondsToBeats(2, restored!.bpm), 10);
    expect(restored!.score[0].durationBeats).toBeCloseTo(secondsToBeats(1, restored!.bpm), 10);
    // Sanity: this is NOT what the old (buggy) 120bpm conversion would have
    // produced (secondsToBeats(2, 120) === 4, vs. the correct 0.6666...).
    expect(restored!.score[0].startBeat).not.toBeCloseTo(secondsToBeats(2, 120), 5);
  });

  it("a {bpm:1e308} blob clamps to BPM_MAX instead of overflowing the conversion to Infinity", () => {
    const raw = JSON.stringify({
      v: 2, bpm: 1e308, engine: "grand", voice: "kokoro-af-heart",
      tuning: "equal", refPitch: 440, mode: "instrument",
      score: [{ midi: 60, startSec: 2, durationSec: 1, velocity: 100 }],
    });
    const restored = deserializeCockpitState(raw);
    expect(restored).not.toBeNull();
    expect(restored!.bpm).toBe(BPM_MAX);
    expect(Number.isFinite(restored!.score[0].startBeat)).toBe(true);
    expect(Number.isFinite(restored!.score[0].durationBeats)).toBe(true);
    expect(restored!.score[0].startBeat).toBeCloseTo(secondsToBeats(2, restored!.bpm), 10);
  });

  it("a {bpm:NaN} blob (NaN has no JSON literal — it serializes to null over the wire, exactly as a real corrupt autosave would) falls back to DEFAULT_BPM, not a mismatched value", () => {
    // JSON.stringify({bpm: NaN, ...}) legitimately emits `"bpm":null` (NaN/
    // Infinity both serialize to null per the JSON.stringify spec) — this
    // IS how a NaN-poisoned bpm would actually reach localStorage, so
    // building the fixture from a literal NaN (rather than hand-writing
    // `bpm: null`) documents that real-world provenance.
    const raw = JSON.stringify({
      v: 2, bpm: NaN, engine: "grand", voice: "kokoro-af-heart",
      tuning: "equal", refPitch: 440, mode: "instrument",
      score: [{ midi: 60, startSec: 2, durationSec: 1, velocity: 100 }],
    });
    const restored = deserializeCockpitState(raw);
    expect(restored).not.toBeNull();
    expect(restored!.bpm).toBe(DEFAULT_BPM);
    expect(Number.isFinite(restored!.score[0].startBeat)).toBe(true);
    expect(restored!.score[0].startBeat).toBeCloseTo(secondsToBeats(2, restored!.bpm), 10);
  });

  it("drops an individual legacy note whose seconds value overflows to Infinity during conversion, without failing the whole restore (bpm itself can be perfectly normal — the overflow comes from an unbounded startSec/durationSec, which sanitizeNoteSeconds only bounds below)", () => {
    const raw = JSON.stringify({
      v: 1, bpm: 120, engine: "grand", voice: "kokoro-af-heart",
      tuning: "equal", refPitch: 440, mode: "instrument",
      score: [
        { midi: 60, startSec: 0, durationSec: 0.5, velocity: 100 },       // normal note — survives
        { midi: 64, startSec: 1e308, durationSec: 0.5, velocity: 100 },   // 1e308 * 120 / 60 overflows to Infinity
      ],
    });
    const restored = deserializeCockpitState(raw);
    expect(restored).not.toBeNull();
    expect(restored!.score).toHaveLength(1);
    expect(restored!.score[0]).toEqual({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
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
