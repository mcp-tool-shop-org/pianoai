#!/usr/bin/env tsx
// ─── run-jam-actions-corpus-eval.ts — Slice 12 Corpus-Scale Eval Runner ───────
//
// Runs E1/E2/E3 on a deterministic stratified sample drawn from the
// jam-actions-v0 public package (115 records). Backend: ollama qwen2.5:7b.
//
// Usage:
//   pnpm exec tsx scripts/run-jam-actions-corpus-eval.ts
//   pnpm exec tsx scripts/run-jam-actions-corpus-eval.ts --dry-run
//   pnpm exec tsx scripts/run-jam-actions-corpus-eval.ts --seed slice12-2026-05-17 --model qwen2.5:7b
//
// Flags:
//   --scope public|source   default: public  (Slice 12 lock #2)
//   --model <name>          default: qwen2.5:7b
//   --seed <string>         default: slice12-2026-05-17
//   --dry-run               build sample, skip model calls
//
// Output:
//   datasets/jam-actions-v0-public/evals/corpus-scale-qwen2.5-7b-results.json
//   datasets/jam-actions-v0-public/evals/corpus-scale-qwen2.5-7b-sample.json
//
// Hard rule: NEVER overwrites prior artifacts under datasets/jam-actions-v0/evals/.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSample,
  buildSampleManifest,
  DEFAULT_CONFIG,
  SLICE_11_ENRICHED_RECORD_IDS,
  type SamplePlan,
  type SamplerConfig,
  type SamplerRecord,
} from "../src/dataset/eval/corpus-sampler.js";
import {
  runE1ForRecord,
  runE2ForPair,
  runE3ForRecord,
  majorityPass,
  E1_GOLD_PASS_RATE_THRESHOLD,
  E2_GROOVE_THRESHOLD,
  E3_MARGIN_THRESHOLD,
  type LlmBackend,
  type E1RunResult,
  type E2RunResult,
  type E3RecordResult,
} from "../src/dataset/eval/llm-runner.js";
import { loadToolSchemaCatalog } from "../src/dataset/trace-validator.js";
import type { ToolSchemaCatalog } from "../src/dataset/trace-validator.js";
import type { PairRecord } from "../src/dataset/eval/phrase-continuation.js";
import type { E3Record } from "../src/dataset/eval/annotation-grounding.js";

// ─── Paths ─────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const PUBLIC_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0-public");
const PUBLIC_RECORDS_DIR = join(PUBLIC_DIR, "records");
const PUBLIC_EVALS_DIR = join(PUBLIC_DIR, "evals");

// ─── Args ──────────────────────────────────────────────────────────────────────

interface CliOpts {
  scope: "public" | "source";
  model: string;
  seed: string;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(): CliOpts {
  const args = process.argv.slice(2);
  const opts: CliOpts = {
    scope: "public",
    model: "qwen2.5:7b",
    seed: "slice12-2026-05-17",
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--scope" && i + 1 < args.length) {
      const v = args[++i];
      if (v !== "public" && v !== "source") {
        console.error(`ERROR: --scope must be 'public' or 'source', got '${v}'.`);
        process.exit(1);
      }
      opts.scope = v;
    } else if (a === "--model" && i + 1 < args.length) {
      opts.model = args[++i];
    } else if (a === "--seed" && i + 1 < args.length) {
      opts.seed = args[++i];
    } else if (a === "--dry-run") {
      opts.dryRun = true;
    } else if (a === "--help" || a === "-h") {
      opts.help = true;
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`
jam-actions-v0 Slice 12 — Corpus-Scale Eval Runner

Runs E1/E2/E3 on a stratified deterministic sample of the public package,
using ollama qwen2.5:7b. Writes durable result + sample artifacts under
datasets/jam-actions-v0-public/evals/. Does NOT overwrite prior artifacts.

Usage:
  pnpm exec tsx scripts/run-jam-actions-corpus-eval.ts [options]

Options:
  --scope public|source   Sample pool (default: public — Slice 12 lock #2)
  --model <name>          Ollama model id (default: qwen2.5:7b — Slice 12 lock #1)
  --seed <string>         Sampler seed (default: slice12-2026-05-17)
  --dry-run               Build sample plan, skip model calls
  --help                  Show this help

Sample plan (locked by kickoff):
  E1 tool-use:        24 records
  E2 continuation:    12 pairs
  E3 grounding:       24 records

Required inclusions (ENFORCED — sampler aborts if missing):
  - All 6 Slice 11 enriched records in E1 + E3
  - All 4 enriched-record pairs in E2

Backend (LOCKED):
  ollama at http://localhost:11434, qwen2.5:7b model. The script probes the
  endpoint first and prints actionable setup instructions on failure.
`);
}

const opts = parseArgs();
if (opts.help) {
  printHelp();
  process.exit(0);
}

// ─── Slice-12 derived paths ────────────────────────────────────────────────────

const RESULT_FILENAME = `corpus-scale-${opts.model.replace(/:/g, "-")}-results.json`;
const SAMPLE_FILENAME = `corpus-scale-${opts.model.replace(/:/g, "-")}-sample.json`;
const RESULT_PATH = join(PUBLIC_EVALS_DIR, RESULT_FILENAME);
const SAMPLE_PATH = join(PUBLIC_EVALS_DIR, SAMPLE_FILENAME);

console.log("=".repeat(72));
console.log(" jam-actions-v0 Slice 12 — Corpus-Scale Eval Rerun");
console.log("=".repeat(72));
console.log(`  scope:   ${opts.scope}`);
console.log(`  model:   ${opts.model}`);
console.log(`  seed:    ${opts.seed}`);
console.log(`  dry-run: ${opts.dryRun}`);
console.log(`  result:  ${RESULT_PATH}`);
console.log(`  sample:  ${SAMPLE_PATH}`);
console.log();

// ─── Refuse-to-overwrite gate (hard guarantee against prior artifacts) ─────────

if (opts.scope === "source") {
  console.error(
    "ERROR: --scope source is reserved (Slice 12 lock #2 keeps the 30 source-only " +
      "records out of the run). The current implementation refuses to run on source " +
      "to enforce that lock.",
  );
  process.exit(1);
}

// ─── Load public package records ───────────────────────────────────────────────

interface PublicRecordRaw {
  id: string;
  schema_version: string;
  scope: SamplerRecord["scope"];
  observation: { tokens_remi?: string[]; midi_sidecar?: { timed_events?: unknown[] } };
  target_trace?: unknown;
  annotation_target?: { rhythm_onset?: string };
  provenance?: { composer?: string };
}

function loadPublicRecords(): PublicRecordRaw[] {
  const files = readdirSync(PUBLIC_RECORDS_DIR).filter((f) => f.endsWith(".json"));
  const records = files.map((f) => {
    const j = JSON.parse(readFileSync(join(PUBLIC_RECORDS_DIR, f), "utf8")) as PublicRecordRaw;
    return j;
  });
  return records.sort((a, b) => (a.id < b.id ? -1 : 1));
}

const publicRecords = loadPublicRecords();
console.log(`Loaded ${publicRecords.length} public-package records.`);

// ─── Build sample plan ────────────────────────────────────────────────────────

const samplerInput: SamplerRecord[] = publicRecords.map((r) => ({
  id: r.id,
  scope: r.scope,
  has_target_trace: r.target_trace !== undefined,
  rhythm_onset_not_computable: r.annotation_target?.rhythm_onset === "not_computable",
}));

const samplerConfig: SamplerConfig = {
  ...DEFAULT_CONFIG,
  seed: opts.seed,
};

let plan: SamplePlan;
try {
  plan = buildSample(samplerInput, samplerConfig);
} catch (err) {
  console.error(`\nFATAL: sampler refused to build: ${(err as Error).message}`);
  process.exit(1);
}

console.log(`\nSample plan:`);
console.log(`  E1 records: ${plan.e1.recordIds.length} (target 24)`);
console.log(`    opening:${plan.e1.buckets.opening.length} middle:${plan.e1.buckets.middle.length} cadential:${plan.e1.buckets.cadential.length} bach-tex-rep:${plan.e1.buckets.bachTextureRepetition.length} anacrusis:${plan.e1.buckets.anacrusis.length}`);
console.log(`    enriched: ${plan.e1.enrichedIncluded.length}/${SLICE_11_ENRICHED_RECORD_IDS.length} (must be 6)`);
console.log(`  E2 pairs: ${plan.e2.pairs.length} (target 12)`);
console.log(`    enriched pairs: ${plan.e2.enrichedPairsIncluded.length}/${plan.enrichedPairs.length} (must be 4)`);
console.log(`  E3 records: ${plan.e3.recordIds.length} (target 24)`);
console.log(`    opening:${plan.e3.buckets.opening.length} middle:${plan.e3.buckets.middle.length} cadential:${plan.e3.buckets.cadential.length} bach-tex-rep:${plan.e3.buckets.bachTextureRepetition.length} anacrusis:${plan.e3.buckets.anacrusis.length}`);
console.log(`    enriched: ${plan.e3.enrichedIncluded.length}/${SLICE_11_ENRICHED_RECORD_IDS.length} (must be 6)`);
if (plan.diagnostics.length > 0) {
  console.log(`  diagnostics:`);
  for (const d of plan.diagnostics) console.log(`    - ${d}`);
}

// Hard-gate sanity asserts on the plan (before any model calls).
if (plan.e1.enrichedIncluded.length !== 6) {
  console.error("\nFATAL: E1 sample missing one or more enriched records. Aborting before model calls.");
  process.exit(1);
}
if (plan.e3.enrichedIncluded.length !== 6) {
  console.error("\nFATAL: E3 sample missing one or more enriched records. Aborting before model calls.");
  process.exit(1);
}
if (plan.e2.enrichedPairsIncluded.length !== 4) {
  console.error("\nFATAL: E2 sample missing one or more enriched-record pairs. Aborting before model calls.");
  process.exit(1);
}

// ─── Probe ollama before any model calls (Slice 12 lock #1) ────────────────────

async function probeOllama(model: string): Promise<void> {
  const baseUrl = process.env.OLLAMA_HOST?.startsWith("http")
    ? process.env.OLLAMA_HOST
    : process.env.OLLAMA_HOST
      ? `http://${process.env.OLLAMA_HOST}`
      : "http://localhost:11434";
  const setupBlock = (reason: string) =>
    `\nOllama precheck failed: ${reason}\n` +
    `This slice requires a local Ollama with ${model} loaded at ${baseUrl}.\n\n` +
    `Setup:\n` +
    `  1. Install Ollama: https://ollama.com/download\n` +
    `  2. ollama serve   (in another terminal, or systemd-managed)\n` +
    `  3. ollama pull ${model}\n` +
    `  4. Re-run: pnpm exec tsx scripts/run-jam-actions-corpus-eval.ts\n\n` +
    `Exiting (no model calls made).`;
  try {
    const resp = await fetch(`${baseUrl}/api/tags`);
    if (!resp.ok) {
      console.error(setupBlock(`HTTP ${resp.status} from /api/tags`));
      process.exit(1);
    }
    const j = (await resp.json()) as { models?: Array<{ name: string }> };
    const names = (j.models ?? []).map((m) => m.name);
    if (!names.includes(model)) {
      console.error(
        setupBlock(`model '${model}' not found in ollama list. Available: ${names.join(", ") || "(none)"}`),
      );
      process.exit(1);
    }
    console.log(`\nOllama reachable at ${baseUrl}. Model '${model}' present.`);
  } catch (err) {
    console.error(setupBlock(`fetch error: ${(err as Error).message}`));
    process.exit(1);
  }
}

// ─── Write sample manifest (always, before any model call) ─────────────────────

if (!existsSync(PUBLIC_EVALS_DIR)) {
  mkdirSync(PUBLIC_EVALS_DIR, { recursive: true });
}

const sampleManifest = buildSampleManifest(plan, samplerConfig);
writeFileSync(SAMPLE_PATH, JSON.stringify(sampleManifest, null, 2) + "\n", "utf8");
console.log(`\nSample manifest written: ${SAMPLE_PATH}`);

if (opts.dryRun) {
  console.log("\nDry-run complete — no model calls made. Sample plan validated.");
  process.exit(0);
}

await probeOllama(opts.model);

// ─── Backend + corpus load ─────────────────────────────────────────────────────

const { OllamaBackend } = await import("../src/dataset/eval/llm-backends/ollama.js");
const backend: LlmBackend = new OllamaBackend(opts.model);

const catalog: ToolSchemaCatalog = loadToolSchemaCatalog();
console.log(`Tool catalog: ${catalog.tool_count} tools from ${catalog.derived_from}`);

const recordsById = new Map(publicRecords.map((r) => [r.id, r] as const));

// ─── E1 (tool-use): n=1 corpus-scale (vs n=3 in run-llm-eval) ─────────────────

const N_RUNS = 1; // Single pass per record/pair/question — corpus-scale economy.

interface RecordE1Result {
  recordId: string;
  enriched: boolean;
  passed: boolean;
  runs: E1RunResult[];
  rawOutputs: string[];
}

console.log("\n━━━ E1: Tool-Use Correctness (24 records, n=1) ━━━");
const e1Results: RecordE1Result[] = [];
let e1Index = 0;
for (const recId of plan.e1.recordIds) {
  e1Index++;
  const raw = recordsById.get(recId);
  if (!raw) {
    console.error(`  [${e1Index}/${plan.e1.recordIds.length}] ${recId}: NOT FOUND in records`);
    continue;
  }
  const isEnriched = SLICE_11_ENRICHED_RECORD_IDS.includes(recId);
  const tag = isEnriched ? "[ENR]" : "     ";
  process.stdout.write(
    `  [${String(e1Index).padStart(2)}/${plan.e1.recordIds.length}] ${tag} ${recId} ... `,
  );
  const t0 = Date.now();
  let result: E1RunResult;
  try {
    result = await runE1ForRecord(
      raw as unknown as Parameters<typeof runE1ForRecord>[0],
      catalog,
      backend,
      0,
    );
  } catch (err) {
    console.log(`ERROR (${Date.now() - t0}ms): ${(err as Error).message}`);
    continue;
  }
  const elapsed = Date.now() - t0;
  const status = result.passed ? "PASS" : "FAIL";
  console.log(
    `${status} | tcalls=${result.toolCalls.length} parse=${result.meta.parseOk ? "ok" : "fail"} | ${elapsed}ms`,
  );
  const rawText = (backend as { lastRawText?: () => string | null }).lastRawText?.() ?? null;
  e1Results.push({
    recordId: recId,
    enriched: isEnriched,
    passed: result.passed,
    runs: [result],
    rawOutputs: [rawText ?? "(no raw text captured)"],
  });
}

const e1PassRate = e1Results.length > 0 ? e1Results.filter((r) => r.passed).length / e1Results.length : 0;
const e1EnrichedPassRate =
  e1Results.filter((r) => r.enriched).length > 0
    ? e1Results.filter((r) => r.enriched && r.passed).length /
      e1Results.filter((r) => r.enriched).length
    : 0;
const e1NonEnrichedPassRate =
  e1Results.filter((r) => !r.enriched).length > 0
    ? e1Results.filter((r) => !r.enriched && r.passed).length /
      e1Results.filter((r) => !r.enriched).length
    : 0;
console.log(
  `\nE1 aggregate: ${(e1PassRate * 100).toFixed(1)}% (${e1Results.filter((r) => r.passed).length}/${e1Results.length})`,
);
console.log(`     enriched: ${(e1EnrichedPassRate * 100).toFixed(1)}% (${e1Results.filter((r) => r.enriched && r.passed).length}/${e1Results.filter((r) => r.enriched).length})`);
console.log(`  non-enriched: ${(e1NonEnrichedPassRate * 100).toFixed(1)}% (${e1Results.filter((r) => !r.enriched && r.passed).length}/${e1Results.filter((r) => !r.enriched).length})`);

// ─── E2 (continuation): 12 pairs, n=1 ──────────────────────────────────────────

interface PairE2RunResultBundle {
  promptId: string;
  targetId: string;
  containsEnriched: boolean;
  enrichedHalves: string[];
  passed: boolean;
  grooveOA: number | null;
  parseStatus: string | null;
  runs: E2RunResult[];
  rawOutputs: string[];
}

console.log("\n━━━ E2: Phrase Continuation (12 pairs, n=1) ━━━");
const e2Results: PairE2RunResultBundle[] = [];
let e2Index = 0;
for (const pair of plan.e2.pairs) {
  e2Index++;
  const promptRaw = recordsById.get(pair.promptId);
  const targetRaw = recordsById.get(pair.targetId);
  if (!promptRaw || !targetRaw) {
    console.error(`  [${e2Index}/${plan.e2.pairs.length}] ${pair.promptId} -> ${pair.targetId}: NOT FOUND`);
    continue;
  }
  const tag = pair.containsEnriched ? "[ENR]" : "     ";
  process.stdout.write(
    `  [${String(e2Index).padStart(2)}/${plan.e2.pairs.length}] ${tag} ${pair.promptId} -> ${pair.targetId} ... `,
  );
  const t0 = Date.now();
  let result: E2RunResult;
  try {
    result = await runE2ForPair(
      promptRaw as unknown as Parameters<typeof runE2ForPair>[0],
      targetRaw as unknown as PairRecord,
      backend,
      0,
    );
  } catch (err) {
    console.log(`ERROR (${Date.now() - t0}ms): ${(err as Error).message}`);
    continue;
  }
  const elapsed = Date.now() - t0;
  const status = result.passed ? "PASS" : "FAIL";
  const groove = result.grooveOA !== null ? result.grooveOA.toFixed(3) : "n/a";
  const parse = result.meta.parseStatus ?? "n/a";
  console.log(
    `${status} | grooveOA=${groove} | parse=${parse} | ${elapsed}ms`,
  );
  const rawText = (backend as { lastRawText?: () => string | null }).lastRawText?.() ?? null;
  e2Results.push({
    promptId: pair.promptId,
    targetId: pair.targetId,
    containsEnriched: pair.containsEnriched,
    enrichedHalves: pair.enrichedHalves,
    passed: result.passed,
    grooveOA: result.grooveOA,
    parseStatus: result.meta.parseStatus ?? null,
    runs: [result],
    rawOutputs: [rawText ?? "(no raw text captured)"],
  });
}

function mean(values: Array<number | null | undefined>): number | null {
  const v = values.filter((x): x is number => typeof x === "number");
  if (v.length === 0) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

const e2EnrichedPairs = e2Results.filter((r) => r.containsEnriched);
const e2NonEnrichedPairs = e2Results.filter((r) => !r.containsEnriched);
const e2GrooveMean = mean(e2Results.map((r) => r.grooveOA));
const e2GrooveMeanEnriched = mean(e2EnrichedPairs.map((r) => r.grooveOA));
const e2GrooveMeanNonEnriched = mean(e2NonEnrichedPairs.map((r) => r.grooveOA));
const e2PassRate = e2Results.length > 0 ? e2Results.filter((r) => r.passed).length / e2Results.length : 0;

console.log(`\nE2 aggregate: ${e2Results.filter((r) => r.passed).length}/${e2Results.length} pass`);
console.log(`  mean grooveOA (all pairs):       ${e2GrooveMean?.toFixed(3) ?? "n/a"}`);
console.log(`  mean grooveOA (enriched only):   ${e2GrooveMeanEnriched?.toFixed(3) ?? "n/a"}`);
console.log(`  mean grooveOA (non-enriched):    ${e2GrooveMeanNonEnriched?.toFixed(3) ?? "n/a"}`);

// ─── E3 (annotation grounding): 24 records, n=1 ────────────────────────────────

interface RecordE3ResultBundle {
  recordId: string;
  enriched: boolean;
  result: E3RecordResult;
  margins: { fullVsTextOnly: number | null; fullVsRandomMidi: number | null };
}

console.log("\n━━━ E3: Annotation Grounding MCQ (24 records, n=1) ━━━");
const e3RecordsForRandomMidi = publicRecords as unknown as E3Record[];
const e3Results: RecordE3ResultBundle[] = [];
let e3Index = 0;
for (const recId of plan.e3.recordIds) {
  e3Index++;
  const raw = recordsById.get(recId);
  if (!raw) {
    console.error(`  [${e3Index}/${plan.e3.recordIds.length}] ${recId}: NOT FOUND`);
    continue;
  }
  const isEnriched = SLICE_11_ENRICHED_RECORD_IDS.includes(recId);
  const tag = isEnriched ? "[ENR]" : "     ";
  process.stdout.write(
    `  [${String(e3Index).padStart(2)}/${plan.e3.recordIds.length}] ${tag} ${recId} ... `,
  );
  const t0 = Date.now();
  let result: E3RecordResult;
  try {
    result = await runE3ForRecord(
      raw as unknown as E3Record,
      e3RecordsForRandomMidi,
      backend,
      N_RUNS,
    );
  } catch (err) {
    console.log(`ERROR (${Date.now() - t0}ms): ${(err as Error).message}`);
    continue;
  }
  const elapsed = Date.now() - t0;
  const full = result.aggregate.full;
  const textOnly = result.aggregate.text_only;
  const randomMidi = result.aggregate.random_midi;
  const mTextOnly = full !== null && textOnly !== null ? full - textOnly : null;
  const mRandomMidi = full !== null && randomMidi !== null ? full - randomMidi : null;
  console.log(
    `full=${full?.toFixed(3) ?? "n/a"} text=${textOnly?.toFixed(3) ?? "n/a"} rmidi=${randomMidi?.toFixed(3) ?? "n/a"} | mT=${mTextOnly?.toFixed(3) ?? "n/a"} mR=${mRandomMidi?.toFixed(3) ?? "n/a"} | ${elapsed}ms`,
  );
  e3Results.push({
    recordId: recId,
    enriched: isEnriched,
    result,
    margins: { fullVsTextOnly: mTextOnly, fullVsRandomMidi: mRandomMidi },
  });
}

const e3FullMean = mean(e3Results.map((r) => r.result.aggregate.full));
const e3TextOnlyMean = mean(e3Results.map((r) => r.result.aggregate.text_only));
const e3RandomMidiMean = mean(e3Results.map((r) => r.result.aggregate.random_midi));
const e3MarginTextOnly = e3FullMean !== null && e3TextOnlyMean !== null ? e3FullMean - e3TextOnlyMean : null;
const e3MarginRandomMidi = e3FullMean !== null && e3RandomMidiMean !== null ? e3FullMean - e3RandomMidiMean : null;

const e3Enriched = e3Results.filter((r) => r.enriched);
const e3NonEnriched = e3Results.filter((r) => !r.enriched);
const e3EnrFullMean = mean(e3Enriched.map((r) => r.result.aggregate.full));
const e3EnrTextMean = mean(e3Enriched.map((r) => r.result.aggregate.text_only));
const e3EnrRandMean = mean(e3Enriched.map((r) => r.result.aggregate.random_midi));
const e3EnrMarginText =
  e3EnrFullMean !== null && e3EnrTextMean !== null ? e3EnrFullMean - e3EnrTextMean : null;
const e3EnrMarginRand =
  e3EnrFullMean !== null && e3EnrRandMean !== null ? e3EnrFullMean - e3EnrRandMean : null;

const e3NonEnrFullMean = mean(e3NonEnriched.map((r) => r.result.aggregate.full));
const e3NonEnrTextMean = mean(e3NonEnriched.map((r) => r.result.aggregate.text_only));
const e3NonEnrRandMean = mean(e3NonEnriched.map((r) => r.result.aggregate.random_midi));
const e3NonEnrMarginText =
  e3NonEnrFullMean !== null && e3NonEnrTextMean !== null ? e3NonEnrFullMean - e3NonEnrTextMean : null;

console.log(`\nE3 aggregate (n=${e3Results.length}):`);
console.log(`  full:        ${e3FullMean?.toFixed(3) ?? "n/a"}`);
console.log(`  text_only:   ${e3TextOnlyMean?.toFixed(3) ?? "n/a"}`);
console.log(`  random_midi: ${e3RandomMidiMean?.toFixed(3) ?? "n/a"}`);
console.log(`  margin vs text_only:    ${e3MarginTextOnly?.toFixed(3) ?? "n/a"} (threshold ${E3_MARGIN_THRESHOLD})`);
console.log(`  margin vs random_midi:  ${e3MarginRandomMidi?.toFixed(3) ?? "n/a"} (threshold ${E3_MARGIN_THRESHOLD})`);
console.log(`\nE3 enriched subset (n=${e3Enriched.length}):`);
console.log(`  full mean:                ${e3EnrFullMean?.toFixed(3) ?? "n/a"}`);
console.log(`  text_only mean:           ${e3EnrTextMean?.toFixed(3) ?? "n/a"}`);
console.log(`  margin vs text_only:      ${e3EnrMarginText?.toFixed(3) ?? "n/a"}`);
console.log(`  margin vs random_midi:    ${e3EnrMarginRand?.toFixed(3) ?? "n/a"}`);
console.log(`\nE3 non-enriched subset (n=${e3NonEnriched.length}):`);
console.log(`  full mean:                ${e3NonEnrFullMean?.toFixed(3) ?? "n/a"}`);
console.log(`  text_only mean:           ${e3NonEnrTextMean?.toFixed(3) ?? "n/a"}`);
console.log(`  margin vs text_only:      ${e3NonEnrMarginText?.toFixed(3) ?? "n/a"}`);

// ─── Write result artifact ────────────────────────────────────────────────────

const resultArtifact = {
  schema_version: "corpus-scale-eval/1.0.0",
  generated_at: new Date().toISOString(),
  scope: opts.scope,
  backend: "ollama",
  model: opts.model,
  seed: opts.seed,
  n_runs: N_RUNS,
  sample_summary: {
    e1_total: plan.e1.recordIds.length,
    e2_total: plan.e2.pairs.length,
    e3_total: plan.e3.recordIds.length,
    enriched_in_e1: plan.e1.enrichedIncluded.length,
    enriched_in_e3: plan.e3.enrichedIncluded.length,
    enriched_pairs_in_e2: plan.e2.enrichedPairsIncluded.length,
  },
  results: {
    e1: {
      records: e1Results.map((r) => ({
        recordId: r.recordId,
        enriched: r.enriched,
        passed: r.passed,
        runs: r.runs.map((run, i) => ({
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
                trajectoryFailureReason: run.evaluation.trajectoryFailureReason,
                multiTurnDependencyFailureReason: run.evaluation.multiTurnDependencyFailureReason,
              }
            : null,
          raw_output: r.rawOutputs[i] ?? null,
        })),
      })),
      aggregate: {
        passRate: e1PassRate,
        threshold: E1_GOLD_PASS_RATE_THRESHOLD,
        thresholdMet: e1PassRate >= E1_GOLD_PASS_RATE_THRESHOLD,
        enrichedPassRate: e1EnrichedPassRate,
        nonEnrichedPassRate: e1NonEnrichedPassRate,
        enrichedPassedCount: e1Results.filter((r) => r.enriched && r.passed).length,
        enrichedTotal: e1Results.filter((r) => r.enriched).length,
        nonEnrichedPassedCount: e1Results.filter((r) => !r.enriched && r.passed).length,
        nonEnrichedTotal: e1Results.filter((r) => !r.enriched).length,
      },
    },
    e2: {
      pairs: e2Results.map((r) => ({
        promptId: r.promptId,
        targetId: r.targetId,
        containsEnriched: r.containsEnriched,
        enrichedHalves: r.enrichedHalves,
        passed: r.passed,
        grooveOA: r.grooveOA,
        parseStatus: r.parseStatus,
        runs: r.runs.map((run, i) => ({
          run: run.run,
          passed: run.passed,
          grooveOA: run.grooveOA,
          meta: run.meta,
          parsedOutput: run.parsedOutput
            ? { tokenCount: run.parsedOutput.tokens_remi.length, hasAbc: run.parsedOutput.tokens_abc.length > 0 }
            : null,
          parseStatus: run.meta.parseStatus ?? null,
          recoverySteps: run.meta.recoverySteps ?? null,
          firstPassNoteEmpty: run.firstPassNoteEmpty ?? false,
          retryFired: run.retryFired ?? false,
          retryPassNoteEmpty: run.retryPassNoteEmpty ?? false,
          raw_output: r.rawOutputs[i] ?? null,
        })),
      })),
      aggregate: {
        passRate: e2PassRate,
        threshold: E2_GROOVE_THRESHOLD,
        meanGrooveOA: e2GrooveMean,
        meanGrooveOAEnriched: e2GrooveMeanEnriched,
        meanGrooveOANonEnriched: e2GrooveMeanNonEnriched,
        enrichedPairsCount: e2EnrichedPairs.length,
        nonEnrichedPairsCount: e2NonEnrichedPairs.length,
        enrichedPassedCount: e2EnrichedPairs.filter((r) => r.passed).length,
        nonEnrichedPassedCount: e2NonEnrichedPairs.filter((r) => r.passed).length,
      },
    },
    e3: {
      records: e3Results.map((r) => ({
        recordId: r.recordId,
        enriched: r.enriched,
        full: r.result.aggregate.full,
        text_only: r.result.aggregate.text_only,
        random_midi: r.result.aggregate.random_midi,
        marginVsTextOnly: r.margins.fullVsTextOnly,
        marginVsRandomMidi: r.margins.fullVsRandomMidi,
        randomMidiPartnerId: r.result.randomMidiPartnerId,
        questions: r.result.questions.map((q) => ({
          questionType: q.questionType,
          questionText: q.questionText,
          correctOptionIndex: q.correctOptionIndex,
          options: q.options,
          majorityScore: q.majorityScore,
          runs: {
            full: q.runs.full.map((rn) => ({ run: rn.run, score: rn.score, selectedOptionIndex: rn.selectedOptionIndex, meta: rn.meta })),
            text_only: q.runs.text_only.map((rn) => ({ run: rn.run, score: rn.score, selectedOptionIndex: rn.selectedOptionIndex, meta: rn.meta })),
            random_midi: q.runs.random_midi.map((rn) => ({ run: rn.run, score: rn.score, selectedOptionIndex: rn.selectedOptionIndex, meta: rn.meta })),
          },
        })),
      })),
      aggregate: {
        full: e3FullMean,
        text_only: e3TextOnlyMean,
        random_midi: e3RandomMidiMean,
        marginVsTextOnly: e3MarginTextOnly,
        marginVsRandomMidi: e3MarginRandomMidi,
        threshold: E3_MARGIN_THRESHOLD,
        thresholdMetTextOnly: e3MarginTextOnly !== null && e3MarginTextOnly >= E3_MARGIN_THRESHOLD,
        thresholdMetRandomMidi: e3MarginRandomMidi !== null && e3MarginRandomMidi >= E3_MARGIN_THRESHOLD,
        enrichedSubset: {
          n: e3Enriched.length,
          full: e3EnrFullMean,
          text_only: e3EnrTextMean,
          random_midi: e3EnrRandMean,
          marginVsTextOnly: e3EnrMarginText,
          marginVsRandomMidi: e3EnrMarginRand,
        },
        nonEnrichedSubset: {
          n: e3NonEnriched.length,
          full: e3NonEnrFullMean,
          text_only: e3NonEnrTextMean,
          random_midi: e3NonEnrRandMean,
          marginVsTextOnly: e3NonEnrMarginText,
        },
      },
    },
  },
  prior_baseline_reference: {
    artifact: "datasets/jam-actions-v0/evals/llm-in-the-loop-qwen2.5-7b-hardened.json",
    test_set: ["clair-de-lune:m001-004", "clair-de-lune:m005-008", "clair-de-lune:m015-018", "clair-de-lune:m019-022"],
    n_runs: 3,
    e1_pass_rate: 0.75,
    e2_groove_oa_aggregate: null,
    e3_margin_vs_text_only: -0.125,
    e3_margin_vs_random_midi: -0.0625,
  },
};

writeFileSync(RESULT_PATH, JSON.stringify(resultArtifact, null, 2) + "\n", "utf8");
console.log(`\nResult artifact written: ${RESULT_PATH}`);
console.log(`Sample manifest written: ${SAMPLE_PATH}`);

console.log("\n━━━ DONE ━━━");
console.log(`E1 pass rate (corpus):     ${(e1PassRate * 100).toFixed(1)}% — prior baseline (clair-de-lune): 75%`);
console.log(`E2 pairs passing:          ${e2Results.filter((r) => r.passed).length}/${e2Results.length} (groove threshold ${E2_GROOVE_THRESHOLD})`);
console.log(`E3 corpus margin vs text:  ${e3MarginTextOnly?.toFixed(3) ?? "n/a"} (threshold +${E3_MARGIN_THRESHOLD})`);
console.log(`E3 enriched margin vs text:${e3EnrMarginText?.toFixed(3) ?? "n/a"} (threshold +${E3_MARGIN_THRESHOLD})`);
