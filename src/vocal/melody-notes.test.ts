import { describe, it, expect } from "vitest";
import { applyPhraseVibrato, extractMelodyNotes, placePhraseInVoiceRange } from "./melody-notes.js";
import type { SongEntry } from "../songs/types.js";

function hymn(): SongEntry {
  return {
    id: "test-hymn",
    title: "Test Hymn",
    genre: "folk",
    difficulty: "beginner",
    key: "C major",
    tempo: 60,
    timeSignature: "4/4",
    durationSeconds: 8,
    tags: ["test"],
    musicalLanguage: {
      description: "Test hymn.",
      structure: "strophic",
      keyMoments: [],
      teachingGoals: [],
      styleTips: [],
    },
    measures: [
      { number: 1, rightHand: "C4:q E4:q G4:q C5:q", leftHand: "C3:w" },
      { number: 2, rightHand: "C4+E4+G4:h R:h", leftHand: "C3:h G2:h" },
    ],
  };
}

describe("extractMelodyNotes", () => {
  it("takes the right-hand line, skipping rests, at effective tempo", () => {
    const { notes, effectiveBpm } = extractMelodyNotes(hymn());
    expect(effectiveBpm).toBe(60);
    // m1: four quarters at 1s each; m2: a half-note chord (highest G4) then a rest.
    expect(notes.map((n) => n.midi)).toEqual([60, 64, 67, 72, 67]);
    expect(notes[0].startSec).toBeCloseTo(0, 6);
    expect(notes[0].durationSec).toBeCloseTo(1, 6);
    expect(notes[4].startSec).toBeCloseTo(4, 6);
    expect(notes[4].durationSec).toBeCloseTo(2, 6);
    expect(notes[4].midi).toBe(67); // highest of C4+E4+G4
  });

  it("clips to a measure range", () => {
    const { notes } = extractMelodyNotes(hymn(), { startMeasure: 1, endMeasure: 1 });
    expect(notes).toHaveLength(4);
  });

  it("applies speed the same way Session.effectiveTempo does", () => {
    const { notes, effectiveBpm } = extractMelodyNotes(hymn(), { speed: 0.5 });
    expect(effectiveBpm).toBe(30);
    expect(notes[0].durationSec).toBeCloseTo(2, 6);
  });
});

describe("placePhraseInVoiceRange", () => {
  it("drops a G4-median hymn an octave so F0 stays under front-vowel F1", () => {
    const { shift, medianAfter, notes } = placePhraseInVoiceRange([
      { id: "a", startSec: 0, durationSec: 1, midi: 67 },
      { id: "b", startSec: 1, durationSec: 1, midi: 70 },
    ]);
    expect(shift).toBe(-12);
    expect(medianAfter).toBe(58);
    expect(notes.map((n) => n.midi)).toEqual([55, 58]);
  });
});

describe("applyPhraseVibrato", () => {
  it("skips notes shorter than 0.4s and rises in rate across the phrase", () => {
    const short = { id: "s", startSec: 0, durationSec: 0.2, midi: 60 };
    const longA = { id: "a", startSec: 0.2, durationSec: 1, midi: 64 };
    const longB = { id: "b", startSec: 1.2, durationSec: 1, midi: 67 };
    const out = applyPhraseVibrato([short, longA, longB]);
    expect(out[0].vibrato).toBeUndefined();
    expect(out[1].vibrato?.rateHz).toBeLessThan(out[2].vibrato!.rateHz);
    expect(out[2].vibrato!.rateHz).toBeCloseTo(6.3, 5);
  });
});
