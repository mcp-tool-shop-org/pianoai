#!/usr/bin/env tsx
// ─── e2-continuation-gate.ts — the maker arc's $0 pre-training gate ───────────
//
// Runs generators at the LOCKED E2 future-model bar (phrase-continuation.ts):
//   FUTURE_MODEL_GROOVE_MARGIN = 0.15 — grooveOA(model, gold) must exceed
//   grooveOA(shuffled, gold) by ≥ 0.15.
//
// Cohort: the sealed 22-pair E2 cohort, pinned by pair IDs from the sealed
// gold artifact (datasets/jam-actions-v0/evals/e2-phrase-continuation-results
// .json, evalDate 2026-05-16). Before any model runs, this script recomputes
// the shuffled-control metric per pair and ANDON-halts if it diverges from the
// sealed values — the instrument must reproduce its sealed state.
//
// Instrument validity is reported per pair as HEADROOM = 1 − shuffledVsGold:
// the maximum attainable margin. A pair with headroom < 0.15 cannot be cleared
// by ANY generator (including gold itself) — surfaced, never hidden.
//
// Generation + parsing reuse the E2 machinery unchanged (runE2ForPair: same
// system prompt, tolerant REMI parser, single FM-4 note-empty retry), so
// format-recovery is identical to the sealed Slice 9 condition. Only the FINAL
// metric differs: this gate scores model-vs-GOLD margin (the locked bar), not
// runE2ForPair's model-vs-shuffled(model) self-coherence number.
//
// Usage:
//   pnpm exec tsx scripts/e2-continuation-gate.ts --dry-run
//   pnpm exec tsx scripts/e2-continuation-gate.ts --models qwen2.5:7b
//   pnpm exec tsx scripts/e2-continuation-gate.ts --models jam-ft-v1-qwen25:seed13,jam-ft-v1-qwen25:seed42
//   pnpm exec tsx scripts/e2-continuation-gate.ts --emit-briefs experiments/maker-arc/e2-gate/briefs.json
//   pnpm exec tsx scripts/e2-continuation-gate.ts --score-responses <file> --label claude-fable-5
//
// Flags:
//   --models a,b,c        ollama model names to run (default: none)
//   --dry-run             load cohort, cross-check instrument, report headroom, no model calls
//   --limit N             first N cohort pairs only (smoke)
//   --temperature T       ollama temperature (default 0 — replayable)
//   --seed S              ollama seed (default 42)
//   --emit-briefs <path>  write prompt-only generation briefs (NO gold content) and exit
//   --score-responses <p> score a responses JSON {label?, responses:[{promptId, raw}]}
//   --label <label>       label for --score-responses output
//   --output-dir <dir>    default experiments/maker-arc/e2-gate
//
// $0: local ollama only. No pods, no API spend, no HF pushes.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolvePairs,
  isNotComputable,
  FUTURE_MODEL_GROOVE_MARGIN,
  type PairRecord,
  type ResolvedPair,
} from "../src/dataset/eval/phrase-continuation.js";
import {
  scoreModelContinuation,
  aggregateModelContinuations,
  type ModelContinuationScore,
} from "../src/dataset/eval/model-continuation.js";
import {
  runE2ForPair,
  synthTimedEventsFromRemi,
  E2_SYSTEM_TEXT,
  E2_OUTPUT_SCHEMA,
  buildE2UserPrompt,
} from "../src/dataset/eval/llm-runner.js";
import { parseRemiOutput } from "../src/dataset/eval/remi-output-parser.js";
import { OllamaBackend } from "../src/dataset/eval/llm-backends/ollama.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
// SOURCE scope, not the public package: the sealed 22-pair cohort spans all 10
// songs, and the public cut excludes debussy-arabesque + satie-gymnopedie
// (5 of the 22 pairs). The sealed gold artifact was computed on source scope;
// the gate must run on the same records it cross-checks against.
const SOURCE_RECORDS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0", "records");
const SEALED_E2_ARTIFACT = join(
  REPO_ROOT,
  "datasets",
  "jam-actions-v0",
  "evals",
  "e2-phrase-continuation-results.json",
);
const DEFAULT_OUTPUT_DIR = join(REPO_ROOT, "experiments", "maker-arc", "e2-gate");

// ─── Args ─────────────────────────────────────────────────────────────────────

interface Args {
  models: string[];
  dryRun: boolean;
  limit: number | null;
  /**
   * null = do NOT send a temperature (Ollama default sampling — the condition
   * the sealed Slice 8.5/9 E2 runs used). Reproducibility comes from the
   * pinned seed, which Ollama honors at any temperature. A temp-0 override
   * was tried first and sent qwen2.5:7b into >300s repetition loops that blew
   * undici's headers timeout — measuring a sampling pathology, not music.
   */
  temperature: number | null;
  seed: number;
  /**
   * num_predict cap. Ollama with stream:false sends HTTP headers only when
   * generation completes, and Node's fetch (undici) aborts at 300s — an
   * uncapped degenerate generation reads as a transport error. Capping turns
   * it into a truncated output, which is FM-7 — exactly what the tolerant
   * parser's balance-braces recovery exists for.
   */
  maxTokens: number;
  emitBriefs: string | null;
  scoreResponses: string | null;
  label: string | null;
  outputDir: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    models: [],
    dryRun: false,
    limit: null,
    temperature: null,
    seed: 42,
    maxTokens: 2048,
    emitBriefs: null,
    scoreResponses: null,
    label: null,
    outputDir: DEFAULT_OUTPUT_DIR,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--models") args.models = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (a === "--temperature") args.temperature = parseFloat(argv[++i]);
    else if (a === "--seed") args.seed = parseInt(argv[++i], 10);
    else if (a === "--max-tokens") args.maxTokens = parseInt(argv[++i], 10);
    else if (a === "--emit-briefs") args.emitBriefs = argv[++i];
    else if (a === "--score-responses") args.scoreResponses = argv[++i];
    else if (a === "--label") args.label = argv[++i];
    else if (a === "--output-dir") args.outputDir = argv[++i];
    else {
      console.error(`Unknown flag: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

// ─── Cohort loading (sealed-22, pinned + cross-checked) ───────────────────────

interface SealedPairRef {
  promptId: string;
  targetId: string;
  sealedShuffledVsGold: number | { not_computable: true; reason: string };
}

function loadSealedCohortRefs(): SealedPairRef[] {
  const sealed = JSON.parse(readFileSync(SEALED_E2_ARTIFACT, "utf8")) as {
    integrityCheck: { passed: boolean; details: string };
    pairResults: Array<{
      promptId: string;
      targetId: string;
      metrics: { grooveSimilarity_goldVsShuffled: number | { not_computable: true; reason: string } };
    }>;
  };
  if (!sealed.integrityCheck.passed) {
    throw new Error(`Sealed E2 artifact integrity check not passed: ${sealed.integrityCheck.details}`);
  }
  return sealed.pairResults.map((p) => ({
    promptId: p.promptId,
    targetId: p.targetId,
    sealedShuffledVsGold: p.metrics.grooveSimilarity_goldVsShuffled,
  }));
}

function loadSourceRecords(): PairRecord[] {
  const files = readdirSync(SOURCE_RECORDS_DIR).filter((f) => f.endsWith(".json"));
  return files.map(
    (f) => JSON.parse(readFileSync(join(SOURCE_RECORDS_DIR, f), "utf8")) as PairRecord,
  );
}

interface CohortCheck {
  pairCount: number;
  crossCheckMaxAbsDelta: number;
  headroomPerPair: Array<{ targetId: string; shuffledVsGold: number | null; headroom: number | null }>;
  unclearablePairCount: number;
  meanHeadroom: number | null;
}

/**
 * Resolve the sealed-22 cohort against the current public records and verify
 * the shuffled-control metric reproduces the sealed values (ANDON on drift).
 */
function resolveSealedCohort(limit: number | null): { pairs: ResolvedPair[]; check: CohortCheck } {
  const refs = loadSealedCohortRefs();
  const records = loadSourceRecords();
  const allPairs = resolvePairs(records);
  const byPromptId = new Map(allPairs.map((p) => [p.promptRecord.id, p]));

  const pairs: ResolvedPair[] = [];
  for (const ref of refs) {
    const pair = byPromptId.get(ref.promptId);
    if (!pair) throw new Error(`Sealed cohort pair not found in source records: ${ref.promptId}`);
    if (pair.targetRecord.id !== ref.targetId) {
      throw new Error(
        `Sealed cohort target mismatch for ${ref.promptId}: sealed ${ref.targetId}, resolved ${pair.targetRecord.id}`,
      );
    }
    pairs.push(pair);
  }

  // Cross-check the control metric against the sealed artifact.
  let maxDelta = 0;
  const headroomPerPair: CohortCheck["headroomPerPair"] = [];
  for (let i = 0; i < pairs.length; i++) {
    const probe = scoreModelContinuation(pairs[i], []); // control side only
    const fresh = probe.grooveOA_shuffledVsGold;
    const sealedVal = refs[i].sealedShuffledVsGold;
    const freshNum = isNotComputable(fresh) ? null : (fresh as number);
    const sealedNum = typeof sealedVal === "number" ? sealedVal : null;
    if (freshNum !== null && sealedNum !== null) {
      maxDelta = Math.max(maxDelta, Math.abs(freshNum - sealedNum));
    } else if ((freshNum === null) !== (sealedNum === null)) {
      throw new Error(
        `ANDON: control computability diverged from sealed artifact on ${refs[i].targetId}`,
      );
    }
    headroomPerPair.push({
      targetId: refs[i].targetId,
      shuffledVsGold: freshNum,
      headroom: freshNum === null ? null : 1 - freshNum,
    });
  }
  if (maxDelta > 1e-6) {
    throw new Error(
      `ANDON: shuffled-control metric diverged from the sealed artifact (max |Δ| = ${maxDelta}). ` +
        `The instrument no longer reproduces its sealed state — investigate before running models.`,
    );
  }

  const limited = limit !== null ? pairs.slice(0, limit) : pairs;
  const headrooms = headroomPerPair
    .slice(0, limited.length)
    .map((h) => h.headroom)
    .filter((h): h is number => h !== null);
  const check: CohortCheck = {
    pairCount: limited.length,
    crossCheckMaxAbsDelta: maxDelta,
    headroomPerPair: headroomPerPair.slice(0, limited.length),
    unclearablePairCount: headrooms.filter((h) => h < FUTURE_MODEL_GROOVE_MARGIN).length,
    meanHeadroom: headrooms.length
      ? headrooms.reduce((a, b) => a + b, 0) / headrooms.length
      : null,
  };
  return { pairs: limited, check };
}

// ─── Per-pair run records ─────────────────────────────────────────────────────

interface GatePairRun {
  score: ModelContinuationScore;
  parseStatus: string;
  recoverySteps: string[] | null;
  firstPassNoteEmpty: boolean;
  retryFired: boolean;
  retryPassNoteEmpty: boolean;
  latencyMs: number;
  completionTokens: number;
}

function parseTelemetry(runs: GatePairRun[]) {
  return {
    clean: runs.filter((r) => r.parseStatus === "clean").length,
    recovered: runs.filter((r) => r.parseStatus === "recovered").length,
    unrecoverable: runs.filter((r) => r.parseStatus === "unrecoverable").length,
    firstPassNoteEmpty: runs.filter((r) => r.firstPassNoteEmpty).length,
    retriesFired: runs.filter((r) => r.retryFired).length,
    noteEmptyAfterRetry: runs.filter((r) => r.retryPassNoteEmpty).length,
  };
}

function writeModelResult(
  outputDir: string,
  fileLabel: string,
  payload: Record<string, unknown>,
): string {
  mkdirSync(outputDir, { recursive: true });
  const path = join(outputDir, `${fileLabel.replace(/[^a-zA-Z0-9._-]+/g, "_")}.json`);
  writeFileSync(path, JSON.stringify(payload, null, 2) + "\n");
  return path;
}

function summarize(runs: GatePairRun[], label: string) {
  const agg = aggregateModelContinuations(label, runs.map((r) => r.score));
  const t = parseTelemetry(runs);
  console.log(
    `  → ${label}: clears-bar ${agg.pairsClearingBar}/${agg.pairCount} pairs | ` +
      `mean margin ${agg.meanMargin === null ? "n/a" : agg.meanMargin.toFixed(3)} ` +
      `(model ${agg.meanModelVsGold === null ? "n/a" : agg.meanModelVsGold.toFixed(3)} vs ` +
      `shuffled ${agg.meanShuffledVsGold === null ? "n/a" : agg.meanShuffledVsGold.toFixed(3)}) | ` +
      `aggregate ${agg.aggregateClearsBar ? "CLEARS" : "does NOT clear"} the ${agg.bar} bar | ` +
      `parse: ${t.clean} clean / ${t.recovered} recovered / ${t.unrecoverable} unrecoverable / ${t.noteEmptyAfterRetry} note-empty`,
  );
  return agg;
}

// ─── Ollama model runner ──────────────────────────────────────────────────────

async function runOllamaModel(
  model: string,
  pairs: ResolvedPair[],
  args: Args,
  check: CohortCheck,
): Promise<void> {
  console.log(
    `\n═══ ${model} — ${pairs.length} pairs (temperature ${args.temperature ?? "ollama-default"}, seed ${args.seed}, num_predict ${args.maxTokens}) ═══`,
  );
  const backend = new OllamaBackend(model, undefined, {
    seed: args.seed,
    num_predict: args.maxTokens,
    ...(args.temperature !== null ? { temperature: args.temperature } : {}),
  });

  const runs: GatePairRun[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const promptRecord = pair.promptRecord as PairRecord & {
      observation: { tokens_remi?: string[] };
    };
    const t0 = Date.now();
    const result = await runE2ForPair(promptRecord, pair.targetRecord, backend, 0);
    const tokens = result.parsedOutput?.tokens_remi ?? [];
    const events =
      tokens.length > 0
        ? synthTimedEventsFromRemi(
            tokens,
            pair.targetRecord.scope.phrase_window,
            pair.targetRecord.scope.time_signature,
          )
        : [];
    const score = scoreModelContinuation(pair, events);
    runs.push({
      score,
      parseStatus: result.meta.parseStatus ?? "unknown",
      recoverySteps: result.meta.recoverySteps ?? null,
      firstPassNoteEmpty: result.firstPassNoteEmpty ?? false,
      retryFired: result.retryFired ?? false,
      retryPassNoteEmpty: result.retryPassNoteEmpty ?? false,
      latencyMs: result.meta.latencyMs,
      completionTokens: result.meta.completionTokens,
    });
    const m = score.margin;
    console.log(
      `  [${i + 1}/${pairs.length}] ${pair.targetRecord.scope.song_id} ${pair.targetRecord.scope.phrase_window}: ` +
        `${result.meta.parseStatus} | events ${score.modelEventCount} | ` +
        `margin ${m === null ? "n/a" : m.toFixed(3)} ${score.clearsBar ? "✓ clears" : "·"} ` +
        `(${((Date.now() - t0) / 1000).toFixed(1)}s)`,
    );
  }

  const agg = summarize(runs, model);
  const path = writeModelResult(args.outputDir, model, {
    schemaVersion: "e2-continuation-gate/1.0.0",
    runDate: new Date().toISOString(),
    mode: "ollama",
    model,
    backendParams: {
      temperature: args.temperature ?? "ollama-default",
      seed: args.seed,
      numPredict: args.maxTokens,
      runsPerPair: 1,
    },
    bar: FUTURE_MODEL_GROOVE_MARGIN,
    cohort: {
      source: "sealed-22 (e2-phrase-continuation-results.json, 2026-05-16)",
      pairCount: check.pairCount,
      crossCheckMaxAbsDelta: check.crossCheckMaxAbsDelta,
      meanHeadroom: check.meanHeadroom,
      unclearablePairCount: check.unclearablePairCount,
    },
    parseTelemetry: parseTelemetry(runs),
    aggregate: agg,
    perPair: runs.map((r) => ({
      ...r.score,
      parseStatus: r.parseStatus,
      recoverySteps: r.recoverySteps,
      firstPassNoteEmpty: r.firstPassNoteEmpty,
      retryFired: r.retryFired,
      retryPassNoteEmpty: r.retryPassNoteEmpty,
      latencyMs: r.latencyMs,
      completionTokens: r.completionTokens,
    })),
  });
  console.log(`  written → ${path}`);
}

// ─── Claude-ceiling paths (briefs out / responses in) ─────────────────────────

function emitBriefs(pairs: ResolvedPair[], outPath: string): void {
  // CONTAMINATION CONTROL: briefs are built from the PROMPT record only.
  // The gold continuation never enters this file. The continuation window
  // bounds (how many measures to produce) are prompt-side metadata.
  const system =
    `${E2_SYSTEM_TEXT}\n\n` +
    `IMPORTANT: Respond with valid JSON matching this schema:\n` +
    `${JSON.stringify(E2_OUTPUT_SCHEMA, null, 2)}`;
  const briefs = pairs.map((pair) => ({
    promptId: pair.promptRecord.id,
    system,
    user: buildE2UserPrompt(pair.promptRecord as PairRecord),
  }));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ briefCount: briefs.length, briefs }, null, 2) + "\n");
  console.log(`${briefs.length} prompt-only briefs → ${outPath} (no gold content)`);
}

function scoreResponsesFile(
  pairs: ResolvedPair[],
  filePath: string,
  label: string,
  args: Args,
  check: CohortCheck,
): void {
  const data = JSON.parse(readFileSync(filePath, "utf8")) as {
    label?: string;
    responses: Array<{ promptId: string; raw: string }>;
  };
  const byPromptId = new Map(pairs.map((p) => [p.promptRecord.id, p]));
  const runs: GatePairRun[] = [];

  for (const resp of data.responses) {
    const pair = byPromptId.get(resp.promptId);
    if (!pair) {
      console.warn(`  ! response for unknown promptId ${resp.promptId} — skipped`);
      continue;
    }
    const parsed = parseRemiOutput(resp.raw);
    const noteEmpty =
      parsed.status !== "unrecoverable" && !parsed.tokens_remi.some((t) => t.startsWith("Pitch_"));
    const tokens =
      parsed.status !== "unrecoverable" && !noteEmpty ? parsed.tokens_remi : [];
    const events =
      tokens.length > 0
        ? synthTimedEventsFromRemi(
            tokens,
            pair.targetRecord.scope.phrase_window,
            pair.targetRecord.scope.time_signature,
          )
        : [];
    const score = scoreModelContinuation(pair, events);
    runs.push({
      score,
      parseStatus: parsed.status,
      recoverySteps: parsed.recoverySteps ?? null,
      firstPassNoteEmpty: noteEmpty,
      retryFired: false,
      retryPassNoteEmpty: false,
      latencyMs: 0,
      completionTokens: 0,
    });
    const m = score.margin;
    console.log(
      `  ${pair.targetRecord.scope.song_id} ${pair.targetRecord.scope.phrase_window}: ` +
        `${parsed.status}${noteEmpty ? " (note-empty)" : ""} | events ${score.modelEventCount} | ` +
        `margin ${m === null ? "n/a" : m.toFixed(3)} ${score.clearsBar ? "✓ clears" : "·"}`,
    );
  }

  // Pairs with no response at all are unscoreable (uniform 22-row table).
  const answered = new Set(data.responses.map((r) => r.promptId));
  for (const pair of pairs) {
    if (!answered.has(pair.promptRecord.id)) {
      runs.push({
        score: scoreModelContinuation(pair, []),
        parseStatus: "missing-response",
        recoverySteps: null,
        firstPassNoteEmpty: false,
        retryFired: false,
        retryPassNoteEmpty: false,
        latencyMs: 0,
        completionTokens: 0,
      });
      console.warn(`  ! no response for ${pair.promptRecord.id} — scored as unscoreable`);
    }
  }

  const agg = summarize(runs, label);
  const path = writeModelResult(args.outputDir, label, {
    schemaVersion: "e2-continuation-gate/1.0.0",
    runDate: new Date().toISOString(),
    mode: "responses-file",
    model: label,
    responsesFile: filePath,
    bar: FUTURE_MODEL_GROOVE_MARGIN,
    cohort: {
      source: "sealed-22 (e2-phrase-continuation-results.json, 2026-05-16)",
      pairCount: check.pairCount,
      crossCheckMaxAbsDelta: check.crossCheckMaxAbsDelta,
      meanHeadroom: check.meanHeadroom,
      unclearablePairCount: check.unclearablePairCount,
    },
    parseTelemetry: parseTelemetry(runs),
    aggregate: agg,
    perPair: runs.map((r) => ({
      ...r.score,
      parseStatus: r.parseStatus,
      recoverySteps: r.recoverySteps,
      firstPassNoteEmpty: r.firstPassNoteEmpty,
    })),
  });
  console.log(`  written → ${path}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log("═══ E2 continuation gate — the locked 0.15 groove-margin bar ═══");

  const { pairs, check } = resolveSealedCohort(args.limit);
  console.log(
    `cohort: ${check.pairCount} pairs (sealed-22) | control cross-check max |Δ| = ${check.crossCheckMaxAbsDelta.toExponential(2)} ✓ | ` +
      `mean headroom ${check.meanHeadroom?.toFixed(3)} | pairs with headroom < ${FUTURE_MODEL_GROOVE_MARGIN}: ${check.unclearablePairCount}`,
  );
  if (check.unclearablePairCount > 0) {
    console.log(
      `  ⚠ ${check.unclearablePairCount} pair(s) are UNCLEARABLE by construction (shuffling barely changes their groove):`,
    );
    for (const h of check.headroomPerPair) {
      if (h.headroom !== null && h.headroom < FUTURE_MODEL_GROOVE_MARGIN) {
        console.log(`    - ${h.targetId} (headroom ${h.headroom.toFixed(3)})`);
      }
    }
  }

  if (args.emitBriefs) {
    emitBriefs(pairs, args.emitBriefs);
    return;
  }
  if (args.scoreResponses) {
    if (!args.label) {
      console.error("--score-responses requires --label");
      process.exit(2);
    }
    scoreResponsesFile(pairs, args.scoreResponses, args.label, args, check);
    return;
  }
  if (args.dryRun) {
    console.log("dry-run: no model calls.");
    return;
  }
  if (args.models.length === 0) {
    console.log("No --models given. Use --dry-run, --emit-briefs, --score-responses, or --models a,b,c.");
    return;
  }
  for (const model of args.models) {
    await runOllamaModel(model, pairs, args, check);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
