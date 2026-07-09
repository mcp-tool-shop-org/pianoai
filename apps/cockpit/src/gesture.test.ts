// ─── gesture.test.ts ─────────────────────────────────────────────────────────
//
// Pure, DOM-free coverage for gesture.ts's deferred-snap drag math, move-mode
// tap targeting, resize-step clamping, and the thin-row drag-initiation
// fallback (Wave C2b) — same "plain numbers in, plain numbers/objects out,
// no window/document" testability as ruler.test.ts/time.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  isDeferredSnapPointer, resolveDragBeats, commitDragBeats,
  moveModeTarget, resizeStepTarget, findNearbyNoteForDragInit,
  type NoteHitCandidate,
} from "./gesture.js";
import { QUANTIZE_GRID_BEATS, PX_PER_BEAT } from "./time.js";

describe("isDeferredSnapPointer", () => {
  it("is true only for touch", () => {
    expect(isDeferredSnapPointer("touch")).toBe(true);
  });

  it("is false for mouse and pen", () => {
    expect(isDeferredSnapPointer("mouse")).toBe(false);
    expect(isDeferredSnapPointer("pen")).toBe(false);
  });

  it("defaults an unrecognized pointerType to the safer live-snap path", () => {
    // Browsers occasionally add new PointerEvent.pointerType values — an
    // unknown string must fall back to the pre-existing (live-snap)
    // behavior, not silently opt into the newer deferred path.
    expect(isDeferredSnapPointer("")).toBe(false);
    expect(isDeferredSnapPointer("stylus-future-type")).toBe(false);
  });
});

describe("resolveDragBeats — deferred-snap resolution (finding 45)", () => {
  it("mouse: quantizes live on every tick", () => {
    expect(resolveDragBeats(2.13, "mouse")).toBe(quantizeExpected(2.13));
    expect(resolveDragBeats(4.9, "mouse")).toBe(quantizeExpected(4.9));
  });

  it("pen: quantizes live, same as mouse", () => {
    expect(resolveDragBeats(3.37, "pen")).toBe(quantizeExpected(3.37));
  });

  it("touch: returns the RAW value, unsnapped, during the drag", () => {
    expect(resolveDragBeats(2.13, "touch")).toBeCloseTo(2.13, 10);
    expect(resolveDragBeats(4.9017, "touch")).toBeCloseTo(4.9017, 10);
  });

  it("touch: floors at 0 (never negative), same floor mouse quantization applies", () => {
    expect(resolveDragBeats(-3.4, "touch")).toBe(0);
    expect(resolveDragBeats(-0.001, "touch")).toBe(0);
  });

  it("mouse and touch diverge mid-gesture at a non-grid-aligned raw value", () => {
    const raw = 5.13; // not a multiple of QUANTIZE_GRID_BEATS (0.25)
    const mouseTick = resolveDragBeats(raw, "mouse");
    const touchTick = resolveDragBeats(raw, "touch");
    expect(mouseTick).not.toBe(touchTick);
    expect(mouseTick).toBe(quantizeExpected(raw));
    expect(touchTick).toBeCloseTo(raw, 10);
  });

  it("honors a custom grid for mouse quantization", () => {
    expect(resolveDragBeats(1.6, "mouse", 1)).toBe(2);
    expect(resolveDragBeats(1.4, "mouse", 1)).toBe(1);
  });
});

describe("commitDragBeats — release-time commit (finding 45)", () => {
  it("quantizes a raw touch-drag value on release", () => {
    expect(commitDragBeats(4.9017)).toBe(quantizeExpected(4.9017));
  });

  it("is idempotent on an already-quantized (mouse-drag) value", () => {
    const already = quantizeExpected(3.37);
    expect(commitDragBeats(already)).toBe(already);
  });

  it("floors at 0", () => {
    expect(commitDragBeats(-5)).toBe(0);
  });

  it("mouse and touch paths converge to the SAME committed value at release", () => {
    // The whole point of finding 45: touch stays unsnapped mid-gesture but
    // lands on the identical final grid position mouse would have, once
    // commitDragBeats() runs at pointerup.
    const raw = 7.62;
    const mouseFinal = commitDragBeats(resolveDragBeats(raw, "mouse"));
    const touchFinal = commitDragBeats(resolveDragBeats(raw, "touch"));
    expect(mouseFinal).toBe(touchFinal);
    expect(mouseFinal).toBe(quantizeExpected(raw));
  });

  it("honors a custom grid", () => {
    expect(commitDragBeats(1.6, 1)).toBe(2);
  });
});

describe("moveModeTarget — tap-to-relocate targeting (finding 40)", () => {
  const ROW_H = 14;
  const MIDI_HI = 96;

  it("resolves the tapped row to the matching MIDI pitch", () => {
    const t = moveModeTarget(0, 0, ROW_H, MIDI_HI, PX_PER_BEAT);
    expect(t.midi).toBe(MIDI_HI); // row 0 = the highest rendered row
  });

  it("resolves a lower tap to a lower MIDI pitch, one row per ROW_H px", () => {
    const t = moveModeTarget(0, ROW_H * 3, ROW_H, MIDI_HI, PX_PER_BEAT);
    expect(t.midi).toBe(MIDI_HI - 3);
  });

  it("quantizes the horizontal tap position to the beat grid", () => {
    const xPx = (2.1) * PX_PER_BEAT; // between beat 2 and beat 2.25
    const t = moveModeTarget(xPx, 0, ROW_H, MIDI_HI, PX_PER_BEAT);
    expect(t.startBeat).toBe(quantizeExpected(2.1));
  });

  it("0,0 resolves to beat 0 at the top row", () => {
    const t = moveModeTarget(0, 0, ROW_H, MIDI_HI, PX_PER_BEAT);
    expect(t.startBeat).toBe(0);
    expect(t.midi).toBe(MIDI_HI);
  });

  it("matches the roll's own click-to-add-note math exactly for the same pixel", () => {
    // Same shape main.ts's empty-space click handler already computes
    // inline — a tap targeting an existing note's relocation must resolve
    // identically to where a brand-new note would have been added at that
    // same pixel, so the two gestures feel consistent.
    const x = 137.4, y = 58;
    const expectedMidi = MIDI_HI - Math.floor(y / ROW_H);
    const expectedBeat = quantizeExpected(x / PX_PER_BEAT);
    const t = moveModeTarget(x, y, ROW_H, MIDI_HI, PX_PER_BEAT);
    expect(t.midi).toBe(expectedMidi);
    expect(t.startBeat).toBe(expectedBeat);
  });
});

describe("resizeStepTarget — resize-step clamping (findings 40/44)", () => {
  it("extends by one grid step", () => {
    expect(resizeStepTarget(1, 1)).toBeCloseTo(1 + QUANTIZE_GRID_BEATS, 10);
  });

  it("shrinks by one grid step", () => {
    expect(resizeStepTarget(1, -1)).toBeCloseTo(1 - QUANTIZE_GRID_BEATS, 10);
  });

  it("extends by multiple steps in one call", () => {
    expect(resizeStepTarget(1, 3)).toBeCloseTo(1 + 3 * QUANTIZE_GRID_BEATS, 10);
  });

  it("floors at exactly one grid step — never zero or negative", () => {
    expect(resizeStepTarget(QUANTIZE_GRID_BEATS, -1)).toBe(QUANTIZE_GRID_BEATS);
    expect(resizeStepTarget(QUANTIZE_GRID_BEATS, -5)).toBe(QUANTIZE_GRID_BEATS);
  });

  it("a zero-step call is a no-op", () => {
    expect(resizeStepTarget(2.5, 0)).toBe(2.5);
  });

  it("honors a custom grid", () => {
    expect(resizeStepTarget(2, 1, 1)).toBe(3);
    expect(resizeStepTarget(1, -3, 1)).toBe(1); // floored at the custom grid (1), not QUANTIZE_GRID_BEATS
  });
});

describe("findNearbyNoteForDragInit — thin-row drag-initiation fallback (finding 41)", () => {
  const note = (id: string, midi: number, startBeat: number, durationBeats: number): NoteHitCandidate =>
    ({ id, midi, startBeat, durationBeats });

  it("finds a note in the row ABOVE when the tap is near the top of an empty row", () => {
    const notes = [note("n1", 61, 4, 1)];
    // exactMidiRow=60 (the empty row under the pointer), rowFraction near 0
    // (top of the row) -> checks midi 61 (one semitone higher).
    const id = findNearbyNoteForDragInit(notes, 4.5, 60, 0.1, "touch");
    expect(id).toBe("n1");
  });

  it("finds a note in the row BELOW when the tap is near the bottom of an empty row", () => {
    const notes = [note("n1", 59, 4, 1)];
    const id = findNearbyNoteForDragInit(notes, 4.5, 60, 0.9, "touch");
    expect(id).toBe("n1");
  });

  it("returns null in the middle band — unambiguously empty space", () => {
    const notes = [note("n1", 61, 4, 1), note("n2", 59, 4, 1)];
    expect(findNearbyNoteForDragInit(notes, 4.5, 60, 0.5, "touch")).toBeNull();
  });

  it("never matches a note in the EXACT row under the pointer", () => {
    // A note in the exact row would already have been found by the DOM
    // hit-test before this function is ever consulted — if one somehow
    // shows up here anyway, it must not match (only the neighbor rows do).
    const notes = [note("n1", 60, 4, 1)];
    expect(findNearbyNoteForDragInit(notes, 4.5, 60, 0.05, "touch")).toBeNull();
  });

  it("requires the tapped beat to fall within the candidate note's span", () => {
    const notes = [note("n1", 61, 10, 1)]; // starts at beat 10, well away from beat 4.5
    expect(findNearbyNoteForDragInit(notes, 4.5, 60, 0.1, "touch")).toBeNull();
  });

  it("matches at the note's exact start beat (inclusive) and just before its end (exclusive)", () => {
    const notes = [note("n1", 61, 4, 1)]; // covers [4, 5)
    expect(findNearbyNoteForDragInit(notes, 4, 60, 0.1, "touch")).toBe("n1");
    expect(findNearbyNoteForDragInit(notes, 4.999, 60, 0.1, "touch")).toBe("n1");
    expect(findNearbyNoteForDragInit(notes, 5, 60, 0.1, "touch")).toBeNull(); // note has ended
  });

  it("returns null when no note is nearby at all", () => {
    expect(findNearbyNoteForDragInit([], 4.5, 60, 0.05, "touch")).toBeNull();
  });

  it("respects a custom toleranceRowFraction", () => {
    const notes = [note("n1", 61, 4, 1)];
    // Default tolerance (0.4) would match at rowFraction=0.3; a tighter
    // custom tolerance (0.1) must not.
    expect(findNearbyNoteForDragInit(notes, 4.5, 60, 0.3, "touch")).toBe("n1");
    expect(findNearbyNoteForDragInit(notes, 4.5, 60, 0.3, "touch", 0.1)).toBeNull();
  });

  it("rejects an out-of-range rowFraction defensively", () => {
    const notes = [note("n1", 61, 4, 1)];
    expect(findNearbyNoteForDragInit(notes, 4.5, 60, -0.1, "touch")).toBeNull();
    expect(findNearbyNoteForDragInit(notes, 4.5, 60, 1.1, "touch")).toBeNull();
  });

  it("picks the first matching note when multiple candidates could apply", () => {
    const notes = [note("first", 61, 4, 1), note("second", 61, 4, 1)];
    expect(findNearbyNoteForDragInit(notes, 4.5, 60, 0.1, "touch")).toBe("first");
  });

  describe("pointerType gate (Wave C2b finding 4 — mouse must never regress click-to-add)", () => {
    it("returns null for a mouse pointer even when a touch/pen tap at the same position would match", () => {
      const notes = [note("n1", 61, 4, 1)];
      expect(findNearbyNoteForDragInit(notes, 4.5, 60, 0.1, "mouse")).toBeNull();
    });

    it("still matches for touch", () => {
      const notes = [note("n1", 61, 4, 1)];
      expect(findNearbyNoteForDragInit(notes, 4.5, 60, 0.1, "touch")).toBe("n1");
    });

    it("still matches for pen", () => {
      const notes = [note("n1", 61, 4, 1)];
      expect(findNearbyNoteForDragInit(notes, 4.5, 60, 0.1, "pen")).toBe("n1");
    });

    it("defaults an unrecognized pointerType to the safer mouse-like (null) behavior", () => {
      const notes = [note("n1", 61, 4, 1)];
      expect(findNearbyNoteForDragInit(notes, 4.5, 60, 0.1, "")).toBeNull();
      expect(findNearbyNoteForDragInit(notes, 4.5, 60, 0.1, "stylus-future-type")).toBeNull();
    });
  });
});

/** Local mirror of time.ts's quantizeBeats default-grid rounding, so
 *  expectations here don't just re-import the function under test's own
 *  dependency and assert it equals itself. */
function quantizeExpected(beats: number, grid: number = QUANTIZE_GRID_BEATS): number {
  return Math.max(0, Math.round(beats / grid) * grid);
}
