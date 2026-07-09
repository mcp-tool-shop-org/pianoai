// ─── Cockpit Gesture Math ────────────────────────────────────────────────────
//
// Pure, DOM-free helpers for pointer-driven note gestures (Wave C2b:
// pointer/touch/accessibility). main.ts owns all pointer event wiring
// (pointerdown/move/up/cancel, setPointerCapture, DOM geometry reads,
// dragActive/cancelActiveDrag bookkeeping) — this file only computes
// numbers/decisions, the same "pure math, DOM-free" split ruler.ts/time.ts/
// transport.ts already established (see their file headers), so it stays
// unit-testable directly under Node/vitest with no window/document access.
//
// Three concerns live here:
//   - Deferred-snap drag math (finding 45): a touch drag's beat position
//     follows the pointer continuously, unsnapped, until release; a mouse/
//     pen drag keeps quantizing live on every tick, same as every wave
//     before this one.
//   - Move-mode tap-to-relocate targeting (finding 40 — WCAG 2.5.7 single-
//     pointer alternative to a move-drag).
//   - Resize-by-one-grid-step math (findings 40/44 — the Resize+/- toolbar
//     buttons and Shift+ArrowLeft/Right keyboard extension share this).
//   - A drag-initiation fallback for thin (ROW_H=14px) note rows (finding
//     41 — touch-target size) — see findNearbyNoteForDragInit's doc comment
//     for why this is a JS tolerance check on an already-empty DOM hit-test
//     rather than a CSS-expanded per-note hit box.
//
// Gesture ROLLBACK (pointercancel / Esc-mid-drag, findings 38/39) does NOT
// need a helper here: it restores the exact pre-drag snapshot the drag
// closure already captured (origBeat/origMidi, or startDur — the same
// locals the pointerup commit path already reads) via state.ts's moveNote/
// resizeNote. There's no new math to test there, just "put back what a
// local variable already remembers" — see main.ts's onCancel closures.
// ─────────────────────────────────────────────────────────────────────────────

import { quantizeBeats, QUANTIZE_GRID_BEATS } from "./time.js";

// ─── Deferred-snap drag (finding 45) ─────────────────────────────────────────

/** Pointer types that DEFER grid-snapping to release instead of snapping
 *  live on every drag tick. Named as an allowlist-of-one-exception
 *  ("touch") rather than enumerating "mouse"/"pen" so a pointer type this
 *  app has never seen (browsers occasionally add new PointerEvent.
 *  pointerType values) still gets the pre-existing, safer live-snap
 *  behavior rather than silently landing in the newer deferred path. */
export function isDeferredSnapPointer(pointerType: string): boolean {
  return pointerType === "touch";
}

/**
 * Resolve the beats-denominated value (a note's startBeat during a move
 * drag, or its durationBeats during a resize drag — both are plain "beats"
 * quantities) a drag tick should APPLY this tick, given the raw
 * (unsnapped, pointer-derived) value and the pointer type driving the
 * gesture.
 *
 * Mouse/pen: quantized every tick — byte-for-byte the live-snap feel every
 * wave before this one already had. Touch: the raw value, floored at 0 —
 * the note visually follows the finger continuously with no grid hopping
 * mid-gesture; commitDragBeats() below supplies the one-time snap once the
 * gesture ends (finding 45).
 */
export function resolveDragBeats(rawBeats: number, pointerType: string, grid: number = QUANTIZE_GRID_BEATS): number {
  return isDeferredSnapPointer(pointerType) ? Math.max(0, rawBeats) : quantizeBeats(rawBeats, grid);
}

/**
 * Final beats-denominated value committed when a drag gesture ends
 * (pointerup), REGARDLESS of pointer type — always quantized, exactly
 * once. For a mouse/pen drag this is a no-op in practice (resolveDragBeats
 * above already quantized every tick, and quantizeBeats is idempotent);
 * for a touch drag this is the ONE point the fluid, unsnapped position
 * finally snaps to the grid — same commit path both pointer types share
 * (main.ts calls this from the same pointerup handler either way).
 */
export function commitDragBeats(rawBeats: number, grid: number = QUANTIZE_GRID_BEATS): number {
  return quantizeBeats(rawBeats, grid);
}

// ─── Move mode (finding 40 — non-drag single-pointer alternative) ───────────

/**
 * Move-mode tap targeting: resolve a tap/click's pixel position within the
 * roll into a quantized beat + raw (unclamped) MIDI pitch. Mirrors the
 * exact math the roll's own click-to-add-note handler already uses (same
 * `MIDI_HI - Math.floor(y / rowH)` / `quantizeBeats(x / pxPerBeat)` shape)
 * so a tapped position resolves identically whether it's about to add a
 * note or relocate one. Callers clamp the result via state.ts's
 * clampedMoveTarget(note, startBeat, midi) — reusing that existing
 * invariant/no-op-guard (and its "identical to current position" null
 * case) rather than duplicating a clamp here.
 */
export function moveModeTarget(
  xPx: number, yPx: number, rowH: number, midiHi: number, pxPerBeat: number,
): { startBeat: number; midi: number } {
  const midi = midiHi - Math.floor(yPx / rowH);
  const startBeat = quantizeBeats(xPx / pxPerBeat);
  return { startBeat, midi };
}

// ─── Resize-by-one-step (findings 40/44) ────────────────────────────────────

/**
 * Resize target `steps` grid units from `durationBeats` (positive =
 * extend, negative = shrink), floored at one grid step — mirrors state.
 * ts's own resizeNote() floor (a zero/negative duration would render an
 * invisible/unplayable note) but computed here, pure, so the Resize+/-
 * toolbar buttons and Shift+ArrowLeft/Right keyboard handler can both
 * resolve (and test) the target duration without first mutating a live
 * note through state.ts.
 */
export function resizeStepTarget(durationBeats: number, steps: number, grid: number = QUANTIZE_GRID_BEATS): number {
  return Math.max(grid, durationBeats + grid * steps);
}

// ─── Thin-row drag-initiation fallback (finding 41 — touch target size) ────

export interface NoteHitCandidate {
  id: string;
  midi: number;
  startBeat: number;
  durationBeats: number;
}

/**
 * Fallback "nearby note" lookup for drag-initiation tolerance (finding 41:
 * notes render ROW_H=14px tall, under the ~24px WCAG 2.5.8 touch-target
 * guidance). Callers invoke this ONLY after their own precise DOM hit-test
 * (`e.target.closest(".pr-note")`) has already come up empty — so there is
 * NEVER a real, exactly-rendered note box competing for these pixels, and
 * this can never shadow a note a user visibly, precisely clicked. That
 * ordering is deliberate: an earlier design considered a CSS pseudo-
 * element expanding every note's own hit box (simpler), but rejected it —
 * notes are absolutely-positioned siblings rendered in insertion order,
 * not row order, so a LATER-inserted note's expanded pseudo-element hit
 * zone can paint (and hit-test) ON TOP of an EARLIER note's real, precise
 * box wherever the two overlap, misattributing clicks that visibly landed
 * on a different, real note. A tolerance check that only ever activates on
 * an already-empty hit-test avoids that failure mode entirely.
 *
 * Gated to `pointerType` "touch"/"pen" (Wave C2b finding 4): a MOUSE's
 * precise pointer never needs this tolerance — without the gate, a mouse
 * click in ordinary empty space near a neighbor-row note started a DRAG on
 * that note instead of adding a new one, regressing click-to-add. Mouse
 * (and any pointer type this app has never seen) keeps exact row
 * hit-testing everywhere.
 *
 * Only considers notes in the row immediately above/below the EXACT row
 * the pointer landed in (never the exact row itself — a note there would
 * already have matched the DOM hit-test), and only within
 * `toleranceRowFraction` of that row's near edge — e.g. the default 0.4
 * means the top/bottom 40% of the current (confirmed-empty-at-this-beat)
 * row reaches into the neighboring row, leaving the middle 20% to
 * unambiguously mean "empty space, add a note here." This keeps the
 * effective grab zone close to the 24px guidance (13px note + ~5.6px into
 * each neighbor at the default ROW_H=14) without reaching a full extra row.
 *
 * Returns the nearest matching note's id, or null (meaning: fall through
 * to ordinary empty-space handling).
 */
export function findNearbyNoteForDragInit(
  notes: readonly NoteHitCandidate[],
  beat: number,
  exactMidiRow: number,
  rowFraction: number,
  pointerType: string,
  toleranceRowFraction: number = 0.4,
): string | null {
  if (pointerType !== "touch" && pointerType !== "pen") return null;
  if (!Number.isFinite(rowFraction) || rowFraction < 0 || rowFraction > 1) return null;

  // Near the TOP of this row (small rowFraction) -> the row visually ABOVE
  // is one semitone HIGHER (midi increases upward; row index increases
  // downward — same MIDI_HI - row convention as the roll's own rendering).
  // Near the BOTTOM -> the row below, one semitone LOWER.
  let candidateMidi: number | null = null;
  if (rowFraction <= toleranceRowFraction) candidateMidi = exactMidiRow + 1;
  else if (rowFraction >= 1 - toleranceRowFraction) candidateMidi = exactMidiRow - 1;
  if (candidateMidi === null) return null;

  for (const n of notes) {
    if (n.midi !== candidateMidi) continue;
    if (beat < n.startBeat || beat >= n.startBeat + n.durationBeats) continue;
    return n.id;
  }
  return null;
}
