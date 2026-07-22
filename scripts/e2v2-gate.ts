#!/usr/bin/env tsx
// ─── e2v2-gate.ts — Slice 4 fleet re-gate at the LOCKED E2v2 bars ─────────────
//
// Runs generators at the E2V2-LOCK bars (experiments/maker-arc/E2V2-LOCK.md §5,
// signed 2026-07-22): score grid 12/beat; the 17-item strict screen (both foils,
// both axes ≥ 0.15); rhythm margin ≥ 0.15 AND tonal margin ≥ 0.10, each over the
// STRONGER foil (min across Markov + copy-forward); conjunctive per-item + exact
// paired permutation (α=0.05) on both axes.
//
// Generation reuses the sealed E2 machinery byte-unchanged (runE2ForPair), so
// the Ollama continuations reproduce the Phase-B ones (seed 42). The Claude
// ceiling is re-scored from the Phase-B blind responses (authored before E2v2
// existed → cannot be tuned to it — the most honest ceiling). Gold-identity is
// the instrument ceiling.
//
// Usage:
//   pnpm exec tsx scripts/e2v2-gate.ts --gold-identity
//   pnpm exec tsx scripts/e2v2-gate.ts --score-responses <file> --label claude-fable-5
//   pnpm exec tsx scripts/e2v2-gate.ts --models qwen2.5:7b,jam-ft-v1-qwen25:seed13
//
// $0: local ollama only. No pods, no API, no HF.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolvePairs,
  isNotComputable,
  type PairRecord,
  type ResolvedPair,
} from "../src/dataset/eval/phrase-continuation.js";
import {
  scoreE2v2Continuation,
  screenItemE2v2,
  type E2v2ContinuationScore,
} from "../src/dataset/eval/model-continuation.js";
import { buildMarkovFoil, buildCopyForwardFoil, hashSeed } from "../src/dataset/eval/markov-foil.js";
import { signTest, permutationTestPairedMean } from "../src/dataset/eval/paired-tests.js";
import { runE2ForPair, synthTimedEventsFromRemi } from "../src/dataset/eval/llm-runner.js";
import { parseRemiOutput } from "../src/dataset/eval/remi-output-parser.js";
import { OllamaBackend } from "../src/dataset/eval/llm-backends/ollama.js";
import type { TimedEvent } from "../src/dataset/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SOURCE_RECORDS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0", "records");
const SEALED_E2_ARTIFACT = join(REPO_ROOT, "datasets", "jam-actions-v0", "evals", "e2-phrase-continuation-results.json");
const OUTPUT_DIR = join(REPO_ROOT, "experiments", "maker-arc", "e2v2-gate");

// ── LOCKED bars (E2V2-LOCK.md §5) ──
const SCORE_SUBDIVISIONS_PER_BEAT = 12;
const SCREEN_SEPARATION = 0.15;
const RHYTHM_BAR = 0.15;
const TONAL_BAR = 0.1;
const ALPHA = 0.05;

// ─── Cohort ───────────────────────────────────────────────────────────────────

function resolveSealedCohort(): ResolvedPair[] {
  const sealed = JSON.parse(readFileSync(SEALED_E2_ARTIFACT, "utf8")) as {
    pairResults: Array<{ promptId: string }>;
  };
  const records = readdirSync(SOURCE_RECORDS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(SOURCE_RECORDS_DIR, f), "utf8")) as PairRecord);
  const byPromptId = new Map(resolvePairs(records).map((p) => [p.promptRecord.id, p]));
  return sealed.pairResults.map((r) => {
    const pair = byPromptId.get(r.promptId);
    if (!pair) throw new Error(`sealed pair not found: ${r.promptId}`);
    return pair;
  });
}

function goldOf(pair: ResolvedPair): TimedEvent[] {
  return pair.targetRecord.observation.midi_sidecar.timed_events;
}

function foilsOf(pair: ResolvedPair): { markov: TimedEvent[] | null; copyfwd: TimedEvent[] | null } {
  const prompt = pair.promptRecord.observation.midi_sidecar.timed_events;
  const gold = goldOf(pair);
  const measures = [...new Set(gold.map((e) => e.measure))].sort((a, b) => a - b);
  const spec = { start: measures[0], bars: measures[measures.length - 1] - measures[0] + 1, ts: pair.targetRecord.scope.time_signature };
  const m = buildMarkovFoil(
    { promptEvents: prompt, targetStartMeasure: spec.start, numTargetBars: spec.bars, timeSignature: spec.ts, seed: hashSeed(pair.promptRecord.id) },
    { scoreSubdivisionsPerBeat: SCORE_SUBDIVISIONS_PER_BEAT },
  );
  const c = buildCopyForwardFoil({ promptEvents: prompt, targetStartMeasure: spec.start, numTargetBars: spec.bars, timeSignature: spec.ts });
  return { markov: isNotComputable(m) ? null : (m as TimedEvent[]), copyfwd: isNotComputable(c) ? null : (c as TimedEvent[]) };
}

/** The frozen 17-item screen: both foils separate ≥ SCREEN on both axes. */
function screenedPairs(pairs: ResolvedPair[]): ResolvedPair[] {
  const opts = { scoreSubdivisionsPerBeat: SCORE_SUBDIVISIONS_PER_BEAT };
  return pairs.filter((pair) => {
    const { markov, copyfwd } = foilsOf(pair);
    if (!markov || !copyfwd) return false;
    const sm = screenItemE2v2(pair, markov, opts);
    const sc = screenItemE2v2(pair, copyfwd, opts);
    if (sm.rhythmSeparation == null || sc.rhythmSeparation == null) return false;
    const rhythm = Math.min(sm.rhythmSeparation, sc.rhythmSeparation);
    const tonal = Math.min(sm.tonalSeparation!, sc.tonalSeparation!);
    return rhythm >= SCREEN_SEPARATION && tonal >= SCREEN_SEPARATION;
  });
}

// ─── Scoring over the STRONGER foil ───────────────────────────────────────────

interface ItemResult {
  targetId: string;
  songId: string;
  rhythmMargin: number | null; // over the stronger foil (min across foils)
  tonalMargin: number | null;
  clears: boolean;
  parseStatus?: string;
  modelEvents: number;
}

function scoreOverStrongerFoil(pair: ResolvedPair, model: TimedEvent[], parseStatus?: string): ItemResult {
  const { markov, copyfwd } = foilsOf(pair);
  const opts = { scoreSubdivisionsPerBeat: SCORE_SUBDIVISIONS_PER_BEAT, rhythmBar: RHYTHM_BAR, tonalBar: TONAL_BAR };
  const perFoil: E2v2ContinuationScore[] = [];
  if (markov) perFoil.push(scoreE2v2Continuation(pair, model, markov, { ...opts, foilLabel: "markov" }));
  if (copyfwd) perFoil.push(scoreE2v2Continuation(pair, model, copyfwd, { ...opts, foilLabel: "copy-forward" }));

  const rMargins = perFoil.map((s) => s.rhythm.margin).filter((x): x is number => x != null);
  const tMargins = perFoil.map((s) => s.tonal.margin).filter((x): x is number => x != null);
  const rhythmMargin = rMargins.length === perFoil.length && perFoil.length > 0 ? Math.min(...rMargins) : null;
  const tonalMargin = tMargins.length === perFoil.length && perFoil.length > 0 ? Math.min(...tMargins) : null;
  const clears = rhythmMargin != null && tonalMargin != null && rhythmMargin >= RHYTHM_BAR && tonalMargin >= TONAL_BAR;
  return { targetId: pair.targetRecord.id, songId: pair.targetRecord.scope.song_id, rhythmMargin, tonalMargin, clears, parseStatus, modelEvents: model.length };
}

// ─── Aggregate ────────────────────────────────────────────────────────────────

function aggregate(label: string, items: ItemResult[]) {
  const rMargins = items.map((i) => i.rhythmMargin).filter((x): x is number => x != null);
  const tMargins = items.map((i) => i.tonalMargin).filter((x): x is number => x != null);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const meanR = mean(rMargins);
  const meanT = mean(tMargins);
  const permR = permutationTestPairedMean(rMargins, { alternative: "greater", seed: 20260722 });
  const permT = permutationTestPairedMean(tMargins, { alternative: "greater", seed: 20260723 });
  const clears = items.filter((i) => i.clears).length;
  return {
    label,
    itemCount: items.length,
    computable: rMargins.length,
    pairsClearingBar: clears,
    clearRate: items.length ? clears / items.length : 0,
    rhythm: { meanMargin: meanR, bar: RHYTHM_BAR, meanClears: meanR != null && meanR >= RHYTHM_BAR, signTest: signTest(rMargins, 0, "greater"), permutationTest: permR },
    tonal: { meanMargin: meanT, bar: TONAL_BAR, meanClears: meanT != null && meanT >= TONAL_BAR, signTest: signTest(tMargins, 0, "greater"), permutationTest: permT },
    aggregateClearsBar: meanR != null && meanT != null && meanR >= RHYTHM_BAR && meanT >= TONAL_BAR,
    bothAxesSignificant: permR.pValue < ALPHA && permT.pValue < ALPHA,
  };
}

function report(label: string, items: ItemResult[]) {
  const agg = aggregate(label, items);
  console.log(
    `  → ${label}: clears ${agg.pairsClearingBar}/${agg.itemCount} | ` +
      `rhythm Δ ${agg.rhythm.meanMargin?.toFixed(3) ?? "n/a"} (p=${agg.rhythm.permutationTest.pValue.toExponential(1)}) | ` +
      `tonal Δ ${agg.tonal.meanMargin?.toFixed(3) ?? "n/a"} (p=${agg.tonal.permutationTest.pValue.toExponential(1)}) | ` +
      `${agg.aggregateClearsBar && agg.bothAxesSignificant ? "CLEARS (both axes, sig)" : "does NOT clear"}`,
  );
  return agg;
}

function write(label: string, items: ItemResult[], mode: string, extra: Record<string, unknown> = {}): string {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const path = join(OUTPUT_DIR, `${label.replace(/[^a-zA-Z0-9._-]+/g, "_")}.json`);
  writeFileSync(
    path,
    JSON.stringify(
      {
        schemaVersion: "e2v2-gate/1.0.0",
        runDate: new Date().toISOString(),
        mode,
        model: label,
        bars: { scoreSubdivisionsPerBeat: SCORE_SUBDIVISIONS_PER_BEAT, screen: SCREEN_SEPARATION, rhythmBar: RHYTHM_BAR, tonalBar: TONAL_BAR, alpha: ALPHA, foil: "stronger of markov + copy-forward" },
        aggregate: aggregate(label, items),
        perItem: items,
        ...extra,
      },
      null,
      2,
    ) + "\n",
  );
  return path;
}

// ─── Generators ───────────────────────────────────────────────────────────────

async function runOllama(model: string, pairs: ResolvedPair[]): Promise<void> {
  console.log(`\n═══ ${model} — ${pairs.length} screened items ═══`);
  const backend = new OllamaBackend(model, undefined, { seed: 42, num_predict: 2048 });
  const items: ItemResult[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const result = await runE2ForPair(pair.promptRecord as PairRecord & { observation: { tokens_remi?: string[] } }, pair.targetRecord, backend, 0);
    const tokens = result.parsedOutput?.tokens_remi ?? [];
    const events = tokens.length ? synthTimedEventsFromRemi(tokens, pair.targetRecord.scope.phrase_window, pair.targetRecord.scope.time_signature) : [];
    const item = scoreOverStrongerFoil(pair, events, result.meta.parseStatus ?? "unknown");
    items.push(item);
    console.log(`  [${i + 1}/${pairs.length}] ${item.songId}: rhythm ${item.rhythmMargin?.toFixed(3) ?? "n/a"} tonal ${item.tonalMargin?.toFixed(3) ?? "n/a"} ${item.clears ? "✓" : "·"}`);
  }
  report(model, items);
  console.log(`  written → ${write(model, items, "ollama")}`);
}

function scoreResponses(pairs: ResolvedPair[], filePath: string, label: string): void {
  console.log(`\n═══ ${label} (responses) — ${pairs.length} screened items ═══`);
  const data = JSON.parse(readFileSync(filePath, "utf8")) as { responses: Array<{ promptId: string; raw: string }> };
  const byPromptId = new Map(data.responses.map((r) => [r.promptId, r.raw]));
  const items: ItemResult[] = [];
  for (const pair of pairs) {
    const raw = byPromptId.get(pair.promptRecord.id);
    let events: TimedEvent[] = [];
    let status = "missing-response";
    if (raw !== undefined) {
      const parsed = parseRemiOutput(raw);
      status = parsed.status;
      const noteEmpty = parsed.status !== "unrecoverable" && !parsed.tokens_remi.some((t) => t.startsWith("Pitch_"));
      const tokens = parsed.status !== "unrecoverable" && !noteEmpty ? parsed.tokens_remi : [];
      events = tokens.length ? synthTimedEventsFromRemi(tokens, pair.targetRecord.scope.phrase_window, pair.targetRecord.scope.time_signature) : [];
    }
    const item = scoreOverStrongerFoil(pair, events, status);
    items.push(item);
    console.log(`  ${item.songId}: ${status} | rhythm ${item.rhythmMargin?.toFixed(3) ?? "n/a"} tonal ${item.tonalMargin?.toFixed(3) ?? "n/a"} ${item.clears ? "✓" : "·"}`);
  }
  report(label, items);
  console.log(`  written → ${write(label, items, "responses-file", { responsesFile: filePath })}`);
}

function goldIdentity(pairs: ResolvedPair[]): void {
  console.log(`\n═══ gold-identity (instrument ceiling) — ${pairs.length} screened items ═══`);
  const items = pairs.map((pair) => scoreOverStrongerFoil(pair, goldOf(pair), "gold"));
  for (const it of items) console.log(`  ${it.songId}: rhythm ${it.rhythmMargin?.toFixed(3)} tonal ${it.tonalMargin?.toFixed(3)} ${it.clears ? "✓" : "·"}`);
  report("gold-identity", items);
  console.log(`  written → ${write("gold-identity", items, "gold-identity")}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const models = argv.includes("--models") ? argv[argv.indexOf("--models") + 1].split(",").map((s) => s.trim()).filter(Boolean) : [];
  const scoreFile = argv.includes("--score-responses") ? argv[argv.indexOf("--score-responses") + 1] : null;
  const label = argv.includes("--label") ? argv[argv.indexOf("--label") + 1] : null;
  const doGold = argv.includes("--gold-identity");

  console.log("═══ E2v2 fleet re-gate — LOCKED bars (grid 12, screen 0.15, rhythm 0.15 ∧ tonal 0.10, over stronger foil) ═══");
  const all = resolveSealedCohort();
  const screened = screenedPairs(all);
  console.log(`cohort ${all.length} → screened ${screened.length} items (both foils, both axes ≥ ${SCREEN_SEPARATION})`);

  if (doGold) goldIdentity(screened);
  if (scoreFile) {
    if (!label) { console.error("--score-responses requires --label"); process.exit(2); }
    scoreResponses(screened, scoreFile, label);
  }
  for (const model of models) await runOllama(model, screened);
  if (!doGold && !scoreFile && models.length === 0) {
    console.log("Nothing to run. Use --gold-identity, --score-responses <f> --label <l>, or --models a,b.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
