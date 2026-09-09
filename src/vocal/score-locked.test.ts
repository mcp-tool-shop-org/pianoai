import { describe, it, expect } from "vitest";
import { buildScoreLockedVocals, scoreDurationSec } from "./score-locked.js";
import type { LyricG2P, LyricSyllable } from "./types.js";
import type { SongEntry } from "../songs/types.js";

const g2p: LyricG2P = {
  wordToSyllables(word: string): LyricSyllable[] {
    const w = word.toLowerCase();
    if (w === "a" || w === "the") return [{ onset: [], nucleus: "AH", coda: [] }];
    if (w === "ma") return [{ onset: ["M"], nucleus: "AH", coda: [] }];
    if (w === "zing") return [{ onset: ["Z"], nucleus: "IH", coda: ["NG"] }];
    if (w === "grace") return [{ onset: ["G", "R"], nucleus: "EY", coda: ["S"] }];
    return [{ onset: [], nucleus: "AH", coda: [] }];
  },
};

function hymn(): SongEntry {
  return {
    id: "test-hymn",
    title: "Test Hymn",
    genre: "folk",
    difficulty: "beginner",
    key: "C major",
    tempo: 60,
    timeSignature: "4/4",
    durationSeconds: 4,
    tags: ["test"],
    musicalLanguage: {
      description: "Test.",
      structure: "A",
      keyMoments: [],
      teachingGoals: [],
      styleTips: [],
    },
    measures: [
      { number: 1, rightHand: "C4:q E4:q G4:q C5:q", leftHand: "C3:w" },
    ],
  };
}

describe("buildScoreLockedVocals", () => {
  it("aligns hyphenated lyrics so each vowel sits on its melody note", () => {
    const score = buildScoreLockedVocals(hymn(), {
      lyrics: "A-ma-zing grace",
      g2p,
      vibrato: false,
    });
    expect(score.notes).toHaveLength(4);
    const vowelStarts = score.notes.map((n) => {
      const v = score.phonemes.find((p) => p.kind === "vowel" && Math.abs(p.tSec - n.startSec) < 1e-6);
      return v?.tSec;
    });
    expect(vowelStarts).toEqual(score.notes.map((n) => n.startSec));
    expect(scoreDurationSec(score)).toBeCloseTo(4, 6);
  });
});
