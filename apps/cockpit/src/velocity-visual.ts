// ─── Cockpit Velocity Visual ─────────────────────────────────────────────────
//
// Pure, DOM-free encoding math for the on-note velocity bar (Wave C5 —
// wiring index.html's long-dead `.vel-bar` CSS class, confirmed zero TS
// references before this wave). Each note renders a thin strip along its
// own bottom edge whose WIDTH is proportional to the note's velocity — a
// near-empty strip reads as quiet, a full-width strip reads as loud.
// Deliberately width-only (not also opacity/color): the note already carries
// two other visual channels (pitch-class/vowel background fill, selection
// outline) — a single additional, low-contrast dimension reads as a subtle
// meter rather than competing with those.
//
// main.ts applies this from every place a note's visual gets (re)synced —
// renderNote (creation) and applyNoteStyle (creation, group-drag ticks,
// group-nudge, Move-mode relocate, undo/redo's rerenderAllNotes, the
// inspector velocity slider) — so the bar stays correct whether a note was
// touched via the single-note inspector or as part of a multi-selected
// group operation. Kept here, pure, so the encoding math is unit-testable
// without a DOM.
// ─────────────────────────────────────────────────────────────────────────────

/** This app's velocity range — matches index.html's #insp-vel slider
 *  (min=1, max=127). MIDI's own floor of 0 is reserved for "note off" and
 *  is never a playable velocity value in this app's own UI, but imported/
 *  legacy scores aren't guaranteed to respect that, hence the clamp below
 *  rather than an assumption. */
export const VELOCITY_MIN = 1;
export const VELOCITY_MAX = 127;

/**
 * Map a note's velocity to the on-note bar's CSS width, as a percentage
 * (0-100) of the note's own width. Clamps out-of-range input (defensive —
 * a hand-crafted/LLM-generated import or an old MIDI-sourced velocity of 0
 * is not guaranteed to respect this app's own slider bounds) rather than
 * producing a >100% or negative width.
 */
export function velocityBarWidthPct(velocity: number): number {
  const clamped = Math.max(VELOCITY_MIN, Math.min(VELOCITY_MAX, velocity));
  return ((clamped - VELOCITY_MIN) / (VELOCITY_MAX - VELOCITY_MIN)) * 100;
}
