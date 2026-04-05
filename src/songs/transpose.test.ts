import { describe, it, expect } from "vitest";
import { transposeSong } from "./transpose.js";
import type { SongEntry } from "./types.js";

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
      { number: 1, rightHand: "C4:q E4:q G4:q C5:q", leftHand: "C3:h E3:h" },
      { number: 2, rightHand: "D4:q F4:q A4:q D5:q", leftHand: "D3:h F3:h" },
    ],
    ...overrides,
  };
}

describe("transposeSong", () => {
  it("returns a copy when semitones is 0", () => {
    const song = makeSong();
    const result = transposeSong(song, 0);
    expect(result.id).toBe("test-song");
    expect(result.measures[0].rightHand).toBe("C4:q E4:q G4:q C5:q");
  });

  it("transposes up by 2 semitones (C major → D major)", () => {
    const song = makeSong();
    const result = transposeSong(song, 2);
    expect(result.key).toBe("D major");
    expect(result.measures[0].rightHand).toBe("D4:q F#4:q A4:q D5:q");
    expect(result.measures[0].leftHand).toBe("D3:h F#3:h");
  });

  it("transposes down by 3 semitones (C major → A major)", () => {
    const song = makeSong();
    const result = transposeSong(song, -3);
    expect(result.key).toBe("A major");
    expect(result.measures[0].rightHand).toBe("A3:q C#4:q E4:q A4:q");
  });

  it("updates id and title with transposition info", () => {
    const song = makeSong();
    const result = transposeSong(song, 5);
    expect(result.id).toBe("test-song-transposed-up5");
    expect(result.title).toContain("F major");
  });

  it("preserves rests", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "R:q C4:q R:q E4:q", leftHand: "R:h C3:h" }],
    });
    const result = transposeSong(song, 2);
    expect(result.measures[0].rightHand).toBe("R:q D4:q R:q F#4:q");
    expect(result.measures[0].leftHand).toBe("R:h D3:h");
  });

  it("preserves durations on all notes", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4:w", leftHand: "C3:s" }],
    });
    const result = transposeSong(song, 1);
    expect(result.measures[0].rightHand).toBe("C#4:w");
    expect(result.measures[0].leftHand).toBe("C#3:s");
  });

  it("handles chords (space-separated notes with shared duration)", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4 E4 G4:q", leftHand: "C3:q" }],
    });
    const result = transposeSong(song, 4);
    expect(result.measures[0].rightHand).toBe("E4 G#4 B4:q");
  });

  it("transposes minor keys correctly", () => {
    const song = makeSong({ key: "A minor" });
    const result = transposeSong(song, 3);
    expect(result.key).toBe("C minor");
  });

  it("wraps key around (e.g., B major + 1 = C major)", () => {
    const song = makeSong({ key: "B major" });
    const result = transposeSong(song, 1);
    expect(result.key).toBe("C major");
  });

  it("handles negative wrapping (C major - 1 = B major)", () => {
    const song = makeSong({ key: "C major" });
    const result = transposeSong(song, -1);
    expect(result.key).toBe("B major");
  });

  it("throws when transposition puts notes out of MIDI range", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C8:q", leftHand: "C1:q" }],
    });
    // C8 = MIDI 108, +20 = 128 which is out of range
    expect(() => transposeSong(song, 20)).toThrow("out of MIDI range");
  });

  it("preserves non-note fields (fingering, teachingNote, dynamics)", () => {
    const song = makeSong({
      measures: [{
        number: 1,
        rightHand: "C4:q",
        leftHand: "C3:q",
        fingering: "1-3-5",
        teachingNote: "Watch the legato",
        dynamics: "mf",
      }],
    });
    const result = transposeSong(song, 2);
    expect(result.measures[0].fingering).toBe("1-3-5");
    expect(result.measures[0].teachingNote).toBe("Watch the legato");
    expect(result.measures[0].dynamics).toBe("mf");
  });

  it("preserves metadata (composer, genre, tempo, etc.)", () => {
    const song = makeSong({ composer: "Bach", tempo: 80, timeSignature: "3/4" });
    const result = transposeSong(song, 5);
    expect(result.composer).toBe("Bach");
    expect(result.tempo).toBe(80);
    expect(result.timeSignature).toBe("3/4");
    expect(result.genre).toBe("classical");
  });

  it("handles empty measures", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "", leftHand: "" }],
    });
    const result = transposeSong(song, 5);
    expect(result.measures[0].rightHand).toBe("");
    expect(result.measures[0].leftHand).toBe("");
  });
});
