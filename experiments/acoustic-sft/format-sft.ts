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

const SYSTEM_TEXT = "You are operating AI Jam Sessions, a music education platform.";

export interface SftMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  name?: string;
}

export interface SftLine {
  id: string;
  song_id: string;
  split: "train" | "test";
  kind: string;
  messages: SftMessage[];
}

export function toSftLine(r: AcousticRecord & { split: "train" | "test" }): SftLine {
  const messages: SftMessage[] = [{ role: "system", content: SYSTEM_TEXT }];
  for (const turn of r.target_trace.session) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.content });
    } else if (turn.role === "assistant") {
      const msg: SftMessage = { role: "assistant", content: turn.content ?? "" };
      if (turn.tool_calls && turn.tool_calls.length > 0) {
        msg.tool_calls = turn.tool_calls.map((tc) => ({
          name: tc.tool,
          arguments: tc.arguments,
        }));
      }
      messages.push(msg);
    } else {
      messages.push({
        role: "tool",
        name: turn.tool,
        content: JSON.stringify(turn.content),
      });
    }
  }
  return {
    id: r.id,
    song_id: r.scope.song_id,
    split: r.split,
    kind: r.observation.perturbation.kind,
    messages,
  };
}

export function formatCorpus(recordsPath: string): { train: SftLine[]; test: SftLine[] } {
  const records = readFileSync(recordsPath, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as AcousticRecord & { split: "train" | "test" });

  const train: SftLine[] = [];
  const test: SftLine[] = [];
  for (const r of records) {
    if (r.scope.song_id === "clair-de-lune") {
      throw new Error("clair-de-lune leaked into acoustic SFT");
    }
    const report = validateTrace(r.target_trace);
    if (!report.ok) {
      throw new Error(`${r.id} trace invalid: ${report.mismatches.map((m) => m.message).join("; ")}`);
    }
    const line = toSftLine(r);
    (r.split === "test" ? test : train).push(line);
  }
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
