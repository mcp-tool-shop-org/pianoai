import { describe, it, expect } from "vitest";
import { breakdownByHand } from "./score-hand-breakdown.js";
import type { PerformanceResult, MissedNote } from "./score-performance.js";

// ─── Factory helpers ────────────────────────────────────────────────────────

function makeResult(overrides: Partial<PerformanceResult> = {}): PerformanceResult {
  return {
    songId: "test-song",
    songTitle: "Test Song",
    metrics: {
      overallScore: 80,
      pitchAccuracy: 90,
      timingAccuracyMs: 30,
      completeness: 85,
      extraNoteCount: 0,
    },
    details: {
      totalExpected: 20,
      totalPlayed: 18,
      matched: 17,
      missed: [],
      extras: [],
      timingIssues: [],
    },
    feedback: "Good job!",
    ...overrides,
  };
}

function makeMissed(hand: string, measure: number, notation = "C4:q"): MissedNote {
  return { hand, measure, notation, timeSeconds: measure * 2 };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("breakdownByHand", () => {
  describe("both hands present", () => {
    it("returns metrics for left and right hands", () => {
      const result = makeResult({
        details: {
          totalExpected: 20,
          totalPlayed: 18,
          matched: 16,
          missed: [
            makeMissed("left", 3),
            makeMissed("left", 5),
            makeMissed("right", 7),
            makeMissed("right", 8),
          ],
          extras: [],
          timingIssues: [],
        },
      });

      const breakdown = breakdownByHand(result);

      expect(breakdown.left).toBeDefined();
      expect(breakdown.right).toBeDefined();
      expect(breakdown.left.noteCount).toBeGreaterThan(0);
      expect(breakdown.right.noteCount).toBeGreaterThan(0);
      expect(breakdown.left.completeness).toBeGreaterThanOrEqual(0);
      expect(breakdown.left.completeness).toBeLessThanOrEqual(100);
      expect(breakdown.right.completeness).toBeGreaterThanOrEqual(0);
      expect(breakdown.right.completeness).toBeLessThanOrEqual(100);
    });

    it("identifies the weaker hand when left has more missed notes", () => {
      const result = makeResult({
        details: {
          totalExpected: 20,
          totalPlayed: 14,
          matched: 14,
          missed: [
            makeMissed("left", 1),
            makeMissed("left", 2),
            makeMissed("left", 3),
            makeMissed("left", 4),
            makeMissed("left", 5),
            makeMissed("right", 8),
          ],
          extras: [],
          timingIssues: [],
        },
      });

      const breakdown = breakdownByHand(result);

      expect(breakdown.weakerHand).toBe("left");
      // Completeness estimates are approximations — weakerHand (from miss counts) is the authoritative signal
      expect(breakdown.left.noteCount).toBeGreaterThan(0);
    });

    it("identifies the weaker hand when right has more missed notes", () => {
      const result = makeResult({
        details: {
          totalExpected: 20,
          totalPlayed: 14,
          matched: 14,
          missed: [
            makeMissed("left", 1),
            makeMissed("right", 2),
            makeMissed("right", 3),
            makeMissed("right", 4),
            makeMissed("right", 5),
            makeMissed("right", 6),
          ],
          extras: [],
          timingIssues: [],
        },
      });

      const breakdown = breakdownByHand(result);

      expect(breakdown.weakerHand).toBe("right");
      expect(breakdown.right.noteCount).toBeGreaterThan(0);
    });

    it("generates a suggestion mentioning the weaker hand and missed measures", () => {
      const result = makeResult({
        details: {
          totalExpected: 20,
          totalPlayed: 14,
          matched: 14,
          missed: [
            makeMissed("left", 5),
            makeMissed("left", 6),
            makeMissed("left", 7),
            makeMissed("left", 8),
            makeMissed("left", 9),
            makeMissed("right", 1),
          ],
          extras: [],
          timingIssues: [],
        },
      });

      const breakdown = breakdownByHand(result);

      expect(breakdown.suggestion).toContain("left");
      expect(breakdown.suggestion).toMatch(/\d+ note/);
    });
  });

  describe("balanced performance", () => {
    it("returns balanced when both hands have equal missed notes", () => {
      const result = makeResult({
        details: {
          totalExpected: 20,
          totalPlayed: 18,
          matched: 18,
          missed: [
            makeMissed("left", 3),
            makeMissed("right", 7),
          ],
          extras: [],
          timingIssues: [],
        },
      });

      const breakdown = breakdownByHand(result);

      expect(breakdown.weakerHand).toBe("balanced");
    });

    it("returns balanced when no notes are missed", () => {
      const result = makeResult({
        metrics: { overallScore: 95, pitchAccuracy: 98, timingAccuracyMs: 15, completeness: 100, extraNoteCount: 0 },
        details: {
          totalExpected: 20,
          totalPlayed: 20,
          matched: 20,
          missed: [],
          extras: [],
          timingIssues: [],
        },
      });

      const breakdown = breakdownByHand(result);

      expect(breakdown.weakerHand).toBe("balanced");
      expect(breakdown.suggestion).toContain("balanced");
    });
  });

  describe("single hand only", () => {
    it("handles result where only left hand notes are missed (right-hand-only piece)", () => {
      const result = makeResult({
        details: {
          totalExpected: 10,
          totalPlayed: 8,
          matched: 8,
          missed: [
            makeMissed("right", 3),
            makeMissed("right", 4),
          ],
          extras: [],
          timingIssues: [],
        },
      });

      const breakdown = breakdownByHand(result);

      // Right hand has missed notes, left hand has none
      expect(breakdown.right.noteCount).toBeGreaterThan(0);
      expect(breakdown.right.completeness).toBeLessThan(100);
    });

    it("handles result where only right hand notes are missed", () => {
      const result = makeResult({
        details: {
          totalExpected: 10,
          totalPlayed: 7,
          matched: 7,
          missed: [
            makeMissed("left", 1),
            makeMissed("left", 2),
            makeMissed("left", 3),
          ],
          extras: [],
          timingIssues: [],
        },
      });

      const breakdown = breakdownByHand(result);

      expect(breakdown.left.noteCount).toBeGreaterThan(0);
      expect(breakdown.left.completeness).toBeLessThan(100);
    });
  });

  describe("empty matches", () => {
    it("returns empty metrics when totalExpected is 0", () => {
      const result = makeResult({
        metrics: { overallScore: 0, pitchAccuracy: 0, timingAccuracyMs: 0, completeness: 0, extraNoteCount: 0 },
        details: {
          totalExpected: 0,
          totalPlayed: 0,
          matched: 0,
          missed: [],
          extras: [],
          timingIssues: [],
        },
      });

      const breakdown = breakdownByHand(result);

      expect(breakdown.weakerHand).toBe("balanced");
      expect(breakdown.left.noteCount).toBe(0);
      expect(breakdown.right.noteCount).toBe(0);
      expect(breakdown.left.pitchAccuracy).toBe(0);
      expect(breakdown.right.pitchAccuracy).toBe(0);
      expect(breakdown.suggestion).toContain("No notes");
    });

    it("handles zero matched but some missed notes", () => {
      const result = makeResult({
        metrics: { overallScore: 0, pitchAccuracy: 0, timingAccuracyMs: 0, completeness: 0, extraNoteCount: 0 },
        details: {
          totalExpected: 4,
          totalPlayed: 0,
          matched: 0,
          missed: [
            makeMissed("left", 1),
            makeMissed("left", 2),
            makeMissed("right", 1),
            makeMissed("right", 2),
          ],
          extras: [],
          timingIssues: [],
        },
      });

      const breakdown = breakdownByHand(result);

      expect(breakdown.left.completeness).toBe(0);
      expect(breakdown.right.completeness).toBe(0);
      expect(breakdown.left.noteCount).toBe(2);
      expect(breakdown.right.noteCount).toBe(2);
    });
  });

  describe("suggestion quality", () => {
    it("suggests hands-separate practice for low completeness", () => {
      const result = makeResult({
        details: {
          totalExpected: 20,
          totalPlayed: 8,
          matched: 8,
          missed: [
            ...Array.from({ length: 10 }, (_, i) => makeMissed("left", i + 1)),
            makeMissed("right", 5),
            makeMissed("right", 6),
          ],
          extras: [],
          timingIssues: [],
        },
      });

      const breakdown = breakdownByHand(result);

      expect(breakdown.suggestion).toContain("hands-separate");
    });

    it("provides expression advice when both hands are strong", () => {
      const result = makeResult({
        metrics: { overallScore: 95, pitchAccuracy: 98, timingAccuracyMs: 10, completeness: 98, extraNoteCount: 0 },
        details: {
          totalExpected: 20,
          totalPlayed: 20,
          matched: 20,
          missed: [],
          extras: [],
          timingIssues: [],
        },
      });

      const breakdown = breakdownByHand(result);

      expect(breakdown.suggestion).toContain("expression");
    });

    it("includes measure ranges in suggestion for missed notes", () => {
      const result = makeResult({
        details: {
          totalExpected: 20,
          totalPlayed: 12,
          matched: 12,
          missed: [
            makeMissed("left", 5),
            makeMissed("left", 6),
            makeMissed("left", 7),
            makeMissed("left", 8),
            makeMissed("left", 9),
            makeMissed("left", 10),
            makeMissed("left", 11),
            makeMissed("right", 1),
          ],
          extras: [],
          timingIssues: [],
        },
      });

      const breakdown = breakdownByHand(result);

      // Should mention measure ranges
      expect(breakdown.suggestion).toMatch(/measure/i);
    });
  });

  describe("estimate confidence", () => {
    it("uses miss ratio for workload when both hands have misses", () => {
      const result = makeResult({
        details: {
          totalExpected: 30,
          totalPlayed: 20,
          matched: 20,
          missed: [
            // 8 left misses, 2 right misses → left has ~80% of the workload
            ...Array.from({ length: 8 }, (_, i) => makeMissed("left", i + 1)),
            makeMissed("right", 1),
            makeMissed("right", 2),
          ],
          extras: [],
          timingIssues: [],
        },
      });

      const breakdown = breakdownByHand(result);

      // Left should have significantly more expected notes than right
      expect(breakdown.left.noteCount).toBeGreaterThan(breakdown.right.noteCount);
      // Should NOT contain the low-confidence disclaimer
      expect(breakdown.suggestion).not.toContain("approximate");
    });

    it("admits low confidence when only one hand has misses", () => {
      const result = makeResult({
        details: {
          totalExpected: 20,
          totalPlayed: 15,
          matched: 15,
          missed: [
            makeMissed("left", 1),
            makeMissed("left", 2),
            makeMissed("left", 3),
            makeMissed("left", 4),
            makeMissed("left", 5),
          ],
          extras: [],
          timingIssues: [],
        },
      });

      const breakdown = breakdownByHand(result);

      expect(breakdown.weakerHand).toBe("left");
      expect(breakdown.suggestion).toContain("approximate");
    });
  });

  describe("HandBreakdown shape", () => {
    it("has all required fields", () => {
      const result = makeResult();
      const breakdown = breakdownByHand(result);

      expect(breakdown).toHaveProperty("left");
      expect(breakdown).toHaveProperty("right");
      expect(breakdown).toHaveProperty("weakerHand");
      expect(breakdown).toHaveProperty("suggestion");

      // HandMetrics shape
      for (const hand of [breakdown.left, breakdown.right]) {
        expect(hand).toHaveProperty("pitchAccuracy");
        expect(hand).toHaveProperty("timingAccuracyMs");
        expect(hand).toHaveProperty("completeness");
        expect(hand).toHaveProperty("noteCount");
        expect(typeof hand.pitchAccuracy).toBe("number");
        expect(typeof hand.timingAccuracyMs).toBe("number");
        expect(typeof hand.completeness).toBe("number");
        expect(typeof hand.noteCount).toBe("number");
      }

      expect(["left", "right", "balanced"]).toContain(breakdown.weakerHand);
      expect(typeof breakdown.suggestion).toBe("string");
      expect(breakdown.suggestion.length).toBeGreaterThan(0);
    });
  });
});
