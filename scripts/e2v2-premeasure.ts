#!/usr/bin/env tsx
// ─── e2v2-premeasure.ts — the $0 instrument pre-measurement (Slice 3) ─────────
//
// Measures the REPAIRED continuation instrument (E2v2) against the sealed 22-pair
// cohort, MODEL-BLIND, to ground the [LOCK] numbers the director signs ex ante
// (Fork 5). No generators run here — only gold, the Markov foil, and copy-forward.
//
// It answers the questions the LOCK needs:
//   1. Which score-grid resolution keeps triplets AND separates gold from foil?
//      (sweep scoreSubdivisionsPerBeat ∈ {6, 12, 24})
//   2. How many of the 22 items QUALIFY at each screen-separation threshold?
//      (the E2v2 analog of the v1 "9/22 dead pairs")
//   3. What per-axis margins are ACHIEVABLE by a perfect (gold-identity)
//      continuation over the foil — the ceiling the margin bars sit under?
//   4. Sanity: the foils themselves must NOT clear (margin ≈ 0).
//
// Deterministic, $0. Receipts → experiments/maker-arc/e2v2-premeasure/.
// Usage: pnpm exec tsx scripts/e2v2-premeasure.ts
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
  type E2v2ItemScreen,
} from "../src/dataset/eval/model-continuation.js";
import { buildMarkovFoil, buildCopyForwardFoil, hashSeed } from "../src/dataset/eval/markov-foil.js";
import type { TimedEvent } from "../src/dataset/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SOURCE_RECORDS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0", "records");
const SEALED_E2_ARTIFACT = join(REPO_ROOT, "datasets", "jam-actions-v0", "evals", "e2-phrase-continuation-results.json");
const OUTPUT_DIR = join(REPO_ROOT, "experiments", "maker-arc", "e2v2-premeasure");

const GRID_SWEEP = [6, 12, 24];
const SEPARATION_THRESHOLDS = [0.05, 0.1, 0.15, 0.2, 0.25];

// ─── Cohort loading (sealed-22, pinned) ───────────────────────────────────────

function loadSealedPairIds(): Array<{ promptId: string; targetId: string }> {
  const sealed = JSON.parse(readFileSync(SEALED_E2_ARTIFACT, "utf8")) as {
    pairResults: Array<{ promptId: string; targetId: string }>;
  };
  return sealed.pairResults.map((p) => ({ promptId: p.promptId, targetId: p.targetId }));
}

function loadSourceRecords(): PairRecord[] {
  return readdirSync(SOURCE_RECORDS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(SOURCE_RECORDS_DIR, f), "utf8")) as PairRecord);
}

function resolveSealedCohort(): ResolvedPair[] {
  const refs = loadSealedPairIds();
  const byPromptId = new Map(resolvePairs(loadSourceRecords()).map((p) => [p.promptRecord.id, p]));
  const pairs: ResolvedPair[] = [];
  for (const ref of refs) {
    const pair = byPromptId.get(ref.promptId);
    if (!pair) throw new Error(`Sealed cohort pair not found: ${ref.promptId}`);
    pairs.push(pair);
  }
  return pairs;
}

// ─── Foil construction per pair ───────────────────────────────────────────────

function goldOf(pair: ResolvedPair): TimedEvent[] {
  return pair.targetRecord.observation.midi_sidecar.timed_events;
}

function targetSpec(pair: ResolvedPair): { start: number; bars: number; ts: string } {
  const gold = goldOf(pair);
  const measures = [...new Set(gold.map((e) => e.measure))].sort((a, b) => a - b);
  return {
    start: measures[0],
    bars: measures[measures.length - 1] - measures[0] + 1,
    ts: pair.targetRecord.scope.time_signature,
  };
}

function buildFoils(pair: ResolvedPair, scoreSub: number): { markov: TimedEvent[] | null; copyfwd: TimedEvent[] | null } {
  const prompt = pair.promptRecord.observation.midi_sidecar.timed_events;
  const spec = targetSpec(pair);
  const markov = buildMarkovFoil(
    { promptEvents: prompt, targetStartMeasure: spec.start, numTargetBars: spec.bars, timeSignature: spec.ts, seed: hashSeed(pair.promptRecord.id) },
    { scoreSubdivisionsPerBeat: scoreSub },
  );
  const copyfwd = buildCopyForwardFoil({ promptEvents: prompt, targetStartMeasure: spec.start, numTargetBars: spec.bars, timeSignature: spec.ts });
  return {
    markov: isNotComputable(markov) ? null : (markov as TimedEvent[]),
    copyfwd: isNotComputable(copyfwd) ? null : (copyfwd as TimedEvent[]),
  };
}

// ─── Per-grid measurement ─────────────────────────────────────────────────────

interface PerPairGrid {
  targetId: string;
  songId: string;
  timeSignature: string;
  markovScreen: E2v2ItemScreen | null;
  copyfwdScreen: E2v2ItemScreen | null;
  goldVsMarkov: E2v2ContinuationScore | null; // gold-identity margins over the Markov foil
  goldVsCopyfwd: E2v2ContinuationScore | null;
  markovAsModel: E2v2ContinuationScore | null; // sanity: foil-as-model, must ≈ 0
}

function measureGrid(pairs: ResolvedPair[], scoreSub: number): PerPairGrid[] {
  const opts = { scoreSubdivisionsPerBeat: scoreSub };
  return pairs.map((pair) => {
    const gold = goldOf(pair);
    const { markov, copyfwd } = buildFoils(pair, scoreSub);
    return {
      targetId: pair.targetRecord.id,
      songId: pair.targetRecord.scope.song_id,
      timeSignature: pair.targetRecord.scope.time_signature,
      markovScreen: markov ? screenItemE2v2(pair, markov, opts) : null,
      copyfwdScreen: copyfwd ? screenItemE2v2(pair, copyfwd, opts) : null,
      goldVsMarkov: markov ? scoreE2v2Continuation(pair, gold, markov, { ...opts, foilLabel: "markov" }) : null,
      goldVsCopyfwd: copyfwd ? scoreE2v2Continuation(pair, gold, copyfwd, { ...opts, foilLabel: "copy-forward" }) : null,
      markovAsModel: markov ? scoreE2v2Continuation(pair, markov, markov, { ...opts, foilLabel: "markov" }) : null,
    };
  });
}

// ─── Distribution helpers ─────────────────────────────────────────────────────

function quantiles(xs: number[]): { n: number; min: number; p25: number; median: number; p75: number; max: number } | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
  return { n: s.length, min: s[0], p25: q(0.25), median: q(0.5), p75: q(0.75), max: s[s.length - 1] };
}

const fmt = (x: number | null | undefined, d = 3) => (x === null || x === undefined ? "n/a" : x.toFixed(d));

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  console.log("═══ E2v2 instrument pre-measurement (model-blind, $0) ═══\n");
  const pairs = resolveSealedCohort();
  console.log(`sealed cohort: ${pairs.length} pairs\n`);

  const gridResults: Record<number, PerPairGrid[]> = {};
  const gridSummary: Array<Record<string, unknown>> = [];

  for (const scoreSub of GRID_SWEEP) {
    const per = measureGrid(pairs, scoreSub);
    gridResults[scoreSub] = per;

    // Screen qualifying counts at each separation threshold (Markov foil, both axes).
    const rhythmSep = per.map((p) => p.markovScreen?.rhythmSeparation).filter((x): x is number => x != null);
    const tonalSep = per.map((p) => p.markovScreen?.tonalSeparation).filter((x): x is number => x != null);
    const qualifyingAt: Record<string, number> = {};
    for (const th of SEPARATION_THRESHOLDS) {
      qualifyingAt[th.toFixed(2)] = per.filter(
        (p) =>
          p.markovScreen &&
          p.markovScreen.rhythmSeparation != null &&
          p.markovScreen.tonalSeparation != null &&
          p.markovScreen.rhythmSeparation >= th &&
          p.markovScreen.tonalSeparation >= th,
      ).length;
    }

    // Gold-identity achievable margins (over the Markov foil) — the ceiling.
    const goldRhythmMargins = per.map((p) => p.goldVsMarkov?.rhythm.margin).filter((x): x is number => x != null);
    const goldTonalMargins = per.map((p) => p.goldVsMarkov?.tonal.margin).filter((x): x is number => x != null);
    // Foil-as-model sanity (should be ≈ 0).
    const markovSelfRhythm = per.map((p) => p.markovAsModel?.rhythm.margin).filter((x): x is number => x != null);

    console.log(`── score grid = ${scoreSub}/beat ──`);
    console.log(`  screen separation (Markov): rhythm ${JSON.stringify(quantiles(rhythmSep))}`);
    console.log(`                              tonal  ${JSON.stringify(quantiles(tonalSep))}`);
    console.log(`  items qualifying (both axes ≥ threshold): ${JSON.stringify(qualifyingAt)}`);
    console.log(`  gold-identity margin over Markov: rhythm ${JSON.stringify(quantiles(goldRhythmMargins))}`);
    console.log(`                                    tonal  ${JSON.stringify(quantiles(goldTonalMargins))}`);
    console.log(`  SANITY foil-as-model rhythm margin (want ≈0): ${JSON.stringify(quantiles(markovSelfRhythm))}\n`);

    gridSummary.push({
      scoreSubdivisionsPerBeat: scoreSub,
      screenSeparation: { rhythm: quantiles(rhythmSep), tonal: quantiles(tonalSep) },
      itemsQualifyingByThreshold: qualifyingAt,
      goldIdentityMargin: { rhythm: quantiles(goldRhythmMargins), tonal: quantiles(goldTonalMargins) },
      foilAsModelSanity: { rhythm: quantiles(markovSelfRhythm) },
    });
  }

  // Per-pair table at the default grid (12/beat) for the LOCK's screened-item list.
  const defaultGrid = 12;
  const perDefault = gridResults[defaultGrid];
  console.log(`── per-pair screen @ ${defaultGrid}/beat (Markov foil), separation bar reference 0.15 ──`);
  console.log("| pair | ts | rhythm sep | tonal sep | qualifies@0.15 | gold-id rhythm Δ | gold-id tonal Δ |");
  console.log("|---|---|---|---|---|---|---|");
  for (const p of perDefault) {
    const s = p.markovScreen;
    const g = p.goldVsMarkov;
    console.log(
      `| ${p.targetId} | ${p.timeSignature} | ${fmt(s?.rhythmSeparation)} | ${fmt(s?.tonalSeparation)} | ${s?.qualifies ? "✓" : "·"} | ${fmt(g?.rhythm.margin)} | ${fmt(g?.tonal.margin)} |`,
    );
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const receipt = {
    schemaVersion: "e2v2-premeasure/1.0.0",
    generatedAt: new Date().toISOString(),
    cohort: { source: "sealed-22 (e2-phrase-continuation-results.json)", pairCount: pairs.length },
    gridSweep: GRID_SWEEP,
    separationThresholds: SEPARATION_THRESHOLDS,
    gridSummary,
    perPairAtDefaultGrid: perDefault.map((p) => ({
      targetId: p.targetId,
      songId: p.songId,
      timeSignature: p.timeSignature,
      markovScreen: p.markovScreen,
      copyfwdScreen: p.copyfwdScreen,
      goldIdentityMarginMarkov: p.goldVsMarkov
        ? { rhythm: p.goldVsMarkov.rhythm.margin, tonal: p.goldVsMarkov.tonal.margin }
        : null,
      goldIdentityMarginCopyfwd: p.goldVsCopyfwd
        ? { rhythm: p.goldVsCopyfwd.rhythm.margin, tonal: p.goldVsCopyfwd.tonal.margin }
        : null,
      markovAsModelMargin: p.markovAsModel
        ? { rhythm: p.markovAsModel.rhythm.margin, tonal: p.markovAsModel.tonal.margin }
        : null,
    })),
    defaultGrid,
  };
  const path = join(OUTPUT_DIR, "premeasure.json");
  writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n");
  console.log(`\nreceipt → ${path}`);
}

main();
