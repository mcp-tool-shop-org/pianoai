#!/usr/bin/env node
// ─── build-slice21-unified-baseline.mjs ──────────────────────────────────────
//
// Slice 21 unified post-remediation E3 baseline builder.
//
// Slice 21's surgical change: schumann-traumerei:m045-048 received an
// R6-aware enrichment rewrite (post-Slice-20 diagnostic). This builder
// rebuilds the unified 16-record baseline by REPLACING only that record's
// per-record block. The other 15 records are reused byte-identical from
// the Slice 19 baseline.
//
// Inputs:
//   1. slice19-fair-e3-baseline-results.json — the canonical Slice 19
//      baseline (16 records); 15 are reused byte-identical; 1 (schumann
//      m045-048) is overwritten by the fresh Slice 21 rerun.
//   2. slice21-schumann-m045-rerun-results.json — fresh n=3 × 4-condition
//      data for the single schumann record under R6-aware enrichment.
//
// Per-record block sources in the output:
//   - 15 records: source = "slice19-fair-baseline-reuse"
//     (byte-identical to Slice 19 baseline's record-block, with sha256
//     captured in reuse_invariance.hashes)
//   - 1 record (schumann m045-048): source = "slice21-fresh"
//
// Output:
//   datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json
//   datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-sample.json
//
// Deterministic given the same inputs (generated_at is the only non-pure field).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const EVALS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0-public", "evals");

const SLICE_19_BASELINE_PATH = join(EVALS_DIR, "slice19-fair-e3-baseline-results.json");
const SLICE_21_RERUN_PATH = join(EVALS_DIR, "slice21-schumann-m045-rerun-results.json");

const OUT_RESULTS = join(EVALS_DIR, "slice21-fair-e3-baseline-results.json");
const OUT_SAMPLE = join(EVALS_DIR, "slice21-fair-e3-baseline-sample.json");

const SCHUMANN_REMEDIATED_ID = "schumann-traumerei:m045-048:piano:mcp-session:v1";

// 9 enriched records (Slice 11/16 unchanged + schumann m045-048's annotation
// rewrite — but still enriched=true; the rewrite is content-only)
const ENRICHED_RECORD_IDS = new Set([
  "pathetique-mvt2:m025-028:piano:mcp-session:v1",
  "pathetique-mvt2:m029-032:piano:mcp-session:v1",
  "schumann-traumerei:m045-048:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m045-048:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m049-052:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m053-056:piano:mcp-session:v1",
  "pathetique-mvt2:m001-004:piano:mcp-session:v1",
  "schumann-traumerei:m001-004:piano:mcp-session:v1",
  "chopin-nocturne-op9-no2:m009-012:piano:mcp-session:v1",
]);

function stratumOf(recordId) {
  if (recordId.startsWith("bach-prelude-c-major-bwv846:")) return "bach";
  if (recordId.startsWith("pathetique-mvt2:")) return "pathetique";
  if (recordId.startsWith("schumann-traumerei:")) return "schumann";
  if (recordId.startsWith("chopin-nocturne-op9-no2:")) return "chopin";
  if (recordId.startsWith("clair-de-lune:")) return "clair-de-lune";
  return "other";
}

// ─── Load source artifacts ────────────────────────────────────────────────────

if (!existsSync(SLICE_19_BASELINE_PATH)) {
  console.error(`ERROR: missing ${SLICE_19_BASELINE_PATH}`);
  process.exit(1);
}
if (!existsSync(SLICE_21_RERUN_PATH)) {
  console.error(`ERROR: missing ${SLICE_21_RERUN_PATH}`);
  process.exit(1);
}

const slice19 = JSON.parse(readFileSync(SLICE_19_BASELINE_PATH, "utf8"));
const slice21Rerun = JSON.parse(readFileSync(SLICE_21_RERUN_PATH, "utf8"));

// ─── Pull schumann's fresh data from Slice 21 rerun ──────────────────────────

const slice21E3ByRecord = new Map(
  (slice21Rerun.results.e3?.records ?? []).map((r) => [r.recordId, r]),
);
const slice21ToolByRecord = new Map(
  (slice21Rerun.results["e3-tool"]?.records ?? []).map((r) => [r.recordId, r]),
);

const e3Src = slice21E3ByRecord.get(SCHUMANN_REMEDIATED_ID);
const toolSrc = slice21ToolByRecord.get(SCHUMANN_REMEDIATED_ID);

if (!e3Src) {
  console.error(`ERROR: Slice 21 rerun missing e3 source for ${SCHUMANN_REMEDIATED_ID}`);
  process.exit(1);
}
if (!toolSrc) {
  console.error(`ERROR: Slice 21 rerun missing e3-tool source for ${SCHUMANN_REMEDIATED_ID}`);
  process.exit(1);
}

const fullMean = e3Src.aggregate.full.metric_mean;
const fullStddev = e3Src.aggregate.full.metric_stddev;
const textMean = e3Src.aggregate.text_only.metric_mean;
const textStddev = e3Src.aggregate.text_only.metric_stddev;
const randomMean = e3Src.aggregate.random_midi.metric_mean;
const randomStddev = e3Src.aggregate.random_midi.metric_stddev;
const toolMean = toolSrc.tool_inspected_mean;
const toolStddev = toolSrc.tool_inspected_stddev;

const schumannFreshBlock = {
  recordId: SCHUMANN_REMEDIATED_ID,
  enriched: true,
  stratum: "schumann",
  source: "slice21-fresh",

  full_mean: fullMean,
  full_stddev: fullStddev,
  text_only_mean: textMean,
  text_only_stddev: textStddev,
  random_midi_mean: randomMean,
  random_midi_stddev: randomStddev,
  tool_inspected_mean: toolMean,
  tool_inspected_stddev: toolStddev,

  margin_full_minus_text_only: fullMean - textMean,
  margin_full_minus_random_midi: fullMean - randomMean,
  margin_tool_inspected_minus_text_only: toolMean - textMean,
  margin_tool_inspected_minus_full: toolMean - fullMean,
  margin_tool_inspected_minus_random_midi: toolMean - randomMean,

  full_clears_text_only: fullMean - textMean >= 0.1,
  tool_inspected_clears_text_only: toolMean - textMean >= 0.1,

  tool_use_stats: toolSrc.tool_use_stats,

  tool_inspected_source_sha256: null, // fresh — no SHA reuse claim
};

// ─── Compose unified records: 15 reused + 1 fresh ────────────────────────────

const unifiedRecords = [];
const reuseHashes = {};

function recordBlockHash(record) {
  return createHash("sha256")
    .update(JSON.stringify(record))
    .digest("hex");
}

for (const slice19Block of slice19.records) {
  if (slice19Block.recordId === SCHUMANN_REMEDIATED_ID) {
    unifiedRecords.push(schumannFreshBlock);
  } else {
    // Reuse byte-identical, but update source label
    const reusedBlock = { ...slice19Block, source: "slice19-fair-baseline-reuse" };
    unifiedRecords.push(reusedBlock);
    // SHA-256 invariance hash captured against the SLICE-19 source block as
    // it appeared in slice19-fair-e3-baseline-results.json (with whatever
    // source label Slice 19 wrote — "slice18.5-reuse" or "slice19-fresh").
    reuseHashes[slice19Block.recordId] = recordBlockHash(slice19Block);
  }
}

// ─── Aggregate across the 16-record cohort ───────────────────────────────────

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function stddev(arr) {
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
}

function aggregateCondition(records, key) {
  const values = records.map((r) => r[key]);
  const passed = values.filter((v) => v !== null).length;
  return {
    n: passed,
    metric_mean: mean(values),
    metric_stddev: stddev(values),
    metric_min: Math.min(...values),
    metric_max: Math.max(...values),
  };
}

function aggregateRecords(records) {
  return {
    n_records: records.length,
    n_enriched: records.filter((r) => r.enriched).length,
    n_non_enriched: records.filter((r) => !r.enriched).length,
    full: aggregateCondition(records, "full_mean"),
    text_only: aggregateCondition(records, "text_only_mean"),
    random_midi: aggregateCondition(records, "random_midi_mean"),
    tool_inspected: aggregateCondition(records, "tool_inspected_mean"),
    margin_full_minus_text_only: aggregateCondition(records, "margin_full_minus_text_only"),
    margin_full_minus_random_midi: aggregateCondition(records, "margin_full_minus_random_midi"),
    margin_tool_inspected_minus_text_only: aggregateCondition(records, "margin_tool_inspected_minus_text_only"),
    margin_tool_inspected_minus_full: aggregateCondition(records, "margin_tool_inspected_minus_full"),
    margin_tool_inspected_minus_random_midi: aggregateCondition(records, "margin_tool_inspected_minus_random_midi"),
    records_clearing_full_minus_text: records.filter((r) => r.full_clears_text_only).length,
    records_clearing_tool_minus_text: records.filter((r) => r.tool_inspected_clears_text_only).length,
  };
}

const enrichedRecords = unifiedRecords.filter((r) => r.enriched);
const nonEnrichedRecords = unifiedRecords.filter((r) => !r.enriched);

const strata = ["bach", "pathetique", "schumann", "chopin", "clair-de-lune"];
const perStratum = {};
for (const s of strata) {
  const rs = unifiedRecords.filter((r) => r.stratum === s);
  if (rs.length > 0) perStratum[s] = aggregateRecords(rs);
}

const aggregate = {
  cohort: aggregateRecords(unifiedRecords),
  enriched: aggregateRecords(enrichedRecords),
  non_enriched: aggregateRecords(nonEnrichedRecords),
  per_stratum: perStratum,
};

// Tool-use profile across the 16-record cohort
function sumToolUse(records) {
  let totalCalls = 0;
  let questionsWithCalls = 0;
  let questionsTotal = 0;
  let iterationCapHit = 0;
  let backendErrors = 0;
  let modelSilent = 0;
  let modelAnswered = 0;
  const toolHistogram = {};

  for (const r of records) {
    const s = r.tool_use_stats;
    if (!s) continue;
    totalCalls += s.total_tool_calls ?? 0;
    iterationCapHit += s.iteration_cap_hit_count ?? 0;
    backendErrors += s.backend_error_count ?? 0;
    modelSilent += s.model_silent_count ?? 0;
    modelAnswered += s.model_answered_count ?? 0;
    const oneCall = s.questions_with_one_call ?? 0;
    const twoCall = s.questions_with_2_calls ?? 0;
    const threePlusCall = s.questions_with_3plus_calls ?? 0;
    const zeroCall = s.questions_with_zero_calls ?? 0;
    questionsWithCalls += oneCall + twoCall + threePlusCall;
    questionsTotal += zeroCall + oneCall + twoCall + threePlusCall;
    for (const [tool, count] of Object.entries(s.tool_histogram ?? {})) {
      toolHistogram[tool] = (toolHistogram[tool] ?? 0) + count;
    }
  }

  return {
    total_tool_calls: totalCalls,
    questions_with_tool_calls: questionsWithCalls,
    questions_total: questionsTotal,
    questions_with_zero_calls: questionsTotal - questionsWithCalls,
    tool_call_rate: questionsTotal > 0 ? questionsWithCalls / questionsTotal : 0,
    iteration_cap_hit_count: iterationCapHit,
    backend_error_count: backendErrors,
    model_silent_count: modelSilent,
    model_answered_count: modelAnswered,
    tool_histogram: toolHistogram,
  };
}

const toolUseProfile = {
  cohort: sumToolUse(unifiedRecords),
  enriched: sumToolUse(enrichedRecords),
  non_enriched: sumToolUse(nonEnrichedRecords),
  per_stratum: Object.fromEntries(
    strata
      .filter((s) => unifiedRecords.some((r) => r.stratum === s))
      .map((s) => [s, sumToolUse(unifiedRecords.filter((r) => r.stratum === s))]),
  ),
};

// ─── Write unified artifacts ──────────────────────────────────────────────────

const generatedAt = new Date().toISOString();

const unified = {
  schema_version: "slice21-fair-e3-baseline/1.0.0",
  generated_at: generatedAt,
  generator: "scripts/build-slice21-unified-baseline.mjs",
  cohort_description:
    "Unified post-remediation E3 baseline across 16 records — 15 records byte-identically reused from Slice 19 baseline (source label: slice19-fair-baseline-reuse) + schumann-traumerei:m045-048 fresh after R6-aware enrichment rewrite (source label: slice21-fresh). Same 16-record cohort as Slice 19; only schumann's annotation_target content has changed.",
  cohort_size: 16,
  n_runs_per_condition: 3,
  model: "qwen2.5:7b",
  backend: "ollama",
  seed: "slice12-2026-05-17",
  evaluator_state:
    "post-Slice-18.5 (count_notes_with_pitch_class added; annotation-grounding off-by-one fixed) — locked across Slice 19/20/21",
  source_artifacts: {
    // Slice 21 surgical-replace provenance: 15 of the 16 records are
    // byte-identical reuses from Slice 19's unified baseline; the 1
    // remaining (schumann m045-048) is fresh from the Slice 21 rerun.
    "15 records (unified baseline reuse, byte-identical)":
      "evals/slice19-fair-e3-baseline-results.json",
    "1 record (schumann m045-048, fresh under R6-aware enrichment)":
      "evals/slice21-schumann-m045-rerun-results.json",
    // Tool-call trace sources — required by check-release-gate.ts for Axis 4/5
    // (correct-after-tool, misinterp) tallies. These are the same per-record
    // tool-call sources that Slice 19's baseline referenced; preserved here
    // so the gate can read 15 records' worth of tool-call traces without
    // chasing them through the indirect baseline-of-baselines pointer.
    // The Slice 21 rerun supplies tool-call traces for schumann m045-048
    // (covered above).
    "tool_inspected traces for 12 of the 13 Slice 18 cohort records (reuse from Slice 18.5)":
      "evals/slice18-5-e3-post-repair-results.json",
    "tool_inspected traces for 3 Slice 19 fresh records (reuse from Slice 19 tool-fresh run)":
      "evals/slice19-e3-tool-fresh-results.json",
  },
  reuse_invariance: {
    description:
      "SHA-256 hash of each Slice 19 baseline record-block reused here. Downstream consumers can compare these against an independent Slice 19 hash audit to verify the 15 reused blocks are byte-identical.",
    hashes: reuseHashes,
  },
  records: unifiedRecords,
  aggregate,
  tool_use_profile: toolUseProfile,
};

writeFileSync(OUT_RESULTS, JSON.stringify(unified, null, 2) + "\n", "utf8");
console.log(`Wrote ${OUT_RESULTS}`);

const sample = {
  schema_version: "slice21-fair-e3-baseline-sample/1.0.0",
  generated_at: generatedAt,
  cohort: unifiedRecords.map((r) => r.recordId),
  cohort_size: 16,
  records: unifiedRecords.map((r) => ({
    recordId: r.recordId,
    enriched: r.enriched,
    stratum: r.stratum,
    source: r.source,
  })),
  enriched_count: unifiedRecords.filter((r) => r.enriched).length,
  non_enriched_count: unifiedRecords.filter((r) => !r.enriched).length,
  strata: Object.fromEntries(
    strata.map((s) => [s, unifiedRecords.filter((r) => r.stratum === s).map((r) => r.recordId)]),
  ),
  provenance_by_source: {
    "slice19-fair-baseline-reuse": unifiedRecords
      .filter((r) => r.source === "slice19-fair-baseline-reuse")
      .map((r) => r.recordId),
    "slice21-fresh": unifiedRecords
      .filter((r) => r.source === "slice21-fresh")
      .map((r) => r.recordId),
  },
};

writeFileSync(OUT_SAMPLE, JSON.stringify(sample, null, 2) + "\n", "utf8");
console.log(`Wrote ${OUT_SAMPLE}`);

// ─── Console summary ─────────────────────────────────────────────────────────

console.log();
console.log("=".repeat(72));
console.log("Slice 21 fair E3 baseline — corpus aggregate (n=16)");
console.log("=".repeat(72));
const a = aggregate.cohort;
console.log(
  `  text_only:        ${a.text_only.metric_mean.toFixed(3)} ± ${a.text_only.metric_stddev.toFixed(3)}`,
);
console.log(
  `  full:             ${a.full.metric_mean.toFixed(3)} ± ${a.full.metric_stddev.toFixed(3)}`,
);
console.log(
  `  random_midi:      ${a.random_midi.metric_mean.toFixed(3)} ± ${a.random_midi.metric_stddev.toFixed(3)}`,
);
console.log(
  `  tool_inspected:   ${a.tool_inspected.metric_mean.toFixed(3)} ± ${a.tool_inspected.metric_stddev.toFixed(3)}`,
);
console.log();
console.log(
  `  margin full−text_only:           ${a.margin_full_minus_text_only.metric_mean.toFixed(3)} | clears 0.1: ${a.records_clearing_full_minus_text}/${a.n_records}`,
);
console.log(
  `  margin tool_inspected−text_only: ${a.margin_tool_inspected_minus_text_only.metric_mean.toFixed(3)} | clears 0.1: ${a.records_clearing_tool_minus_text}/${a.n_records}`,
);
console.log();
console.log(`Schumann remediated record (schumann-traumerei:m045-048):`);
const sch = unifiedRecords.find((r) => r.recordId === SCHUMANN_REMEDIATED_ID);
console.log(
  `  text_only=${sch.text_only_mean.toFixed(3)} full=${sch.full_mean.toFixed(3)} random_midi=${sch.random_midi_mean.toFixed(3)} tool_inspected=${sch.tool_inspected_mean.toFixed(3)}`,
);
console.log(
  `  margin tool−text=${sch.margin_tool_inspected_minus_text_only.toFixed(3)} margin full−text=${sch.margin_full_minus_text_only.toFixed(3)}`,
);
console.log();
console.log("Per-stratum tool_inspected (n=16 cohort):");
for (const [s, agg] of Object.entries(perStratum)) {
  console.log(
    `  ${s.padEnd(14)} n=${agg.n_records} text=${agg.text_only.metric_mean.toFixed(3)} full=${agg.full.metric_mean.toFixed(3)} tool=${agg.tool_inspected.metric_mean.toFixed(3)} | margin tool−text=${agg.margin_tool_inspected_minus_text_only.metric_mean.toFixed(3)} clears: ${agg.records_clearing_tool_minus_text}/${agg.n_records}`,
  );
}
