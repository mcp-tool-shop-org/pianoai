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
  // ── Live-capture raw timing (Wave C3 — present only on notes recorded via
  //    the record-arm capture path; see capture.ts's file header). startBeat/
  //    durationBeats above are always the QUANTIZED view (what plays/renders);
  //    these two are the original, unquantized performance timing, kept
  //    forever so quantization stays reversible (findings 22/23 — "record
  //    raw; the quantized score is a derived view" / "non-destructive
  //    quantize with original timing recallable"). Absent on every
  //    hand-placed/imported note — this module itself never reads or
  //    derives these fields, only stores whatever capture.ts computed.
  rawStartBeat?: number;
  rawDurationBeats?: number;
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
/** Wave C4 — the selection is a SET of note ids (JS Set — insertion-
 *  ordered) plus an ANCHOR id that range operations pivot from. Single-note
 *  selection (every wave before this one) is just the size-1 case — see the
 *  "Selection" section below for the full multi-select API and why
 *  selectNote()/getSelectedNote() keep every pre-Wave-C4 call site working
 *  completely unchanged. */
let selection = new Set<string>();
let anchorId: string | null = null;
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

// ─── Selection (Wave C4 — multi-select) ─────────────────────────────────────
//
// The selection is a SET of note ids plus an ANCHOR id that Shift+click/
// Ctrl+Shift+Arrow range operations pivot from [finding 81 — the platform
// canon: plain click replaces, Shift+click extends a contiguous range from
// the anchor, Ctrl/Cmd+click toggles]. Single-note selection is simply the
// size-1 case: selectNote()/getSelectedNote() are kept as thin wrappers over
// this same Set so every pre-Wave-C4 call site (undo.ts's per-note command
// factories; main.ts's inspector/vowel/velocity/Move-mode paths) keeps
// working completely unchanged — "single-select behavior preserved as the
// default interaction" isn't a special case bolted on, it falls straight out
// of selectOnly() always being what a plain click means.

/** Drop `id` from the selection set, re-anchoring to whatever remains if it
 *  was the anchor — shared by deleteNote() (Mutations, below) and
 *  toggleSelect()'s remove branch so the "anchor always points at a
 *  still-selected note, or nothing" invariant can't drift between the two
 *  call sites. No-ops (including leaving anchorId untouched) when `id`
 *  wasn't actually selected. */
function removeFromSelection(id: string): void {
  if (!selection.delete(id)) return;
  if (anchorId === id) {
    const rest = [...selection];
    anchorId = rest.length > 0 ? rest[rest.length - 1] : null;
  }
}

/** Every currently-selected note, in SCORE order (not click/insertion
 *  order) — deterministic for rendering/inspector "N selected" display and
 *  group-op iteration (group drag/delete/nudge/duplicate), independent of
 *  the order notes were clicked or Set-inserted in. */
export function getSelection(): readonly Note[] {
  return score.filter((n) => selection.has(n.id));
}

export function getSelectedIds(): ReadonlySet<string> {
  return selection;
}

export function selectionSize(): number {
  return selection.size;
}

export function isSelected(id: string): boolean {
  return selection.has(id);
}

/** The anchor note — the FIXED end a Shift+click/Shift+range measures from
 *  [81]. Null when nothing is selected. Resolved by id (never a dangling
 *  reference) — same defensive "gone from the score => null" contract
 *  getSelectedNote() has always had. */
export function getAnchor(): Note | null {
  return anchorId === null ? null : getNoteById(anchorId) ?? null;
}

/** Plain click / single-select — replace the WHOLE selection with exactly
 *  `note` (or clear it with null), and make it the new anchor [81]. This is
 *  selectNote()'s real body now; selectNote is kept as a same-behavior
 *  alias purely so every call site written before Wave C4 (which only ever
 *  meant "select exactly this one note") keeps reading naturally. */
export function selectOnly(note: Note | null): void {
  selection = new Set();
  anchorId = note ? note.id : null;
  if (note) selection.add(note.id);
}

/** Select a note (or clear selection with null). Does not validate that
 *  `note` is actually in the current score — callers (main.ts) always pass
 *  a note that just came from getScore()/addNote(), and a defensive lookup
 *  here would just be extra work for no real safety gain. Backward-
 *  compatible alias for selectOnly() (see this section's header) — every
 *  pre-Wave-C4 call site keeps this exact single-note-replace meaning. */
export function selectNote(note: Note | null): void {
  selectOnly(note);
}

export function selectNoteById(id: string | null): Note | null {
  const note = id === null ? null : getNoteById(id) ?? null;
  selectOnly(note);
  return note;
}

/** Ctrl/Cmd+click — toggle one note's membership without disturbing the
 *  rest of the selection [81]. Becomes the new anchor when ADDED. When
 *  REMOVED and it was the anchor, the anchor falls back to whatever note is
 *  now the Set's last remaining member (or null) so a following Shift+click
 *  still has a well-defined pivot instead of silently measuring from a
 *  no-longer-selected note (see removeFromSelection above). */
export function toggleSelect(note: Note): void {
  if (selection.has(note.id)) {
    removeFromSelection(note.id);
  } else {
    selection.add(note.id);
    anchorId = note.id;
  }
}

/** Shift+click / Ctrl+Shift+Arrow — ADD every note in `notes` to the
 *  selection (union, never a replace). Callers resolve the actual
 *  time-ordered range from the anchor to a target note themselves (see
 *  clipboard.ts's notesInTimeRange — a pure helper, independently testable
 *  without this module) before calling addRange(). The anchor is
 *  deliberately left UNCHANGED here: repeated Shift+clicks all measure from
 *  the SAME fixed anchor, not a rolling one — "extends a CONTIGUOUS range
 *  FROM THE ANCHOR" [81] would otherwise make a sequence of Shift+clicks
 *  accumulate a path-dependent range instead of always spanning
 *  anchor..latest-target. A caller with no anchor yet (nothing selected)
 *  should fall back to selectOnly() instead of calling this — see main.ts's
 *  Shift+click handler. */
export function addRange(notes: readonly Note[]): void {
  for (const n of notes) selection.add(n.id);
}

export function clearSelection(): void {
  selection = new Set();
  anchorId = null;
}

/** Ctrl+A — select every note currently in the score [85]. Anchor becomes
 *  the LAST note in score order, so a following Shift+click extends
 *  backward from the end, consistent with every note already being
 *  selected. */
export function selectAll(): void {
  selection = new Set(score.map((n) => n.id));
  anchorId = score.length > 0 ? score[score.length - 1].id : null;
}

/** Restore a selection to an EXACT set of ids (undo.ts's group commands —
 *  finding 86: "selection state in undo"). Silently drops any id no longer
 *  present in the score (defensive — mirrors selectNoteById's unknown-id
 *  handling) rather than leaving a dangling reference in the Set.
 *
 *  `anchorHint` (Lens-J finding 6 — "anchor not restored by undo of group
 *  ops") is an OPTIONAL id to prefer as the restored anchor, for callers
 *  that captured the REAL pre-gesture anchor (undo.ts's group/paste
 *  commands snapshot `state.getAnchor()` at construction time) rather than
 *  accepting "last id in the list" as a stand-in. Honored only when it's
 *  actually a member of the surviving set — a hint pointing at a note that
 *  didn't survive (or the omitted/undefined/null default) falls back to the
 *  pre-existing "anchor = LAST surviving id in `ids`'s own order" behavior,
 *  matching selectAll's "anchor = last" convention, so every call site that
 *  predates this parameter (and every call site that doesn't have a
 *  meaningful prior anchor to restore) keeps working unchanged. */
export function restoreSelection(ids: readonly string[], anchorHint?: string | null): void {
  const surviving = ids.filter((id) => getNoteById(id) !== undefined);
  selection = new Set(surviving);
  anchorId = (anchorHint != null && surviving.includes(anchorHint))
    ? anchorHint
    : (surviving.length > 0 ? surviving[surviving.length - 1] : null);
}

/** Legacy single-note read — returns the selected note only when EXACTLY
 *  one is selected (the pre-Wave-C4 selection model could never represent
 *  anything else); null for zero OR more than one. Deliberately does NOT
 *  return an arbitrary member of a larger selection — that would silently
 *  pick one note out of a multi-selection for single-note-only UI
 *  (inspector vowel/velocity/breathiness sliders, Move mode) to operate on
 *  without the user ever having chosen that member specifically. Callers
 *  that need "is there a multi-selection" should check selectionSize()
 *  instead. */
export function getSelectedNote(): Note | null {
  if (selection.size !== 1) return null;
  const [id] = selection;
  return getNoteById(id) ?? null;
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
  removeFromSelection(note.id);
  return true;
}

/** Convenience wrapper over deleteNote() for the common "delete whatever's
 *  selected" case (Del key, inspector delete button). Returns the deleted
 *  note (or null if nothing was selected) so callers can still react to
 *  what got removed (e.g. remove its DOM element) without a second lookup. */
export function deleteSelectedNote(): Note | null {
  const note = getSelectedNote();
  if (!note) return null;
  deleteNote(note);
  return note;
}

/** Move a note to a new time/pitch position. Callers are responsible for
 *  quantizing `startBeat` first (via time.ts's quantizeBeats) — this
 *  function only clamps to valid bounds (>= 0 beats, MIDI_LO..MIDI_HI), it
 *  doesn't impose an opinion about grid snapping, since not every caller
 *  wants it (e.g. a future free-drag mode).
 *
 *  Clears rawStartBeat/rawDurationBeats when present (Lens-I finding 5).
 *  Those two fields exist so a CAPTURED note's original, unquantized
 *  performance timing survives for a future re-quantize at a different
 *  strength (see capture.ts's file header, "raw + quantize-as-view") — but
 *  a manual move declares a NEW position outright, superseding whatever
 *  performance the raw pair remembers. Leaving them in place would let a
 *  future re-quantize silently snap the note back toward a performance it
 *  no longer resembles. Discrete edits that don't touch timing (velocity,
 *  vowel, breathiness — setVelocity/setVowel/setBreathiness below) have no
 *  such clear; only a timing change supersedes the recorded timing. */
export function moveNote(note: Note, startBeat: number, midi: number): void {
  note.startBeat = Math.max(0, startBeat);
  note.midi = clampMidi(midi);
  delete note.rawStartBeat;
  delete note.rawDurationBeats;
}

/** Resize a note's duration. Floored at one quantize step (a zero or
 *  negative duration would render an invisible/unplayable note — same
 *  floor main.ts's old resize-handle drag enforced with `60 / bpm / 4`).
 *  Clears raw* fields too, for the same reason moveNote does — see its doc
 *  comment (Lens-I finding 5). */
export function resizeNote(note: Note, durationBeats: number): void {
  note.durationBeats = Math.max(QUANTIZE_GRID_BEATS, durationBeats);
  delete note.rawStartBeat;
  delete note.rawDurationBeats;
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
  clearSelection();
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
  clearSelection();
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
  clearSelection();
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
