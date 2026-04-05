import { describe, it, expect } from "vitest";
import { compareSongs } from "./song-compare.js";
import type { SongEntry } from "./songs/types.js";

function makeSong(overrides: Partial<SongEntry> = {}): SongEntry {
  return {
    id: "test",
    title: "Test",
    genre: "classical" as any,
    difficulty: "beginner" as any,
    key: "C major",
    tempo: 120,
    timeSignature: "4/4",
    durationSeconds: 60,
    status: "ready" as any,
    measures: [
      { number: 1, rightHand: "C4:q E4:q G4:q C5:q", leftHand: "C3:h E3:h" },
    ],
    musicalLanguage: {
      description: "test", structure: "ABA form",
      keyMoments: [], teachingGoals: [], styleTips: [],
    },
    tags: ["classical"],
    ...overrides,
  };
}

describe("compareSongs", () => {
  it("detects same key", () => {
    const a = makeSong({ id: "a", title: "Song A", key: "C major" });
    const b = makeSong({ id: "b", title: "Song B", key: "C major" });
    const result = compareSongs(a, b);

    expect(result.metrics.keyRelationship).toBe("same key");
    expect(result.similarities.some(s => s.includes("Same key"))).toBe(true);
  });

  it("detects relative keys", () => {
    const a = makeSong({ id: "a", title: "Song A", key: "C major" });
    const b = makeSong({ id: "b", title: "Song B", key: "A minor" });
    const result = compareSongs(a, b);

    expect(result.metrics.keyRelationship).toBe("relative keys");
  });

  it("detects fifth-apart keys", () => {
    const a = makeSong({ id: "a", title: "Song A", key: "C major" });
    const b = makeSong({ id: "b", title: "Song B", key: "G major" });
    const result = compareSongs(a, b);

    expect(result.metrics.keyRelationship).toContain("fifth");
  });

  it("detects same time signature", () => {
    const a = makeSong({ id: "a", title: "A", timeSignature: "3/4" });
    const b = makeSong({ id: "b", title: "B", timeSignature: "3/4" });
    const result = compareSongs(a, b);

    expect(result.similarities.some(s => s.includes("3/4"))).toBe(true);
  });

  it("detects similar tempo", () => {
    const a = makeSong({ id: "a", title: "A", tempo: 120 });
    const b = makeSong({ id: "b", title: "B", tempo: 126 });
    const result = compareSongs(a, b);

    expect(result.similarities.some(s => s.includes("tempo"))).toBe(true);
  });

  it("detects different tempo", () => {
    const a = makeSong({ id: "a", title: "A", tempo: 60 });
    const b = makeSong({ id: "b", title: "B", tempo: 180 });
    const result = compareSongs(a, b);

    expect(result.differences.some(s => s.includes("tempo"))).toBe(true);
  });

  it("detects shared tags", () => {
    const a = makeSong({ id: "a", title: "A", tags: ["classical", "romantic"] });
    const b = makeSong({ id: "b", title: "B", tags: ["romantic", "nocturne"] });
    const result = compareSongs(a, b);

    expect(result.metrics.sharedTags).toContain("romantic");
  });

  it("computes high pitch class similarity for identical measures", () => {
    const measures = [
      { number: 1, rightHand: "C4:q E4:q G4:q", leftHand: "" },
    ];
    const a = makeSong({ id: "a", title: "A", measures });
    const b = makeSong({ id: "b", title: "B", measures });
    const result = compareSongs(a, b);

    expect(result.metrics.pitchClassSimilarity).toBe(1);
  });

  it("detects shared structural form", () => {
    const a = makeSong({
      id: "a", title: "A",
      musicalLanguage: {
        description: "test", structure: "AABA 32-bar form",
        keyMoments: [], teachingGoals: [], styleTips: [],
      },
    });
    const b = makeSong({
      id: "b", title: "B",
      musicalLanguage: {
        description: "test", structure: "Classic AABA structure",
        keyMoments: [], teachingGoals: [], styleTips: [],
      },
    });
    const result = compareSongs(a, b);

    expect(result.sharedPatterns.some(p => p.includes("AABA"))).toBe(true);
  });

  it("detects shared teaching concepts", () => {
    const a = makeSong({
      id: "a", title: "A",
      musicalLanguage: {
        description: "test", structure: "test",
        keyMoments: [],
        teachingGoals: ["Learn voice leading between chords", "Master dynamics"],
        styleTips: [],
      },
    });
    const b = makeSong({
      id: "b", title: "B",
      musicalLanguage: {
        description: "test", structure: "test",
        keyMoments: [],
        teachingGoals: ["Smooth voice leading in progressions", "Control dynamics range"],
        styleTips: [],
      },
    });
    const result = compareSongs(a, b);

    expect(result.teachingConnections.some(t => t.includes("voice leading"))).toBe(true);
    expect(result.teachingConnections.some(t => t.includes("dynamic"))).toBe(true);
  });

  it("generates cross-genre teaching connection", () => {
    const a = makeSong({ id: "a", title: "A", genre: "classical" as any });
    const b = makeSong({ id: "b", title: "B", genre: "jazz" as any });
    const result = compareSongs(a, b);

    expect(result.teachingConnections.some(t => t.includes("Cross-genre"))).toBe(true);
  });

  it("returns unknown key relationship for unparseable keys", () => {
    const a = makeSong({ id: "a", title: "A", key: "??? nonsense" });
    const b = makeSong({ id: "b", title: "B", key: "C major" });
    const result = compareSongs(a, b);

    expect(result.metrics.keyRelationship).toBe("unknown");
  });

  it("handles songs with empty measures", () => {
    const a = makeSong({ id: "a", title: "A", measures: [] });
    const b = makeSong({ id: "b", title: "B", measures: [] });
    const result = compareSongs(a, b);

    expect(result.metrics.pitchClassSimilarity).toBe(0);
    expect(result.songA.id).toBe("a");
  });
});
