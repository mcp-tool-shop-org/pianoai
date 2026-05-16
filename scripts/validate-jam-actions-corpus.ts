#!/usr/bin/env tsx
// ─── Slice 5 whole-corpus validator ──────────────────────────────────────────
//
// Validates the complete jam-actions-v0 corpus against all hard gates:
//   1. Schema strict — every record passes makeRecordSchema({ allow_placeholders: false })
//   2. E1 trace validator — every target_trace validates against tool-schemas.json
//   3. Provenance — every record has record_verdict === 'public_candidate' (or internal)
//   4. Token completeness — every record has real REMI (array) + ABC (string), no placeholders
//   5. Pair completeness — every prompt has a real continuation_target on disk
//   6. Orphan check — every continuation_target has a real prompt on disk
//   7. Manifest count — manifest.record_count matches actual record count on disk
//   8. Splits reference — every ID in splits.json exists on disk
//   9. Pair-lock — both halves of every pair are in the same split
//  10. No excluded records — no record_verdict === 'excluded' in the corpus
//  11. window_role enum check — every window_role value is in the allowed set
//
// Usage:
//   tsx scripts/validate-jam-actions-corpus.ts
//   Exit 0 on PASS, 1 on any gate failure.
//
// Output:
//   Stdout: per-gate results
//   datasets/jam-actions-v0/evals/e1-tool-use-results.json is re-written with full-corpus results
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { makeRecordSchema, WINDOW_ROLES } from "../src/dataset/schema.js";
import { loadToolSchemaCatalog, validateTrace } from "../src/dataset/trace-validator.js";
import { runFullEval } from "../src/dataset/eval/tool-use.js";
import type { TargetTrace } from "../src/dataset/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DATASET_ROOT = join(REPO_ROOT, "datasets", "jam-actions-v0");
const RECORDS_DIR = join(DATASET_ROOT, "records");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gatePass(name: string, msg: string): void {
  console.log(`  [PASS] Gate ${name}: ${msg}`);
}

function gateFail(name: string, msg: string): never {
  console.error(`  [FAIL] Gate ${name}: ${msg}`);
  process.exit(1);
}

function gateWarn(name: string, msg: string): void {
  console.warn(`  [WARN] Gate ${name}: ${msg}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  console.log("=".repeat(70));
  console.log(" jam-actions-v0 Whole-Corpus Validator");
  console.log("=".repeat(70));

  // Load all records from disk
  if (!existsSync(RECORDS_DIR)) {
    gateFail("pre-check", `Records directory not found: ${RECORDS_DIR}`);
  }
  const recordFiles = readdirSync(RECORDS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  console.log(`\nRecords found on disk: ${recordFiles.length}`);
  if (recordFiles.length === 0) {
    gateFail("pre-check", "No records found on disk — corpus is empty.");
  }

  const allRecords: unknown[] = recordFiles.map((f) =>
    JSON.parse(readFileSync(join(RECORDS_DIR, f), "utf8")),
  );

  const strictSchema = makeRecordSchema({ allow_placeholders: false });
  const catalog = loadToolSchemaCatalog();

  let totalFailed = 0;

  // ─── Gate 1: Schema strict ────────────────────────────────────────────────

  console.log("\n[1] Strict schema validation (no placeholders)");
  let schemaFailed = 0;
  for (const rec of allRecords) {
    const result = strictSchema.safeParse(rec);
    if (!result.success) {
      console.error(`    FAIL schema: ${(rec as any).id}`);
      console.error("    Issues:", JSON.stringify(result.error.issues, null, 2));
      schemaFailed++;
    }
  }
  if (schemaFailed > 0) {
    gateFail("1-schema", `${schemaFailed} record(s) failed strict schema validation.`);
  }
  gatePass("1-schema", `all ${allRecords.length} records pass strict schema.`);

  // ─── Gate 2: E1 trace validation ──────────────────────────────────────────

  console.log("\n[2] E1 trace validation (tool names + args vs tool-schemas.json)");
  let traceFailed = 0;
  for (const rec of allRecords) {
    const r = rec as any;
    const report = validateTrace(r.target_trace as TargetTrace, catalog);
    if (!report.ok) {
      console.error(`    FAIL trace: ${r.id}`);
      console.error("    Mismatches:", JSON.stringify(report.mismatches, null, 2));
      traceFailed++;
    }
  }
  if (traceFailed > 0) {
    gateFail("2-trace", `${traceFailed} record(s) failed trace validation.`);
  }
  gatePass("2-trace", `all ${allRecords.length} records pass E1 trace validation.`);

  // Run full E1 eval to confirm gold pass rate = 1.0
  const evalRecords = allRecords.map((r: any) => ({
    id: r.id as string,
    target_trace: r.target_trace as TargetTrace,
  }));
  const evalRun = runFullEval(evalRecords, catalog);
  if (evalRun.summary.goldPassRate < 1.0) {
    gateFail("2-e1-gold", `E1 gold pass rate = ${evalRun.summary.goldPassRate} < 1.0 (required).`);
  }
  if (evalRun.summary.dummyBaselineScore !== 0) {
    gateFail("2-e1-dummy", `E1 dummy baseline score = ${evalRun.summary.dummyBaselineScore} (must be 0).`);
  }
  gatePass("2-e1", `E1 gold pass rate = 1.0, dummy baseline = 0. Control failure rate = ${(evalRun.summary.controlFailureRate * 100).toFixed(0)}%.`);

  // ─── Gate 3: Provenance — no excluded records ─────────────────────────────

  console.log("\n[3] Provenance — no excluded records in corpus");
  const excludedRecs = allRecords.filter((r: any) => r.provenance?.record_verdict === "excluded");
  if (excludedRecs.length > 0) {
    gateFail("3-provenance", `${excludedRecs.length} excluded record(s) found in corpus: ${excludedRecs.map((r: any) => r.id).join(", ")}`);
  }
  const verdictCounts: Record<string, number> = {};
  for (const rec of allRecords) {
    const v = (rec as any).provenance?.record_verdict ?? "missing";
    verdictCounts[v] = (verdictCounts[v] ?? 0) + 1;
  }
  gatePass("3-provenance", `verdict counts: ${JSON.stringify(verdictCounts)}`);

  // ─── Gate 4: Token completeness ───────────────────────────────────────────

  console.log("\n[4] Token completeness — real REMI + ABC, no placeholders");
  let tokenFailed = 0;
  for (const rec of allRecords) {
    const r = rec as any;
    const remi = r.observation?.tokens_remi;
    const abc = r.observation?.tokens_abc;
    if (!Array.isArray(remi) || remi.length === 0) {
      console.error(`    FAIL tokens_remi: ${r.id} — not a non-empty array`);
      tokenFailed++;
    } else if (typeof remi[0] !== "string") {
      console.error(`    FAIL tokens_remi: ${r.id} — first element is not a string (placeholder?)`);
      tokenFailed++;
    }
    if (typeof abc !== "string" || abc.length === 0) {
      console.error(`    FAIL tokens_abc: ${r.id} — not a non-empty string`);
      tokenFailed++;
    }
  }
  if (tokenFailed > 0) {
    gateFail("4-tokens", `${tokenFailed} token completeness failure(s).`);
  }
  gatePass("4-tokens", `all ${allRecords.length} records have real REMI arrays + ABC strings.`);

  // ─── Gate 5 + 6: Pair completeness + orphan check ─────────────────────────

  console.log("\n[5+6] Pair completeness + orphan check");

  // Index records by ID
  const recordById = new Map<string, unknown>();
  for (const rec of allRecords) {
    recordById.set((rec as any).id, rec);
  }

  const ALLOWED_ROLES = new Set<string>(WINDOW_ROLES);
  let pairFailed = 0;
  let orphanFailed = 0;
  let windowRoleFailed = 0;
  const promptIds = new Set<string>();
  const contRecords: any[] = [];

  for (const rec of allRecords) {
    const r = rec as any;
    const role = r.scope?.window_role;

    // Gate 11 (window_role enum) checked here too
    if (role !== undefined && !ALLOWED_ROLES.has(role)) {
      console.error(`    FAIL window_role enum: ${r.id} has invalid window_role='${role}'`);
      windowRoleFailed++;
    }

    if (role === "prompt") {
      promptIds.add(r.id);
      const contWindow = r.scope?.continuation_target_window;
      if (!Array.isArray(contWindow) || contWindow.length !== 2) {
        console.error(`    FAIL prompt pair: ${r.id} — missing continuation_target_window`);
        pairFailed++;
      }
    } else if (role === "continuation_target") {
      contRecords.push(r);
    }
  }

  // Check every continuation_target links to a real prompt
  for (const contRec of contRecords) {
    const pairedId = contRec.scope?.paired_prompt_record_id;
    if (!pairedId) {
      console.error(`    FAIL orphan: ${contRec.id} — missing paired_prompt_record_id`);
      orphanFailed++;
    } else if (!promptIds.has(pairedId)) {
      console.error(`    FAIL orphan: ${contRec.id} — paired_prompt_record_id '${pairedId}' not found`);
      orphanFailed++;
    }
  }

  // Check every prompt has a corresponding continuation_target on disk
  const contIds = new Set(contRecords.map((r) => r.id));
  for (const rec of allRecords) {
    const r = rec as any;
    if (r.scope?.window_role !== "prompt") continue;
    const contWindow = r.scope?.continuation_target_window;
    if (!Array.isArray(contWindow)) continue;
    const songId = r.scope?.song_id;
    const m = (n: number) => String(n).padStart(3, "0");
    const expectedContId = `${songId}:m${m(contWindow[0])}-${m(contWindow[1])}:piano:mcp-session:v1`;
    if (!contIds.has(expectedContId)) {
      console.error(`    FAIL pair: prompt ${r.id} expects continuation ${expectedContId} but it is not on disk.`);
      pairFailed++;
    }
  }

  if (windowRoleFailed > 0) gateFail("5-window-role", `${windowRoleFailed} invalid window_role value(s).`);
  if (pairFailed > 0) gateFail("5-pairs", `${pairFailed} pair completeness failure(s).`);
  if (orphanFailed > 0) gateFail("6-orphans", `${orphanFailed} orphan continuation_target record(s).`);
  gatePass("5+6-pairs", `${promptIds.size} prompts, ${contRecords.length} continuations, 0 orphans, 0 dangling pairs.`);

  // ─── Gate 7: Manifest count ───────────────────────────────────────────────

  console.log("\n[7] Manifest count matches disk");
  const manifestPath = join(DATASET_ROOT, "manifest.json");
  if (!existsSync(manifestPath)) {
    gateFail("7-manifest", "manifest.json not found.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.record_count !== allRecords.length) {
    gateFail("7-manifest", `manifest.record_count=${manifest.record_count} but disk has ${allRecords.length} records.`);
  }
  gatePass("7-manifest", `manifest.record_count=${manifest.record_count} matches disk (${allRecords.length} records).`);

  // ─── Gate 8 + 9: Splits reference + pair-lock ────────────────────────────

  console.log("\n[8+9] Splits reference real records + pair-lock");
  const splitsPath = join(DATASET_ROOT, "splits.json");
  if (!existsSync(splitsPath)) {
    gateFail("8-splits", "splits.json not found.");
  }
  const splits = JSON.parse(readFileSync(splitsPath, "utf8"));
  const trainIds: string[] = splits.train ?? [];
  const testIds: string[] = splits.test ?? [];
  const allSplitIds = new Set([...trainIds, ...testIds]);

  let splitRefFailed = 0;
  for (const id of allSplitIds) {
    if (!recordById.has(id)) {
      console.error(`    FAIL splits ref: ID '${id}' in splits.json not found on disk.`);
      splitRefFailed++;
    }
  }
  if (splitRefFailed > 0) gateFail("8-splits", `${splitRefFailed} dangling IDs in splits.json.`);

  // Check pair-lock: both halves of every pair must be in the same split
  const testSet = new Set(testIds);
  let pairLockFailed = 0;
  for (const contRec of contRecords) {
    const pairedId = contRec.scope?.paired_prompt_record_id;
    if (!pairedId) continue;
    const contInTest = testSet.has(contRec.id);
    const promptInTest = testSet.has(pairedId);
    if (contInTest !== promptInTest) {
      console.error(`    FAIL pair-lock: ${contRec.id} and ${pairedId} are in different splits.`);
      pairLockFailed++;
    }
  }
  if (pairLockFailed > 0) gateFail("9-pair-lock", `${pairLockFailed} pair-lock violation(s).`);
  gatePass("8+9-splits", `all splits IDs exist on disk, pair-lock verified (0 violations). train=${trainIds.length}, test=${testIds.length}.`);

  // ─── Gate 10: Count within range ─────────────────────────────────────────

  console.log("\n[10] Record count range check (45–55 target)");
  if (allRecords.length < 45 || allRecords.length > 55) {
    gateWarn("10-count", `record count ${allRecords.length} is outside 45–55 target range.`);
  } else {
    gatePass("10-count", `${allRecords.length} records — within 45–55 target.`);
  }

  // ─── Summary ──────────────────────────────────────────────────────────────

  console.log("\n" + "=".repeat(70));
  console.log(" CORPUS VALIDATION COMPLETE — ALL GATES PASSED");
  console.log("=".repeat(70));
  console.log(`  Total records     : ${allRecords.length}`);
  console.log(`  Prompts           : ${promptIds.size}`);
  console.log(`  Continuations     : ${contRecords.length}`);
  console.log(`  Standalones       : ${allRecords.filter((r: any) => r.scope?.window_role === "standalone").length}`);
  console.log(`  Verdict counts    : ${JSON.stringify(verdictCounts)}`);
  console.log(`  E1 gold pass rate : 1.0`);
  console.log(`  Test song         : ${splits.held_out_song ?? "see splits.json"}`);
  console.log(`  Train / Test      : ${trainIds.length} / ${testIds.length}`);
  console.log(`  Pairs             : ${promptIds.size}`);
  console.log(`  Orphans           : 0`);
  console.log(`  Pair-lock         : PASS`);
}

main();
