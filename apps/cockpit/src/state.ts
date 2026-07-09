// ─── Cockpit Score State ─────────────────────────────────────────────────────
//
// The score model (notes + selection) and its ONLY mutation API. Every piece
// of code that changes a note — mouse drag, keyboard nudge, inspector
// sliders, score import, autosave restore — goes through one of the
// functions exported here rather than poking `.midi`/`.startBeat`/etc.
// directly. That's deliberate: this is the seam a future undo/redo wave
// hooks (wrap each mutation, push an inverse onto a stack) without having
// to first go hunt down every place main.ts used to mutate a Note in place.
//
// Pure, DOM-free — no import from main.ts, no window/document access. Notes
// are stored in BEATS (see time.ts) — this module never touches seconds or
// bpm at all, which is exactly why it doesn't need to know about tempo to
// stay correct.
// ─────────────────────────────────────────────────────────────────────────────

import type { VowelId } from "./vocal-synth.js";
import { QUANTIZE_GRID_BEATS } from "./time.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Note {
  id: string;
  midi: number;
  /** Beat position from the start of the score (0 = downbeat 1). */
  startBeat: number;
  /** Duration in beats. */
  durationBeats: number;
  velocity: number;
  // ── Vocal metadata (present when created in vocal mode) ──
  vowel?: VowelId;
  breathiness?: number; // 0–1
  lyric?: string;       // free-text syllable label (future)
}

/** Input to addNote()/replaceScore() — everything but the id, which this
 *  module always generates itself (see the id-override rationale on
 *  addNote below). */
export type NoteInit = Omit<Note, "id">;

// ─── Pitch bounds ────────────────────────────────────────────────────────────
//
// Matches the piano roll's rendered pitch range (main.ts's MIDI_LO/MIDI_HI
// constants) — kept here, not there, since clamping a moved/nudged note's
// pitch into a valid range is a score-model invariant, not a rendering
// concern. main.ts imports these for its own geometry (row count, keyboard
// range) rather than redeclaring them.

export const MIDI_LO = 36;
export const MIDI_HI = 96;

export function clampMidi(midi: number): number {
  return Math.max(MIDI_LO, Math.min(MIDI_HI, midi));
}

// ─── Score state ─────────────────────────────────────────────────────────────

let score: Note[] = [];
let selected: Note | null = null;
let nextId = 1;

/** Read-only view of the current score. Callers must go through the
 *  mutation API below to change anything — mutating the array or a note
 *  object returned here defeats the whole point of this module (see file
 *  header). Returned array is the live backing array (not a defensive
 *  copy) for render-loop performance; treat it as read-only. */
export function getScore(): readonly Note[] {
  return score;
}

export function getNoteById(id: string): Note | undefined {
  return score.find((n) => n.id === id);
}

export function getSelectedNote(): Note | null {
  return selected;
}

/** Select a note (or clear selection with null). Does not validate that
 *  `note` is actually in the current score — callers (main.ts) always pass
 *  a note that just came from getScore()/addNote(), and a defensive lookup
 *  here would just be extra work for no real safety gain. */
export function selectNote(note: Note | null): void {
  selected = note;
}

export function selectNoteById(id: string | null): Note | null {
  selected = id === null ? null : getNoteById(id) ?? null;
  return selected;
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Add a new note. The id is ALWAYS generated here from the internal
 * counter — never taken from `init` even if a caller-supplied object has
 * an `id`-shaped field on it (NoteInit's type already excludes `id`, so
 * this is enforced at the type level too). This mirrors the pre-existing
 * id-override guard in main.ts's old importScore/addNote: a hand-crafted
 * or LLM-generated import can't inject a duplicate or malformed id that
 * would later break `[data-note-id]` selection/deletion.
 */
export function addNote(init: NoteInit): Note {
  const note: Note = { ...init, id: "n" + nextId++ };
  score.push(note);
  return note;
}

/** Parse a "n<N>"-shaped id and bump `nextId` past it if needed, so the
 *  counter can never re-mint an id that restoreNote()/replaceScoreWithIds()
 *  (below) is putting back into the score (Wave C1 finding 1). Ids that
 *  don't match this module's own "n<N>" shape are skipped — they can't
 *  collide with anything addNote() will ever generate. */
function bumpNextIdPast(id: string): void {
  const m = /^n(\d+)$/.exec(id);
  if (!m) return;
  const n = Number(m[1]) + 1;
  if (n > nextId) nextId = n;
}

/**
 * Re-insert a note under its ORIGINAL id (Wave C1 finding 1) — for
 * undo.ts's command factories ONLY, never for ordinary note creation
 * (which always goes through addNote()'s fresh-id path above). Every
 * command on the undo/redo stack resolves its target note by id via
 * getNoteById(), so re-minting a new id every time a note is restored (the
 * pre-Wave-C1 behavior of routing every undo through addNote()/
 * replaceScore()) stranded any earlier command that still held the old id
 * — e.g. add→move→delete→undo used to bring the note back under a NEW id,
 * silently breaking the earlier move command's own undo/redo. restoreNote
 * keeps that id forever, bumping the internal counter past it so a later
 * addNote() can never mint a duplicate.
 */
export function restoreNote(note: Note): Note {
  bumpNextIdPast(note.id);
  score.push(note);
  return note;
}

/** Remove a specific note. Clears the selection if the removed note was
 *  selected (an orphaned `selected` pointer would make getSelectedNote()
 *  return a note no longer in the score). Returns true if the note was
 *  found and removed. */
export function deleteNote(note: Note): boolean {
  const i = score.indexOf(note);
  if (i < 0) return false;
  score.splice(i, 1);
  if (selected === note) selected = null;
  return true;
}

/** Convenience wrapper over deleteNote() for the common "delete whatever's
 *  selected" case (Del key, inspector delete button). Returns the deleted
 *  note (or null if nothing was selected) so callers can still react to
 *  what got removed (e.g. remove its DOM element) without a second lookup. */
export function deleteSelectedNote(): Note | null {
  if (!selected) return null;
  const note = selected;
  deleteNote(note);
  return note;
}

/** Move a note to a new time/pitch position. Callers are responsible for
 *  quantizing `startBeat` first (via time.ts's quantizeBeats) — this
 *  function only clamps to valid bounds (>= 0 beats, MIDI_LO..MIDI_HI), it
 *  doesn't impose an opinion about grid snapping, since not every caller
 *  wants it (e.g. a future free-drag mode). */
export function moveNote(note: Note, startBeat: number, midi: number): void {
  note.startBeat = Math.max(0, startBeat);
  note.midi = clampMidi(midi);
}

/** Resize a note's duration. Floored at one quantize step (a zero or
 *  negative duration would render an invisible/unplayable note — same
 *  floor main.ts's old resize-handle drag enforced with `60 / bpm / 4`). */
export function resizeNote(note: Note, durationBeats: number): void {
  note.durationBeats = Math.max(QUANTIZE_GRID_BEATS, durationBeats);
}

export function setVelocity(note: Note, velocity: number): void {
  note.velocity = Math.max(0, Math.min(127, velocity));
}

/** Set a note's vowel. No-ops the "does this note even have vocal
 *  metadata" policy check — that's a UI concern (the vowel-button row is
 *  only rendered/wired when mode === "vocal" and the note already has a
 *  vowel field from creation), not a score-model invariant. */
export function setVowel(note: Note, vowel: VowelId): void {
  note.vowel = vowel;
}

export function setBreathiness(note: Note, value: number): void {
  note.breathiness = Math.max(0, Math.min(1, value));
}

/** Empty the score and clear selection (Clear button, Reset button,
 *  about-to-import). */
export function clearScore(): void {
  score.length = 0;
  selected = null;
}

/**
 * Bulk-replace the entire score (score import, autosave restore). Every
 * note gets a freshly generated id via addNote's counter — same
 * id-override guard rationale as addNote (a restored/imported note's own
 * `id`, if the shape even carried one, is never trusted). Clears selection
 * (there's nothing meaningful to keep selected across a full replace).
 */
export function replaceScore(notes: readonly NoteInit[]): readonly Note[] {
  score = [];
  selected = null;
  for (const init of notes) {
    score.push({ ...init, id: "n" + nextId++ });
  }
  return score;
}

/**
 * Bulk-replace the score preserving every note's EXACT id (Wave C1 finding
 * 1) — the id-preserving counterpart to replaceScore() above, for
 * undo.ts's Clear/Import undo AND redo paths only (a snapshot this module
 * itself produced earlier in the same session, being put back exactly as
 * it was — never for ordinary import, which still goes through
 * replaceScore()'s fresh-id path since freshly-imported JSON has no prior
 * identity worth preserving). Copies each note defensively so the caller's
 * array can't alias the live score.
 */
export function replaceScoreWithIds(notes: readonly Note[]): readonly Note[] {
  score = notes.map((n) => ({ ...n }));
  selected = null;
  for (const n of score) bumpNextIdPast(n.id);
  return score;
}

/**
 * Compute the clamped target position for nudging `note` to
 * (startBeat, midi), or null if the clamped target is IDENTICAL to where
 * the note already is (Wave C1 finding 2) — e.g. nudging pitch up while
 * already at MIDI_HI, or nudging time left while already at startBeat 0.
 * Callers (main.ts's keyboard nudge) use the null case to skip the move
 * entirely rather than pushing a no-op undo command: undo.execute()
 * unconditionally wipes the redo stack, so a vacuous command at a
 * boundary would silently destroy the user's redo history for zero
 * visible effect. `startBeat` is taken as already-quantized by the caller
 * (e.g. time.ts's quantizeBeats) — this only applies the same >= 0 floor
 * moveNote() itself enforces. Pure — does not mutate `note`.
 */
export function clampedMoveTarget(
  note: Note, startBeat: number, midi: number,
): { startBeat: number; midi: number } | null {
  const clampedBeat = Math.max(0, startBeat);
  const clampedMidi = clampMidi(midi);
  if (clampedBeat === note.startBeat && clampedMidi === note.midi) return null;
  return { startBeat: clampedBeat, midi: clampedMidi };
}
