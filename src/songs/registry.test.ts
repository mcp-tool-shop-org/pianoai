// ─── Registry Validation Tests ──────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { validateSong, registerSong, clearRegistry, registerSongs, searchSongs } from "./registry.js";
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
});
