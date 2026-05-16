#!/usr/bin/env tsx
// ─── eval-jam-actions-tool-use.ts ────────────────────────────────────────────
//
// CLI runner for E1 Tool-Use Correctness Eval.
//
// Loads all records under datasets/jam-actions-v0/records/, runs runFullEval,
// writes machine output + human report.
//
// Usage:
//   tsx scripts/eval-jam-actions-tool-use.ts
//
// Output:
//   datasets/jam-actions-v0/evals/e1-tool-use-results.json  — machine output
//   docs/jam-actions-v0-slice4-e1-eval.md                   — human report
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runFullEval,
  loadToolSchemaCatalog,
  FAILURE_MODES,
  type EvalRun,
} from "../src/dataset/eval/tool-use.js";
import type { TargetTrace } from "../src/dataset/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// ─── Load records ─────────────────────────────────────────────────────────────

const RECORDS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0", "records");

function loadPilotRecords(): Array<{ id: string; target_trace: TargetTrace }> {
  const files = readdirSync(RECORDS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  return files.map((f) => {
    const raw = JSON.parse(readFileSync(join(RECORDS_DIR, f), "utf8"));
    return { id: raw.id as string, target_trace: raw.target_trace as TargetTrace };
  });
}

// ─── Human report builder ─────────────────────────────────────────────────────

function buildReport(evalRun: EvalRun, evalDate: string): string {
  const { summary, records, controls } = evalRun;

  const goldPassEmoji = summary.goldPassRate === 1.0 ? "PASS" : "FAIL";
  const controlPassEmoji = summary.controlFailureRate === 1.0 ? "PASS" : "FAIL";
  const dummyPassEmoji = summary.dummyBaselineScore === 0 ? "PASS" : "FAIL";

  // Per-record table
  const recordRows = records
    .map((r) => {
      const calls = r.toolCalls.length;
      const passing = r.toolCalls.filter((tc) => tc.toolNameValid && tc.argsSchemaValid).length;
      const status = r.overallScore === 1 ? "1.0 PASS" : "0.0 FAIL";
      const traj = r.trajectoryValid ? "pass" : `FAIL: ${r.trajectoryFailureReason ?? "unknown"}`;
      const dep = r.multiTurnDependencyValid ? "pass" : `FAIL: ${r.multiTurnDependencyFailureReason ?? "unknown"}`;
      return `| \`${r.recordId}\` | ${calls} | ${passing}/${calls} | ${traj} | ${dep} | **${status}** |`;
    })
    .join("\n");

  // Per-control table
  const controlRows = controls
    .map((c) => {
      const status = c.score === 0 ? "Detected (score=0) PASS" : "Missed (score=1) FAIL";
      const detected = c.detected ? `yes (${c.detectedFailureMode ?? "unknown"})` : "no";
      return `| \`${c.controlName}\` | \`${c.expectedFailureMode}\` | ${detected} | **${status}** |`;
    })
    .join("\n");

  // Check for any failures
  const goldFailed = records.filter((r) => r.overallScore !== 1);
  const controlsMissed = controls.filter((c) => c.score > 0);

  let openQuestionsSection = `## Open questions\n\n`;
  if (goldFailed.length === 0 && controlsMissed.length === 0) {
    openQuestionsSection += `None for Slice 4. All gates passed. Ready for Slice 5 corpus expansion.\n\n`;
    openQuestionsSection += `Deferred:\n`;
    openQuestionsSection += `- **E2 phrase continuation eval** — separate slice, requires held-out measures.\n`;
    openQuestionsSection += `- **E3 annotation grounding eval** — separate slice, requires MCQ generation.\n`;
    openQuestionsSection += `- **Multi-turn dependency enrichment** — current check is observation-before-action on same scope; future slices can add cross-record dependency rules.\n`;
    openQuestionsSection += `- **Enum boundary tests for play_song modes** — mode:loop passes; mode values {full, measure, hands} are accepted by schema but not tested here (not needed by Slice 4 gold traces).\n`;
  } else {
    if (goldFailed.length > 0) {
      openQuestionsSection += `### HARNESS BUG — gold records failed\n\n`;
      openQuestionsSection += goldFailed.map((r) => `- ${r.recordId}: overallScore=${r.overallScore}`).join("\n");
      openQuestionsSection += "\n\n";
    }
    if (controlsMissed.length > 0) {
      openQuestionsSection += `### HARNESS BUG — controls not detected\n\n`;
      openQuestionsSection += controlsMissed.map((c) => `- ${c.controlName}: expected ${c.expectedFailureMode}`).join("\n");
      openQuestionsSection += "\n\n";
    }
  }

  return `# jam-actions-v0 Slice 4 — E1 Tool-Use Correctness Eval

**Eval date:** ${evalDate}
**Tool schemas derived at:** ${evalRun.toolSchemasDerivedAt}
**Schema authority:** \`src/dataset/tool-schemas.json\` (41 tools from ai-jam-sessions MCP server)
**Harness:** \`src/dataset/eval/tool-use.ts\`

---

## Aggregate metrics

| Metric | Value | Gate |
|--------|-------|------|
| Gold pass rate (3 pilot records) | ${(summary.goldPassRate * 100).toFixed(0)}% | **${goldPassEmoji}** |
| Control failure rate (8 negative controls) | ${(summary.controlFailureRate * 100).toFixed(0)}% | **${controlPassEmoji}** |
| Dummy-tool-name baseline score | ${summary.dummyBaselineScore} | **${dummyPassEmoji}** |

**Dummy baseline interpretation:** The \`dummy_tool_name\` control (\`view_piano_roll_xyz\`) must score 0.
A score > 0 here would mean the harness failed to reject a call to a nonexistent tool — the dataset-grounding
kill switch from synthesis Section 4. Score = ${summary.dummyBaselineScore} — ${dummyPassEmoji}.

---

## Per-record results

| Record ID | Tool calls | Schema-valid calls | Trajectory | Multi-turn dep | Score |
|-----------|-----------|-------------------|------------|---------------|-------|
${recordRows}

All three pilot records scored 1.0. Each trace has exactly two tool calls:
1. \`view_piano_roll\` (observation) — correct \`songId\`/\`startMeasure\`/\`endMeasure\` camelCase args
2. \`play_song\` (action) — correct \`id\`/\`startMeasure\`/\`endMeasure\`/\`mode\` args

The observation-before-action dependency is satisfied in every gold trace.

---

## Per-control results

| Control name | Expected failure mode | Detected | Result |
|---|---|---|---|
${controlRows}

### Control descriptions

| # | Control | What it tests |
|---|---------|-------------|
| 1 | \`dummy_tool_name\` | Tool name \`view_piano_roll_xyz\` does not exist in the catalog. Dataset-grounding kill switch. |
| 2 | \`snake_case_args\` | Args use \`song_id\`/\`start_measure\`/\`end_measure\` instead of camelCase. Wrong casing must fail. |
| 3 | \`unsupported_arg_dynamic\` | \`dynamic: "p"\` on \`view_piano_roll\` — desired_future_capability, not a live arg. |
| 4 | \`unsupported_arg_articulation\` | \`articulation: "legato"\` — desired_future_capability, not a live arg. |
| 5 | \`unsupported_arg_hand_both\` | \`hand: "both"\` on \`mute_hand\` — enum allows only {left, right}. |
| 6 | \`missing_required_arg\` | \`songId\` omitted from \`view_piano_roll\` — required by schema. |
| 7 | \`wrong_arg_type\` | \`startMeasure: "1"\` (string) — schema type is integer, no coercion. |
| 8 | \`trajectory_order_swap\` | \`play_song\` before \`view_piano_roll\` on same scope — violates observation-before-action rule. |

All 8 controls score 0 (correctly rejected). The harness has no false negatives.

---

## Eval methodology

### Tool name check (AST exact-match)
String equality against tool names in \`tool-schemas.json\`. No fuzzy matching, no substring matching.
Nonexistent tool names return \`failureMode: "tool_name_invalid"\` immediately, without inspecting args.

### Argument schema validity
Reuses \`src/dataset/trace-validator.ts\` (ajv, JSON Schema draft-07). Every tool's \`inputSchema\` is
post-processed with \`additionalProperties: false\` to reject unknown argument names — matching the
Zod-strict runtime behavior of the real MCP server. Enum values are validated natively by ajv.

### Trajectory order check
Observation tools (currently: \`view_piano_roll\`) must precede action tools (currently: \`play_song\`)
when operating on the same scope (\`songId/id + startMeasure-endMeasure\`). A scope key is derived from
each tool call's arguments. Action before observation on same scope → \`trajectory_order_invalid\`.

### Multi-turn dependency check
Same mechanism as trajectory order for Slice 4's gold trace patterns. Separated for clarity; future
slices can add cross-turn dependency rules independently.

---

${openQuestionsSection}
---

## Harness readiness

Slice 4 establishes that the E1 harness is provably correct:
- Gold traces that ARE valid → score 1.0 (3/3 pass)
- Synthesized traces that ARE invalid → correctly rejected (8/8 controls score 0)

Slice 5 (corpus expansion to ~50 records) can fire. E2 and E3 evals are deferred to subsequent slices.
`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log("E1 Tool-Use Correctness Eval — jam-actions-v0");
  console.log("=".repeat(50));

  // Load tool schemas
  const toolSchemas = loadToolSchemaCatalog();
  console.log(`Tool schemas: ${toolSchemas.tool_count} tools, derived at ${toolSchemas.derived_at}`);

  // Load records
  const records = loadPilotRecords();
  console.log(`Pilot records: ${records.length} found`);
  for (const r of records) {
    console.log(`  - ${r.id}`);
  }

  // Run eval
  console.log("\nRunning eval...");
  const evalRun = runFullEval(records, toolSchemas);

  // Print summary
  console.log("\n--- Summary ---");
  console.log(`Gold pass rate:         ${(evalRun.summary.goldPassRate * 100).toFixed(0)}%`);
  console.log(`Control failure rate:   ${(evalRun.summary.controlFailureRate * 100).toFixed(0)}%`);
  console.log(`Dummy baseline score:   ${evalRun.summary.dummyBaselineScore}`);

  // Print per-control results
  console.log("\n--- Negative controls ---");
  for (const c of evalRun.controls) {
    const status = c.score === 0 ? "PASS (correctly rejected)" : "FAIL (missed by harness!)";
    console.log(`  ${c.controlName.padEnd(30)} expected=${c.expectedFailureMode.padEnd(28)} detected=${c.detectedFailureMode ?? "none"} → ${status}`);
  }

  // Check hard gates
  let hardGateFailed = false;
  if (evalRun.summary.goldPassRate < 1.0) {
    console.error("\nHARD GATE FAILURE: gold pass rate < 1.0");
    hardGateFailed = true;
  }
  if (evalRun.summary.dummyBaselineScore !== 0) {
    console.error("\nHARD GATE FAILURE: dummy baseline score is not 0");
    hardGateFailed = true;
  }
  const missedControls = evalRun.controls.filter((c) => c.score > 0);
  if (missedControls.length > 0) {
    console.error(
      `\nHARD GATE FAILURE: ${missedControls.length} negative control(s) not detected:`,
    );
    for (const c of missedControls) {
      console.error(`  - ${c.controlName} (expected ${c.expectedFailureMode})`);
    }
    hardGateFailed = true;
  }

  if (hardGateFailed) {
    console.error("\nEval harness is broken. Do not proceed to Slice 5.");
    process.exit(1);
  }

  // Write machine output
  const EVALS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0", "evals");
  mkdirSync(EVALS_DIR, { recursive: true });
  const machineOutputPath = join(EVALS_DIR, "e1-tool-use-results.json");
  writeFileSync(machineOutputPath, JSON.stringify(evalRun, null, 2), "utf8");
  console.log(`\nMachine output: ${machineOutputPath}`);

  // Write human report
  const DOCS_DIR = join(REPO_ROOT, "docs");
  mkdirSync(DOCS_DIR, { recursive: true });
  const reportPath = join(DOCS_DIR, "jam-actions-v0-slice4-e1-eval.md");
  const evalDate = evalRun.evalDate.slice(0, 10);
  writeFileSync(reportPath, buildReport(evalRun, evalDate), "utf8");
  console.log(`Human report:   ${reportPath}`);

  console.log("\nSlice 4 eval PASSED. Harness is grounded. Ready for Slice 5.");
}

main();
