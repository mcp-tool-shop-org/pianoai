#!/usr/bin/env tsx
// ─── run-e2-notes-present-eval.ts — Slice 9d E2 Notes-Present Rerun ──────────
//
// Runs E2 phrase continuation eval only, with Slice 9d prompt hardening and
// optional FM-4 retry loop. Outputs a fresh per-slice results file (not the
// fixed llm-in-the-loop-results.json path used by Slice 7.5).
//
// Usage:
//   pnpm exec tsx scripts/run-e2-notes-present-eval.ts --model qwen2.5:7b
//
// Output:
//   datasets/jam-actions-v0/evals/e2-notes-present-results.json
//
// Separation discipline (load-bearing):
//   first_pass  — model produced note-present REMI on first call
//   retry_pass  — model produced note-present REMI only after FM-4 retry
//   Both are tracked per run and aggregated separately.
//   The threshold gate uses TOTAL (first + retry).
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runE2ForPair,
  majorityPass,
  E2_GROOVE_THRESHOLD,
  type E2RunResult,
} from "../src/dataset/eval/llm-runner.js";
import type { PairRecord } from "../src/dataset/eval/phrase-continuation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const RECORDS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0", "records");
const SPLITS_PATH = join(REPO_ROOT, "datasets", "jam-actions-v0", "splits.json");
const EVALS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0", "evals");
const RESULTS_PATH = join(EVALS_DIR, "e2-notes-present-results.json");

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let model = "qwen2.5:7b";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--model" && i + 1 < args.length) {
    model = args[++i];
  }
}

const N_RUNS = 3;

console.log(`\njam-actions-v0 Slice 9d — E2 Notes-Present Eval`);
console.log(`Backend: ollama | Model: ${model}`);
console.log(`n per pair: ${N_RUNS} | grooveOA threshold: ${E2_GROOVE_THRESHOLD}`);
console.log(`FM-4 retry: enabled (max 1 retry per note-empty run)\n`);

// ─── Backend ──────────────────────────────────────────────────────────────────

const { OllamaBackend } = await import(
  "../src/dataset/eval/llm-backends/ollama.js"
);
const backend = new OllamaBackend(model);

// Probe reachability
const backendWithProbe = backend as typeof backend & { probe?: () => Promise<void> };
if (typeof backendWithProbe.probe === "function") {
  try {
    await backendWithProbe.probe();
    console.log("Ollama reachable.\n");
  } catch (err) {
    console.error(`ERROR: ${String(err)}`);
    process.exit(1);
  }
}

// ─── Load records ─────────────────────────────────────────────────────────────

function loadRecord(id: string): Record<string, unknown> {
  const parts = id.split(":");
  const songPart = parts[0];
  const measurePart = parts[1];
  const filename = `${songPart}-${measurePart}.json`;
  return JSON.parse(readFileSync(join(RECORDS_DIR, filename), "utf8")) as Record<string, unknown>;
}

const splits = JSON.parse(readFileSync(SPLITS_PATH, "utf8")) as { test: string[]; train: string[] };
const testIds = splits.test;
const testRecords = testIds.map((id) => {
  const r = loadRecord(id) as Record<string, unknown> & { id: string };
  if (r.id !== id) throw new Error(`ID mismatch: expected "${id}", got "${r.id}"`);
  return r;
});

// ─── Find pairs ───────────────────────────────────────────────────────────────

interface TestPair { promptId: string; targetId: string; }
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
console.log(`Test set: ${testIds.length} records | E2 pairs: ${testPairs.length}`);
testPairs.forEach((p) => console.log(`  ${p.promptId} → ${p.targetId}`));
console.log();

// ─── Run E2 ───────────────────────────────────────────────────────────────────

interface PairRunSummary {
  promptId: string;
  targetId: string;
  runs: E2RunResult[];
  passedCount: number;
  majorityPass: boolean;
  grooveOAs: (number | null)[];
  meanGrooveOA: number | null;
  // parse stats
  cleanParseCount: number;
  recoveredParseCount: number;
  unrecoverableCount: number;
  // Slice 9d: first-pass vs retry-pass breakdown
  firstPassNoteEmptyCount: number;   // how many runs hit FM-4 on first pass
  retryFiredCount: number;           // how many runs attempted retry
  retryRescuedCount: number;         // how many retries succeeded (retryFired && !retryPassNoteEmpty)
  retryFailedCount: number;          // how many retries also produced note-empty
  // pass counts by pass level
  firstPassPassCount: number;        // passed without needing retry
  retryPassPassCount: number;        // passed only because retry rescued FM-4
  totalPassCount: number;            // first + retry combined
}

const e2Results: PairRunSummary[] = [];

console.log("━━━ E2: Phrase Continuation (Slice 9d — Notes-Present Hardening) ━━━");

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
    const parseStr = result.meta.parseStatus ?? "n/a";
    const retryStr = result.retryFired
      ? (result.retryPassNoteEmpty ? " [retry:FAIL-still-empty]" : " [retry:RESCUED]")
      : (result.firstPassNoteEmpty ? " [FM-4/no-retry]" : "");
    console.log(` ${status} | grooveOA:${grooveStr} | parse:${parseStr}${retryStr} | ${result.meta.latencyMs}ms`);
  }

  const passedCount = runs.filter((r) => r.passed).length;
  const grooveOAs = runs.map((r) => r.grooveOA);
  const validOAs = grooveOAs.filter((v) => v !== null) as number[];
  const meanGrooveOA = validOAs.length > 0 ? validOAs.reduce((s, v) => s + v, 0) / validOAs.length : null;
  const majority = majorityPass(runs.map((r) => ({ score: r.passed ? 1 : 0 })));

  const cleanParseCount = runs.filter((r) => r.meta.parseStatus === "clean").length;
  const recoveredParseCount = runs.filter((r) => r.meta.parseStatus === "recovered").length;
  const unrecoverableCount = runs.filter((r) => r.meta.parseStatus === "unrecoverable").length;

  // Slice 9d: first-pass vs retry-pass breakdown
  const firstPassNoteEmptyCount = runs.filter((r) => r.firstPassNoteEmpty === true).length;
  const retryFiredCount = runs.filter((r) => r.retryFired === true).length;
  const retryRescuedCount = runs.filter((r) => r.retryFired === true && r.retryPassNoteEmpty === false).length;
  const retryFailedCount = runs.filter((r) => r.retryFired === true && r.retryPassNoteEmpty === true).length;

  // A "first-pass pass" = passed and retryFired=false (no retry needed)
  const firstPassPassCount = runs.filter((r) => r.passed && !r.retryFired).length;
  // A "retry-pass pass" = passed and retryFired=true (retry rescued it)
  const retryPassPassCount = runs.filter((r) => r.passed && r.retryFired === true).length;

  e2Results.push({
    promptId: pair.promptId,
    targetId: pair.targetId,
    runs,
    passedCount,
    majorityPass: majority,
    grooveOAs,
    meanGrooveOA,
    cleanParseCount,
    recoveredParseCount,
    unrecoverableCount,
    firstPassNoteEmptyCount,
    retryFiredCount,
    retryRescuedCount,
    retryFailedCount,
    firstPassPassCount,
    retryPassPassCount,
    totalPassCount: passedCount,
  });

  console.log(`  → majority:${majority ? "PASS" : "FAIL"} (${passedCount}/${N_RUNS}) | mean grooveOA:${meanGrooveOA?.toFixed(3) ?? "n/a"}`);
  console.log(`    first-pass passes:${firstPassPassCount} | retry-rescued passes:${retryPassPassCount} | FM-4 hits:${firstPassNoteEmptyCount}`);
}

// ─── Aggregate ────────────────────────────────────────────────────────────────

const allPairsPass = e2Results.every((r) => r.majorityPass);
const pairsPass = e2Results.filter((r) => r.majorityPass).length;

// Global first-pass vs retry-pass aggregates
const totalRuns = e2Results.length * N_RUNS;
const totalFirstPassNoteEmpty = e2Results.reduce((s, r) => s + r.firstPassNoteEmptyCount, 0);
const totalRetryFired = e2Results.reduce((s, r) => s + r.retryFiredCount, 0);
const totalRetryRescued = e2Results.reduce((s, r) => s + r.retryRescuedCount, 0);
const totalRetryFailed = e2Results.reduce((s, r) => s + r.retryFailedCount, 0);
const totalFirstPassPass = e2Results.reduce((s, r) => s + r.firstPassPassCount, 0);
const totalRetryPassPass = e2Results.reduce((s, r) => s + r.retryPassPassCount, 0);

const firstPassGrooveOAs = e2Results.flatMap((r) =>
  r.runs.filter((run) => run.passed && !run.retryFired).map((run) => run.grooveOA as number)
);
const retryPassGrooveOAs = e2Results.flatMap((r) =>
  r.runs.filter((run) => run.passed && run.retryFired === true).map((run) => run.grooveOA as number)
);
const allPassGrooveOAs = e2Results.flatMap((r) =>
  r.runs.filter((run) => run.passed).map((run) => run.grooveOA as number)
);

function mean(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

console.log(`\nE2 aggregate:`);
console.log(`  Pairs PASS: ${pairsPass}/${e2Results.length} (threshold: 2/2) → ${allPairsPass ? "PASS" : "FAIL"}`);
console.log(`  First-pass passes: ${totalFirstPassPass}/${totalRuns} runs`);
console.log(`  Retry-rescued passes: ${totalRetryPassPass}/${totalRuns} runs`);
console.log(`  Total passes: ${totalFirstPassPass + totalRetryPassPass}/${totalRuns} runs`);
console.log(`  FM-4 (note-empty) hits: ${totalFirstPassNoteEmpty}/${totalRuns} first-pass runs`);
console.log(`  Retries fired: ${totalRetryFired} | rescued: ${totalRetryRescued} | failed: ${totalRetryFailed}`);
console.log(`  Mean grooveOA (first-pass passes): ${mean(firstPassGrooveOAs)?.toFixed(4) ?? "n/a"}`);
console.log(`  Mean grooveOA (retry-pass passes): ${mean(retryPassGrooveOAs)?.toFixed(4) ?? "n/a"}`);
console.log(`  Mean grooveOA (all passes): ${mean(allPassGrooveOAs)?.toFixed(4) ?? "n/a"}`);

// ─── Write results JSON ───────────────────────────────────────────────────────

if (!existsSync(EVALS_DIR)) mkdirSync(EVALS_DIR, { recursive: true });

const output = {
  schema_version: "e2-notes-present/1.0.0",
  slice: "9d",
  slice_description: "E2 Notes-Present Prompt Hardening — Slice 9d",
  generated_at: new Date().toISOString(),
  backend: "ollama",
  model,
  n_runs: N_RUNS,
  test_set: testIds,
  parameters: {
    e2_groove_threshold: E2_GROOVE_THRESHOLD,
    fm4_retry_enabled: true,
    fm4_retry_max_attempts: 1,
    prompt_changes: [
      "tactic1:explicit-minimum-note-token-requirement",
      "tactic2:one-shot-example-3-bars-with-pitch-tokens",
      "tactic3:self-check-instruction-verify-before-output",
      "tactic4:validator-feedback-retry-on-fm4-only",
    ],
  },
  results: {
    e2: {
      pairs: e2Results.map((r) => ({
        promptId: r.promptId,
        targetId: r.targetId,
        majorityPass: r.majorityPass,
        passedCount: r.passedCount,
        totalRuns: N_RUNS,
        meanGrooveOA: r.meanGrooveOA,
        grooveOAs: r.grooveOAs,
        clean_parse_count: r.cleanParseCount,
        recovered_parse_count: r.recoveredParseCount,
        unrecoverable_count: r.unrecoverableCount,
        clean_parse_rate: r.cleanParseCount / N_RUNS,
        // Slice 9d: first-pass vs retry-pass breakdown
        first_pass_note_empty_count: r.firstPassNoteEmptyCount,
        first_pass_note_empty_rate: r.firstPassNoteEmptyCount / N_RUNS,
        retry_fired_count: r.retryFiredCount,
        retry_rescued_count: r.retryRescuedCount,
        retry_failed_count: r.retryFailedCount,
        first_pass_pass_count: r.firstPassPassCount,
        retry_pass_pass_count: r.retryPassPassCount,
        // grooveOA on passes only
        groove_oa_first_pass_only: mean(
          r.runs.filter((run) => run.passed && !run.retryFired).map((run) => run.grooveOA as number)
        ),
        groove_oa_retry_pass_only: mean(
          r.runs.filter((run) => run.passed && run.retryFired === true).map((run) => run.grooveOA as number)
        ),
        runs: r.runs.map((run) => ({
          run: run.run,
          passed: run.passed,
          grooveOA: run.grooveOA,
          meta: run.meta,
          parsedOutput: run.parsedOutput
            ? { tokenCount: run.parsedOutput.tokens_remi.length, hasAbc: run.parsedOutput.tokens_abc.length > 0 }
            : null,
          parse_status: run.meta.parseStatus ?? null,
          recovery_steps: run.meta.recoverySteps ?? null,
          // Slice 9d retry fields
          first_pass_note_empty: run.firstPassNoteEmpty ?? false,
          retry_fired: run.retryFired ?? false,
          retry_pass_note_empty: run.retryPassNoteEmpty ?? false,
        })),
      })),
      aggregate: {
        pairsPass,
        pairsTotal: e2Results.length,
        allPairsPass,
        threshold: E2_GROOVE_THRESHOLD,
        total_runs: totalRuns,
        clean_parse_rate: e2Results.reduce((s, r) => s + r.cleanParseCount, 0) / totalRuns,
        recovered_parse_rate: e2Results.reduce((s, r) => s + r.recoveredParseCount, 0) / totalRuns,
        unrecoverable_rate: e2Results.reduce((s, r) => s + r.unrecoverableCount, 0) / totalRuns,
        // Slice 9d: first-pass vs retry aggregates
        first_pass_note_empty_rate: totalFirstPassNoteEmpty / totalRuns,
        retry_fired_count: totalRetryFired,
        retry_rescued_count: totalRetryRescued,
        retry_failed_count: totalRetryFailed,
        first_pass_pass_count: totalFirstPassPass,
        retry_pass_pass_count: totalRetryPassPass,
        total_pass_count: totalFirstPassPass + totalRetryPassPass,
        mean_groove_oa_first_pass_passes: mean(firstPassGrooveOAs),
        mean_groove_oa_retry_pass_passes: mean(retryPassGrooveOAs),
        mean_groove_oa_all_passes: mean(allPassGrooveOAs),
      },
    },
  },
};

writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2), "utf8");
console.log(`\nResults written to: ${RESULTS_PATH}`);

process.exit(allPairsPass ? 0 : 1);
