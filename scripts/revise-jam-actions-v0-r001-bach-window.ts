#!/usr/bin/env tsx
// ─── jam-actions-v0 revision r001 — Bach m061-064 window fix ─────────────────
//
// WHAT: retargets the working-set record
//   bach-prelude-c-major-bwv846:m061-064:piano:mcp-session:v1
// to its true window, mm. 61-62, producing
//   bach-prelude-c-major-bwv846:m061-062:piano:mcp-session:v1
// and updates the paired prompt record + splits.json to match.
//
// WHY: the source MIDI (piano-midi.de bach_846: prelude mm. 1-35 + fugue
// mm. 36-62) is exactly 62 measures. The Slice-9b song spec assumed "~70
// measures" and authored a final pair at mm. 61-64; the phrase slicer is
// silent on out-of-range windows, so the record shipped with a sidecar that
// only ever contained bars 61-62 while its labels and frozen tool calls
// claimed 61-64. The live MCP server correctly rejects
// play_song(endMeasure: 64) — "Valid range: 1-62". Found by the
// finetune-arc-v1 execution-verification gate (G6a,
// experiments/finetune-arc-v1/data/P1v1-gate-report.json); disposition
// recorded ex-ante in experiments/finetune-arc-v1/P0-LOCK.md amendment
// A1-v1; decision + full rationale in
// docs/jam-actions-v0-erratum-001-bach-m061-064.md.
//
// SCOPE GUARANTEE: writes ONLY under datasets/jam-actions-v0/ (the living
// working set). The sealed published package datasets/jam-actions-v0-public/
// (v0.4.3, Zenodo DOI 10.5281/zenodo.20279919) is never touched — this
// script asserts the sealed records.jsonl sha256 before and after running.
// The corrected records ship with the NEXT public package cut.
//
// Standards compliance (six standards, 0-3):
//   PIN_PER_STEP        2 — inputs pinned by sha256 (sealed records.jsonl +
//                           source MIDI vs the record's own sidecar sha);
//                           zero-LLM, no Date.now/Math.random; receipt emits
//                           before/after shas for every written file.
//   ANDON_AUTHORITY     2 — every invariant is a hard exit-1 assert (REMI
//                           byte-identity, ABC body identity, event counts,
//                           schema + trace validation, sealed-tree shas).
//   NAMED_COMPENSATORS  2 — no irreversible action. Compensator: `git
//                           revert` of the commit that carries this change;
//                           the receipt's `before` shas identify the exact
//                           prior bytes. Owner: advisor session.
//   DECOMPOSE_BY_SECRETS 2 — touches only the dataset working set + emits a
//                           receipt beside it; server, experiments, and the
//                           sealed package are read-only here.
//   UNCERTAINTY_GATED_HUMANS 2 — the revision itself was director-scoped via
//                           the A1-v1 backlog disposition; the next PUBLIC
//                           cut (version bump + Zenodo publish) remains
//                           operator-gated and is NOT performed here.
//   EXTERNAL_VERIFIER   2 — the corrected tool calls are re-executed against
//                           the real MCP server by the companion check
//                           (scripts/ — see erratum §Verification), not by
//                           this generator; schema/trace validators are the
//                           repo's own, not this script's logic.
//
// Usage:
//   pnpm exec tsx scripts/revise-jam-actions-v0-r001-bach-window.ts
//
// Idempotent: re-running after success verifies the applied state and exits 0.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderPianoRoll } from "../src/piano-roll.js";
import { midiToSongEntry } from "../src/songs/midi/ingest.js";
import { SongConfigSchema } from "../src/songs/config/schema.js";
import { slicePhrase } from "../src/dataset/phrase-slicer.js";
import { toRemi } from "../src/dataset/remi-adapter.js";
import { toAbc } from "../src/dataset/abc-adapter.js";
import { makeRecordSchema } from "../src/dataset/schema.js";
import { loadToolSchemaCatalog, validateTrace } from "../src/dataset/trace-validator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DATASET_ROOT = join(REPO_ROOT, "datasets/jam-actions-v0");
const RECORDS_DIR = join(DATASET_ROOT, "records");
const PIANOROLL_DIR = join(DATASET_ROOT, "pianoroll");
const REVISION_DIR = join(DATASET_ROOT, "revisions/r001-bach-m061-window");
const PUBLIC_RECORDS_JSONL = join(REPO_ROOT, "datasets/jam-actions-v0-public/records.jsonl");

const SONG_ID = "bach-prelude-c-major-bwv846";
const OLD_ID = `${SONG_ID}:m061-064:piano:mcp-session:v1`;
const NEW_ID = `${SONG_ID}:m061-062:piano:mcp-session:v1`;
const OLD_RECORD = join(RECORDS_DIR, `${SONG_ID}-m061-064.json`);
const NEW_RECORD = join(RECORDS_DIR, `${SONG_ID}-m061-062.json`);
const OLD_SVG = join(PIANOROLL_DIR, `${SONG_ID}-m061-064.svg`);
const NEW_SVG = join(PIANOROLL_DIR, `${SONG_ID}-m061-062.svg`);
const PROMPT_RECORD = join(RECORDS_DIR, `${SONG_ID}-m057-060.json`);
const SPLITS = join(DATASET_ROOT, "splits.json");
const MIDI_PATH = join(REPO_ROOT, "songs/library/classical", `${SONG_ID}.mid`);
const SONG_JSON_PATH = join(REPO_ROOT, "songs/library/classical", `${SONG_ID}.json`);

const START = 61;
const END = 62;
const REVISION_DATE = "2026-07-11";

// The sealed published package this revision must NOT touch (v0.4.3 pin, also
// pinned by experiments/finetune-arc-v1/data/P1v1-gate-report.json).
const SEALED_PUBLIC_RECORDS_SHA =
  "72ce6e69d29e198dc94d66d5eeb55d5e0456b859282c872caf86b7b161c8120f";

// Corrected spec strings — byte-identical to SONG_SPECS pair 8 in
// scripts/build-jam-actions-corpus.ts so a from-scratch rebuild reproduces
// this record exactly.
const CONT_USER_PROMPT = "Play measures 61–62 and describe the final cadential arrival.";
const CONT_ANALYSIS =
  "Measures 61–62 complete the prelude with the final tonic C arrival — the last arpeggios settle onto the home key. The entire harmonic journey resolves peacefully. Let me loop mm. 61–62.";
const CONT_SUMMARY =
  "Bach C Major Prelude mm. 61–62: final tonic C arrival, conclusion of the harmonic journey. Continuation from mm. 57–60.";
const KEY_MOMENTS = ["m61 tonic C return", "m62 final tonic arrival — conclusion of harmonic journey"];
const TEACHING_NOTES = [
  {
    measure: 62,
    note: "The journey from C major through all those chord cycles returns to C major. Complete.",
    technique: ["slight diminuendo on the final measures", "let the last arpeggio ring naturally"],
  },
];

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function fail(msg: string): never {
  console.error(`\nREVISION r001 FAILED: ${msg}`);
  process.exit(1);
}

function assertSealedTreeUntouched(when: string): void {
  const actual = sha256(readFileSync(PUBLIC_RECORDS_JSONL));
  if (actual !== SEALED_PUBLIC_RECORDS_SHA) {
    fail(
      `${when}: sealed datasets/jam-actions-v0-public/records.jsonl sha256 is ${actual}, ` +
        `expected ${SEALED_PUBLIC_RECORDS_SHA}. The sealed package must never change — investigate before rerunning.`,
    );
  }
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

console.log("jam-actions-v0 revision r001 — Bach m061-064 → m061-062 window fix");
assertSealedTreeUntouched("pre-flight");

// ─── Idempotency: already applied? ───────────────────────────────────────────
if (!existsSync(OLD_RECORD) && existsSync(NEW_RECORD)) {
  const rec = JSON.parse(readFileSync(NEW_RECORD, "utf8"));
  if (rec.id !== NEW_ID) fail(`applied-state check: ${NEW_RECORD} has id ${rec.id}, expected ${NEW_ID}`);
  const prompt = JSON.parse(readFileSync(PROMPT_RECORD, "utf8"));
  const ctw = prompt.scope?.continuation_target_window;
  if (!Array.isArray(ctw) || ctw[0] !== START || ctw[1] !== END) {
    fail(`applied-state check: prompt record continuation_target_window is ${JSON.stringify(ctw)}`);
  }
  assertSealedTreeUntouched("applied-state check");
  console.log("Already applied — verified applied state. Nothing to do.");
  process.exit(0);
}
if (!existsSync(OLD_RECORD)) fail(`${OLD_RECORD} not found and applied state not detected.`);

// ─── Load inputs ─────────────────────────────────────────────────────────────
const oldRecordRaw = readFileSync(OLD_RECORD, "utf8");
const record = JSON.parse(oldRecordRaw);
if (record.id !== OLD_ID) fail(`old record id is ${record.id}, expected ${OLD_ID}`);

const promptRaw = readFileSync(PROMPT_RECORD, "utf8");
const promptRecord = JSON.parse(promptRaw);
const splitsRaw = readFileSync(SPLITS, "utf8");
const splits = JSON.parse(splitsRaw);
const oldSvgRaw = existsSync(OLD_SVG) ? readFileSync(OLD_SVG, "utf8") : null;

const midiBuffer = readFileSync(MIDI_PATH);
if (sha256(midiBuffer) !== record.observation.midi_sidecar.midi_sha256) {
  fail(
    `source MIDI sha256 ${sha256(midiBuffer)} does not match the record's sidecar pin ` +
      `${record.observation.midi_sidecar.midi_sha256} — the library MIDI changed since the record was built.`,
  );
}

// ─── Ground-truth assertions on the existing record ──────────────────────────
const events = record.observation.midi_sidecar.timed_events as Array<{ measure: number; hand: string }>;
const measuresPresent = [...new Set(events.map((e) => e.measure))].sort((a, b) => a - b);
if (JSON.stringify(measuresPresent) !== JSON.stringify([61, 62])) {
  fail(`sidecar measures are ${JSON.stringify(measuresPresent)}, expected exactly [61, 62]`);
}

const songConfig = SongConfigSchema.parse(JSON.parse(readFileSync(SONG_JSON_PATH, "utf8")));
const songEntry = midiToSongEntry(new Uint8Array(midiBuffer), songConfig);
if (songEntry.measures.length !== 62) {
  fail(`ingested song has ${songEntry.measures.length} measures, expected 62`);
}

// ─── Regenerate derived content for the corrected window ────────────────────
const slice = slicePhrase(events as never, { start_measure: START, end_measure: END });
if (slice.events.length !== events.length) {
  fail(`slice to mm. ${START}-${END} dropped events: ${slice.events.length} vs ${events.length} — content was expected to be untouched`);
}

const newRemi = toRemi(slice.events, slice.meta, {
  timeSignature: record.scope.time_signature,
  ticksPerBeat: record.observation.midi_sidecar.ticks_per_beat,
});
if (JSON.stringify(newRemi) !== JSON.stringify(record.observation.tokens_remi)) {
  fail("regenerated REMI differs from the record's tokens_remi — expected byte-identical (bars 61-62 only)");
}

const oldAbc: string = record.observation.tokens_abc;
const newAbc = toAbc(slice.events, slice.meta, {
  key: record.scope.key,
  timeSignature: record.scope.time_signature,
  tempoBpm: record.scope.tempo_bpm,
  title: record.provenance.composition_title,
});
const stripTitle = (abc: string) => abc.split("\n").filter((l) => !l.startsWith("T:")).join("\n");
if (stripTitle(newAbc) !== stripTitle(oldAbc)) {
  fail("regenerated ABC body differs from the record's tokens_abc beyond the title line");
}
if (!newAbc.includes("(mm. 61–62)")) fail("regenerated ABC title does not carry the corrected window");

const newSvg = renderPianoRoll(songEntry, { startMeasure: START, endMeasure: END, colorMode: "hand" });

const rhCount = slice.events.filter((e) => e.hand === "right").length;
const lhCount = slice.events.filter((e) => e.hand === "left").length;
const oldTurn3 = record.target_trace.session[2];
if (oldTurn3.content.rh_notes !== rhCount || oldTurn3.content.lh_notes !== lhCount) {
  fail(
    `hand counts changed: record has rh=${oldTurn3.content.rh_notes}/lh=${oldTurn3.content.lh_notes}, ` +
      `recomputed rh=${rhCount}/lh=${lhCount}`,
  );
}

// ─── Apply the corrected fields ──────────────────────────────────────────────
record.id = NEW_ID;
record.scope.phrase_window = `measures ${START}-${END}`;
record.observation.tokens_abc = newAbc;
record.observation.piano_roll_svg_path = `pianoroll/${SONG_ID}-m061-062.svg`;
record.observation.piano_roll_svg_inline = newSvg;
record.annotation_target.measure_range = [START, END];
record.annotation_target.key_moments = KEY_MOMENTS;
record.annotation_target.teaching_notes = TEACHING_NOTES;

const trace = record.target_trace;
trace.objective = `Read mm. ${START}–${END} of ${record.provenance.composition_title} (continuation of mm. 57–60), analyze the musical continuation, play in a loop.`;
trace.session[0].content = CONT_USER_PROMPT;
trace.session[1].content = `Let me view the piano roll for mm. ${START}–${END}.`;
trace.session[1].tool_calls[0].arguments = { songId: SONG_ID, startMeasure: START, endMeasure: END };
trace.session[2].content = {
  svg_returned: true,
  measures: END - START + 1,
  rh_notes: rhCount,
  lh_notes: lhCount,
};
trace.session[3].content = CONT_ANALYSIS;
trace.session[3].tool_calls[0].arguments = { id: SONG_ID, startMeasure: START, endMeasure: END, mode: "loop" };
trace.session[5].content = CONT_SUMMARY;

// Paired prompt record: window pointer + eligibility reason reference the cont id.
promptRecord.scope.continuation_target_window = [START, END];
promptRecord.eval_metadata.phrase_continuation_eligible_reason =
  promptRecord.eval_metadata.phrase_continuation_eligible_reason.split(OLD_ID).join(NEW_ID);
if (!promptRecord.eval_metadata.phrase_continuation_eligible_reason.includes(NEW_ID)) {
  fail("prompt record eligibility reason did not reference the continuation record id as expected");
}
if (JSON.stringify(promptRecord).includes(OLD_ID)) fail("prompt record still references the old id");

// splits.json: replace the id in place.
const splitIdx = (splits.train as string[]).indexOf(OLD_ID);
if (splitIdx === -1) fail(`splits.json train[] does not contain ${OLD_ID}`);
splits.train[splitIdx] = NEW_ID;
if (JSON.stringify(splits).includes(OLD_ID)) fail("splits.json still references the old id");

// ─── Validate exactly like the corpus builder ────────────────────────────────
const strictSchema = makeRecordSchema({ allow_placeholders: false });
for (const [label, rec] of [
  ["revised continuation record", record],
  ["patched prompt record", promptRecord],
] as const) {
  const parsed = strictSchema.safeParse(rec);
  if (!parsed.success) {
    fail(`${label} FAILED strict schema validation:\n` + JSON.stringify(parsed.error.issues, null, 2));
  }
}
const catalog = loadToolSchemaCatalog();
const traceReport = validateTrace(record.target_trace, catalog);
if (!traceReport.ok) {
  fail("revised record FAILED trace validation:\n" + JSON.stringify(traceReport.mismatches, null, 2));
}
if (JSON.stringify(record).includes("61–64") || JSON.stringify(record).includes("61-64")) {
  fail("revised record still contains a 61-64 window reference");
}

// ─── Write ───────────────────────────────────────────────────────────────────
const newRecordJson = JSON.stringify(record, null, 2) + "\n";
const newPromptJson = JSON.stringify(promptRecord, null, 2) + "\n";
const newSplitsJson = JSON.stringify(splits, null, 2) + "\n";

writeFileSync(NEW_RECORD, newRecordJson, "utf8");
writeFileSync(NEW_SVG, newSvg, "utf8");
writeFileSync(PROMPT_RECORD, newPromptJson, "utf8");
writeFileSync(SPLITS, newSplitsJson, "utf8");
unlinkSync(OLD_RECORD);
if (existsSync(OLD_SVG)) unlinkSync(OLD_SVG);

mkdirSync(REVISION_DIR, { recursive: true });
const receipt = {
  revision: "r001-bach-m061-window",
  date: REVISION_DATE,
  script: "scripts/revise-jam-actions-v0-r001-bach-window.ts",
  reason:
    "Record window mm. 61-64 exceeds the 62-measure source MIDI (prelude 1-35 + fugue 36-62); " +
    "frozen play_song(61,64) fails live execution. Retargeted to mm. 61-62 — the record's sidecar " +
    "always contained exactly bars 61-62.",
  finding: "finetune-arc-v1 gate G6a (experiments/finetune-arc-v1/data/P1v1-gate-report.json)",
  disposition: "experiments/finetune-arc-v1/P0-LOCK.md amendment A1-v1",
  erratum: "docs/jam-actions-v0-erratum-001-bach-m061-064.md",
  sealed_public_records_sha256: SEALED_PUBLIC_RECORDS_SHA,
  invariants: {
    timed_events_untouched: true,
    remi_byte_identical: true,
    abc_body_identical_title_corrected: true,
    hand_counts_unchanged: { rh: rhCount, lh: lhCount },
  },
  files: {
    removed: {
      [`records/${SONG_ID}-m061-064.json`]: sha256(oldRecordRaw),
      ...(oldSvgRaw !== null ? { [`pianoroll/${SONG_ID}-m061-064.svg`]: sha256(oldSvgRaw) } : {}),
    },
    written: {
      [`records/${SONG_ID}-m061-062.json`]: sha256(newRecordJson),
      [`pianoroll/${SONG_ID}-m061-062.svg`]: sha256(newSvg),
    },
    modified: {
      [`records/${SONG_ID}-m057-060.json`]: { before: sha256(promptRaw), after: sha256(newPromptJson) },
      ["splits.json"]: { before: sha256(splitsRaw), after: sha256(newSplitsJson) },
    },
  },
};
writeJson(join(REVISION_DIR, "receipt.json"), receipt);

assertSealedTreeUntouched("post-write");

console.log(`  removed  records/${SONG_ID}-m061-064.json`);
console.log(`  written  records/${SONG_ID}-m061-062.json (${NEW_ID})`);
console.log(`  written  pianoroll/${SONG_ID}-m061-062.svg`);
console.log(`  patched  records/${SONG_ID}-m057-060.json (continuation_target_window → [61, 62])`);
console.log(`  patched  splits.json (train id swap)`);
console.log(`  receipt  datasets/jam-actions-v0/revisions/r001-bach-m061-window/receipt.json`);
console.log("REVISION r001 APPLIED — sealed public package verified untouched.");
