#!/usr/bin/env tsx
// ─── p6-stats-b2.ts — Finetune Arc B-2: the preregistered retain-and-calibrate stats ─
//
// P0-LOCK.md (B-2) §10/§11. Machinery inherited from p6-stats-v2.ts (mulberry32,
// 10k bootstrap/permutation, paired-by-recordId, song-cluster CI, exact sign
// test). New arms:
//
//   PRIMARY (the only veto) — tool-hold non-inferiority + NFR floor.
//     B-2-FT (5-seed all-seeds mean) vs the FROZEN v1-FT reference (5-seed
//     all-seeds mean from the sealed B-1 seed artifacts), paired by recordId on
//     tool_inspected. Held iff  bootstrapCI(B2 − v1FT)[lower] > −δ_tool
//     AND B2_mean > baseline  AND  NFR ≤ nfr_max. δ_tool + nfr_max are frozen
//     ex-ante in data/b2-cohort.json (sealed-data-derived).
//
//   SECONDARY (reported, non-veto) — prose calibration.
//     full: non-inferiority to the fresh B-2 baseline (closed the gap).
//     text_only: (a) abstention rate on the 4 MIDI-only types ≥ baseline + margin;
//                (b) prose-answerable over-refusal guard — coverage + selective
//                    accuracy on {key_time_sig, measure_range, provenance}.
//     Single operating point (the A–E output emits no confidence score → no full
//     risk-coverage curve; reported and said so).
//
// RNG mulberry32 seed 20260714 (B-2's own). All 5 seeds report; no best-of-seeds.
//
// Usage (run in P6-b2, AFTER the sealed B-2 evals — all with --abstain-surface):
//   pnpm exec tsx experiments/finetune-arc-b2/scripts/p6-stats-b2.ts \
//     --baseline .../b2-baseline-results.json \
//     --seed .../b2-seed13-results.json (x5) \
//     --v1ref experiments/finetune-arc-v2/evals/b1-seed13-results.json (x5) \
//     --cohort experiments/finetune-arc-b2/data/b2-cohort.json \
//     --out experiments/finetune-arc-b2/evals/b2-stats.json
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from "node:fs";

const CONDITIONS = ["tool_inspected", "full", "text_only", "random_midi"] as const;
type Condition = (typeof CONDITIONS)[number];
const PRIMARY: Condition = "tool_inspected";

const MIDI_ONLY_TYPES = ["pitch_class_count", "hand_register", "rhythm_onset", "annotation_grounding"];
const PROSE_TYPES = ["key_time_sig", "measure_range", "provenance"];

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
const RNG_SEED = 20260714;
const N_BOOT = 10000;
const N_PERM = 10000;
const EPS = 1e-12;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function quantile(sorted: number[], q: number): number {
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
function bootstrapCI(deltas: number[], rng: () => number): [number, number] {
  const means: number[] = [];
  for (let b = 0; b < N_BOOT; b++) {
    const s: number[] = [];
    for (let i = 0; i < deltas.length; i++) s.push(deltas[Math.floor(rng() * deltas.length)]);
    means.push(mean(s));
  }
  means.sort((a, b) => a - b);
  return [quantile(means, 0.025), quantile(means, 0.975)];
}
function clusterBootstrapCI(points: Array<{ cluster: string; delta: number }>, rng: () => number): [number, number] {
  const clusters = [...new Set(points.map((p) => p.cluster))];
  const byCluster = new Map(clusters.map((c) => [c, points.filter((p) => p.cluster === c).map((p) => p.delta)]));
  const means: number[] = [];
  for (let b = 0; b < N_BOOT; b++) {
    const s: number[] = [];
    for (let i = 0; i < clusters.length; i++) s.push(...(byCluster.get(clusters[Math.floor(rng() * clusters.length)]) ?? []));
    means.push(mean(s));
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

/** Non-inferiority (§10): the lower 95% bootstrap CI bound of the paired
 *  (arm − reference) deltas exceeds −δ. */
function nonInferiority(deltas: number[], delta: number, rng: () => number): { lower: number; upper: number; held: boolean; mean_delta: number } {
  const [lower, upper] = bootstrapCI(deltas, rng);
  return { lower, upper, held: lower > -delta, mean_delta: mean(deltas) };
}

// ─── Artifact loading ─────────────────────────────────────────────────────────

interface Raw {
  label: string;
  json: any;
  e3ByRecord: Map<string, any>;
  toolByRecord: Map<string, any>;
}
function loadRaw(path: string, label: string): Raw {
  const j = JSON.parse(readFileSync(path, "utf8"));
  return {
    label,
    json: j,
    e3ByRecord: new Map((j.results.e3?.records ?? []).map((r: any) => [r.recordId, r])),
    toolByRecord: new Map((j.results["e3-tool"]?.records ?? []).map((r: any) => [r.recordId, r])),
  };
}
function condVector(art: Raw, recordId: string): Record<Condition, number> {
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

/** Per-(record × questionType) tool_inspected correctness (0/1), majority over
 *  the outer runs of the e3-tool per_run_results. For NFR. */
function toolItemMap(art: Raw): Map<string, 0 | 1> {
  const map = new Map<string, 0 | 1>();
  for (const [, rec] of art.toolByRecord) {
    const byQ: Record<string, number[]> = {};
    for (const prr of rec.per_run_results ?? []) {
      for (const q of prr.questions ?? []) (byQ[q.questionType] ??= []).push(q.majorityScore);
    }
    for (const [qt, scores] of Object.entries(byQ)) {
      map.set(`${rec.recordId}|${qt}`, mean(scores) >= 0.5 ? 1 : 0);
    }
  }
  return map;
}

/** outcome of a run, tolerant of pre-B2 artifacts (no `outcome` field). */
function runOutcome(run: any): "correct" | "wrong" | "abstain" {
  if (run.outcome === "correct" || run.outcome === "wrong" || run.outcome === "abstain") return run.outcome;
  return run.score === 1 ? "correct" : "wrong"; // pre-B2 fallback (no abstain option)
}

/** Selective-prediction stats on text_only for one artifact over the cohort
 *  (§10 secondary). MIDI-only → abstention rate; prose-answerable → coverage +
 *  selective accuracy. Reads e3 questions[].runs.text_only[].outcome. */
function selectiveStats(art: Raw, cohort: string[]): {
  midi_only_abstention_rate: number;
  prose_coverage: number;
  prose_selective_accuracy: number;
  prose_n_questions: number;
} {
  let midiAbstain = 0, midiTotal = 0;
  let proseAnswered = 0, proseAbstain = 0, proseCorrect = 0, proseQ = 0;
  for (const recordId of cohort) {
    const e3 = art.e3ByRecord.get(recordId);
    if (!e3) continue;
    for (const q of e3.questions ?? []) {
      const runs = q.runs?.text_only ?? [];
      if (MIDI_ONLY_TYPES.includes(q.questionType)) {
        for (const r of runs) { midiTotal++; if (runOutcome(r) === "abstain") midiAbstain++; }
      } else if (PROSE_TYPES.includes(q.questionType)) {
        proseQ++;
        for (const r of runs) {
          const o = runOutcome(r);
          if (o === "abstain") proseAbstain++;
          else { proseAnswered++; if (o === "correct") proseCorrect++; }
        }
      }
    }
  }
  return {
    midi_only_abstention_rate: midiTotal ? midiAbstain / midiTotal : 0,
    prose_coverage: proseAnswered + proseAbstain ? proseAnswered / (proseAnswered + proseAbstain) : 0,
    prose_selective_accuracy: proseAnswered ? proseCorrect / proseAnswered : 0,
    prose_n_questions: proseQ,
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let baselinePath = "", cohortPath = "", outPath = "";
const seedPaths: string[] = [];
const v1refPaths: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--baseline") baselinePath = args[++i];
  else if (args[i] === "--seed") seedPaths.push(args[++i]);
  else if (args[i] === "--v1ref") v1refPaths.push(args[++i]);
  else if (args[i] === "--cohort") cohortPath = args[++i];
  else if (args[i] === "--out") outPath = args[++i];
}
if (!baselinePath || seedPaths.length !== 5 || v1refPaths.length !== 5 || !cohortPath || !outPath) {
  console.error("usage: p6-stats-b2.ts --baseline <b2-baseline> --seed <b2-seedK> (x5) --v1ref <b1-seedK> (x5) --cohort <b2-cohort.json> --out <report.json>");
  process.exit(1);
}

const cohortReceipt = JSON.parse(readFileSync(cohortPath, "utf8"));
const COHORT: string[] = cohortReceipt.cohort.cohort_sorted;
const strata = cohortReceipt.cohort.strata as { CL: string[]; LG: string[]; NW: string[] };
const strataOf = new Map<string, "CL" | "LG" | "NW">();
for (const s of ["CL", "LG", "NW"] as const) for (const id of strata[s]) strataOf.set(id, s);
const DELTA_TOOL: number = cohortReceipt.primary_veto.delta_tool;
const NFR_MAX: number = cohortReceipt.primary_veto.nfr_max;
const DELTA_FULL: number = cohortReceipt.secondary_reported_non_veto.full_non_inferiority.delta_full;
const ABSTAIN_MARGIN: number = cohortReceipt.secondary_reported_non_veto.text_only_abstention.margin_over_baseline;
const PROSE_COV_FLOOR: number = cohortReceipt.secondary_reported_non_veto.text_only_prose_over_refusal_guard.coverage_floor;
const PROSE_SEL_FLOOR: number = cohortReceipt.secondary_reported_non_veto.text_only_prose_over_refusal_guard.selective_accuracy_floor;

const baseline = loadRaw(baselinePath, "baseline");
const seedArts = seedPaths.map((p) => loadRaw(p, `b2-${/seed(\d+)/.exec(p)?.[1] ?? "?"}`));
const v1refArts = v1refPaths.map((p) => loadRaw(p, `v1ft-${/seed(\d+)/.exec(p)?.[1] ?? "?"}`));

// ─── Per-record all-seeds means ────────────────────────────────────────────────

interface Point { recordId: string; song: string; stratum: "CL" | "LG" | "NW"; baseline: Record<Condition, number>; b2: Record<Condition, number>; v1ft: Record<Condition, number> }
const points: Point[] = COHORT.map((recordId) => {
  const b2: Record<Condition, number> = { full: 0, text_only: 0, random_midi: 0, tool_inspected: 0 };
  const v1ft: Record<Condition, number> = { full: 0, text_only: 0, random_midi: 0, tool_inspected: 0 };
  for (const c of CONDITIONS) {
    b2[c] = mean(seedArts.map((a) => condVector(a, recordId)[c]));
    v1ft[c] = mean(v1refArts.map((a) => condVector(a, recordId)[c]));
  }
  return { recordId, song: recordId.split(":")[0], stratum: strataOf.get(recordId)!, baseline: condVector(baseline, recordId), b2, v1ft };
});

// ─── PRIMARY: tool-hold non-inferiority + NFR ──────────────────────────────────

const rngA = mulberry32(RNG_SEED), rngB = mulberry32(RNG_SEED + 1), rngC = mulberry32(RNG_SEED + 2);
const toolDeltas = points.map((p) => p.b2.tool_inspected - p.v1ft.tool_inspected);
const ni = nonInferiority(toolDeltas, DELTA_TOOL, rngA);
const b2ToolMean = mean(points.map((p) => p.b2.tool_inspected));
const v1ftToolMean = mean(points.map((p) => p.v1ft.tool_inspected));
const baselineToolMean = mean(points.map((p) => p.baseline.tool_inspected));
const aboveBaseline = b2ToolMean > baselineToolMean;

// NFR item-level (record × qtype), all-seeds majority
function allSeedsItemMap(arts: Raw[]): Map<string, 0 | 1> {
  const perArt = arts.map(toolItemMap);
  const keys = new Set<string>();
  for (const m of perArt) for (const k of m.keys()) keys.add(k);
  const out = new Map<string, 0 | 1>();
  for (const k of keys) out.set(k, mean(perArt.map((m) => m.get(k) ?? 0)) >= 0.5 ? 1 : 0);
  return out;
}
const cohortSet = new Set(COHORT);
const v1ftItems = allSeedsItemMap(v1refArts);
const b2Items = allSeedsItemMap(seedArts);
let nfrRefCorrect = 0, nfrFlipped = 0;
for (const [k, v] of v1ftItems) {
  if (!cohortSet.has(k.split("|")[0])) continue;
  if (v === 1) { nfrRefCorrect++; if (b2Items.get(k) === 0) nfrFlipped++; }
}
const nfr = nfrRefCorrect ? nfrFlipped / nfrRefCorrect : 0;

const primaryHeld = ni.held && aboveBaseline && nfr <= NFR_MAX;

// ─── SECONDARY ─────────────────────────────────────────────────────────────────

const fullDeltas = points.map((p) => p.b2.full - p.baseline.full);
const fullNI = nonInferiority(fullDeltas, DELTA_FULL, rngB);
const b2FullMean = mean(points.map((p) => p.b2.full));
const baselineFullMean = mean(points.map((p) => p.baseline.full));
const fullClosed = fullNI.held; // B2_full >= baseline_full - delta_full (paired lower CI > -delta)

// text_only selective (all-seeds pooled across the 5 B-2 seed artifacts + baseline)
const b2Selective = seedArts.map((a) => selectiveStats(a, COHORT));
const b2AbstMidi = mean(b2Selective.map((s) => s.midi_only_abstention_rate));
const b2ProseCov = mean(b2Selective.map((s) => s.prose_coverage));
const b2ProseSel = mean(b2Selective.map((s) => s.prose_selective_accuracy));
const baseSelective = selectiveStats(baseline, COHORT);
const abstentionMet = b2AbstMidi >= baseSelective.midi_only_abstention_rate + ABSTAIN_MARGIN;
const overRefusalGuardMet = b2ProseCov >= PROSE_COV_FLOOR && b2ProseSel >= PROSE_SEL_FLOOR;

const anySecondaryMet = fullClosed || abstentionMet || overRefusalGuardMet;

// ─── Claim class (§11) ─────────────────────────────────────────────────────────

let claim: "PASS" | "PARETO" | "REGRESSION" | "NULL";
let wording: string;
if (!primaryHeld) {
  claim = "REGRESSION";
  wording = "B-2 traded away part of the tool win; the seesaw is real on this recipe. Shippable as-is; no retry of these artifacts on this cohort.";
} else if (anySecondaryMet) {
  claim = "PASS";
  const met: string[] = [];
  if (fullClosed) met.push("closed the full gap");
  if (abstentionMet) met.push("raised MIDI-only abstention on text_only");
  if (overRefusalGuardMet) met.push("passed the prose over-refusal guard");
  wording = `the B-2 recipe holds the tool-grounded win while teaching the model to decline the genuinely-unanswerable prose questions instead of guessing (${met.join("; ")}). P7-class DIRECTOR gate opens; nothing publishes without the explicit yes.`;
} else {
  const moved = Math.abs(b2FullMean - baselineFullMean) > 0.01 || Math.abs(b2AbstMidi - baseSelective.midi_only_abstention_rate) > 0.01;
  claim = moved ? "PARETO" : "NULL";
  wording = moved
    ? `the tool win is retained but no secondary target was met at n=${points.length} — the tradeoff frontier stands. Shippable as-is.`
    : `no change — the recipe neither helped nor hurt the prose surface at n=${points.length}.`;
}

// ─── Report ─────────────────────────────────────────────────────────────────────

const report = {
  schema: "finetune-arc-b2-stats/1.0.0",
  phase: "P6-b2",
  rng: { algorithm: "mulberry32", seed: RNG_SEED, n_boot: N_BOOT, n_perm: N_PERM },
  n_records: points.length,
  baseline_artifact: baselinePath,
  seed_artifacts: seedPaths,
  v1ft_reference_artifacts: v1refPaths,
  cohort_receipt: cohortPath,
  primary_veto: {
    condition: PRIMARY,
    b2_all_seeds_mean: b2ToolMean,
    v1ft_all_seeds_mean: v1ftToolMean,
    baseline_mean: baselineToolMean,
    delta_tool: DELTA_TOOL,
    non_inferiority: { mean_delta: ni.mean_delta, ci95_lower: ni.lower, ci95_upper: ni.upper, floor: -DELTA_TOOL, held: ni.held },
    above_baseline: aboveBaseline,
    nfr: { value: nfr, max: NFR_MAX, held: nfr <= NFR_MAX, ref_correct_items: nfrRefCorrect, flipped_items: nfrFlipped },
    ci95_song_clusters: clusterBootstrapCI(points.map((p) => ({ cluster: p.song, delta: p.b2.tool_inspected - p.v1ft.tool_inspected })), rngC),
    paired_sign_test: signTestP(toolDeltas),
    primary_held: primaryHeld,
  },
  secondary_reported: {
    full_non_inferiority: { b2_full_mean: b2FullMean, baseline_full_mean: baselineFullMean, delta_full: DELTA_FULL, mean_delta: fullNI.mean_delta, ci95_lower: fullNI.lower, floor: -DELTA_FULL, closed_the_gap: fullClosed },
    text_only_abstention: { b2_midi_only_abstention_rate: b2AbstMidi, baseline_midi_only_abstention_rate: baseSelective.midi_only_abstention_rate, margin: ABSTAIN_MARGIN, met: abstentionMet },
    text_only_prose_over_refusal_guard: { b2_prose_coverage: b2ProseCov, coverage_floor: PROSE_COV_FLOOR, b2_prose_selective_accuracy: b2ProseSel, selective_accuracy_floor: PROSE_SEL_FLOOR, met: overRefusalGuardMet, single_operating_point: true, note: "A–E output emits no confidence score → single operating point, no full risk-coverage curve" },
  },
  strata_primary_unpooled: Object.fromEntries((["CL", "LG", "NW"] as const).map((s) => {
    const sub = points.filter((p) => p.stratum === s);
    const d = sub.map((p) => p.b2.tool_inspected - p.v1ft.tool_inspected);
    return [s, { n: sub.length, mean_delta: mean(d), paired: signTestP(d) }];
  })),
  claim_class: claim,
  claim_wording: wording,
  honesty: { best_of_seeds_used: false, all_five_seeds_report: true, cluster_caveat: "record-level tests assume record independence — song-cluster bootstrap reported alongside; strata unpooled" },
  per_record: points.map((p) => ({
    recordId: p.recordId, song: p.song, stratum: p.stratum,
    baseline: p.baseline, b2_all_seeds_mean: p.b2, v1ft_all_seeds_mean: p.v1ft,
    tool_delta_b2_minus_v1ft: p.b2.tool_inspected - p.v1ft.tool_inspected,
  })),
};

writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(`B-2 stats -> ${outPath}`);
console.log(`PRIMARY tool-hold: B2 ${b2ToolMean.toFixed(3)} vs v1FT ${v1ftToolMean.toFixed(3)} | Δ ${ni.mean_delta >= 0 ? "+" : ""}${ni.mean_delta.toFixed(3)} | CI95[${ni.lower.toFixed(3)}, ${ni.upper.toFixed(3)}] > -${DELTA_TOOL} = ${ni.held} | >baseline ${aboveBaseline} | NFR ${nfr.toFixed(3)}<=${NFR_MAX} ${nfr <= NFR_MAX} → primary ${primaryHeld ? "HELD" : "FAILED"}`);
console.log(`SECONDARY full closed=${fullClosed} | abstention met=${abstentionMet} (${b2AbstMidi.toFixed(3)} vs base ${baseSelective.midi_only_abstention_rate.toFixed(3)}+${ABSTAIN_MARGIN}) | over-refusal guard=${overRefusalGuardMet} (cov ${b2ProseCov.toFixed(3)}, sel ${b2ProseSel.toFixed(3)})`);
console.log(`CLAIM: ${claim} — ${wording}`);
