import { describe, it, expect } from "vitest";
import { AMAZING_GRACE_TUNE, realizeVocalTune } from "./tunes.js";
import type { SongEntry } from "../songs/types.js";

function fakeHymn(): SongEntry {
  const measures = Array.from({ length: 10 }, (_, i) => ({
    number: i + 1,
    rightHand: i === 0 ? "R:h." : "Eb4:h.",
    leftHand: "Eb3:h.",
  }));
  return {
    id: "amazing-grace",
    title: "Amazing Grace",
    genre: "folk",
    difficulty: "beginner",
    key: "Eb major",
    tempo: 75,
    timeSignature: "3/4",
    durationSeconds: 24,
    tags: ["hymn"],
    musicalLanguage: {
      description: "Test.",
      structure: "strophic",
      keyMoments: [],
      teachingGoals: [],
      styleTips: [],
    },
    measures,
  };
}

describe("New Britain (Amazing Grace)", () => {
  it("opens 5–1–3 (Bb–Eb–G), the recognizable A-ma-zing", () => {
    expect(AMAZING_GRACE_TUNE.notes.slice(0, 3).map((n) => n.midi)).toEqual([58, 63, 67]);
  });

  it("realizes those pitches on the arrangement clock", () => {
    const { notes } = realizeVocalTune(fakeHymn(), AMAZING_GRACE_TUNE, {
      startMeasure: 1,
      endMeasure: 8,
    });
    expect(notes[0].midi).toBe(58);
    expect(notes[1].midi).toBe(63);
    expect(notes[2].midi).toBe(67);
    expect(notes[1].startSec).toBeGreaterThan(notes[0].startSec);
    expect(notes.length).toBeGreaterThanOrEqual(8);
  });
});
