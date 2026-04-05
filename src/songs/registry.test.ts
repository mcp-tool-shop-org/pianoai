// ─── Registry Validation Tests ──────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { validateSong, registerSong, clearRegistry, registerSongs, searchSongs, getStats, validateRegistry } from "./registry.js";
import type { SongEntry } from "./types.js";

function makeSong(overrides: Partial<SongEntry> = {}): SongEntry {
  return {
    id: "test-song",
    title: "Test Song",
    genre: "pop",
    difficulty: "beginner",
    key: "C major",
    tempo: 120,
    timeSignature: "4/4",
    durationSeconds: 30,
    musicalLanguage: {
      description: "A test song.",
      structure: "ABA",
      keyMoments: ["Bar 1: opening"],
      teachingGoals: ["Practice timing"],
      styleTips: ["Play evenly"],
    },
    measures: [
      { number: 1, rightHand: "C4:q", leftHand: "C3:q" },
    ],
    tags: ["test"],
    ...overrides,
  };
}

describe("Registry tests", () => {
  beforeEach(() => clearRegistry());

  afterAll(() => {
    // Re-initialize registry so subsequent test files aren't affected
    clearRegistry();
  });

  describe("validateSong bounds checks", () => {
    it("rejects measures array exceeding 2000", () => {
      const measures = Array.from({ length: 2001 }, (_, i) => ({
        number: i + 1,
        rightHand: "C4:q",
        leftHand: "C3:q",
      }));
      const errors = validateSong(makeSong({ measures }));
      expect(errors.some(e => e.includes("too large"))).toBe(true);
    });

    it("accepts measures array at exactly 2000", () => {
      const measures = Array.from({ length: 2000 }, (_, i) => ({
        number: i + 1,
        rightHand: "C4:q",
        leftHand: "C3:q",
      }));
      const errors = validateSong(makeSong({ measures }));
      expect(errors.some(e => e.includes("too large"))).toBe(false);
    });

    it("rejects teaching note exceeding 5000 chars", () => {
      const measures = [
        {
          number: 1,
          rightHand: "C4:q",
          leftHand: "C3:q",
          teachingNote: "x".repeat(5001),
        },
      ];
      const errors = validateSong(makeSong({ measures }));
      expect(errors.some(e => e.includes("teachingNote too long"))).toBe(true);
    });

    it("accepts teaching note at exactly 5000 chars", () => {
      const measures = [
        {
          number: 1,
          rightHand: "C4:q",
          leftHand: "C3:q",
          teachingNote: "x".repeat(5000),
        },
      ];
      const errors = validateSong(makeSong({ measures }));
      expect(errors.some(e => e.includes("teachingNote too long"))).toBe(false);
    });
  });

  describe("registerSong", () => {
    it("registers a valid song", () => {
      expect(() => registerSong(makeSong())).not.toThrow();
    });

    it("rejects duplicate IDs", () => {
      registerSong(makeSong());
      expect(() => registerSong(makeSong())).toThrow("Duplicate");
    });
  });

  describe("searchSongs key filter", () => {
    beforeEach(() => {
      registerSong(makeSong({ id: "c-major-song", key: "C major" }));
      registerSong(makeSong({ id: "a-minor-song", key: "A minor" }));
      registerSong(makeSong({ id: "bb-major-song", key: "Bb major" }));
    });

    it("finds songs by exact key match", () => {
      const results = searchSongs({ key: "C major" });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("c-major-song");
    });

    it("finds songs by partial key match (e.g. 'minor')", () => {
      const results = searchSongs({ key: "minor" });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("a-minor-song");
    });

    it("finds songs by partial key match (e.g. 'major')", () => {
      const results = searchSongs({ key: "major" });
      expect(results).toHaveLength(2);
    });

    it("key filter is case-insensitive", () => {
      const results = searchSongs({ key: "c MAJOR" });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("c-major-song");
    });

    it("returns empty when no key matches", () => {
      const results = searchSongs({ key: "D minor" });
      expect(results).toHaveLength(0);
    });
  });

  describe("searchSongs composer filter", () => {
    beforeEach(() => {
      registerSong(makeSong({ id: "chopin-waltz", composer: "Frédéric Chopin" }));
      registerSong(makeSong({ id: "beethoven-sonata", composer: "Ludwig van Beethoven" }));
      registerSong(makeSong({ id: "anonymous-folk", title: "Folk Tune" }));
    });

    it("finds songs by composer substring", () => {
      const results = searchSongs({ composer: "Chopin" });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("chopin-waltz");
    });

    it("composer filter is case-insensitive", () => {
      const results = searchSongs({ composer: "beethoven" });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("beethoven-sonata");
    });

    it("excludes songs with no composer", () => {
      const results = searchSongs({ composer: "folk" });
      expect(results).toHaveLength(0);
    });

    it("returns empty when no composer matches", () => {
      const results = searchSongs({ composer: "Mozart" });
      expect(results).toHaveLength(0);
    });
  });

  describe("searchSongs combined filters with key/composer", () => {
    beforeEach(() => {
      registerSong(makeSong({ id: "chopin-minor", composer: "Chopin", key: "A minor", genre: "classical" }));
      registerSong(makeSong({ id: "chopin-major", composer: "Chopin", key: "C major", genre: "classical" }));
      registerSong(makeSong({ id: "pop-minor", key: "A minor", genre: "pop" }));
    });

    it("combines key + composer (AND logic)", () => {
      const results = searchSongs({ key: "minor", composer: "Chopin" });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("chopin-minor");
    });

    it("combines key + genre (AND logic)", () => {
      const results = searchSongs({ key: "minor", genre: "pop" });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("pop-minor");
    });

    it("combines composer + genre (AND logic)", () => {
      const results = searchSongs({ composer: "Chopin", genre: "classical" });
      expect(results).toHaveLength(2);
    });

    it("combines key + composer + genre (AND logic)", () => {
      const results = searchSongs({ key: "major", composer: "Chopin", genre: "classical" });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("chopin-major");
    });
  });

  // ── Combined filters: genre + difficulty + key + composer ─────────────

  describe("searchSongs with all filters simultaneously", () => {
    beforeEach(() => {
      registerSong(makeSong({
        id: "full-match",
        genre: "classical",
        difficulty: "advanced",
        key: "C minor",
        composer: "Beethoven",
        durationSeconds: 120,
        tags: ["Sonata", "dramatic"],
      }));
      registerSong(makeSong({
        id: "partial-match-genre",
        genre: "jazz",
        difficulty: "advanced",
        key: "C minor",
        composer: "Beethoven",
        durationSeconds: 120,
        tags: ["sonata"],
      }));
      registerSong(makeSong({
        id: "partial-match-difficulty",
        genre: "classical",
        difficulty: "beginner",
        key: "C minor",
        composer: "Beethoven",
        durationSeconds: 120,
        tags: ["sonata"],
      }));
      registerSong(makeSong({
        id: "partial-match-key",
        genre: "classical",
        difficulty: "advanced",
        key: "G major",
        composer: "Beethoven",
        durationSeconds: 120,
        tags: ["sonata"],
      }));
      registerSong(makeSong({
        id: "partial-match-composer",
        genre: "classical",
        difficulty: "advanced",
        key: "C minor",
        composer: "Mozart",
        durationSeconds: 120,
        tags: ["sonata"],
      }));
    });

    it("combines genre + difficulty + key + composer (AND logic)", () => {
      const results = searchSongs({
        genre: "classical",
        difficulty: "advanced",
        key: "minor",
        composer: "Beethoven",
      });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("full-match");
    });

    it("returns empty when one filter excludes all", () => {
      const results = searchSongs({
        genre: "classical",
        difficulty: "advanced",
        key: "minor",
        composer: "Bach",
      });
      expect(results).toHaveLength(0);
    });
  });

  // ── getStats on empty registry ────────────────────────────────────────

  describe("getStats", () => {
    it("returns zeroed stats on empty registry", () => {
      const stats = getStats();
      expect(stats.totalSongs).toBe(0);
      expect(stats.totalMeasures).toBe(0);
      // All genre counts should be 0
      for (const count of Object.values(stats.byGenre)) {
        expect(count).toBe(0);
      }
      for (const count of Object.values(stats.byDifficulty)) {
        expect(count).toBe(0);
      }
    });

    it("returns correct stats after registering songs", () => {
      registerSong(makeSong({ id: "s1", genre: "classical", difficulty: "beginner" }));
      registerSong(makeSong({ id: "s2", genre: "classical", difficulty: "advanced" }));
      registerSong(makeSong({ id: "s3", genre: "jazz", difficulty: "beginner" }));

      const stats = getStats();
      expect(stats.totalSongs).toBe(3);
      expect(stats.byGenre.classical).toBe(2);
      expect(stats.byGenre.jazz).toBe(1);
      expect(stats.byDifficulty.beginner).toBe(2);
      expect(stats.byDifficulty.advanced).toBe(1);
      expect(stats.totalMeasures).toBe(3); // 1 measure each
    });
  });

  // ── validateRegistry on empty registry ────────────────────────────────

  describe("validateRegistry", () => {
    it("throws on empty registry", () => {
      expect(() => validateRegistry()).toThrow(/empty/i);
    });

    it("succeeds with songs registered", () => {
      registerSong(makeSong());
      expect(() => validateRegistry()).not.toThrow();
    });
  });

  // ── Freetext query search ─────────────────────────────────────────────

  describe("searchSongs freetext query", () => {
    beforeEach(() => {
      registerSong(makeSong({
        id: "moonlight",
        title: "Moonlight Sonata",
        composer: "Beethoven",
        tags: ["romantic", "slow"],
        musicalLanguage: {
          description: "A hauntingly beautiful nocturne in C# minor.",
          structure: "ABA",
          keyMoments: ["Bar 1"],
          teachingGoals: ["Dynamics"],
          styleTips: ["Play softly"],
        },
      }));
      registerSong(makeSong({
        id: "fur-elise",
        title: "Fur Elise",
        composer: "Beethoven",
        tags: ["classic", "popular"],
        musicalLanguage: {
          description: "One of the most recognizable piano pieces ever written.",
          structure: "Rondo",
          keyMoments: ["Bar 1"],
          teachingGoals: ["Arpeggios"],
          styleTips: ["Flowing"],
        },
      }));
      registerSong(makeSong({
        id: "jazz-waltz",
        title: "Blue Waltz",
        composer: "Unknown",
        tags: ["waltz", "slow"],
        musicalLanguage: {
          description: "A dreamy jazz waltz with lush harmonies.",
          structure: "AABA",
          keyMoments: ["Bar 1"],
          teachingGoals: ["Voicing"],
          styleTips: ["Swing"],
        },
      }));
    });

    it("matches against title", () => {
      const results = searchSongs({ query: "moonlight" });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("moonlight");
    });

    it("matches against composer", () => {
      const results = searchSongs({ query: "beethoven" });
      expect(results).toHaveLength(2);
    });

    it("matches against tags", () => {
      const results = searchSongs({ query: "slow" });
      expect(results).toHaveLength(2); // moonlight + jazz-waltz both have "slow" tag
    });

    it("matches against musicalLanguage.description", () => {
      const results = searchSongs({ query: "nocturne" });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("moonlight");
    });

    it("query is case-insensitive", () => {
      const results = searchSongs({ query: "MOONLIGHT" });
      expect(results).toHaveLength(1);
    });

    it("query combined with genre filter", () => {
      // Both Beethoven songs are pop (default from makeSong)
      const results = searchSongs({ query: "beethoven", genre: "pop" });
      expect(results).toHaveLength(2);
    });
  });

  // ── Duration filter ───────────────────────────────────────────────────

  describe("searchSongs duration filter", () => {
    beforeEach(() => {
      registerSong(makeSong({ id: "short", durationSeconds: 30 }));
      registerSong(makeSong({ id: "medium", durationSeconds: 120 }));
      registerSong(makeSong({ id: "long", durationSeconds: 300 }));
    });

    it("maxDuration filters out songs longer than threshold", () => {
      const results = searchSongs({ maxDuration: 60 });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("short");
    });

    it("minDuration filters out songs shorter than threshold", () => {
      const results = searchSongs({ minDuration: 100 });
      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.id);
      expect(ids).toContain("medium");
      expect(ids).toContain("long");
    });

    it("minDuration + maxDuration together form a range", () => {
      const results = searchSongs({ minDuration: 60, maxDuration: 200 });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("medium");
    });

    it("duration at exact boundary is included (<=/>= semantics)", () => {
      const resultsMax = searchSongs({ maxDuration: 120 });
      expect(resultsMax.map((r) => r.id)).toContain("medium");

      const resultsMin = searchSongs({ minDuration: 120 });
      expect(resultsMin.map((r) => r.id)).toContain("medium");
    });
  });

  // ── Tag filter (case insensitivity) ───────────────────────────────────

  describe("searchSongs tag filter", () => {
    beforeEach(() => {
      registerSong(makeSong({ id: "tagged-upper", tags: ["Classical", "Romantic"] }));
      registerSong(makeSong({ id: "tagged-lower", tags: ["classical", "modern"] }));
      registerSong(makeSong({ id: "no-match", tags: ["jazz", "swing"] }));
    });

    it("finds songs by tag (exact case)", () => {
      const results = searchSongs({ tags: ["classical"] });
      expect(results).toHaveLength(2);
    });

    it("tag matching is case-insensitive", () => {
      const results = searchSongs({ tags: ["CLASSICAL"] });
      expect(results).toHaveLength(2);
    });

    it("matches any tag (OR within tags)", () => {
      const results = searchSongs({ tags: ["modern", "swing"] });
      expect(results).toHaveLength(2); // tagged-lower + no-match
    });

    it("returns empty when no tags match", () => {
      const results = searchSongs({ tags: ["nonexistent"] });
      expect(results).toHaveLength(0);
    });

    it("tags combined with genre filter", () => {
      const results = searchSongs({ tags: ["classical"], genre: "pop" });
      expect(results).toHaveLength(2); // both are pop (default)
    });
  });
});
