import { describe, it, expect } from "vitest";
import {
  parseNoteToMidi,
  parseDuration,
  durationToMs,
  parseNoteToken,
  parseHandString,
  parseMeasure,
  safeParseNoteToken,
  safeParseHandString,
  safeParseMeasure,
  midiToNoteName,
  splitChordToken,
  noteToSingable,
  handToSingableText,
  measureToSingableText,
} from "./note-parser.js";
import type { ParseWarning } from "./types.js";

describe("parseNoteToMidi", () => {
  it("converts C4 to 60 (middle C)", () => {
    expect(parseNoteToMidi("C4")).toBe(60);
  });

  it("converts A4 to 69 (concert A)", () => {
    expect(parseNoteToMidi("A4")).toBe(69);
  });

  it("handles sharps: F#5 = 78", () => {
    expect(parseNoteToMidi("F#5")).toBe(78);
  });

  it("handles flats: Bb3 = 58", () => {
    expect(parseNoteToMidi("Bb3")).toBe(58);
  });

  it("converts C#4 to 61", () => {
    expect(parseNoteToMidi("C#4")).toBe(61);
  });

  it("converts Eb4 to 63", () => {
    expect(parseNoteToMidi("Eb4")).toBe(63);
  });

  it("handles low notes: C2 = 36", () => {
    expect(parseNoteToMidi("C2")).toBe(36);
  });

  it("handles MIDI floor: C-1 = 0", () => {
    expect(parseNoteToMidi("C-1")).toBe(0);
  });

  it("handles high notes: C7 = 96", () => {
    expect(parseNoteToMidi("C7")).toBe(96);
  });

  it("handles MIDI ceiling: G9 = 127", () => {
    expect(parseNoteToMidi("G9")).toBe(127);
  });

  it("returns -1 for rest (R)", () => {
    expect(parseNoteToMidi("R")).toBe(-1);
  });

  it("throws on invalid note", () => {
    expect(() => parseNoteToMidi("X4")).toThrow("Invalid note");
  });

  it("throws on note without octave", () => {
    expect(() => parseNoteToMidi("C")).toThrow("Invalid note");
  });

  it("throws when note resolves above MIDI range", () => {
    expect(() => parseNoteToMidi("A9")).toThrow("MIDI note out of range");
    expect(() => parseNoteToMidi("C10")).toThrow("MIDI note out of range");
  });
});

describe("parseDuration", () => {
  it("whole note = 4.0", () => {
    expect(parseDuration("w")).toBe(4.0);
  });

  it("half note = 2.0", () => {
    expect(parseDuration("h")).toBe(2.0);
  });

  it("quarter note = 1.0", () => {
    expect(parseDuration("q")).toBe(1.0);
  });

  it("eighth note = 0.5", () => {
    expect(parseDuration("e")).toBe(0.5);
  });

  it("sixteenth note = 0.25", () => {
    expect(parseDuration("s")).toBe(0.25);
  });

  it("throws on unknown suffix", () => {
    expect(() => parseDuration("x")).toThrow("Unknown duration");
  });
});

describe("durationToMs", () => {
  it("quarter note at 120 BPM = 500ms", () => {
    expect(durationToMs(1.0, 120)).toBe(500);
  });

  it("half note at 120 BPM = 1000ms", () => {
    expect(durationToMs(2.0, 120)).toBe(1000);
  });

  it("eighth note at 60 BPM = 500ms", () => {
    expect(durationToMs(0.5, 60)).toBe(500);
  });

  it("whole note at 60 BPM = 4000ms", () => {
    expect(durationToMs(4.0, 60)).toBe(4000);
  });
});

describe("parseNoteToken", () => {
  it("parses C4:q at 120 BPM", () => {
    const note = parseNoteToken("C4:q", 120);
    expect(note.note).toBe(60);
    expect(note.durationMs).toBe(500);
    expect(note.velocity).toBe(80);
    expect(note.channel).toBe(0);
  });

  it("parses F#5:e at 100 BPM", () => {
    const note = parseNoteToken("F#5:e", 100);
    expect(note.note).toBe(78);
    expect(note.durationMs).toBe(300); // 600ms per quarter * 0.5
  });

  it("rest has velocity 0", () => {
    const note = parseNoteToken("R:q", 120);
    expect(note.note).toBe(-1);
    expect(note.velocity).toBe(0);
  });

  it("respects custom velocity and channel", () => {
    const note = parseNoteToken("A4:h", 120, 5, 100);
    expect(note.channel).toBe(5);
    expect(note.velocity).toBe(100);
  });
});

describe("parseHandString", () => {
  it("parses a sequence of notes", () => {
    const beats = parseHandString("C4:q E4:q G4:q", "right", 120);
    expect(beats.length).toBe(3);
    expect(beats[0].hand).toBe("right");
    expect(beats[0].notes[0].note).toBe(60); // C4
    expect(beats[1].notes[0].note).toBe(64); // E4
    expect(beats[2].notes[0].note).toBe(67); // G4
  });

  it("returns empty for empty string", () => {
    expect(parseHandString("", "left", 120)).toEqual([]);
  });

  it("handles single note", () => {
    const beats = parseHandString("C3:w", "left", 60);
    expect(beats.length).toBe(1);
    expect(beats[0].notes[0].note).toBe(48);
    expect(beats[0].notes[0].durationMs).toBe(4000); // whole note at 60 BPM
  });
});

describe("parseMeasure", () => {
  it("parses a full measure", () => {
    const pm = parseMeasure(
      {
        number: 1,
        rightHand: "C4:q E4:q G4:q",
        leftHand: "C3:h",
      },
      120
    );
    expect(pm.rightBeats.length).toBe(3);
    expect(pm.leftBeats.length).toBe(1);
    expect(pm.source.number).toBe(1);
  });
});

describe("midiToNoteName", () => {
  it("60 → C4", () => {
    expect(midiToNoteName(60)).toBe("C4");
  });

  it("69 → A4", () => {
    expect(midiToNoteName(69)).toBe("A4");
  });

  it("78 → F#5", () => {
    expect(midiToNoteName(78)).toBe("F#5");
  });

  it("-1 → R (rest)", () => {
    expect(midiToNoteName(-1)).toBe("R");
  });
});

describe("safeParseNoteToken", () => {
  it("returns MidiNote for valid token", () => {
    const warnings: ParseWarning[] = [];
    const result = safeParseNoteToken("C4:q", 120, "test", warnings);
    expect(result).not.toBeNull();
    expect(result!.note).toBe(60);
    expect(warnings.length).toBe(0);
  });

  it("returns null and collects warning for invalid token", () => {
    const warnings: ParseWarning[] = [];
    const result = safeParseNoteToken("XYZ:q", 120, "measure 1 right hand", warnings);
    expect(result).toBeNull();
    expect(warnings.length).toBe(1);
    expect(warnings[0].token).toBe("XYZ:q");
    expect(warnings[0].location).toBe("measure 1 right hand");
    expect(warnings[0].message).toContain("Invalid note");
  });

  it("returns null for bad duration suffix", () => {
    const warnings: ParseWarning[] = [];
    const result = safeParseNoteToken("C4:z", 120, "test", warnings);
    expect(result).toBeNull();
    expect(warnings.length).toBe(1);
    expect(warnings[0].message).toContain("Unknown duration");
  });
});

describe("safeParseHandString", () => {
  it("skips bad tokens and returns good ones", () => {
    const warnings: ParseWarning[] = [];
    const beats = safeParseHandString("C4:q BAD:q E4:q", "right", 120, 1, warnings);
    expect(beats.length).toBe(2); // C4 and E4 parsed, BAD skipped
    expect(beats[0].notes[0].note).toBe(60);
    expect(beats[1].notes[0].note).toBe(64);
    expect(warnings.length).toBe(1);
    expect(warnings[0].token).toBe("BAD:q");
  });

  it("returns empty for all-bad tokens", () => {
    const warnings: ParseWarning[] = [];
    const beats = safeParseHandString("XYZ:q ZZZ:q", "left", 120, 2, warnings);
    expect(beats.length).toBe(0);
    expect(warnings.length).toBe(2);
  });
});

describe("safeParseMeasure", () => {
  it("parses valid measure with no warnings", () => {
    const warnings: ParseWarning[] = [];
    const pm = safeParseMeasure(
      { number: 1, rightHand: "C4:q E4:q", leftHand: "C3:h" },
      120,
      warnings
    );
    expect(pm.rightBeats.length).toBe(2);
    expect(pm.leftBeats.length).toBe(1);
    expect(warnings.length).toBe(0);
  });

  it("handles measure with bad notes gracefully", () => {
    const warnings: ParseWarning[] = [];
    const pm = safeParseMeasure(
      { number: 5, rightHand: "C4:q GARBAGE E4:q", leftHand: "ZZZ" },
      120,
      warnings
    );
    // Right hand: C4 + E4 good, GARBAGE skipped
    expect(pm.rightBeats.length).toBe(2);
    // Left hand: ZZZ skipped (bad note, default :q suffix)
    expect(pm.leftBeats.length).toBe(0);
    expect(warnings.length).toBe(2);
  });
});

// ─── Chord Token Splitting ──────────────────────────────────────────────────

describe("splitChordToken", () => {
  it("returns a single note as a one-part chord", () => {
    expect(splitChordToken("C4:q")).toEqual([{ noteStr: "C4", durSuffix: "q" }]);
  });

  it("defaults a bare note to quarter duration", () => {
    expect(splitChordToken("C4")).toEqual([{ noteStr: "C4", durSuffix: "q" }]);
  });

  it("shares the last part's duration across the chord (MIDI ingest format)", () => {
    expect(splitChordToken("C4+E4+G4:h")).toEqual([
      { noteStr: "C4", durSuffix: "h" },
      { noteStr: "E4", durSuffix: "h" },
      { noteStr: "G4", durSuffix: "h" },
    ]);
  });

  it("shares a duration that appears on a non-last part", () => {
    expect(splitChordToken("C4:h+E4")).toEqual([
      { noteStr: "C4", durSuffix: "h" },
      { noteStr: "E4", durSuffix: "h" },
    ]);
  });

  it("keeps per-part durations when present", () => {
    expect(splitChordToken("C4:q+E4:h")).toEqual([
      { noteStr: "C4", durSuffix: "q" },
      { noteStr: "E4", durSuffix: "h" },
    ]);
  });

  it("defaults a chord without any suffix to quarter duration", () => {
    expect(splitChordToken("E4+G4")).toEqual([
      { noteStr: "E4", durSuffix: "q" },
      { noteStr: "G4", durSuffix: "q" },
    ]);
  });
});

// ─── Sing-Along Conversion ──────────────────────────────────────────────────

describe("noteToSingable", () => {
  it("note-names: C4 → 'C'", () => {
    expect(noteToSingable("C4", "note-names")).toBe("C");
  });

  it("note-names: F#5 → 'F sharp'", () => {
    expect(noteToSingable("F#5", "note-names")).toBe("F sharp");
  });

  it("note-names: Bb3 → 'B flat'", () => {
    expect(noteToSingable("Bb3", "note-names")).toBe("B flat");
  });

  it("note-names: rest → 'rest'", () => {
    expect(noteToSingable("R", "note-names")).toBe("rest");
  });

  it("solfege: C4 → 'Do'", () => {
    expect(noteToSingable("C4", "solfege")).toBe("Do");
  });

  it("solfege: E4 → 'Mi'", () => {
    expect(noteToSingable("E4", "solfege")).toBe("Mi");
  });

  it("solfege: F#5 → 'Fi'", () => {
    expect(noteToSingable("F#5", "solfege")).toBe("Fi");
  });

  it("solfege: Bb3 → 'Te' (flat solfege)", () => {
    expect(noteToSingable("Bb3", "solfege")).toBe("Te");
  });

  it("solfege: Ab4 → 'Le' (flat solfege)", () => {
    expect(noteToSingable("Ab4", "solfege")).toBe("Le");
  });

  it("solfege: Eb4 → 'Me' (flat solfege)", () => {
    expect(noteToSingable("Eb4", "solfege")).toBe("Me");
  });

  it("syllables: any note → 'da'", () => {
    expect(noteToSingable("C4", "syllables")).toBe("da");
    expect(noteToSingable("F#5", "syllables")).toBe("da");
  });

  it("syllables: rest → '...'", () => {
    expect(noteToSingable("R", "syllables")).toBe("...");
  });

  it("contour: falls back to letter", () => {
    expect(noteToSingable("C4", "contour")).toBe("C");
  });

  it("passes through unparseable tokens", () => {
    expect(noteToSingable("XYZ", "note-names")).toBe("XYZ");
  });

  it("note-names: chord → 'C-E-G chord'", () => {
    expect(noteToSingable("C4+E4+G4", "note-names")).toBe("C-E-G chord");
  });

  it("note-names: chord with accidentals", () => {
    expect(noteToSingable("C#4+F4", "note-names")).toBe("C sharp-F chord");
  });

  it("solfege: chord → 'Do-Mi-Sol chord'", () => {
    expect(noteToSingable("C4+E4+G4", "solfege")).toBe("Do-Mi-Sol chord");
  });

  it("syllables: chord is one beat → single 'da'", () => {
    expect(noteToSingable("C4+E4+G4", "syllables")).toBe("da");
  });

  it("strips per-part duration suffixes inside chord tokens", () => {
    expect(noteToSingable("C4:q+E4:q", "note-names")).toBe("C-E chord");
  });
});

describe("handToSingableText", () => {
  it("note-names: sequence", () => {
    expect(handToSingableText("C4:q E4:q G4:q", "note-names")).toBe("C... E... G");
  });

  it("solfege: sequence", () => {
    expect(handToSingableText("C4:q E4:q G4:q", "solfege")).toBe("Do... Mi... Sol");
  });

  it("syllables: sequence", () => {
    expect(handToSingableText("C4:q E4:q G4:q", "syllables")).toBe("da... da... da");
  });

  it("contour: ascending → 'up... up'", () => {
    expect(handToSingableText("C4:q E4:q G4:q", "contour")).toBe("up... up");
  });

  it("contour: descending → 'down... down'", () => {
    expect(handToSingableText("G4:q E4:q C4:q", "contour")).toBe("down... down");
  });

  it("contour: mixed → 'up... down'", () => {
    expect(handToSingableText("C4:q E4:q C4:q", "contour")).toBe("up... down");
  });

  it("contour: repeated note → 'same'", () => {
    expect(handToSingableText("C4:q C4:q", "contour")).toBe("same");
  });

  it("contour: single note → 'hold'", () => {
    expect(handToSingableText("C4:q", "contour")).toBe("hold");
  });

  it("returns empty for empty string", () => {
    expect(handToSingableText("", "note-names")).toBe("");
  });

  it("handles rest tokens in contour", () => {
    expect(handToSingableText("C4:q R:q E4:q", "contour")).toBe("rest... rest");
  });

  it("note-names: '+'-joined chord token with shared duration (MIDI ingest format)", () => {
    expect(handToSingableText("C4+E4+G4:q", "note-names")).toBe("C-E-G chord");
  });

  it("note-names: mixes melody, chords, and rests", () => {
    expect(handToSingableText("C4:q E4+G4:h R:q", "note-names")).toBe(
      "C... E-G chord... rest"
    );
  });

  it("note-names: chord token with per-part durations loses no tone", () => {
    expect(handToSingableText("C4:q+E4:q", "note-names")).toBe("C-E chord");
  });

  it("solfege: chord token", () => {
    expect(handToSingableText("C3+G3:h C4:q", "solfege")).toBe("Do-Sol chord... Do");
  });

  it("syllables: chord is one beat → single 'da'", () => {
    expect(handToSingableText("C4+E4+G4:q C4:q", "syllables")).toBe("da... da");
  });

  it("contour: chord contour follows its top tone", () => {
    // Top of C4+E4 is E4; G4 is above it → "up"
    expect(handToSingableText("C4+E4:q G4:q", "contour")).toBe("up");
    // Top of C4+G4 is G4; E4 is below it → "down"
    expect(handToSingableText("C4+G4:q E4:q", "contour")).toBe("down");
  });
});

describe("measureToSingableText", () => {
  const measure = { rightHand: "C4:q E4:q G4:q", leftHand: "C3:h E3:h" };

  it("right hand only", () => {
    const result = measureToSingableText(measure, { mode: "note-names", hand: "right" });
    expect(result).toBe("C... E... G");
  });

  it("left hand only", () => {
    const result = measureToSingableText(measure, { mode: "note-names", hand: "left" });
    expect(result).toBe("C... E");
  });

  it("both hands", () => {
    const result = measureToSingableText(measure, { mode: "solfege", hand: "both" });
    expect(result).toBe("Do... Mi... Sol. Left hand: Do... Mi");
  });

  it("both hands with empty left", () => {
    const result = measureToSingableText(
      { rightHand: "C4:q", leftHand: "" },
      { mode: "note-names", hand: "both" }
    );
    expect(result).toBe("C");
  });

  it("both hands with empty right", () => {
    const result = measureToSingableText(
      { rightHand: "", leftHand: "C3:q" },
      { mode: "note-names", hand: "both" }
    );
    expect(result).toBe("C");
  });
});
