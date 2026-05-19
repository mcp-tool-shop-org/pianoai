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
  per_run_results: { questions: Question[] }[];
}

/**
 * Walk a results artifact and tally tool-called question-runs vs
 * tool-called-correct.
 */
function tallyToolCalledFromArtifact(
  resultsBlock: { records: Record<string, RunResultsRecord> },
): { tool_called: number; tool_called_correct: number } {
  let toolCalled = 0;
  let toolCalledCorrect = 0;
  for (const key of Object.keys(resultsBlock.records)) {
    const rec = resultsBlock.records[key];
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

// ─── Build ReleaseGateInput from Slice-19-shaped artifact ────────────────────

interface UnifiedBaseline {
  cohort_size: number;
  source_artifacts: Record<string, string>;
  records: Array<{
    recordId: string;
    enriched: boolean;
    stratum: string;
    margin_tool_inspected_minus_text_only: number;
  }>;
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

function buildGateInput(
  baseline: UnifiedBaseline,
  reportsEnrichedSplit: boolean,
): { input: ReleaseGateInput; trace_provenance: { tool_called: number; tool_called_correct: number; sources: string[] } } {
  // Resolve source artifacts and tally tool-called question-runs.
  let totalToolCalled = 0;
  let totalToolCalledCorrect = 0;
  const sources: string[] = [];

  for (const [, relPath] of Object.entries(baseline.source_artifacts)) {
    if (!relPath.includes("e3") || relPath.includes("fresh-cohort")) continue;
    // We want only artifacts that contain `tool_inspected` traces:
    //   - slice18-5-e3-post-repair-results.json
    //   - slice19-e3-tool-fresh-results.json
    // The third source (slice19-e3-fresh-cohort-results.json) contains
    // text_only/full/random_midi only — skip via the include check above.
    const abs = join(REPO_ROOT, "datasets", "jam-actions-v0-public", relPath);
    if (!existsSync(abs)) {
      process.stderr.write(`source artifact not found: ${abs}\n`);
      process.exit(1);
    }
    const src = JSON.parse(readFileSync(abs, "utf8"));
    const e3tool = src.results?.["e3-tool"];
    if (!e3tool) continue;
    const tally = tallyToolCalledFromArtifact(e3tool);
    totalToolCalled += tally.tool_called;
    totalToolCalledCorrect += tally.tool_called_correct;
    sources.push(relPath);
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
      sources,
    },
  };
}

// ─── Human-readable rendering ────────────────────────────────────────────────

interface AssessmentOutput {
  schema_version: string;
  generated_at: string;
  generator: string;
  baseline_artifact: string;
  trace_provenance: { tool_called: number; tool_called_correct: number; sources: string[] };
  gate_input: ReleaseGateInput;
  gate_result: ReturnType<typeof evaluateReleaseGate>;
  doctrine_note: string;
}

function renderHuman(result: ReturnType<typeof evaluateReleaseGate>): string {
  const lines: string[] = [];
  lines.push(`=== jam-actions-v0 Slice 20 RC Gate Assessment ===`);
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
  const assessment: AssessmentOutput = {
    schema_version: "release-gate-assessment/1.0.0",
    generated_at: new Date().toISOString(),
    generator: "scripts/check-release-gate.ts",
    baseline_artifact: args.baseline.replace(REPO_ROOT + "\\", "").replace(REPO_ROOT + "/", "").replace(/\\/g, "/"),
    trace_provenance: built.trace_provenance,
    gate_input: built.input,
    gate_result: result,
    doctrine_note:
      "Slice 20 CANDIDATE RC gate. A PASS verdict does NOT mean the dataset is approved for release. " +
      "Threshold rationale is documented in docs/jam-actions-v0-slice20-release-threshold-framework.md.",
  };
  writeFileSync(args.out, JSON.stringify(assessment, null, 2) + "\n", "utf8");
  if (!args.quiet) process.stdout.write(`\nwrote assessment to ${args.out}\n`);
}

process.exit(result.passed ? 0 : 1);
