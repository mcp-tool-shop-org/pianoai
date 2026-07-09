// ─── undo.test.ts ────────────────────────────────────────────────────────────
//
// Pure, DOM-free coverage for undo.ts's command stack (Wave C1 — see
// undo.ts's file header). Importable directly under Node/vitest, same as
// state.test.ts covers state.ts.
//
// Both state.ts and undo.ts hold module-level singleton state, so
// `beforeEach` resets all of it: state.clearScore() empties the score,
// undo.resetStack() empties both stacks, and undo.setOnChange(null) drops
// any callback a previous test registered — otherwise a callback left over
// from one test could fire (and pollute counters) in the next.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as state from "./state.js";
import type { Note } from "./state.js";
import * as undo from "./undo.js";
import type { Command } from "./undo.js";

beforeEach(() => {
  state.clearScore();
  undo.resetStack();
  undo.setOnChange(null);
});

/** A minimal Command that counts its own redo()/undo() calls, for tests
 *  that only care about stack mechanics (depth, redo-clearing, callback
 *  firing) rather than any particular state.ts effect. */
function spyCommand(): { cmd: Command; calls: { redo: number; undo: number } } {
  const calls = { redo: 0, undo: 0 };
  const cmd: Command = {
    redo: () => { calls.redo++; },
    undo: () => { calls.undo++; },
  };
  return { cmd, calls };
}

describe("stack basics", () => {
  it("a fresh stack has nothing to undo or redo", () => {
    expect(undo.canUndo()).toBe(false);
    expect(undo.canRedo()).toBe(false);
    expect(undo.undoDepth()).toBe(0);
    expect(undo.redoDepth()).toBe(0);
  });

  it("execute() invokes redo() exactly once", () => {
    const { cmd, calls } = spyCommand();
    undo.execute(cmd);
    expect(calls.redo).toBe(1);
    expect(calls.undo).toBe(0);
  });

  it("execute() pushes onto the undo stack", () => {
    undo.execute(spyCommand().cmd);
    expect(undo.canUndo()).toBe(true);
    expect(undo.undoDepth()).toBe(1);
  });

  it("commit() records the command WITHOUT invoking redo()", () => {
    const { cmd, calls } = spyCommand();
    undo.commit(cmd);
    expect(calls.redo).toBe(0);
    expect(calls.undo).toBe(0);
    expect(undo.canUndo()).toBe(true);
  });

  it("undo() on an empty stack returns false and is a no-op", () => {
    expect(undo.undo()).toBe(false);
    expect(undo.canRedo()).toBe(false);
  });

  it("redo() on an empty stack returns false and is a no-op", () => {
    expect(undo.redo()).toBe(false);
  });

  it("undo() pops the most recently executed command and pushes it onto redo", () => {
    const { cmd, calls } = spyCommand();
    undo.execute(cmd);
    expect(undo.undo()).toBe(true);
    expect(calls.undo).toBe(1);
    expect(undo.canUndo()).toBe(false);
    expect(undo.canRedo()).toBe(true);
  });

  it("redo() re-applies the most recently undone command", () => {
    const { cmd, calls } = spyCommand();
    undo.execute(cmd);
    undo.undo();
    expect(undo.redo()).toBe(true);
    expect(calls.redo).toBe(2); // once from execute(), once from redo()
    expect(undo.canUndo()).toBe(true);
    expect(undo.canRedo()).toBe(false);
  });

  it("execute() clears any pending redo history", () => {
    undo.execute(spyCommand().cmd);
    undo.undo();
    expect(undo.canRedo()).toBe(true);
    undo.execute(spyCommand().cmd);
    expect(undo.canRedo()).toBe(false);
  });

  it("commit() clears any pending redo history", () => {
    undo.execute(spyCommand().cmd);
    undo.undo();
    expect(undo.canRedo()).toBe(true);
    undo.commit(spyCommand().cmd);
    expect(undo.canRedo()).toBe(false);
  });

  it("undo stack order is LIFO across multiple commands", () => {
    const order: number[] = [];
    const make = (n: number): Command => ({ redo() {}, undo() { order.push(n); } });
    undo.execute(make(1));
    undo.execute(make(2));
    undo.execute(make(3));
    undo.undo();
    undo.undo();
    undo.undo();
    expect(order).toEqual([3, 2, 1]);
  });

  it("drops the OLDEST entry once the stack exceeds MAX_DEPTH, not the newest", () => {
    const order: number[] = [];
    for (let i = 0; i < undo.MAX_DEPTH + 1; i++) {
      undo.execute({ redo() {}, undo() { order.push(i); } });
    }
    expect(undo.undoDepth()).toBe(undo.MAX_DEPTH);
    let count = 0;
    while (undo.undo()) count++;
    expect(count).toBe(undo.MAX_DEPTH);
    expect(order[0]).toBe(undo.MAX_DEPTH); // most recently pushed is undone first
    expect(order).not.toContain(0); // oldest entry (index 0) was dropped
  });
});

describe("moveCommand", () => {
  it("redo() moves the note to the after position and selects it", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const cmd = undo.moveCommand(note.id, { startBeat: 0, midi: 60 }, { startBeat: 4, midi: 67 });
    undo.execute(cmd);
    expect(note.startBeat).toBe(4);
    expect(note.midi).toBe(67);
    expect(state.getSelectedNote()).toBe(note);
  });

  it("undo() restores the exact prior startBeat/midi", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const cmd = undo.moveCommand(note.id, { startBeat: 0, midi: 60 }, { startBeat: 4, midi: 67 });
    undo.execute(cmd);
    undo.undo();
    expect(note.startBeat).toBe(0);
    expect(note.midi).toBe(60);
    expect(state.getSelectedNote()).toBe(note);
  });

  it("round-trips through undo() then redo() back to the after position", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const cmd = undo.moveCommand(note.id, { startBeat: 0, midi: 60 }, { startBeat: 4, midi: 67 });
    undo.execute(cmd);
    undo.undo();
    undo.redo();
    expect(note.startBeat).toBe(4);
    expect(note.midi).toBe(67);
  });

  it("is a no-op (but does not throw) if the note no longer exists", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const cmd = undo.moveCommand(note.id, { startBeat: 0, midi: 60 }, { startBeat: 4, midi: 67 });
    state.deleteNote(note);
    expect(() => undo.execute(cmd)).not.toThrow();
  });
});

describe("resizeCommand", () => {
  it("redo() sets durationBeats to the after value", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    undo.execute(undo.resizeCommand(note.id, 1, 3.5));
    expect(note.durationBeats).toBe(3.5);
  });

  it("undo() restores the exact prior durationBeats", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    undo.execute(undo.resizeCommand(note.id, 1, 3.5));
    undo.undo();
    expect(note.durationBeats).toBe(1);
  });
});

describe("velocityCommand", () => {
  it("redo()/undo() round-trip the exact velocity", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    undo.execute(undo.velocityCommand(note.id, 100, 42));
    expect(note.velocity).toBe(42);
    undo.undo();
    expect(note.velocity).toBe(100);
  });
});

describe("breathinessCommand", () => {
  it("redo()/undo() round-trip the exact breathiness", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100, vowel: "a", breathiness: 0.15 });
    undo.execute(undo.breathinessCommand(note.id, 0.15, 0.8));
    expect(note.breathiness).toBe(0.8);
    undo.undo();
    expect(note.breathiness).toBe(0.15);
  });
});

describe("vowelCommand", () => {
  it("redo()/undo() round-trip the exact vowel", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100, vowel: "a" });
    undo.execute(undo.vowelCommand(note.id, "a", "u"));
    expect(note.vowel).toBe("u");
    undo.undo();
    expect(note.vowel).toBe("a");
  });
});

describe("addNoteCommand", () => {
  it("execute() adds a note with the given fields and selects it", () => {
    const cmd = undo.addNoteCommand({ midi: 64, startBeat: 2, durationBeats: 1, velocity: 90 });
    undo.execute(cmd);
    expect(state.getScore()).toHaveLength(1);
    const note = state.getScore()[0];
    expect(note.midi).toBe(64);
    expect(state.getSelectedNote()).toBe(note);
  });

  it("undo() removes the added note", () => {
    undo.execute(undo.addNoteCommand({ midi: 64, startBeat: 2, durationBeats: 1, velocity: 90 }));
    undo.undo();
    expect(state.getScore()).toHaveLength(0);
  });

  it("redo() re-adds the note, and a following undo() removes it again (id churn handled)", () => {
    undo.execute(undo.addNoteCommand({ midi: 64, startBeat: 2, durationBeats: 1, velocity: 90 }));
    undo.undo();
    undo.redo();
    expect(state.getScore()).toHaveLength(1);
    undo.undo();
    expect(state.getScore()).toHaveLength(0);
  });

  it("a second undo()/redo() cycle still works after the id has already churned once", () => {
    undo.execute(undo.addNoteCommand({ midi: 64, startBeat: 2, durationBeats: 1, velocity: 90 }));
    undo.undo();
    undo.redo();
    undo.undo();
    undo.redo();
    expect(state.getScore()).toHaveLength(1);
    expect(state.getScore()[0].midi).toBe(64);
  });
});

describe("deleteNoteCommand", () => {
  it("execute() (redo) deletes the note", () => {
    const note = state.addNote({ midi: 64, startBeat: 2, durationBeats: 1, velocity: 90 });
    undo.execute(undo.deleteNoteCommand(note));
    expect(state.getScore()).toHaveLength(0);
  });

  it("undo() restores a note with the exact prior field values and selects it", () => {
    const note = state.addNote({ midi: 64, startBeat: 2, durationBeats: 1, velocity: 90, vowel: "e", breathiness: 0.3 });
    undo.execute(undo.deleteNoteCommand(note));
    undo.undo();
    expect(state.getScore()).toHaveLength(1);
    const restored = state.getScore()[0];
    expect(restored.midi).toBe(64);
    expect(restored.startBeat).toBe(2);
    expect(restored.durationBeats).toBe(1);
    expect(restored.velocity).toBe(90);
    expect(restored.vowel).toBe("e");
    expect(restored.breathiness).toBe(0.3);
    expect(state.getSelectedNote()).toBe(restored);
  });

  it("redo() deletes the restored note again", () => {
    const note = state.addNote({ midi: 64, startBeat: 2, durationBeats: 1, velocity: 90 });
    undo.execute(undo.deleteNoteCommand(note));
    undo.undo();
    undo.redo();
    expect(state.getScore()).toHaveLength(0);
  });
});

describe("clearScoreCommand", () => {
  it("redo() empties the score", () => {
    state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    undo.execute(undo.clearScoreCommand());
    expect(state.getScore()).toHaveLength(0);
  });

  it("undo() restores every note's exact field values, in order", () => {
    state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.addNote({ midi: 62, startBeat: 1, durationBeats: 1.5, velocity: 80 });
    const cmd = undo.clearScoreCommand();
    undo.execute(cmd);
    undo.undo();
    expect(state.getScore()).toHaveLength(2);
    expect(state.getScore().map((n) => n.midi)).toEqual([60, 62]);
    expect(state.getScore()[1].durationBeats).toBe(1.5);
  });

  it("undo() clears selection even though a note was selected before the clear", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.selectNote(note);
    const cmd = undo.clearScoreCommand();
    undo.execute(cmd);
    undo.undo();
    expect(state.getSelectedNote()).toBeNull();
  });

  it("captures the before-snapshot at construction time, not at redo() time", () => {
    state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const cmd = undo.clearScoreCommand();
    // Mutates the score AFTER construction but BEFORE execute() — the
    // "before" snapshot must already be frozen and unaffected by this.
    state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    undo.execute(cmd);
    undo.undo();
    expect(state.getScore()).toHaveLength(1);
    expect(state.getScore()[0].midi).toBe(60);
  });
});

describe("importScoreCommand", () => {
  it("redo() replaces the score with the imported notes, preserving their given ids", () => {
    state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const before = state.getScore().map((n) => ({ ...n }));
    const after: Note[] = [{ id: "imp1", midi: 67, startBeat: 0, durationBeats: 2, velocity: 110 }];
    undo.execute(undo.importScoreCommand(before, after));
    expect(state.getScore()).toHaveLength(1);
    expect(state.getScore()[0].midi).toBe(67);
    expect(state.getScore()[0].id).toBe("imp1");
  });

  it("undo() restores the prior score's exact field values AND ids", () => {
    const original = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const before = state.getScore().map((n) => ({ ...n }));
    const after: Note[] = [{ id: "imp1", midi: 67, startBeat: 0, durationBeats: 2, velocity: 110 }];
    undo.execute(undo.importScoreCommand(before, after));
    undo.undo();
    expect(state.getScore()).toHaveLength(1);
    expect(state.getScore()[0].midi).toBe(60);
    expect(state.getScore()[0].id).toBe(original.id);
  });

  it("undo() clears selection (snapshot restore contract)", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.selectNote(note);
    const before = state.getScore().map((n) => ({ ...n }));
    const after: Note[] = [{ id: "imp1", midi: 67, startBeat: 0, durationBeats: 2, velocity: 110 }];
    undo.execute(undo.importScoreCommand(before, after));
    undo.undo();
    expect(state.getSelectedNote()).toBeNull();
  });

  it("redo() after undo() re-applies the imported notes under the SAME ids (Wave C1 finding 1 — no re-mint on repeated redo)", () => {
    state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const before = state.getScore().map((n) => ({ ...n }));
    const after: Note[] = [{ id: "imp1", midi: 67, startBeat: 0, durationBeats: 2, velocity: 110 }];
    undo.execute(undo.importScoreCommand(before, after));
    undo.undo();
    undo.redo();
    expect(state.getScore()).toHaveLength(1);
    expect(state.getScore()[0].midi).toBe(67);
    expect(state.getScore()[0].id).toBe("imp1");
  });

  it("mutating the source arrays after construction does not affect the recorded command", () => {
    const before: Note[] = [];
    const after: Note[] = [{ id: "imp1", midi: 67, startBeat: 0, durationBeats: 2, velocity: 110 }];
    const cmd = undo.importScoreCommand(before, after);
    after[0].midi = 1; // mutate after handing off to importScoreCommand
    undo.execute(cmd);
    expect(state.getScore()[0].midi).toBe(67);
  });

  describe("settings delta (Wave C1 finding 5)", () => {
    it("redo() applies the after-settings via the injected apply callback", () => {
      const calls: string[] = [];
      const cmd = undo.importScoreCommand<string>([], [], {
        before: "before-settings", after: "after-settings",
        apply: (s) => calls.push(s),
      });
      undo.execute(cmd);
      expect(calls).toEqual(["after-settings"]);
    });

    it("undo() restores the before-settings", () => {
      const calls: string[] = [];
      const cmd = undo.importScoreCommand<string>([], [], {
        before: "before-settings", after: "after-settings",
        apply: (s) => calls.push(s),
      });
      undo.execute(cmd);
      undo.undo();
      expect(calls).toEqual(["after-settings", "before-settings"]);
    });

    it("redo() after undo() re-applies the after-settings", () => {
      const calls: string[] = [];
      const cmd = undo.importScoreCommand<string>([], [], {
        before: "before-settings", after: "after-settings",
        apply: (s) => calls.push(s),
      });
      undo.execute(cmd);
      undo.undo();
      undo.redo();
      expect(calls).toEqual(["after-settings", "before-settings", "after-settings"]);
    });

    it("is entirely optional — omitting it just skips settings restoration", () => {
      const cmd = undo.importScoreCommand([], []);
      expect(() => { undo.execute(cmd); undo.undo(); undo.redo(); }).not.toThrow();
    });
  });
});

describe("gesture coalescing (commit)", () => {
  it("multiple live state mutations before commit() still result in exactly one stack entry", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    // Simulate a mouse drag: several live state.moveNote() calls, matching
    // how main.ts applies each mousemove tick directly, with no command
    // pushed until the gesture ends.
    state.moveNote(note, 1, 61);
    state.moveNote(note, 2, 62);
    state.moveNote(note, 3, 63);
    expect(undo.undoDepth()).toBe(0);
    undo.commit(undo.moveCommand(note.id, { startBeat: 0, midi: 60 }, { startBeat: 3, midi: 63 }));
    expect(undo.undoDepth()).toBe(1);
  });

  it("a single commit()'d drag undoes back to the pre-gesture position in one step", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.moveNote(note, 1, 61);
    state.moveNote(note, 3, 63);
    undo.commit(undo.moveCommand(note.id, { startBeat: 0, midi: 60 }, { startBeat: 3, midi: 63 }));
    undo.undo();
    expect(note.startBeat).toBe(0);
    expect(note.midi).toBe(60);
    expect(undo.canUndo()).toBe(false);
  });
});

describe("onChange callback", () => {
  it("execute() fires the registered callback", () => {
    let calls = 0;
    undo.setOnChange(() => calls++);
    undo.execute(spyCommand().cmd);
    expect(calls).toBe(1);
  });

  it("commit() fires the registered callback", () => {
    let calls = 0;
    undo.setOnChange(() => calls++);
    undo.commit(spyCommand().cmd);
    expect(calls).toBe(1);
  });

  it("undo() fires the registered callback when it actually undoes something", () => {
    undo.execute(spyCommand().cmd);
    let calls = 0;
    undo.setOnChange(() => calls++);
    undo.undo();
    expect(calls).toBe(1);
  });

  it("redo() fires the registered callback when it actually redoes something", () => {
    undo.execute(spyCommand().cmd);
    undo.undo();
    let calls = 0;
    undo.setOnChange(() => calls++);
    undo.redo();
    expect(calls).toBe(1);
  });

  it("undo() on an empty stack does NOT fire the callback", () => {
    let calls = 0;
    undo.setOnChange(() => calls++);
    undo.undo();
    expect(calls).toBe(0);
  });

  it("redo() on an empty stack does NOT fire the callback", () => {
    let calls = 0;
    undo.setOnChange(() => calls++);
    undo.redo();
    expect(calls).toBe(0);
  });

  it("setOnChange(null) stops future notifications", () => {
    let calls = 0;
    undo.setOnChange(() => calls++);
    undo.setOnChange(null);
    undo.execute(spyCommand().cmd);
    expect(calls).toBe(0);
  });
});

describe("resetStack", () => {
  it("clears both the undo and redo stacks", () => {
    undo.execute(spyCommand().cmd);
    undo.execute(spyCommand().cmd);
    undo.undo();
    expect(undo.canUndo()).toBe(true);
    expect(undo.canRedo()).toBe(true);
    undo.resetStack();
    expect(undo.canUndo()).toBe(false);
    expect(undo.canRedo()).toBe(false);
    expect(undo.undoDepth()).toBe(0);
    expect(undo.redoDepth()).toBe(0);
  });

  it("does not fire the onChange callback", () => {
    undo.execute(spyCommand().cmd);
    let calls = 0;
    undo.setOnChange(() => calls++);
    undo.resetStack();
    expect(calls).toBe(0);
  });
});

describe("linear history (no branching)", () => {
  it("a new command after undo() permanently discards the undone command's redo path", () => {
    const noteA = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    undo.execute(undo.moveCommand(noteA.id, { startBeat: 0, midi: 60 }, { startBeat: 2, midi: 60 }));
    undo.undo();
    expect(noteA.startBeat).toBe(0);

    undo.execute(undo.addNoteCommand({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 }));
    expect(undo.canRedo()).toBe(false);

    undo.undo();
    expect(state.getScore().find((n) => n.midi === 62)).toBeUndefined();
    expect(noteA.startBeat).toBe(0); // never re-moved — that redo path is gone
  });
});

// ─── Wave C1 finding 1: cross-command id invalidation ─────────────────────
//
// Before the fix, every restore (delete-undo, add-redo, clear-undo,
// import-undo) minted a FRESH id instead of keeping the original — so any
// earlier command that had captured the old id (e.g. a move that ran
// before a delete) would silently no-op on its own undo/redo, and a full
// undo-then-redo cycle could leave a duplicate note behind. These tests
// pin the exact traces the adversarial lens found broken.
describe("cross-command id invalidation (Wave C1 finding 1)", () => {
  it("add→move→delete→undo×3 empties the score, and redo×2 reproduces exactly one note at the moved position with no duplicates", () => {
    undo.execute(undo.addNoteCommand({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 }));
    const originalId = state.getScore()[0].id;

    undo.execute(undo.moveCommand(originalId, { startBeat: 0, midi: 60 }, { startBeat: 4, midi: 67 }));
    undo.execute(undo.deleteNoteCommand(state.getScore()[0]));
    expect(state.getScore()).toHaveLength(0);

    undo.undo(); // undoes delete — must restore under the ORIGINAL id, not a new one
    undo.undo(); // undoes move — must resolve via that same id, not silently no-op
    undo.undo(); // undoes add — must remove the note, not miss and leave it stranded
    expect(state.getScore()).toHaveLength(0); // fully unwound, no stray note left behind

    undo.redo(); // redoes add — restores the SAME id (not a re-mint)
    undo.redo(); // redoes move — resolves via that same id
    expect(state.getScore()).toHaveLength(1);
    expect(state.getScore()[0].id).toBe(originalId);
    expect(state.getScore()[0].startBeat).toBe(4);
    expect(state.getScore()[0].midi).toBe(67);

    undo.redo(); // redoes delete — must remove it cleanly, no duplicate left over
    expect(state.getScore()).toHaveLength(0);
  });

  it("an older move's undo still resolves after delete→undo restores the note", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    undo.execute(undo.moveCommand(note.id, { startBeat: 0, midi: 60 }, { startBeat: 4, midi: 67 }));
    undo.execute(undo.deleteNoteCommand(state.getScore()[0]));

    undo.undo(); // undoes delete — restores under the SAME id
    undo.undo(); // undoes the EARLIER move — must still resolve, not no-op
    expect(state.getScore()).toHaveLength(1);
    expect(state.getScore()[0].startBeat).toBe(0);
    expect(state.getScore()[0].midi).toBe(60);
  });

  it("clear→undo restores prior ids so an older move's undo still resolves", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    undo.execute(undo.moveCommand(note.id, { startBeat: 0, midi: 60 }, { startBeat: 4, midi: 67 }));
    undo.execute(undo.clearScoreCommand());
    expect(state.getScore()).toHaveLength(0);

    undo.undo(); // undoes clear — restores the note under its ORIGINAL id
    expect(state.getScore()).toHaveLength(1);
    expect(state.getScore()[0].id).toBe(note.id);

    undo.undo(); // undoes the earlier move — must still resolve via that id
    expect(state.getScore()).toHaveLength(1);
    expect(state.getScore()[0].startBeat).toBe(0);
    expect(state.getScore()[0].midi).toBe(60);
  });

  it("import→undo restores prior ids so an older move's undo still resolves", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    undo.execute(undo.moveCommand(note.id, { startBeat: 0, midi: 60 }, { startBeat: 4, midi: 67 }));

    const beforeNotes = state.getScore().map((n) => ({ ...n }));
    const afterNotes: Note[] = [{ id: "imported-1", midi: 72, startBeat: 2, durationBeats: 1, velocity: 90 }];
    undo.execute(undo.importScoreCommand(beforeNotes, afterNotes));
    expect(state.getScore()[0].id).toBe("imported-1");

    undo.undo(); // undoes import — restores the note under its ORIGINAL id
    expect(state.getScore()).toHaveLength(1);
    expect(state.getScore()[0].id).toBe(note.id);

    undo.undo(); // undoes the earlier move — must still resolve via that id
    expect(state.getScore()).toHaveLength(1);
    expect(state.getScore()[0].startBeat).toBe(0);
    expect(state.getScore()[0].midi).toBe(60);
  });
});

// ─── Wave C1 finding 2: boundary nudges must not pollute the stack ────────
//
// main.ts's nudgeSelectedNote() computes state.clampedMoveTarget() first
// and skips undo.execute() entirely when it returns null. This test
// exercises that exact guard shape at the stack level: a boundary nudge
// must leave BOTH stacks byte-for-byte untouched, since undo.execute()
// unconditionally wipes the redo stack and a vacuous command would
// destroy it for zero visible effect.
describe("boundary nudge guard (Wave C1 finding 2)", () => {
  it("a nudge that clamps to a no-op at MIDI_HI leaves both stacks untouched, preserving redo", () => {
    const note = state.addNote({ midi: state.MIDI_HI, startBeat: 4, durationBeats: 1, velocity: 100 });
    // Put something on the redo stack first, via a SEPARATE decoy note
    // (undoing a move mutates the note in place — reusing `note` here
    // would knock it off MIDI_HI before the guard is even exercised).
    // This mirrors a user who undid an earlier, unrelated edit before
    // attempting the boundary nudge.
    const decoy = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    undo.execute(undo.moveCommand(decoy.id, { startBeat: 0, midi: 60 }, { startBeat: 1, midi: 61 }));
    undo.undo();
    expect(undo.canRedo()).toBe(true);
    const undoDepthBefore = undo.undoDepth();
    const redoDepthBefore = undo.redoDepth();

    // Mirrors main.ts's nudgeSelectedNote guard exactly.
    const target = state.clampedMoveTarget(note, note.startBeat, note.midi + 1); // ArrowUp at MIDI_HI
    expect(target).toBeNull();
    if (target) undo.execute(undo.moveCommand(note.id, { startBeat: note.startBeat, midi: note.midi }, target));

    expect(undo.undoDepth()).toBe(undoDepthBefore);
    expect(undo.redoDepth()).toBe(redoDepthBefore);
    expect(undo.canRedo()).toBe(true);
  });
});

describe("resolveNote loud-miss warning (Wave C1 finding 1)", () => {
  it("warns via console.warn when a command's note id can't be resolved (should only happen on a genuine bug)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    undo.execute(undo.moveCommand("does-not-exist", { startBeat: 0, midi: 60 }, { startBeat: 1, midi: 61 }));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("does-not-exist");
    warnSpy.mockRestore();
  });
});
