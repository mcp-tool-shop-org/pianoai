// ─── Cockpit Edit Preview ────────────────────────────────────────────────────
//
// Pure, DOM-free gating for the SHORT audible "blind-edit" preview (Wave
// C5): a pitch-changing edit — drag row-crossing, ArrowUp/Down nudge, or a
// Move-mode relocate — plays a brief blip of the note's NEW pitch so the
// player can hear what they just set without starting playback. A
// velocity-slider release previews the note at its new velocity the same
// way (see previewSuppressed — that path has no pitch delta to check, only
// the shared playback/recording gate).
//
// main.ts owns the actual sound (activeNoteOn/activeNoteOff — the same
// mode-aware synth routing every other live-preview call site in that file
// already uses) and the setTimeout that stops it after PITCH_PREVIEW_MS;
// this module only decides WHETHER a given edit tick should trigger one, so
// the throttle/gating rules are unit-testable without a DOM.
//
// Deliberately kept OUT of state.ts/undo.ts entirely (per the wave brief):
// a preview is not a score mutation and must never appear on the undo stack
// or in the persisted score — main.ts's callers fire it as a side effect
// alongside (never inside) their state.ts/undo.ts calls.
// ─────────────────────────────────────────────────────────────────────────────

/** Preview duration, ms — short enough to read as "a blip" confirming the
 *  new pitch/velocity, not a held note. */
export const PITCH_PREVIEW_MS = 120;

/** Playback/recording context that suppresses EVERY edit preview — a
 *  preview competing with the transport's own scheduled audio would be
 *  confusing, and one bleeding into a live capture take would pollute what
 *  gets recorded (findings: never during playback or recording). */
export interface PreviewGate {
  isPlaying: boolean;
  isRecording: boolean;
}

export function previewSuppressed(gate: PreviewGate): boolean {
  return gate.isPlaying || gate.isRecording;
}

/**
 * Decide whether a pitch-changing edit tick should trigger a preview.
 * `prevMidi`/`nextMidi` are the note's pitch immediately before/after this
 * tick — callers (a drag's onMove, nudgeSelection, relocateSelectedNoteTo)
 * pass their own before/after pair every time they touch a note, so this
 * returns true only when the pitch ACTUALLY changed:
 *   - never for a time-only move/nudge (prevMidi === nextMidi there by
 *     construction — the caller never changed it),
 *   - never a second time for the same row while a drag lingers mid-row —
 *     each tick's "prevMidi" is the LAST PREVIEWED pitch (a caller-held
 *     variable, updated only when this returns true), not the gesture's
 *     original starting pitch, so a row that hasn't changed since the last
 *     preview simply returns false again ("one preview per row-crossing").
 */
export function shouldPreviewPitchChange(prevMidi: number, nextMidi: number, gate: PreviewGate): boolean {
  if (previewSuppressed(gate)) return false;
  return prevMidi !== nextMidi;
}
