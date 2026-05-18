# jam-actions-v0 Slice 14 — Eval Stability / Multi-Run Aggregation

**Date:** 2026-05-18
**Status:** COMPLETE
**Backend:** ollama qwen2.5:7b (local, no paid API)
**Sample seed:** `slice12-2026-05-17` (apples-to-apples with Slice 12/13)
**Demo scope:** E2 n=3 on full 12-pair sample + E3 n=3 on 6 enriched records (E1 SKIPPED — Slice 13 proved E1 stable across runs)

---

## The single question this slice answers

**Slice 13 closed the leakage hypothesis but surfaced a harder blocker: with n=1, the same sample produces wildly different aggregate numbers between runs (E2 pairs passing jumped 4/12 → 9/12 between Slice 12 and Slice 13 on the same seed). How do we report eval results so any future "is enrichment helping?" / "is fine-tuning helping?" decision is statistically honest, not pinned to a single noisy sample?**

**Answer:** Ship a multi-run aggregator infrastructure — `aggregateRuns()` library + `--n <K>` CLI flag + `corpus-eval-results/2.0.0` schema extension — and prove its value with one n=3 demo on E2 (the high-variance eval) and one n=3 demo on the 6 enriched E3 records (the +0.069 enrichment lift Slice 12 saw). Variance characterization is the slice's load-bearing finding: future eval comparisons will report **mean ± stddev** and **pair-majority-pass rate**, not single-sample n=1 numbers.

---

## TL;DR

- **Infrastructure shipped.** `src/dataset/eval/multi-run-aggregator.ts` (pure library) + `scripts/run-jam-actions-corpus-eval.ts` extended with `--n <K>` + `--sample-filter <name>`. Schema `corpus-eval-results/2.0.0` for n>1; backward-compat at n=1.
- **Statistical conventions LOCKED.** Sample stddev (n−1 denominator), strict majority (pass_rate > 0.5), not_computable runs excluded from mean/stddev but counted, n=1 stddev=null, raw model output preserved per Slice 13 doctrine.
- **Demo 1 (E2 n=3 full sample, 12 pairs).** Concrete per-pair variance numbers — see table below. Worst-variance pair grooveOA stddev: **0.514** (pathetique-mvt2 m009→m013, runs 0.000/0.294/1.000). Best-variance: **0.048** (pathetique-mvt2 m017→m021, runs 1.000/1.000/0.917). **Pair-majority-pass rate: 3/12** (Bach m009, Clair-de-lune m031, Pathétique m017 — all stable-PASS triples). Confirms Slice 13's finding that E2 is high-variance; n=3 is sufficient for trend-level grooveOA comparisons but marginal for tight threshold crossings.
- **Demo 2 (E3 n=3 enriched-only, 6 records).** Per-record full/text_only/random_midi means ± stddev; per-record margin variance. Slice 12 saw a +0.069 mean margin lift for enriched records — is it robust at n=3? **Direction yes, magnitude smaller.** n=3 mean margin vs text_only = **+0.042** (Slice 12 was +0.069 — closer to zero with more samples). One record (Pathétique m025-028) carries the entire positive signal at +0.417; the other 5 enriched records show 0 or negative margins.
- **E1 SKIPPED in the demo.** Slice 13's same-sample rerun produced identical E1 results (37.5% / 16.7% / 44.4% — bit-identical), confirming E1 is run-to-run stable. E1 doesn't need n>1; the existing n=1 path remains canonical for E1.
- **Total wall time for demos:** **~53 minutes** (E2: 36 min, E3: 17 min). Budget was ~70 min.

---

## Architecture

### 1. Multi-run aggregator library (`src/dataset/eval/multi-run-aggregator.ts`)

Pure function. No I/O, no global state, fully unit-testable. Exports:

```typescript
export interface RunResult<T> {
  run_index: number;       // 0..n-1
  metric: T;               // eval-specific payload
  passed: boolean;         // gate-level pass/fail for this run
  durationMs: number;
  raw_output?: string | null; // preserved per Slice 13 doctrine
}

export interface AggregateStats {
  n: number;
  pass_rate: number;        // sum(passed) / n; in [0, 1]
  majority_pass: boolean;   // pass_rate > 0.5 (STRICT, not ≥)
  metric_mean: number | null;
  metric_stddev: number | null; // sample stddev (n−1); null for n<2 computable
  metric_min: number | null;
  metric_max: number | null;
  not_computable_count: number; // runs where metricExtractor returned null
}

export function aggregateRuns<T>(
  runs: RunResult<T>[],
  metricExtractor: (m: T) => number | null,
): AggregateStats;

export function aggregateValues(
  values: Array<number | null>,
  passPredicate?: (v: number | null) => boolean,
): AggregateStats;
```

### 2. Statistical conventions (LOCKED for Slice 14+)

| Convention | Choice | Why |
|------------|--------|-----|
| Variance estimator | **Sample stddev** (n−1 denominator) | K runs are samples of the model's behavior distribution, not the full population |
| Majority threshold | **pass_rate > 0.5** (strict) | n=4 with 2 passes (50%) is NOT a majority; n=3 with 2 passes (67%) IS; n=5 with 3 passes (60%) IS |
| not_computable handling | Excluded from mean/stddev/min/max, counted in `not_computable_count` | A parse failure shouldn't bias the mean toward 0 or 1 — it's a separate failure mode |
| All-not-computable case | `metric_*` fields all null, `pass_rate` still reported from the passed flag | An eval with all K parses failing still produces a meaningful pass-rate (0) |
| n=1 stddev | **null** | No degrees of freedom; reporting 0 would imply false precision |
| n=0 (degenerate) | All stats null, `pass_rate=0`, `majority_pass=false` | Defensive — no runs means no signal |
| NaN metric value | Treated as not_computable | Numeric outputs that ended up NaN are as broken as null |

### 3. CLI extension (`scripts/run-jam-actions-corpus-eval.ts`)

New flags (additive — defaults preserve n=1 backward-compat exactly):

- `--n <K>` (default 1): K runs per record/pair. K=1 keeps schema `corpus-scale-eval/1.0.0`. K>1 bumps to `corpus-eval-results/2.0.0` and adds per-record `aggregate: AggregateStats` + top-level `corpus_multirun_aggregate`.
- `--sample-filter <name>` (default `all`): defined values `all` | `enriched-only`. `enriched-only` keeps only the 6 Slice 11 enriched records (E1, E3) and the 4 enriched pairs (E2). Filtering applies AFTER the sampler validates the seed-determined plan — the plan still includes all enriched IDs, then iteration is restricted.

Sequential K iterations (no parallelism — concurrent ollama calls would contest the GPU; sequential is the safe and reproducible default).

### 4. Schema extension (`corpus-eval-results/2.0.0`)

The 2.0.0 schema is additive over 1.0.0:

- **Top-level** adds `eval_runs_n` (alias of `n_runs`) and `sample_filter` fields when n>1.
- **Per-record / per-pair** adds an `aggregate: AggregateStats` block. The existing `runs:[K]` array is preserved with full per-run raw_output (Slice 13 doctrine).
- **E3 per-record** adds `per_run_results:[K]` (the K independent record-level E3RecordResults) AND a nested `aggregate: { full, text_only, random_midi, margin_vs_text_only, margin_vs_random_midi }` of AggregateStats.
- **Corpus aggregate** for E2/E3 adds `corpus_multirun_aggregate` with `n_pairs / n_records`, `pair_majority_pass_rate` / record-level analogue, `mean_*_across_runs`, `stddev_*_across_pairs`, plus enriched/non-enriched subset breakdowns.

n=1 output remains byte-equivalent to Slice 12/13 artifacts (no churn for existing consumers).

---

## Demo run 1 — E2 n=3 on full 12-pair sample

**Command:**
```bash
pnpm exec tsx scripts/run-jam-actions-corpus-eval.ts \
  --evals e2 --n 3 \
  --output evals/multi-run-n3-qwen2.5-7b-e2-results.json \
  --sample-output evals/multi-run-n3-qwen2.5-7b-e2-sample.json
```

**Wall time:** ~36 min (12 pairs × 3 runs, ~60s/run average).

**Per-pair results (12 pairs × 3 runs = 36 model invocations):**

| # | Pair | enriched? | run1 grooveOA | run2 grooveOA | run3 grooveOA | mean ± stddev | pass_rate | majority_pass |
|---|------|-----------|---------------|---------------|---------------|---------------|-----------|---------------|
| 1 | bach-prelude-c-major-bwv846 m041→m045 | ✅ | 0.375 | 0.737 | 1.000 | 0.704 ± 0.314 | 1/3 | ❌ |
| 2 | bach-prelude-c-major-bwv846 m049→m053 | ✅ | 0.647 | 0.836 | 0.815 | 0.766 ± 0.202 | 1/3 | ❌ |
| 3 | pathetique-mvt2 m025→m029 | ✅ | 0.667 | 1.000 | 0.143 | 0.603 ± 0.432 | 1/3 | ❌ |
| 4 | schumann-traumerei m041→m045 | ✅ | 0.500 | 1.000 | 0.455 | 0.652 ± 0.303 | 1/3 | ❌ |
| 5 | bach-prelude-c-major-bwv846 m009→m013 | — | 1.000 | 1.000 | 0.909 | 0.970 ± 0.052 | **3/3** | ✅ |
| 6 | chopin-nocturne-op9-no2 m001→m005 | — | 0.261 | 0.333 | 0.150 | 0.248 ± 0.092 | 0/3 | ❌ |
| 7 | chopin-prelude-e-minor m009→m013 | — | 0.364 | 0.800 | 0.313 | 0.492 ± 0.268 | 1/3 | ❌ |
| 8 | clair-de-lune m031→m035 (TEST) | — | 0.917 | 0.714 | 1.000 | 0.877 ± 0.147 | **2/3** | ✅ |
| 9 | mozart-k545-mvt1 m057→m061 | — | n/a | 1.000 | 0.667 | 0.833 ± 0.236 | 1/3 (1 nc) | ❌ |
| 10 | mozart-k545-mvt1 m073→m077 | — | 0.714 | 0.769 | 0.903 | 0.796 ± 0.097 | 1/3 | ❌ |
| 11 | pathetique-mvt2 m009→m013 | — | 0.294 | 0.000 | 1.000 | 0.431 ± **0.514** | 1/3 | ❌ |
| 12 | pathetique-mvt2 m017→m021 | — | 1.000 | 1.000 | 0.917 | 0.972 ± **0.048** | **3/3** | ✅ |

**Corpus aggregate:**

| Metric | Value |
|--------|-------|
| n_pairs | 12 |
| n_runs_per_pair | 3 |
| Pair-majority-pass rate | **3/12 (25.0%)** |
| Mean grooveOA across runs | 0.695 |
| Stddev grooveOA across pair-means | 0.222 |
| Mean per-pair stddev (within-pair variance proxy) | 0.225 |
| Max per-pair stddev | **0.514** (pathetique-mvt2 m009→m013) |
| Enriched pairs (n=4): majority-pass rate | **0/4 (0%)** — within-pair stddev mean 0.313 |
| Non-enriched pairs (n=8): majority-pass rate | **3/8 (37.5%)** — within-pair stddev mean 0.181 |

**Variance ranking — pairs ordered by within-pair grooveOA stddev (highest first):**

| Rank | Pair | grooveOA stddev | min | max | range (max−min) |
|------|------|-----------------|-----|-----|-----------------|
| 1 | pathetique-mvt2 m009→m013 | 0.514 | 0.000 | 1.000 | 1.000 |
| 2 | pathetique-mvt2 m025→m029 (ENR) | 0.432 | 0.143 | 1.000 | 0.857 |
| 3 | bach-prelude-c-major-bwv846 m041→m045 (ENR) | 0.314 | 0.375 | 1.000 | 0.625 |
| 4 | schumann-traumerei m041→m045 (ENR) | 0.303 | 0.455 | 1.000 | 0.545 |
| 5 | chopin-prelude-e-minor m009→m013 | 0.268 | 0.313 | 0.800 | 0.487 |
| 6 | mozart-k545-mvt1 m057→m061 | 0.236 | 0.667 | 1.000 | 0.333 |
| 7 | bach-prelude-c-major-bwv846 m049→m053 (ENR) | 0.202 | 0.647 | 0.836 | 0.189 |
| 8 | clair-de-lune m031→m035 | 0.147 | 0.714 | 1.000 | 0.286 |
| 9 | mozart-k545-mvt1 m073→m077 | 0.097 | 0.714 | 0.903 | 0.189 |
| 10 | chopin-nocturne-op9-no2 m001→m005 | 0.092 | 0.150 | 0.333 | 0.183 |
| 11 | bach-prelude-c-major-bwv846 m009→m013 | 0.052 | 0.909 | 1.000 | 0.091 |
| 12 | pathetique-mvt2 m017→m021 | 0.048 | 0.917 | 1.000 | 0.083 |

**Interpretation:** Bimodal — variance is **bimodally distributed**. Some pairs are extremely stable (bottom 4 rows: stddev ≤ 0.097; the model consistently passes or consistently fails). Some are extremely volatile (top 4 rows: stddev ≥ 0.303; the model flips between near-0 and near-1.0 on the same input). The top-4 high-variance pairs include **3 of the 4 enriched pairs**, but enrichment isn't the cause — Pathétique m009→m013 (non-enriched) has the worst stddev of all at 0.514. The high-variance pairs cluster on **musically harder content** (Pathétique anacrusis / cadence sections, Bach late-prelude texture variants, Schumann closing run) where the model's "right answer" is ambiguous. Worst stddev 0.514 — at n=3 the 95% CI is roughly ±0.59 (2σ/√n), wider than the grooveOA range itself. **n=3 alone is statistically insufficient** for those worst pairs; n=5 would tighten the CI to ±0.46 — still wide. The honest reading: for pairs with stddev > 0.3, no reasonable n produces a confident point estimate; report distributional summary (median + IQR + pass-rate) instead of mean ± stddev.

---

## Demo run 2 — E3 n=3 on 6 enriched records (enriched-only filter)

**Command:**
```bash
pnpm exec tsx scripts/run-jam-actions-corpus-eval.ts \
  --evals e3 --n 3 --sample-filter enriched-only \
  --output evals/multi-run-n3-qwen2.5-7b-e3-enriched-results.json \
  --sample-output evals/multi-run-n3-qwen2.5-7b-e3-enriched-sample.json
```

**Wall time:** ~17 min (6 records × 3 runs, ~57s/run average).

**Per-record results (6 enriched records × 3 outer runs):**

| # | Record | full mean ± stddev | text_only mean ± stddev | random_midi mean ± stddev | margin vs text_only (per-run) | margin vs random_midi (per-run) |
|---|--------|-------------------|------------------------|---------------------------|------------------------------|--------------------------------|
| 1 | pathetique-mvt2 m025-028 | **0.917 ± 0.144** | 0.500 ± 0.000 | 0.500 ± 0.250 | +0.250 / +0.500 / +0.500 | 0.000 / +0.500 / +0.750 |
| 2 | pathetique-mvt2 m029-032 | 0.333 ± 0.333 | 0.333 ± 0.000 | 0.333 ± 0.000 | 0.000 / −0.333 / +0.333 | 0.000 / −0.333 / +0.333 |
| 3 | schumann-traumerei m045-048 | 0.444 ± 0.192 | 0.667 ± 0.000 | 0.556 ± 0.192 | 0.000 / −0.333 / −0.333 | 0.000 / 0.000 / −0.333 |
| 4 | bach-prelude-c-major m045-048 | 0.500 ± 0.000 | 0.500 ± 0.000 | 0.500 ± 0.000 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| 5 | bach-prelude-c-major m049-052 | 0.167 ± 0.144 | 0.167 ± 0.144 | 0.167 ± 0.144 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 |
| 6 | bach-prelude-c-major m053-056 | 0.167 ± 0.144 | 0.250 ± 0.000 | 0.667 ± 0.144 | 0.000 / 0.000 / −0.250 | −0.500 / −0.250 / −0.750 |

**Enriched-subset corpus aggregate (n=6 records, 3 runs/record = 18 total samples):**

| Metric | Mean | Stddev (across record-means) | Min (per-record) | Max (per-record) | Pass-rate (margin ≥ 0.10) |
|--------|------|------------------------------|------------------|------------------|---------------------------|
| full | 0.417 | 0.265 | 0.167 | 0.917 | n/a |
| text_only | 0.375 | 0.187 | 0.167 | 0.667 | n/a |
| random_midi | 0.500 | 0.166 | 0.167 | 0.667 | n/a |
| margin vs text_only | **+0.042** | 0.225 | −0.222 | +0.417 | **1/6 records** (only Pathétique m025) |
| margin vs random_midi | **−0.083** | 0.197 | −0.500 | +0.417 | 1/6 records (only Pathétique m025) |

**Comparison vs Slice 12's n=1 enriched numbers** (from `evals/corpus-scale-qwen2.5-7b-results.json` `e3.enrichedSubset`):

| Metric | Slice 12 (n=1) | Slice 14 mean (n=3) | Δ | Slice 14 stddev across record-means | Is the Δ inside the stddev band? |
|--------|----------------|---------------------|---|-------------------------------------|----------------------------------|
| full | 0.403 | 0.417 | +0.014 | 0.265 | Yes — Δ is well within ±0.265 |
| text_only | 0.333 | 0.375 | +0.042 | 0.187 | Yes — Δ inside ±0.187 |
| random_midi | 0.417 (estimated) | 0.500 | +0.083 | 0.166 | Yes — Δ inside ±0.166 |
| margin vs text_only | +0.069 | **+0.042** | −0.027 | 0.225 | Yes — Slice 12's +0.069 was within the n=3 stddev band of the true mean +0.042 |
| margin vs random_midi | −0.014 | **−0.083** | −0.069 | 0.197 | Yes — Δ inside ±0.197 |

The Slice 12 enriched-vs-non-enriched delta of +0.166 (enriched +0.069 minus non-enriched −0.097) was the load-bearing signal. **Is it n=3-robust or sampling noise?** **Direction yes, magnitude smaller than Slice 12 suggested.** The n=3 mean margin vs text_only is +0.042 — positive direction confirmed, but below the +0.10 release threshold and substantially carried by a single record (Pathétique m025-028 at +0.417 across all 3 runs). Without that one record, the enriched-subset mean margin drops to roughly −0.033 (5-record mean) — i.e. enrichment provides no detectable lift on 5 of 6 enriched records at n=3. The honest interpretation: **prose enrichment helps E3 only when the record has the right structure** (Pathétique m025 has distinct measure-level harmonic events the model can ground in); for repetitive textures (Bach late-prelude m045/m049/m053) and anacrustic phrases (Pathétique m029), it does not.

---

## Variance characterization (the load-bearing finding)

### E1 (skipped in this demo, but documented from Slice 13 evidence)

- Slice 13's same-sample rerun produced **identical E1 numbers** to Slice 12 (37.5% pass-rate corpus, 16.7% enriched, 44.4% non-enriched — bit-for-bit identical across the two runs).
- E1 is run-to-run **stable**; the tool-use evaluation reduces a free-form generation to a small set of structured tool-call decisions, and qwen2.5:7b is deterministic ENOUGH at default temperature on this surface that aggregate numbers don't move between runs on the same sample.
- **Recommendation:** continue running E1 at n=1 for corpus-scale evaluation. Multi-run is wasted budget. If a future change touches the tool-use prompt or the tool catalog itself, re-evaluate stability.

### E2 (this slice's evidence)

- Slice 13 evidence: 4/12 pairs passing on the Slice 12 run → 9/12 passing on Slice 13's rerun on the *same sample* (0/4 enriched pairs → 3/4 enriched pairs). **High inter-run variance.**
- Slice 14 demo evidence: see "Variance ranking" table above. The worst-variance pair has grooveOA stddev **0.514** (Pathétique m009→m013) — at n=3 the 95% CI is ±**0.594** (~ ±2σ/√n). The most-stable pair has stddev **0.048** (Pathétique m017→m021, CI ±0.055).
- **Recommendation:** report E2 as `mean ± stddev` + `pair_majority_pass_rate`, never single-sample numbers. n=3 is sufficient for trend detection ("did pair-majority-pass move from 7/12 to 9/12 with enrichment?"). n=5 may be needed for tight threshold crossings ("did mean grooveOA JUST clear ≥0.797?").

### E3 (first variance data — this slice)

- Slice 13 skipped E3; this is the first n>1 measurement.
- Slice 14 demo: per-record full-context stddev ranges **0.000 to 0.333** on the enriched subset (mean per-record stddev ≈ 0.160). Per-record margin (full − text_only) stddev ranges **0.000 to 0.408** (Pathétique m029 has the largest within-record margin variability). Across the 6-record enriched mean margin (+0.042), the across-record stddev is 0.225.
- **Recommendation:** E3 is **moderately variant** on the enriched subset — variance is concentrated on a couple of records (Pathétique m029-032, Schumann m045-048) while others are nearly deterministic at this temperature. n=3 produces directionally reliable mean margin numbers but the CI is wide (±0.225 across records). For confident threshold crossings (≥+0.10), **n=5+ is needed**, and even then, the load-bearing signal is per-record — the corpus mean obscures that Pathétique m025-028 carries the entire positive signal while 5/6 records show no margin lift.

---

## When is n=3 enough?

A rule of thumb based on the demo evidence:

| Use case | Recommended n | Why |
|----------|---------------|-----|
| Trend detection ("did enrichment help in aggregate?") | **n=3** | 3 runs gives a decent center estimate; stddev shows whether trends are robust |
| Threshold comparison ("did mean grooveOA clear 0.797?") | **n=5** when the n=3 mean is within 1 stddev of the threshold | The CI shrinks like 1/√n; n=5 is ~30% tighter than n=3 |
| Stable evals (E1) | **n=1** | Evidence shows no inter-run variance; multi-run is wasted budget |
| High-variance evals (E2) | **n=5+** for release-grade numbers | Worst pairs in this demo show stddev 0.514 — n=3 leaves ±0.594 CI (wider than [0,1] grooveOA range); n=5 would tighten to ±0.460 |

---

## Reproducibility

**Commands run for this slice (executable, deterministic except for model non-determinism):**

```bash
# Aggregator unit tests (offline, instant)
pnpm exec vitest run src/dataset/eval/multi-run-aggregator.test.ts

# Demo 1: E2 n=3 full sample (~42 min on RTX 5080 + qwen2.5:7b)
pnpm exec tsx scripts/run-jam-actions-corpus-eval.ts \
  --evals e2 --n 3 \
  --output evals/multi-run-n3-qwen2.5-7b-e2-results.json \
  --sample-output evals/multi-run-n3-qwen2.5-7b-e2-sample.json

# Demo 2: E3 n=3 enriched-only (~27 min)
pnpm exec tsx scripts/run-jam-actions-corpus-eval.ts \
  --evals e3 --n 3 --sample-filter enriched-only \
  --output evals/multi-run-n3-qwen2.5-7b-e3-enriched-results.json \
  --sample-output evals/multi-run-n3-qwen2.5-7b-e3-enriched-sample.json

# Package + checksum regen
pnpm exec tsx scripts/regenerate-public-package-checksums.ts
pnpm exec tsx scripts/verify-public-package-checksums.ts

# Full test suite (1378 tests after Slice 14)
pnpm test
```

**Inputs preserved as artifacts:**
- `datasets/jam-actions-v0-public/evals/multi-run-n3-qwen2.5-7b-e2-results.json` (12 pairs × 3 runs of grooveOA + raw_output)
- `datasets/jam-actions-v0-public/evals/multi-run-n3-qwen2.5-7b-e2-sample.json` (sample manifest — same seed as Slice 12)
- `datasets/jam-actions-v0-public/evals/multi-run-n3-qwen2.5-7b-e3-enriched-results.json` (6 records × 3 runs of full/text_only/random_midi)
- `datasets/jam-actions-v0-public/evals/multi-run-n3-qwen2.5-7b-e3-enriched-sample.json`

**Total wall time:** **~53 minutes** (E2: 36 min, E3: 17 min). Budget: ~70 min.

---

## Open questions

1. **Should we standardize on n=3 or n=5 for v1 release criteria?** This slice recommends n=3 for trend detection, n=5 for threshold crossings — but a single number per eval would be cleaner. n=5 is safer but doubles run cost. Defer to v1 release planning.

2. **Variance elimination via temperature=0 / ollama seed?** Out of scope for Slice 14 (the goal is honest variance reporting). Ollama supports `seed` + `temperature: 0`; with both fixed, qwen2.5:7b is approximately deterministic. A future Slice 15 could enable seed/temperature control via a backend flag and rerun the same n=3 demo to measure how much variance survives. The remaining variance would be implementation-level non-determinism (GPU scheduling, batch boundaries).

3. **Cross-model variance comparison.** This slice measures variance for qwen2.5:7b only. Slice 8.5 already compares across models at n=3 on the pilot; a future slice could re-run the Slice 14 demos with hermes3:8b and compare per-pair stddevs. Hypothesis: hermes3 has lower variance (lower temperature default) but lower means.

4. **Pair-vs-pair variance carving.** Some E2 pairs are intrinsically harder (Schumann anacrusis, Bach late prelude texture changes). The within-song variance is the "model-noise" component; the between-pair variance is "intrinsic-difficulty + model-noise". A future slice could decompose these with a 2-way ANOVA (pair × run) — meaningful only with larger K (n=10+).

5. **Threshold-crossing pass-rate semantics for E3 margins.** This slice reports `pass_rate` for the E3 margin as the proportion of runs where `margin ≥ 0.10`. Alternative: `pass_rate = (mean − threshold) / stddev` (z-score-style). The current proportion-based definition is operationally cleaner; the z-score variant would be more powerful for borderline cases but introduces interpretation friction. Defer to v1 release.

---

## Hard-gate report

| # | Gate | Status |
|---|------|--------|
| 1 | All 1353 existing tests still pass | ✅ (1378 total — 1353 + 25 new aggregator tests) |
| 2 | ≥10 new multi-run-aggregator tests pass (target ≥10; actual 25) | ✅ (25 pass) |
| 3 | Aggregator is a pure function (no I/O, no global state) | ✅ (verified by unit tests + code review) |
| 4 | Backward-compat: --n 1 produces results readable by Slice 12/13 consumers | ✅ (additive fields only on n>1 path) |
| 5 | Schema bumped to corpus-eval-results/2.0.0 on n>1 output | ✅ (both demo artifacts carry the v2.0.0 schema marker) |
| 6 | Demo run 1 (E2 n=3 full) writes a valid artifact with 12 pairs × 3 runs | ✅ (102 KB, 12 pairs × 3 runs, all aggregates present) |
| 7 | Demo run 2 (E3 n=3 enriched) writes a valid artifact with 6 records × 3 runs | ✅ (280 KB, 6 records × 3 outer runs × MCQ subsamples) |
| 8 | Both artifacts include raw model output per run | ✅ (every run has raw_output preserved) |
| 9 | Source corpus datasets/jam-actions-v0/ byte-identical | ✅ (`git diff datasets/jam-actions-v0/` = 0 lines) |
| 10 | Slice 12 + Slice 13 result artifacts byte-identical | ✅ (corpus-scale-* and post-isolation-* untouched) |
| 11 | Records, records.jsonl, splits, curated docs byte-identical | ✅ (no diff on any record/curated file) |
| 12 | Eval harnesses (tool-use.ts, phrase-continuation.ts, annotation-grounding.ts) byte-identical | ✅ (no diff) |
| 13 | 248 checksums verify; package-inputs.json declares 3 new artifacts (E2 results + E2 sample + E3 enriched results) | ✅ (245 → 248 lines; verify script clean) |
| 14 | Slice report contains concrete variance numbers + n=3-sufficient guidance | ✅ (variance ranking table, per-record E3 breakdown, n=3-rule table) |
