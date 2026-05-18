#!/usr/bin/env node
// ─── build-slice19-unified-baseline.mjs ──────────────────────────────────────
//
// Slice 19 unified post-repair E3 baseline builder.
//
// Combines three eval artifacts into a single 16-record baseline:
//   1. slice18-5-e3-post-repair-results.json — 13 records × n=3 tool_inspected
//      (REUSED BYTE-IDENTICAL; provenance: "slice18.5-reuse")
//   2. slice19-e3-fresh-cohort-results.json — 16 records × n=3 × {text_only,
//      full, random_midi} (FRESH this slice)
//   3. slice19-e3-tool-fresh-results.json — 3 records × n=3 tool_inspected
//      (FRESH this slice; provenance: "slice19-fresh")
//
// Each unified per-record block has:
//   - recordId, enriched, stratum, source ("slice18.5-reuse" | "slice19-fresh")
//   - tool_inspected_mean / stddev (from artifact 1 for 13 / artifact 3 for 3)
//   - full_mean / stddev (from artifact 2)
//   - text_only_mean / stddev (from artifact 2)
//   - random_midi_mean / stddev (from artifact 2)
//   - margins: full−text_only, full−random_midi, tool_inspected−text_only,
//     tool_inspected−full, tool_inspected−random_midi
//   - tool_use_stats (from tool_inspected source)
//   - sha256: stable hash of the per-record block (excluding the hash itself)
//     for reuse-discipline checks downstream
//
// Outputs:
//   datasets/jam-actions-v0-public/evals/slice19-fair-e3-baseline-results.json
//   datasets/jam-actions-v0-public/evals/slice19-fair-e3-baseline-sample.json
//
// Both artifacts are deterministic given the same inputs (the only non-pure
// field is `generated_at` — required by package-inputs.json schema).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const EVALS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0-public", "evals");

const SLICE_18_5_PATH = join(EVALS_DIR, "slice18-5-e3-post-repair-results.json");
const SLICE_19_E3_PATH = join(EVALS_DIR, "slice19-e3-fresh-cohort-results.json");
const SLICE_19_E3TOOL_PATH = join(EVALS_DIR, "slice19-e3-tool-fresh-results.json");

const OUT_RESULTS = join(EVALS_DIR, "slice19-fair-e3-baseline-results.json");
const OUT_SAMPLE = join(EVALS_DIR, "slice19-fair-e3-baseline-sample.json");

// ─── 16-record cohort and metadata ────────────────────────────────────────────

const SLICE_18_COHORT = [
  "bach-prelude-c-major-bwv846:m009-012:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m029-032:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m037-040:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m045-048:piano:mcp-session:v1",
  "pathetique-mvt2:m001-004:piano:mcp-session:v1",
  "pathetique-mvt2:m009-012:piano:mcp-session:v1",
  "pathetique-mvt2:m017-020:piano:mcp-session:v1",
  "pathetique-mvt2:m025-028:piano:mcp-session:v1",
  "schumann-traumerei:m001-004:piano:mcp-session:v1",
  "schumann-traumerei:m045-048:piano:mcp-session:v1",
  "chopin-nocturne-op9-no2:m009-012:piano:mcp-session:v1",
  "chopin-nocturne-op9-no2:m001-004:piano:mcp-session:v1",
  "clair-de-lune:m031-034:piano:mcp-session:v1",
];

const SLICE_19_FRESH = [
  "pathetique-mvt2:m029-032:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m049-052:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m053-056:piano:mcp-session:v1",
];

const SLICE_19_COHORT = [...SLICE_18_COHORT, ...SLICE_19_FRESH];

// Slice 11 enriched (6) + Slice 16 rubric-enriched (3) = 9 enriched total
const ENRICHED_RECORD_IDS = new Set([
  // Slice 11
  "pathetique-mvt2:m025-028:piano:mcp-session:v1",
  "pathetique-mvt2:m029-032:piano:mcp-session:v1",
  "schumann-traumerei:m045-048:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m045-048:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m049-052:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m053-056:piano:mcp-session:v1",
  // Slice 16
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

if (!existsSync(SLICE_18_5_PATH)) {
  console.error(`ERROR: missing ${SLICE_18_5_PATH}`);
  process.exit(1);
}
if (!existsSync(SLICE_19_E3_PATH)) {
  console.error(`ERROR: missing ${SLICE_19_E3_PATH}`);
  process.exit(1);
}
if (!existsSync(SLICE_19_E3TOOL_PATH)) {
  console.error(`ERROR: missing ${SLICE_19_E3TOOL_PATH}`);
  process.exit(1);
}

const slice185 = JSON.parse(readFileSync(SLICE_18_5_PATH, "utf8"));
const slice19E3 = JSON.parse(readFileSync(SLICE_19_E3_PATH, "utf8"));
const slice19E3Tool = JSON.parse(readFileSync(SLICE_19_E3TOOL_PATH, "utf8"));

// ─── Build per-record blocks ─────────────────────────────────────────────────

const slice185ByRecord = new Map(
  slice185.results["e3-tool"].records.map((r) => [r.recordId, r]),
);
const slice19E3ByRecord = new Map(
  slice19E3.results.e3.records.map((r) => [r.recordId, r]),
);
const slice19ToolByRecord = new Map(
  slice19E3Tool.results["e3-tool"].records.map((r) => [r.recordId, r]),
);

// SHA-256 invariance check: every Slice 18.5 record we reuse must match its
// source-artifact bytes exactly. Compute hash of the per-record block as it
// appears in the Slice 18.5 source artifact.
function recordBlockHash(record) {
  return createHash("sha256")
    .update(JSON.stringify(record))
    .digest("hex");
}

const reuseHashes = new Map();
for (const recId of SLICE_18_COHORT) {
  const src = slice185ByRecord.get(recId);
  if (!src) {
    console.error(`ERROR: Slice 18.5 missing record ${recId}`);
    process.exit(1);
  }
  reuseHashes.set(recId, recordBlockHash(src));
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function stddev(arr) {
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
}

const unifiedRecords = [];

for (const recId of SLICE_19_COHORT) {
  const source = SLICE_18_COHORT.includes(recId) ? "slice18.5-reuse" : "slice19-fresh";

  // tool_inspected block
  const toolSrc =
    source === "slice18.5-reuse"
      ? slice185ByRecord.get(recId)
      : slice19ToolByRecord.get(recId);
  if (!toolSrc) {
    console.error(`ERROR: tool_inspected source missing for ${recId} (source: ${source})`);
    process.exit(1);
  }

  // e3 (text_only / full / random_midi) block — always fresh from Slice 19
  const e3Src = slice19E3ByRecord.get(recId);
  if (!e3Src) {
    console.error(`ERROR: e3 source missing for ${recId}`);
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

  const block = {
    recordId: recId,
    enriched: ENRICHED_RECORD_IDS.has(recId),
    stratum: stratumOf(recId),
    source,

    // Per-condition means + stddev (n=3 outer runs)
    full_mean: fullMean,
    full_stddev: fullStddev,
    text_only_mean: textMean,
    text_only_stddev: textStddev,
    random_midi_mean: randomMean,
    random_midi_stddev: randomStddev,
    tool_inspected_mean: toolMean,
    tool_inspected_stddev: toolStddev,

    // Margins
    margin_full_minus_text_only: fullMean - textMean,
    margin_full_minus_random_midi: fullMean - randomMean,
    margin_tool_inspected_minus_text_only: toolMean - textMean,
    margin_tool_inspected_minus_full: toolMean - fullMean,
    margin_tool_inspected_minus_random_midi: toolMean - randomMean,

    // Clears +0.10 margin?
    full_clears_text_only: fullMean - textMean >= 0.1,
    tool_inspected_clears_text_only: toolMean - textMean >= 0.1,

    // Tool-use behavior (from tool_inspected source)
    tool_use_stats: toolSrc.tool_use_stats,

    // Provenance for traceability (reuse-discipline check)
    tool_inspected_source_sha256:
      source === "slice18.5-reuse" ? reuseHashes.get(recId) : null,
  };

  unifiedRecords.push(block);
}

// ─── Aggregate across the 16-record cohort ───────────────────────────────────

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
  schema_version: "slice19-fair-e3-baseline/1.0.0",
  generated_at: generatedAt,
  generator: "scripts/build-slice19-unified-baseline.mjs",
  cohort_description:
    "Unified post-repair E3 baseline across 16 records — 13 Slice 18 cohort records reused byte-identical from Slice 18.5 (tool_inspected only; text_only/full/random_midi fresh in Slice 19) + 3 NEW Slice 19 records (pathetique m029-032, bach m049-052, bach m053-056) run fresh across all 4 conditions",
  cohort_size: 16,
  n_runs_per_condition: 3,
  model: "qwen2.5:7b",
  backend: "ollama",
  seed: "slice12-2026-05-17",
  evaluator_state:
    "post-Slice-18.5 (count_notes_with_pitch_class added; annotation-grounding off-by-one fixed)",
  source_artifacts: {
    "tool_inspected for 13 records (reuse)": "evals/slice18-5-e3-post-repair-results.json",
    "text_only / full / random_midi for 16 records (fresh)": "evals/slice19-e3-fresh-cohort-results.json",
    "tool_inspected for 3 records (fresh)": "evals/slice19-e3-tool-fresh-results.json",
  },
  reuse_invariance: {
    description:
      "SHA-256 hash of each Slice 18.5 record-block, captured at unified-artifact build time. Future slices reusing this baseline can compare against these hashes to verify the Slice 18.5 source hasn't drifted.",
    hashes: Object.fromEntries(reuseHashes),
  },
  records: unifiedRecords,
  aggregate,
  tool_use_profile: toolUseProfile,
};

writeFileSync(OUT_RESULTS, JSON.stringify(unified, null, 2) + "\n", "utf8");
console.log(`Wrote ${OUT_RESULTS}`);

// ─── Sample manifest ─────────────────────────────────────────────────────────

const sample = {
  schema_version: "slice19-fair-e3-baseline-sample/1.0.0",
  generated_at: generatedAt,
  cohort: SLICE_19_COHORT,
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
    "slice18.5-reuse": unifiedRecords.filter((r) => r.source === "slice18.5-reuse").map((r) => r.recordId),
    "slice19-fresh": unifiedRecords.filter((r) => r.source === "slice19-fresh").map((r) => r.recordId),
  },
};

writeFileSync(OUT_SAMPLE, JSON.stringify(sample, null, 2) + "\n", "utf8");
console.log(`Wrote ${OUT_SAMPLE}`);

// ─── Console summary ─────────────────────────────────────────────────────────

console.log();
console.log("=".repeat(72));
console.log("Slice 19 fair E3 baseline — corpus aggregate (n=16)");
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
  `  margin full−text_only:           ${a.margin_full_minus_text_only.metric_mean.toFixed(3)} ± ${a.margin_full_minus_text_only.metric_stddev.toFixed(3)} | clears 0.1: ${a.records_clearing_full_minus_text}/${a.n_records}`,
);
console.log(
  `  margin tool_inspected−text_only: ${a.margin_tool_inspected_minus_text_only.metric_mean.toFixed(3)} ± ${a.margin_tool_inspected_minus_text_only.metric_stddev.toFixed(3)} | clears 0.1: ${a.records_clearing_tool_minus_text}/${a.n_records}`,
);
console.log();
console.log(`Enriched (n=${aggregate.enriched.n_records}):`);
console.log(
  `  text_only=${aggregate.enriched.text_only.metric_mean.toFixed(3)} full=${aggregate.enriched.full.metric_mean.toFixed(3)} tool=${aggregate.enriched.tool_inspected.metric_mean.toFixed(3)}`,
);
console.log(
  `  margin tool−text=${aggregate.enriched.margin_tool_inspected_minus_text_only.metric_mean.toFixed(3)} clears: ${aggregate.enriched.records_clearing_tool_minus_text}/${aggregate.enriched.n_records}`,
);
console.log();
console.log(`Non-enriched (n=${aggregate.non_enriched.n_records}):`);
console.log(
  `  text_only=${aggregate.non_enriched.text_only.metric_mean.toFixed(3)} full=${aggregate.non_enriched.full.metric_mean.toFixed(3)} tool=${aggregate.non_enriched.tool_inspected.metric_mean.toFixed(3)}`,
);
console.log(
  `  margin tool−text=${aggregate.non_enriched.margin_tool_inspected_minus_text_only.metric_mean.toFixed(3)} clears: ${aggregate.non_enriched.records_clearing_tool_minus_text}/${aggregate.non_enriched.n_records}`,
);
console.log();
console.log("Per-stratum tool_inspected:");
for (const [s, agg] of Object.entries(perStratum)) {
  console.log(
    `  ${s.padEnd(14)} n=${agg.n_records} text=${agg.text_only.metric_mean.toFixed(3)} full=${agg.full.metric_mean.toFixed(3)} tool=${agg.tool_inspected.metric_mean.toFixed(3)} | margin tool−text=${agg.margin_tool_inspected_minus_text_only.metric_mean.toFixed(3)} clears: ${agg.records_clearing_tool_minus_text}/${agg.n_records}`,
  );
}
console.log();
console.log("Tool-use profile (cohort):");
const tup = toolUseProfile.cohort;
console.log(`  total tool calls:          ${tup.total_tool_calls}`);
console.log(
  `  questions with tool calls: ${tup.questions_with_tool_calls}/${tup.questions_total} (${(tup.tool_call_rate * 100).toFixed(1)}%)`,
);
console.log(`  tool histogram:`);
for (const [tool, count] of Object.entries(tup.tool_histogram).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${tool.padEnd(40)} ${count}`);
}
