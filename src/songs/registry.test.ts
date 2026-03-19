// ─── Registry Validation Tests ──────────────────────────────────────────────

import { describe, it, expect, beforeEach } from "vitest";
import { validateSong, registerSong, clearRegistry } from "./registry.js";
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

beforeEach(() => clearRegistry());

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
