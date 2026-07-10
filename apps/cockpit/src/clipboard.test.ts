// ─── clipboard.test.ts ───────────────────────────────────────────────────────
//
// Pure, DOM-free coverage for clipboard.ts's marquee/range geometry and
// clipboard copy/paste/duplicate math (Wave C4 — multi-select + clipboard).
// Importable directly under Node/vitest, same as gesture.test.ts/ruler.test.ts
// cover their own pure-math siblings.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  notesInMarquee, notesInTimeRange, snapshotNotes, pasteAtBeat, duplicateNotes,
  createClipboardStore, type ClipboardNote,
} from "./clipboard.js";
import type { Note } from "./state.js";
import { MIDI_HI } from "./state.js";

function note(over: Partial<Note> & { id: string; midi: number; startBeat: number; durationBeats: number }): Note {
  return { velocity: 100, ...over };
}

describe("notesInMarquee", () => {
  const notes = [
    note({ id: "a", midi: 60, startBeat: 0, durationBeats: 1 }),
    note({ id: "b", midi: 64, startBeat: 2, durationBeats: 1 }),
    note({ id: "c", midi: 67, startBeat: 4, durationBeats: 1 }),
  ];

  it("selects only notes whose row AND time span intersect the rect", () => {
    const ids = notesInMarquee(notes, { beatA: 0, midiA: 58, beatB: 3, midiB: 66 });
    expect(ids.sort()).toEqual(["a", "b"]);
  });

  it("excludes a note whose pitch is outside the rect's midi span", () => {
    const ids = notesInMarquee(notes, { beatA: 0, midiA: 61, beatB: 5, midiB: 66 });
    expect(ids).not.toContain("a");
    expect(ids).toContain("b");
  });

  it("includes notes at the exact midi boundary (inclusive both ends)", () => {
    const ids = notesInMarquee(notes, { beatA: 0, midiA: 60, beatB: 5, midiB: 60 });
    expect(ids).toEqual(["a"]);
  });

  it("works with a reversed rect (bottom-right to top-left drag)", () => {
    const forward = notesInMarquee(notes, { beatA: 0, midiA: 58, beatB: 3, midiB: 66 });
    const reversed = notesInMarquee(notes, { beatA: 3, midiA: 66, beatB: 0, midiB: 58 });
    expect(reversed.sort()).toEqual(forward.sort());
  });

  it("excludes a note whose end lands exactly at the rect's left edge (no real overlap)", () => {
    const ids = notesInMarquee(notes, { beatA: 1, midiA: 55, beatB: 5, midiB: 70 });
    expect(ids).not.toContain("a"); // a ends at beat 1, rect starts at beat 1
  });

  it("excludes a note whose start lands exactly at the rect's right edge (no real overlap)", () => {
    const ids = notesInMarquee(notes, { beatA: 0, midiA: 55, beatB: 2, midiB: 70 });
    expect(ids).not.toContain("b"); // b starts at beat 2, rect ends at beat 2
  });

  it("a rect fully inside a long note's span still selects it", () => {
    const longNote = [note({ id: "long", midi: 60, startBeat: 0, durationBeats: 10 })];
    const ids = notesInMarquee(longNote, { beatA: 3, midiA: 60, beatB: 5, midiB: 60 });
    expect(ids).toEqual(["long"]);
  });

  it("returns an empty array for an empty notes list", () => {
    expect(notesInMarquee([], { beatA: 0, midiA: 0, beatB: 10, midiB: 100 })).toEqual([]);
  });

  it("returns an empty array when the rect touches nothing", () => {
    const ids = notesInMarquee(notes, { beatA: 20, midiA: 20, beatB: 25, midiB: 25 });
    expect(ids).toEqual([]);
  });
});

describe("notesInTimeRange", () => {
  const notes = [
    { id: "a", startBeat: 0 },
    { id: "b", startBeat: 2 },
    { id: "c", startBeat: 4 },
    { id: "d", startBeat: 8 },
  ];

  it("selects every note whose startBeat lies between anchor and target, inclusive", () => {
    expect(notesInTimeRange(notes, 0, 4).sort()).toEqual(["a", "b", "c"]);
  });

  it("works regardless of click direction (target before the anchor in time)", () => {
    expect(notesInTimeRange(notes, 4, 0).sort()).toEqual(["a", "b", "c"]);
  });

  it("anchor and target at the same beat select exactly that beat's notes", () => {
    expect(notesInTimeRange(notes, 2, 2)).toEqual(["b"]);
  });

  it("excludes notes outside the range", () => {
    const ids = notesInTimeRange(notes, 0, 4);
    expect(ids).not.toContain("d");
  });

  it("a range spanning the whole score includes every note", () => {
    expect(notesInTimeRange(notes, 0, 8).sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("snapshotNotes", () => {
  it("returns null for an empty input", () => {
    expect(snapshotNotes([])).toBeNull();
  });

  it("offsetBeat is relative to the EARLIEST note's startBeat", () => {
    const notes = [
      note({ id: "a", midi: 60, startBeat: 4, durationBeats: 1 }),
      note({ id: "b", midi: 64, startBeat: 6, durationBeats: 1 }),
    ];
    const clip = snapshotNotes(notes)!;
    const byMidi = (m: number) => clip.notes.find((n) => n.midi === m)!;
    expect(byMidi(60).offsetBeat).toBe(0);
    expect(byMidi(64).offsetBeat).toBe(2);
  });

  it("a single note has offsetBeat 0 and spanBeats equal to its own duration", () => {
    const clip = snapshotNotes([note({ id: "a", midi: 60, startBeat: 5, durationBeats: 2.5 })])!;
    expect(clip.notes[0].offsetBeat).toBe(0);
    expect(clip.spanBeats).toBe(2.5);
  });

  it("spanBeats is the latest note-END minus the earliest note-START", () => {
    const notes = [
      note({ id: "a", midi: 60, startBeat: 0, durationBeats: 1 }),
      note({ id: "b", midi: 64, startBeat: 3, durationBeats: 2 }),
    ];
    expect(snapshotNotes(notes)!.spanBeats).toBe(5); // 3 + 2 - 0
  });

  it("preserves vowel/breathiness/lyric when present, and omits them when absent", () => {
    const notes = [
      note({ id: "a", midi: 60, startBeat: 0, durationBeats: 1, vowel: "e", breathiness: 0.4, lyric: "la" }),
      note({ id: "b", midi: 64, startBeat: 1, durationBeats: 1 }),
    ];
    const clip = snapshotNotes(notes)!;
    const withVocal = clip.notes.find((n) => n.midi === 60)!;
    const without = clip.notes.find((n) => n.midi === 64)!;
    expect(withVocal.vowel).toBe("e");
    expect(withVocal.breathiness).toBe(0.4);
    expect(withVocal.lyric).toBe("la");
    expect("vowel" in without).toBe(false);
    expect("breathiness" in without).toBe(false);
    expect("lyric" in without).toBe(false);
  });

  it("defensive copy — mutating the source notes after copying doesn't change the snapshot", () => {
    const src = note({ id: "a", midi: 60, startBeat: 0, durationBeats: 1 });
    const clip = snapshotNotes([src])!;
    src.midi = 99;
    expect(clip.notes[0].midi).toBe(60);
  });
});

describe("pasteAtBeat", () => {
  function clipOf(notes: ClipboardNote[]) {
    return { notes, spanBeats: Math.max(0, ...notes.map((n) => n.offsetBeat + n.durationBeats)) };
  }

  it("lands the earliest copied note exactly at targetBeat", () => {
    const clip = clipOf([{ midi: 60, offsetBeat: 0, durationBeats: 1, velocity: 100 }]);
    const pasted = pasteAtBeat(clip, 8);
    expect(pasted[0].startBeat).toBe(8);
  });

  it("preserves relative offsets between notes", () => {
    const clip = clipOf([
      { midi: 60, offsetBeat: 0, durationBeats: 1, velocity: 100 },
      { midi: 64, offsetBeat: 2, durationBeats: 1, velocity: 90 },
    ]);
    const pasted = pasteAtBeat(clip, 10);
    expect(pasted.map((n) => n.startBeat)).toEqual([10, 12]);
  });

  it("preserves pitches unchanged", () => {
    const clip = clipOf([{ midi: 67, offsetBeat: 0, durationBeats: 1, velocity: 100 }]);
    expect(pasteAtBeat(clip, 4)[0].midi).toBe(67);
  });

  it("floors the target beat at 0", () => {
    const clip = clipOf([{ midi: 60, offsetBeat: 0, durationBeats: 1, velocity: 100 }]);
    expect(pasteAtBeat(clip, -5)[0].startBeat).toBe(0);
  });

  it("clamps a note landing past maxBeat", () => {
    const clip = clipOf([{ midi: 60, offsetBeat: 0, durationBeats: 1, velocity: 100 }]);
    expect(pasteAtBeat(clip, 1000, 64)[0].startBeat).toBe(64);
  });

  it("clamps pitch defensively via clampMidi even on a hand-built out-of-range clipboard note", () => {
    const clip = clipOf([{ midi: MIDI_HI + 50, offsetBeat: 0, durationBeats: 1, velocity: 100 }]);
    expect(pasteAtBeat(clip, 0)[0].midi).toBe(MIDI_HI);
  });

  it("carries vowel/breathiness/lyric through when present", () => {
    const clip = clipOf([{ midi: 60, offsetBeat: 0, durationBeats: 1, velocity: 100, vowel: "u", breathiness: 0.2, lyric: "ta" }]);
    const pasted = pasteAtBeat(clip, 0)[0];
    expect(pasted.vowel).toBe("u");
    expect(pasted.breathiness).toBe(0.2);
    expect(pasted.lyric).toBe("ta");
  });

  it("is pure — calling it twice with the same input produces equal, independent results", () => {
    const clip = clipOf([{ midi: 60, offsetBeat: 1, durationBeats: 1, velocity: 100 }]);
    const first = pasteAtBeat(clip, 5);
    const second = pasteAtBeat(clip, 5);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });
});

describe("duplicateNotes", () => {
  it("returns null for an empty selection", () => {
    expect(duplicateNotes([])).toBeNull();
  });

  it("shifts forward by exactly the selection's own time span (finding 82)", () => {
    const notes = [
      note({ id: "a", midi: 60, startBeat: 0, durationBeats: 1 }),
      note({ id: "b", midi: 64, startBeat: 1, durationBeats: 1 }),
    ]; // span = 2 (latest end 2 - earliest start 0)
    const dup = duplicateNotes(notes)!;
    expect(dup.map((n) => n.startBeat)).toEqual([2, 3]);
  });

  it("preserves pitches and relative spacing from the original selection", () => {
    const notes = [
      note({ id: "a", midi: 60, startBeat: 4, durationBeats: 2 }),
      note({ id: "b", midi: 67, startBeat: 8, durationBeats: 1 }),
    ];
    const dup = duplicateNotes(notes)!;
    expect(dup.map((n) => n.midi)).toEqual([60, 67]);
    expect(dup[1].startBeat - dup[0].startBeat).toBe(notes[1].startBeat - notes[0].startBeat);
  });

  it("a single note duplicates immediately after its own end", () => {
    const dup = duplicateNotes([note({ id: "a", midi: 60, startBeat: 0, durationBeats: 3 })])!;
    expect(dup[0].startBeat).toBe(3);
  });

  it("clamps the duplicate's placement to maxBeat", () => {
    // span = 3, so the duplicate would land at 65 + 3 = 68 unclamped —
    // past maxBeat=64.
    const dup = duplicateNotes([note({ id: "a", midi: 60, startBeat: 65, durationBeats: 3 })], 64)!;
    expect(dup[0].startBeat).toBe(64);
  });
});

describe("createClipboardStore", () => {
  it("get() returns null before any copy", () => {
    expect(createClipboardStore().get()).toBeNull();
  });

  it("hasContent() is false before any copy", () => {
    expect(createClipboardStore().hasContent()).toBe(false);
  });

  it("copy() with notes returns true and stores a retrievable snapshot", () => {
    const store = createClipboardStore();
    const ok = store.copy([note({ id: "a", midi: 60, startBeat: 0, durationBeats: 1 })]);
    expect(ok).toBe(true);
    expect(store.hasContent()).toBe(true);
    expect(store.get()!.notes[0].midi).toBe(60);
  });

  it("copy() with an empty array returns false and does not clobber prior content", () => {
    const store = createClipboardStore();
    store.copy([note({ id: "a", midi: 60, startBeat: 0, durationBeats: 1 })]);
    const ok = store.copy([]);
    expect(ok).toBe(false);
    expect(store.get()!.notes[0].midi).toBe(60);
  });

  it("a second copy() replaces the first snapshot", () => {
    const store = createClipboardStore();
    store.copy([note({ id: "a", midi: 60, startBeat: 0, durationBeats: 1 })]);
    store.copy([note({ id: "b", midi: 71, startBeat: 2, durationBeats: 1 })]);
    expect(store.get()!.notes).toHaveLength(1);
    expect(store.get()!.notes[0].midi).toBe(71);
  });

  it("two independently-created stores don't share state", () => {
    const a = createClipboardStore();
    const b = createClipboardStore();
    a.copy([note({ id: "a", midi: 60, startBeat: 0, durationBeats: 1 })]);
    expect(b.hasContent()).toBe(false);
  });
});
