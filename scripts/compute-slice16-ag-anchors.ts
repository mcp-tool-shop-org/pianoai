#!/usr/bin/env tsx
// ─── Slice 16: AG anchor computation helper (read-only) ──────────────────────
//
// Computes the annotation_grounding anchor pitch for each of the 3 cohort
// records, plus the rhythm_onset gold count and pitch_class_count gold value
// (the load-bearing MCQ facts), so the enrichment author can respect R6.
//
// This script is read-only — no record / overlay / package modifications.
// Pure analysis output to stdout.
//
// Usage:
//   pnpm exec tsx scripts/compute-slice16-ag-anchors.ts
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  generatePitchClassCountQuestion,
  generateRhythmOnsetQuestion,
  generateAnnotationGroundingQuestion,
  generateHandRegisterQuestion,
  type E3Record,
  isNotComputable,
} from "../src/dataset/eval/annotation-grounding.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const RECORDS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0", "records");

const COHORT_FILES: Array<{ id: string; file: string }> = [
  {
    id: "pathetique-mvt2:m001-004:piano:mcp-session:v1",
    file: "pathetique-mvt2-m001-004.json",
  },
  {
    id: "schumann-traumerei:m001-004:piano:mcp-session:v1",
    file: "schumann-traumerei-m001-004.json",
  },
  {
    id: "chopin-nocturne-op9-no2:m009-012:piano:mcp-session:v1",
    file: "chopin-nocturne-op9-no2-m009-012.json",
  },
];

console.log("=".repeat(78));
console.log(" Slice 16 — Cohort AG anchor + MCQ gold computation");
console.log("=".repeat(78));

for (const c of COHORT_FILES) {
  const raw = JSON.parse(readFileSync(join(RECORDS_DIR, c.file), "utf8")) as E3Record;
  const events = raw.observation.midi_sidecar.timed_events;
  const rhEvents = events.filter((e) => e.hand === "right");
  const lhEvents = events.filter((e) => e.hand === "left");
  console.log();
  console.log("─".repeat(78));
  console.log(` Record: ${c.id}`);
  console.log(`   total events: ${events.length}  RH: ${rhEvents.length}  LH: ${lhEvents.length}`);
  console.log(`   measure range: ${raw.annotation_target.measure_range.join("-")}`);
  console.log(`   density: ${(events.length / (raw.annotation_target.measure_range[1] - raw.annotation_target.measure_range[0] + 1)).toFixed(2)} events/bar`);

  // E3 generators
  const pc = generatePitchClassCountQuestion(raw);
  const ro = generateRhythmOnsetQuestion(raw);
  const hr = generateHandRegisterQuestion(raw);
  const ag = generateAnnotationGroundingQuestion(raw);

  console.log();
  console.log(`  PITCH_CLASS_COUNT MCQ:`);
  if (isNotComputable(pc)) {
    console.log(`    NOT_COMPUTABLE: ${pc.reason}`);
  } else {
    console.log(`    question: ${pc.questionText}`);
    console.log(`    options: ${JSON.stringify(pc.options)}`);
    console.log(`    correctIndex: ${pc.correctOptionIndex}  gold: ${pc.goldValue}`);
  }

  console.log();
  console.log(`  RHYTHM_ONSET MCQ:`);
  if (isNotComputable(ro)) {
    console.log(`    NOT_COMPUTABLE: ${ro.reason}`);
  } else {
    console.log(`    question: ${ro.questionText}`);
    console.log(`    options: ${JSON.stringify(ro.options)}`);
    console.log(`    correctIndex: ${ro.correctOptionIndex}  gold: ${ro.goldValue}`);
  }

  console.log();
  console.log(`  HAND_REGISTER MCQ:`);
  if (isNotComputable(hr)) {
    console.log(`    NOT_COMPUTABLE: ${hr.reason}`);
  } else {
    console.log(`    question: ${hr.questionText}`);
    console.log(`    options: ${JSON.stringify(hr.options)}`);
    console.log(`    correctIndex: ${hr.correctOptionIndex}  gold: ${hr.goldValue}`);
  }

  console.log();
  console.log(`  ANNOTATION_GROUNDING MCQ (R6 anchor):`);
  if (isNotComputable(ag)) {
    console.log(`    NOT_COMPUTABLE: ${ag.reason}`);
  } else {
    console.log(`    question: ${ag.questionText}`);
    console.log(`    options: ${JSON.stringify(ag.options)}`);
    console.log(`    correctIndex: ${ag.correctOptionIndex}  gold: ${ag.goldValue}`);
    if (ag.midiClaim) {
      const mc = ag.midiClaim;
      console.log(`    anchor: ${ag.goldValue} (midi=${mc.note}) ${mc.hand} hand m.${mc.measure} beat=${mc.beat.toFixed(4)}`);
      // ±3-semitone neighbor range
      const neighbors: number[] = [];
      for (let off = -3; off <= 3; off++) {
        if (off === 0) continue;
        neighbors.push(mc.note + off);
      }
      const noteName = (n: number): string => {
        const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        return `${names[n % 12]}${Math.floor(n / 12) - 1}`;
      };
      console.log(`    ±3-semitone neighbors (R6 avoid in ${mc.hand} hand m.${mc.measure}): ${neighbors.map(noteName).join(", ")}`);
    }
  }
}

console.log();
console.log("─".repeat(78));
console.log(" Done.");
