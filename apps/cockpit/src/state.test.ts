// ─── state.test.ts ───────────────────────────────────────────────────────────
//
// Pure, DOM-free coverage for state.ts's score model + mutation API (the
// cockpit beat-model wave — see state.ts's file header: every note mutation
// in the app is supposed to funnel through these functions, which is the
// seam a future undo/redo wave hooks). Importable directly under Node/
// vitest, same as pure-logic.test.ts covers synth.ts/persistence.ts.
//
// state.ts holds module-level mutable state (the score array + selection),
// so `beforeEach` resets it via clearScore() to keep every test isolated —
// there's no other way to reset a module singleton between tests.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from "vitest";
import * as state from "./state.js";
import { MIDI_LO, MIDI_HI, clampMidi } from "./state.js";

beforeEach(() => {
  state.clearScore();
});

describe("addNote / getScore", () => {
  it("adds a note and returns it with a generated id", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    expect(note.id).toBeTruthy();
    expect(state.getScore()).toContain(note);
  });

  it("generates a distinct id for each note, even with identical fields", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    expect(a.id).not.toBe(b.id);
  });

  it("never lets a caller-supplied id-shaped field override the generated id (id-override guard)", () => {
    // NoteInit's type already excludes `id`, but the runtime guard is what
    // actually matters here — an LLM-generated import can hand addNote an
    // object with extra fields that TS's excess-property check wouldn't
    // catch once the value has passed through an untyped boundary (as
    // window.__cockpit.addNote's input does, from main.ts). Assigning
    // through a variable (rather than a fresh literal at the call site)
    // mirrors that: TS allows the extra `id` field here structurally, so
    // this is really testing addNote's runtime behavior, not the type.
    const malicious = { midi: 60, startBeat: 0, durationBeats: 1, velocity: 100, id: "n999" };
    const note = state.addNote(malicious);
    expect(note.id).not.toBe("n999");
  });

  it("preserves optional vocal fields (vowel/breathiness/lyric) when provided", () => {
    const note = state.addNote({
      midi: 60, startBeat: 0, durationBeats: 1, velocity: 100,
      vowel: "a", breathiness: 0.4, lyric: "la",
    });
    expect(note.vowel).toBe("a");
    expect(note.breathiness).toBe(0.4);
    expect(note.lyric).toBe("la");
  });

  it("getScore reflects insertion order", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    expect([...state.getScore()]).toEqual([a, b]);
  });
});

describe("selection", () => {
  it("selectNote / getSelectedNote round-trip", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    expect(state.getSelectedNote()).toBeNull();
    state.selectNote(note);
    expect(state.getSelectedNote()).toBe(note);
    state.selectNote(null);
    expect(state.getSelectedNote()).toBeNull();
  });

  it("selectNoteById selects by id and returns the resolved note", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const resolved = state.selectNoteById(note.id);
    expect(resolved).toBe(note);
    expect(state.getSelectedNote()).toBe(note);
  });

  it("selectNoteById(null) clears selection", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.selectNote(note);
    state.selectNoteById(null);
    expect(state.getSelectedNote()).toBeNull();
  });

  it("selectNoteById with an unknown id clears selection rather than throwing", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.selectNote(note);
    const resolved = state.selectNoteById("does-not-exist");
    expect(resolved).toBeNull();
    expect(state.getSelectedNote()).toBeNull();
  });
});

describe("multi-select (Wave C4)", () => {
  it("selectOnly replaces the whole selection with exactly one note and anchors it", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    state.selectOnly(a);
    state.selectOnly(b);
    expect(state.getSelection()).toEqual([b]);
    expect(state.selectionSize()).toBe(1);
    expect(state.getAnchor()).toBe(b);
  });

  it("selectOnly(null) clears the selection and anchor", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.selectOnly(a);
    state.selectOnly(null);
    expect(state.getSelection()).toEqual([]);
    expect(state.getAnchor()).toBeNull();
  });

  it("selectNote/getSelectedNote still round-trip exactly as before (backward compat)", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    expect(state.getSelectedNote()).toBeNull();
    state.selectNote(note);
    expect(state.getSelectedNote()).toBe(note);
    state.selectNote(null);
    expect(state.getSelectedNote()).toBeNull();
  });

  it("toggleSelect adds a note not yet selected, and makes it the anchor", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    state.selectOnly(a);
    state.toggleSelect(b);
    expect(state.getSelection().map((n) => n.id).sort()).toEqual([a.id, b.id].sort());
    expect(state.getAnchor()).toBe(b);
  });

  it("toggleSelect removes a note already selected, without touching the rest", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    state.selectOnly(a);
    state.toggleSelect(b);
    state.toggleSelect(b);
    expect(state.getSelection()).toEqual([a]);
  });

  it("toggleSelect re-anchors to a remaining member when the anchor itself is toggled off", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    state.selectOnly(a);
    state.toggleSelect(b); // b is now anchor, {a, b} selected
    state.toggleSelect(b); // remove b (the anchor) -> re-anchor to a
    expect(state.getAnchor()).toBe(a);
    expect(state.getSelection()).toEqual([a]);
  });

  it("toggleSelect down to zero members leaves a null anchor", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.selectOnly(a);
    state.toggleSelect(a);
    expect(state.getSelection()).toEqual([]);
    expect(state.getAnchor()).toBeNull();
  });

  it("addRange unions notes into the selection without replacing it", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    const c = state.addNote({ midi: 64, startBeat: 2, durationBeats: 1, velocity: 100 });
    state.selectOnly(a);
    state.addRange([b, c]);
    expect(state.getSelection().map((n) => n.id)).toEqual([a.id, b.id, c.id]);
  });

  it("addRange preserves a disjoint toggled note already in the selection (Lens-J finding 5 — keyboard Ctrl+Shift+Arrow range extension must stay union-like, matching mouse Shift+click, instead of collapsing to just the new range)", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    const disjoint = state.addNote({ midi: 71, startBeat: 20, durationBeats: 1, velocity: 100 });
    state.selectOnly(a);
    state.toggleSelect(disjoint); // Ctrl+click a far-away note — {a, disjoint} selected, disjoint is anchor
    // The fixed extendSelectionRange calls addRange(...) directly from the
    // CURRENT anchor — no selectOnly(anchor) first — so a prior disjoint
    // member must survive a range extension exactly like it survives a
    // mouse Shift+click (see handleNotePointerDown's Shift branch, which
    // has always called addRange() alone).
    state.addRange([a, b]);
    expect(state.getSelection().map((n) => n.id).sort()).toEqual([a.id, b.id, disjoint.id].sort());
  });

  it("addRange does NOT move the anchor (repeated Shift+clicks measure from the same fixed anchor)", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    state.selectOnly(a);
    state.addRange([b]);
    expect(state.getAnchor()).toBe(a);
  });

  it("getSelection returns notes in SCORE order, not click order", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    const c = state.addNote({ midi: 64, startBeat: 2, durationBeats: 1, velocity: 100 });
    state.selectOnly(c);
    state.toggleSelect(a);
    state.toggleSelect(b);
    expect(state.getSelection()).toEqual([a, b, c]);
  });

  it("isSelected/selectedIds reflect current membership", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    state.selectOnly(a);
    expect(state.isSelected(a.id)).toBe(true);
    expect(state.isSelected(b.id)).toBe(false);
    expect(state.getSelectedIds().has(a.id)).toBe(true);
  });

  it("clearSelection empties the set and the anchor", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.selectOnly(a);
    state.clearSelection();
    expect(state.getSelection()).toEqual([]);
    expect(state.getAnchor()).toBeNull();
    expect(state.selectionSize()).toBe(0);
  });

  it("selectAll selects every note in the score and anchors the last one", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    const c = state.addNote({ midi: 64, startBeat: 2, durationBeats: 1, velocity: 100 });
    state.selectAll();
    expect(state.getSelection()).toEqual([a, b, c]);
    expect(state.getAnchor()).toBe(c);
  });

  it("selectAll on an empty score selects nothing and anchors null", () => {
    state.selectAll();
    expect(state.getSelection()).toEqual([]);
    expect(state.getAnchor()).toBeNull();
  });

  it("getSelectedNote returns null when more than one note is selected", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    state.selectOnly(a);
    state.toggleSelect(b);
    expect(state.getSelectedNote()).toBeNull();
  });

  it("restoreSelection sets the exact ids given and anchors the last one", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    state.restoreSelection([a.id, b.id]);
    expect(state.getSelection().map((n) => n.id)).toEqual([a.id, b.id]);
    expect(state.getAnchor()).toBe(b);
  });

  it("restoreSelection silently drops ids no longer present in the score", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.restoreSelection([a.id, "gone"]);
    expect(state.getSelection()).toEqual([a]);
    expect(state.getAnchor()).toBe(a);
  });

  describe("restoreSelection anchorHint (Lens-J finding 6 — 'anchor not restored by undo of group ops')", () => {
    it("honors an explicit anchorHint when it survives in the restored set, even when it is not the last id", () => {
      const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
      const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
      state.restoreSelection([a.id, b.id], a.id); // a is FIRST, not last — only the hint should win
      expect(state.getAnchor()).toBe(a);
    });

    it("falls back to the last-surviving-id default when anchorHint is not among the restored ids", () => {
      const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
      const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
      state.restoreSelection([a.id, b.id], "does-not-exist");
      expect(state.getAnchor()).toBe(b);
    });

    it("falls back to the last-surviving-id default when anchorHint is explicitly null", () => {
      const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
      const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
      state.restoreSelection([a.id, b.id], null);
      expect(state.getAnchor()).toBe(b);
    });

    it("omitting anchorHint entirely keeps the pre-existing last-id behavior (backward compatible with every pre-Lens-J call site)", () => {
      const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
      const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
      state.restoreSelection([a.id, b.id]);
      expect(state.getAnchor()).toBe(b);
    });
  });

  it("deleteNote drops a multi-selected note from the selection without disturbing the rest", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    state.selectOnly(a);
    state.toggleSelect(b);
    state.deleteNote(a);
    expect(state.getSelection()).toEqual([b]);
  });

  it("deleteNote of the anchor re-anchors to a remaining selected note", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    state.selectOnly(a);
    state.toggleSelect(b); // b is anchor
    state.deleteNote(b);
    expect(state.getAnchor()).toBe(a);
  });

  it("replaceScore/replaceScoreWithIds/clearScore all clear a multi-selection too", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    state.selectOnly(a);
    state.toggleSelect(b);
    state.clearScore();
    expect(state.selectionSize()).toBe(0);
  });
});

describe("deleteNote / deleteSelectedNote", () => {
  it("deleteNote removes the note from the score and returns true", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    expect(state.deleteNote(note)).toBe(true);
    expect(state.getScore()).not.toContain(note);
  });

  it("deleteNote returns false for a note not in the score", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.deleteNote(note);
    expect(state.deleteNote(note)).toBe(false);
  });

  it("deleteNote clears the selection if the removed note was selected", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.selectNote(note);
    state.deleteNote(note);
    expect(state.getSelectedNote()).toBeNull();
  });

  it("deleteNote leaves an unrelated selection untouched", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    state.selectNote(b);
    state.deleteNote(a);
    expect(state.getSelectedNote()).toBe(b);
  });

  it("deleteSelectedNote deletes and returns whatever is selected", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.selectNote(note);
    const removed = state.deleteSelectedNote();
    expect(removed).toBe(note);
    expect(state.getScore()).toHaveLength(0);
    expect(state.getSelectedNote()).toBeNull();
  });

  it("deleteSelectedNote returns null (no-op) when nothing is selected", () => {
    state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    expect(state.deleteSelectedNote()).toBeNull();
    expect(state.getScore()).toHaveLength(1);
  });
});

describe("moveNote", () => {
  it("moves start beat and pitch together", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.moveNote(note, 4, 67);
    expect(note.startBeat).toBe(4);
    expect(note.midi).toBe(67);
  });

  it("clamps startBeat to >= 0", () => {
    const note = state.addNote({ midi: 60, startBeat: 2, durationBeats: 1, velocity: 100 });
    state.moveNote(note, -5, 60);
    expect(note.startBeat).toBe(0);
  });

  it("clamps midi to [MIDI_LO, MIDI_HI]", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.moveNote(note, 0, MIDI_HI + 50);
    expect(note.midi).toBe(MIDI_HI);
    state.moveNote(note, 0, MIDI_LO - 50);
    expect(note.midi).toBe(MIDI_LO);
  });

  it("mutates the same object returned by getScore/getSelectedNote (no defensive copy)", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.selectNote(note);
    state.moveNote(note, 3, 64);
    expect(state.getSelectedNote()!.startBeat).toBe(3);
    expect(state.getScore()[0].midi).toBe(64);
  });

  it("clears rawStartBeat/rawDurationBeats on a captured note (Lens-I finding 5 — a manual move supersedes recorded performance timing)", () => {
    const note = state.addNote({
      midi: 60, startBeat: 0, durationBeats: 1, velocity: 100,
      rawStartBeat: 0.12, rawDurationBeats: 0.88,
    });
    state.moveNote(note, 4, 67);
    expect(note.rawStartBeat).toBeUndefined();
    expect(note.rawDurationBeats).toBeUndefined();
  });

  it("is a no-op on raw* for a hand-placed note that never had them", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.moveNote(note, 4, 67);
    expect(note.rawStartBeat).toBeUndefined();
    expect(note.rawDurationBeats).toBeUndefined();
  });
});

describe("clampMidi", () => {
  it("passes an in-range value through unchanged", () => {
    expect(clampMidi(60)).toBe(60);
  });
  it("clamps above MIDI_HI down to MIDI_HI", () => {
    expect(clampMidi(200)).toBe(MIDI_HI);
  });
  it("clamps below MIDI_LO up to MIDI_LO", () => {
    expect(clampMidi(-1)).toBe(MIDI_LO);
  });
});

describe("resizeNote", () => {
  it("sets durationBeats to the requested value when above the floor", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.resizeNote(note, 3.5);
    expect(note.durationBeats).toBe(3.5);
  });

  it("floors durationBeats at one quantize step instead of allowing zero/negative", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.resizeNote(note, 0);
    expect(note.durationBeats).toBeGreaterThan(0);
    state.resizeNote(note, -10);
    expect(note.durationBeats).toBeGreaterThan(0);
  });

  it("clears rawStartBeat/rawDurationBeats on a captured note (Lens-I finding 5 — same rationale as moveNote)", () => {
    const note = state.addNote({
      midi: 60, startBeat: 0, durationBeats: 1, velocity: 100,
      rawStartBeat: 0.12, rawDurationBeats: 0.88,
    });
    state.resizeNote(note, 3.5);
    expect(note.rawStartBeat).toBeUndefined();
    expect(note.rawDurationBeats).toBeUndefined();
  });
});

describe("raw* timing fields survive non-timing edits (Lens-I finding 5)", () => {
  it("setVelocity leaves raw* untouched", () => {
    const note = state.addNote({
      midi: 60, startBeat: 0, durationBeats: 1, velocity: 100,
      rawStartBeat: 0.12, rawDurationBeats: 0.88,
    });
    state.setVelocity(note, 80);
    expect(note.rawStartBeat).toBe(0.12);
    expect(note.rawDurationBeats).toBe(0.88);
  });

  it("setVowel leaves raw* untouched", () => {
    const note = state.addNote({
      midi: 60, startBeat: 0, durationBeats: 1, velocity: 100, vowel: "a",
      rawStartBeat: 0.12, rawDurationBeats: 0.88,
    });
    state.setVowel(note, "u");
    expect(note.rawStartBeat).toBe(0.12);
    expect(note.rawDurationBeats).toBe(0.88);
  });

  it("setBreathiness leaves raw* untouched", () => {
    const note = state.addNote({
      midi: 60, startBeat: 0, durationBeats: 1, velocity: 100,
      rawStartBeat: 0.12, rawDurationBeats: 0.88,
    });
    state.setBreathiness(note, 0.5);
    expect(note.rawStartBeat).toBe(0.12);
    expect(note.rawDurationBeats).toBe(0.88);
  });

  it("only a timing edit (moveNote/resizeNote) clears raw* — a velocity edit right after a move stays cleared, not re-populated", () => {
    const note = state.addNote({
      midi: 60, startBeat: 0, durationBeats: 1, velocity: 100,
      rawStartBeat: 0.12, rawDurationBeats: 0.88,
    });
    state.moveNote(note, 2, 62);
    state.setVelocity(note, 50);
    expect(note.rawStartBeat).toBeUndefined();
    expect(note.rawDurationBeats).toBeUndefined();
  });
});

describe("setVelocity", () => {
  it("sets an in-range velocity", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.setVelocity(note, 42);
    expect(note.velocity).toBe(42);
  });

  it("clamps to [0, 127]", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.setVelocity(note, 999);
    expect(note.velocity).toBe(127);
    state.setVelocity(note, -50);
    expect(note.velocity).toBe(0);
  });
});

describe("setVowel / setBreathiness", () => {
  it("setVowel updates the note's vowel", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100, vowel: "a" });
    state.setVowel(note, "u");
    expect(note.vowel).toBe("u");
  });

  it("setBreathiness clamps to [0, 1]", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100, vowel: "a", breathiness: 0.1 });
    state.setBreathiness(note, 5);
    expect(note.breathiness).toBe(1);
    state.setBreathiness(note, -5);
    expect(note.breathiness).toBe(0);
  });
});

describe("clearScore", () => {
  it("empties the score and clears selection", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.selectNote(note);
    state.clearScore();
    expect(state.getScore()).toHaveLength(0);
    expect(state.getSelectedNote()).toBeNull();
  });
});

describe("replaceScore", () => {
  it("replaces the whole score with freshly-generated ids, ignoring any id already on the input", () => {
    state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const replaced = state.replaceScore([
      { midi: 62, startBeat: 0, durationBeats: 1, velocity: 90 },
      { midi: 64, startBeat: 1, durationBeats: 1, velocity: 90 },
    ]);
    expect(replaced).toHaveLength(2);
    expect(state.getScore()).toHaveLength(2);
    expect(state.getScore().map((n) => n.midi)).toEqual([62, 64]);
    // Every id is fresh/unique, not reused across the replace.
    const ids = state.getScore().map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("clears selection (nothing meaningful to keep selected across a full replace)", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.selectNote(note);
    state.replaceScore([{ midi: 62, startBeat: 0, durationBeats: 1, velocity: 90 }]);
    expect(state.getSelectedNote()).toBeNull();
  });

  it("replacing with an empty array empties the score", () => {
    state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.replaceScore([]);
    expect(state.getScore()).toHaveLength(0);
  });
});

describe("restoreNote (Wave C1 finding 1)", () => {
  it("re-inserts a note under its ORIGINAL id, not a freshly generated one", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.deleteNote(note);
    const restored = state.restoreNote({ ...note });
    expect(restored.id).toBe(note.id);
    expect(state.getNoteById(note.id)).toBe(restored);
  });

  it("bumps the id counter past a restored numeric id, so a later addNote never re-mints it", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.deleteNote(note);
    // Restore under an id far ahead of wherever addNote's internal counter
    // currently sits, simulating undo of a note minted much later in the
    // session than any note still present.
    state.restoreNote({ ...note, id: "n99999" });
    const next = state.addNote({ midi: 61, startBeat: 1, durationBeats: 1, velocity: 100 });
    expect(next.id).toBe("n100000");
  });
});

describe("replaceScoreWithIds (Wave C1 finding 1)", () => {
  it("restores every note under its EXACT prior id", () => {
    const a = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const b = state.addNote({ midi: 62, startBeat: 1, durationBeats: 1, velocity: 100 });
    const snapshot = state.getScore().map((n) => ({ ...n }));
    state.clearScore();
    const restored = state.replaceScoreWithIds(snapshot);
    expect(restored.map((n) => n.id)).toEqual([a.id, b.id]);
  });

  it("clears selection (nothing meaningful to keep selected across a full replace)", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    state.selectNote(note);
    state.replaceScoreWithIds([{ ...note }]);
    expect(state.getSelectedNote()).toBeNull();
  });

  it("bumps the id counter past every restored id, so a later addNote never collides", () => {
    // nextId is a module-level counter that persists across tests in this
    // file (there's no reset — resetting it would risk id collisions with
    // notes a real session still references), so this probes the
    // counter's CURRENT position rather than assuming any fixed value.
    const probe = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    const probeNum = Number(/^n(\d+)$/.exec(probe.id)![1]);
    state.clearScore();
    const aheadId = `n${probeNum + 1000}`;
    state.replaceScoreWithIds([{ ...probe, id: aheadId }]);
    const next = state.addNote({ midi: 61, startBeat: 1, durationBeats: 1, velocity: 100 });
    expect(next.id).toBe(`n${probeNum + 1001}`);
  });
});

describe("clampedMoveTarget (Wave C1 finding 2)", () => {
  it("returns the clamped target when the note actually moves", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    expect(state.clampedMoveTarget(note, 1, 61)).toEqual({ startBeat: 1, midi: 61 });
  });

  it("returns null when nudging pitch up while already at MIDI_HI (boundary no-op)", () => {
    const note = state.addNote({ midi: MIDI_HI, startBeat: 4, durationBeats: 1, velocity: 100 });
    expect(state.clampedMoveTarget(note, 4, MIDI_HI + 1)).toBeNull();
  });

  it("returns null when nudging pitch down while already at MIDI_LO (boundary no-op)", () => {
    const note = state.addNote({ midi: MIDI_LO, startBeat: 0, durationBeats: 1, velocity: 100 });
    expect(state.clampedMoveTarget(note, 0, MIDI_LO - 1)).toBeNull();
  });

  it("returns null when nudging time left while already at startBeat 0 (boundary no-op)", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    expect(state.clampedMoveTarget(note, -1, 60)).toBeNull();
  });

  it("clamps a target that overshoots both bounds at once", () => {
    const note = state.addNote({ midi: 60, startBeat: 5, durationBeats: 1, velocity: 100 });
    expect(state.clampedMoveTarget(note, -10, MIDI_HI + 10)).toEqual({ startBeat: 0, midi: MIDI_HI });
  });
});

describe("getNoteById", () => {
  it("finds a note by id", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    expect(state.getNoteById(note.id)).toBe(note);
  });

  it("returns undefined for an unknown id", () => {
    expect(state.getNoteById("nope")).toBeUndefined();
  });
});
