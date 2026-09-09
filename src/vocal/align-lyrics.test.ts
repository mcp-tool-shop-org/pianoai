import { describe, it, expect } from "vitest";
import {
  alignLyricsToNotes,
  alignSyllablesToNotes,
  tokenizeLyricUnits,
  DIPHTHONG_SPLIT,
} from "./align-lyrics.js";
import type { LyricG2P, LyricSyllable, ScoreNote } from "./types.js";

function notes(specs: Array<[number, number, number]>): ScoreNote[] {
  return specs.map(([start, dur, midi], i) => ({
    id: `n${i}`,
    startSec: start,
    durationSec: dur,
    midi,
  }));
}

const HEL: LyricSyllable = { onset: ["HH"], nucleus: "EH", coda: ["L"] };
const LO: LyricSyllable = { onset: ["L"], nucleus: "UW", coda: [] };
const BUY: LyricSyllable = { onset: ["B"], nucleus: "AY", coda: [] };

describe("tokenizeLyricUnits", () => {
  it("splits on whitespace", () => {
    expect(tokenizeLyricUnits("amazing grace")).toEqual(["amazing", "grace"]);
  });

  it("treats hyphens as explicit syllables", () => {
    expect(tokenizeLyricUnits("A-ma-zing grace")).toEqual(["A", "ma", "zing", "grace"]);
  });

  it("strips punctuation", () => {
    expect(tokenizeLyricUnits("sound!")).toEqual(["sound"]);
  });
});

describe("alignSyllablesToNotes — vowel on the beat", () => {
  it("puts the vowel nucleus at note.startSec when there is pre-roll room", () => {
    // note 1 starts at 1.0s so the HH of "hel" can live in [0.92, 1.0)
    const result = alignSyllablesToNotes([HEL, LO], notes([[1.0, 0.8, 60], [1.8, 0.8, 62]]));
    const vowels = result.events.filter((e) => e.kind === "vowel");
    expect(vowels).toHaveLength(2);
    expect(vowels[0].tSec).toBeCloseTo(1.0, 6);
    expect(vowels[0].phoneme).toBe("EH");
    expect(vowels[1].tSec).toBeCloseTo(1.8, 6);
    expect(vowels[1].phoneme).toBe("UW");
  });

  it("parks onset consonants before the vowel", () => {
    const result = alignSyllablesToNotes([HEL], notes([[1.0, 1.0, 60]]));
    const hh = result.events.find((e) => e.phoneme === "HH");
    const eh = result.events.find((e) => e.phoneme === "EH");
    expect(hh).toBeDefined();
    expect(eh).toBeDefined();
    expect(hh!.tSec).toBeLessThan(eh!.tSec);
    expect(hh!.tSec + hh!.durSec).toBeCloseTo(eh!.tSec, 5);
    expect(hh!.durSec).toBeLessThanOrEqual(0.08 + 1e-9);
  });

  it("dumps leftover note length onto the vowel, not the consonants", () => {
    const result = alignSyllablesToNotes([HEL], notes([[1.0, 2.0, 60]]));
    const eh = result.events.find((e) => e.phoneme === "EH")!;
    const cons = result.events.filter((e) => e.kind === "consonant");
    const consDur = cons.reduce((s, e) => s + e.durSec, 0);
    expect(eh.durSec).toBeGreaterThan(consDur);
    expect(eh.durSec).toBeGreaterThanOrEqual(2.0 * 0.55);
  });

  it("truncates onset on a note that starts at t=0 (no pre-roll)", () => {
    const result = alignSyllablesToNotes([HEL], notes([[0, 1.0, 60]]));
    const eh = result.events.find((e) => e.kind === "vowel")!;
    expect(eh.tSec).toBeCloseTo(0, 6);
    expect(result.warnings.some((w) => /truncated/i.test(w))).toBe(true);
  });

  it("repeats the last nucleus on leftover notes (melisma)", () => {
    const result = alignSyllablesToNotes(
      [LO],
      notes([[1.0, 0.5, 60], [1.5, 0.5, 62], [2.0, 0.5, 64]]),
    );
    const vowels = result.events.filter((e) => e.kind === "vowel");
    expect(vowels).toHaveLength(3);
    expect(vowels.every((v) => v.phoneme === "UW")).toBe(true);
    expect(result.mapping.filter((m) => m.melisma)).toHaveLength(2);
  });

  it("drops extra syllables when there are more lyrics than notes", () => {
    const result = alignSyllablesToNotes([HEL, LO, BUY], notes([[1.0, 0.5, 60]]));
    expect(result.warnings.some((w) => /dropped/i.test(w))).toBe(true);
    expect(result.mapping).toHaveLength(1);
  });

  it("splits English diphthongs on long notes", () => {
    expect(DIPHTHONG_SPLIT.AY).toEqual(["AA", "AY"]);
    const result = alignSyllablesToNotes([BUY], notes([[1.0, 1.0, 60]]));
    const vowels = result.events.filter((e) => e.kind === "vowel");
    expect(vowels).toHaveLength(2);
    expect(vowels[0].phoneme).toBe("AA");
    expect(vowels[1].phoneme).toBe("AY");
    expect(vowels[0].tSec).toBeCloseTo(1.0, 6);
    expect(vowels[0].durSec + vowels[1].durSec).toBeCloseTo(1.0, 5);
  });

  it("does not split diphthongs on short notes", () => {
    const result = alignSyllablesToNotes([BUY], notes([[1.0, 0.2, 60]]));
    const vowels = result.events.filter((e) => e.kind === "vowel");
    expect(vowels).toHaveLength(1);
    expect(vowels[0].phoneme).toBe("AY");
  });
});

describe("alignLyricsToNotes", () => {
  const g2p: LyricG2P = {
    wordToSyllables(word: string): LyricSyllable[] {
      const w = word.toLowerCase();
      if (w === "hello") return [HEL, LO];
      if (w === "a") return [{ onset: [], nucleus: "AH", coda: [] }];
      if (w === "ma") return [{ onset: ["M"], nucleus: "AH", coda: [] }];
      if (w === "zing") return [{ onset: ["Z"], nucleus: "IH", coda: ["NG"] }];
      return [{ onset: [], nucleus: "AH", coda: [] }];
    },
  };

  it("maps hyphenated lyrics 1:1 onto notes", () => {
    const result = alignLyricsToNotes(
      "A-ma-zing",
      notes([[1, 0.5, 60], [1.5, 0.5, 62], [2.0, 0.5, 64]]),
      g2p,
    );
    const vowels = result.events.filter((e) => e.kind === "vowel");
    expect(vowels.map((v) => v.phoneme)).toEqual(["AH", "AH", "IH"]);
    expect(vowels.map((v) => v.tSec)).toEqual([1, 1.5, 2.0]);
  });
});
