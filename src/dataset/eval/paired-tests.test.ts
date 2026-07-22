// ─── Tests: E2v2 exact paired significance tests ─────────────────────────────
//
// Locks the exact-test identities the gate's verdict rests on (finding F13):
//   - sign test = exact binomial tails;
//   - the paired sign-flip permutation test enumerates 2^n exactly for small n,
//     with the closed-form identity p = 1/2^n when every item favors the model;
//   - exact and Monte-Carlo agree within sampling error at the boundary.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { signTest, permutationTestPairedMean, minimumDetectableEffect } from "./paired-tests.js";

describe("signTest", () => {
  it("all values above the reference → exact upper binomial tail", () => {
    const r = signTest([0.1, 0.2, 0.3, 0.4, 0.5], 0, "greater");
    expect(r.above).toBe(5);
    expect(r.below).toBe(0);
    expect(r.pValue).toBeCloseTo(1 / 32, 10); // (1/2)^5
  });

  it("drops ties at the reference (standard rule)", () => {
    const r = signTest([0, 0, 0.1, 0.2], 0, "greater");
    expect(r.ties).toBe(2);
    expect(r.n).toBe(2);
    expect(r.pValue).toBeCloseTo(1 / 4, 10);
  });

  it("two-sided doubles the smaller tail", () => {
    const r = signTest([0.1, 0.2, 0.3, 0.4, 0.5], 0, "two-sided");
    expect(r.pValue).toBeCloseTo(2 / 32, 10);
  });

  it("a balanced split is non-significant", () => {
    const r = signTest([1, 1, -1, -1], 0, "two-sided");
    expect(r.pValue).toBe(1);
  });

  it("empty (all ties) → p = 1", () => {
    expect(signTest([0, 0], 0).pValue).toBe(1);
  });
});

describe("permutationTestPairedMean", () => {
  it("every item favoring the model → exact p = 1/2^n (greater)", () => {
    const r = permutationTestPairedMean([0.1, 0.2, 0.3], { alternative: "greater" });
    expect(r.method).toBe("exact");
    expect(r.assignments).toBe(8);
    expect(r.pValue).toBeCloseTo(1 / 8, 10);
    expect(r.observedMean).toBeCloseTo(0.2, 10);
  });

  it("every item favoring the model → two-sided p = 2/2^n", () => {
    const r = permutationTestPairedMean([0.1, 0.2, 0.3], { alternative: "two-sided" });
    expect(r.pValue).toBeCloseTo(2 / 8, 10);
  });

  it("a symmetric set around 0 is non-significant", () => {
    const r = permutationTestPairedMean([-0.3, -0.1, 0.1, 0.3], { alternative: "greater" });
    expect(r.pValue).toBeGreaterThan(0.3);
  });

  it("switches to seeded Monte Carlo above maxExact and stays deterministic", () => {
    const diffs = Array.from({ length: 12 }, (_, i) => 0.05 + i * 0.001);
    const a = permutationTestPairedMean(diffs, { maxExact: 8, iterations: 5000, seed: 7 });
    const b = permutationTestPairedMean(diffs, { maxExact: 8, iterations: 5000, seed: 7 });
    expect(a.method).toBe("monte-carlo");
    expect(a.pValue).toBe(b.pValue); // seeded → replayable
  });

  it("exact and Monte-Carlo agree within sampling error", () => {
    const diffs = [-0.2, -0.05, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
    const exact = permutationTestPairedMean(diffs, { maxExact: 20, alternative: "greater" });
    const mc = permutationTestPairedMean(diffs, { maxExact: 4, iterations: 40000, seed: 3, alternative: "greater" });
    expect(exact.method).toBe("exact");
    expect(Math.abs(exact.pValue - mc.pValue)).toBeLessThan(0.02);
  });

  it("empty input → p = 1", () => {
    expect(permutationTestPairedMean([]).pValue).toBe(1);
  });
});

describe("minimumDetectableEffect", () => {
  it("shrinks with n and grows with spread", () => {
    expect(minimumDetectableEffect(4, 0.2)).toBeGreaterThan(minimumDetectableEffect(16, 0.2));
    expect(minimumDetectableEffect(16, 0.4)).toBeGreaterThan(minimumDetectableEffect(16, 0.2));
  });
  it("is infinite at n = 0", () => {
    expect(minimumDetectableEffect(0, 0.2)).toBe(Infinity);
  });
});
