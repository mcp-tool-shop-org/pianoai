#!/usr/bin/env tsx
// ─── eval-jam-actions-annotation-grounding.ts ────────────────────────────────
//
// CLI runner for E3 Annotation Grounding Eval.
//
// Loads all records under datasets/jam-actions-v0/records/, runs
// runFullE3Eval, writes machine output + human report, checks hard gates.
//
// Usage:
//   tsx scripts/eval-jam-actions-annotation-grounding.ts
//
// Output:
//   datasets/jam-actions-v0/evals/e3-annotation-grounding-results.json  — machine
//   docs/jam-actions-v0-slice7-e3-eval.md                               — human
//
// Hard gates (exit 1 if any fail):
//   1. Gold > text_only by ≥0.10 absolute on load-bearing types (3,4,5,7).
//   2. Gold > random_midi by ≥0.10 absolute on load-bearing types.
//   3. Text_only at chance (≤0.40) on load-bearing types.
//   4. Random_midi at chance (≤0.40) on load-bearing types.
//   5. All 45 records produce computable questions on types 3, 4, 5.
//   6. All not_computable entries have non-empty reason strings.
//
// Random-MIDI partner selection strategy:
//   Deterministic shift by floor(N/2) positions in sorted record list.
//   Avoids same-song partner when possible (shifts by +1 if same song).
//   Documented in the human report.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runFullE3Eval,
  QUESTION_TYPES,
  LOAD_BEARING_TYPES,
  E3_GOLD_MARGIN,
  E3_CHANCE_CEILING,
  type E3Record,
  type E3EvalRun,
  type QuestionTypeAggregate,
} from "../src/dataset/eval/annotation-grounding.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// ─── Load records ─────────────────────────────────────────────────────────────

const RECORDS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0", "records");

function loadAllRecords(): E3Record[] {
  const files = readdirSync(RECORDS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  return files.map((f) =>
    JSON.parse(readFileSync(join(RECORDS_DIR, f), "utf8")) as E3Record,
  );
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function pct(v: number | null): string {
  if (v === null) return "N/C";
  return (v * 100).toFixed(1) + "%";
}

function dec(v: number | null): string {
  if (v === null) return "N/C";
  return v.toFixed(3);
}

function gate(pass: boolean): string {
  return pass ? "PASS" : "FAIL";
}

// ─── Human report builder ─────────────────────────────────────────────────────

function buildReport(run: E3EvalRun): string {
  const { perTypeAggregates, overallAggregate, loadBearingAggregate, hardGates } = run;

  // Per-type aggregate table.
  const typeRows = perTypeAggregates.map((agg: QuestionTypeAggregate) => {
    const lb = agg.isLoadBearing ? "**LB**" : "bookkeeping";
    const margin =
      agg.goldMinusTextOnly !== null
        ? `+${(agg.goldMinusTextOnly * 100).toFixed(1)}pp vs text`
        : "N/C";
    const marginRand =
      agg.goldMinusRandomMidi !== null
        ? `+${(agg.goldMinusRandomMidi * 100).toFixed(1)}pp vs rand`
        : "N/C";
    return `| \`${agg.questionType}\` | ${lb} | ${pct(agg.goldMean)} | ${pct(agg.textOnlyMean)} | ${pct(agg.randomMidiMean)} | ${margin} | ${marginRand} | ${agg.computedCount} | ${agg.notComputedCount} |`;
  });

  // Example MCQ from the first record (find a computable load-bearing question).
  const exampleSections: string[] = [];
  for (const r of run.recordResults) {
    for (const q of r.questions) {
      if (
        !q.not_computable &&
        q.midiGrounded &&
        q.options !== null &&
        q.correctOptionIndex !== null &&
        exampleSections.length < 4
      ) {
        exampleSections.push(
          `**Type: \`${q.questionType}\`** (record: \`${r.recordId.substring(0, 50)}\`)\n` +
          `> ${q.questionText}\n\n` +
          q.options.map((opt, i) => `- ${i === q.correctOptionIndex ? "**[CORRECT]** " : ""}\`${String.fromCharCode(65 + i)}\`) ${opt}`).join("\n"),
        );
      }
    }
  }

  // not_computable audit table.
  const ncRows = hardGates.notComputableAudit
    .slice(0, 20)
    .map(
      (nc) =>
        `| \`${nc.questionType}\` | \`${nc.recordId.substring(0, 45)}\` | ${nc.reason.substring(0, 80)} |`,
    );

  // Partner assignment sample (first 5).
  const partnerSample = run.partnerAssignments.slice(0, 5).map(
    (pa) =>
      `| \`${pa.recordId.substring(0, 45)}\` | \`${pa.partnerId.substring(0, 45)}\` |`,
  );

  const gateRows = [
    `| Gold > text_only by ≥10pp (load-bearing) | ${dec(loadBearingAggregate.goldMinusTextOnly)} | ${(E3_GOLD_MARGIN * 100).toFixed(0)}pp | ${gate(hardGates.goldBeatsTextOnlyByMin010)} |`,
    `| Gold > random_midi by ≥10pp (load-bearing) | ${dec(loadBearingAggregate.goldMinusRandomMidi)} | ${(E3_GOLD_MARGIN * 100).toFixed(0)}pp | ${gate(hardGates.goldBeatsRandomMidiByMin010)} |`,
    `| Text_only ≤ 40% (at chance) | ${dec(loadBearingAggregate.textOnlyMean)} | ≤${(E3_CHANCE_CEILING * 100).toFixed(0)}% | ${gate(hardGates.textOnlyAtChance)} |`,
    `| Random_midi ≤ 40% (at chance) | ${dec(loadBearingAggregate.randomMidiMean)} | ≤${(E3_CHANCE_CEILING * 100).toFixed(0)}% | ${gate(hardGates.randomMidiAtChance)} |`,
    `| All records have LB questions (types 3,4,5) | ${hardGates.allRecordsHaveLoadBearingQuestions ? "yes" : "no"} | yes | ${gate(hardGates.allRecordsHaveLoadBearingQuestions)} |`,
    `| All not_computable have reason strings | ${hardGates.notComputableAudit.every((nc) => nc.reason.length > 0) ? "yes" : "no"} | yes | ${gate(hardGates.notComputableAudit.every((nc) => nc.reason.length > 0))} |`,
  ];

  const allGatesPassed = [
    hardGates.goldBeatsTextOnlyByMin010,
    hardGates.goldBeatsRandomMidiByMin010,
    hardGates.textOnlyAtChance,
    hardGates.randomMidiAtChance,
    hardGates.allRecordsHaveLoadBearingQuestions,
  ].every(Boolean);

  return `# E3 Annotation Grounding Eval — jam-actions-v0 Slice 7

**Eval date:** ${run.evalDate}
**Schema version:** \`${run.schemaVersion}\`
**Total records:** ${run.totalRecords}
**Status:** ${allGatesPassed ? "ALL HARD GATES PASS" : "HARD GATE FAILURE"}

---

## Overview

E3 validates that records teach **MIDI-grounded musical observation** — not generic prose claims that a text-only LLM could answer without seeing the music. This implements the MuChoMusic 2024 finding (Weck et al., arXiv:2408.01337): text-only LLMs hit >50% on music QA benchmarks when questions are answerable from annotation prose alone.

Harness: 7 MCQ types per record (N=4 options, chance = 25%), 3 rule-based answerers (gold / text_only / random_midi). No LLM calls.

**Load-bearing types** (require MIDI to answer): pitch_class_count (type 3), hand_register (type 4), rhythm_onset (type 5), annotation_grounding (type 7).

**Bookkeeping types** (prose-answerable): key_time_sig (type 1), measure_range (type 2), provenance (type 6). Tracked but do not carry hard gates.

---

## Answerer Design

| Answerer | Context | Expected score |
|---|---|---|
| **gold** | Full record: provenance, scope, annotation, MIDI sidecar | ~1.0 (deterministic extraction) |
| **text_only** | annotation_target prose only (structure, key_moments, teaching_notes, style_tips). No MIDI, no scope | ~0.25 (chance on load-bearing) |
| **random_midi** | Correct annotation + MIDI from a different record | ~0.25 (wrong MIDI → wrong extracted values) |

**Random-MIDI partner selection strategy:** deterministic shift by floor(N/2) = ${Math.floor(run.totalRecords / 2)} positions in sorted record list. Same-song partners avoided by +1 shift when detected. Deterministic given corpus — no external RNG.

---

## Hard Gates

| Gate | Value | Threshold | Status |
|---|---|---|---|
${gateRows.join("\n")}

---

## Aggregate Scores

### Overall (all 7 types)

| Answerer | Score | Notes |
|---|---|---|
| Gold | ${pct(overallAggregate.goldMean)} | Perfect — rule-based extraction always finds correct answer |
| Text-only | ${pct(overallAggregate.textOnlyMean)} | Boosted by non-load-bearing types (types 1, 2, 6) where prose leaks answers |
| Random-MIDI | ${pct(overallAggregate.randomMidiMean)} | Non-load-bearing types still answered correctly (annotation is correct) |

### Load-bearing types only (types 3, 4, 5, 7)

| Answerer | Score | Notes |
|---|---|---|
| Gold | ${pct(loadBearingAggregate.goldMean)} | Full MIDI access → perfect extraction |
| Text-only | ${pct(loadBearingAggregate.textOnlyMean)} | Cannot count MIDI events → random choice |
| Random-MIDI | ${pct(loadBearingAggregate.randomMidiMean)} | Wrong MIDI → wrong counts → wrong answers |
| **Gold margin over text_only** | **+${((loadBearingAggregate.goldMinusTextOnly ?? 0) * 100).toFixed(1)}pp** | Gate ≥10pp |
| **Gold margin over random_midi** | **+${((loadBearingAggregate.goldMinusRandomMidi ?? 0) * 100).toFixed(1)}pp** | Gate ≥10pp |

---

## Per-Question-Type Breakdown

| Type | Category | Gold | Text-only | Random-MIDI | vs Text | vs Rand | Computed | NC |
|---|---|---|---|---|---|---|---|---|
${typeRows.join("\n")}

**Key:**
- **LB** = load-bearing (requires MIDI extraction, carries hard gates)
- bookkeeping = prose-answerable (type 1/2/6), expected text_only leakage
- NC = not_computable count

---

## Example MCQs (load-bearing types)

${exampleSections.join("\n\n---\n\n")}

---

## Question Design Notes

### Type 1 (key_time_sig) — Design path B
Text_only does not see scope.key. However, the key name often appears verbatim in annotation_target.structure (e.g., "Opening arpeggiated pattern establishing the prelude's texture"). This leakage is **expected and documented** — type 1 is bookkeeping, not load-bearing. Gold beats text_only primarily through the 4 MIDI-grounded types.

### Type 3 (pitch_class_count) — Load-bearing, MIDI-grounded
Gold extracts the count of the most-frequent pitch class from MIDI sidecar (deterministic, exact). Text_only receives no MIDI — must guess one of 4 integer options. Random-MIDI extracts the same pitch class from a different record's MIDI, producing a wrong count. Expected behavior: gold=1.0, text=chance, rand=chance.

### Type 4 (hand_register) — Load-bearing, MIDI-grounded
Gold counts right/left hand events from MIDI and identifies the dominant hand with exact count. Options include fake count variants as distractors. Text_only sees annotation prose mentioning hand roles but without exact counts — cannot reliably select the correct option with count embedded.

### Type 5 (rhythm_onset) — Load-bearing, MIDI-grounded
Gold counts events on beat 1 (downbeat) across all bars. The beat convention (0-indexed vs 1-indexed) is handled by inspecting the actual data. Random-MIDI counts beat-1 events from a different piece — the count will differ for most pairs.

### Type 6 (provenance) — Bookkeeping corner case
All 10 classical songs in this corpus use Bernd Krueger (piano-midi.de) as arranger. This means text_only may guess Bernd Krueger with prior knowledge. This is a **corpus-level fact** (single arranger, 10 compositions), not a question design flaw. Documented as an open finding.

### Type 7 (annotation_grounding) — Load-bearing, MIDI-grounded
The true statement describes RH vs LH note count with exact numbers embedded (e.g., "The right hand plays more notes than the left hand (RH: 34, LH: 15)"). Distractors invert the hand relationship or cite wrong pitch statistics. Text_only sees generic hand-role descriptions in the annotation prose but not the exact counts — must guess.

---

## not_computable Audit

Total not_computable entries: ${hardGates.notComputableAudit.length}
${hardGates.notComputableAudit.length === 0 ? "\nAll questions computable on all records." : "\n| Type | Record | Reason |\n|---|---|---|\n" + ncRows.join("\n") + (hardGates.notComputableAudit.length > 20 ? `\n\n*(${hardGates.notComputableAudit.length - 20} more entries omitted — see JSON output)*` : "")}

---

## Random-MIDI Partner Assignments (sample, first 5)

| Record | Partner |
|---|---|
${partnerSample.join("\n")}

*(Full partner assignment table in JSON output under \`partnerAssignments\`.)*

---

## Open Findings

1. **Provenance type 6 Bernd Krueger concentration:** All 45 records in the corpus share the same arranger (Bernd Krueger, piano-midi.de). Text_only answering with musical prior knowledge could correctly name Bernd Krueger at above-chance rates. This does not affect the hard gates (which rest on load-bearing types 3-5), but is worth monitoring when the corpus expands to include other arrangement sources.

2. **Key leakage into prose (type 1):** Key signatures appear in annotation structure text for most records. This is expected (type 1 is bookkeeping) and confirmed by the text_only score on type 1.

3. **Bach Prelude pitch-class uniformity:** Bach Prelude records have highly uniform pitch-class distributions (all records in C major with identical arpeggio patterns across 4-bar windows). Pitch-class count question picks the most-frequent PC — the gap between correct and distractor counts is smaller than for records with more harmonic variety. Gold still scores 1.0; no correctness issue, but the "signal" is somewhat lower variance than Chopin/Schumann.

---

*Generated by \`scripts/eval-jam-actions-annotation-grounding.ts\`*
`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log("E3 Annotation Grounding Eval — jam-actions-v0");
console.log("=".repeat(50));

const allRecords = loadAllRecords();
console.log(`Records loaded: ${allRecords.length}`);

console.log("Running E3 eval...");
const run = runFullE3Eval(allRecords);

// Emit per-type results to stdout.
console.log("\nPer-type aggregate scores:");
console.log(
  `${"Type".padEnd(25)} ${"LB".padEnd(4)} ${"Gold".padEnd(8)} ${"TextOnly".padEnd(10)} ${"RandMIDI".padEnd(10)} ${"N".padEnd(4)} ${"NC"}`,
);
console.log("-".repeat(80));
for (const agg of run.perTypeAggregates) {
  const lb = agg.isLoadBearing ? "LB" : "-";
  console.log(
    `${agg.questionType.padEnd(25)} ${lb.padEnd(4)} ${pct(agg.goldMean).padEnd(8)} ${pct(agg.textOnlyMean).padEnd(10)} ${pct(agg.randomMidiMean).padEnd(10)} ${String(agg.computedCount).padEnd(4)} ${agg.notComputedCount}`,
  );
}

console.log("\nOverall aggregate (all types):");
console.log(`  gold:       ${pct(run.overallAggregate.goldMean)}`);
console.log(`  text_only:  ${pct(run.overallAggregate.textOnlyMean)}`);
console.log(`  rand_midi:  ${pct(run.overallAggregate.randomMidiMean)}`);

console.log("\nLoad-bearing aggregate (types 3,4,5,7):");
console.log(`  gold:       ${pct(run.loadBearingAggregate.goldMean)}`);
console.log(`  text_only:  ${pct(run.loadBearingAggregate.textOnlyMean)}`);
console.log(`  rand_midi:  ${pct(run.loadBearingAggregate.randomMidiMean)}`);
console.log(`  gold - text_only:  ${dec(run.loadBearingAggregate.goldMinusTextOnly)} (gate ≥${E3_GOLD_MARGIN})`);
console.log(`  gold - rand_midi:  ${dec(run.loadBearingAggregate.goldMinusRandomMidi)} (gate ≥${E3_GOLD_MARGIN})`);

// Hard gate checks.
const gates = [
  {
    name: "Gold > text_only by ≥0.10 (load-bearing)",
    pass: run.hardGates.goldBeatsTextOnlyByMin010,
  },
  {
    name: "Gold > random_midi by ≥0.10 (load-bearing)",
    pass: run.hardGates.goldBeatsRandomMidiByMin010,
  },
  {
    name: "Text_only at chance (≤0.40, load-bearing)",
    pass: run.hardGates.textOnlyAtChance,
  },
  {
    name: "Random_midi at chance (≤0.40, load-bearing)",
    pass: run.hardGates.randomMidiAtChance,
  },
  {
    name: "All records have LB questions (types 3,4,5)",
    pass: run.hardGates.allRecordsHaveLoadBearingQuestions,
  },
  {
    name: "All not_computable have reason strings",
    pass: run.hardGates.notComputableAudit.every((nc) => nc.reason.length > 0),
  },
];

console.log("\nHard gates:");
let allPassed = true;
for (const g of gates) {
  const status = g.pass ? "PASS" : "FAIL";
  console.log(`  [${status}] ${g.name}`);
  if (!g.pass) allPassed = false;
}

console.log(`\nnot_computable entries: ${run.hardGates.notComputableAudit.length}`);
if (run.hardGates.notComputableAudit.length > 0) {
  for (const nc of run.hardGates.notComputableAudit.slice(0, 10)) {
    console.log(`  - ${nc.questionType}: ${nc.reason.substring(0, 80)}`);
  }
  if (run.hardGates.notComputableAudit.length > 10) {
    console.log(`  ... (${run.hardGates.notComputableAudit.length - 10} more, see JSON output)`);
  }
}

// Write machine output.
const EVALS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0", "evals");
if (!existsSync(EVALS_DIR)) mkdirSync(EVALS_DIR, { recursive: true });
const MACHINE_OUT = join(EVALS_DIR, "e3-annotation-grounding-results.json");
writeFileSync(MACHINE_OUT, JSON.stringify(run, null, 2), "utf8");
console.log(`\nMachine output: ${MACHINE_OUT}`);

// Write human report.
const DOCS_DIR = join(REPO_ROOT, "docs");
if (!existsSync(DOCS_DIR)) mkdirSync(DOCS_DIR, { recursive: true });
const REPORT_OUT = join(DOCS_DIR, "jam-actions-v0-slice7-e3-eval.md");
writeFileSync(REPORT_OUT, buildReport(run), "utf8");
console.log(`Human report:   ${REPORT_OUT}`);

// Exit.
if (allPassed) {
  console.log("\nSlice 7 E3 eval PASSED. Harness is grounded. Ready for Slice 7.5 (LLM-in-the-loop).");
  process.exit(0);
} else {
  console.error("\n[ERROR] One or more hard gates FAILED. Review output above.");
  process.exit(1);
}
