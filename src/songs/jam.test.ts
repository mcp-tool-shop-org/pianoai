import { describe, it, expect } from "vitest";
import {
  inferChord,
  computeContour,
  getStyleGuidance,
  generateJamBrief,
  formatJamBrief,
} from "./jam.js";
import type { SongEntry } from "./types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSong(overrides: Partial<SongEntry> = {}): SongEntry {
  return {
    id: "test-song",
    title: "Test Song",
    genre: "classical",
    difficulty: "beginner",
    key: "C major",
    tempo: 120,
    timeSignature: "4/4",
    durationSeconds: 60,
    musicalLanguage: {
      description: "A test song.",
      structure: "ABA",
      keyMoments: ["Opening theme"],
      teachingGoals: ["Basic rhythm"],
      styleTips: ["Legato"],
    },
    measures: [
      { number: 1, rightHand: "C4:q D4:q E4:q F4:q", leftHand: "C3:q E3:q G3:q" },
      { number: 2, rightHand: "G4:q A4:q B4:q C5:q", leftHand: "F3:q A3:q C4:q" },
      { number: 3, rightHand: "C5:q B4:q A4:q G4:q", leftHand: "G3:q B3:q D4:q" },
      { number: 4, rightHand: "F4:q E4:q D4:q C4:q", leftHand: "C3:q E3:q G3:q" },
    ],
    tags: ["test"],
    ...overrides,
  };
}

// We test tokenToMidi, tokenToNoteName, nameToPitchClass, and parseMeasureRange
// indirectly through the exported functions that use them, since they're private.

// ─── inferChord ─────────────────────────────────────────────────────────────

describe("inferChord", () => {
  it("recognizes a C major chord", () => {
    expect(inferChord("C3:q E3:q G3:q")).toBe("C");
  });

  it("recognizes an A minor chord", () => {
    expect(inferChord("A3:q C4:q E4:q")).toBe("Am");
  });

  it("recognizes a dominant 7th chord", () => {
    expect(inferChord("G3:q B3:q D4:q F4:q")).toBe("G7");
  });

  it("returns N/A for rests only", () => {
    expect(inferChord("R R R")).toBe("N/A");
  });

  it("returns a single note name for one note", () => {
    expect(inferChord("C4:q")).toBe("C");
  });

  it("handles sharps", () => {
    // F# major = F# A# C#
    expect(inferChord("F#3:q A#3:q C#4:q")).toBe("F#");
  });

  it("handles flats", () => {
    // Bb major = Bb D F
    expect(inferChord("Bb3:q D4:q F4:q")).toBe("Bb");
  });

  it("handles empty string", () => {
    expect(inferChord("")).toBe("N/A");
  });
});

// ─── computeContour ─────────────────────────────────────────────────────────

describe("computeContour", () => {
  it("detects ascending contour", () => {
    expect(computeContour("C4:q D4:q E4:q F4:q")).toBe("ascending");
  });

  it("detects descending contour", () => {
    expect(computeContour("F4:q E4:q D4:q C4:q")).toBe("descending");
  });

  it("detects static contour for a single note", () => {
    expect(computeContour("C4:q")).toBe("static");
  });

  it("detects static contour for same note repeated", () => {
    expect(computeContour("C4:q C4:q C4:q C4:q")).toBe("static");
  });

  it("detects arc contour (up then down)", () => {
    expect(computeContour("C4:q E4:q G4:q E4:q C4:q")).toBe("arc");
  });

  it("detects arc contour (down then up)", () => {
    expect(computeContour("G4:q E4:q C4:q E4:q G4:q")).toBe("arc");
  });

  it("returns static for rests only", () => {
    expect(computeContour("R R R")).toBe("static");
  });

  it("handles empty string", () => {
    expect(computeContour("")).toBe("static");
  });

  it("ignores rests in contour calculation", () => {
    // C4 -> R -> E4 -> R -> G4 => ascending
    expect(computeContour("C4:q R E4:q R G4:q")).toBe("ascending");
  });
});

// ─── getStyleGuidance ───────────────────────────────────────────────────────

describe("getStyleGuidance", () => {
  it("returns hints for classical genre", () => {
    const hints = getStyleGuidance("classical");
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.some(h => h.toLowerCase().includes("tempo"))).toBe(true);
  });

  it("returns hints for jazz genre", () => {
    const hints = getStyleGuidance("jazz");
    expect(hints.some(h => h.toLowerCase().includes("swing"))).toBe(true);
  });

  it("returns hints for all known genres", () => {
    const genres = [
      "classical", "jazz", "pop", "blues", "rock",
      "rnb", "soul", "latin", "film", "ragtime", "new-age", "folk",
    ] as const;
    for (const genre of genres) {
      const hints = getStyleGuidance(genre);
      expect(hints.length).toBeGreaterThan(0);
    }
  });

  it("returns empty array when no genre or mood", () => {
    const hints = getStyleGuidance();
    expect(hints).toEqual([]);
  });

  it("includes mood hints for known moods", () => {
    const hints = getStyleGuidance(undefined, "upbeat");
    expect(hints.some(h => h.includes("tempo"))).toBe(true);
  });

  it("returns fallback for unknown mood", () => {
    const hints = getStyleGuidance(undefined, "spooky");
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain("spooky");
  });

  it("combines genre and mood hints", () => {
    const hints = getStyleGuidance("jazz", "melancholic");
    // Should have jazz hints + melancholic hints
    expect(hints.some(h => h.toLowerCase().includes("swing"))).toBe(true);
    expect(hints.some(h => h.toLowerCase().includes("minor"))).toBe(true);
  });
});

// ─── generateJamBrief ───────────────────────────────────────────────────────

describe("generateJamBrief", () => {
  it("returns a brief with correct source metadata", () => {
    const song = makeSong();
    const brief = generateJamBrief(song);
    expect(brief.source.id).toBe("test-song");
    expect(brief.source.title).toBe("Test Song");
    expect(brief.source.genre).toBe("classical");
    expect(brief.source.key).toBe("C major");
    expect(brief.source.tempo).toBe(120);
  });

  it("analyzes all measures by default", () => {
    const song = makeSong();
    const brief = generateJamBrief(song);
    expect(brief.chordProgression).toHaveLength(4);
    expect(brief.melodyOutline).toHaveLength(4);
  });

  it("respects measure range option", () => {
    const song = makeSong();
    const brief = generateJamBrief(song, { measures: "1-2" });
    expect(brief.chordProgression).toHaveLength(2);
    expect(brief.melodyOutline).toHaveLength(2);
  });

  it("includes style guidance", () => {
    const song = makeSong();
    const brief = generateJamBrief(song);
    expect(brief.styleGuidance.length).toBeGreaterThan(0);
  });

  it("uses override style when provided", () => {
    const song = makeSong();
    const brief = generateJamBrief(song, { style: "jazz" });
    expect(brief.styleGuidance.some(h => h.toLowerCase().includes("swing"))).toBe(true);
  });

  it("includes instructions", () => {
    const song = makeSong();
    const brief = generateJamBrief(song);
    expect(brief.instructions.length).toBeGreaterThan(0);
    expect(brief.instructions[0]).toContain("Test Song");
  });

  it("includes mood in instructions", () => {
    const song = makeSong();
    const brief = generateJamBrief(song, { mood: "dreamy" });
    expect(brief.instructions[0]).toContain("dreamy");
  });

  it("includes difficulty in instructions", () => {
    const song = makeSong();
    const brief = generateJamBrief(song, { difficulty: "advanced" });
    expect(brief.instructions[0]).toContain("advanced");
  });

  it("chord progression has impliedChord for each measure", () => {
    const song = makeSong();
    const brief = generateJamBrief(song);
    for (const cm of brief.chordProgression) {
      expect(cm.impliedChord).toBeDefined();
      expect(cm.impliedChord.length).toBeGreaterThan(0);
    }
  });

  it("melody outline has contour for each measure", () => {
    const song = makeSong();
    const brief = generateJamBrief(song);
    for (const mm of brief.melodyOutline) {
      expect(["ascending", "descending", "static", "arc"]).toContain(mm.contour);
    }
  });
});

// ─── formatJamBrief ─────────────────────────────────────────────────────────

describe("formatJamBrief", () => {
  it("returns markdown string", () => {
    const song = makeSong();
    const brief = generateJamBrief(song);
    const md = formatJamBrief(brief);
    expect(md).toContain("# Jam Brief:");
    expect(md).toContain("## Source Material");
    expect(md).toContain("## Chord Progression");
    expect(md).toContain("## Melody Outline");
    expect(md).toContain("## Style Guidance");
    expect(md).toContain("## Your Mission");
  });

  it("includes source song title", () => {
    const song = makeSong();
    const brief = generateJamBrief(song);
    const md = formatJamBrief(brief);
    expect(md).toContain("Test Song");
  });

  it("includes chord table rows", () => {
    const song = makeSong();
    const brief = generateJamBrief(song);
    const md = formatJamBrief(brief);
    // Should have table rows with measure numbers
    expect(md).toContain("| 1 |");
  });

  it("includes composer when present", () => {
    const song = makeSong({ composer: "Bach" });
    const brief = generateJamBrief(song);
    const md = formatJamBrief(brief);
    expect(md).toContain("Bach");
  });

  it("handles style override in header", () => {
    const song = makeSong();
    const brief = generateJamBrief(song, { style: "jazz" });
    const md = formatJamBrief(brief, { style: "jazz" });
    expect(md).toContain("jazz");
  });

  it("includes mood label when provided", () => {
    const song = makeSong();
    const brief = generateJamBrief(song, { mood: "dreamy" });
    const md = formatJamBrief(brief, { mood: "dreamy" });
    expect(md).toContain("dreamy");
  });

  it("includes measure range label when provided", () => {
    const song = makeSong();
    const brief = generateJamBrief(song, { measures: "1-2" });
    const md = formatJamBrief(brief, { measures: "1-2" });
    expect(md).toContain("measures 1-2");
  });

  it("notes same genre reinterpretation", () => {
    const song = makeSong({ genre: "jazz" });
    const brief = generateJamBrief(song, { style: "jazz" });
    const md = formatJamBrief(brief, { style: "jazz" });
    expect(md).toContain("same genre reinterpretation");
  });
});

// ─── parseMeasureRange (tested indirectly) ──────────────────────────────────

describe("parseMeasureRange (via generateJamBrief)", () => {
  it("clamps start to 0", () => {
    const song = makeSong();
    // "0-2" should clamp start to measure index 0 (measure 1)
    const brief = generateJamBrief(song, { measures: "0-2" });
    // With 4 measures, "0-2" => indices max(0, -1)=0 to min(3, 1)=1 => 2 measures
    expect(brief.chordProgression.length).toBeGreaterThanOrEqual(1);
  });

  it("clamps end to total measures", () => {
    const song = makeSong(); // 4 measures
    const brief = generateJamBrief(song, { measures: "1-100" });
    expect(brief.chordProgression).toHaveLength(4);
  });

  it("handles single measure number", () => {
    const song = makeSong();
    const brief = generateJamBrief(song, { measures: "2" });
    expect(brief.chordProgression).toHaveLength(1);
    expect(brief.chordProgression[0].measure).toBe(2);
  });
});
