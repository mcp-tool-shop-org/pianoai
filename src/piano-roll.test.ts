import { describe, it, expect, beforeAll } from "vitest";
import { renderPianoRoll } from "./piano-roll.js";
import { parseNoteToMidi, midiToNoteName, splitChordToken } from "./note-parser.js";
import { getSong, initializeFromLibrary } from "./songs/index.js";
import type { SongEntry } from "./songs/types.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    ],
    ...overrides,
  };
}

/** Extract the plotted note rects (x position, width, title) from the SVG. */
function plottedNotes(svg: string): { x: number; width: number; title: string }[] {
  const out: { x: number; width: number; title: string }[] = [];
  const re =
    /<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="[\d.]+"[^>]*>\s*<title>([^<]+)<\/title>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) {
    out.push({ x: parseFloat(m[1]), width: parseFloat(m[2]), title: m[3] });
  }
  return out;
}

describe("renderPianoRoll — chord tokens", () => {
  it("plots every tone of a '+'-joined chord with shared duration (MIDI ingest format)", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4+E4+G4:q", leftHand: "" }],
    });
    const notes = plottedNotes(renderPianoRoll(song));
    expect(notes.map((n) => n.title)).toEqual([
      "RH: C4 (m.1)",
      "RH: E4 (m.1)",
      "RH: G4 (m.1)",
    ]);
    // All chord tones start on the same beat
    expect(notes[1].x).toBe(notes[0].x);
    expect(notes[2].x).toBe(notes[0].x);
  });

  it("plots chord tokens without a duration suffix", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "E4+G4", leftHand: "" }],
    });
    const titles = plottedNotes(renderPianoRoll(song)).map((n) => n.title);
    expect(titles).toEqual(["RH: E4 (m.1)", "RH: G4 (m.1)"]);
  });

  it("applies the shared duration to every chord tone", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "", leftHand: "C3+G3:h" }],
    });
    const notes = plottedNotes(renderPianoRoll(song));
    expect(notes.map((n) => n.title)).toEqual(["LH: C3 (m.1)", "LH: G3 (m.1)"]);
    expect(notes[0].x).toBe(notes[1].x);
    expect(notes[0].width).toBe(notes[1].width);
  });

  it("plots chord tokens with accidentals", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C#4+F4:h", leftHand: "" }],
    });
    const titles = plottedNotes(renderPianoRoll(song)).map((n) => n.title);
    expect(titles).toEqual(["RH: C#4 (m.1)", "RH: F4 (m.1)"]);
  });

  it("plots duplicate tones inside a chord", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "", leftHand: "C2+C2+E3+E3+G3+G3:w" }],
    });
    const titles = plottedNotes(renderPianoRoll(song)).map((n) => n.title);
    expect(titles.filter((t) => t === "LH: C2 (m.1)")).toHaveLength(2);
    expect(titles).toHaveLength(6);
  });

  it("advances the beat cursor by the chord duration (default 60px per beat)", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4+E4+G4:q C5:q", leftHand: "" }],
    });
    const notes = plottedNotes(renderPianoRoll(song));
    const c4 = notes.find((n) => n.title.startsWith("RH: C4"))!;
    const c5 = notes.find((n) => n.title.startsWith("RH: C5"))!;
    expect(c5.x - c4.x).toBe(60); // quarter-note chord → next token 1 beat later
  });

  it("advances by the longest tone when chord parts carry their own durations", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4:q+E4:h G4:q", leftHand: "" }],
    });
    const notes = plottedNotes(renderPianoRoll(song));
    const c4 = notes.find((n) => n.title.startsWith("RH: C4"))!;
    const g4 = notes.find((n) => n.title.startsWith("RH: G4"))!;
    expect(notes).toHaveLength(3);
    expect(g4.x - c4.x).toBe(120); // half-note tone dominates → 2 beats
  });

  it("handles hand strings mixing melody, chords, and rests", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4:q E4+G4:h R:q", leftHand: "R:w" }],
    });
    const notes = plottedNotes(renderPianoRoll(song));
    expect(notes.map((n) => n.title)).toEqual([
      "RH: C4 (m.1)",
      "RH: E4 (m.1)",
      "RH: G4 (m.1)",
    ]);
    const c4 = notes[0];
    // Chord starts one quarter-note after the melody note
    expect(notes[1].x - c4.x).toBe(60);
    expect(notes[2].x - c4.x).toBe(60);
  });

  it("still renders plain single-note hand strings identically", () => {
    const notes = plottedNotes(renderPianoRoll(makeSong()));
    expect(notes.map((n) => n.title)).toEqual([
      "RH: C4 (m.1)",
      "RH: E4 (m.1)",
      "RH: G4 (m.1)",
      "RH: C5 (m.1)",
      "LH: C3 (m.1)",
      "LH: E3 (m.1)",
    ]);
  });
});

// ─── Library Integration ────────────────────────────────────────────────────
//
// Library songs are ingested from real MIDI, where nearly every song contains
// "+"-joined chord tokens. Before the chord fix, parseHand silently dropped
// every one of these — piano rolls rendered melody only.

describe("renderPianoRoll — library songs (integration)", () => {
  beforeAll(() => {
    initializeFromLibrary(join(__dirname, "..", "songs", "library"));
  });

  for (const songId of ["fallin", "fur-elise"]) {
    it(`plots every chord tone of library song "${songId}"`, () => {
      const song = getSong(songId);
      expect(song, `song ${songId} should load from the library`).toBeTruthy();

      const titles = plottedNotes(renderPianoRoll(song!)).map((n) => n.title);

      let chordTokens = 0;
      for (const m of song!.measures) {
        const hands = [
          { str: m.rightHand, label: "RH" },
          { str: m.leftHand, label: "LH" },
        ];
        for (const { str, label } of hands) {
          if (!str || str.trim() === "") continue;
          for (const token of str.trim().split(/\s+/)) {
            if (!token.includes("+")) continue;
            chordTokens++;
            for (const { noteStr } of splitChordToken(token)) {
              if (noteStr === "" || noteStr.toUpperCase() === "R") continue;
              const name = midiToNoteName(parseNoteToMidi(noteStr));
              expect(
                titles,
                `chord tone ${noteStr} from ${label} token "${token}" (m.${m.number})`
              ).toContain(`${label}: ${name} (m.${m.number})`);
            }
          }
        }
      }

      // Guard: the song must actually exercise chords, or this test is vacuous
      expect(chordTokens).toBeGreaterThan(0);
    });
  }
});
