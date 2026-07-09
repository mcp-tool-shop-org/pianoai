// ─── measures.test.ts ──────────────────────────────────────────────────────────
//
// Tests for src/songs/midi/measures.ts, pinning F-39068b04 (CRITICAL):
// ticksPerMeasure(ticksPerBeat, numerator, denominator) returns exactly 0 when
// a MIDI-sourced numerator/denominator is 0. resolveTimeSignature passed
// MIDI-event-derived numerator/denominator straight through with NO
// validation; computeTotalMeasures then computed Math.ceil(x / 0) = Infinity,
// and sliceIntoMeasures's `for (let m = 0; m < totalMeasures; m++)` became a
// practically permanent event-loop-blocking loop. This sits on the
// UNCONDITIONAL startup path (initializeFromLibrary → ingestSong runs this
// exact code for every bundled + user song on every server/CLI start).
//
// Fix contract (per the routed finding's fix text):
//   - parseTimeSignature already validates '> 0' on the config-string path
//     and falls back to 4/4 on invalid input (unchanged, pre-existing).
//   - resolveTimeSignature must apply the SAME validation to MIDI-sourced
//     numerator/denominator, falling back to 4/4 when either is <= 0 (or
//     otherwise degenerate), so ticksPerMeasure can never be handed a value
//     that zeroes it out.
//   - computeTotalMeasures caps its result at a sane maximum (defense in
//     depth) so a degenerate tpm can never produce an unbounded loop
//     regardless of where the bad value originated.
//
// None of these paths are specified to THROW — they degrade gracefully
// (fall back to 4/4 / cap the total), matching parseTimeSignature's existing,
// unchanged convention. This file proves termination (never Infinity/NaN,
// never hangs) via explicit per-test timeouts rather than asserting a throw.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  parseTimeSignature,
  resolveTimeSignature,
  ticksPerMeasure,
  computeTotalMeasures,
  sliceIntoMeasures,
  MAX_MEASURES,
} from "./measures.js";
import type { TimeSigEvent, ResolvedNote } from "./types.js";
import { JamError } from "../../errors.js";

function note(startTick: number, durationTicks: number): ResolvedNote {
  return { noteNumber: 60, startTick, durationTicks, velocity: 80, channel: 0 };
}

function timeSigEvent(numerator: number, denominator: number, tick = 0): TimeSigEvent {
  return { tick, numerator, denominator };
}

// ─── parseTimeSignature ───────────────────────────────────────────────────────

describe("parseTimeSignature", () => {
  it("parses a valid time signature string", () => {
    expect(parseTimeSignature("3/4")).toEqual({ numerator: 3, denominator: 4 });
    expect(parseTimeSignature("6/8")).toEqual({ numerator: 6, denominator: 8 });
  });

  it("normalizes a zero numerator to 4/4 (numerator never < 1)", () => {
    const result = parseTimeSignature("0/4");
    expect(result.numerator).toBeGreaterThanOrEqual(1);
    expect(result).toEqual({ numerator: 4, denominator: 4 });
  });

  it("normalizes a negative numerator to 4/4", () => {
    const result = parseTimeSignature("-2/4");
    expect(result.numerator).toBeGreaterThanOrEqual(1);
    expect(result).toEqual({ numerator: 4, denominator: 4 });
  });

  it("normalizes a zero denominator to 4/4", () => {
    const result = parseTimeSignature("4/0");
    expect(result.denominator).toBeGreaterThanOrEqual(1);
    expect(result).toEqual({ numerator: 4, denominator: 4 });
  });

  it("normalizes unparseable garbage input to 4/4 without throwing", () => {
    expect(() => parseTimeSignature("garbage")).not.toThrow();
    expect(parseTimeSignature("garbage")).toEqual({ numerator: 4, denominator: 4 });
  });

  it("normalizes undefined input to 4/4", () => {
    expect(parseTimeSignature(undefined)).toEqual({ numerator: 4, denominator: 4 });
  });
});

// ─── resolveTimeSignature — MIDI-sourced validation (pins F-39068b04) ────────

describe("resolveTimeSignature — MIDI-sourced numerator/denominator must be validated", () => {
  it("falls back to a safe signature when the MIDI event's numerator is 0", () => {
    const result = resolveTimeSignature([timeSigEvent(0, 4)]);
    expect(result.numerator).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(result.numerator)).toBe(true);
    // Directly pin the CRITICAL finding: whatever resolveTimeSignature
    // returns must never zero out ticksPerMeasure.
    expect(ticksPerMeasure(480, result.numerator, result.denominator)).toBeGreaterThanOrEqual(1);
  });

  it("falls back to a safe signature when the MIDI event's denominator is 0", () => {
    const result = resolveTimeSignature([timeSigEvent(4, 0)]);
    expect(result.denominator).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(result.denominator)).toBe(true);
    expect(ticksPerMeasure(480, result.numerator, result.denominator)).toBeGreaterThanOrEqual(1);
  });

  it("falls back to a safe signature when the MIDI event's numerator is negative", () => {
    const result = resolveTimeSignature([timeSigEvent(-4, 4)]);
    expect(result.numerator).toBeGreaterThanOrEqual(1);
  });

  it("falls back to a safe signature when both numerator and denominator are 0", () => {
    const result = resolveTimeSignature([timeSigEvent(0, 0)]);
    expect(result.numerator).toBeGreaterThanOrEqual(1);
    expect(result.denominator).toBeGreaterThanOrEqual(1);
    expect(ticksPerMeasure(480, result.numerator, result.denominator)).toBeGreaterThanOrEqual(1);
  });

  it("still honors a valid, well-formed MIDI-sourced time signature unchanged", () => {
    const result = resolveTimeSignature([timeSigEvent(3, 8)]);
    expect(result).toEqual({ numerator: 3, denominator: 8 });
  });

  it("config string still takes priority over MIDI events when both are present", () => {
    const result = resolveTimeSignature([timeSigEvent(3, 8)], "5/4");
    expect(result).toEqual({ numerator: 5, denominator: 4 });
  });

  it("falls back to 4/4 when no MIDI events and no config string are supplied", () => {
    expect(resolveTimeSignature([])).toEqual({ numerator: 4, denominator: 4 });
  });
});

// ─── ticksPerMeasure ──────────────────────────────────────────────────────────

describe("ticksPerMeasure", () => {
  it("computes ticks for standard signatures", () => {
    expect(ticksPerMeasure(480, 4, 4)).toBe(1920);
    expect(ticksPerMeasure(480, 3, 4)).toBe(1440);
    expect(ticksPerMeasure(480, 6, 8)).toBe(1440);
  });

  it("is always >= 1 for every numerator/denominator resolveTimeSignature can produce from a malformed MIDI event", () => {
    const malformedInputs: TimeSigEvent[][] = [
      [timeSigEvent(0, 4)],
      [timeSigEvent(4, 0)],
      [timeSigEvent(-1, 4)],
      [timeSigEvent(0, 0)],
      [],
    ];
    for (const events of malformedInputs) {
      const { numerator, denominator } = resolveTimeSignature(events);
      const tpm = ticksPerMeasure(480, numerator, denominator);
      expect(tpm).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(tpm)).toBe(true);
      expect(Number.isNaN(tpm)).toBe(false);
    }
  });

  it("is always >= 1 even when called directly with degenerate numerator/denominator/ticksPerBeat (no upstream guard)", () => {
    // ticksPerMeasure sanitizes its own inputs internally now, independent of
    // whether a caller routes through resolveTimeSignature first — a second,
    // independent line of defense for F-39068b04.
    const degenerateCalls: Array<[number, number, number]> = [
      [480, 0, 4],
      [480, 4, 0],
      [480, -4, 4],
      [480, NaN, 4],
      [0, 4, 4],
      [NaN, 4, 4],
    ];
    for (const [ticksPerBeat, numerator, denominator] of degenerateCalls) {
      const tpm = ticksPerMeasure(ticksPerBeat, numerator, denominator);
      expect(tpm).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(tpm)).toBe(true);
    }
  });
});

// ─── computeTotalMeasures — malformed-tpm termination (defense in depth) ────

describe("computeTotalMeasures — throws a structured error instead of Infinity/NaN, never hangs", () => {
  it(
    "throws a structured JamError (INPUT_INVALID_SONG) instead of returning Infinity when tpm is 0 and the note range is huge",
    () => {
      const notes: ResolvedNote[] = [note(5_000_000, 100)];
      // The finite-termination proof: if this ever regressed to computing
      // Math.ceil(x / 0) = Infinity and returning it silently (rather than
      // detecting the overflow and throwing), a caller feeding that Infinity
      // into sliceIntoMeasures's `for (let m = 0; m < totalMeasures; m++)`
      // loop would hang forever. The per-test timeout below fails the suite
      // loudly instead of the process hanging if that regression reappears.
      let thrown: unknown;
      try {
        computeTotalMeasures(notes, 0);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(JamError);
      const jamErr = thrown as JamError;
      expect(jamErr.code).toBe("INPUT_INVALID_SONG");
      expect(Number.isFinite(jamErr.message.length)).toBe(true);
      expect(jamErr.message.length).toBeGreaterThan(0);
    },
    2000,
  );

  it("throws the same structured error for a degenerate tpm with a very large note tick (never Infinity/NaN, never a bare unstructured throw)", () => {
    const notes: ResolvedNote[] = [note(Number.MAX_SAFE_INTEGER / 2, 1)];
    expect(() => computeTotalMeasures(notes, 0)).toThrow(JamError);
    try {
      computeTotalMeasures(notes, 0);
      expect.fail("expected computeTotalMeasures to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(JamError);
      expect((err as JamError).code).toBe("INPUT_INVALID_SONG");
    }
  });

  it("includes the songId/source context in the thrown error's message when provided", () => {
    const notes: ResolvedNote[] = [note(5_000_000, 100)];
    try {
      computeTotalMeasures(notes, 0, { songId: "test-song-id", source: "test.mid" });
      expect.fail("expected computeTotalMeasures to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(JamError);
      expect((err as JamError).message).toContain("test-song-id");
      expect((err as JamError).message).toContain("test.mid");
    }
  });

  it("computes a correct (non-throwing) total for a normal, valid tpm", () => {
    const notes: ResolvedNote[] = [note(0, 100), note(1920, 100)];
    expect(computeTotalMeasures(notes, 1920)).toBe(2);
  });

  it("returns >= 1 for an empty note list regardless of tpm, including degenerate tpm (never throws on empty input)", () => {
    expect(computeTotalMeasures([], 0)).toBeGreaterThanOrEqual(1);
    expect(computeTotalMeasures([], 1920)).toBe(1);
  });

  it("does not throw for a note range that lands exactly at MAX_MEASURES", () => {
    // tpm=1 so lastNoteTick directly drives the measure count.
    const notes: ResolvedNote[] = [note(MAX_MEASURES - 1, 1)];
    expect(computeTotalMeasures(notes, 1)).toBe(MAX_MEASURES);
  });
});

describe("sliceIntoMeasures — defense-in-depth clamp (independent of computeTotalMeasures's own cap)", () => {
  it(
    "clamps an Infinity totalMeasures to MAX_MEASURES and terminates promptly instead of looping forever",
    () => {
      // Simulates a future caller bypassing computeTotalMeasures's own throw
      // and passing a degenerate totalMeasures straight through — the
      // source's own comment documents this as a deliberate second line of
      // defense. If the clamp ever regressed, `for (let m = 0; m <
      // totalMeasures; m++)` with totalMeasures=Infinity would hang the
      // event loop; the timeout below turns that into a loud test failure.
      const notes: ResolvedNote[] = [note(0, 10)];
      const buckets = sliceIntoMeasures(notes, Infinity, 1);
      expect(buckets.length).toBe(MAX_MEASURES);
    },
    2000,
  );

  it("clamps a NaN totalMeasures to MAX_MEASURES rather than producing zero/negative-length behavior", () => {
    const notes: ResolvedNote[] = [note(0, 10)];
    const buckets = sliceIntoMeasures(notes, NaN, 1);
    expect(buckets.length).toBe(MAX_MEASURES);
  });

  it("produces the exact requested bucket count for a normal, valid totalMeasures", () => {
    const notes: ResolvedNote[] = [note(0, 10), note(1920, 10)];
    const buckets = sliceIntoMeasures(notes, 2, 1920);
    expect(buckets.length).toBe(2);
    expect(buckets[0].notes).toHaveLength(1);
    expect(buckets[1].notes).toHaveLength(1);
  });
});
