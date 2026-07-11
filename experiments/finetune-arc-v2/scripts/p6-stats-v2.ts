#!/usr/bin/env tsx
// ─── p6-stats-v2.ts — Finetune Arc v2 (B-1): the preregistered confirmatory stats ──
//
// P0-LOCK.md §6. Machinery inherited from v1's p6-stats-v1.ts; arms re-pointed:
//
//   PRIMARY (carries the claim): frozen v1-FT (5-seed all-seeds mean) vs the
//     NEW sealed baseline (b1-baseline-results.json), paired by recordId on
//     tool_inspected, over the 36-record B-1 cohort. Victory bar: the frozen
//     exact-number table in data/b1-cohort.json (two-sided sign test α=0.05
//     at the OBSERVED effective n = 36 − ties). No post-hoc thresholds.
//
//   Strata reported unpooled alongside: CL (12 clair-de-lune, never trained),
//     LG (15 sealed-history train records), NW (9 seeded-blind new records).
//
// RNG mulberry32 seed 20260713 (v2's own; v1 used 20260711). 10k/10k.
//
// Usage:
//   pnpm exec tsx experiments/finetune-arc-v2/scripts/p6-stats-v2.ts \
//     --baseline experiments/finetune-arc-v2/evals/b1-baseline-results.json \
//     --seed experiments/finetune-arc-v2/evals/b1-seed13-results.json [--seed ...x5] \
//     --cohort experiments/finetune-arc-v2/data/b1-cohort.json \
//     --out experiments/finetune-arc-v2/evals/b1-stats.json
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from "node:fs";

const CONDITIONS = ["tool_inspected", "full", "text_only", "random_midi"] as const;
type Condition = (typeof CONDITIONS)[number];
const PRIMARY: Condition = "tool_inspected";
const SECONDARY: Condition = "full";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const RNG_SEED = 20260713;
const N_BOOT = 10000;
const N_PERM = 10000;
const EPS = 1e-12;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function quantile(sorted: number[], q: number): number {
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function bootstrapCI(deltas: number[], rng: () => number): [number, number] {
  const means: number[] = [];
  for (let b = 0; b < N_BOOT; b++) {
    const sample: number[] = [];
    for (let i = 0; i < deltas.length; i++) sample.push(deltas[Math.floor(rng() * deltas.length)]);
    means.push(mean(sample));
  }
  means.sort((a, b) => a - b);
  return [quantile(means, 0.025), quantile(means, 0.975)];
}

function clusterBootstrapCI(
  points: Array<{ cluster: string; delta: number }>,
  rng: () => number,
): [number, number] {
  const clusters = [...new Set(points.map((p) => p.cluster))];
  const byCluster = new Map(
    clusters.map((c) => [c, points.filter((p) => p.cluster === c).map((p) => p.delta)]),
  );
  const means: number[] = [];
  for (let b = 0; b < N_BOOT; b++) {
    const sample: number[] = [];
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[Math.floor(rng() * clusters.length)];
      sample.push(...(byCluster.get(c) ?? []));
    }
    means.push(mean(sample));
  }
  means.sort((a, b) => a - b);
  return [quantile(means, 0.025), quantile(means, 0.975)];
}

function permutationP(deltas: number[], rng: () => number): number {
  const observed = Math.abs(mean(deltas));
  let extreme = 0;
  for (let p = 0; p < N_PERM; p++) {
    const flipped = deltas.map((d) => (rng() < 0.5 ? -d : d));
    if (Math.abs(mean(flipped)) >= observed - EPS) extreme++;
  }
  return (extreme + 1) / (N_PERM + 1);
}

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

function signTestP(deltas: number[]): { wins: number; losses: number; ties: number; p: number } {
  const wins = deltas.filter((d) => d > EPS).length;
  const losses = deltas.filter((d) => d < -EPS).length;
  const ties = deltas.length - wins - losses;
  const n = wins + losses;
  if (n === 0) return { wins, losses, ties, p: 1 };
  const k = Math.max(wins, losses);
  let tail = 0;
  for (let i = k; i <= n; i++) tail += binom(n, i);
  return { wins, losses, ties, p: Math.min(1, (2 * tail) / 2 ** n) };
}

// ─── CLI + artifacts ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let baselinePath = "";
const seedPaths: string[] = [];
let cohortPath = "";
let outPath = "";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--baseline") baselinePath = args[++i];
  else if (args[i] === "--seed") seedPaths.push(args[++i]);
  else if (args[i] === "--cohort") cohortPath = args[++i];
  else if (args[i] === "--out") outPath = args[++i];
}
if (!baselinePath || seedPaths.length !== 5 || !cohortPath || !outPath) {
  console.error(
    "usage: p6-stats-v2.ts --baseline <b1-baseline.json> --seed <b1-seedK.json> (x5) --cohort <b1-cohort.json> --out <report.json>",
  );
  process.exit(1);
}

interface RawArtifact {
  label: string;
  e3ByRecord: Map<string, { aggregate: Record<string, { metric_mean: number }> }>;
  toolByRecord: Map<string, { tool_inspected_mean: number }>;
}

function loadRaw(path: string, label: string): RawArtifact {
  const j = JSON.parse(readFileSync(path, "utf8"));
  return {
    label,
    e3ByRecord: new Map(
      (j.results.e3?.records ?? []).map((r: { recordId: string }) => [r.recordId, r]),
    ),
    toolByRecord: new Map(
      (j.results["e3-tool"]?.records ?? []).map((r: { recordId: string }) => [r.recordId, r]),
    ),
  };
}

const baseline = loadRaw(baselinePath, "baseline");
const seedArts = seedPaths.map((p) => {
  const m = /seed(\d+)/.exec(p);
  if (!m) {
    console.error(`ANDON: cannot derive seed label from path ${p}`);
    process.exit(1);
  }
  return loadRaw(p, `seed${m[1]}`);
});

const cohortReceipt = JSON.parse(readFileSync(cohortPath, "utf8")) as {
  strata: { CL: string[]; LG: string[]; NW: string[] };
  cohort_sorted: string[];
  victory_bar: { table: Array<{ n_eff: number; victory_bar_wins: number }> };
};
const strataOf = new Map<string, "CL" | "LG" | "NW">();
for (const s of ["CL", "LG", "NW"] as const)
  for (const id of cohortReceipt.strata[s]) strataOf.set(id, s);
const COHORT = cohortReceipt.cohort_sorted;
if (COHORT.length !== 36) {
  console.error(`ANDON: cohort receipt has ${COHORT.length} records, expected 36`);
  process.exit(1);
}

// ─── Per-record points ────────────────────────────────────────────────────────

interface RecordPoint {
  recordId: string;
  song: string;
  b1Stratum: "CL" | "LG" | "NW";
  baseline: Record<string, number>;
  ft: Record<string, number>;
  ftPerSeed: Record<string, Record<string, number>>;
}

function condVector(art: RawArtifact, recordId: string): Record<string, number> {
  const e3 = art.e3ByRecord.get(recordId);
  const tool = art.toolByRecord.get(recordId);
  if (!e3 || !tool) {
    console.error(`ANDON: ${art.label} missing cohort record ${recordId}`);
    process.exit(1);
  }
  return {
    full: e3.aggregate.full.metric_mean,
    text_only: e3.aggregate.text_only.metric_mean,
    random_midi: e3.aggregate.random_midi.metric_mean,
    tool_inspected: tool.tool_inspected_mean,
  };
}

const points: RecordPoint[] = COHORT.map((recordId) => {
  const perSeed: Record<string, Record<string, number>> = {};
  for (const a of seedArts) perSeed[a.label] = condVector(a, recordId);
  const ft: Record<string, number> = {};
  for (const c of CONDITIONS) ft[c] = mean(seedArts.map((a) => perSeed[a.label][c]));
  return {
    recordId,
    song: recordId.split(":")[0],
    b1Stratum: strataOf.get(recordId)!,
    baseline: condVector(baseline, recordId),
    ft,
    ftPerSeed: perSeed,
  };
});

// ─── Comparison machinery ─────────────────────────────────────────────────────

function comparison(subset: RecordPoint[]) {
  function condStats(cond: Condition) {
    const deltas = subset.map((p) => p.ft[cond] - p.baseline[cond]);
    const rng1 = mulberry32(RNG_SEED);
    const rng2 = mulberry32(RNG_SEED + 1);
    const rng3 = mulberry32(RNG_SEED + 2);
    const sign = signTestP(deltas);
    return {
      n: subset.length,
      baseline_mean: mean(subset.map((p) => p.baseline[cond])),
      ft_mean: mean(subset.map((p) => p.ft[cond])),
      mean_delta: mean(deltas),
      bootstrap_ci95_records: bootstrapCI(deltas, rng1),
      bootstrap_ci95_song_clusters: clusterBootstrapCI(
        subset.map((p) => ({ cluster: p.song, delta: p.ft[cond] - p.baseline[cond] })),
        rng2,
      ),
      permutation_p_two_sided: permutationP(deltas, rng3),
      paired: sign,
    };
  }
  return {
    primary: { condition: PRIMARY, ...condStats(PRIMARY) },
    secondary: { condition: SECONDARY, ...condStats(SECONDARY) },
    controls: { text_only: condStats("text_only"), random_midi: condStats("random_midi") },
  };
}

const pooled = comparison(points);
const byStratum = Object.fromEntries(
  (["CL", "LG", "NW"] as const).map((s) => [
    s,
    comparison(points.filter((p) => p.b1Stratum === s)).primary,
  ]),
);

// ─── The frozen victory bar at the OBSERVED effective n ─────────────────────

const primarySign = pooled.primary.paired;
const nEff = primarySign.wins + primarySign.losses;
const barRow = cohortReceipt.victory_bar.table.find((t) => t.n_eff === nEff);
if (!barRow) {
  console.error(
    `ANDON: observed n_eff=${nEff} is outside the frozen victory-bar table (24..36) — report as-is per lock, no improvisation`,
  );
  process.exit(1);
}
const victory = primarySign.wins >= barRow.victory_bar_wins && pooled.primary.mean_delta > 0;

const verdictWording = victory
  ? "powered win — the jam-actions v1 recipe trains a model that beats the prompted baseline at tool-grounded musical QA on a preregistered 36-record cohort dominated by held-out material (P7-class DIRECTOR gate opens; nothing publishes without the explicit yes)"
  : pooled.primary.mean_delta > 0
    ? "directionally better, underpowered — twice, honestly"
    : "not better than the prompted baseline on the primary condition at n=36";

// ─── Report ───────────────────────────────────────────────────────────────────

const report = {
  schema: "finetune-arc-v2-b1-stats/1.0.0",
  phase: "P3-v2",
  baseline_artifact: baselinePath,
  seed_artifacts: seedPaths,
  seeds: seedArts.map((a) => a.label),
  cohort_receipt: cohortPath,
  n_records: points.length,
  rng: { algorithm: "mulberry32", seed: RNG_SEED, n_boot: N_BOOT, n_perm: N_PERM },
  primary_condition: PRIMARY,
  pooled_comparison_ft_vs_new_baseline: pooled,
  strata_primary_unpooled: byStratum,
  honesty_rule: {
    victory_bar_rule:
      "wins >= k*(n_eff) on the primary, n_eff = 36 - ties, exact two-sided sign test alpha=0.05; table frozen in data/b1-cohort.json BEFORE any model call",
    observed_n_eff: nEff,
    victory_bar_at_observed_n_eff: barRow.victory_bar_wins,
    paired_wins_observed: primarySign.wins,
    ties: primarySign.ties,
    victory,
    verdict_wording: verdictWording,
    best_of_seeds_used: false,
    cluster_caveat:
      "36 records from 8 songs; record-level tests assume record independence — song-cluster bootstrap reported alongside; strata reported unpooled",
  },
  diagnostic_lg_continuity: {
    note: "descriptive only, no claim: LG-15 win pattern vs v1's 11/15 (1t) on the same records under the OLD (v0.4.3-measured) baseline",
    lg_wins: byStratum.LG.paired,
  },
  per_record: points.map((p) => ({
    recordId: p.recordId,
    song: p.song,
    b1_stratum: p.b1Stratum,
    baseline: p.baseline,
    ft_all_seeds_mean: p.ft,
    ft_per_seed: p.ftPerSeed,
    delta: Object.fromEntries(CONDITIONS.map((c) => [c, p.ft[c] - p.baseline[c]])),
    primary_win: p.ft[PRIMARY] - p.baseline[PRIMARY] > EPS,
  })),
};

writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(`B-1 stats -> ${outPath}`);
const pr = pooled.primary;
console.log(
  `PRIMARY ft(frozen v1) vs NEW baseline (${PRIMARY}): ${pr.baseline_mean.toFixed(3)} -> ${pr.ft_mean.toFixed(3)} | Δ ${pr.mean_delta >= 0 ? "+" : ""}${pr.mean_delta.toFixed(3)} | wins ${pr.paired.wins}/${points.length} (ties ${pr.paired.ties}) | bar ${barRow.victory_bar_wins}/${nEff} | perm p=${pr.permutation_p_two_sided.toFixed(4)}`,
);
for (const s of ["CL", "LG", "NW"] as const) {
  const st = byStratum[s];
  console.log(
    `  ${s} (n=${st.n}): Δ ${st.mean_delta >= 0 ? "+" : ""}${st.mean_delta.toFixed(3)} | wins ${st.paired.wins}/${st.n} (ties ${st.paired.ties})`,
  );
}
console.log(`VERDICT: ${verdictWording}`);
