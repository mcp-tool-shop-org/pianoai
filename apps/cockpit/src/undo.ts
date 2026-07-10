// ─── Cockpit Undo/Redo ───────────────────────────────────────────────────────
//
// Linear command-stack undo/redo wrapping state.ts's mutation API [Berlage
// 1994, "A selective undo mechanism for graphical user interfaces based on
// command objects", ACM ToCHI]. Every user-visible score edit — add,
// delete, move, resize, velocity, vowel, breathiness, clear, import —
// becomes a Command object (redo()/undo() closures) pushed onto a linear
// undo stack. Redo is only reachable immediately after an undo, with no
// intervening new command: pushing ANY new command clears the redo stack
// (no branching history — matches every mainstream editor's undo model).
//
// Pure, DOM-free — same constraint as state.ts (see its file header): no
// import from main.ts, no window/document access. This module imports
// state.ts directly (not injected) since there is exactly one score model
// per app instance, the same singleton shape state.ts itself already uses.
// The one thing callers DO inject is the onChange hook (setOnChange below)
// — main.ts wires it to a function that refreshes the undo/redo button
// state and calls onStateChanged(), so every execute/commit/undo/redo
// triggers the existing debounced-autosave path without this module
// needing to know autosave or DOM buttons exist.
//
// Two ways a command reaches the stack:
//   - execute(cmd) — apply cmd.redo() now AND push it. Use when nothing has
//     touched state.ts yet for this action (click-to-add, delete, keyboard
//     nudge, vowel-button click, Clear).
//   - commit(cmd)  — push cmd WITHOUT re-applying it. Use when the score
//     was already mutated live, tick-by-tick, for immediate visual
//     feedback during a gesture (mouse drag, velocity/breathiness slider)
//     — only the FINAL before/after delta is committed once the gesture
//     ends (gesture coalescing). The net state after commit(cmd) must
//     already equal what cmd.redo() would produce; the caller is
//     responsible for that invariant (see main.ts's drag-mouseup and
//     slider "change" handlers).
// ─────────────────────────────────────────────────────────────────────────────

import * as state from "./state.js";
import type { Note, NoteInit } from "./state.js";
import type { VowelId } from "./vocal-synth.js";

// ─── Command ─────────────────────────────────────────────────────────────────

export interface Command {
  /** Apply (or re-apply) this command's change. Called once by execute(),
   *  and again every time this command is redo()'d. */
  redo(): void;
  /** Reverse this command's change. Called every time this command is
   *  undo()'d. */
  undo(): void;
}

// ─── Stack ───────────────────────────────────────────────────────────────────

/** Drop the oldest entry once the stack grows past this — an unbounded
 *  stack would leak memory over a very long editing session. */
export const MAX_DEPTH = 100;

let undoStack: Command[] = [];
let redoStack: Command[] = [];
let onChange: (() => void) | null = null;

/** Register the single callback fired after every execute/commit/undo/redo
 *  that actually changed something (never fired for a no-op undo()/redo()
 *  against an empty stack). main.ts wires this once, at boot, to a
 *  function that refreshes the undo/redo button disabled state AND calls
 *  onStateChanged() — this module knows about neither DOM buttons nor
 *  autosave, only that "something changed." Pass null to clear. */
export function setOnChange(cb: (() => void) | null): void {
  onChange = cb;
}

function pushAndClearRedo(cmd: Command): void {
  undoStack.push(cmd);
  if (undoStack.length > MAX_DEPTH) undoStack.shift(); // drop oldest
  redoStack = [];
}

/** Apply `cmd` for the first time and record it. */
export function execute(cmd: Command): void {
  cmd.redo();
  pushAndClearRedo(cmd);
  onChange?.();
}

/** Record `cmd` without re-applying it — see the file header's execute()
 *  vs. commit() note. */
export function commit(cmd: Command): void {
  pushAndClearRedo(cmd);
  onChange?.();
}

/** Undo the most recent command. No-op (returns false) on an empty stack. */
export function undo(): boolean {
  const cmd = undoStack.pop();
  if (!cmd) return false;
  cmd.undo();
  redoStack.push(cmd);
  onChange?.();
  return true;
}

/** Redo the most recently undone command. No-op (returns false) on an
 *  empty redo stack. */
export function redo(): boolean {
  const cmd = redoStack.pop();
  if (!cmd) return false;
  cmd.redo();
  undoStack.push(cmd);
  onChange?.();
  return true;
}

export function canUndo(): boolean { return undoStack.length > 0; }
export function canRedo(): boolean { return redoStack.length > 0; }
export function undoDepth(): number { return undoStack.length; }
export function redoDepth(): number { return redoStack.length; }

/** Drop both stacks with no callback (Reset — a fresh session shouldn't
 *  offer to undo back into the session it just abandoned). Deliberately
 *  does NOT fire onChange, since main.ts's Reset handler already refreshes
 *  the undo/redo buttons and the rest of the UI directly around its own
 *  clearScore()+confirm() flow — see main.ts's btn-reset handler. */
export function resetStack(): void {
  undoStack = [];
  redoStack = [];
}

// ─── Command factories ───────────────────────────────────────────────────────
//
// Every per-note factory stores the note's `id`, not the Note object
// itself ("commands store deltas — note id + before/after fields"), and
// re-resolves it via resolveNote()/state.getNoteById() on every redo()/
// undo() call — a direct object reference wouldn't survive a delete/undo
// round-trip. Add/delete/clear/import restore via state.ts's id-preserving
// primitives (restoreNote/replaceScoreWithIds, see state.ts) rather than
// addNote()/replaceScore()'s fresh-id path, so a restored note keeps the
// EXACT id it had before (Wave C1 finding 1): minting a new id on every
// restore used to strand any earlier command that still held the old one
// — add→move→delete→undo used to bring the note back under a NEW id,
// silently breaking the earlier move command's own undo/redo.

/** Resolve a command's target note by id, warning loudly instead of
 *  failing silently when it's missing (Wave C1 finding 1). Every per-note
 *  command's redo()/undo() below routes through this instead of a bare
 *  state.getNoteById() — now that restoreNote/replaceScoreWithIds keep
 *  restored notes under a stable id, a miss here can only mean a genuine
 *  logic bug (e.g. some other code path deleted the note out from under
 *  this command), never routine id churn, so it deserves a console.warn
 *  instead of a quiet no-op. */
function resolveNote(noteId: string, where: string): Note | undefined {
  const note = state.getNoteById(noteId);
  if (!note) console.warn(`[cockpit undo] ${where}: note "${noteId}" not found — command no-op'd`);
  return note;
}

export interface Point { startBeat: number; midi: number }

/** Coalesced drag-to-move, and a single keyboard nudge (whose "gesture" is
 *  just one keypress). */
export function moveCommand(noteId: string, before: Point, after: Point): Command {
  return {
    redo() {
      const note = resolveNote(noteId, "moveCommand.redo");
      if (!note) return;
      state.moveNote(note, after.startBeat, after.midi);
      state.selectNote(note);
    },
    undo() {
      const note = resolveNote(noteId, "moveCommand.undo");
      if (!note) return;
      state.moveNote(note, before.startBeat, before.midi);
      state.selectNote(note);
    },
  };
}

/** Coalesced resize-handle drag. */
export function resizeCommand(noteId: string, beforeDur: number, afterDur: number): Command {
  return {
    redo() {
      const note = resolveNote(noteId, "resizeCommand.redo");
      if (!note) return;
      state.resizeNote(note, afterDur);
      state.selectNote(note);
    },
    undo() {
      const note = resolveNote(noteId, "resizeCommand.undo");
      if (!note) return;
      state.resizeNote(note, beforeDur);
      state.selectNote(note);
    },
  };
}

/** Shared shape behind velocityCommand/breathinessCommand — coalesced
 *  slider gesture, parameterized by which state.ts setter to call. */
function fieldCommand(
  noteId: string, before: number, after: number,
  setter: (note: Note, v: number) => void,
): Command {
  return {
    redo() {
      const note = resolveNote(noteId, "fieldCommand.redo");
      if (!note) return;
      setter(note, after);
      state.selectNote(note);
    },
    undo() {
      const note = resolveNote(noteId, "fieldCommand.undo");
      if (!note) return;
      setter(note, before);
      state.selectNote(note);
    },
  };
}

/** Coalesced velocity-slider gesture (commit on change/pointerup). */
export function velocityCommand(noteId: string, before: number, after: number): Command {
  return fieldCommand(noteId, before, after, state.setVelocity);
}

/** Coalesced breathiness-slider gesture — same shape as velocity above;
 *  breathiness is a continuous per-note slider just like velocity, so it
 *  gets the same gesture-coalescing treatment to avoid flooding the stack
 *  with one entry per pixel of drag. */
export function breathinessCommand(noteId: string, before: number, after: number): Command {
  return fieldCommand(noteId, before, after, state.setBreathiness);
}

/** Discrete (non-coalesced) vowel-button click — one command per click. */
export function vowelCommand(noteId: string, before: VowelId, after: VowelId): Command {
  return {
    redo() {
      const note = resolveNote(noteId, "vowelCommand.redo");
      if (!note) return;
      state.setVowel(note, after);
      state.selectNote(note);
    },
    undo() {
      const note = resolveNote(noteId, "vowelCommand.undo");
      if (!note) return;
      state.setVowel(note, before);
      state.selectNote(note);
    },
  };
}

/** Click-to-add / Enter-to-insert / window.__cockpit.addNote. `init` is
 *  captured once. The FIRST redo() (execute()'s initial apply) mints a
 *  fresh id via state.addNote and remembers it; every LATER redo() (after
 *  an intervening undo()) restores that SAME id via state.restoreNote
 *  instead of minting a new one (Wave C1 finding 1) — so an undo/redo
 *  cycle can never orphan a later command that captured this note's id. */
export function addNoteCommand(init: NoteInit): Command {
  let mintedId: string | null = null;
  return {
    redo() {
      const note = mintedId === null
        ? state.addNote(init)
        : state.restoreNote({ ...init, id: mintedId });
      mintedId = note.id;
      state.selectNote(note);
    },
    undo() {
      if (mintedId === null) return;
      const note = resolveNote(mintedId, "addNoteCommand.undo");
      if (note) state.deleteNote(note);
    },
  };
}

/** Del key / inspector delete button. Captures the note's full field set
 *  — INCLUDING its id — at construction time, so undo() restores the
 *  exact same note via state.restoreNote (Wave C1 finding 1) rather than
 *  minting a new id every time: any earlier command that still holds this
 *  note's id (e.g. a move that ran before the delete) must keep resolving
 *  correctly after this delete is undone. */
export function deleteNoteCommand(note: Note): Command {
  const original: Note = { ...note };
  return {
    redo() {
      const target = resolveNote(original.id, "deleteNoteCommand.redo");
      if (target) state.deleteNote(target);
    },
    undo() {
      const restored = state.restoreNote({ ...original });
      state.selectNote(restored);
    },
  };
}

/** Clear-all — a full-score snapshot rather than a delta: Clear discards
 *  every note at once, so there's no single note id to key a delta off.
 *  Constructing this command captures the CURRENT score as the "before"
 *  snapshot — call it right before clearing, not after. */
export function clearScoreCommand(): Command {
  const before = state.getScore().map((n) => ({ ...n }));
  return {
    redo() { state.clearScore(); },
    undo() { state.replaceScoreWithIds(before); },
  };
}

/** Opaque settings companion for importScoreCommand (Wave C1 finding 5) —
 *  this module never inspects `S`'s shape, only stores the two snapshots
 *  and calls `apply` with the right one at undo()/redo() time. Same
 *  "caller injects the behavior, this module stays pure/DOM-free" shape as
 *  onChange (see file header) — main.ts is the only caller that knows `S`
 *  is its own bpm/mode/voice/tuning/refPitch shape. */
export interface SettingsDelta<S> {
  before: S;
  after: S;
  apply: (settings: S) => void;
}

/**
 * Score import — a full-score snapshot like Clear, for the same reason
 * (import can add/remove/reorder an arbitrary number of notes at once).
 * Unlike clearScoreCommand, this factory takes BOTH ends of the notes
 * delta explicitly (`beforeNotes`/`afterNotes`, each the REAL post-mutation
 * Note[] with real ids) instead of reading state.getScore() internally:
 * main.ts's importScore() can only know the settings delta (see `settings`
 * below) AFTER it has already applied bpm/mode/voice/tuning, so this
 * command is necessarily constructed after that mutation — by which point
 * state.getScore() would return the POST-import notes, not the "before"
 * ones. Pass the pre-import snapshot captured earlier instead. Every note
 * is copied defensively on the way in, so mutating a source array after
 * construction can't retroactively change what undo()/redo() replay.
 * Restores via state.replaceScoreWithIds on BOTH ends (Wave C1 finding 1)
 * — exact ids preserved on every undo AND redo, so a per-note command from
 * before the import (or from an earlier redo of this same import) never
 * strands on a re-minted id.
 *
 * `settings` (Wave C1 finding 5) is optional: when given, undo()/redo()
 * also restore/reapply whatever non-score settings rode along with the
 * import, so an undo covers the WHOLE import, not just the notes.
 */
export function importScoreCommand<S>(
  beforeNotes: readonly Note[],
  afterNotes: readonly Note[],
  settings?: SettingsDelta<S>,
): Command {
  const before = beforeNotes.map((n) => ({ ...n }));
  const after = afterNotes.map((n) => ({ ...n }));
  return {
    redo() {
      state.replaceScoreWithIds(after);
      if (settings) settings.apply(settings.after);
    },
    undo() {
      state.replaceScoreWithIds(before);
      if (settings) settings.apply(settings.before);
    },
  };
}

/**
 * A completed record-capture pass (Wave C3 — see capture.ts's file header)
 * as ONE undo unit: every note captured during a single loop cycle, or a
 * whole linear take, batched into one command so Ctrl+Z during an ACTIVE
 * multi-cycle overdub recording peels exactly the last COMPLETED pass —
 * without stopping the transport or touching any earlier pass — for free
 * (Ableton Live 12 Manual, "Recording New Clips": loop-record undo
 * granularity is one recorded pass, removable mid-record; finding 78). That
 * falls straight out of the existing linear stack (undo() just pops the
 * most recently pushed command); this factory's only job is grouping the
 * right notes into that one unit.
 *
 * commit()-only, like the drag/slider gesture commands (see the file
 * header's execute()/commit() split) — the score has ALREADY been mutated
 * live by the time this is constructed, and necessarily at two different
 * instants: REPLACE mode clears the region's notes at the CYCLE START
 * (live, so the performer doesn't spend the whole cycle hearing the
 * material they're replacing — "REPLACE mode clears the region's notes at
 * each cycle start before writing the new pass"), while the pass's
 * captured notes are added at the CYCLE END (live via state.addNote, which
 * is also what mints their real ids and lets main.ts render them as solid
 * notes). One command still covers both mutations because both snapshots
 * carry real ids: `added` (this pass's just-added notes — quantize-view
 * already baked into startBeat/durationBeats by capture.ts's
 * capturedNoteToInit, raw* fields riding along) and `removed` (REPLACE's
 * cleared notes; empty for overdub) both restore via state.ts's
 * id-preserving restoreNote (Wave C1 finding 1), exactly like
 * deleteNoteCommand's captured original above. Both arrays are copied
 * defensively at construction.
 *
 * Order matters inside redo(): the replace-clear runs BEFORE the new notes
 * are restored, so a REPLACE pass that captured nothing still cleanly
 * empties the region (removed non-empty + added empty is a valid, real
 * command — main.ts only skips pushing a captureCommand when BOTH are
 * empty, i.e. nothing happened at all this pass).
 */
// ─── Wave C4 — group commands (multi-select) ────────────────────────────────
//
// Every group operation below is ONE command per gesture, same "low-level
// input events aggregate under one hierarchical top-level command" rule as
// every single-note command above (Myers & Kosbie 1996, finding 2) —
// applied here to a SET of notes moved/deleted/added together instead of
// one. Each also restores the SELECTION itself on both undo() and redo()
// (finding 86: "selection state in undo") via state.ts's restoreSelection,
// so undoing a group op leaves the group selected again exactly as it was
// mid-gesture, not silently dropped to nothing.

/** One note's before/after position within a group move — group drag
 *  (works from any selected note, the whole selection moves together) AND
 *  group keyboard-nudge (arrows move every selected note) both resolve to
 *  this same per-note Point pair (reusing the existing Point shape
 *  moveCommand already uses for a single note) and share ONE factory: a
 *  drag is a coalesced continuous gesture, a nudge is a single discrete
 *  keypress, but both are "N notes, each with its own captured before/after
 *  Point, committed as one command" at the undo layer. Per-note (rather
 *  than a single shared delta) because state.moveNote's own clamping
 *  (MIDI_LO/HI, startBeat >= 0) can clip DIFFERENT notes in a group by
 *  different amounts when a drag pushes the group toward an edge — capturing
 *  each note's own actual before/after is what makes undo() restore EXACTLY
 *  where it was, not "the delta re-applied backward," which could land
 *  differently once clamping is involved. */
export interface GroupMoveEntry {
  noteId: string;
  before: Point;
  after: Point;
}

/** Group drag / group keyboard-nudge — see GroupMoveEntry's doc comment
 *  above. The selection itself is exactly `entries`' own note ids on BOTH
 *  undo and redo (a move never adds or removes selection membership), so
 *  there's no separate before/after selection to pass in, unlike
 *  groupDeleteCommand/pasteCommand below (which DO change what's selected). */
export function groupMoveCommand(entries: readonly GroupMoveEntry[]): Command {
  const snap = entries.map((e) => ({ noteId: e.noteId, before: { ...e.before }, after: { ...e.after } }));
  const ids = snap.map((e) => e.noteId);
  // Lens-J finding 6 — snapshot the REAL anchor active at construction time
  // (immediately before this move gesture's commit/execute call) so both
  // undo() and redo() restore it exactly, instead of state.restoreSelection
  // silently re-deriving "anchor = last id in `ids`" — a move never adds or
  // removes selection membership, so the SAME anchor is correct on both
  // ends (see this factory's own file-header note on why there's no
  // separate before/after selection here).
  const anchor = state.getAnchor()?.id ?? null;
  return {
    redo() {
      for (const e of snap) {
        const note = resolveNote(e.noteId, "groupMoveCommand.redo");
        if (!note) continue;
        // Skip the actual moveNote() call for an entry whose after ===
        // before (a group member that was boundary-clamped to a no-op —
        // e.g. one note in the group already sat at MIDI_HI while the rest
        // of the group moved up) — callers (main.ts's nudgeSelection/
        // startGroupDrag) deliberately still include a same-value entry for
        // that note so it survives restoreSelection() below instead of
        // silently falling out of the group's selection, but actually
        // CALLING moveNote() on it would needlessly clear its
        // rawStartBeat/rawDurationBeats (state.ts's moveNote always clears
        // those on any call — see its own doc comment) even though the
        // note never really moved.
        if (note.startBeat !== e.after.startBeat || note.midi !== e.after.midi) {
          state.moveNote(note, e.after.startBeat, e.after.midi);
        }
      }
      state.restoreSelection(ids, anchor);
    },
    undo() {
      for (const e of snap) {
        const note = resolveNote(e.noteId, "groupMoveCommand.undo");
        if (!note) continue;
        if (note.startBeat !== e.before.startBeat || note.midi !== e.before.midi) {
          state.moveNote(note, e.before.startBeat, e.before.midi);
        }
      }
      state.restoreSelection(ids, anchor);
    },
  };
}

/** Del key / inspector "Delete N notes" button with a multi-selection
 *  active — the group counterpart to deleteNoteCommand above, same
 *  id-preserving restoreNote() contract (Wave C1 finding 1) generalized to
 *  every note in the group. redo() doesn't need to touch the selection
 *  explicitly — state.deleteNote() already drops each deleted note out of
 *  the selection set as it goes (see state.ts's removeFromSelection), so
 *  the selection is naturally empty once every note in the group is gone.
 *  undo() restores every note under its exact original id AND reselects
 *  the whole group (finding 86) — deleting, undoing, and immediately
 *  hitting Delete again re-deletes the same group without having to
 *  re-select it by hand. */
export function groupDeleteCommand(notes: readonly Note[]): Command {
  const originals = notes.map((n) => ({ ...n }));
  // Lens-J finding 6 — the anchor active right before THIS delete (always
  // one of `originals`' own ids, since the anchor can only ever point at a
  // currently-selected note and the whole current selection is what's being
  // deleted here) — restored on undo() instead of letting
  // state.restoreSelection re-derive "anchor = last restored id."
  const anchorBeforeDelete = state.getAnchor()?.id ?? null;
  return {
    redo() {
      for (const o of originals) {
        const target = resolveNote(o.id, "groupDeleteCommand.redo");
        if (target) state.deleteNote(target);
      }
    },
    undo() {
      const restoredIds: string[] = [];
      for (const o of originals) restoredIds.push(state.restoreNote({ ...o }).id);
      state.restoreSelection(restoredIds, anchorBeforeDelete);
    },
  };
}

/**
 * Ctrl+V paste / Ctrl+D duplicate — batches every pasted/duplicated note
 * into ONE command (finding 82/83), the same id-preserving-on-repeated-redo
 * shape addNoteCommand already uses for a single note (Wave C1 finding 1):
 * the FIRST redo() (execute()'s initial apply) mints fresh ids for every
 * note via state.addNote and remembers them; every LATER redo() (after an
 * intervening undo()) restores those SAME ids via state.restoreNote instead
 * of re-minting, so an undo/redo cycle can never orphan a later command
 * that captured one of these notes' ids. Both undo() and redo() leave the
 * pasted/duplicated notes as the selection (finding 86 — "pasted notes
 * become the new selection"); undo() drops back to whatever was selected
 * BEFORE the paste (`selectionBefore`, captured by the caller at
 * construction — main.ts passes state.getSelectedIds() from just before
 * building the command, mirroring clearScoreCommand's "capture before
 * mutating" contract).
 */
export function pasteCommand(inits: readonly NoteInit[], selectionBefore: readonly string[]): Command {
  const snapshot = inits.map((n) => ({ ...n }));
  const beforeIds = [...selectionBefore];
  // Lens-J finding 6 — the anchor active immediately BEFORE this paste,
  // captured here (construction time, same instant main.ts captured
  // `selectionBefore`) so undo() restores it exactly instead of
  // state.restoreSelection re-deriving "anchor = last id in beforeIds."
  // redo()'s own anchor (always one of the freshly minted/restored notes)
  // is left to the default "last id" derivation — a paste always creates a
  // brand-new anchor among ITS OWN notes, so there is no prior anchor to
  // preserve on that side.
  const anchorBefore = state.getAnchor()?.id ?? null;
  let mintedIds: string[] | null = null;
  return {
    redo() {
      const notes = mintedIds === null
        ? snapshot.map((init) => state.addNote(init))
        : mintedIds.map((id, i) => state.restoreNote({ ...snapshot[i], id }));
      mintedIds = notes.map((n) => n.id);
      state.restoreSelection(mintedIds);
    },
    undo() {
      if (mintedIds === null) return;
      for (const id of mintedIds) {
        const target = resolveNote(id, "pasteCommand.undo");
        if (target) state.deleteNote(target);
      }
      state.restoreSelection(beforeIds, anchorBefore);
    },
  };
}

export function captureCommand(added: readonly Note[], removed: readonly Note[]): Command {
  const addedSnap = added.map((n) => ({ ...n }));
  const removedSnap = removed.map((n) => ({ ...n }));
  return {
    redo() {
      for (const n of removedSnap) {
        const target = resolveNote(n.id, "captureCommand.redo(replace-clear)");
        if (target) state.deleteNote(target);
      }
      for (const n of addedSnap) state.restoreNote({ ...n });
    },
    undo() {
      for (const n of addedSnap) {
        const target = resolveNote(n.id, "captureCommand.undo(remove-pass)");
        if (target) state.deleteNote(target);
      }
      for (const n of removedSnap) state.restoreNote({ ...n });
    },
  };
}
