#!/usr/bin/env tsx
// ─── er-gate.ts — the maker arc's PRIMARY $0 gate (Reharmonization) ───────────
//
// Runs generators at the E-R (Reharmonization Gate), the instrument the platform
// verifies BY CONSTRUCTION (design §6.1): each item is a library song section;
// the generator proposes per-measure { intendedChord, voicing }; verifyHarmony
// (chord fidelity AND melody consonance) plus the non-triviality guard
// (proposal differs from the source harmony on ≥ a [LOCK] fraction of measures)
// decide pass/fail. No hidden gold — the deterministic verifier is the judge.
//
// Item set: ~2 sections per NON-classical genre (the classical genre = the
// jam-actions training pieces, excluded for train/test disjointness), frozen by
// id. [LOCK] numbers (item set, non-triviality fraction) are PROPOSALS — Slice 3
// pre-measures the base pass-rate and the director signs them ex ante (Fork 5).
//
// Usage:
//   pnpm exec tsx scripts/er-gate.ts --dry-run
//   pnpm exec tsx scripts/er-gate.ts --emit-items experiments/maker-arc/er-gate/items.json
//   pnpm exec tsx scripts/er-gate.ts --emit-briefs experiments/maker-arc/er-gate/briefs.json
//   pnpm exec tsx scripts/er-gate.ts --score-responses <file> --label claude-fable-5
//   pnpm exec tsx scripts/er-gate.ts --models qwen2.5:7b
//
// Flags mirror e2-continuation-gate.ts. $0: local ollama only, no pods/API/HF.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeFromLibrary } from "../src/songs/library.js";
import { getAllSongs } from "../src/songs/registry.js";
import {
  selectERItems,
  buildERBrief,
  parseReharmonization,
  scoreERProposal,
  aggregateERScores,
  ER_OUTPUT_SCHEMA,
  ER_NON_TRIVIALITY_FRACTION,
  type ERItem,
  type ERScore,
} from "../src/maker/er-gate.js";
import { OllamaBackend } from "../src/dataset/eval/llm-backends/ollama.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const LIBRARY_DIR = join(REPO_ROOT, "songs", "library");
const DEFAULT_OUTPUT_DIR = join(REPO_ROOT, "experiments", "maker-arc", "er-gate");

// ─── Args ─────────────────────────────────────────────────────────────────────

interface Args {
  models: string[];
  dryRun: boolean;
  itemsPerGenre: number;
  sectionBars: number;
  nonTrivialityThreshold: number;
  temperature: number | null;
  seed: number;
  maxTokens: number;
  emitItems: string | null;
  emitBriefs: string | null;
  scoreResponses: string | null;
  label: string | null;
  outputDir: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    models: [],
    dryRun: false,
    itemsPerGenre: 2,
    sectionBars: 8,
    nonTrivialityThreshold: ER_NON_TRIVIALITY_FRACTION,
    temperature: null,
    seed: 42,
    maxTokens: 2048,
    emitItems: null,
    emitBriefs: null,
    scoreResponses: null,
    label: null,
    outputDir: DEFAULT_OUTPUT_DIR,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--models") args.models = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--items-per-genre") args.itemsPerGenre = parseInt(argv[++i], 10);
    else if (a === "--section-bars") args.sectionBars = parseInt(argv[++i], 10);
    else if (a === "--non-triviality") args.nonTrivialityThreshold = parseFloat(argv[++i]);
    else if (a === "--temperature") args.temperature = parseFloat(argv[++i]);
    else if (a === "--seed") args.seed = parseInt(argv[++i], 10);
    else if (a === "--max-tokens") args.maxTokens = parseInt(argv[++i], 10);
    else if (a === "--emit-items") args.emitItems = argv[++i];
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

// ─── Item loading (deterministic, frozen) ─────────────────────────────────────

function loadItems(args: Args): ERItem[] {
  initializeFromLibrary(LIBRARY_DIR);
  const songs = getAllSongs();
  return selectERItems(songs, { itemsPerGenre: args.itemsPerGenre, sectionBars: args.sectionBars });
}

function writeJson(outputDir: string, fileLabel: string, payload: Record<string, unknown>): string {
  mkdirSync(outputDir, { recursive: true });
  const path = join(outputDir, `${fileLabel.replace(/[^a-zA-Z0-9._-]+/g, "_")}.json`);
  writeFileSync(path, JSON.stringify(payload, null, 2) + "\n");
  return path;
}

// ─── Scoring + receipts ───────────────────────────────────────────────────────

function summarize(scores: ERScore[], label: string, threshold: number) {
  const agg = aggregateERScores(label, scores);
  console.log(
    `  → ${label}: PASS ${agg.passCount}/${agg.itemCount} (rate ${(agg.passRate * 100).toFixed(1)}%) | ` +
      `verified ${agg.verifiedCount}/${agg.itemCount} | trivial-but-verified ${agg.trivialButVerifiedCount} | ` +
      `mean fidelity ${agg.meanChordFidelity === null ? "n/a" : (agg.meanChordFidelity * 100).toFixed(0) + "%"} | ` +
      `mean Δharmony ${agg.meanNonTrivialityFraction === null ? "n/a" : (agg.meanNonTrivialityFraction * 100).toFixed(0) + "%"} | ` +
      `parse-fail ${agg.parseFailures} | non-triviality bar ${(threshold * 100).toFixed(0)}%`,
  );
  return agg;
}

function receiptPayload(
  label: string,
  mode: string,
  scores: ERScore[],
  args: Args,
  itemCount: number,
  extra: Record<string, unknown> = {},
) {
  return {
    schemaVersion: "er-gate/1.0.0",
    runDate: new Date().toISOString(),
    mode,
    model: label,
    bar: {
      gate: "verifyHarmony.verified AND non-triviality",
      nonTrivialityFraction: args.nonTrivialityThreshold,
    },
    itemSet: {
      source: "library non-classical genres (classical = jam-actions training, excluded)",
      itemCount,
      itemsPerGenre: args.itemsPerGenre,
      sectionBars: args.sectionBars,
    },
    aggregate: aggregateERScores(label, scores),
    perItem: scores.map((s) => ({
      itemId: s.itemId,
      songId: s.songId,
      genre: s.genre,
      parseStatus: s.parseStatus,
      proposalMeasures: s.proposalMeasures,
      verified: s.verified,
      chordFidelity: s.chordFidelity,
      consonance: s.consonance,
      nonTriviality: {
        changedMeasures: s.nonTriviality.changedMeasures,
        totalMeasures: s.nonTriviality.totalMeasures,
        fraction: s.nonTriviality.fraction,
        passes: s.nonTriviality.passes,
      },
      passes: s.passes,
      summary: s.verdict.summary,
    })),
    ...extra,
  };
}

// ─── Ollama runner ────────────────────────────────────────────────────────────

async function runOllamaModel(model: string, items: ERItem[], args: Args): Promise<void> {
  console.log(
    `\n═══ ${model} — ${items.length} items (temperature ${args.temperature ?? "ollama-default"}, seed ${args.seed}, num_predict ${args.maxTokens}) ═══`,
  );
  const backend = new OllamaBackend(model, undefined, {
    seed: args.seed,
    num_predict: args.maxTokens,
    ...(args.temperature !== null ? { temperature: args.temperature } : {}),
  });

  const scores: ERScore[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const brief = buildERBrief(item);
    const t0 = Date.now();
    let raw = "";
    try {
      await backend.callStructured({
        systemPrompt: brief.system,
        userMessage: brief.user,
        outputSchema: ER_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
      });
    } catch {
      /* invalid-JSON or transport error — recover via lastRawText below */
    }
    raw = backend.lastRawText() ?? "";
    const parsed = parseReharmonization(raw);
    const score = scoreERProposal(item, parsed, { nonTrivialityThreshold: args.nonTrivialityThreshold });
    scores.push(score);
    console.log(
      `  [${i + 1}/${items.length}] ${item.itemId} (${item.genre}): ${parsed.status} | ` +
        `fidelity ${score.chordFidelity.matched}/${score.chordFidelity.total} | ` +
        `Δharmony ${(score.nonTriviality.fraction * 100).toFixed(0)}% | ` +
        `${score.passes ? "✓ PASS" : "· fail"} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
    );
  }

  summarize(scores, model, args.nonTrivialityThreshold);
  const path = writeJson(args.outputDir, model, receiptPayload(model, "ollama", scores, args, items.length, {
    backendParams: { temperature: args.temperature ?? "ollama-default", seed: args.seed, numPredict: args.maxTokens },
  }));
  console.log(`  written → ${path}`);
}

// ─── Claude-ceiling paths (briefs out / responses in) ─────────────────────────

function emitBriefs(items: ERItem[], outPath: string): void {
  const briefs = items.map((item) => buildERBrief(item));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ briefCount: briefs.length, briefs }, null, 2) + "\n");
  console.log(`${briefs.length} E-R briefs → ${outPath}`);
}

function scoreResponsesFile(items: ERItem[], filePath: string, label: string, args: Args): void {
  const data = JSON.parse(readFileSync(filePath, "utf8")) as {
    label?: string;
    responses: Array<{ itemId: string; raw: string }>;
  };
  const byItemId = new Map(items.map((it) => [it.itemId, it]));
  const answered = new Map(data.responses.map((r) => [r.itemId, r.raw]));

  const scores: ERScore[] = [];
  for (const item of items) {
    const raw = answered.get(item.itemId);
    const parsed = parseReharmonization(raw ?? "");
    const score = scoreERProposal(item, parsed, { nonTrivialityThreshold: args.nonTrivialityThreshold });
    scores.push(score);
    console.log(
      `  ${item.itemId} (${item.genre}): ${parsed.status}${raw === undefined ? " (no response)" : ""} | ` +
        `fidelity ${score.chordFidelity.matched}/${score.chordFidelity.total} | ` +
        `Δharmony ${(score.nonTriviality.fraction * 100).toFixed(0)}% | ${score.passes ? "✓ PASS" : "· fail"}`,
    );
  }
  for (const r of data.responses) {
    if (!byItemId.has(r.itemId)) console.warn(`  ! response for unknown itemId ${r.itemId} — ignored`);
  }

  summarize(scores, label, args.nonTrivialityThreshold);
  const path = writeJson(args.outputDir, label, receiptPayload(label, "responses-file", scores, args, items.length, {
    responsesFile: filePath,
  }));
  console.log(`  written → ${path}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log("═══ E-R Reharmonization Gate — verifyHarmony + non-triviality ═══");

  const items = loadItems(args);
  const byGenre = new Map<string, number>();
  for (const it of items) byGenre.set(it.genre, (byGenre.get(it.genre) ?? 0) + 1);
  console.log(
    `item set: ${items.length} sections across ${byGenre.size} non-classical genres ` +
      `(${[...byGenre.entries()].map(([g, n]) => `${g}:${n}`).join(", ")}) | ` +
      `non-triviality bar ${(args.nonTrivialityThreshold * 100).toFixed(0)}%`,
  );

  if (args.emitItems) {
    mkdirSync(dirname(args.emitItems), { recursive: true });
    writeFileSync(args.emitItems, JSON.stringify({ itemCount: items.length, items }, null, 2) + "\n");
    console.log(`frozen item list → ${args.emitItems}`);
    return;
  }
  if (args.emitBriefs) {
    emitBriefs(items, args.emitBriefs);
    return;
  }
  if (args.scoreResponses) {
    if (!args.label) {
      console.error("--score-responses requires --label");
      process.exit(2);
    }
    scoreResponsesFile(items, args.scoreResponses, args.label, args);
    return;
  }
  if (args.dryRun) {
    for (const it of items) console.log(`  ${it.itemId} (${it.genre}, ${it.key}, ${it.timeSignature})`);
    console.log("dry-run: no model calls.");
    return;
  }
  if (args.models.length === 0) {
    console.log("No --models given. Use --dry-run, --emit-items, --emit-briefs, --score-responses, or --models a,b,c.");
    return;
  }
  for (const model of args.models) {
    await runOllamaModel(model, items, args);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
