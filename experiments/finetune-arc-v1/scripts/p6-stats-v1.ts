#!/usr/bin/env tsx
// ─── p6-stats-v1.ts — Finetune Arc v1 P6: the preregistered THREE-WAY stats ──
//
// P0-LOCK.md §11. Extends v0's p6-stats.ts (machinery identical, RNG seed
// 20260711) to three artifact sets:
//
//   Comparison 1 (PRIMARY, carries the claim): v1-FT (all-seeds mean) vs the
//     sealed prompted baseline — honesty rule verbatim (victory wording needs
//     >=13/16 paired wins on tool_inspected + the paraphrase-robustness check).
//   Comparison 2 (diagnostic, no claim): v1-FT vs v0-FT (frozen artifacts) —
//     did the data pass move the primary, and did text_only recover?
//
// Usage:
//   pnpm exec tsx p6-stats-v1.ts \
//     --baseline datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json \
//     --v0 experiments/finetune-arc/evals/ft-seed13-results.json [--v0 ...x5] \
//     --v1 experiments/finetune-arc-v1/evals/ft-v1-seed13-results.json [--v1 ...x5] \
//     --out experiments/finetune-arc-v1/evals/p6-stats-v1.json
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
const RNG_SEED = 20260711;
const N_BOOT = 10000;
const N_PERM = 10000;

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
    if (Math.abs(mean(flipped)) >= observed - 1e-12) extreme++;
  }
  return (extreme + 1) / (N_PERM + 1);
}

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

function signTestP(deltas: number[]): { wins: number; losses: number; ties: number; p: number } {
  const wins = deltas.filter((d) => d > 1e-12).length;
  const losses = deltas.filter((d) => d < -1e-12).length;
  const ties = deltas.length - wins - losses;
  const n = wins + losses;
  if (n === 0) return { wins, losses, ties, p: 1 };
  const k = Math.max(wins, losses);
  let tail = 0;
  for (let i = k; i <= n; i++) tail += binom(n, i);
  return { wins, losses, ties, p: Math.min(1, (2 * tail) / 2 ** n) };
}

// ─── Load artifacts ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let baselinePath = "";
const v0Paths: string[] = [];
const v1Paths: string[] = [];
let outPath = "";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--baseline") baselinePath = args[++i];
  else if (args[i] === "--v0") v0Paths.push(args[++i]);
  else if (args[i] === "--v1") v1Paths.push(args[++i]);
  else if (args[i] === "--out") outPath = args[++i];
}
if (!baselinePath || v0Paths.length === 0 || v1Paths.length === 0 || !outPath) {
  console.error(
    "usage: p6-stats-v1.ts --baseline <sealed.json> --v0 <seed.json>... --v1 <seed.json>... --out <report.json>",
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

function loadArtifacts(paths: string[]): FtArtifact[] {
  return paths.map((p) => {
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
}

const v0Artifacts = loadArtifacts(v0Paths);
const v1Artifacts = loadArtifacts(v1Paths);

// ─── Build three-way per-record points ────────────────────────────────────────

interface RecordPoint {
  recordId: string;
  stratum: string;
  enriched: boolean;
  baseline: Record<string, number>;
  v0: Record<string, number>;
  v1: Record<string, number>;
  v0PerSeed: Record<string, Record<string, number>>;
  v1PerSeed: Record<string, Record<string, number>>;
}

function armMeans(
  artifacts: FtArtifact[],
  recordId: string,
): { means: Record<string, number>; perSeed: Record<string, Record<string, number>> } {
  const perSeed: Record<string, Record<string, number>> = {};
  for (const ft of artifacts) {
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
  const means: Record<string, number> = {};
  for (const c of CONDITIONS) means[c] = mean(artifacts.map((f) => perSeed[f.seed][c]));
  return { means, perSeed };
}

const points: RecordPoint[] = [];
for (const [recordId, b] of baselineByRecord) {
  const v0 = armMeans(v0Artifacts, recordId);
  const v1 = armMeans(v1Artifacts, recordId);
  const bl: Record<string, number> = {};
  for (const c of CONDITIONS) bl[c] = (b as Record<string, number>)[`${c}_mean`];
  points.push({
    recordId,
    stratum: (b as { stratum: string }).stratum,
    enriched: (b as { enriched: boolean }).enriched,
    baseline: bl,
    v0: v0.means,
    v1: v1.means,
    v0PerSeed: v0.perSeed,
    v1PerSeed: v1.perSeed,
  });
}
if (points.length !== 16) {
  console.error(`ANDON: expected 16 cohort records, got ${points.length}`);
  process.exit(1);
}

// ─── Paired comparison machinery (identical to v0, arms parameterized) ───────

function comparison(
  armA: (p: RecordPoint) => Record<string, number>,
  armB: (p: RecordPoint) => Record<string, number>,
  subset: RecordPoint[] = points,
) {
  function condStats(cond: Condition) {
    const deltas = subset.map((p) => armA(p)[cond] - armB(p)[cond]);
    const rng1 = mulberry32(RNG_SEED);
    const rng2 = mulberry32(RNG_SEED + 1);
    const rng3 = mulberry32(RNG_SEED + 2);
    const sign = signTestP(deltas);
    return {
      n: subset.length,
      b_mean: mean(subset.map((p) => armB(p)[cond])),
      a_mean: mean(subset.map((p) => armA(p)[cond])),
      mean_delta: mean(deltas),
      bootstrap_ci95_records: bootstrapCI(deltas, rng1),
      bootstrap_ci95_song_clusters: clusterBootstrapCI(
        subset.map((p) => ({ cluster: p.stratum, delta: armA(p)[cond] - armB(p)[cond] })),
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

const WINS_BAR = 13;

const v1VsBaseline = comparison((p) => p.v1, (p) => p.baseline);
const v1VsV0 = comparison((p) => p.v1, (p) => p.v0);
const seenSongs = points.filter((p) => p.stratum !== "clair-de-lune");
const heldOut = points.filter((p) => p.stratum === "clair-de-lune");
const v1VsBaselineSeen = comparison((p) => p.v1, (p) => p.baseline, seenSongs);

const victoryCandidate =
  v1VsBaseline.primary.paired.wins >= WINS_BAR && v1VsBaseline.primary.mean_delta > 0;
const verdictWording = victoryCandidate
  ? "VICTORY-CANDIDATE — paired-wins bar met on the primary condition; the paraphrase-robustness check (L8/finding 25) MUST pass before any victory claim ships"
  : v1VsBaseline.primary.mean_delta > 0
    ? "directionally better, underpowered"
    : v1VsBaseline.primary.mean_delta < 0
      ? "not better than the prompted baseline on the primary condition"
      : "parity";

const report = {
  schema: "finetune-arc-v1-p6-stats/1.0.0",
  phase: "P6-v1",
  baseline: baselinePath,
  v0_artifacts: v0Paths,
  v1_artifacts: v1Paths,
  v0_seeds: v0Artifacts.map((f) => f.seed),
  v1_seeds: v1Artifacts.map((f) => f.seed),
  n_records: points.length,
  rng: { algorithm: "mulberry32", seed: RNG_SEED, n_boot: N_BOOT, n_perm: N_PERM },
  primary_condition: PRIMARY,
  comparisons: {
    v1_vs_baseline: { role: "PRIMARY — carries the claim", ...v1VsBaseline },
    v1_vs_v0: { role: "diagnostic — no claim attached", ...v1VsV0 },
    v1_vs_baseline_seen_songs_only: {
      role: "seen-song stratum (15 records)",
      primary: v1VsBaselineSeen.primary,
    },
    held_out_clair_de_lune: {
      role: "single record — reported, never pooled silently",
      n: heldOut.length,
      records: heldOut.map((p) => ({
        recordId: p.recordId,
        baseline: p.baseline,
        v0: p.v0,
        v1: p.v1,
      })),
    },
  },
  honesty_rule: {
    paired_wins_bar: `${WINS_BAR}/16 (two-sided sign test p<0.05)`,
    paired_wins_observed: v1VsBaseline.primary.paired.wins,
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
    v0_all_seeds_mean: p.v0,
    v1_all_seeds_mean: p.v1,
    v1_per_seed: p.v1PerSeed,
    delta_v1_baseline: Object.fromEntries(
      CONDITIONS.map((c) => [c, p.v1[c] - p.baseline[c]]),
    ),
    delta_v1_v0: Object.fromEntries(CONDITIONS.map((c) => [c, p.v1[c] - p.v0[c]])),
    primary_win_vs_baseline: p.v1[PRIMARY] - p.baseline[PRIMARY] > 1e-12,
  })),
};

writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(`P6-v1 stats -> ${outPath}`);
const p1 = v1VsBaseline.primary;
console.log(
  `PRIMARY v1 vs baseline (${PRIMARY}): ${p1.b_mean.toFixed(3)} -> ${p1.a_mean.toFixed(3)} | Δ ${p1.mean_delta >= 0 ? "+" : ""}${p1.mean_delta.toFixed(3)} | wins ${p1.paired.wins}/16 (ties ${p1.paired.ties}) | perm p=${p1.permutation_p_two_sided.toFixed(4)}`,
);
const p2 = v1VsV0.primary;
console.log(
  `DIAGNOSTIC v1 vs v0 (${PRIMARY}): Δ ${p2.mean_delta >= 0 ? "+" : ""}${p2.mean_delta.toFixed(3)} | wins ${p2.paired.wins}/16 | text_only Δ ${v1VsV0.controls.text_only.mean_delta >= 0 ? "+" : ""}${v1VsV0.controls.text_only.mean_delta.toFixed(3)}`,
);
console.log(`VERDICT: ${verdictWording}`);
