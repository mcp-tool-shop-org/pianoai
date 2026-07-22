#!/usr/bin/env tsx
// ─── er-gate-summary.ts — receipted summary for the E-R Reharmonization Gate ──
//
// Reads every per-model result JSON in experiments/maker-arc/er-gate/ and prints
// the gate's summary table (markdown) — numbers come straight from the receipts,
// never hand-transcribed. Emits gate-summary.json beside them.
//
// Usage: pnpm exec tsx scripts/er-gate-summary.ts [--dir <dir>]
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = join(__dirname, "..", "experiments", "maker-arc", "er-gate");

const dirArgIdx = process.argv.indexOf("--dir");
const dir = dirArgIdx !== -1 ? process.argv[dirArgIdx + 1] : DEFAULT_DIR;

interface ModelResult {
  model: string;
  mode: string;
  runDate: string;
  bar: { nonTrivialityFraction: number };
  itemSet: { itemCount: number };
  aggregate: {
    itemCount: number;
    passCount: number;
    passRate: number;
    verifiedCount: number;
    verifiedRate: number;
    trivialButVerifiedCount: number;
    parseFailures: number;
    meanChordFidelity: number | null;
    meanNonTrivialityFraction: number | null;
  };
}

const IGNORE = new Set(["gate-summary.json"]);
const files = readdirSync(dir).filter(
  (f) => f.endsWith(".json") && !IGNORE.has(f) && !f.startsWith("items") && !f.startsWith("briefs"),
);
const results: ModelResult[] = files.map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as ModelResult);

// Order: ceiling first, then base, then v1 seeds, then b2 seeds.
function rank(m: string): number {
  if (m.startsWith("claude")) return 0;
  if (m === "qwen2.5:7b") return 1;
  if (m.startsWith("jam-ft-v1")) return 2;
  if (m.startsWith("jam-ft-b2")) return 3;
  return 4;
}
results.sort((a, b) => rank(a.model) - rank(b.model) || a.model.localeCompare(b.model));

const pct = (x: number | null) => (x === null ? "n/a" : (x * 100).toFixed(0) + "%");

console.log("| Generator | PASS (verified ∧ non-trivial) | verified | trivial-but-verified | mean fidelity | mean Δharmony | parse-fail |");
console.log("|---|---|---|---|---|---|---|");
for (const r of results) {
  const a = r.aggregate;
  console.log(
    `| ${r.model} | ${a.passCount}/${a.itemCount} (${pct(a.passRate)}) | ${a.verifiedCount}/${a.itemCount} | ${a.trivialButVerifiedCount} | ${pct(a.meanChordFidelity)} | ${pct(a.meanNonTrivialityFraction)} | ${a.parseFailures} |`,
  );
}

const summary = {
  schemaVersion: "er-gate-summary/1.0.0",
  generatedAt: new Date().toISOString(),
  nonTrivialityFraction: results[0]?.bar?.nonTrivialityFraction ?? null,
  itemCount: results[0]?.itemSet?.itemCount ?? null,
  models: results.map((r) => ({ model: r.model, mode: r.mode, runDate: r.runDate, aggregate: r.aggregate })),
};
writeFileSync(join(dir, "gate-summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(`\nsummary → ${join(dir, "gate-summary.json")}`);
