#!/usr/bin/env tsx
// Record → SFT JSONL. Shape copied from experiments/finetune-arc/scripts/build-sft-data.ts
// without running or editing that file (it is locked to jam-actions-v0-public
// and clair-de-lune).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateTrace } from "../../src/dataset/trace-validator.js";
import { TEST_SONG_ID } from "../../src/dataset/acoustic/phrases.js";
import type { AcousticRecord } from "../../src/dataset/acoustic/schema.js";
import {
  toSftLine as genericToSftLine,
  formatRecords,
  DEFAULT_SYSTEM_TEXT,
  type SftLine,
  type SftMessage,
} from "../../src/dataset/experiment/format-sft.js";

export type { SftLine, SftMessage };

const SYSTEM_TEXT = DEFAULT_SYSTEM_TEXT;

function asSource(r: AcousticRecord & { split: "train" | "test" }) {
  return {
    id: r.id,
    song_id: r.scope.song_id,
    split: r.split,
    kind: r.observation.perturbation.kind,
    session: r.target_trace.session,
  };
}

export function toSftLine(r: AcousticRecord & { split: "train" | "test" }): SftLine {
  return genericToSftLine(asSource(r), SYSTEM_TEXT);
}

export function formatCorpus(recordsPath: string): { train: SftLine[]; test: SftLine[] } {
  const records = readFileSync(recordsPath, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as AcousticRecord & { split: "train" | "test" });

  for (const r of records) {
    if (r.scope.song_id === "clair-de-lune") {
      throw new Error("clair-de-lune leaked into acoustic SFT");
    }
    const report = validateTrace(r.target_trace);
    if (!report.ok) {
      throw new Error(`${r.id} trace invalid: ${report.mismatches.map((m) => m.message).join("; ")}`);
    }
  }
  const { train, test } = formatRecords(records.map(asSource));
  if (train.some((l) => l.song_id === TEST_SONG_ID)) {
    throw new Error("held-out phrase leaked into SFT train");
  }
  if (!test.every((l) => l.song_id === TEST_SONG_ID)) {
    throw new Error("test SFT contains a non-held-out phrase");
  }
  return { train, test };
}

const here = dirname(fileURLToPath(import.meta.url));
const invoked = process.argv[1]?.includes("format-sft");
if (invoked) {
  const corpus = join(here, "..", "..", "datasets", "jam-actions-acoustic-v0", "records.jsonl");
  const outDir = join(here, "data");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const { train, test } = formatCorpus(corpus);
  writeFileSync(join(outDir, "sft-train.jsonl"), train.map((l) => JSON.stringify(l)).join("\n") + "\n");
  writeFileSync(join(outDir, "sft-test.jsonl"), test.map((l) => JSON.stringify(l)).join("\n") + "\n");
  process.stdout.write(`sft-train ${train.length}  sft-test ${test.length}\n`);
}
