#!/usr/bin/env tsx
// ─── build-sft-data.ts — Finetune Arc P1: records.jsonl → SFT JSONL ──────────
//
// Dispatch: docs/finetune-arc-dispatch.md (P1). Preregistration lock:
// experiments/finetune-arc/P0-LOCK.md.
//
// Converts the 103 train-split target_trace sessions of the public
// jam-actions-v0 package into OpenAI-messages-format SFT JSONL, holding two
// songs out of the gradient set as the inner-validation split used ONLY for
// P3 checkpoint selection (L4). clair-de-lune (test split) is never loaded
// into any output — asserted, not assumed.
//
// Inner-validation songs (preregistered — see P0-LOCK.md §3):
//   chopin-prelude-e-minor (12 records) + fur-elise (13 records)
//   Chosen as the two smallest songs NOT present in the sealed slice21 eval
//   cohort, so every cohort train-song record stays in the SFT gradient set
//   and the seen/unseen interpretation of the sealed eval stays clean.
//
// Output (experiments/finetune-arc/data/):
//   sft-train.jsonl      — 78 records (5 songs)
//   sft-inner-val.jsonl  — 25 records (2 songs)
//   tools.json           — verbatim tool catalog (declared at render time)
//   P1-gate-report.json  — schema round-trip gate receipt
//
// Gate (P1 exit criterion — "Schema round-trip check"):
//   G1 split integrity: splits.json ↔ per-record split fields agree; test is
//      exactly the 12 clair-de-lune records; no clair-de-lune id in any output
//   G2 validateTrace(catalog) — the repo's own AJV strict validator — reports
//      zero mismatches on every emitted record
//   G3 byte round-trip: every emitted JSONL line reparses to a deep-equal
//      object, and every tool_call's arguments survive stringify→parse intact
//   G4 counts: 78 + 25 = 103; per-song counts match the preregistered table
//
// Any gate failure exits 1 and writes nothing but the failing report (ANDON).
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadToolSchemaCatalog,
  validateTrace,
  type ToolSchemaCatalog,
} from "../../../src/dataset/trace-validator.js";
import type { TargetTrace } from "../../../src/dataset/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const PUBLIC_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0-public");
const OUT_DIR = join(__dirname, "..", "data");

// ─── Preregistered constants (P0-LOCK.md) ────────────────────────────────────

/** Songs held out of the SFT gradient set for P3 checkpoint selection ONLY. */
const INNER_VAL_SONGS: ReadonlySet<string> = new Set([
  "chopin-prelude-e-minor",
  "fur-elise",
]);

/**
 * Training system prompt. First sentence of the harness's E1_SYSTEM_TEXT
 * (src/dataset/eval/llm-runner.ts) — shared operational vocabulary with the
 * dataset's own eval surface, WITHOUT E1's "no additional prose" constraint
 * (target_trace assistant turns intentionally interleave prose and calls).
 */
const SYSTEM_TEXT =
  "You are operating AI Jam Sessions, a music education platform.";

/** Expected per-song train-record counts (G4). */
const EXPECTED_SONG_COUNTS: Readonly<Record<string, number>> = {
  "bach-prelude-c-major-bwv846": 16,
  "chopin-nocturne-op9-no2": 18,
  "chopin-prelude-e-minor": 12,
  "fur-elise": 13,
  "mozart-k545-mvt1": 16,
  "pathetique-mvt2": 16,
  "schumann-traumerei": 12,
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface TraceTurn {
  turn: number;
  role: "user" | "assistant" | "tool";
  content: string | Record<string, unknown>;
  tool_calls?: Array<{ tool: string; arguments: Record<string, unknown> }>;
  tool?: string;
}

interface PublicRecord {
  id: string;
  split: "train" | "test";
  scope: { song_id: string };
  target_trace: TargetTrace & { session: TraceTurn[] };
}

interface SftMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  name?: string;
}

interface SftLine {
  id: string;
  song_id: string;
  messages: SftMessage[];
}

// ─── Load inputs ──────────────────────────────────────────────────────────────

const recordsPath = join(PUBLIC_DIR, "records.jsonl");
const splitsPath = join(PUBLIC_DIR, "splits.json");

const records: PublicRecord[] = readFileSync(recordsPath, "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as PublicRecord);

const splits = JSON.parse(readFileSync(splitsPath, "utf8")) as {
  test: string[];
  train: string[];
};

const catalog: ToolSchemaCatalog = loadToolSchemaCatalog();

// ─── Gate accumulator ─────────────────────────────────────────────────────────

const failures: string[] = [];
function gateAssert(cond: boolean, msg: string): void {
  if (!cond) failures.push(msg);
}

// ─── G1: split integrity ──────────────────────────────────────────────────────

const trainIds = new Set(splits.train);
const testIds = new Set(splits.test);
gateAssert(testIds.size === 12, `G1: expected 12 test ids, got ${testIds.size}`);
gateAssert(
  [...testIds].every((id) => id.startsWith("clair-de-lune:")),
  "G1: test split contains a non-clair-de-lune id",
);
for (const r of records) {
  const inTrain = trainIds.has(r.id);
  const inTest = testIds.has(r.id);
  gateAssert(inTrain !== inTest, `G1: ${r.id} not in exactly one split list`);
  gateAssert(
    r.split === (inTrain ? "train" : "test"),
    `G1: ${r.id} split field "${r.split}" disagrees with splits.json`,
  );
}

const trainRecords = records.filter((r) => r.split === "train");
gateAssert(
  trainRecords.length === 103,
  `G1: expected 103 train records, got ${trainRecords.length}`,
);
gateAssert(
  trainRecords.every((r) => r.scope.song_id !== "clair-de-lune"),
  "G1: clair-de-lune leaked into train records",
);

// ─── Build SFT lines ──────────────────────────────────────────────────────────

function toSftLine(r: PublicRecord): SftLine {
  const messages: SftMessage[] = [{ role: "system", content: SYSTEM_TEXT }];
  for (const turn of r.target_trace.session) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.content as string });
    } else if (turn.role === "assistant") {
      const msg: SftMessage = {
        role: "assistant",
        content: (turn.content as string) ?? "",
      };
      if (turn.tool_calls && turn.tool_calls.length > 0) {
        msg.tool_calls = turn.tool_calls.map((tc) => ({
          name: tc.tool,
          arguments: tc.arguments,
        }));
      }
      messages.push(msg);
    } else {
      // tool turn — result object serialized compact (JSON.stringify), the
      // same serialization the repo's own multi-turn loop feeds back.
      messages.push({
        role: "tool",
        name: turn.tool as string,
        content: JSON.stringify(turn.content),
      });
    }
  }
  return { id: r.id, song_id: r.scope.song_id, messages };
}

const sftTrain: SftLine[] = [];
const sftInnerVal: SftLine[] = [];
const perSongCounts: Record<string, number> = {};

for (const r of trainRecords) {
  // G2: repo-native strict validation of every trace we emit.
  const report = validateTrace(r.target_trace, catalog);
  gateAssert(
    report.mismatches.length === 0,
    `G2: ${r.id} validateTrace mismatches: ${JSON.stringify(report.mismatches)}`,
  );

  const line = toSftLine(r);
  perSongCounts[line.song_id] = (perSongCounts[line.song_id] ?? 0) + 1;
  (INNER_VAL_SONGS.has(line.song_id) ? sftInnerVal : sftTrain).push(line);
}

// ─── G3: byte round-trip ──────────────────────────────────────────────────────

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

for (const line of [...sftTrain, ...sftInnerVal]) {
  const serialized = JSON.stringify(line);
  const reparsed = JSON.parse(serialized) as SftLine;
  gateAssert(deepEqual(line, reparsed), `G3: ${line.id} line round-trip drift`);
  for (const m of line.messages) {
    if (m.tool_calls) {
      for (const tc of m.tool_calls) {
        gateAssert(
          deepEqual(tc.arguments, JSON.parse(JSON.stringify(tc.arguments))),
          `G3: ${line.id} tool_call arguments round-trip drift (${tc.name})`,
        );
        gateAssert(
          catalog.tools.some((t) => t.name === tc.name),
          `G3: ${line.id} tool_call name "${tc.name}" not in catalog`,
        );
      }
    }
    if (m.role === "tool") {
      gateAssert(
        catalog.tools.some((t) => t.name === m.name),
        `G3: ${line.id} tool turn name "${m.name}" not in catalog`,
      );
      // content must be valid JSON text (it is fed back verbatim at train time)
      try {
        JSON.parse(m.content);
      } catch {
        failures.push(`G3: ${line.id} tool turn content is not valid JSON`);
      }
    }
  }
}

// ─── G4: counts ───────────────────────────────────────────────────────────────

gateAssert(
  sftTrain.length === 78 && sftInnerVal.length === 25,
  `G4: expected 78 train / 25 inner-val, got ${sftTrain.length} / ${sftInnerVal.length}`,
);
for (const [song, expected] of Object.entries(EXPECTED_SONG_COUNTS)) {
  gateAssert(
    perSongCounts[song] === expected,
    `G4: ${song} expected ${expected} records, got ${perSongCounts[song] ?? 0}`,
  );
}
gateAssert(
  Object.keys(perSongCounts).length === Object.keys(EXPECTED_SONG_COUNTS).length,
  "G4: unexpected extra song in train records",
);

// ─── Write outputs (only if all gates pass) ───────────────────────────────────

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const gateReportPath = join(OUT_DIR, "P1-gate-report.json");

if (failures.length > 0) {
  writeFileSync(
    gateReportPath,
    JSON.stringify(
      { schema: "finetune-arc-p1-gate/1.0.0", verdict: "FAIL", failures },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.error(`P1 GATE FAIL — ${failures.length} failure(s):`);
  for (const f of failures.slice(0, 20)) console.error(`  - ${f}`);
  process.exit(1);
}

const trainText = sftTrain.map((l) => JSON.stringify(l)).join("\n") + "\n";
const innerValText = sftInnerVal.map((l) => JSON.stringify(l)).join("\n") + "\n";
const toolsExport = {
  source: "src/dataset/tool-schemas.json",
  source_sha256: sha256(
    readFileSync(join(REPO_ROOT, "src", "dataset", "tool-schemas.json"), "utf8"),
  ),
  derived_from: catalog.derived_from,
  tool_count: catalog.tool_count,
  tools: catalog.tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
};
const toolsText = JSON.stringify(toolsExport, null, 2) + "\n";

writeFileSync(join(OUT_DIR, "sft-train.jsonl"), trainText, "utf8");
writeFileSync(join(OUT_DIR, "sft-inner-val.jsonl"), innerValText, "utf8");
writeFileSync(join(OUT_DIR, "tools.json"), toolsText, "utf8");

const report = {
  schema: "finetune-arc-p1-gate/1.0.0",
  verdict: "PASS",
  generated_by: "experiments/finetune-arc/scripts/build-sft-data.ts",
  inputs: {
    records_jsonl_sha256: sha256(readFileSync(recordsPath, "utf8")),
    splits_json_sha256: sha256(readFileSync(splitsPath, "utf8")),
    tool_schemas_sha256: toolsExport.source_sha256,
  },
  system_text: SYSTEM_TEXT,
  inner_val_songs: [...INNER_VAL_SONGS],
  counts: {
    sft_train: sftTrain.length,
    sft_inner_val: sftInnerVal.length,
    per_song: perSongCounts,
    test_untouched: testIds.size,
  },
  gates: {
    G1_split_integrity: "PASS",
    G2_validate_trace_zero_mismatches: "PASS",
    G3_byte_round_trip: "PASS",
    G4_counts: "PASS",
  },
  outputs: {
    "sft-train.jsonl": sha256(trainText),
    "sft-inner-val.jsonl": sha256(innerValText),
    "tools.json": sha256(toolsText),
  },
};
writeFileSync(gateReportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log("P1 GATE PASS");
console.log(`  sft-train.jsonl:     ${sftTrain.length} records`);
console.log(`  sft-inner-val.jsonl: ${sftInnerVal.length} records`);
console.log(`  tools.json:          ${catalog.tool_count} tools`);
console.log(`  per-song: ${JSON.stringify(perSongCounts)}`);
console.log(`  report: ${gateReportPath}`);
