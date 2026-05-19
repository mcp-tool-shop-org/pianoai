#!/usr/bin/env tsx
// ─── check-release-gate.ts (jam-actions-v0 Slice 20) ─────────────────────────
//
// CLI to apply the 7-axis RC release gate against a Slice-19-shaped baseline
// artifact (post-repair unified E3 baseline). Resolves correct-after-tool /
// misinterp from the source per-question traces referenced by the unified
// artifact's `source_artifacts` block, then feeds the structured input to
// `evaluateReleaseGate`.
//
// Usage:
//
//   # default thresholds; default Slice 19 baseline
//   tsx scripts/check-release-gate.ts
//
//   # custom baseline artifact
//   tsx scripts/check-release-gate.ts \
//     --baseline datasets/jam-actions-v0-public/evals/slice19-fair-e3-baseline-results.json
//
//   # write assessment to disk
//   tsx scripts/check-release-gate.ts \
//     --out datasets/jam-actions-v0-public/evals/slice20-release-gate-assessment.json
//
//   # override individual thresholds for what-if analysis
//   tsx scripts/check-release-gate.ts \
//     --axis1-floor 0.60 \
//     --axis2-margin-floor 0.05 \
//     --axis6-stratum-margin-floor -0.10
//
// Exit codes:
//   0 — gate PASSES (all blocking axes plus axis 7 reporting clear)
//   1 — gate FAILS or CLI error
//
// Slice 20 doctrine: this is the CANDIDATE RC gate definition. A PASS verdict
// from this CLI does NOT mean the dataset is approved for release.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateReleaseGate,
  DEFAULT_THRESHOLDS,
  type ReleaseGateInput,
  type ReleaseGateThresholds,
  type StratumAssessment,
  type PerRecordAssessment,
} from "../src/dataset/release/release-gate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const DEFAULT_BASELINE = join(
  REPO_ROOT,
  "datasets",
  "jam-actions-v0-public",
  "evals",
  "slice19-fair-e3-baseline-results.json",
);

// ─── CLI parsing ─────────────────────────────────────────────────────────────

interface CliArgs {
  baseline: string;
  out: string | null;
  thresholds: ReleaseGateThresholds;
  reportsEnrichedSplit: boolean;
  help: boolean;
  quiet: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    baseline: DEFAULT_BASELINE,
    out: null,
    thresholds: { ...DEFAULT_THRESHOLDS },
    reportsEnrichedSplit: true,
    help: false,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--quiet":
        args.quiet = true;
        break;
      case "--baseline":
        args.baseline = next;
        i++;
        break;
      case "--out":
        args.out = next;
        i++;
        break;
      case "--axis1-floor":
        args.thresholds.axis1_absolute_floor = parseFloat(next);
        i++;
        break;
      case "--axis2-margin-floor":
        args.thresholds.axis2_corpus_margin_floor = parseFloat(next);
        i++;
        break;
      case "--axis2-clearing-fraction":
        args.thresholds.axis2_records_clearing_fraction_floor = parseFloat(next);
        i++;
        break;
      case "--axis2-per-record-margin":
        args.thresholds.axis2_per_record_margin = parseFloat(next);
        i++;
        break;
      case "--axis3-tool-use-floor":
        args.thresholds.axis3_tool_use_rate_floor = parseFloat(next);
        i++;
        break;
      case "--axis4-correct-after-tool-floor":
        args.thresholds.axis4_correct_after_tool_floor = parseFloat(next);
        i++;
        break;
      case "--axis5-misinterp-ceiling":
        args.thresholds.axis5_misinterp_ceiling = parseFloat(next);
        i++;
        break;
      case "--axis6-stratum-margin-floor":
        args.thresholds.axis6_stratum_mean_margin_floor = parseFloat(next);
        i++;
        break;
      case "--axis6-stratum-min-clearing":
        args.thresholds.axis6_stratum_min_records_clearing = parseInt(next, 10);
        i++;
        break;
      case "--no-reports-enriched-split":
        args.reportsEnrichedSplit = false;
        break;
      default:
        if (arg.startsWith("--")) {
          process.stderr.write(`unknown flag: ${arg}\n`);
          process.exit(1);
        }
    }
  }
  return args;
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage: check-release-gate.ts [options]",
      "",
      "Evaluate the jam-actions-v0 Slice 20 candidate RC gate (7 axes) against a",
      "Slice-19-shaped baseline artifact.",
      "",
      "Options:",
      "  --baseline <path>                  Path to the unified baseline JSON",
      `                                     (default: ${DEFAULT_BASELINE})`,
      "  --out <path>                       Write assessment artifact to disk",
      "  --quiet                            Suppress human-readable summary",
      "",
      "Threshold overrides:",
      `  --axis1-floor <n>                  axis 1 (default ${DEFAULT_THRESHOLDS.axis1_absolute_floor})`,
      `  --axis2-margin-floor <n>           axis 2 corpus margin (default ${DEFAULT_THRESHOLDS.axis2_corpus_margin_floor})`,
      `  --axis2-clearing-fraction <n>      axis 2 clearing fraction (default ${DEFAULT_THRESHOLDS.axis2_records_clearing_fraction_floor})`,
      `  --axis2-per-record-margin <n>      axis 2 per-record margin (default ${DEFAULT_THRESHOLDS.axis2_per_record_margin})`,
      `  --axis3-tool-use-floor <n>         axis 3 (default ${DEFAULT_THRESHOLDS.axis3_tool_use_rate_floor})`,
      `  --axis4-correct-after-tool-floor <n>  axis 4 (default ${DEFAULT_THRESHOLDS.axis4_correct_after_tool_floor})`,
      `  --axis5-misinterp-ceiling <n>      axis 5 (default ${DEFAULT_THRESHOLDS.axis5_misinterp_ceiling})`,
      `  --axis6-stratum-margin-floor <n>   axis 6 stratum mean (default ${DEFAULT_THRESHOLDS.axis6_stratum_mean_margin_floor})`,
      `  --axis6-stratum-min-clearing <n>   axis 6 stratum min records (default ${DEFAULT_THRESHOLDS.axis6_stratum_min_records_clearing})`,
      "  --no-reports-enriched-split        Mark axis 7 as undeclared",
      "",
      "Exit codes: 0 on PASS; 1 on FAIL or CLI error.",
      "",
      "Slice 20 doctrine: this is a CANDIDATE RC gate. A PASS verdict does NOT",
      "mean the dataset is approved for release.",
      "",
    ].join("\n"),
  );
}

// ─── Trace-side derivation of correct-after-tool and misinterp ───────────────

interface ToolCallTrace {
  tool_call_count: number;
}

interface QuestionRun {
  score: number;
  trace?: ToolCallTrace;
}

interface Question {
  runs: QuestionRun[];
}

interface RunResultsRecord {
  recordId?: string;
  per_run_results: { questions: Question[] }[];
}

/**
 * Walk a results artifact and tally tool-called question-runs vs
 * tool-called-correct across all records (corpus-level aggregate).
 */
function tallyToolCalledFromArtifact(
  resultsBlock: { records: Record<string, RunResultsRecord> | RunResultsRecord[] },
): { tool_called: number; tool_called_correct: number } {
  let toolCalled = 0;
  let toolCalledCorrect = 0;
  const recsRaw = resultsBlock.records as Record<string, RunResultsRecord> | RunResultsRecord[];
  const recList: RunResultsRecord[] = Array.isArray(recsRaw)
    ? recsRaw
    : Object.keys(recsRaw).map(k => recsRaw[k]);
  for (const rec of recList) {
    if (!rec.per_run_results) continue;
    for (const run of rec.per_run_results) {
      if (!run.questions) continue;
      for (const q of run.questions) {
        if (!q.runs) continue;
        for (const r of q.runs) {
          if (r.trace && r.trace.tool_call_count > 0) {
            toolCalled++;
            if (r.score === 1) toolCalledCorrect++;
          }
        }
      }
    }
  }
  return { tool_called: toolCalled, tool_called_correct: toolCalledCorrect };
}

/**
 * Walk a results artifact and tally per-record tool-called and misinterp
 * counts. Returns a map of recordId → { tool_called, tool_called_correct,
 * misinterp_count }. Used by Slice-22 axes 2 + 6 per-record classification.
 */
function tallyPerRecordFromArtifact(
  resultsBlock: { records: Record<string, RunResultsRecord> | RunResultsRecord[] },
): Map<string, { tool_called: number; tool_called_correct: number; misinterp_count: number }> {
  const out = new Map<string, { tool_called: number; tool_called_correct: number; misinterp_count: number }>();
  const recsRaw = resultsBlock.records as Record<string, RunResultsRecord> | RunResultsRecord[];
  const recList: RunResultsRecord[] = Array.isArray(recsRaw)
    ? recsRaw
    : Object.keys(recsRaw).map(k => ({ ...recsRaw[k], recordId: k }));
  for (const rec of recList) {
    const rid = rec.recordId;
    if (!rid) continue;
    let toolCalled = 0;
    let toolCalledCorrect = 0;
    if (!rec.per_run_results) {
      out.set(rid, { tool_called: 0, tool_called_correct: 0, misinterp_count: 0 });
      continue;
    }
    for (const run of rec.per_run_results) {
      if (!run.questions) continue;
      for (const q of run.questions) {
        if (!q.runs) continue;
        for (const r of q.runs) {
          if (r.trace && r.trace.tool_call_count > 0) {
            toolCalled++;
            if (r.score === 1) toolCalledCorrect++;
          }
        }
      }
    }
    out.set(rid, {
      tool_called: toolCalled,
      tool_called_correct: toolCalledCorrect,
      misinterp_count: toolCalled - toolCalledCorrect,
    });
  }
  return out;
}

// ─── Build ReleaseGateInput from Slice-19-shaped artifact ────────────────────

interface UnifiedBaselineRecord {
  recordId: string;
  enriched: boolean;
  stratum: string;
  source?: string;
  tool_inspected_mean: number;
  text_only_mean: number;
  random_midi_mean: number;
  margin_tool_inspected_minus_text_only: number;
  tool_inspected_source_sha256?: string | null;
}

interface UnifiedBaseline {
  cohort_size: number;
  source_artifacts: Record<string, string>;
  records: UnifiedBaselineRecord[];
  aggregate: {
    cohort: AggregateBlock;
    enriched: AggregateBlock;
    non_enriched: AggregateBlock;
    per_stratum: Record<string, AggregateBlock>;
  };
  tool_use_profile: {
    cohort: { tool_call_rate: number };
    enriched: { tool_call_rate: number };
    non_enriched: { tool_call_rate: number };
  };
}

interface AggregateBlock {
  n_records: number;
  tool_inspected: { metric_mean: number };
  text_only: { metric_mean: number };
  margin_tool_inspected_minus_text_only: { metric_mean: number };
  records_clearing_tool_minus_text: number;
}

/**
 * Slice 22: build a recordId → per-record-trace-tally map.
 *
 * Source priority order (highest first, last write wins via skip-if-present):
 *   1. slice21-schumann-m045-rerun-results.json  (the rewritten m045 record)
 *   2. slice19-e3-tool-fresh-results.json        (the 3 Slice-19 fresh records)
 *   3. slice18-5-e3-post-repair-results.json     (the 13 Slice-18.5 cohort)
 *
 * The priority ensures that when a record appears in multiple source
 * artifacts, the most-recent / canonical trace data wins. Slice 18.5's
 * old schumann m045 entry is shadowed by the slice21-rerun version.
 */
function buildPerRecordMisinterpMap(
  baseline: UnifiedBaseline,
): {
  byRecordId: Map<string, { source: string; tool_called: number; tool_called_correct: number; misinterp_count: number }>;
  consultedSources: string[];
} {
  const priority: string[] = [];
  // Build priority list by inspecting source_artifacts labels for the
  // canonical slice tags. We hard-code the priority order rather than
  // inferring from label text — explicit beats clever here.
  const sourceMap = baseline.source_artifacts;
  for (const [, relPath] of Object.entries(sourceMap)) {
    if (relPath.includes("slice21-schumann")) priority.unshift(relPath);
    else if (relPath.includes("slice19-e3-tool-fresh")) priority.push(relPath);
    else if (relPath.includes("slice18-5-e3-post-repair")) priority.push(relPath);
  }
  // Stable secondary order: slice21 (head), slice19-tool-fresh, slice18-5.
  // The list order is correct if we built it in the same order — but the
  // `unshift` for slice21 above ensures slice21 leads. The other two
  // appear in insertion order which depends on object key iteration; to
  // make this fully deterministic, sort by precedence string.
  const precedence: Record<string, number> = {
    "slice21": 0,
    "slice19-e3-tool-fresh": 1,
    "slice18-5": 2,
  };
  function precOf(p: string): number {
    if (p.includes("slice21-schumann")) return precedence["slice21"];
    if (p.includes("slice19-e3-tool-fresh")) return precedence["slice19-e3-tool-fresh"];
    if (p.includes("slice18-5")) return precedence["slice18-5"];
    return 99;
  }
  priority.sort((a, b) => precOf(a) - precOf(b));

  const byRecordId = new Map<string, { source: string; tool_called: number; tool_called_correct: number; misinterp_count: number }>();
  const consulted: string[] = [];
  for (const relPath of priority) {
    const abs = join(REPO_ROOT, "datasets", "jam-actions-v0-public", relPath);
    if (!existsSync(abs)) {
      process.stderr.write(`source artifact not found: ${abs}\n`);
      process.exit(1);
    }
    const src = JSON.parse(readFileSync(abs, "utf8"));
    const e3tool = src.results?.["e3-tool"];
    if (!e3tool) continue;
    const perRecord = tallyPerRecordFromArtifact(e3tool);
    for (const [rid, tally] of perRecord) {
      if (byRecordId.has(rid)) continue; // higher-priority source already won
      byRecordId.set(rid, { source: relPath, ...tally });
    }
    consulted.push(relPath);
  }
  return { byRecordId, consultedSources: consulted };
}

function buildGateInput(
  baseline: UnifiedBaseline,
  reportsEnrichedSplit: boolean,
): {
  input: ReleaseGateInput;
  trace_provenance: {
    tool_called: number;
    tool_called_correct: number;
    sources: string[];
    per_record_sources?: Record<string, string>;
  };
} {
  // Slice 22: build the per-record source-priority map for axes 2 + 6.
  const perRecordTally = buildPerRecordMisinterpMap(baseline);

  // Corpus-level tally — sum across the per-record map (consistent
  // attribution; Slice 22 swaps in the slice21-schumann-rerun version of
  // m045 over the slice18-5 version when both exist). The corpus numbers
  // feed axes 4 + 5; axes 4 + 5 logic itself is unchanged.
  let totalToolCalled = 0;
  let totalToolCalledCorrect = 0;
  for (const tally of perRecordTally.byRecordId.values()) {
    totalToolCalled += tally.tool_called;
    totalToolCalledCorrect += tally.tool_called_correct;
  }

  const correctAfterTool = totalToolCalled > 0 ? totalToolCalledCorrect / totalToolCalled : 0;
  const misinterp = totalToolCalled > 0 ? (totalToolCalled - totalToolCalledCorrect) / totalToolCalled : 0;

  const cohort = baseline.aggregate.cohort;
  const enriched = baseline.aggregate.enriched;
  const nonEnriched = baseline.aggregate.non_enriched;

  const perStratum: StratumAssessment[] = Object.entries(baseline.aggregate.per_stratum).map(
    ([key, block]) => ({
      stratum: key,
      n_records: block.n_records,
      margin_tool_minus_text_mean: block.margin_tool_inspected_minus_text_only.metric_mean,
      records_clearing_margin: block.records_clearing_tool_minus_text,
    }),
  );

  // Slice 22: build per_record array. Each entry pairs the unified
  // baseline's per-record condition means (computed at unification time)
  // with the per-record misinterp_count derived from the source tool_
  // inspected traces.
  const perRecord: PerRecordAssessment[] = [];
  const perRecordSources: Record<string, string> = {};
  for (const r of baseline.records) {
    const tally = perRecordTally.byRecordId.get(r.recordId);
    if (!tally) {
      process.stderr.write(
        `WARNING: no tool_inspected source trace for record ${r.recordId}; misinterp_count will be 0\n`,
      );
    }
    perRecord.push({
      recordId: r.recordId,
      stratum: r.stratum,
      tool_inspected_mean: r.tool_inspected_mean,
      text_only_mean: r.text_only_mean,
      random_midi_mean: r.random_midi_mean,
      margin_vs_text_only: r.margin_tool_inspected_minus_text_only,
      misinterp_count: tally?.misinterp_count ?? 0,
    });
    if (tally) perRecordSources[r.recordId] = tally.source;
  }

  const input: ReleaseGateInput = {
    n_records: cohort.n_records,
    tool_inspected_mean: cohort.tool_inspected.metric_mean,
    text_only_mean: cohort.text_only.metric_mean,
    margin_tool_minus_text_mean: cohort.margin_tool_inspected_minus_text_only.metric_mean,
    records_clearing_margin: cohort.records_clearing_tool_minus_text,
    tool_call_rate: baseline.tool_use_profile.cohort.tool_call_rate,
    correct_after_tool_rate: correctAfterTool,
    misinterp_rate: misinterp,
    per_stratum: perStratum,
    per_record: perRecord,
    enriched: {
      n_records: enriched.n_records,
      tool_inspected_mean: enriched.tool_inspected.metric_mean,
      text_only_mean: enriched.text_only.metric_mean,
      margin_tool_minus_text_mean: enriched.margin_tool_inspected_minus_text_only.metric_mean,
      records_clearing_margin: enriched.records_clearing_tool_minus_text,
      tool_call_rate: baseline.tool_use_profile.enriched.tool_call_rate,
    },
    non_enriched: {
      n_records: nonEnriched.n_records,
      tool_inspected_mean: nonEnriched.tool_inspected.metric_mean,
      text_only_mean: nonEnriched.text_only.metric_mean,
      margin_tool_minus_text_mean: nonEnriched.margin_tool_inspected_minus_text_only.metric_mean,
      records_clearing_margin: nonEnriched.records_clearing_tool_minus_text,
      tool_call_rate: baseline.tool_use_profile.non_enriched.tool_call_rate,
    },
    reports_enriched_vs_non_enriched: reportsEnrichedSplit,
  };

  return {
    input,
    trace_provenance: {
      tool_called: totalToolCalled,
      tool_called_correct: totalToolCalledCorrect,
      sources: perRecordTally.consultedSources,
      per_record_sources: perRecordSources,
    },
  };
}

// ─── Human-readable rendering ────────────────────────────────────────────────

interface AssessmentOutput {
  schema_version: string;
  generated_at: string;
  generator: string;
  baseline_artifact: string;
  trace_provenance: {
    tool_called: number;
    tool_called_correct: number;
    sources: string[];
    per_record_sources?: Record<string, string>;
  };
  gate_input: ReleaseGateInput;
  gate_result: ReturnType<typeof evaluateReleaseGate>;
  doctrine_note: string;
}

function renderHuman(result: ReturnType<typeof evaluateReleaseGate>): string {
  const lines: string[] = [];
  const banner = result.schema_version === "release-gate-assessment/2.0.0"
    ? `=== jam-actions-v0 RC Gate Assessment (Slice 22 revised axes 2 + 6; ${result.schema_version}) ===`
    : `=== jam-actions-v0 Slice 20 RC Gate Assessment (${result.schema_version}) ===`;
  lines.push(banner);
  lines.push(``);
  for (const a of result.axes) {
    const status = a.passed ? "PASS" : "FAIL";
    const tag = a.blocking ? "[blocking]" : "[reporting]";
    lines.push(`Axis ${a.axis} ${tag} (${a.name}): ${status}`);
    lines.push(`  ${a.note}`);
  }
  lines.push(``);
  lines.push(`Aggregate: ${result.passed ? "PASS" : "FAIL"}`);
  lines.push(`  ${result.summary}`);
  if (result.blocking_failures.length > 0) {
    lines.push(`  Blocking failures: [${result.blocking_failures.join(", ")}]`);
  }
  if (result.failing_axes.length > 0 && !result.passed) {
    lines.push(`  All failing axes: [${result.failing_axes.join(", ")}]`);
  }
  lines.push(``);
  lines.push(`NOTE: This is a CANDIDATE RC gate. A PASS verdict does NOT mean`);
  lines.push(`the dataset is approved for release.`);
  return lines.join("\n");
}

// ─── main ────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!existsSync(args.baseline)) {
  process.stderr.write(`baseline artifact not found: ${args.baseline}\n`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(args.baseline, "utf8")) as UnifiedBaseline;
const built = buildGateInput(baseline, args.reportsEnrichedSplit);
const result = evaluateReleaseGate(built.input, args.thresholds);

if (!args.quiet) {
  process.stdout.write(renderHuman(result) + "\n");
}

if (args.out) {
  // Schema version comes from gate_result (which derives it from
  // per_record presence). Slice 20 emitted 1.0.0; Slice 22 emits 2.0.0
  // when per_record is supplied (always true via this CLI in Slice 22+).
  const assessment: AssessmentOutput = {
    schema_version: result.schema_version,
    generated_at: new Date().toISOString(),
    generator: "scripts/check-release-gate.ts",
    baseline_artifact: args.baseline.replace(REPO_ROOT + "\\", "").replace(REPO_ROOT + "/", "").replace(/\\/g, "/"),
    trace_provenance: built.trace_provenance,
    gate_input: built.input,
    gate_result: result,
    doctrine_note:
      "Slice 22 REVISED RC gate (axes 2 + 6). A PASS verdict does NOT mean the dataset is approved for release. " +
      "Threshold rationale is documented in docs/jam-actions-v0-slice20-release-threshold-framework.md " +
      "with the Slice 22 revision in docs/jam-actions-v0-slice22-rc-gate-revision.md.",
  };
  writeFileSync(args.out, JSON.stringify(assessment, null, 2) + "\n", "utf8");
  if (!args.quiet) process.stdout.write(`\nwrote assessment to ${args.out}\n`);
}

process.exit(result.passed ? 0 : 1);
