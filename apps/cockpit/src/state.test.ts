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

describe("getNoteById", () => {
  it("finds a note by id", () => {
    const note = state.addNote({ midi: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
    expect(state.getNoteById(note.id)).toBe(note);
  });

  it("returns undefined for an unknown id", () => {
    expect(state.getNoteById("nope")).toBeUndefined();
  });
});
