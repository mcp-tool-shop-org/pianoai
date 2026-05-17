#!/usr/bin/env tsx
// ─── run-llm-eval.ts — Slice 7.5 LLM-in-the-Loop CLI (Backend-Agnostic) ──────
//
// Runs E1/E2/E3 evals through the selected LLM backend.
// Default backend: ollama-intern (wraps raw Ollama HTTP).
//
// Usage:
//   pnpm exec tsx scripts/run-llm-eval.ts --backend ollama-intern --model hermes3:8b
//   pnpm exec tsx scripts/run-llm-eval.ts --backend ollama --model qwen2.5:7b
//   pnpm exec tsx scripts/run-llm-eval.ts --backend anthropic --model claude-sonnet-4-5
//
// Required flags:
//   --backend ollama|ollama-intern|anthropic  (default: ollama-intern)
//   --model <name>                            (required)
//
// Optional:
//   --help     Show usage and exit
//   --dry-run  Validate setup without running eval
//
// Output:
//   datasets/jam-actions-v0/evals/llm-in-the-loop-results.json
//   docs/jam-actions-v0-slice7-5-llm-run.md
//
// Hard gates (exit 1 if any fail):
//   E1: ≥ 70% of test records pass (majority-pass per record)
//   E2: groove OA majority-pass ≥ 0.797 per pair
//   E3: full context beats text-only by ≥ 0.10 AND beats random-MIDI by ≥ 0.10
//
// Scope: TEST SET ONLY (4 clair-de-lune records). Train records never touched.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runE1ForRecord,
  runE2ForPair,
  runE3ForRecord,
  majorityPass,
  checkE3Margins,
  E2_GROOVE_THRESHOLD,
  E3_MARGIN_THRESHOLD,
  E1_GOLD_PASS_RATE_THRESHOLD,
  type LlmBackend,
  type E1RunResult,
  type E2RunResult,
  type E3RecordResult,
} from "../src/dataset/eval/llm-runner.js";
import { loadToolSchemaCatalog } from "../src/dataset/trace-validator.js";
import type { ToolSchemaCatalog } from "../src/dataset/trace-validator.js";
import type { PairRecord } from "../src/dataset/eval/phrase-continuation.js";
import type { E3Record } from "../src/dataset/eval/annotation-grounding.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const RECORDS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0", "records");
const SPLITS_PATH = join(REPO_ROOT, "datasets", "jam-actions-v0", "splits.json");
const EVALS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0", "evals");
const DOCS_DIR = join(REPO_ROOT, "docs");
const RESULTS_PATH = join(EVALS_DIR, "llm-in-the-loop-results.json");
const REPORT_PATH = join(DOCS_DIR, "jam-actions-v0-slice7-5-llm-run.md");

// ─── Backend type ─────────────────────────────────────────────────────────────

type BackendName = "ollama" | "ollama-intern" | "anthropic";

// ─── CLI argument parsing ─────────────────────────────────────────────────────

function parseArgs(): {
  backend: BackendName;
  model: string;
  dryRun: boolean;
  help: boolean;
} {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    return { backend: "ollama-intern", model: "", dryRun: false, help: true };
  }

  let backend: BackendName = "ollama-intern";
  let model = "";
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--backend" && i + 1 < args.length) {
      const b = args[++i];
      if (b !== "ollama" && b !== "ollama-intern" && b !== "anthropic") {
        console.error(`ERROR: Unknown backend "${b}". Valid options: ollama, ollama-intern, anthropic`);
        process.exit(1);
      }
      backend = b as BackendName;
    } else if (args[i] === "--model" && i + 1 < args.length) {
      model = args[++i];
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  return { backend, model, dryRun, help: false };
}

const opts = parseArgs();

// ─── Help text ────────────────────────────────────────────────────────────────

if (opts.help) {
  console.log(`
jam-actions-v0 LLM-in-the-Loop Eval Runner (Slice 7.5)

Usage:
  pnpm exec tsx scripts/run-llm-eval.ts --backend <backend> --model <model>

Required:
  --backend ollama|ollama-intern|anthropic  Backend to use (default: ollama-intern)
  --model <name>                            Model identifier (required)

Optional:
  --dry-run    Validate setup without running the eval
  --help       Show this help text

Backends:
  ollama         Raw Ollama HTTP (localhost:11434). Free, local. Requires ollama serve.
                 Recommended models: hermes3:8b, qwen2.5:7b
  ollama-intern  Same as ollama (uses Ollama HTTP directly, same as intern does internally).
                 See llm-backends/ollama-intern.ts for design rationale.
  anthropic      Anthropic API (optional, opt-in only). Requires ANTHROPIC_API_KEY.
                 Recommended models: claude-sonnet-4-5, claude-haiku-4-5

Examples:
  pnpm exec tsx scripts/run-llm-eval.ts --backend ollama-intern --model hermes3:8b
  pnpm exec tsx scripts/run-llm-eval.ts --backend ollama --model qwen2.5:7b
  pnpm exec tsx scripts/run-llm-eval.ts --backend anthropic --model claude-sonnet-4-5

Hard gates (exit 1 if any fail):
  E1: gold pass rate ≥ ${E1_GOLD_PASS_RATE_THRESHOLD * 100}%
  E2: groove OA ≥ ${E2_GROOVE_THRESHOLD} per pair
  E3: full context > text-only by ≥ ${E3_MARGIN_THRESHOLD} AND > random-MIDI by ≥ ${E3_MARGIN_THRESHOLD}

Output:
  ${RESULTS_PATH}
  ${REPORT_PATH}
`);
  process.exit(0);
}

// ─── Validate --model ─────────────────────────────────────────────────────────

if (!opts.model) {
  console.error(
    "ERROR: --model is required.\n" +
      "Examples:\n" +
      "  --model hermes3:8b\n" +
      "  --model qwen2.5:7b\n" +
      "  --model claude-sonnet-4-5\n\n" +
      "Run with --help for full usage.",
  );
  process.exit(1);
}

// ─── Backend factory ──────────────────────────────────────────────────────────

async function createBackend(name: BackendName, model: string): Promise<LlmBackend> {
  switch (name) {
    case "ollama": {
      const { OllamaBackend } = await import(
        "../src/dataset/eval/llm-backends/ollama.js"
      );
      return new OllamaBackend(model);
    }
    case "ollama-intern": {
      const { OllamaInternBackend } = await import(
        "../src/dataset/eval/llm-backends/ollama-intern.js"
      );
      return new OllamaInternBackend(model);
    }
    case "anthropic": {
      // Anthropic only loaded dynamically when explicitly requested
      if (!process.env.ANTHROPIC_API_KEY) {
        console.error(
          "ERROR: ANTHROPIC_API_KEY is not set in environment.\n" +
            "Export it before running:\n" +
            "  export ANTHROPIC_API_KEY=sk-ant-...\n\n" +
            "Or choose a local backend:\n" +
            "  --backend ollama --model hermes3:8b\n" +
            "  --backend ollama-intern --model hermes3:8b",
        );
        process.exit(1);
      }
      const { AnthropicBackend } = await import(
        "../src/dataset/eval/llm-backends/anthropic.js"
      );
      return new AnthropicBackend(model);
    }
  }
}

// ─── Backend reachability probe ───────────────────────────────────────────────

async function probeBackend(
  backend: LlmBackend,
  backendName: BackendName,
): Promise<void> {
  if (backendName === "anthropic") {
    // Anthropic: key is already validated in constructor; no probe needed
    console.log("  Anthropic API key present. Will validate on first API call.");
    return;
  }

  // Ollama backends: probe /api/tags
  const backendWithProbe = backend as LlmBackend & { probe?: () => Promise<void> };
  if (typeof backendWithProbe.probe === "function") {
    try {
      await backendWithProbe.probe();
      console.log(`  Ollama reachable.`);
    } catch (err) {
      console.error(`\nERROR: ${String(err)}`);
      process.exit(1);
    }
  }
}

// ─── Parameters ───────────────────────────────────────────────────────────────

const N_RUNS = 3;

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(`\njam-actions-v0 Slice 7.5 — LLM-in-the-Loop Eval`);
console.log(`Backend: ${opts.backend} | Model: ${opts.model}`);
console.log(`n per task: ${N_RUNS} (majority-pass = ≥${Math.ceil(N_RUNS / 2)}/${N_RUNS})\n`);

// Create backend
const backend = await createBackend(opts.backend, opts.model);
console.log(`Backend created: ${backend.name} / ${backend.model}`);

// Probe reachability
console.log("Probing backend...");
await probeBackend(backend, opts.backend);

if (opts.dryRun) {
  console.log("\nDry run complete. Backend is reachable. Use --no-dry-run to run the full eval.");
  process.exit(0);
}

// ─── Load splits + records ────────────────────────────────────────────────────

function loadRecord(id: string): Record<string, unknown> {
  const parts = id.split(":");
  const songPart = parts[0];
  const measurePart = parts[1];
  const filename = `${songPart}-${measurePart}.json`;
  const path = join(RECORDS_DIR, filename);
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

const splits = JSON.parse(readFileSync(SPLITS_PATH, "utf8")) as {
  test: string[];
  train: string[];
};

const testIds = splits.test;
console.log(`\nTest set: ${testIds.length} records`);
console.log(`Records: ${testIds.join(", ")}\n`);

const testRecords = testIds.map((id) => {
  const r = loadRecord(id);
  if ((r as { id: string }).id !== id) {
    throw new Error(`Record ID mismatch: expected "${id}", got "${(r as { id: string }).id}"`);
  }
  return r as Record<string, unknown> & { id: string };
});

const allTestE3Records = testRecords as unknown as E3Record[];

// ─── Load tool catalog ────────────────────────────────────────────────────────

const catalog: ToolSchemaCatalog = loadToolSchemaCatalog();
console.log(`Tool catalog: ${catalog.tool_count} tools from ${catalog.derived_from}\n`);

// ─── Identify E2 pairs ────────────────────────────────────────────────────────

interface TestPair {
  promptId: string;
  targetId: string;
}

function findPairs(records: Array<{ id: string; scope?: Record<string, unknown> }>): TestPair[] {
  const pairs: TestPair[] = [];
  for (const r of records) {
    const scope = r.scope as { window_role?: string } | undefined;
    if (scope?.window_role === "prompt") {
      const target = records.find((t) => {
        const ts = t.scope as { window_role?: string; paired_prompt_record_id?: string } | undefined;
        return ts?.window_role === "continuation_target" && ts?.paired_prompt_record_id === r.id;
      });
      if (target) pairs.push({ promptId: r.id, targetId: target.id });
    }
  }
  return pairs;
}

const testPairs = findPairs(testRecords as Array<{ id: string; scope?: Record<string, unknown> }>);
console.log(`E2 pairs found: ${testPairs.length}`);
testPairs.forEach((p) => console.log(`  ${p.promptId} → ${p.targetId}`));
console.log();

// ─── Results accumulator ──────────────────────────────────────────────────────

interface RecordE1Result {
  recordId: string;
  runs: E1RunResult[];
  passedCount: number;
  majorityPass: boolean;
}

interface PairE2RunResult {
  promptId: string;
  targetId: string;
  runs: E2RunResult[];
  passedCount: number;
  majorityPass: boolean;
  grooveOAs: (number | null)[];
  meanGrooveOA: number | null;
}

// ─── Run E1 ───────────────────────────────────────────────────────────────────

console.log("━━━ E1: Tool-Use Correctness ━━━");
const e1Results: RecordE1Result[] = [];

for (const record of testRecords) {
  const recId = record.id;
  console.log(`\n  Record: ${recId}`);
  const runs: E1RunResult[] = [];

  for (let i = 0; i < N_RUNS; i++) {
    process.stdout.write(`    run ${i + 1}/${N_RUNS}...`);
    const result = await runE1ForRecord(
      record as unknown as Parameters<typeof runE1ForRecord>[0],
      catalog,
      backend,
      i,
    );
    runs.push(result);
    const status = result.passed ? "PASS" : "FAIL";
    const costStr = result.meta.costUsd > 0 ? ` $${result.meta.costUsd.toFixed(5)}` : " $0 (local)";
    console.log(
      ` ${status} | tokens: ${result.meta.promptTokens}/${result.meta.completionTokens} |${costStr} | ${result.meta.latencyMs}ms`,
    );
    if (!result.meta.parseOk) {
      console.log(`      parseError: ${result.meta.parseError}`);
    }
  }

  const passedCount = runs.filter((r) => r.passed).length;
  const majority = majorityPass(runs.map((r) => ({ score: r.passed ? 1 : 0 })));
  e1Results.push({ recordId: recId, runs, passedCount, majorityPass: majority });
  console.log(`  → majority: ${majority ? "PASS" : "FAIL"} (${passedCount}/${N_RUNS})`);
}

const e1PassRate = e1Results.filter((r) => r.majorityPass).length / e1Results.length;
const e1Passed = e1PassRate >= E1_GOLD_PASS_RATE_THRESHOLD;
console.log(
  `\nE1 aggregate pass rate: ${(e1PassRate * 100).toFixed(1)}% (threshold: ${E1_GOLD_PASS_RATE_THRESHOLD * 100}%) → ${e1Passed ? "PASS" : "FAIL"}`,
);

// ─── Run E2 ───────────────────────────────────────────────────────────────────

console.log("\n━━━ E2: Phrase Continuation ━━━");
const e2Results: PairE2RunResult[] = [];

for (const pair of testPairs) {
  const promptRec = testRecords.find((r) => r.id === pair.promptId)!;
  const targetRec = testRecords.find((r) => r.id === pair.targetId)!;
  console.log(`\n  Pair: ${pair.promptId} → ${pair.targetId}`);
  const runs: E2RunResult[] = [];

  for (let i = 0; i < N_RUNS; i++) {
    process.stdout.write(`    run ${i + 1}/${N_RUNS}...`);
    const result = await runE2ForPair(
      promptRec as unknown as Parameters<typeof runE2ForPair>[0],
      targetRec as unknown as PairRecord,
      backend,
      i,
    );
    runs.push(result);
    const status = result.passed ? "PASS" : "FAIL";
    const grooveStr = result.grooveOA !== null ? result.grooveOA.toFixed(3) : "n/a";
    const costStr = result.meta.costUsd > 0 ? ` $${result.meta.costUsd.toFixed(5)}` : " $0 (local)";
    console.log(
      ` ${status} | grooveOA: ${grooveStr} (≥${E2_GROOVE_THRESHOLD}) |${costStr} | ${result.meta.latencyMs}ms`,
    );
    if (!result.meta.parseOk) {
      console.log(`      parseError: ${result.meta.parseError}`);
    }
  }

  const passedCount = runs.filter((r) => r.passed).length;
  const majority = majorityPass(runs.map((r) => ({ score: r.passed ? 1 : 0 })));
  const grooveOAs = runs.map((r) => r.grooveOA);
  const validOAs = grooveOAs.filter((v) => v !== null) as number[];
  const meanGrooveOA =
    validOAs.length > 0 ? validOAs.reduce((s, v) => s + v, 0) / validOAs.length : null;

  e2Results.push({ promptId: pair.promptId, targetId: pair.targetId, runs, passedCount, majority, grooveOAs, meanGrooveOA } as PairE2RunResult & { majority: boolean });
  console.log(
    `  → majority: ${majority ? "PASS" : "FAIL"} (${passedCount}/${N_RUNS}) | mean grooveOA: ${meanGrooveOA?.toFixed(3) ?? "n/a"}`,
  );
}

const e2Passed = e2Results.every((r) => r.majorityPass);
console.log(
  `\nE2 pair pass rate: ${e2Results.filter((r) => r.majorityPass).length}/${e2Results.length} pairs → ${e2Passed ? "PASS" : "FAIL"}`,
);

// ─── Run E3 ───────────────────────────────────────────────────────────────────

console.log("\n━━━ E3: Annotation Grounding MCQ (load-bearing types 3,4,5,7) ━━━");
const e3Results: E3RecordResult[] = [];

for (const record of testRecords) {
  const recId = record.id;
  console.log(`\n  Record: ${recId}`);
  const result = await runE3ForRecord(
    record as unknown as E3Record,
    allTestE3Records,
    backend,
    N_RUNS,
  );
  e3Results.push(result);

  for (const qResult of result.questions) {
    console.log(`    Q: ${qResult.questionType}`);
    for (const ctx of ["full", "text_only", "random_midi"] as const) {
      const ctxRuns = qResult.runs[ctx];
      const passes = ctxRuns.filter((r) => r.score === 1).length;
      console.log(
        `      ${ctx}: ${passes}/${N_RUNS} correct | majority: ${qResult.majorityScore[ctx] === 1 ? "PASS" : "FAIL"}`,
      );
    }
  }

  const margins = checkE3Margins(result);
  const agg = result.aggregate;
  console.log(
    `  → full: ${agg.full?.toFixed(3) ?? "n/a"} | text_only: ${agg.text_only?.toFixed(3) ?? "n/a"} | random_midi: ${agg.random_midi?.toFixed(3) ?? "n/a"}`,
  );
  console.log(
    `  → margins: vs text_only ${margins.fullVsTextOnly ? "PASS" : "FAIL"} | vs random_midi ${margins.fullVsRandomMidi ? "PASS" : "FAIL"}`,
  );
  const recordCostStr = result.totalCostUsd > 0 ? `$${result.totalCostUsd.toFixed(4)}` : "$0 (local)";
  console.log(`  → cost: ${recordCostStr}`);
}

function meanOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v) => v !== null) as number[];
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

const e3AggFull = meanOrNull(e3Results.map((r) => r.aggregate.full));
const e3AggTextOnly = meanOrNull(e3Results.map((r) => r.aggregate.text_only));
const e3AggRandomMidi = meanOrNull(e3Results.map((r) => r.aggregate.random_midi));

const e3MarginVsTextOnly =
  e3AggFull !== null && e3AggTextOnly !== null
    ? e3AggFull - e3AggTextOnly >= E3_MARGIN_THRESHOLD
    : false;
const e3MarginVsRandomMidi =
  e3AggFull !== null && e3AggRandomMidi !== null
    ? e3AggFull - e3AggRandomMidi >= E3_MARGIN_THRESHOLD
    : false;
const e3Passed = e3MarginVsTextOnly && e3MarginVsRandomMidi;

console.log(`\nE3 aggregate (over ${e3Results.length} records):`);
console.log(`  full: ${e3AggFull?.toFixed(3) ?? "n/a"}`);
console.log(`  text_only: ${e3AggTextOnly?.toFixed(3) ?? "n/a"}`);
console.log(`  random_midi: ${e3AggRandomMidi?.toFixed(3) ?? "n/a"}`);
console.log(`  full vs text_only (≥${E3_MARGIN_THRESHOLD}): ${e3MarginVsTextOnly ? "PASS" : "FAIL"}`);
console.log(`  full vs random_midi (≥${E3_MARGIN_THRESHOLD}): ${e3MarginVsRandomMidi ? "PASS" : "FAIL"}`);

// ─── Cost summary ─────────────────────────────────────────────────────────────

const totalCostE1 = e1Results.flatMap((r) => r.runs).reduce((s, r) => s + r.meta.costUsd, 0);
const totalCostE2 = e2Results.flatMap((r) => r.runs).reduce((s, r) => s + r.meta.costUsd, 0);
const totalCostE3 = e3Results.reduce((s, r) => s + r.totalCostUsd, 0);
const totalCost = totalCostE1 + totalCostE2 + totalCostE3;

console.log(`\n━━━ Cost Summary ━━━`);
if (totalCost === 0) {
  console.log(`  Total: $0.00 (local inference — free)`);
} else {
  console.log(`  E1: $${totalCostE1.toFixed(4)}`);
  console.log(`  E2: $${totalCostE2.toFixed(4)}`);
  console.log(`  E3: $${totalCostE3.toFixed(4)}`);
  console.log(`  Total: $${totalCost.toFixed(4)}`);
}

// ─── Write machine output ─────────────────────────────────────────────────────

if (!existsSync(EVALS_DIR)) mkdirSync(EVALS_DIR, { recursive: true });
if (!existsSync(DOCS_DIR)) mkdirSync(DOCS_DIR, { recursive: true });

const machineOutput = {
  schema_version: "llm-in-the-loop/1.0.0",
  generated_at: new Date().toISOString(),
  backend: opts.backend,
  model: opts.model,
  n_runs: N_RUNS,
  test_set: testIds,
  parameters: {
    failure_mode: "majority-pass",
    e1_threshold: E1_GOLD_PASS_RATE_THRESHOLD,
    e2_groove_threshold: E2_GROOVE_THRESHOLD,
    e3_margin_threshold: E3_MARGIN_THRESHOLD,
    e3_question_types: ["pitch_class_count", "hand_register", "rhythm_onset", "annotation_grounding"],
  },
  results: {
    e1: {
      records: e1Results.map((r) => ({
        recordId: r.recordId,
        majorityPass: r.majorityPass,
        passedCount: r.passedCount,
        totalRuns: N_RUNS,
        runs: r.runs.map((run) => ({
          run: run.run,
          passed: run.passed,
          meta: run.meta,
          toolCallCount: run.toolCalls.length,
          toolCalls: run.toolCalls,
          evaluation: run.evaluation
            ? {
                overallScore: run.evaluation.overallScore,
                trajectoryValid: run.evaluation.trajectoryValid,
                multiTurnDependencyValid: run.evaluation.multiTurnDependencyValid,
                toolCallCount: run.evaluation.toolCalls.length,
              }
            : null,
        })),
      })),
      aggregate: {
        passRate: e1PassRate,
        recordsPass: e1Results.filter((r) => r.majorityPass).length,
        recordsTotal: e1Results.length,
        thresholdMet: e1Passed,
        threshold: E1_GOLD_PASS_RATE_THRESHOLD,
      },
    },
    e2: {
      pairs: e2Results.map((r) => ({
        promptId: r.promptId,
        targetId: r.targetId,
        majorityPass: r.majorityPass,
        passedCount: r.passedCount,
        totalRuns: N_RUNS,
        meanGrooveOA: r.meanGrooveOA,
        grooveOAs: r.grooveOAs,
        runs: r.runs.map((run) => ({
          run: run.run,
          passed: run.passed,
          grooveOA: run.grooveOA,
          meta: run.meta,
          parsedOutput: run.parsedOutput
            ? { tokenCount: run.parsedOutput.tokens_remi.length, hasAbc: run.parsedOutput.tokens_abc.length > 0 }
            : null,
        })),
      })),
      aggregate: {
        pairsPass: e2Results.filter((r) => r.majorityPass).length,
        pairsTotal: e2Results.length,
        allPairsPass: e2Passed,
        threshold: E2_GROOVE_THRESHOLD,
      },
    },
    e3: {
      records: e3Results.map((r) => ({
        recordId: r.recordId,
        randomMidiPartnerId: r.randomMidiPartnerId,
        aggregate: r.aggregate,
        totalCostUsd: r.totalCostUsd,
        questions: r.questions.map((q) => ({
          questionType: q.questionType,
          questionText: q.questionText,
          correctOptionIndex: q.correctOptionIndex,
          options: q.options,
          majorityScore: q.majorityScore,
          runs: {
            full: q.runs.full.map((run) => ({ run: run.run, score: run.score, selectedOptionIndex: run.selectedOptionIndex, meta: run.meta })),
            text_only: q.runs.text_only.map((run) => ({ run: run.run, score: run.score, selectedOptionIndex: run.selectedOptionIndex, meta: run.meta })),
            random_midi: q.runs.random_midi.map((run) => ({ run: run.run, score: run.score, selectedOptionIndex: run.selectedOptionIndex, meta: run.meta })),
          },
        })),
      })),
      aggregate: {
        full: e3AggFull,
        text_only: e3AggTextOnly,
        random_midi: e3AggRandomMidi,
        marginVsTextOnly: e3AggFull !== null && e3AggTextOnly !== null ? e3AggFull - e3AggTextOnly : null,
        marginVsRandomMidi: e3AggFull !== null && e3AggRandomMidi !== null ? e3AggFull - e3AggRandomMidi : null,
        thresholdMet: e3Passed,
        threshold: E3_MARGIN_THRESHOLD,
      },
    },
  },
  cost: {
    totalUsd: totalCost,
    isLocal: totalCost === 0,
    byEval: { e1: totalCostE1, e2: totalCostE2, e3: totalCostE3 },
  },
};

writeFileSync(RESULTS_PATH, JSON.stringify(machineOutput, null, 2), "utf8");
console.log(`\nMachine output: ${RESULTS_PATH}`);

// ─── Write human report ───────────────────────────────────────────────────────

function fmtPass(pass: boolean): string {
  return pass ? "PASS" : "FAIL";
}

function fmtPct(n: number | null): string {
  if (n === null) return "n/a";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtOA(n: number | null): string {
  if (n === null) return "n/a";
  return n.toFixed(3);
}

function fmtCost(cost: number): string {
  return cost === 0 ? "$0.00 (local — free)" : `$${cost.toFixed(4)}`;
}

const report = `# jam-actions-v0 Slice 7.5 — LLM-in-the-Loop Results

**Generated:** ${new Date().toISOString()}
**Backend:** ${opts.backend}
**Model:** ${opts.model}
**Test set:** ${testIds.join(", ")}
**n per task:** ${N_RUNS} (majority-pass = ≥${Math.ceil(N_RUNS / 2)}/${N_RUNS})
**Total cost:** ${fmtCost(totalCost)}

---

## Summary

| Eval | Result | Threshold |
|------|--------|-----------|
| E1 — Tool-use correctness | ${fmtPass(e1Passed)} — ${fmtPct(e1PassRate)} pass rate | ≥ ${fmtPct(E1_GOLD_PASS_RATE_THRESHOLD)} |
| E2 — Phrase continuation | ${fmtPass(e2Passed)} — ${e2Results.filter((r) => r.majorityPass).length}/${e2Results.length} pairs | groove OA ≥ ${E2_GROOVE_THRESHOLD} |
| E3 — Annotation grounding | ${fmtPass(e3Passed)} — margins below | full > baselines by ≥ ${E3_MARGIN_THRESHOLD} |

---

## Backend Architecture

- **Primary local backend:** \`ollama-intern\` (wraps raw Ollama HTTP to localhost:11434)
- **Secondary local backend:** \`ollama\` (direct raw Ollama HTTP)
- **Optional paid backend:** \`anthropic\` (requires ANTHROPIC_API_KEY; gated behind --backend anthropic)

### ollama-intern finding

\`ollama-intern-mcp\` exposes \`ollama_chat\` (generic chat tool with messages[], system, model).
For eval purposes, the OllamaInternBackend calls Ollama HTTP directly (same endpoint the intern uses
internally) rather than adding MCP protocol overhead. This is the correct behavior for iterative eval
loops — the intern's value is in bulk analysis, corpus management, and memory, not raw inference.

### Model recommendations

For tool-use evals (E1), use a model with native function-calling support:
- \`hermes3:8b\` — best tool-use in 8B class
- \`qwen2.5:7b\` — solid alternative
- \`llama3.1:8b\` — Llama 3.1+ has native tool-use

Pull models before running: \`ollama pull hermes3:8b\`

---

## E1 — Tool-Use Correctness

Threshold: ≥ ${fmtPct(E1_GOLD_PASS_RATE_THRESHOLD)} of records pass (majority-pass per record).

${e1Results.map((r) =>
  `**${r.recordId}** — ${fmtPass(r.majorityPass)} (${r.passedCount}/${N_RUNS} runs passed)\n` +
  r.runs.map((run) =>
    `- Run ${run.run}: ${run.passed ? "PASS" : "FAIL"} | ` +
    `tokens: ${run.meta.promptTokens}/${run.meta.completionTokens} | ` +
    `cost: ${fmtCost(run.meta.costUsd)} | ${run.meta.latencyMs}ms` +
    (!run.meta.parseOk ? ` | parseError: ${run.meta.parseError}` : "")
  ).join("\n")
).join("\n\n")}

**Aggregate:** ${fmtPct(e1PassRate)} (${e1Results.filter((r) => r.majorityPass).length}/${e1Results.length}) → **${fmtPass(e1Passed)}**

---

## E2 — Phrase Continuation

Threshold: groove OA ≥ ${E2_GROOVE_THRESHOLD} for majority of runs per pair.

${e2Results.map((r) =>
  `**${r.promptId} → ${r.targetId}** — ${fmtPass(r.majorityPass)} (${r.passedCount}/${N_RUNS})\n` +
  `Mean groove OA: ${fmtOA(r.meanGrooveOA)} (threshold: ${E2_GROOVE_THRESHOLD})\n` +
  r.runs.map((run) =>
    `- Run ${run.run}: ${run.passed ? "PASS" : "FAIL"} | grooveOA: ${fmtOA(run.grooveOA)} | ` +
    `cost: ${fmtCost(run.meta.costUsd)} | ${run.meta.latencyMs}ms` +
    (!run.meta.parseOk ? ` | parseError: ${run.meta.parseError}` : "")
  ).join("\n")
).join("\n\n")}

**Aggregate:** ${e2Results.filter((r) => r.majorityPass).length}/${e2Results.length} pairs → **${fmtPass(e2Passed)}**

---

## E3 — Annotation Grounding MCQ

Question types: load-bearing only (pitch_class_count, hand_register, rhythm_onset, annotation_grounding).
Three contexts: full (MIDI+annotation), text-only (annotation prose only), random-MIDI (wrong MIDI).
Threshold: full > text-only by ≥ ${E3_MARGIN_THRESHOLD} AND full > random-MIDI by ≥ ${E3_MARGIN_THRESHOLD}.

${e3Results.map((r) => {
  const margins = checkE3Margins(r);
  return `**${r.recordId}**
Aggregate: full=${fmtOA(r.aggregate.full)} | text_only=${fmtOA(r.aggregate.text_only)} | random_midi=${fmtOA(r.aggregate.random_midi)}
Margins: vs text_only ${fmtPass(margins.fullVsTextOnly)} | vs random_midi ${fmtPass(margins.fullVsRandomMidi)}
Cost: ${fmtCost(r.totalCostUsd)}

${r.questions.map((q) =>
  `  Q: ${q.questionType} — "${q.questionText.substring(0, 70)}..."\n` +
  `  Options: ${q.options.join(" | ")} (correct: ${["A","B","C","D"][q.correctOptionIndex]})\n` +
  `  full: ${q.majorityScore.full === 1 ? "PASS" : "FAIL"} | ` +
  `text_only: ${q.majorityScore.text_only === 1 ? "PASS" : "FAIL"} | ` +
  `random_midi: ${q.majorityScore.random_midi === 1 ? "PASS" : "FAIL"}`
).join("\n\n")}`;
}).join("\n\n---\n\n")}

### Aggregate (${e3Results.length} records)

| Context | Score | vs Full |
|---------|-------|---------|
| Full | ${fmtOA(e3AggFull)} | — |
| Text-only | ${fmtOA(e3AggTextOnly)} | ${e3AggFull !== null && e3AggTextOnly !== null ? (e3AggFull - e3AggTextOnly).toFixed(3) : "n/a"} margin |
| Random-MIDI | ${fmtOA(e3AggRandomMidi)} | ${e3AggFull !== null && e3AggRandomMidi !== null ? (e3AggFull - e3AggRandomMidi).toFixed(3) : "n/a"} margin |

Threshold: vs text_only **${fmtPass(e3MarginVsTextOnly)}** | vs random_midi **${fmtPass(e3MarginVsRandomMidi)}**

---

## Run Commands

Local backend (no API key needed):
\`\`\`
pnpm exec tsx scripts/run-llm-eval.ts --backend ollama-intern --model hermes3:8b
pnpm exec tsx scripts/run-llm-eval.ts --backend ollama --model qwen2.5:7b
\`\`\`

Optional Anthropic comparison:
\`\`\`
ANTHROPIC_API_KEY=sk-ant-... pnpm exec tsx scripts/run-llm-eval.ts --backend anthropic --model claude-sonnet-4-5
\`\`\`

Dry-run to validate setup:
\`\`\`
pnpm exec tsx scripts/run-llm-eval.ts --backend ollama --model hermes3:8b --dry-run
\`\`\`
`;

writeFileSync(REPORT_PATH, report, "utf8");
console.log(`Human report: ${REPORT_PATH}`);

// ─── Final verdict + hard gate ─────────────────────────────────────────────────

console.log("\n━━━ Final Verdict ━━━");
console.log(`  E1: ${fmtPass(e1Passed)} (${fmtPct(e1PassRate)} pass rate)`);
console.log(`  E2: ${fmtPass(e2Passed)} (${e2Results.filter((r) => r.majorityPass).length}/${e2Results.length} pairs)`);
console.log(
  `  E3: ${fmtPass(e3Passed)} (full=${fmtOA(e3AggFull)}, vs text_only Δ=${e3AggFull !== null && e3AggTextOnly !== null ? (e3AggFull - e3AggTextOnly).toFixed(3) : "n/a"}, vs random_midi Δ=${e3AggFull !== null && e3AggRandomMidi !== null ? (e3AggFull - e3AggRandomMidi).toFixed(3) : "n/a"})`,
);
console.log(`  Cost: ${fmtCost(totalCost)}`);

const allPassed = e1Passed && e2Passed && e3Passed;
if (!allPassed) {
  const failures: string[] = [];
  if (!e1Passed) failures.push(`E1 (${fmtPct(e1PassRate)} < ${fmtPct(E1_GOLD_PASS_RATE_THRESHOLD)})`);
  if (!e2Passed) failures.push(`E2 (${e2Results.filter((r) => r.majorityPass).length}/${e2Results.length} pairs)`);
  if (!e3Passed)
    failures.push(
      `E3 (margins: vs text_only ${e3AggFull !== null && e3AggTextOnly !== null ? (e3AggFull - e3AggTextOnly).toFixed(3) : "n/a"}, vs random_midi ${e3AggFull !== null && e3AggRandomMidi !== null ? (e3AggFull - e3AggRandomMidi).toFixed(3) : "n/a"})`,
    );
  console.log(`\nFAILED thresholds: ${failures.join("; ")}`);
  console.log(
    "This is expected for E2/E3 without fine-tuning. " +
      "A local 8B model failing these thresholds IS the signal — it shows the gap fine-tuning on jam-actions-v0 records needs to close.",
  );
  process.exit(1);
} else {
  console.log("\nAll thresholds PASSED. Test set validated.");
  process.exit(0);
}
