#!/usr/bin/env tsx
// ─── eval-jam-actions-phrase-continuation.ts ─────────────────────────────────
//
// CLI runner for E2 Phrase Continuation Eval.
//
// Loads all paired records under datasets/jam-actions-v0/records/, runs
// runFullE2Eval, writes machine output + human report, checks hard gates.
//
// Usage:
//   tsx scripts/eval-jam-actions-phrase-continuation.ts
//
// Output:
//   datasets/jam-actions-v0/evals/e2-phrase-continuation-results.json  — machine output
//   docs/jam-actions-v0-slice6-e2-eval.md                              — human report
//
// Hard gates (exit 1 if any fail):
//   1. Paired integrity check: 22 pairs, 0 orphans.
//   2. Rhythm diverges from shuffled on ≥3 pairs (clear ordering signal).
//   3. Groove diverges from shuffled on ≥3 pairs (canonical metric has teeth).
//   4. All not_computable results have explicit, non-empty reason strings.
//
// Locked future-model target (documented only — not a gate for Slice 6):
//   Groove OA (model vs gold) must beat shuffled baseline by ≥0.15.
//   See hardGates.grooveOAMeanDelta for the shuffled control reference value.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runFullE2Eval,
  isNotComputable,
  BEAT_MARGIN,
  FUTURE_MODEL_GROOVE_MARGIN,
  type E2EvalRun,
  type PairRecord,
  type MetricAggregate,
} from "../src/dataset/eval/phrase-continuation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// ─── Load records ─────────────────────────────────────────────────────────────

const RECORDS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0", "records");

function loadAllRecords(): PairRecord[] {
  const files = readdirSync(RECORDS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  return files.map((f) => {
    return JSON.parse(readFileSync(join(RECORDS_DIR, f), "utf8")) as PairRecord;
  });
}

// ─── Human report builder ─────────────────────────────────────────────────────

function fmtMetric(v: number | { not_computable: true; reason: string }): string {
  if (typeof v === "object" && v.not_computable) {
    return "N/C";
  }
  return (v as number).toFixed(3);
}

function fmtAggregate(agg: MetricAggregate): string {
  if (agg.mean === null) return "N/C (all pairs not computable)";
  return `mean=${agg.mean.toFixed(3)} min=${agg.min!.toFixed(3)} max=${agg.max!.toFixed(3)} (${agg.computablePairCount}/${agg.computablePairCount + agg.notComputablePairCount} pairs)`;
}

function buildReport(run: E2EvalRun, evalDate: string): string {
  const { integrityCheck, aggregate, hardGates } = run;

  // Per-pair table
  const pairRows = (run.pairResults as Array<{
    promptId: string;
    targetId: string;
    songId: string;
    timeSignature: string;
    targetMeasureRange: string;
    targetEventCount: number;
    targetBarCount: number;
    shuffleStatus: { computable: boolean; reason?: string };
    metrics: {
      noteOverlap_goldVsGold: number | { not_computable: true; reason: string };
      noteOverlap_goldVsShuffled: number | { not_computable: true; reason: string };
      pitchClassOA_goldVsShuffled: number | { not_computable: true; reason: string };
      rhythmSimilarity_goldVsShuffled: number | { not_computable: true; reason: string };
      grooveSimilarity_goldVsShuffled: number | { not_computable: true; reason: string };
    };
  }>)
    .map((r) => {
      const song = r.songId.replace(/-/g, "‑"); // non-breaking hyphens for markdown
      const shuffle = r.shuffleStatus.computable ? "ok" : "N/C";
      return (
        `| \`${song}\` | ${r.timeSignature} | ${r.targetMeasureRange} | ${r.targetEventCount} | ${r.targetBarCount} | ${shuffle} ` +
        `| ${fmtMetric(r.metrics.noteOverlap_goldVsGold)} ` +
        `| ${fmtMetric(r.metrics.noteOverlap_goldVsShuffled)} ` +
        `| ${fmtMetric(r.metrics.pitchClassOA_goldVsShuffled)} ` +
        `| ${fmtMetric(r.metrics.rhythmSimilarity_goldVsShuffled)} ` +
        `| ${fmtMetric(r.metrics.grooveSimilarity_goldVsShuffled)} |`
      );
    })
    .join("\n");

  // Integrity summary
  const intStatus = integrityCheck.passed ? "PASS" : "FAIL";

  // Gate summaries
  const rhythmGate = hardGates.rhythmGoldBeatShuffledPairCount >= 3 ? "PASS" : "FAIL";
  const grooveGate = hardGates.grooveGoldBeatShuffledPairCount >= 3 ? "PASS" : "FAIL";

  // not_computable audit table
  const ncRows =
    hardGates.notComputableAudit.length === 0
      ? "_None — all pairs computable on all metrics._\n"
      : hardGates.notComputableAudit
          .map((e) => `| \`${e.pairId.split(":")[0]}\` | \`${e.metric}\` | ${e.reason} |`)
          .join("\n") + "\n";

  // Aggregate metric table
  const aggTable = [
    `| note_overlap_gold_vs_gold | ${fmtAggregate(aggregate.noteOverlap_goldVsGold)} | sanity — should be 1.0 |`,
    `| note_overlap_gold_vs_shuffled | ${fmtAggregate(aggregate.noteOverlap_goldVsShuffled)} | note set (weakly order-sensitive) |`,
    `| pitch_class_oa_gold_vs_shuffled | ${fmtAggregate(aggregate.pitchClassOA_goldVsShuffled)} | sanity — should be ≈ 1.0 (same notes) |`,
    `| rhythm_gold_vs_shuffled | ${fmtAggregate(aggregate.rhythmSimilarity_goldVsShuffled)} | onset grid cosine — should diverge |`,
    `| groove_gold_vs_shuffled | ${fmtAggregate(aggregate.grooveSimilarity_goldVsShuffled)} | phrase-level OA — canonical metric |`,
  ].join("\n");

  // Groove OA margin reference
  const grooveMarginRef =
    hardGates.grooveOAMeanDelta !== null
      ? `${hardGates.grooveOAMeanDelta.toFixed(3)}`
      : "N/C";

  return `# jam-actions-v0 Slice 6 — E2 Phrase Continuation Eval

**Eval date:** ${evalDate}
**Schema version:** \`e2-phrase-continuation/1.0.0\`
**Harness:** \`src/dataset/eval/phrase-continuation.ts\`
**Corpus:** 22 prompt/continuation_target pairs, 1 standalone (Für Elise mm. 1-8)

---

## Hard gates

| Gate | Value | Result |
|------|-------|--------|
| Paired integrity (22 pairs, 0 orphans) | ${integrityCheck.pairCount} pairs, ${integrityCheck.orphanCount} orphans | **${intStatus}** |
| Rhythm diverges from shuffled on ≥3 pairs | ${hardGates.rhythmGoldBeatShuffledPairCount}/22 pairs diverge (cos < ${(1.0 - BEAT_MARGIN).toFixed(2)}) | **${rhythmGate}** |
| Groove diverges from shuffled on ≥3 pairs | ${hardGates.grooveGoldBeatShuffledPairCount}/22 pairs diverge (OA < ${(1.0 - BEAT_MARGIN).toFixed(2)}) | **${grooveGate}** |

**Locked future-model target (deferred — for documentation only):**
Groove OA (model output vs gold) must beat the shuffled-baseline groove OA by ≥${FUTURE_MODEL_GROOVE_MARGIN}.
The shuffled-baseline mean groove OA = **${aggregate.grooveSimilarity_goldVsShuffled.mean?.toFixed(3) ?? "N/C"}**, so
the model's groove OA must exceed **${aggregate.grooveSimilarity_goldVsShuffled.mean !== null ? (aggregate.grooveSimilarity_goldVsShuffled.mean + FUTURE_MODEL_GROOVE_MARGIN).toFixed(3) : "N/C"}**.
Equivalently, the groove distance from gold is **${grooveMarginRef}**; a model's output groove must land within **(1.0 − ${grooveMarginRef} − ${FUTURE_MODEL_GROOVE_MARGIN} = ${aggregate.grooveSimilarity_goldVsShuffled.mean !== null ? (1.0 - hardGates.grooveOAMeanDelta! - FUTURE_MODEL_GROOVE_MARGIN).toFixed(3) : "N/C"})** of gold.

---

## Aggregate metrics

| Metric | Aggregate | Notes |
|--------|-----------|-------|
${aggTable}

**Interpretation:**
- \`note_overlap_gold_vs_gold\` = 1.0 on all pairs (sanity check — comparing gold to itself).
- \`pitch_class_oa_gold_vs_shuffled\` ≈ 1.0 (shuffling bars preserves note content, confirming the shuffler is correct).
- \`rhythm_similarity_gold_vs_shuffled\` diverges on **${hardGates.rhythmGoldBeatShuffledPairCount}** pairs — onset grid ordering is destroyed by shuffling.
- \`groove_similarity_gold_vs_shuffled\` diverges on **${hardGates.grooveGoldBeatShuffledPairCount}** pairs — phrase-level groove is disrupted when bar order changes.

---

## Per-pair results

| Song | Time sig | Target window | Events | Bars | Shuffle | note_GvG | note_GvS | pitch_OA | rhythm_GvS | groove_GvS |
|------|----------|--------------|--------|------|---------|----------|----------|----------|------------|------------|
${pairRows}

**Column key:**
- \`note_GvG\`: Note overlap (Jaccard), gold vs gold — sanity (always 1.0)
- \`note_GvS\`: Note overlap (Jaccard), gold vs shuffled — weak (shuffling bars usually preserves note-grid tuples)
- \`pitch_OA\`: Pitch-class histogram OA, gold vs shuffled — sanity baseline (≈ 1.0 expected)
- \`rhythm_GvS\`: Onset-grid cosine similarity, gold vs shuffled — diverges where bars have different beat patterns
- \`groove_GvS\`: Phrase-level groove OA, gold vs shuffled — canonical metric (lower = more different from gold)
- \`N/C\`: not_computable

---

## not_computable audit

${hardGates.notComputableAudit.length > 0 ? `| Pair | Metric | Reason |\n|------|--------|--------|\n` : ""}${ncRows}
---

## Methodology

### Shuffled-bars negative control

For each continuation_target record C, the shuffled-bars control is generated by:
1. Grouping C's MIDI events by measure number.
2. Shuffling the group order using a deterministic LCG seeded on (numBars × 1000 + numEvents).
3. Reassigning events from shuffled groups to the original measure slots (preserving beat positions within each bar).

This preserves note CONTENT (same pitches, same within-bar positions) but destroys note ORDER (which bar comes first changes the phrase-level timing structure).

### Metric 1 — Note overlap (Jaccard)

Converts events to (pitch, barIndex, beatGridSlot) tuples. Computes Jaccard similarity between gold and reference sets. **Weakly order-sensitive** because bar shuffling can change barIndex values.

Note: for many pairs the note_GvS metric is close to 1.0 even after shuffling, because pitches that repeat across bars hash to the same set. This is expected — the metric is designed for model-output comparison (future slices), not for the shuffled-control distinction test. Rhythm and groove carry the ordering signal.

### Metric 2 — Pitch-class histogram OA

12-bin histogram over MIDI pitch classes (C=0 through B=11), normalized to sum 1. OA = sum of min(p_i, q_i) over all bins. Designed as a **sanity baseline** — gold vs shuffled should both score ≈ 1.0 since shuffling preserves note content. Confirms the shuffler didn't alter pitches.

### Metric 3 — Rhythm / onset-grid cosine similarity

Builds a binary onset-presence vector over the sixteenth-note grid for the full phrase. Each bar's events are placed at absolute phrase positions (barIndex × slotsPerBar + beatSlot). Cosine similarity between gold and shuffled vectors. **Diverges when bars have different rhythmic patterns** (shuffling changes which absolute phrase slots are occupied).

### Metric 4 — Groove similarity (canonical metric)

Builds a phrase-level groove histogram: onset count at each absolute phrase-grid position, normalized to sum 1. OA between gold and shuffled histograms. **Lower OA = more different** (shuffling changes which phrase positions are dense vs sparse). This is the metric the future-model target is locked to.

**Locked future-model target (synthesis Section 4 E2):**
When a model generates a continuation, its groove OA vs the gold must beat the shuffled-baseline groove OA by ≥${FUTURE_MODEL_GROOVE_MARGIN}. The shuffled baseline represents the lower bound a random bar-ordering achieves.

---

## Open questions

1. **Bach prelude pairs show grooveOA = 1.0 vs shuffled.** This is because Bach Prelude in C Major uses an identical arpeggiated pattern (C–E–G–C–G–C–E–C–E–G–C) across every bar. Shuffling identical bars is a no-op on the groove histogram. This is a valid corpus finding: the Bach prelude lacks bar-to-bar groove variation. Not a harness bug.

2. **Note overlap (Jaccard) gold-vs-shuffled is close to 1.0 for most pairs.** By design — the metric is intended for model-output comparison where the model may predict different pitches. For shuffled-bars control (same notes), it only diverges when bar-index changes the key. This metric is weak for the control; rhythm/groove carry the ordering signal.

3. **Future model gate verification.** This slice validates the harness; the ≥0.15 groove OA margin gate will be applied when a model's continuation outputs are evaluated in a subsequent slice.

4. **Held-out test set (clair-de-lune).** The two clair-de-lune pairs are included in this eval (they are included in splits.json:test). Their pair structure is valid and integrity checks pass. A future model evaluation should separate train/test results.

---

## Harness readiness

Slice 6 establishes that the E2 eval harness is grounded and has teeth:
- Paired integrity: **${integrityCheck.pairCount} pairs, ${integrityCheck.orphanCount} orphans** (**${intStatus}**)
- Rhythm signal: **${hardGates.rhythmGoldBeatShuffledPairCount}/22** pairs where shuffling changes the onset grid (**${rhythmGate}**)
- Groove signal: **${hardGates.grooveGoldBeatShuffledPairCount}/22** pairs where shuffling changes the phrase-level groove (**${grooveGate}**)
- not_computable results: **${hardGates.notComputableAudit.length}** total (all with explicit reasons)

Slice 7 (E3 Annotation Grounding Eval) can proceed.
`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log("E2 Phrase Continuation Eval — jam-actions-v0");
  console.log("=".repeat(50));

  // Load records
  const records = loadAllRecords();
  console.log(`Records loaded: ${records.length}`);

  const prompts = records.filter((r) => r.scope.window_role === "prompt");
  const targets = records.filter(
    (r) => r.scope.window_role === "continuation_target",
  );
  const standalone = records.filter(
    (r) => !r.scope.window_role || r.scope.window_role === "standalone",
  );
  console.log(
    `  Prompts: ${prompts.length}  Targets: ${targets.length}  Standalone: ${standalone.length}`,
  );

  // Run eval
  console.log("\nRunning E2 eval...");
  const run = runFullE2Eval(records, 22);

  // Print integrity check
  console.log("\n--- Integrity check ---");
  console.log(
    `  Pairs: ${run.integrityCheck.pairCount} (expected 22) — ${run.integrityCheck.passed ? "PASS" : "FAIL"}`,
  );
  console.log(`  Orphans: ${run.integrityCheck.orphanCount}`);
  if (!run.integrityCheck.passed) {
    console.error(`  Details: ${run.integrityCheck.details}`);
  }

  // Print aggregate results
  console.log("\n--- Aggregate metrics ---");
  const { aggregate } = run;
  console.log(`  note_overlap_gold_vs_gold:       ${aggregate.noteOverlap_goldVsGold.mean?.toFixed(3) ?? "N/C"} mean (${aggregate.noteOverlap_goldVsGold.computablePairCount} pairs)`);
  console.log(`  note_overlap_gold_vs_shuffled:   ${aggregate.noteOverlap_goldVsShuffled.mean?.toFixed(3) ?? "N/C"} mean`);
  console.log(`  pitch_class_oa_gold_vs_shuffled: ${aggregate.pitchClassOA_goldVsShuffled.mean?.toFixed(3) ?? "N/C"} mean (sanity baseline — expect ≈ 1.0)`);
  console.log(`  rhythm_gold_vs_shuffled:         ${aggregate.rhythmSimilarity_goldVsShuffled.mean?.toFixed(3) ?? "N/C"} mean`);
  console.log(`  groove_gold_vs_shuffled:         ${aggregate.grooveSimilarity_goldVsShuffled.mean?.toFixed(3) ?? "N/C"} mean (canonical metric)`);

  // Print hard gate results
  console.log("\n--- Hard gates ---");
  const rhythmGate = run.hardGates.rhythmGoldBeatShuffledPairCount >= 3;
  const grooveGate = run.hardGates.grooveGoldBeatShuffledPairCount >= 3;
  console.log(
    `  Integrity passed:         ${run.hardGates.integrityPassed ? "PASS" : "FAIL"}`,
  );
  console.log(
    `  Rhythm diverges on ≥3:   ${rhythmGate ? "PASS" : "FAIL"} (${run.hardGates.rhythmGoldBeatShuffledPairCount}/22 pairs)`,
  );
  console.log(
    `  Groove diverges on ≥3:   ${grooveGate ? "PASS" : "FAIL"} (${run.hardGates.grooveGoldBeatShuffledPairCount}/22 pairs)`,
  );
  console.log(
    `  not_computable count:     ${run.hardGates.notComputableAudit.length} (all have explicit reasons)`,
  );

  // Locked future-model target reference
  console.log("\n--- Locked future-model target (deferred) ---");
  console.log(
    `  Shuffled groove OA mean:  ${aggregate.grooveSimilarity_goldVsShuffled.mean?.toFixed(3) ?? "N/C"}`,
  );
  console.log(
    `  Required model margin:    ≥${FUTURE_MODEL_GROOVE_MARGIN} (from synthesis Section 4 E2 lock)`,
  );
  const targetGroove =
    aggregate.grooveSimilarity_goldVsShuffled.mean !== null
      ? (aggregate.grooveSimilarity_goldVsShuffled.mean + FUTURE_MODEL_GROOVE_MARGIN).toFixed(3)
      : "N/C";
  console.log(`  Model's groove OA target: ≥${targetGroove} vs gold`);

  // Check hard gates
  let hardGateFailed = false;

  if (!run.hardGates.integrityPassed) {
    console.error("\nHARD GATE FAILURE: paired integrity check failed");
    console.error(`  ${run.integrityCheck.details}`);
    hardGateFailed = true;
  }

  if (!rhythmGate) {
    console.error(
      `\nHARD GATE FAILURE: rhythm metric diverges on only ${run.hardGates.rhythmGoldBeatShuffledPairCount}/22 pairs (need ≥3)`,
    );
    console.error(
      "  This suggests the harness is not detecting ordering signal in the corpus.",
    );
    hardGateFailed = true;
  }

  if (!grooveGate) {
    console.error(
      `\nHARD GATE FAILURE: groove metric diverges on only ${run.hardGates.grooveGoldBeatShuffledPairCount}/22 pairs (need ≥3)`,
    );
    console.error(
      "  This suggests the groove metric is not sensitive to bar ordering.",
    );
    hardGateFailed = true;
  }

  // Verify all not_computable entries have reasons
  const emptyReasons = run.hardGates.notComputableAudit.filter(
    (e) => !e.reason || e.reason.trim().length === 0,
  );
  if (emptyReasons.length > 0) {
    console.error(
      `\nHARD GATE FAILURE: ${emptyReasons.length} not_computable entries have empty reason strings`,
    );
    hardGateFailed = true;
  }

  if (hardGateFailed) {
    console.error("\nE2 eval harness has failures. See above.");
    process.exit(1);
  }

  // Write machine output
  const EVALS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0", "evals");
  mkdirSync(EVALS_DIR, { recursive: true });
  const machineOutputPath = join(EVALS_DIR, "e2-phrase-continuation-results.json");
  writeFileSync(machineOutputPath, JSON.stringify(run, null, 2), "utf8");
  console.log(`\nMachine output: ${machineOutputPath}`);

  // Write human report
  const DOCS_DIR = join(REPO_ROOT, "docs");
  mkdirSync(DOCS_DIR, { recursive: true });
  const reportPath = join(DOCS_DIR, "jam-actions-v0-slice6-e2-eval.md");
  const evalDate = run.evalDate.slice(0, 10);
  writeFileSync(reportPath, buildReport(run, evalDate), "utf8");
  console.log(`Human report:   ${reportPath}`);

  console.log("\nSlice 6 E2 eval PASSED. Harness is grounded. Ready for Slice 7.");
}

main();
