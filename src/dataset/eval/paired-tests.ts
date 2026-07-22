// ─── E2v2 Slice 1.3a — Exact paired significance tests (small n) ──────────────
//
// At n ≈ 13–22 paired items, t-tests are inappropriate; the field uses exact /
// resampling paired tests (design finding F13, Dror et al. 2018, "The
// Hitchhiker's Guide to Testing Statistical Significance in NLP"). This module
// provides the two we need:
//
//   - signTest: exact binomial sign test on item-level values vs a reference.
//   - permutationTestPairedMean: the paired sign-flip randomization test on
//     item-level differences (exact enumeration ≤ 20 items via Gray code, seeded
//     Monte Carlo above), the exact/resampling test F13 prescribes.
//
// Deterministic (Monte Carlo is seeded); no LLM calls; no HTTP; no dependencies.
// ─────────────────────────────────────────────────────────────────────────────

export type Alternative = "greater" | "less" | "two-sided";

// ─── Sign test (exact binomial) ──────────────────────────────────────────────

export interface SignTestResult {
  /** Non-tie sample size (values exactly at the reference are dropped). */
  n: number;
  above: number;
  below: number;
  ties: number;
  pValue: number;
  alternative: Alternative;
}

/** Binomial PMF P(X = k) for X ~ Binomial(n, 0.5), computed without overflow. */
function binomHalfPmf(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  // C(n,k) · 0.5^n, built multiplicatively to stay in double range for n ≤ 22.
  let logC = 0;
  for (let i = 1; i <= k; i++) logC += Math.log((n - k + i) / i);
  return Math.exp(logC - n * Math.LN2);
}

/** Upper-tail P(X ≥ k) for X ~ Binomial(n, 0.5). */
function binomHalfUpper(n: number, k: number): number {
  let p = 0;
  for (let i = k; i <= n; i++) p += binomHalfPmf(n, i);
  return Math.min(1, p);
}

/**
 * Exact binomial sign test on `values` relative to `reference`.
 *   - "greater":  H1 = values tend ABOVE the reference → P(X ≥ above).
 *   - "less":     H1 = values tend BELOW → P(X ≥ below).
 *   - "two-sided": 2 · min-tail, capped at 1.
 * Ties (exactly at the reference, within `eps`) are dropped, the standard rule.
 */
export function signTest(
  values: number[],
  reference = 0,
  alternative: Alternative = "greater",
  eps = 1e-12,
): SignTestResult {
  let above = 0;
  let below = 0;
  let ties = 0;
  for (const v of values) {
    const d = v - reference;
    if (Math.abs(d) <= eps) ties++;
    else if (d > 0) above++;
    else below++;
  }
  const n = above + below;
  let pValue: number;
  if (n === 0) {
    pValue = 1;
  } else if (alternative === "greater") {
    pValue = binomHalfUpper(n, above);
  } else if (alternative === "less") {
    pValue = binomHalfUpper(n, below);
  } else {
    const k = Math.min(above, below);
    pValue = Math.min(1, 2 * binomHalfUpper(n, n - k));
  }
  return { n, above, below, ties, pValue, alternative };
}

// ─── Paired sign-flip permutation (randomization) test on the mean ───────────

export interface PermutationTestResult {
  n: number;
  observedMean: number;
  pValue: number;
  method: "exact" | "monte-carlo";
  /** Sign-flip assignments considered (2^n exact, or the MC sample size). */
  assignments: number;
  alternative: Alternative;
}

function ctz(x: number): number {
  // count trailing zeros of a positive 32-bit int
  return 31 - Math.clz32(x & -x);
}

/**
 * Paired sign-flip randomization test on the mean of `diffs` (e.g. per-item
 * margins, or margins minus a bar). Under H0 the sign of each difference is
 * exchangeable; we enumerate/sample sign vectors and compare the permuted mean
 * to the observed.
 *
 * Exact via Gray-code enumeration for n ≤ maxExact (default 20 → 2^20 ≈ 1.05M
 * assignments), seeded Monte Carlo above (add-one smoothing for a valid, never-
 * zero p-value). The observed assignment (all +1) is always included.
 */
export function permutationTestPairedMean(
  diffs: number[],
  opts: { alternative?: Alternative; maxExact?: number; iterations?: number; seed?: number } = {},
): PermutationTestResult {
  const alternative = opts.alternative ?? "greater";
  const maxExact = opts.maxExact ?? 20;
  const iterations = opts.iterations ?? 100000;
  const seed = opts.seed ?? 12345;

  const n = diffs.length;
  if (n === 0) {
    return { n: 0, observedMean: 0, pValue: 1, method: "exact", assignments: 0, alternative };
  }
  const totalSum = diffs.reduce((a, b) => a + b, 0);
  const observedMean = totalSum / n;

  const meets = (sum: number): boolean => {
    if (alternative === "greater") return sum >= totalSum - 1e-12;
    if (alternative === "less") return sum <= totalSum + 1e-12;
    return Math.abs(sum) >= Math.abs(totalSum) - 1e-12;
  };

  if (n <= maxExact) {
    const total = 2 ** n;
    const signs = new Array<number>(n).fill(1);
    let sum = totalSum;
    let count = meets(sum) ? 1 : 0; // include the observed (all +1)
    for (let i = 1; i < total; i++) {
      const b = ctz(i);
      sum -= 2 * signs[b] * diffs[b];
      signs[b] = -signs[b];
      if (meets(sum)) count++;
    }
    return { n, observedMean, pValue: count / total, method: "exact", assignments: total, alternative };
  }

  // Seeded Monte Carlo.
  let s = (seed >>> 0) || 1;
  const rand = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s;
  };
  let count = 0;
  for (let it = 0; it < iterations; it++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      // Use the LCG's MSB (its high bits carry the full period; the low bit is
      // near-deterministic and would bias the sign). One fresh draw per item.
      sum += rand() >>> 31 ? diffs[j] : -diffs[j];
    }
    if (meets(sum)) count++;
  }
  // add-one smoothing (Phipson & Smyth 2010): never report p = 0.
  return {
    n,
    observedMean,
    pValue: (count + 1) / (iterations + 1),
    method: "monte-carlo",
    assignments: iterations,
    alternative,
  };
}

// ─── Minimum detectable effect (power helper for the LOCK doc) ────────────────

/**
 * The smallest constant per-item margin whose sign-flip permutation test would
 * reach significance at level α, given n items and a per-item spread proxy
 * `sd` (the item-margin standard deviation). This is a planning aid for the
 * preregistration (finding F31, Card et al. 2020), NOT a gate — it answers
 * "is n big enough to see the bar we are about to lock?"
 *
 * Uses the normal approximation MDE ≈ z_α · sd / √n (one-sided). Reported with
 * the honest caveat that the exact test above is what actually gates.
 */
export function minimumDetectableEffect(n: number, sd: number, alpha = 0.05): number {
  if (n <= 0) return Infinity;
  // one-sided normal quantile for common α without a stats dependency
  const zByAlpha: Record<string, number> = { "0.05": 1.6449, "0.025": 1.96, "0.01": 2.3263 };
  const z = zByAlpha[String(alpha)] ?? 1.6449;
  return (z * sd) / Math.sqrt(n);
}
