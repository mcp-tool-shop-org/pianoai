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
