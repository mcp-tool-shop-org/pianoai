// ─── Tests for multi-run-aggregator.ts (Slice 14) ────────────────────────────
//
// Validates the pure aggregator library. No I/O, no real LLM, no network.
// Uses synthetic RunResult fixtures.
//
// Coverage:
//   - n=0 (degenerate)
//   - n=1 (stddev = null; mean = single value)
//   - n=2 (stddev computable but high-noise)
//   - n=3 typical
//   - n=5 typical
//   - All-pass / all-fail / mixed
//   - Strict majority threshold at boundaries (1/2, 2/3, 2/4, 3/5)
//   - Mean/stddev correctness on known sequences (vs hand-computed)
//   - not_computable handling (some / all)
//   - aggregateValues convenience helper
//   - NaN metric extraction treated as not_computable
//
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  aggregateRuns,
  aggregateValues,
  type RunResult,
} from "./multi-run-aggregator.js";

// ─── Fixture builders ─────────────────────────────────────────────────────────

/**
 * Build a RunResult fixture for E2-style metric { grooveOA: number | null }.
 */
function mkRun(
  index: number,
  grooveOA: number | null,
  passed: boolean,
): RunResult<{ grooveOA: number | null }> {
  return {
    run_index: index,
    metric: { grooveOA },
    passed,
    durationMs: 1000,
    raw_output: `synthetic-run-${index}`,
  };
}

const extractGroove = (m: { grooveOA: number | null }): number | null =>
  m.grooveOA;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("aggregateRuns", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. n=0 degenerate case
  // ───────────────────────────────────────────────────────────────────────────
  it("n=0 returns all-null aggregate with pass_rate=0 and majority_pass=false", () => {
    const r = aggregateRuns<{ grooveOA: number | null }>([], extractGroove);
    expect(r).toEqual({
      n: 0,
      pass_rate: 0,
      majority_pass: false,
      metric_mean: null,
      metric_stddev: null,
      metric_min: null,
      metric_max: null,
      not_computable_count: 0,
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. n=1 → stddev=null, mean=value
  // ───────────────────────────────────────────────────────────────────────────
  it("n=1 with passed run: stddev=null, mean=value, pass_rate=1, majority_pass=true", () => {
    const r = aggregateRuns([mkRun(0, 0.85, true)], extractGroove);
    expect(r.n).toBe(1);
    expect(r.pass_rate).toBe(1);
    expect(r.majority_pass).toBe(true);
    expect(r.metric_mean).toBeCloseTo(0.85, 6);
    expect(r.metric_stddev).toBeNull();
    expect(r.metric_min).toBeCloseTo(0.85, 6);
    expect(r.metric_max).toBeCloseTo(0.85, 6);
    expect(r.not_computable_count).toBe(0);
  });

  it("n=1 with failed run: pass_rate=0, majority_pass=false", () => {
    const r = aggregateRuns([mkRun(0, 0.5, false)], extractGroove);
    expect(r.pass_rate).toBe(0);
    expect(r.majority_pass).toBe(false);
    expect(r.metric_mean).toBeCloseTo(0.5, 6);
    expect(r.metric_stddev).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. n=2 — stddev computable
  // ───────────────────────────────────────────────────────────────────────────
  it("n=2 with equal values: stddev=0 (NOT null)", () => {
    const r = aggregateRuns(
      [mkRun(0, 0.8, true), mkRun(1, 0.8, true)],
      extractGroove,
    );
    expect(r.n).toBe(2);
    expect(r.metric_mean).toBeCloseTo(0.8, 6);
    expect(r.metric_stddev).toBeCloseTo(0, 10);
    expect(r.pass_rate).toBe(1);
    expect(r.majority_pass).toBe(true);
  });

  it("n=2 with [0.6, 1.0]: sample stddev = sqrt(0.08) = 0.2828...", () => {
    const r = aggregateRuns(
      [mkRun(0, 0.6, false), mkRun(1, 1.0, true)],
      extractGroove,
    );
    expect(r.metric_mean).toBeCloseTo(0.8, 10);
    // Sample stddev: sqrt(((0.6-0.8)^2 + (1.0-0.8)^2) / (2-1))
    //              = sqrt((0.04 + 0.04) / 1)
    //              = sqrt(0.08)
    //              ≈ 0.282842712
    expect(r.metric_stddev).toBeCloseTo(Math.sqrt(0.08), 10);
    expect(r.pass_rate).toBe(0.5);
    expect(r.majority_pass).toBe(false); // strict > 0.5
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. n=3 — typical case from Slice 14 kickoff example
  // ───────────────────────────────────────────────────────────────────────────
  it("n=3 from kickoff example: [0.867, 0.750, 0.812] gives expected mean/stddev/pass_rate", () => {
    const r = aggregateRuns(
      [
        mkRun(0, 0.867, true),
        mkRun(1, 0.75, false),
        mkRun(2, 0.812, true),
      ],
      extractGroove,
    );
    expect(r.n).toBe(3);
    expect(r.pass_rate).toBeCloseTo(2 / 3, 6);
    expect(r.majority_pass).toBe(true); // 0.667 > 0.5
    // mean = (0.867 + 0.750 + 0.812) / 3 = 2.429 / 3 ≈ 0.80967
    expect(r.metric_mean).toBeCloseTo((0.867 + 0.75 + 0.812) / 3, 6);
    // sample stddev: see kickoff doc → ≈ 0.059
    // sqrt(((0.867-mean)^2 + (0.75-mean)^2 + (0.812-mean)^2) / 2)
    const mean = (0.867 + 0.75 + 0.812) / 3;
    const expectedStddev = Math.sqrt(
      ((0.867 - mean) ** 2 + (0.75 - mean) ** 2 + (0.812 - mean) ** 2) / 2,
    );
    expect(r.metric_stddev).toBeCloseTo(expectedStddev, 8);
    expect(r.metric_stddev).toBeCloseTo(0.0589, 3); // sanity vs kickoff approx
    expect(r.metric_min).toBeCloseTo(0.75, 6);
    expect(r.metric_max).toBeCloseTo(0.867, 6);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Strict-majority boundary cases
  // ───────────────────────────────────────────────────────────────────────────
  it("strict majority: 2/3 passes = majority_pass true", () => {
    const r = aggregateRuns(
      [mkRun(0, 1, true), mkRun(1, 0, false), mkRun(2, 1, true)],
      extractGroove,
    );
    expect(r.pass_rate).toBeCloseTo(2 / 3, 6);
    expect(r.majority_pass).toBe(true);
  });

  it("strict majority: 1/3 passes = majority_pass false", () => {
    const r = aggregateRuns(
      [mkRun(0, 1, true), mkRun(1, 0, false), mkRun(2, 0, false)],
      extractGroove,
    );
    expect(r.pass_rate).toBeCloseTo(1 / 3, 6);
    expect(r.majority_pass).toBe(false);
  });

  it("strict majority: 2/4 passes (exactly 0.5) = majority_pass false (STRICT, not ≥)", () => {
    const r = aggregateRuns(
      [
        mkRun(0, 1, true),
        mkRun(1, 1, true),
        mkRun(2, 0, false),
        mkRun(3, 0, false),
      ],
      extractGroove,
    );
    expect(r.pass_rate).toBe(0.5);
    expect(r.majority_pass).toBe(false); // 0.5 is NOT a strict majority
  });

  it("strict majority: 3/5 passes (0.6) = majority_pass true", () => {
    const r = aggregateRuns(
      [
        mkRun(0, 1, true),
        mkRun(1, 1, true),
        mkRun(2, 1, true),
        mkRun(3, 0, false),
        mkRun(4, 0, false),
      ],
      extractGroove,
    );
    expect(r.pass_rate).toBe(0.6);
    expect(r.majority_pass).toBe(true);
  });

  it("strict majority: 0/3 passes = majority_pass false", () => {
    const r = aggregateRuns(
      [mkRun(0, 0.3, false), mkRun(1, 0.4, false), mkRun(2, 0.2, false)],
      extractGroove,
    );
    expect(r.pass_rate).toBe(0);
    expect(r.majority_pass).toBe(false);
  });

  it("strict majority: 3/3 passes (all-pass) = majority_pass true", () => {
    const r = aggregateRuns(
      [mkRun(0, 0.9, true), mkRun(1, 0.85, true), mkRun(2, 0.8, true)],
      extractGroove,
    );
    expect(r.pass_rate).toBe(1);
    expect(r.majority_pass).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Mean/stddev correctness on known sequences
  // ───────────────────────────────────────────────────────────────────────────
  it("known sequence [1, 2, 3, 4, 5]: mean=3, sample stddev=sqrt(2.5)≈1.5811", () => {
    const r = aggregateRuns(
      [
        mkRun(0, 1, true),
        mkRun(1, 2, true),
        mkRun(2, 3, true),
        mkRun(3, 4, true),
        mkRun(4, 5, true),
      ],
      extractGroove,
    );
    expect(r.metric_mean).toBeCloseTo(3, 10);
    // sample stddev: sqrt((4 + 1 + 0 + 1 + 4) / 4) = sqrt(2.5) ≈ 1.5811388
    expect(r.metric_stddev).toBeCloseTo(Math.sqrt(2.5), 10);
    expect(r.metric_min).toBe(1);
    expect(r.metric_max).toBe(5);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. not_computable handling
  // ───────────────────────────────────────────────────────────────────────────
  it("not_computable: 1 of 3 runs returns null; mean/stddev over 2 valid", () => {
    const r = aggregateRuns(
      [
        mkRun(0, 0.8, true),
        mkRun(1, null, false), // not computable (e.g. parse failure)
        mkRun(2, 0.7, true),
      ],
      extractGroove,
    );
    expect(r.n).toBe(3);
    expect(r.not_computable_count).toBe(1);
    expect(r.pass_rate).toBeCloseTo(2 / 3, 6); // 2 passed runs
    expect(r.majority_pass).toBe(true);
    expect(r.metric_mean).toBeCloseTo(0.75, 10); // mean of [0.8, 0.7]
    expect(r.metric_stddev).toBeCloseTo(Math.sqrt(0.005), 10); // sqrt(((0.05)^2 + (0.05)^2)/1) = sqrt(0.005)
    expect(r.metric_min).toBeCloseTo(0.7, 10);
    expect(r.metric_max).toBeCloseTo(0.8, 10);
  });

  it("not_computable: all 3 runs return null; metric stats all null, pass_rate still reported", () => {
    const r = aggregateRuns(
      [
        mkRun(0, null, false),
        mkRun(1, null, false),
        mkRun(2, null, false),
      ],
      extractGroove,
    );
    expect(r.n).toBe(3);
    expect(r.not_computable_count).toBe(3);
    expect(r.pass_rate).toBe(0);
    expect(r.majority_pass).toBe(false);
    expect(r.metric_mean).toBeNull();
    expect(r.metric_stddev).toBeNull();
    expect(r.metric_min).toBeNull();
    expect(r.metric_max).toBeNull();
  });

  it("not_computable: all-null but some passed (e.g. E1 pass-without-metric)", () => {
    // E1 doesn't have a numeric metric — passes/fails are binary. Aggregator
    // should handle "all metrics null, some passed" gracefully.
    const r = aggregateRuns(
      [
        mkRun(0, null, true),
        mkRun(1, null, false),
        mkRun(2, null, true),
      ],
      extractGroove,
    );
    expect(r.not_computable_count).toBe(3);
    expect(r.pass_rate).toBeCloseTo(2 / 3, 6);
    expect(r.majority_pass).toBe(true);
    expect(r.metric_mean).toBeNull();
    expect(r.metric_stddev).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. NaN extracted as not_computable
  // ───────────────────────────────────────────────────────────────────────────
  it("NaN metric value is treated as not_computable", () => {
    const runs: RunResult<{ grooveOA: number | null }>[] = [
      mkRun(0, 0.7, true),
      { ...mkRun(1, 0.5, false), metric: { grooveOA: Number.NaN } },
      mkRun(2, 0.9, true),
    ];
    const r = aggregateRuns(runs, extractGroove);
    expect(r.not_computable_count).toBe(1);
    expect(r.metric_mean).toBeCloseTo(0.8, 10);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. n=1 / 0 of 1 passed
  // ───────────────────────────────────────────────────────────────────────────
  it("n=1 with 0 passes: pass_rate=0, majority_pass=false, mean=value, stddev=null", () => {
    const r = aggregateRuns([mkRun(0, 0.3, false)], extractGroove);
    expect(r.pass_rate).toBe(0);
    expect(r.majority_pass).toBe(false);
    expect(r.metric_mean).toBeCloseTo(0.3, 10);
    expect(r.metric_stddev).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. Purity / idempotence: same input → same output
  // ───────────────────────────────────────────────────────────────────────────
  it("is pure: same input twice returns equal output", () => {
    const input: RunResult<{ grooveOA: number | null }>[] = [
      mkRun(0, 0.8, true),
      mkRun(1, 0.6, false),
      mkRun(2, 0.75, true),
    ];
    const r1 = aggregateRuns(input, extractGroove);
    const r2 = aggregateRuns(input, extractGroove);
    expect(r1).toEqual(r2);
  });

  it("is pure: does not mutate input array or runs", () => {
    const original: RunResult<{ grooveOA: number | null }>[] = [
      mkRun(0, 0.8, true),
      mkRun(1, 0.7, false),
    ];
    const snapshot = JSON.parse(JSON.stringify(original));
    aggregateRuns(original, extractGroove);
    expect(JSON.parse(JSON.stringify(original))).toEqual(snapshot);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 11. Backward-compat: n=1 case produces the same numbers an n=1 reader would see
  // ───────────────────────────────────────────────────────────────────────────
  it("n=1 backward-compat: aggregate.metric_mean equals the single run's metric", () => {
    // Existing Slice 12/13 readers compute `meanGrooveOA` over the (single)
    // per-pair value. Aggregator at n=1 must produce the same number.
    const r = aggregateRuns([mkRun(0, 0.825, true)], extractGroove);
    expect(r.metric_mean).toBe(0.825);
    expect(r.pass_rate).toBe(1);
  });
});

// ─── aggregateValues convenience helper ───────────────────────────────────────

describe("aggregateValues", () => {
  it("aggregates plain number array with default predicate (non-null = passed)", () => {
    const r = aggregateValues([0.8, 0.6, 0.75, null]);
    expect(r.n).toBe(4);
    expect(r.pass_rate).toBe(0.75); // 3 of 4 are non-null
    expect(r.majority_pass).toBe(true);
    expect(r.not_computable_count).toBe(1);
    expect(r.metric_mean).toBeCloseTo((0.8 + 0.6 + 0.75) / 3, 10);
  });

  it("aggregates with custom threshold predicate (e.g. groove ≥ 0.797)", () => {
    const r = aggregateValues(
      [0.8, 0.6, 0.85, 0.79, null],
      (v) => v !== null && v >= 0.797,
    );
    expect(r.n).toBe(5);
    expect(r.pass_rate).toBe(0.4); // 2/5 (0.8 + 0.85) pass; 0.79 fails
    expect(r.majority_pass).toBe(false);
    expect(r.not_computable_count).toBe(1);
  });

  it("aggregateValues on empty array returns degenerate n=0 result", () => {
    const r = aggregateValues([]);
    expect(r.n).toBe(0);
    expect(r.metric_mean).toBeNull();
  });

  it("aggregateValues on all-null returns metric stats all null", () => {
    const r = aggregateValues([null, null, null]);
    expect(r.n).toBe(3);
    expect(r.not_computable_count).toBe(3);
    expect(r.metric_mean).toBeNull();
    expect(r.metric_stddev).toBeNull();
  });
});
