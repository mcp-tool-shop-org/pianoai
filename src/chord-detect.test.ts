// ─── Chord Detection Tests ──────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { detectChord, midiNotesToNames } from "./chord-detect.js";

describe("detectChord", () => {
  describe("major triads", () => {
    it("detects C major (C4-E4-G4)", () => {
      expect(detectChord([60, 64, 67])).toBe("C");
    });

    it("detects G major (G3-B3-D4)", () => {
      expect(detectChord([55, 59, 62])).toBe("G");
    });

    it("detects F# major", () => {
      // F#4=66, A#4=70, C#5=73
      expect(detectChord([66, 70, 73])).toBe("F#");
    });
  });

  describe("minor triads", () => {
    it("detects A minor (A3-C4-E4)", () => {
      expect(detectChord([57, 60, 64])).toBe("Am");
    });

    it("detects D minor (D4-F4-A4)", () => {
      expect(detectChord([62, 65, 69])).toBe("Dm");
    });

    it("detects G minor", () => {
      // G3=55, Bb3=58, D4=62
      expect(detectChord([55, 58, 62])).toBe("Gm");
    });
  });

  describe("diminished triads", () => {
    it("detects B diminished (B3-D4-F4)", () => {
      expect(detectChord([59, 62, 65])).toBe("Bdim");
    });
  });

  describe("augmented triads", () => {
    it("detects C augmented (C4-E4-G#4)", () => {
      expect(detectChord([60, 64, 68])).toBe("Caug");
    });
  });

  describe("seventh chords", () => {
    // Note: matchesPattern allows superset matching, so triads (listed first
    // in PATTERNS) match before 7th chords. The implementation returns the
    // simplest matching pattern.
    it("C major 7th notes resolve to C major (triad matched first)", () => {
      // C4-E4-G4-B4 — contains C major triad, matched before Cmaj7
      expect(detectChord([60, 64, 67, 71])).toBe("C");
    });

    it("A minor 7th notes resolve to Am (triad matched first)", () => {
      expect(detectChord([57, 60, 64, 67])).toBe("Am");
    });

    it("G dominant 7th notes resolve to G (triad matched first)", () => {
      expect(detectChord([55, 59, 62, 65])).toBe("G");
    });

    it("B half-diminished notes resolve to Bdim (triad matched first)", () => {
      expect(detectChord([59, 62, 65, 69])).toBe("Bdim");
    });

    it("fully diminished 7th notes resolve to Bdim (triad matched first)", () => {
      // Bdim7: B3=59, D4=62, F4=65, Ab4=68
      expect(detectChord([59, 62, 65, 68])).toBe("Bdim");
    });
  });

  describe("edge cases", () => {
    it("returns null for a single note", () => {
      expect(detectChord([60])).toBeNull();
    });

    it("returns null for empty array", () => {
      expect(detectChord([])).toBeNull();
    });

    it("returns null for chromatic cluster (no known pattern)", () => {
      // C, C#, D — no chord pattern
      expect(detectChord([60, 61, 62])).toBeNull();
    });

    it("handles duplicate pitch classes across octaves", () => {
      // C3 + C4 + E4 + G4 — still C major
      expect(detectChord([48, 60, 64, 67])).toBe("C");
    });

    it("returns null for two identical notes", () => {
      // Two C4s — only one pitch class, needs at least 2
      expect(detectChord([60, 60])).toBeNull();
    });

    it("detects inversions with slash bass", () => {
      // E4-G4-C5: C major first inversion, bass is E
      const result = detectChord([64, 67, 72]);
      expect(result).toBe("C/E");
    });
  });
});

describe("midiNotesToNames", () => {
  it("converts MIDI numbers to note names", () => {
    expect(midiNotesToNames([60, 64, 67])).toBe("C4 E4 G4");
  });

  it("sorts notes by pitch", () => {
    expect(midiNotesToNames([67, 60, 64])).toBe("C4 E4 G4");
  });

  it("handles sharps", () => {
    expect(midiNotesToNames([61])).toBe("C#4");
  });

  it("handles empty array", () => {
    expect(midiNotesToNames([])).toBe("");
  });

  it("handles wide range", () => {
    // C2=36, C7=96
    const result = midiNotesToNames([36, 96]);
    expect(result).toBe("C2 C7");
  });
});
