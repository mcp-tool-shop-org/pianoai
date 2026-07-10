#!/usr/bin/env tsx
// ─── p6-stats.ts — Finetune Arc P6: paired stats vs the sealed baseline ──────
//
// Inputs:
//   --baseline datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json
//   --ft experiments/finetune-arc/evals/ft-seed13-results.json (repeatable)
//
// The finetuned artifacts are raw corpus-eval outputs (schema 2.0.0, --n 3,
// --evals e3,e3-tool, slice19-cohort). Per-record condition means are
// extracted EXACTLY the way build-slice21-unified-baseline.mjs extracted the
// schumann rerun: e3 records -> aggregate.{full,text_only,random_midi}
// .metric_mean; e3-tool records -> tool_inspected_mean.
//
// Statistics (P0-LOCK.md §9): per-record paired deltas (all-seeds mean),
// paired wins, seeded bootstrap 95% CI (10k, record resample + song-cluster
// resample), paired sign-flip permutation test (10k), honesty rule:
// victory wording requires ≥13/16 paired wins (two-sided sign test p<0.05 at
// n=16) on the primary condition; otherwise "directionally better,
// underpowered" (or "no better") is the ONLY permitted claim.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from "node:fs";

interface RecordPoint {
  recordId: string;
  stratum: string;
  enriched: boolean;
  baseline: Record<string, number>;
  perSeed: Record<string, Record<string, number>>; // seed -> condition -> mean
  ft: Record<string, number>; // all-seeds mean per condition
  delta: Record<string, number>;
}

const CONDITIONS = ["tool_inspected", "full", "text_only", "random_midi"] as const;
type Condition = (typeof CONDITIONS)[number];
const PRIMARY: Condition = "tool_inspected";
const SECONDARY: Condition = "full";

// ─── Deterministic RNG (mulberry32) — seeded so the report is replayable ─────
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
const RNG_SEED = 20260710;
const N_BOOT = 10000;
const N_PERM = 10000;

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

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
    for (let i = 0; i < deltas.length; i++) {
      sample.push(deltas[Math.floor(rng() * deltas.length)]);
    }
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

/** Two-sided paired sign-flip permutation p-value for mean(delta) != 0. */
function permutationP(deltas: number[], rng: () => number): number {
  const observed = Math.abs(mean(deltas));
  let extreme = 0;
  for (let p = 0; p < N_PERM; p++) {
    const flipped = deltas.map((d) => (rng() < 0.5 ? -d : d));
    if (Math.abs(mean(flipped)) >= observed - 1e-12) extreme++;
  }
  return (extreme + 1) / (N_PERM + 1);
}

/** Two-sided exact sign test p-value (ties dropped). */
function signTestP(deltas: number[]): { wins: number; losses: number; ties: number; p: number } {
  const wins = deltas.filter((d) => d > 1e-12).length;
  const losses = deltas.filter((d) => d < -1e-12).length;
  const ties = deltas.length - wins - losses;
  const n = wins + losses;
  if (n === 0) return { wins, losses, ties, p: 1 };
  const k = Math.max(wins, losses);
  let tail = 0;
  for (let i = k; i <= n; i++) tail += binom(n, i);
  const p = Math.min(1, (2 * tail) / 2 ** n);
  return { wins, losses, ties, p };
}

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

// ─── Load artifacts ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let baselinePath = "";
const ftPaths: string[] = [];
let outPath = "";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--baseline") baselinePath = args[++i];
  else if (args[i] === "--ft") ftPaths.push(args[++i]);
  else if (args[i] === "--out") outPath = args[++i];
}
if (!baselinePath || ftPaths.length === 0 || !outPath) {
  console.error(
    "usage: p6-stats.ts --baseline <sealed.json> --ft <seed.json> [--ft ...] --out <report.json>",
  );
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const baselineByRecord = new Map<string, Record<string, unknown>>(
  baseline.records.map((r: { recordId: string }) => [r.recordId, r]),
);

interface FtArtifact {
  seed: string;
  e3ByRecord: Map<string, { aggregate: Record<string, { metric_mean: number }> }>;
  toolByRecord: Map<string, { tool_inspected_mean: number }>;
}

const ftArtifacts: FtArtifact[] = ftPaths.map((p) => {
  const j = JSON.parse(readFileSync(p, "utf8"));
  const seedMatch = /seed(\d+)/.exec(p);
  return {
    seed: seedMatch ? `seed${seedMatch[1]}` : p,
    e3ByRecord: new Map(
      (j.results.e3?.records ?? []).map((r: { recordId: string }) => [r.recordId, r]),
    ),
    toolByRecord: new Map(
      (j.results["e3-tool"]?.records ?? []).map((r: { recordId: string }) => [r.recordId, r]),
    ),
  };
});

// ─── Build paired points ──────────────────────────────────────────────────────

const points: RecordPoint[] = [];
for (const [recordId, b] of baselineByRecord) {
  const perSeed: Record<string, Record<string, number>> = {};
  for (const ft of ftArtifacts) {
    const e3 = ft.e3ByRecord.get(recordId);
    const tool = ft.toolByRecord.get(recordId);
    if (!e3 || !tool) {
      console.error(`ANDON: ${ft.seed} missing cohort record ${recordId}`);
      process.exit(1);
    }
    perSeed[ft.seed] = {
      full: e3.aggregate.full.metric_mean,
      text_only: e3.aggregate.text_only.metric_mean,
      random_midi: e3.aggregate.random_midi.metric_mean,
      tool_inspected: tool.tool_inspected_mean,
    };
  }
  const ftMeans: Record<string, number> = {};
  const bl: Record<string, number> = {};
  const delta: Record<string, number> = {};
  for (const c of CONDITIONS) {
    ftMeans[c] = mean(ftArtifacts.map((f) => perSeed[f.seed][c]));
    bl[c] = (b as Record<string, number>)[`${c}_mean`];
    delta[c] = ftMeans[c] - bl[c];
  }
  points.push({
    recordId,
    stratum: (b as { stratum: string }).stratum,
    enriched: (b as { enriched: boolean }).enriched,
    baseline: bl,
    perSeed,
    ft: ftMeans,
    delta,
  });
}
if (points.length !== 16) {
  console.error(`ANDON: expected 16 cohort records, got ${points.length}`);
  process.exit(1);
}

// ─── Statistics per condition ─────────────────────────────────────────────────

function condStats(cond: Condition, subset: RecordPoint[] = points) {
  const deltas = subset.map((p) => p.delta[cond]);
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
      subset.map((p) => ({ cluster: p.stratum, delta: p.delta[cond] })),
      rng2,
    ),
    permutation_p_two_sided: permutationP(deltas, rng3),
    paired: sign,
  };
}

const primary = condStats(PRIMARY);
const secondary = condStats(SECONDARY);

const WINS_BAR = 13; // two-sided sign-test p<0.05 at n=16
const victoryCandidate =
  primary.paired.wins >= WINS_BAR && primary.mean_delta > 0;

const verdictWording = victoryCandidate
  ? "VICTORY-CANDIDATE — paired-wins bar met on the primary condition; the paraphrase-robustness check (L8/finding 25) MUST pass before any victory claim ships"
  : primary.mean_delta > 0
    ? "directionally better, underpowered"
    : primary.mean_delta < 0
      ? "not better than the prompted baseline on the primary condition"
      : "parity";

const seenSongs = points.filter((p) => p.stratum !== "clair-de-lune");
const heldOut = points.filter((p) => p.stratum === "clair-de-lune");

const report = {
  schema: "finetune-arc-p6-stats/1.0.0",
  phase: "P6",
  baseline: baselinePath,
  ft_artifacts: ftPaths,
  seeds: ftArtifacts.map((f) => f.seed),
  n_records: points.length,
  rng: { algorithm: "mulberry32", seed: RNG_SEED, n_boot: N_BOOT, n_perm: N_PERM },
  primary_condition: PRIMARY,
  secondary_condition: SECONDARY,
  stats: {
    primary: { condition: PRIMARY, ...primary },
    secondary: { condition: SECONDARY, ...secondary },
    controls: {
      text_only: condStats("text_only"),
      random_midi: condStats("random_midi"),
    },
    seen_songs_only: { condition: PRIMARY, ...condStats(PRIMARY, seenSongs) },
    held_out_clair_de_lune: {
      condition: PRIMARY,
      n: heldOut.length,
      note: "single record — reported, never pooled silently",
      records: heldOut.map((p) => ({
        recordId: p.recordId,
        baseline: p.baseline,
        ft: p.ft,
        delta: p.delta,
      })),
    },
  },
  honesty_rule: {
    paired_wins_bar: `${WINS_BAR}/16 (two-sided sign test p<0.05)`,
    paired_wins_observed: primary.paired.wins,
    victory_candidate: victoryCandidate,
    verdict_wording: verdictWording,
    best_of_seeds_used: false,
    cluster_caveat:
      "16 records from 5 songs; record-level tests assume record independence — song-cluster bootstrap reported alongside; clair-de-lune stratum is n=1",
  },
  per_record: points.map((p) => ({
    recordId: p.recordId,
    stratum: p.stratum,
    enriched: p.enriched,
    baseline: p.baseline,
    per_seed: p.perSeed,
    ft_all_seeds_mean: p.ft,
    delta: p.delta,
    primary_win: p.delta[PRIMARY] > 1e-12,
  })),
};

writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(`P6 stats -> ${outPath}`);
console.log(
  `PRIMARY (${PRIMARY}): baseline ${primary.baseline_mean.toFixed(3)} -> ft ${primary.ft_mean.toFixed(3)} | Δ ${primary.mean_delta >= 0 ? "+" : ""}${primary.mean_delta.toFixed(3)} | CI95 [${primary.bootstrap_ci95_records.map((x) => x.toFixed(3)).join(", ")}] | wins ${primary.paired.wins}/${points.length} (ties ${primary.paired.ties}) | perm p=${primary.permutation_p_two_sided.toFixed(4)}`,
);
console.log(
  `SECONDARY (${SECONDARY}): Δ ${secondary.mean_delta >= 0 ? "+" : ""}${secondary.mean_delta.toFixed(3)} | wins ${secondary.paired.wins}/${points.length}`,
);
console.log(`VERDICT: ${verdictWording}`);
