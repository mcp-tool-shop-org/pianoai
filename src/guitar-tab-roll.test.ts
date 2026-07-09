import { describe, it, expect } from "vitest";
import { renderGuitarTab } from "./guitar-tab-roll.js";
import type { SongEntry } from "./songs/types.js";

function makeSong(overrides: Partial<SongEntry> = {}): SongEntry {
  return {
    id: "test-song",
    title: "Test Song",
    genre: "classical",
    difficulty: "beginner",
    key: "C major",
    tempo: 120,
    timeSignature: "4/4",
    durationSeconds: 30,
    tags: ["test"],
    musicalLanguage: {
      description: "A test piece.",
      structure: "ABA",
      keyMoments: ["Opening"],
      teachingGoals: ["Basics"],
      styleTips: ["Legato"],
    },
    measures: [
      { number: 1, rightHand: "C4:q E4:q G4:q C5:q", leftHand: "" },
    ],
    ...overrides,
  };
}

interface EmbeddedNote {
  midi: number;
  startBeat: number;
  durationBeats: number;
  noteName: string;
}

/** Extract the embedded SONG data object from the generated HTML. */
function embeddedNotes(html: string): EmbeddedNote[] {
  const match = html.match(/const SONG = (.+);/);
  expect(match, "HTML should embed a SONG object").toBeTruthy();
  return JSON.parse(match![1]).notes as EmbeddedNote[];
}

describe("renderGuitarTab — chord tokens", () => {
  it("maps every tone of a '+'-joined chord with shared duration (MIDI ingest format)", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "E3+G3+B3:q", leftHand: "" }],
    });
    const notes = embeddedNotes(renderGuitarTab(song));
    expect(notes.map((n) => n.noteName).sort()).toEqual(["B3", "E3", "G3"]);
    // All chord tones start on the same beat with the shared duration
    for (const n of notes) {
      expect(n.startBeat).toBe(0);
      expect(n.durationBeats).toBe(1);
    }
  });

  it("maps chord tokens without a duration suffix", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4+E4", leftHand: "" }],
    });
    const notes = embeddedNotes(renderGuitarTab(song));
    expect(notes.map((n) => n.midi).sort((a, b) => a - b)).toEqual([60, 64]);
  });

  it("advances the beat cursor by the chord's longest tone", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "E3+G3:h B3:q", leftHand: "" }],
    });
    const notes = embeddedNotes(renderGuitarTab(song));
    const b3 = notes.find((n) => n.noteName === "B3")!;
    expect(notes).toHaveLength(3);
    expect(b3.startBeat).toBe(2); // half-note chord → next token 2 beats later
  });

  it("still maps plain single-note hand strings identically", () => {
    const notes = embeddedNotes(renderGuitarTab(makeSong()));
    expect(notes.map((n) => n.noteName)).toEqual(["C4", "E4", "G4", "C5"]);
    expect(notes.map((n) => n.startBeat)).toEqual([0, 1, 2, 3]);
  });
});
