#!/usr/bin/env tsx
// Eval harness for jam-actions-acoustic-v0.
//
// A uniform gold (9 kinds × 4 indexes) means a model that recites the prior
// looks respectable on an aggregate. This script always prints:
//   - per-kind accuracy
//   - uniform-guessing baseline (1/9)
//   - majority-class baseline
//   - base-model score, if predictions are supplied; otherwise a hole, not a win
//
// It does not download weights and does not run a model unless --predictions
// (or --base-predictions) is given.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PERTURBATION_KINDS, GOLD_VERDICTS, type AcousticRecord, type GoldVerdict } from "../../src/dataset/acoustic/schema.js";
import { TEST_SONG_ID } from "../../src/dataset/acoustic/phrases.js";
import {
  trivialBaselines as genericBaselines,
  scorePredictions as genericScore,
  type PredLine as GenericPredLine,
} from "../../src/dataset/experiment/eval.js";

export type PredLine = GenericPredLine;

export interface KindScore {
  kind: string;
  n: number;
  correct: number;
  accuracy: number;
}

export interface EvalReport {
  n: number;
  held_out_phrase: string;
  overall_accuracy: number | null;
  per_kind: KindScore[];
  baselines: {
    uniform: number;
    majority: number;
    majority_class: string;
  };
  base_model_overall: number | null;
  lora_overall: number | null;
  note: string;
}

function loadTestRecords(jsonlPath: string): Array<AcousticRecord & { split: "train" | "test" }> {
  return readFileSync(jsonlPath, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as AcousticRecord & { split: "train" | "test" })
    .filter((r) => r.split === "test");
}

export function trivialBaselines(records: Array<{ observation: { gold: { verdict: string } } }>): EvalReport["baselines"] {
  return genericBaselines(
    records.map((r) => r.observation.gold.verdict),
    GOLD_VERDICTS,
  );
}

export function scorePredictions(
  records: Array<AcousticRecord & { split: "train" | "test" }>,
  preds: PredLine[],
): { overall: number; per_kind: KindScore[] } {
  const overall = genericScore(
    records.map((r) => ({ id: r.id, gold: r.observation.gold.verdict as GoldVerdict })),
    preds,
    GOLD_VERDICTS,
  );
  const per_kind = genericScore(
    records.map((r) => ({
      id: r.id,
      gold: r.observation.gold.verdict as GoldVerdict,
      group: r.observation.perturbation.kind,
    })),
    preds,
    PERTURBATION_KINDS,
  ).per_class;
  return { overall: overall.overall, per_kind };
}

export function evaluateAcousticSplit(opts: {
  recordsPath: string;
  loraPredictions?: PredLine[];
  basePredictions?: PredLine[];
}): EvalReport {
  const records = loadTestRecords(opts.recordsPath);
  if (records.some((r) => r.scope.song_id !== TEST_SONG_ID)) {
    throw new Error("test split is not a single held-out phrase");
  }
  const baselines = trivialBaselines(records);
  const lora = opts.loraPredictions
    ? scorePredictions(records, opts.loraPredictions)
    : null;
  const base = opts.basePredictions
    ? scorePredictions(records, opts.basePredictions)
    : null;
  return {
    n: records.length,
    held_out_phrase: TEST_SONG_ID,
    overall_accuracy: lora?.overall ?? null,
    per_kind: lora?.per_kind ?? PERTURBATION_KINDS.map((kind) => ({
      kind,
      n: records.filter((r) => r.observation.perturbation.kind === kind).length,
      correct: 0,
      accuracy: 0,
    })),
    baselines,
    base_model_overall: base?.overall ?? null,
    lora_overall: lora?.overall ?? null,
    note:
      "n=36 on one held-out 4-note phrase. Per-kind and baselines are required; " +
      "an aggregate LoRA score without a base-model score on the same split is unfalsifiable. " +
      "Cannot show genre transfer, real recordings, polyphony, or a significant margin.",
  };
}

const invoked = process.argv[1]?.includes("eval.ts") || process.argv[1]?.includes("eval.js");
if (invoked) {
  const here = dirname(fileURLToPath(import.meta.url));
  const recordsPath = join(here, "..", "..", "datasets", "jam-actions-acoustic-v0", "records.jsonl");
  const loraPath = process.argv.find((a, i) => process.argv[i - 1] === "--predictions");
  const basePath = process.argv.find((a, i) => process.argv[i - 1] === "--base-predictions");
  const readPreds = (p?: string): PredLine[] | undefined => {
    if (!p) return undefined;
    return readFileSync(p, "utf8").trim().split("\n").map((l) => JSON.parse(l) as PredLine);
  };
  const report = evaluateAcousticSplit({
    recordsPath,
    loraPredictions: readPreds(loraPath),
    basePredictions: readPreds(basePath),
  });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (report.lora_overall !== null && report.base_model_overall === null) {
    process.stderr.write(
      "WARN: LoRA score present without a base-model score on the same split.\n",
    );
  }
}
