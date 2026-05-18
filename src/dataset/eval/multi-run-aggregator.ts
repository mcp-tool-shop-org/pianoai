// ─── jam-actions-v0 Slice 14 — Multi-Run Aggregator ──────────────────────────
//
// Pure library for aggregating K runs of the same eval (record/pair/question)
// into stable summary statistics:
//
//   - pass_rate (proportion of K runs that passed the gate)
//   - majority_pass (strict majority: pass_rate > 0.5)
//   - metric_mean / metric_stddev / metric_min / metric_max (sample stddev)
//   - not_computable_count (runs where the metric extractor returned null)
//
// Used by:
//   - scripts/run-jam-actions-corpus-eval.ts (--n flag, per-record/pair loop)
//   - Future eval slices that report K-run aggregates
//
// Design constraints:
//   - PURE FUNCTION — no I/O, no global state, fully unit-testable
//   - Sample stddev (n−1 denominator) — the K runs are samples of the model's
//     true behavior distribution, not the full population
//   - Strict majority threshold — pass_rate > 0.5, NOT ≥ 0.5 (so 1/2 at n=2 is
//     NOT a majority; 2/3 at n=3 IS; 3/5 at n=5 IS)
//   - not_computable handling — runs with null metric are EXCLUDED from
//     mean/stddev/min/max but COUNTED in not_computable_count; if ALL K runs
//     are not_computable, the aggregate metric stays null but pass_rate is
//     still reported (based on the runs' independent passed flag)
//
// Statistical conventions (LOCKED for Slice 14+):
//   - sample stddev formula:  s = sqrt( Σ(x_i - x̄)² / (n - 1) )
//     where n is the count of *computable* metric values (NOT the total run count)
//   - n=1 case:               stddev = null (no degrees of freedom)
//   - n=0 case (no runs):     all stats null, pass_rate=0, majority_pass=false
//   - majority_pass:          pass_rate > 0.5  (strict greater-than)
//
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single run of an eval (E1 record, E2 pair, E3 record, etc.).
 * `metric` is the eval-specific metric object; the aggregator only sees the
 * scalar produced by `metricExtractor`.
 */
export interface RunResult<T> {
  /** 0..n-1 zero-based run index (the runner's iteration counter). */
  run_index: number;
  /** Eval-specific metric payload (e.g. { groove_oa: 0.85 } for E2). */
  metric: T;
  /** Whether this run passed the eval's gate (independent of metric). */
  passed: boolean;
  /** Wall-clock latency for the run, milliseconds. */
  durationMs: number;
  /**
   * Raw model output captured during the run.
   * Preserved per Slice 13 doctrine — debugging future variance needs it.
   * May be `null` when the backend didn't surface raw text.
   */
  raw_output?: string | null;
}

/**
 * Aggregate statistics over K runs.
 *
 * Slice 14 schema for `corpus-eval-results/2.0.0` per-record/pair aggregate.
 */
export interface AggregateStats {
  /** Number of runs aggregated. K. */
  n: number;
  /** Proportion of runs that passed. In [0, 1]. */
  pass_rate: number;
  /** True iff pass_rate > 0.5 (STRICT majority, not ≥). */
  majority_pass: boolean;
  /** Arithmetic mean of computable metric values, or null if zero computable. */
  metric_mean: number | null;
  /**
   * Sample stddev (n−1 denominator) of computable metric values, or null when:
   *   - Fewer than 2 computable values (need n≥2 for n−1 ≥ 1)
   *   - All computable values are equal (returns 0, NOT null — by convention)
   */
  metric_stddev: number | null;
  /** Min computable metric, or null when zero computable. */
  metric_min: number | null;
  /** Max computable metric, or null when zero computable. */
  metric_max: number | null;
  /**
   * Number of runs where `metricExtractor(run.metric)` returned null.
   * E.g. a run that failed to parse and has no grooveOA value.
   * `not_computable_count + computable_count = n`.
   */
  not_computable_count: number;
}

/**
 * Aggregate K runs into AggregateStats.
 *
 * Pure function. No I/O. No mutation. Same input → same output.
 *
 * @param runs           K run results. K may be 0 (degenerate; all stats null).
 * @param metricExtractor Pure function (metric) → number | null. Return null
 *                       for non-computable runs (parse failures, not_computable
 *                       annotations, etc.).
 * @returns              AggregateStats over the K runs.
 *
 * @example E2 grooveOA aggregation:
 *   aggregateRuns(e2Runs, (m) => m.grooveOA);
 *
 * @example E3 full-context score aggregation:
 *   aggregateRuns(e3Runs, (m) => m.aggregate.full);
 *
 * @example all-not-computable case:
 *   aggregateRuns(runs, () => null)
 *   // → { n, pass_rate: <count>/n, majority_pass: ..., metric_mean: null,
 *   //     metric_stddev: null, metric_min: null, metric_max: null,
 *   //     not_computable_count: n }
 */
export function aggregateRuns<T>(
  runs: RunResult<T>[],
  metricExtractor: (m: T) => number | null,
): AggregateStats {
  const n = runs.length;

  // Degenerate n=0 case: no runs to aggregate.
  if (n === 0) {
    return {
      n: 0,
      pass_rate: 0,
      majority_pass: false,
      metric_mean: null,
      metric_stddev: null,
      metric_min: null,
      metric_max: null,
      not_computable_count: 0,
    };
  }

  // Pass rate: count over all K runs, independent of whether metric is computable.
  const passCount = runs.reduce((s, r) => s + (r.passed ? 1 : 0), 0);
  const pass_rate = passCount / n;
  const majority_pass = pass_rate > 0.5; // strict >

  // Compute metric values, separating computable from not_computable.
  const metricValues: number[] = [];
  let not_computable_count = 0;
  for (const r of runs) {
    const v = metricExtractor(r.metric);
    if (v === null || Number.isNaN(v)) {
      not_computable_count++;
    } else {
      metricValues.push(v);
    }
  }

  const k = metricValues.length;
  if (k === 0) {
    return {
      n,
      pass_rate,
      majority_pass,
      metric_mean: null,
      metric_stddev: null,
      metric_min: null,
      metric_max: null,
      not_computable_count,
    };
  }

  const sum = metricValues.reduce((s, x) => s + x, 0);
  const metric_mean = sum / k;
  const metric_min = Math.min(...metricValues);
  const metric_max = Math.max(...metricValues);

  // Sample stddev: needs n≥2 for n−1≥1 denominator.
  let metric_stddev: number | null;
  if (k < 2) {
    metric_stddev = null;
  } else {
    const sqDeviations = metricValues.reduce(
      (s, x) => s + (x - metric_mean) * (x - metric_mean),
      0,
    );
    metric_stddev = Math.sqrt(sqDeviations / (k - 1));
  }

  return {
    n,
    pass_rate,
    majority_pass,
    metric_mean,
    metric_stddev,
    metric_min,
    metric_max,
    not_computable_count,
  };
}

/**
 * Convenience: aggregate over an array of numbers (or nulls) directly,
 * skipping the RunResult wrapper. Useful for per-pair corpus aggregates where
 * the inner values are already extracted (e.g. per-pair grooveOA means).
 *
 * Uses the SAME conventions as aggregateRuns: sample stddev, strict majority,
 * null exclusion from mean/stddev.
 *
 * @param values         Array of metric values (number or null).
 * @param passPredicate  Optional: (v) => boolean. Defaults to (v) => v !== null
 *                       (non-null counts as "computed"). Used for pass_rate.
 *                       Pass a custom predicate for threshold-based pass rates.
 */
export function aggregateValues(
  values: Array<number | null>,
  passPredicate?: (v: number | null) => boolean,
): AggregateStats {
  const predicate = passPredicate ?? ((v: number | null) => v !== null);
  const synthetic: RunResult<{ v: number | null }>[] = values.map(
    (v, i): RunResult<{ v: number | null }> => ({
      run_index: i,
      metric: { v },
      passed: predicate(v),
      durationMs: 0,
    }),
  );
  return aggregateRuns(synthetic, (m) => m.v);
}
