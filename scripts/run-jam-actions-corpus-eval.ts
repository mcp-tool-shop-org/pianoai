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
//   pnpm exec tsx scripts/run-jam-actions-corpus-eval.ts --evals e1,e2 --output evals/post-isolation-qwen2.5-7b-results.json
//
// Flags:
//   --scope public|source   default: public  (Slice 12 lock #2)
//   --model <name>          default: qwen2.5:7b
//   --seed <string>         default: slice12-2026-05-17
//   --dry-run               build sample, skip model calls
//   --evals e1,e2,e3        comma-separated subset to run (default: e1,e2,e3 — all)
//   --output <path>         override result artifact path (relative to PUBLIC_DIR
//                           or absolute). Sample manifest stays at default path
//                           unless --sample-output is also given.
//   --sample-output <path>  override sample manifest path (relative to PUBLIC_DIR
//                           or absolute).
//   --n <K>                 (Slice 14) number of runs per record/pair. Default 1.
//                           K>1 writes corpus-eval-results/2.0.0 schema with
//                           per-record runs:[K] + aggregate stats.
//   --sample-filter <name>  (Slice 14/16/17/18) restrict the sample plan to a
//                           named subset. Filters:
//                             all              (default — full plan, no filter)
//                             enriched-only    — 6 enriched records / 4 enriched pairs only
//                             slice16-cohort   — Slice 16 3-record cohort (E3 only)
//                             slice17-cohort   — Slice 17 3-record demo cohort (e3-tool only)
//                             slice18-cohort   — Slice 18 13-record stratified cohort
//                                                (e3-tool only; legacy E1/E2/E3 empty;
//                                                clair-de-lune included for test-holdout
//                                                integrity check)
//
// Output (default):
//   datasets/jam-actions-v0-public/evals/corpus-scale-qwen2.5-7b-results.json
//   datasets/jam-actions-v0-public/evals/corpus-scale-qwen2.5-7b-sample.json
//
// Hard rule: NEVER overwrites prior artifacts under datasets/jam-actions-v0/evals/.
// The default result/sample paths refuse to overwrite; use --output to write
// a new artifact path (e.g. focused rerun in Slice 13, multi-run in Slice 14).
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
import {
  aggregateRuns,
  aggregateValues,
  type AggregateStats,
  type RunResult,
} from "../src/dataset/eval/multi-run-aggregator.js";
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

type EvalName = "e1" | "e2" | "e3" | "e3-tool";
type SampleFilter =
  | "all"
  | "enriched-only"
  | "slice16-cohort"
  | "slice17-cohort"
  | "slice18-cohort";

const SAMPLE_FILTERS: readonly SampleFilter[] = [
  "all",
  "enriched-only",
  "slice16-cohort",
  "slice17-cohort",
  "slice18-cohort",
] as const;

/**
 * Slice 16: the 3-record cohort selected for rubric-guided enrichment. The
 * filter hardcodes these 3 ids; the sample plan itself is NOT modified (the
 * sampler's 6-enriched-record assertions still hold, since they appear in
 * the full plan), only the iteration list is replaced. E1/E2 iteration lists
 * become empty when this filter is set — Slice 16 only runs E3.
 */
const SLICE_16_COHORT_RECORD_IDS: readonly string[] = [
  "pathetique-mvt2:m001-004:piano:mcp-session:v1",
  "schumann-traumerei:m001-004:piano:mcp-session:v1",
  "chopin-nocturne-op9-no2:m009-012:piano:mcp-session:v1",
];

/**
 * Slice 17: the 3-record demo cohort for the tool-scaffolded E3 variant.
 * - pathetique-mvt2:m025-028 — Slice 11/14 +0.417 margin "hero" record
 * - pathetique-mvt2:m001-004 — Slice 16 cohort (0 margin via prose)
 * - bach-prelude-c-major-bwv846:m009-012 — non-enriched control
 *
 * When this filter is set, only the new e3-tool evaluator runs; legacy E1/E2/E3
 * iteration lists become empty (legacy n=3 data is REUSED from Slice 14/16
 * artifacts, not regenerated here).
 */
const SLICE_17_COHORT_RECORD_IDS: readonly string[] = [
  "pathetique-mvt2:m025-028:piano:mcp-session:v1",
  "pathetique-mvt2:m001-004:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m009-012:piano:mcp-session:v1",
];

/**
 * Slice 18: the 13-record stratified cohort for tool-inspected corpus
 * validation. Tests whether Slice 17's Pathétique result generalizes:
 *  - Stratum A — Dense Bach controls (4 records): tests Bach regression
 *  - Stratum B — Pathétique (4 records): tests Pathétique pattern
 *  - Stratum C — Schumann (2 records): sparse-melody pattern
 *  - Stratum D — Chopin Nocturne (2 records): variety
 *  - Stratum E — Test holdout (1 record): clair-de-lune integrity check
 *
 * When this filter is set, only the e3-tool evaluator runs against this
 * iteration list; legacy E1/E2/E3 iteration lists become empty (legacy
 * n=3 data is REUSED from Slice 14/16/17 artifacts where available, n=1
 * corpus-scale data otherwise, with caveats documented in the slice doc).
 */
const SLICE_18_COHORT_RECORD_IDS: readonly string[] = [
  // Stratum A — Dense Bach controls
  "bach-prelude-c-major-bwv846:m009-012:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m029-032:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m037-040:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m045-048:piano:mcp-session:v1",
  // Stratum B — Pathétique
  "pathetique-mvt2:m001-004:piano:mcp-session:v1",
  "pathetique-mvt2:m009-012:piano:mcp-session:v1",
  "pathetique-mvt2:m017-020:piano:mcp-session:v1",
  "pathetique-mvt2:m025-028:piano:mcp-session:v1",
  // Stratum C — Schumann
  "schumann-traumerei:m001-004:piano:mcp-session:v1",
  "schumann-traumerei:m045-048:piano:mcp-session:v1",
  // Stratum D — Chopin Nocturne
  "chopin-nocturne-op9-no2:m009-012:piano:mcp-session:v1",
  "chopin-nocturne-op9-no2:m001-004:piano:mcp-session:v1",
  // Stratum E — Test holdout
  "clair-de-lune:m031-034:piano:mcp-session:v1",
];

interface CliOpts {
  scope: "public" | "source";
  model: string;
  seed: string;
  dryRun: boolean;
  help: boolean;
  evals: ReadonlySet<EvalName>;
  outputPath: string | null;
  sampleOutputPath: string | null;
  /** Slice 14: K runs per record/pair. Default 1 (backward-compat). */
  n: number;
  /** Slice 14: restrict the sample plan to a named subset. Default "all". */
  sampleFilter: SampleFilter;
}

function parseEvalsList(raw: string): Set<EvalName> {
  const allowed: ReadonlySet<EvalName> = new Set([
    "e1",
    "e2",
    "e3",
    "e3-tool",
  ] as const);
  const out = new Set<EvalName>();
  for (const part of raw.split(",")) {
    const v = part.trim().toLowerCase();
    if (v === "") continue;
    if (!allowed.has(v as EvalName)) {
      console.error(
        `ERROR: --evals contains unknown evaluator '${v}'. Allowed: e1, e2, e3, e3-tool.`,
      );
      process.exit(1);
    }
    out.add(v as EvalName);
  }
  if (out.size === 0) {
    console.error("ERROR: --evals must list at least one of e1, e2, e3, e3-tool.");
    process.exit(1);
  }
  return out;
}

function parseArgs(): CliOpts {
  const args = process.argv.slice(2);
  const opts: CliOpts = {
    scope: "public",
    model: "qwen2.5:7b",
    seed: "slice12-2026-05-17",
    dryRun: false,
    help: false,
    evals: new Set<EvalName>(["e1", "e2", "e3"]),
    outputPath: null,
    sampleOutputPath: null,
    n: 1,
    sampleFilter: "all",
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
    } else if (a === "--evals" && i + 1 < args.length) {
      opts.evals = parseEvalsList(args[++i]);
    } else if (a === "--output" && i + 1 < args.length) {
      opts.outputPath = args[++i];
    } else if (a === "--sample-output" && i + 1 < args.length) {
      opts.sampleOutputPath = args[++i];
    } else if (a === "--n" && i + 1 < args.length) {
      const raw = args[++i];
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1) {
        console.error(`ERROR: --n must be a positive integer, got '${raw}'.`);
        process.exit(1);
      }
      opts.n = parsed;
    } else if (a === "--sample-filter" && i + 1 < args.length) {
      const v = args[++i].trim().toLowerCase() as SampleFilter;
      if (!SAMPLE_FILTERS.includes(v)) {
        console.error(
          `ERROR: --sample-filter must be one of ${SAMPLE_FILTERS.join(", ")}, got '${v}'.`,
        );
        process.exit(1);
      }
      opts.sampleFilter = v;
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
  --evals e1,e2,e3        Subset to run (default: e1,e2,e3 = legacy three).
                          Add 'e3-tool' for the Slice 17 tool-scaffolded variant.
  --output <path>         Override result artifact path (relative to PUBLIC_DIR
                          or absolute). Use to write focused-rerun results
                          without overwriting the canonical Slice 12 artifact.
  --sample-output <path>  Override sample manifest path. If --output is given
                          without --sample-output, sample manifest stays at
                          default path.
  --dry-run               Build sample plan, skip model calls
  --n <K>                 (Slice 14) K runs per record/pair (default 1).
                          K>1 enables multi-run aggregation: per-record
                          runs:[K] array + AggregateStats; corpus-eval-results
                          schema bumps from 1.0.0 to 2.0.0.
  --sample-filter <name>  (Slice 14/16/17/18) restrict sample plan to a subset:
                            all              — full plan (default)
                            enriched-only    — 6 enriched records / 4 enriched pairs
                            slice16-cohort   — 3-record Slice 16 cohort (E3 only)
                            slice17-cohort   — 3-record Slice 17 demo (e3-tool only)
                            slice18-cohort   — 13-record Slice 18 stratified cohort
                                                (e3-tool only; Bach/Pathétique/
                                                Schumann/Chopin/clair-de-lune)
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

/**
 * Resolve a user-supplied path. Relative paths are anchored at PUBLIC_DIR
 * (so `--output evals/foo.json` writes to datasets/jam-actions-v0-public/evals/foo.json).
 * Absolute paths are used verbatim.
 */
function resolveOutputPath(userPath: string, defaultPath: string): string {
  if (userPath === "") return defaultPath;
  if (
    userPath.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(userPath)
  ) {
    return userPath;
  }
  return join(PUBLIC_DIR, userPath);
}

const DEFAULT_RESULT_PATH = join(PUBLIC_EVALS_DIR, RESULT_FILENAME);
const DEFAULT_SAMPLE_PATH = join(PUBLIC_EVALS_DIR, SAMPLE_FILENAME);
const RESULT_PATH =
  opts.outputPath !== null
    ? resolveOutputPath(opts.outputPath, DEFAULT_RESULT_PATH)
    : DEFAULT_RESULT_PATH;
const SAMPLE_PATH =
  opts.sampleOutputPath !== null
    ? resolveOutputPath(opts.sampleOutputPath, DEFAULT_SAMPLE_PATH)
    : DEFAULT_SAMPLE_PATH;

const evalsLabel = ["e1", "e2", "e3"].filter((e) => opts.evals.has(e as EvalName)).join(",");

console.log("=".repeat(72));
console.log(" jam-actions-v0 Corpus-Scale Eval Runner");
console.log("=".repeat(72));
console.log(`  scope:         ${opts.scope}`);
console.log(`  model:         ${opts.model}`);
console.log(`  seed:          ${opts.seed}`);
console.log(`  evals:         ${evalsLabel}`);
console.log(`  n (runs/rec):  ${opts.n}${opts.n === 1 ? " (n=1 backward-compat schema)" : ` (Slice 14 multi-run; schema 2.0.0)`}`);
console.log(`  sample-filter: ${opts.sampleFilter}`);
console.log(`  dry-run:       ${opts.dryRun}`);
console.log(`  result:        ${RESULT_PATH}`);
console.log(`  sample:        ${SAMPLE_PATH}`);
console.log();

// Refuse to overwrite the canonical Slice 12 artifact unless --output was
// explicitly given. The default RESULT_PATH points at
// `corpus-scale-qwen2.5-7b-results.json` (Slice 12's locked artifact).
if (opts.outputPath === null && existsSync(DEFAULT_RESULT_PATH)) {
  console.error(
    `ERROR: ${DEFAULT_RESULT_PATH} already exists. Refusing to overwrite the canonical Slice 12 ` +
      `result artifact. Pass --output <path> to write a new artifact (e.g. ` +
      `--output evals/post-isolation-qwen2.5-7b-results.json for a focused rerun).`,
  );
  process.exit(1);
}

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

// ─── Slice 14: sample-filter post-pass ─────────────────────────────────────────
// Filters narrow which records/pairs from the sample plan get fed to the eval
// loops. The plan ITSELF is unchanged (still seeded + validated above); only
// the iteration lists are restricted. The sample manifest written below is
// also unfiltered (the seed-determined plan, not the filtered iteration list)
// — readers can reconstruct what was run from the per-record results.
//
// Defined filters:
//   - "all"             : no narrowing (default).
//   - "enriched-only"   : keep only the 6 Slice 11 enriched records (E1, E3)
//                         and the 4 enriched pairs (E2).
//   - "slice16-cohort"  : (Slice 16) replace iteration lists with the 3-record
//                         rubric-guided enrichment cohort. E1 + E2 lists become
//                         empty (Slice 16 only runs E3). The full sample plan
//                         remains intact for the sampler's required-inclusion
//                         assertions; only the per-eval iteration is restricted.

const enrichedRecordSet = new Set<string>(SLICE_11_ENRICHED_RECORD_IDS);
const slice16CohortSet = new Set<string>(SLICE_16_COHORT_RECORD_IDS);
const slice17CohortSet = new Set<string>(SLICE_17_COHORT_RECORD_IDS);
const slice18CohortSet = new Set<string>(SLICE_18_COHORT_RECORD_IDS);

function filterByCohort(ids: string[]): string[] {
  return ids.filter((id) => slice16CohortSet.has(id));
}

function filterBySlice17Cohort(ids: string[]): string[] {
  return ids.filter((id) => slice17CohortSet.has(id));
}

function filterBySlice18Cohort(ids: string[]): string[] {
  return ids.filter((id) => slice18CohortSet.has(id));
}

let filteredE1Ids: string[];
let filteredE2Pairs: typeof plan.e2.pairs;
let filteredE3Ids: string[];
/**
 * Slice 17: the new e3-tool evaluator runs against this iteration list (the 3
 * demo cohort records). Empty for non-slice17 filters.
 */
let filteredE3ToolIds: string[];
if (opts.sampleFilter === "enriched-only") {
  filteredE1Ids = plan.e1.recordIds.filter((id) => enrichedRecordSet.has(id));
  filteredE2Pairs = plan.e2.pairs.filter((p) => p.containsEnriched);
  filteredE3Ids = plan.e3.recordIds.filter((id) => enrichedRecordSet.has(id));
  filteredE3ToolIds = [];
} else if (opts.sampleFilter === "slice16-cohort") {
  // Sample plan unchanged; iteration lists replaced with the 3-record cohort.
  // E3: explicit cohort ids (sample plan already contains Pathétique m001-004,
  // and we materialize Schumann m001-004 + Chopin Nocturne m009-012 from the
  // loaded public records regardless of whether the sampler picked them).
  filteredE1Ids = filterByCohort(plan.e1.recordIds);
  filteredE2Pairs = plan.e2.pairs.filter(
    (p) => slice16CohortSet.has(p.promptId) || slice16CohortSet.has(p.targetId),
  );
  filteredE3Ids = [...SLICE_16_COHORT_RECORD_IDS];
  filteredE3ToolIds = [];
} else if (opts.sampleFilter === "slice17-cohort") {
  // Slice 17: pure demo for the new tool-inspected variant. Legacy E1/E2/E3
  // iteration lists are empty by design — legacy n=3 data is REUSED from
  // Slice 14/16 artifacts when the slice doc reports the 4-condition table.
  // Only --evals e3-tool produces fresh output under this filter.
  filteredE1Ids = filterBySlice17Cohort(plan.e1.recordIds);
  filteredE2Pairs = plan.e2.pairs.filter(
    (p) => slice17CohortSet.has(p.promptId) || slice17CohortSet.has(p.targetId),
  );
  filteredE3Ids = filterBySlice17Cohort(plan.e3.recordIds);
  filteredE3ToolIds = [...SLICE_17_COHORT_RECORD_IDS];
} else if (opts.sampleFilter === "slice18-cohort") {
  // Slice 18: corpus-validation cohort for the tool-inspected variant on
  // 13 stratified records (Bach controls, Pathétique, Schumann, Chopin,
  // clair-de-lune). Legacy E1/E2/E3 iteration lists are empty by design —
  // legacy n=3 data is REUSED from Slice 14/16/17 artifacts and n=1
  // corpus-scale data is consulted where n=3 doesn't exist, with caveats
  // documented in the slice doc. The E3-tool iteration replaces the plan
  // (some cohort ids — clair-de-lune:m031-034, Schumann m001-004, Chopin
  // m009-012 — are not in the sampler's E3 plan, identical to the Slice 16
  // cohort-replace pattern).
  filteredE1Ids = filterBySlice18Cohort(plan.e1.recordIds);
  filteredE2Pairs = plan.e2.pairs.filter(
    (p) => slice18CohortSet.has(p.promptId) || slice18CohortSet.has(p.targetId),
  );
  filteredE3Ids = filterBySlice18Cohort(plan.e3.recordIds);
  filteredE3ToolIds = [...SLICE_18_COHORT_RECORD_IDS];
} else {
  filteredE1Ids = [...plan.e1.recordIds];
  filteredE2Pairs = [...plan.e2.pairs];
  filteredE3Ids = [...plan.e3.recordIds];
  filteredE3ToolIds = opts.evals.has("e3-tool")
    ? [...plan.e3.recordIds]
    : [];
}

if (opts.sampleFilter !== "all") {
  console.log(
    `\nSample filter '${opts.sampleFilter}' applied:` +
      `\n  E1 records: ${plan.e1.recordIds.length} -> ${filteredE1Ids.length}` +
      `\n  E2 pairs:   ${plan.e2.pairs.length} -> ${filteredE2Pairs.length}` +
      `\n  E3 records: ${plan.e3.recordIds.length} -> ${filteredE3Ids.length}` +
      `\n  E3-tool records: ${filteredE3ToolIds.length}` +
        (opts.sampleFilter === "slice17-cohort"
          ? " (Slice 17 demo cohort)"
          : opts.sampleFilter === "slice18-cohort"
            ? " (Slice 18 stratified cohort)"
            : ""),
  );
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
// Hard rule: never overwrite the canonical Slice 12 sample manifest unless the
// user explicitly opts in via --sample-output. The manifest is deterministic
// given the same seed + records, but its `generated_at` timestamp changes per
// run — overwriting would dirty the checksums for no useful change. Focused
// reruns (Slice 13) get a separate path or skip the rewrite.
if (existsSync(SAMPLE_PATH) && opts.sampleOutputPath === null) {
  console.log(`\nSample manifest already present (not rewriting): ${SAMPLE_PATH}`);
} else {
  writeFileSync(SAMPLE_PATH, JSON.stringify(sampleManifest, null, 2) + "\n", "utf8");
  console.log(`\nSample manifest written: ${SAMPLE_PATH}`);
}

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

// ─── E1 (tool-use): K runs per record (default K=1; Slice 14 K>1) ─────────────

const K_RUNS = opts.n;
const N_RUNS = 1; // Inner: each call to runE3ForRecord uses n=1 internal runs (the K iterations wrap at the outer record level).

interface RecordE1Result {
  recordId: string;
  enriched: boolean;
  passed: boolean; // n=1: result of the single run; K>1: majority_pass
  runs: E1RunResult[];
  rawOutputs: string[];
  aggregate?: AggregateStats; // present when K>1
}

const e1Results: RecordE1Result[] = [];
let e1PassRate = 0;
let e1EnrichedPassRate = 0;
let e1NonEnrichedPassRate = 0;

if (opts.evals.has("e1")) {
  const e1Total = filteredE1Ids.length;
  console.log(
    `\n━━━ E1: Tool-Use Correctness (${e1Total} records, K=${K_RUNS} run${K_RUNS === 1 ? "" : "s"}/record) ━━━`,
  );
  let e1Index = 0;
  for (const recId of filteredE1Ids) {
    e1Index++;
    const raw = recordsById.get(recId);
    if (!raw) {
      console.error(`  [${e1Index}/${e1Total}] ${recId}: NOT FOUND in records`);
      continue;
    }
    const isEnriched = SLICE_11_ENRICHED_RECORD_IDS.includes(recId);
    const tag = isEnriched ? "[ENR]" : "     ";

    const runs: E1RunResult[] = [];
    const rawOutputs: string[] = [];

    for (let k = 0; k < K_RUNS; k++) {
      const runLabel =
        K_RUNS === 1
          ? `  [${String(e1Index).padStart(2)}/${e1Total}] ${tag} ${recId}`
          : `  [${String(e1Index).padStart(2)}/${e1Total} run ${k + 1}/${K_RUNS}] ${tag} ${recId}`;
      process.stdout.write(`${runLabel} ... `);
      const t0 = Date.now();
      let result: E1RunResult;
      try {
        result = await runE1ForRecord(
          raw as unknown as Parameters<typeof runE1ForRecord>[0],
          catalog,
          backend,
          k,
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
      runs.push(result);
      rawOutputs.push(rawText ?? "(no raw text captured)");
    }

    if (runs.length === 0) {
      // All K iterations errored — record as zero-run failure (rare; usually a backend outage)
      console.error(
        `  [${e1Index}/${e1Total}] ${tag} ${recId}: ALL ${K_RUNS} runs errored; skipping aggregate`,
      );
      continue;
    }

    // K=1 (backward-compat): passed = single run's passed
    // K>1: passed = majority_pass (per Slice 14 doctrine)
    let aggregate: AggregateStats | undefined;
    let recordPassed: boolean;
    if (K_RUNS === 1) {
      recordPassed = runs[0].passed;
    } else {
      const runResults: RunResult<E1RunResult>[] = runs.map((r, i) => ({
        run_index: i,
        metric: r,
        passed: r.passed,
        durationMs: r.meta.latencyMs,
        raw_output: rawOutputs[i] ?? null,
      }));
      // E1 has no continuous metric — only pass/fail. Extract null to keep
      // metric_mean=null while still computing pass_rate.
      aggregate = aggregateRuns(runResults, () => null);
      recordPassed = aggregate.majority_pass;
      console.log(
        `      ↳ aggregate: pass_rate=${aggregate.pass_rate.toFixed(3)} majority_pass=${aggregate.majority_pass}`,
      );
    }

    e1Results.push({
      recordId: recId,
      enriched: isEnriched,
      passed: recordPassed,
      runs,
      rawOutputs,
      aggregate,
    });
  }

  e1PassRate = e1Results.length > 0 ? e1Results.filter((r) => r.passed).length / e1Results.length : 0;
  e1EnrichedPassRate =
    e1Results.filter((r) => r.enriched).length > 0
      ? e1Results.filter((r) => r.enriched && r.passed).length /
        e1Results.filter((r) => r.enriched).length
      : 0;
  e1NonEnrichedPassRate =
    e1Results.filter((r) => !r.enriched).length > 0
      ? e1Results.filter((r) => !r.enriched && r.passed).length /
        e1Results.filter((r) => !r.enriched).length
      : 0;
  const e1PassLabel = K_RUNS === 1 ? "pass rate" : "majority-pass rate";
  console.log(
    `\nE1 aggregate ${e1PassLabel}: ${(e1PassRate * 100).toFixed(1)}% (${e1Results.filter((r) => r.passed).length}/${e1Results.length})`,
  );
  console.log(`     enriched: ${(e1EnrichedPassRate * 100).toFixed(1)}% (${e1Results.filter((r) => r.enriched && r.passed).length}/${e1Results.filter((r) => r.enriched).length})`);
  console.log(`  non-enriched: ${(e1NonEnrichedPassRate * 100).toFixed(1)}% (${e1Results.filter((r) => !r.enriched && r.passed).length}/${e1Results.filter((r) => !r.enriched).length})`);
} else {
  console.log("\n━━━ E1 SKIPPED (--evals subset excludes e1) ━━━");
}

// ─── E2 (continuation): 12 pairs, n=1 ──────────────────────────────────────────

interface PairE2RunResultBundle {
  promptId: string;
  targetId: string;
  containsEnriched: boolean;
  enrichedHalves: string[];
  passed: boolean; // n=1: single run pass; K>1: majority_pass
  grooveOA: number | null; // n=1: single grooveOA; K>1: mean (or null if all not_computable)
  parseStatus: string | null; // first-run parseStatus (or null)
  runs: E2RunResult[];
  rawOutputs: string[];
  aggregate?: AggregateStats; // present when K>1
}

function mean(values: Array<number | null | undefined>): number | null {
  const v = values.filter((x): x is number => typeof x === "number");
  if (v.length === 0) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

const e2Results: PairE2RunResultBundle[] = [];
let e2GrooveMean: number | null = null;
let e2GrooveMeanEnriched: number | null = null;
let e2GrooveMeanNonEnriched: number | null = null;
let e2PassRate = 0;
let e2EnrichedPairs: PairE2RunResultBundle[] = [];
let e2NonEnrichedPairs: PairE2RunResultBundle[] = [];

if (opts.evals.has("e2")) {
  const e2Total = filteredE2Pairs.length;
  console.log(
    `\n━━━ E2: Phrase Continuation (${e2Total} pairs, K=${K_RUNS} run${K_RUNS === 1 ? "" : "s"}/pair) ━━━`,
  );
  let e2Index = 0;
  for (const pair of filteredE2Pairs) {
    e2Index++;
    const promptRaw = recordsById.get(pair.promptId);
    const targetRaw = recordsById.get(pair.targetId);
    if (!promptRaw || !targetRaw) {
      console.error(`  [${e2Index}/${e2Total}] ${pair.promptId} -> ${pair.targetId}: NOT FOUND`);
      continue;
    }
    const tag = pair.containsEnriched ? "[ENR]" : "     ";

    const runs: E2RunResult[] = [];
    const rawOutputs: string[] = [];

    for (let k = 0; k < K_RUNS; k++) {
      const runLabel =
        K_RUNS === 1
          ? `  [${String(e2Index).padStart(2)}/${e2Total}] ${tag} ${pair.promptId} -> ${pair.targetId}`
          : `  [${String(e2Index).padStart(2)}/${e2Total} run ${k + 1}/${K_RUNS}] ${tag} ${pair.promptId} -> ${pair.targetId}`;
      process.stdout.write(`${runLabel} ... `);
      const t0 = Date.now();
      let result: E2RunResult;
      try {
        result = await runE2ForPair(
          promptRaw as unknown as Parameters<typeof runE2ForPair>[0],
          targetRaw as unknown as PairRecord,
          backend,
          k,
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
      runs.push(result);
      rawOutputs.push(rawText ?? "(no raw text captured)");
    }

    if (runs.length === 0) {
      console.error(
        `  [${e2Index}/${e2Total}] ${tag} ${pair.promptId} -> ${pair.targetId}: ALL ${K_RUNS} runs errored; skipping aggregate`,
      );
      continue;
    }

    // K=1 (backward-compat): top-level passed/grooveOA = single run's values
    // K>1: top-level passed = majority_pass; grooveOA = mean (numeric metric)
    let aggregate: AggregateStats | undefined;
    let pairPassed: boolean;
    let pairGroove: number | null;
    if (K_RUNS === 1) {
      pairPassed = runs[0].passed;
      pairGroove = runs[0].grooveOA;
    } else {
      const runResults: RunResult<E2RunResult>[] = runs.map((r, i) => ({
        run_index: i,
        metric: r,
        passed: r.passed,
        durationMs: r.meta.latencyMs,
        raw_output: rawOutputs[i] ?? null,
      }));
      aggregate = aggregateRuns(runResults, (r) => r.grooveOA);
      pairPassed = aggregate.majority_pass;
      pairGroove = aggregate.metric_mean;
      console.log(
        `      ↳ aggregate: pass_rate=${aggregate.pass_rate.toFixed(3)} majority_pass=${aggregate.majority_pass} ` +
          `grooveOA_mean=${aggregate.metric_mean?.toFixed(3) ?? "n/a"} stddev=${aggregate.metric_stddev?.toFixed(3) ?? "n/a"} ` +
          `min=${aggregate.metric_min?.toFixed(3) ?? "n/a"} max=${aggregate.metric_max?.toFixed(3) ?? "n/a"} ` +
          `not_computable=${aggregate.not_computable_count}`,
      );
    }

    e2Results.push({
      promptId: pair.promptId,
      targetId: pair.targetId,
      containsEnriched: pair.containsEnriched,
      enrichedHalves: pair.enrichedHalves,
      passed: pairPassed,
      grooveOA: pairGroove,
      parseStatus: runs[0].meta.parseStatus ?? null,
      runs,
      rawOutputs,
      aggregate,
    });
  }

  e2EnrichedPairs = e2Results.filter((r) => r.containsEnriched);
  e2NonEnrichedPairs = e2Results.filter((r) => !r.containsEnriched);
  e2GrooveMean = mean(e2Results.map((r) => r.grooveOA));
  e2GrooveMeanEnriched = mean(e2EnrichedPairs.map((r) => r.grooveOA));
  e2GrooveMeanNonEnriched = mean(e2NonEnrichedPairs.map((r) => r.grooveOA));
  e2PassRate = e2Results.length > 0 ? e2Results.filter((r) => r.passed).length / e2Results.length : 0;

  const e2PassLabel = K_RUNS === 1 ? "pass" : "majority-pass";
  console.log(
    `\nE2 aggregate: ${e2Results.filter((r) => r.passed).length}/${e2Results.length} ${e2PassLabel}`,
  );
  console.log(`  mean grooveOA (all pairs):       ${e2GrooveMean?.toFixed(3) ?? "n/a"}`);
  console.log(`  mean grooveOA (enriched only):   ${e2GrooveMeanEnriched?.toFixed(3) ?? "n/a"}`);
  console.log(`  mean grooveOA (non-enriched):    ${e2GrooveMeanNonEnriched?.toFixed(3) ?? "n/a"}`);
} else {
  console.log("\n━━━ E2 SKIPPED (--evals subset excludes e2) ━━━");
}

// ─── E3 (annotation grounding): 24 records, n=1 ────────────────────────────────

interface RecordE3ResultBundle {
  recordId: string;
  enriched: boolean;
  // K=1: single run's E3RecordResult (existing behavior)
  // K>1: first run's result (the canonical reference) + perRunResults[K]
  result: E3RecordResult;
  // K>1: full K-run sequence (each entry is an outer record-level run)
  perRunResults?: E3RecordResult[];
  margins: { fullVsTextOnly: number | null; fullVsRandomMidi: number | null };
  // K>1: per-context aggregate stats (full / text_only / random_midi) over K outer runs
  aggregateFull?: AggregateStats;
  aggregateTextOnly?: AggregateStats;
  aggregateRandomMidi?: AggregateStats;
  // K>1: aggregate stats over per-run margins (full - text_only, full - random_midi)
  aggregateMarginText?: AggregateStats;
  aggregateMarginRandomMidi?: AggregateStats;
}

const e3Results: RecordE3ResultBundle[] = [];
let e3FullMean: number | null = null;
let e3TextOnlyMean: number | null = null;
let e3RandomMidiMean: number | null = null;
let e3MarginTextOnly: number | null = null;
let e3MarginRandomMidi: number | null = null;
let e3Enriched: RecordE3ResultBundle[] = [];
let e3NonEnriched: RecordE3ResultBundle[] = [];
let e3EnrFullMean: number | null = null;
let e3EnrTextMean: number | null = null;
let e3EnrRandMean: number | null = null;
let e3EnrMarginText: number | null = null;
let e3EnrMarginRand: number | null = null;
let e3NonEnrFullMean: number | null = null;
let e3NonEnrTextMean: number | null = null;
let e3NonEnrRandMean: number | null = null;
let e3NonEnrMarginText: number | null = null;

if (opts.evals.has("e3")) {
  const e3Total = filteredE3Ids.length;
  console.log(
    `\n━━━ E3: Annotation Grounding MCQ (${e3Total} records, K=${K_RUNS} run${K_RUNS === 1 ? "" : "s"}/record) ━━━`,
  );
  const e3RecordsForRandomMidi = publicRecords as unknown as E3Record[];
  let e3Index = 0;
  for (const recId of filteredE3Ids) {
    e3Index++;
    const raw = recordsById.get(recId);
    if (!raw) {
      console.error(`  [${e3Index}/${e3Total}] ${recId}: NOT FOUND`);
      continue;
    }
    const isEnriched = SLICE_11_ENRICHED_RECORD_IDS.includes(recId);
    const tag = isEnriched ? "[ENR]" : "     ";

    const runOuter: E3RecordResult[] = [];

    for (let k = 0; k < K_RUNS; k++) {
      const runLabel =
        K_RUNS === 1
          ? `  [${String(e3Index).padStart(2)}/${e3Total}] ${tag} ${recId}`
          : `  [${String(e3Index).padStart(2)}/${e3Total} run ${k + 1}/${K_RUNS}] ${tag} ${recId}`;
      process.stdout.write(`${runLabel} ... `);
      const t0 = Date.now();
      let result: E3RecordResult;
      try {
        result = await runE3ForRecord(
          raw as unknown as E3Record,
          e3RecordsForRandomMidi,
          backend,
          N_RUNS, // inner per-question n stays at 1; K wraps at the outer record level
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
      runOuter.push(result);
    }

    if (runOuter.length === 0) {
      console.error(
        `  [${e3Index}/${e3Total}] ${tag} ${recId}: ALL ${K_RUNS} runs errored; skipping aggregate`,
      );
      continue;
    }

    const firstResult = runOuter[0];
    let bundleMarginText: number | null;
    let bundleMarginRandomMidi: number | null;
    let aggregateFull: AggregateStats | undefined;
    let aggregateTextOnly: AggregateStats | undefined;
    let aggregateRandomMidi: AggregateStats | undefined;
    let aggregateMarginText: AggregateStats | undefined;
    let aggregateMarginRandomMidi: AggregateStats | undefined;
    let perRunResults: E3RecordResult[] | undefined;

    if (K_RUNS === 1) {
      const full = firstResult.aggregate.full;
      const textOnly = firstResult.aggregate.text_only;
      const randomMidi = firstResult.aggregate.random_midi;
      bundleMarginText = full !== null && textOnly !== null ? full - textOnly : null;
      bundleMarginRandomMidi = full !== null && randomMidi !== null ? full - randomMidi : null;
    } else {
      perRunResults = runOuter;
      // Aggregate per-context scores across K outer runs
      const fullRuns: RunResult<{ v: number | null }>[] = runOuter.map(
        (r, i): RunResult<{ v: number | null }> => ({
          run_index: i,
          metric: { v: r.aggregate.full },
          passed: r.aggregate.full !== null,
          durationMs: 0,
        }),
      );
      const textOnlyRuns: RunResult<{ v: number | null }>[] = runOuter.map(
        (r, i): RunResult<{ v: number | null }> => ({
          run_index: i,
          metric: { v: r.aggregate.text_only },
          passed: r.aggregate.text_only !== null,
          durationMs: 0,
        }),
      );
      const randomMidiRuns: RunResult<{ v: number | null }>[] = runOuter.map(
        (r, i): RunResult<{ v: number | null }> => ({
          run_index: i,
          metric: { v: r.aggregate.random_midi },
          passed: r.aggregate.random_midi !== null,
          durationMs: 0,
        }),
      );
      aggregateFull = aggregateRuns(fullRuns, (m) => m.v);
      aggregateTextOnly = aggregateRuns(textOnlyRuns, (m) => m.v);
      aggregateRandomMidi = aggregateRuns(randomMidiRuns, (m) => m.v);

      // Per-run margins (one value per outer run)
      const marginTextValues: Array<number | null> = runOuter.map((r) =>
        r.aggregate.full !== null && r.aggregate.text_only !== null
          ? r.aggregate.full - r.aggregate.text_only
          : null,
      );
      const marginRandomMidiValues: Array<number | null> = runOuter.map((r) =>
        r.aggregate.full !== null && r.aggregate.random_midi !== null
          ? r.aggregate.full - r.aggregate.random_midi
          : null,
      );
      aggregateMarginText = aggregateValues(
        marginTextValues,
        (v) => v !== null && v >= E3_MARGIN_THRESHOLD,
      );
      aggregateMarginRandomMidi = aggregateValues(
        marginRandomMidiValues,
        (v) => v !== null && v >= E3_MARGIN_THRESHOLD,
      );

      bundleMarginText = aggregateMarginText.metric_mean;
      bundleMarginRandomMidi = aggregateMarginRandomMidi.metric_mean;

      console.log(
        `      ↳ aggregate: full_mean=${aggregateFull.metric_mean?.toFixed(3) ?? "n/a"}±${aggregateFull.metric_stddev?.toFixed(3) ?? "n/a"} ` +
          `text_mean=${aggregateTextOnly.metric_mean?.toFixed(3) ?? "n/a"}±${aggregateTextOnly.metric_stddev?.toFixed(3) ?? "n/a"} ` +
          `rmidi_mean=${aggregateRandomMidi.metric_mean?.toFixed(3) ?? "n/a"}±${aggregateRandomMidi.metric_stddev?.toFixed(3) ?? "n/a"}`,
      );
      console.log(
        `      ↳ margins:   mT_mean=${aggregateMarginText.metric_mean?.toFixed(3) ?? "n/a"}±${aggregateMarginText.metric_stddev?.toFixed(3) ?? "n/a"} (pass_rate=${aggregateMarginText.pass_rate.toFixed(3)}) ` +
          `mR_mean=${aggregateMarginRandomMidi.metric_mean?.toFixed(3) ?? "n/a"}±${aggregateMarginRandomMidi.metric_stddev?.toFixed(3) ?? "n/a"} (pass_rate=${aggregateMarginRandomMidi.pass_rate.toFixed(3)})`,
      );
    }

    // For K>1 the bundle's `result` field is the first run (the canonical
    // reference for shape-compatibility); aggregates carry the K-run stats.
    e3Results.push({
      recordId: recId,
      enriched: isEnriched,
      result: firstResult,
      perRunResults,
      margins: {
        fullVsTextOnly: bundleMarginText,
        fullVsRandomMidi: bundleMarginRandomMidi,
      },
      aggregateFull,
      aggregateTextOnly,
      aggregateRandomMidi,
      aggregateMarginText,
      aggregateMarginRandomMidi,
    });
  }

  e3FullMean = mean(e3Results.map((r) => r.result.aggregate.full));
  e3TextOnlyMean = mean(e3Results.map((r) => r.result.aggregate.text_only));
  e3RandomMidiMean = mean(e3Results.map((r) => r.result.aggregate.random_midi));
  e3MarginTextOnly = e3FullMean !== null && e3TextOnlyMean !== null ? e3FullMean - e3TextOnlyMean : null;
  e3MarginRandomMidi = e3FullMean !== null && e3RandomMidiMean !== null ? e3FullMean - e3RandomMidiMean : null;

  e3Enriched = e3Results.filter((r) => r.enriched);
  e3NonEnriched = e3Results.filter((r) => !r.enriched);
  e3EnrFullMean = mean(e3Enriched.map((r) => r.result.aggregate.full));
  e3EnrTextMean = mean(e3Enriched.map((r) => r.result.aggregate.text_only));
  e3EnrRandMean = mean(e3Enriched.map((r) => r.result.aggregate.random_midi));
  e3EnrMarginText =
    e3EnrFullMean !== null && e3EnrTextMean !== null ? e3EnrFullMean - e3EnrTextMean : null;
  e3EnrMarginRand =
    e3EnrFullMean !== null && e3EnrRandMean !== null ? e3EnrFullMean - e3EnrRandMean : null;

  e3NonEnrFullMean = mean(e3NonEnriched.map((r) => r.result.aggregate.full));
  e3NonEnrTextMean = mean(e3NonEnriched.map((r) => r.result.aggregate.text_only));
  e3NonEnrRandMean = mean(e3NonEnriched.map((r) => r.result.aggregate.random_midi));
  e3NonEnrMarginText =
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
} else {
  console.log("\n━━━ E3 SKIPPED (--evals subset excludes e3) ━━━");
}

// ─── E3-tool (Slice 17 tool-scaffolded variant): demo cohort × K runs ────────

interface ToolInspectedRecordBundle {
  recordId: string;
  enriched: boolean;
  perRunResults: import("../src/dataset/eval/annotation-grounding-tool.js").ToolInspectedRecordResult[];
  aggregate: import("../src/dataset/eval/multi-run-aggregator.js").AggregateStats;
  toolUseStatsAggregate: {
    total_tool_calls: number;
    mean_calls_per_question: number;
    questions_with_zero_calls: number;
    questions_with_one_call: number;
    questions_with_2_calls: number;
    questions_with_3plus_calls: number;
    tool_histogram: Record<string, number>;
    iteration_cap_hit_count: number;
    backend_error_count: number;
    model_silent_count: number;
    model_answered_count: number;
  };
}

const e3ToolResults: ToolInspectedRecordBundle[] = [];

if (opts.evals.has("e3-tool")) {
  const { createOllamaMultiTurnBackend, runToolInspectedForRecord } =
    await import("../src/dataset/eval/annotation-grounding-tool.js");

  const toolBackend = createOllamaMultiTurnBackend(opts.model);
  const totalToolRecords = filteredE3ToolIds.length;
  console.log(
    `\n━━━ E3-TOOL: Tool-Scaffolded Annotation Grounding (${totalToolRecords} records, K=${K_RUNS} run${K_RUNS === 1 ? "" : "s"}/record) ━━━`,
  );
  const e3ToolRecordsForRandomMidi = publicRecords as unknown as E3Record[];
  let e3tIndex = 0;

  for (const recId of filteredE3ToolIds) {
    e3tIndex++;
    const raw = recordsById.get(recId);
    if (!raw) {
      console.error(
        `  [${e3tIndex}/${totalToolRecords}] ${recId}: NOT FOUND`,
      );
      continue;
    }
    const isEnriched = SLICE_11_ENRICHED_RECORD_IDS.includes(recId);
    const tag = isEnriched ? "[ENR]" : "     ";

    const runOuter: import("../src/dataset/eval/annotation-grounding-tool.js").ToolInspectedRecordResult[] = [];

    for (let k = 0; k < K_RUNS; k++) {
      const runLabel =
        K_RUNS === 1
          ? `  [${String(e3tIndex).padStart(2)}/${totalToolRecords}] ${tag} ${recId}`
          : `  [${String(e3tIndex).padStart(2)}/${totalToolRecords} run ${k + 1}/${K_RUNS}] ${tag} ${recId}`;
      process.stdout.write(`${runLabel} ... `);
      const t0 = Date.now();
      let result;
      try {
        result = await runToolInspectedForRecord(
          raw as unknown as E3Record,
          e3ToolRecordsForRandomMidi,
          toolBackend,
          1, // inner n=1: each call to runToolInspectedForRecord runs questions once;
             // outer K wraps at record-level (matches the existing E3 pattern)
        );
      } catch (err) {
        console.log(`ERROR (${Date.now() - t0}ms): ${(err as Error).message}`);
        continue;
      }
      const elapsed = Date.now() - t0;
      const tool = result.aggregate.tool_inspected;
      const meanCalls = result.toolUseStats.mean_calls_per_question;
      console.log(
        `tool_inspected=${tool?.toFixed(3) ?? "n/a"} mean_calls=${meanCalls.toFixed(2)} total_calls=${result.toolUseStats.total_tool_calls} | ${elapsed}ms`,
      );
      runOuter.push(result);
    }

    if (runOuter.length === 0) {
      console.error(
        `  [${e3tIndex}/${totalToolRecords}] ${tag} ${recId}: ALL ${K_RUNS} runs errored; skipping aggregate`,
      );
      continue;
    }

    // Aggregate over K outer runs (tool_inspected scalar score per run).
    const perRunValues: Array<number | null> = runOuter.map(
      (r) => r.aggregate.tool_inspected,
    );
    const aggregate = aggregateValues(perRunValues);

    // Tool-use stats aggregated across K runs.
    const tally = {
      total_tool_calls: 0,
      mean_calls_per_question: 0,
      questions_with_zero_calls: 0,
      questions_with_one_call: 0,
      questions_with_2_calls: 0,
      questions_with_3plus_calls: 0,
      tool_histogram: {} as Record<string, number>,
      iteration_cap_hit_count: 0,
      backend_error_count: 0,
      model_silent_count: 0,
      model_answered_count: 0,
    };
    let totalQuestionsAcrossRuns = 0;
    for (const r of runOuter) {
      tally.total_tool_calls += r.toolUseStats.total_tool_calls;
      tally.questions_with_zero_calls += r.toolUseStats.questions_with_zero_calls;
      tally.questions_with_one_call += r.toolUseStats.questions_with_one_call;
      tally.questions_with_2_calls += r.toolUseStats.questions_with_2_calls;
      tally.questions_with_3plus_calls += r.toolUseStats.questions_with_3plus_calls;
      tally.iteration_cap_hit_count += r.toolUseStats.iteration_cap_hit_count;
      tally.backend_error_count += r.toolUseStats.backend_error_count;
      tally.model_silent_count += r.toolUseStats.model_silent_count;
      tally.model_answered_count += r.toolUseStats.model_answered_count;
      for (const [tool, c] of Object.entries(r.toolUseStats.tool_histogram)) {
        tally.tool_histogram[tool] = (tally.tool_histogram[tool] ?? 0) + c;
      }
      totalQuestionsAcrossRuns += r.questions.length;
    }
    tally.mean_calls_per_question =
      totalQuestionsAcrossRuns > 0
        ? tally.total_tool_calls / totalQuestionsAcrossRuns
        : 0;

    e3ToolResults.push({
      recordId: recId,
      enriched: isEnriched,
      perRunResults: runOuter,
      aggregate,
      toolUseStatsAggregate: tally,
    });

    if (K_RUNS > 1) {
      console.log(
        `      ↳ aggregate: tool_inspected_mean=${aggregate.metric_mean?.toFixed(3) ?? "n/a"}±${aggregate.metric_stddev?.toFixed(3) ?? "n/a"} ` +
          `min=${aggregate.metric_min?.toFixed(3) ?? "n/a"} max=${aggregate.metric_max?.toFixed(3) ?? "n/a"} ` +
          `total_calls=${tally.total_tool_calls} mean_calls/q=${tally.mean_calls_per_question.toFixed(2)} ` +
          `silent=${tally.model_silent_count} cap=${tally.iteration_cap_hit_count}`,
      );
    }
  }

  // Corpus-level summary
  const allToolMeans: Array<number | null> = e3ToolResults.map(
    (r) => r.aggregate.metric_mean ?? null,
  );
  const corpusToolAgg = aggregateValues(allToolMeans);
  console.log(`\nE3-tool aggregate (n=${e3ToolResults.length}):`);
  console.log(
    `  tool_inspected mean: ${corpusToolAgg.metric_mean?.toFixed(3) ?? "n/a"} (±${corpusToolAgg.metric_stddev?.toFixed(3) ?? "n/a"})`,
  );
  let totalAllCalls = 0;
  for (const r of e3ToolResults) totalAllCalls += r.toolUseStatsAggregate.total_tool_calls;
  console.log(`  total tool calls (across all records × runs): ${totalAllCalls}`);
} else if (filteredE3ToolIds.length > 0) {
  console.log("\n━━━ E3-TOOL SKIPPED (--evals subset excludes e3-tool) ━━━");
}

// ─── Write result artifact ────────────────────────────────────────────────────

// ─── Corpus-level multi-run aggregates (Slice 14, K>1 only) ───────────────────

let e2CorpusAggregate: Record<string, unknown> | null = null;
let e3CorpusAggregate: Record<string, unknown> | null = null;
if (K_RUNS > 1) {
  if (opts.evals.has("e2") && e2Results.length > 0) {
    // Per-pair mean grooveOA → aggregate across pairs
    const perPairMeans: Array<number | null> = e2Results.map(
      (r) => r.aggregate?.metric_mean ?? null,
    );
    const perPairStddevs: Array<number | null> = e2Results.map(
      (r) => r.aggregate?.metric_stddev ?? null,
    );
    const corpusGrooveAcrossPairs = aggregateValues(perPairMeans);
    const enrichedPairMeans = e2Results
      .filter((r) => r.containsEnriched)
      .map((r) => r.aggregate?.metric_mean ?? null);
    const nonEnrichedPairMeans = e2Results
      .filter((r) => !r.containsEnriched)
      .map((r) => r.aggregate?.metric_mean ?? null);
    const pairMajorityPassRate =
      e2Results.length > 0
        ? e2Results.filter((r) => r.aggregate?.majority_pass === true).length /
          e2Results.length
        : 0;
    const enrichedSubsetMajPass =
      e2EnrichedPairs.length > 0
        ? e2EnrichedPairs.filter((r) => r.aggregate?.majority_pass === true).length /
          e2EnrichedPairs.length
        : 0;
    const nonEnrichedSubsetMajPass =
      e2NonEnrichedPairs.length > 0
        ? e2NonEnrichedPairs.filter((r) => r.aggregate?.majority_pass === true).length /
          e2NonEnrichedPairs.length
        : 0;
    e2CorpusAggregate = {
      n_pairs: e2Results.length,
      n_runs_per_pair: K_RUNS,
      pair_majority_pass_rate: pairMajorityPassRate,
      mean_grooveOA_across_runs: corpusGrooveAcrossPairs.metric_mean,
      stddev_grooveOA_across_pairs: corpusGrooveAcrossPairs.metric_stddev,
      min_grooveOA_across_pairs: corpusGrooveAcrossPairs.metric_min,
      max_grooveOA_across_pairs: corpusGrooveAcrossPairs.metric_max,
      mean_per_pair_stddev: aggregateValues(perPairStddevs).metric_mean,
      max_per_pair_stddev: aggregateValues(perPairStddevs).metric_max,
      enriched_subset: {
        n_pairs: e2EnrichedPairs.length,
        pair_majority_pass_rate: enrichedSubsetMajPass,
        mean_grooveOA_across_runs: aggregateValues(enrichedPairMeans).metric_mean,
      },
      non_enriched_subset: {
        n_pairs: e2NonEnrichedPairs.length,
        pair_majority_pass_rate: nonEnrichedSubsetMajPass,
        mean_grooveOA_across_runs: aggregateValues(nonEnrichedPairMeans).metric_mean,
      },
    };
  }
  if (opts.evals.has("e3") && e3Results.length > 0) {
    // Aggregate per-record full/text_only/random_midi means → across records
    const perRecFull: Array<number | null> = e3Results.map(
      (r) => r.aggregateFull?.metric_mean ?? null,
    );
    const perRecText: Array<number | null> = e3Results.map(
      (r) => r.aggregateTextOnly?.metric_mean ?? null,
    );
    const perRecRand: Array<number | null> = e3Results.map(
      (r) => r.aggregateRandomMidi?.metric_mean ?? null,
    );
    const perRecMarginText: Array<number | null> = e3Results.map(
      (r) => r.aggregateMarginText?.metric_mean ?? null,
    );
    const perRecMarginRand: Array<number | null> = e3Results.map(
      (r) => r.aggregateMarginRandomMidi?.metric_mean ?? null,
    );
    e3CorpusAggregate = {
      n_records: e3Results.length,
      n_runs_per_record: K_RUNS,
      full: aggregateValues(perRecFull),
      text_only: aggregateValues(perRecText),
      random_midi: aggregateValues(perRecRand),
      margin_vs_text_only: aggregateValues(
        perRecMarginText,
        (v) => v !== null && v >= E3_MARGIN_THRESHOLD,
      ),
      margin_vs_random_midi: aggregateValues(
        perRecMarginRand,
        (v) => v !== null && v >= E3_MARGIN_THRESHOLD,
      ),
      enriched_subset: {
        n: e3Enriched.length,
        full: aggregateValues(
          e3Enriched.map((r) => r.aggregateFull?.metric_mean ?? null),
        ),
        text_only: aggregateValues(
          e3Enriched.map((r) => r.aggregateTextOnly?.metric_mean ?? null),
        ),
        random_midi: aggregateValues(
          e3Enriched.map((r) => r.aggregateRandomMidi?.metric_mean ?? null),
        ),
        margin_vs_text_only: aggregateValues(
          e3Enriched.map((r) => r.aggregateMarginText?.metric_mean ?? null),
          (v) => v !== null && v >= E3_MARGIN_THRESHOLD,
        ),
        margin_vs_random_midi: aggregateValues(
          e3Enriched.map((r) => r.aggregateMarginRandomMidi?.metric_mean ?? null),
          (v) => v !== null && v >= E3_MARGIN_THRESHOLD,
        ),
      },
      non_enriched_subset: {
        n: e3NonEnriched.length,
        full: aggregateValues(
          e3NonEnriched.map((r) => r.aggregateFull?.metric_mean ?? null),
        ),
        text_only: aggregateValues(
          e3NonEnriched.map((r) => r.aggregateTextOnly?.metric_mean ?? null),
        ),
        random_midi: aggregateValues(
          e3NonEnriched.map((r) => r.aggregateRandomMidi?.metric_mean ?? null),
        ),
        margin_vs_text_only: aggregateValues(
          e3NonEnriched.map((r) => r.aggregateMarginText?.metric_mean ?? null),
          (v) => v !== null && v >= E3_MARGIN_THRESHOLD,
        ),
        margin_vs_random_midi: aggregateValues(
          e3NonEnriched.map((r) => r.aggregateMarginRandomMidi?.metric_mean ?? null),
          (v) => v !== null && v >= E3_MARGIN_THRESHOLD,
        ),
      },
    };
  }
}

// ─── Result artifact (schema chosen by K_RUNS) ────────────────────────────────
//
// K_RUNS === 1: schema "corpus-scale-eval/1.0.0" — backward-compat with Slice
//   12/13 result artifacts. Per-record `runs:[1]` array preserved; no new
//   `aggregate` fields. Existing consumers read unchanged.
//
// K_RUNS  >  1: schema "corpus-eval-results/2.0.0" — Slice 14 multi-run
//   extension. Per-record adds `aggregate: AggregateStats`. Top-level adds
//   `corpus_aggregate` for E2/E3 (E1 still pass/fail, aggregate present but
//   metric_* are null). Includes `eval_runs_n` (alias of n_runs) and
//   `sample_filter` (the CLI filter that was applied).
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA_VERSION =
  K_RUNS === 1 ? "corpus-scale-eval/1.0.0" : "corpus-eval-results/2.0.0";

const resultArtifact = {
  schema_version: SCHEMA_VERSION,
  generated_at: new Date().toISOString(),
  scope: opts.scope,
  backend: "ollama",
  model: opts.model,
  seed: opts.seed,
  n_runs: K_RUNS,
  ...(K_RUNS > 1
    ? { eval_runs_n: K_RUNS, sample_filter: opts.sampleFilter }
    : {}),
  evals_run: ["e1", "e2", "e3", "e3-tool"].filter((e) => opts.evals.has(e as EvalName)),
  sample_summary: {
    e1_total: filteredE1Ids.length,
    e2_total: filteredE2Pairs.length,
    e3_total: filteredE3Ids.length,
    e1_total_unfiltered: plan.e1.recordIds.length,
    e2_total_unfiltered: plan.e2.pairs.length,
    e3_total_unfiltered: plan.e3.recordIds.length,
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
        ...(r.aggregate ? { aggregate: r.aggregate } : {}),
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
        ...(r.aggregate ? { aggregate: r.aggregate } : {}),
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
        ...(e2CorpusAggregate ? { corpus_multirun_aggregate: e2CorpusAggregate } : {}),
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
        ...(r.aggregateFull
          ? {
              aggregate: {
                full: r.aggregateFull,
                text_only: r.aggregateTextOnly,
                random_midi: r.aggregateRandomMidi,
                margin_vs_text_only: r.aggregateMarginText,
                margin_vs_random_midi: r.aggregateMarginRandomMidi,
              },
            }
          : {}),
        ...(r.perRunResults
          ? {
              per_run_results: r.perRunResults.map((rr, runIdx) => ({
                run_index: runIdx,
                aggregate: rr.aggregate,
                random_midi_partner_id: rr.randomMidiPartnerId,
                questions: rr.questions.map((q) => ({
                  questionType: q.questionType,
                  questionText: q.questionText,
                  correctOptionIndex: q.correctOptionIndex,
                  options: q.options,
                  majorityScore: q.majorityScore,
                  runs: {
                    full: q.runs.full.map((rn) => ({
                      run: rn.run,
                      score: rn.score,
                      selectedOptionIndex: rn.selectedOptionIndex,
                      meta: rn.meta,
                    })),
                    text_only: q.runs.text_only.map((rn) => ({
                      run: rn.run,
                      score: rn.score,
                      selectedOptionIndex: rn.selectedOptionIndex,
                      meta: rn.meta,
                    })),
                    random_midi: q.runs.random_midi.map((rn) => ({
                      run: rn.run,
                      score: rn.score,
                      selectedOptionIndex: rn.selectedOptionIndex,
                      meta: rn.meta,
                    })),
                  },
                })),
              })),
            }
          : {}),
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
        ...(e3CorpusAggregate ? { corpus_multirun_aggregate: e3CorpusAggregate } : {}),
      },
    },
    "e3-tool": {
      records: e3ToolResults.map((r) => ({
        recordId: r.recordId,
        enriched: r.enriched,
        tool_inspected_mean: r.aggregate.metric_mean,
        tool_inspected_stddev: r.aggregate.metric_stddev,
        tool_inspected_min: r.aggregate.metric_min,
        tool_inspected_max: r.aggregate.metric_max,
        aggregate: r.aggregate,
        tool_use_stats: r.toolUseStatsAggregate,
        per_run_results: r.perRunResults.map((rr, runIdx) => ({
          run_index: runIdx,
          aggregate: rr.aggregate,
          random_midi_partner_id: rr.randomMidiPartnerId,
          tool_use_stats: rr.toolUseStats,
          questions: rr.questions.map((q) => ({
            questionType: q.questionType,
            questionText: q.questionText,
            correctOptionIndex: q.correctOptionIndex,
            options: q.options,
            majorityScore: q.majorityScore,
            runs: q.runs.map((rn) => ({
              run: rn.run,
              score: rn.score,
              selectedOptionIndex: rn.selectedOptionIndex,
              meta: rn.meta,
              trace: {
                tool_call_count: rn.trace.tool_call_count,
                iteration_cap_hit: rn.trace.iteration_cap_hit,
                termination_reason: rn.trace.termination_reason,
                tool_histogram: rn.trace.tool_histogram,
                calls: rn.trace.calls,
                final_text: rn.trace.final_text,
              },
            })),
          })),
        })),
      })),
      aggregate: {
        n_records: e3ToolResults.length,
        tool_inspected: e3ToolResults.length > 0
          ? aggregateValues(e3ToolResults.map((r) => r.aggregate.metric_mean ?? null))
          : null,
        total_tool_calls: e3ToolResults.reduce(
          (s, r) => s + r.toolUseStatsAggregate.total_tool_calls,
          0,
        ),
        tool_histogram: e3ToolResults.reduce<Record<string, number>>((acc, r) => {
          for (const [tool, c] of Object.entries(r.toolUseStatsAggregate.tool_histogram)) {
            acc[tool] = (acc[tool] ?? 0) + c;
          }
          return acc;
        }, {}),
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
if (opts.evals.has("e1")) {
  console.log(`E1 pass rate (corpus):     ${(e1PassRate * 100).toFixed(1)}% — prior baseline (clair-de-lune): 75%`);
}
if (opts.evals.has("e2")) {
  console.log(`E2 pairs passing:          ${e2Results.filter((r) => r.passed).length}/${e2Results.length} (groove threshold ${E2_GROOVE_THRESHOLD})`);
}
if (opts.evals.has("e3")) {
  console.log(`E3 corpus margin vs text:  ${e3MarginTextOnly?.toFixed(3) ?? "n/a"} (threshold +${E3_MARGIN_THRESHOLD})`);
  console.log(`E3 enriched margin vs text:${e3EnrMarginText?.toFixed(3) ?? "n/a"} (threshold +${E3_MARGIN_THRESHOLD})`);
}
if (opts.evals.has("e3-tool")) {
  const meanTool = aggregateValues(
    e3ToolResults.map((r) => r.aggregate.metric_mean ?? null),
  ).metric_mean;
  console.log(`E3-tool corpus tool_inspected mean: ${meanTool?.toFixed(3) ?? "n/a"} (n_records=${e3ToolResults.length})`);
}
