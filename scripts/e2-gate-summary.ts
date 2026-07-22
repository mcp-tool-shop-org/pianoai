#!/usr/bin/env tsx
// ─── e2-gate-summary.ts — receipted summary table for the E2 continuation gate ─
//
// Reads every per-model result JSON in experiments/maker-arc/e2-gate/ and
// prints the gate's summary table (markdown) — numbers come straight from the
// receipts, never hand-transcribed. Also emits gate-summary.json beside them.
//
// Usage: pnpm exec tsx scripts/e2-gate-summary.ts [--dir <dir>]
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = join(__dirname, "..", "experiments", "maker-arc", "e2-gate");

const dirArgIdx = process.argv.indexOf("--dir");
const dir = dirArgIdx !== -1 ? process.argv[dirArgIdx + 1] : DEFAULT_DIR;

interface ModelResult {
  model: string;
  mode: string;
  runDate: string;
  bar: number;
  cohort: { pairCount: number; meanHeadroom: number | null; unclearablePairCount: number };
  parseTelemetry: {
    clean: number;
    recovered: number;
    unrecoverable: number;
    noteEmptyAfterRetry: number;
  };
  aggregate: {
    pairsClearingBar: number;
    pairCount: number;
    computablePairCount: number;
    meanModelVsGold: number | null;
    meanShuffledVsGold: number | null;
    meanMargin: number | null;
    minMargin: number | null;
    maxMargin: number | null;
    aggregateClearsBar: boolean;
  };
}

const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "gate-summary.json");
const results: ModelResult[] = files.map(
  (f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as ModelResult,
);

// Order: ceiling first, then base, then v1 seeds, then b2 seeds.
function rank(m: string): number {
  if (m.startsWith("gold-identity")) return -1;
  if (m.startsWith("claude")) return 0;
  if (m === "qwen2.5:7b") return 1;
  if (m.startsWith("jam-ft-v1")) return 2;
  if (m.startsWith("jam-ft-b2")) return 3;
  return 4;
}
results.sort((a, b) => rank(a.model) - rank(b.model) || a.model.localeCompare(b.model));

const fmt = (x: number | null, d = 3) => (x === null ? "n/a" : x.toFixed(d));

console.log("| Generator | clears bar (pairs) | mean margin | mean OA model·gold | mean OA shuffled·gold | aggregate ≥ 0.15 | parse c/r/u |");
console.log("|---|---|---|---|---|---|---|");
for (const r of results) {
  const a = r.aggregate;
  const t = r.parseTelemetry;
  console.log(
    `| ${r.model} | ${a.pairsClearingBar}/${a.pairCount} | ${fmt(a.meanMargin)} | ${fmt(a.meanModelVsGold)} | ${fmt(a.meanShuffledVsGold)} | ${a.aggregateClearsBar ? "**YES**" : "no"} | ${t.clean}/${t.recovered}/${t.unrecoverable} |`,
  );
}

const summary = {
  schemaVersion: "e2-continuation-gate-summary/1.0.0",
  generatedAt: new Date().toISOString(),
  bar: results[0]?.bar ?? 0.15,
  cohort: results[0]?.cohort ?? null,
  models: results.map((r) => ({
    model: r.model,
    mode: r.mode,
    runDate: r.runDate,
    aggregate: r.aggregate,
    parseTelemetry: r.parseTelemetry,
  })),
};
writeFileSync(join(dir, "gate-summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(`\nsummary → ${join(dir, "gate-summary.json")}`);
