#!/usr/bin/env tsx
// ─── build-b2-data.ts — Finetune Arc B-2 P1: the gated corpus builder ────────
//
// P0-LOCK.md (B-2) §4 (corpus C1–C5), §5 (gates G1–G8), §5 double-build.
// EXTENDS finetune-arc-v1/scripts/build-v1-data.ts:
//   - C1 jam (78 human + 156 paraphrase) — VERBATIM (same generators + tags).
//   - C2 grounding (200 train + 50 val)   — VERBATIM (same stream tags → the C2
//     lines are byte-identical to v1; the tool-surface majority that holds the win).
//   - C3 full_surface_qa (NEW)            — enumerate→group-by→count worked QA.
//   - C4 abstention (NEW)                 — 3 flavors + answerable twins.
//   - C5 rehearsal (NEW content)          — distribution-matched self-rehearsal.
// Interleaves the components (no blocking by source file); keeps replay
// (C5 + C4 answerable twins) proportioned; NO difficulty ordering (§12).
//
// Gates (builder exits 1 on any; ANDON):
//   G1  split integrity (clair-de-lune zero-tolerance)
//   G2  schema validity (mcp41 jam calls; inspector9 grounding + full_surface calls)
//   G3  byte round-trip + unique ids
//   G4  exact counts (C1–C5 + val) + C4 answerable:unanswerable ratio band
//   G5  contamination (MCQ blacklist, harness markers, option-block, clair,
//       annotation-prose) over ALL components incl. C3/C4/C5
//   G6a MCP execution of every unique jam tool_call (live server)
//   G6b inspector re-execution + answer containment — C2 AND C3
//   G6c paraphrase anchors + frozen turns (C1)
//   G8  abstention calibration (C4): answerable golds re-derived from the record;
//       unanswerable qtype ∈ 4 MIDI-only + gold abstain + decline present;
//       false-premise probe confirmed ABSENT (EXTERNAL_VERIFIER); ratio in band
//   +   in-process double-build byte-identity (C1/C2/C3/C4 + interleave)
//   G7  render ≤ 12288 — separate (render-check-b2.py, training venv)
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import Ajv from "ajv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  loadToolSchemaCatalog,
  validateTrace,
  type ToolSchemaCatalog,
} from "../../../src/dataset/trace-validator.js";
import {
  INSPECTOR_TOOLS,
  inspectorToolSchemas,
} from "../../../src/dataset/eval/midi-inspector.js";
import {
  generateQuestionSet,
  isNotComputable,
  noteName,
} from "../../../src/dataset/eval/annotation-grounding.js";
import { paraphraseAsk, SONG_DISPLAY } from "../../finetune-arc-v1/scripts/paraphrase-bank.js";
import {
  generateGroundingSessions,
  type GroundingLine,
  type SftMessage,
} from "../../finetune-arc-v1/scripts/grounding-gen.js";
import { generateFullSurfaceQa, type FullSurfaceLine } from "./full-surface-gen.js";
import { generateAbstention, type AbstentionLine } from "./abstention-gen.js";
import { answerContainsB2, makeLcg, lcgShuffle, hashString } from "./det-b2.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const PUBLIC_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0-public");
const V0_DATA_DIR = join(REPO_ROOT, "experiments", "finetune-arc", "data");
const OUT_DIR = join(__dirname, "..", "data");

const SYSTEM_TEXT = "You are operating AI Jam Sessions, a music education platform.";
const INNER_VAL_SONGS: ReadonlySet<string> = new Set(["chopin-prelude-e-minor", "fur-elise"]);

// ─── B-2 frozen design counts (asserted by G4; mirrored into b2-cohort.json) ──
const B2 = {
  C3_FULL_SURFACE: 110,
  C4_ABSTENTION_PAIRS_PER_FLAVOR: 24, // → 6 lines/pair-iter → 144 lines (72u/72a)
  C4_ABSTENTION_TOTAL: 144,
  C5_REHEARSAL: 60,
  C4_VAL_PAIRS_PER_FLAVOR: 4, // → 24 selection-only abstention-val lines
  C4_VAL_TOTAL: 24,
  // replay = C5 + C4 answerable twins; must sit in [0.15, 0.30] of the train total
  REPLAY_MIN: 0.15,
  REPLAY_MAX: 0.30,
  // interleave: no component may run in a block longer than this on disk
  MAX_COMPONENT_RUN: 8,
} as const;

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
  scope: { song_id: string; phrase_window: string; key: string; time_signature: string } & Record<string, unknown>;
  provenance: { composer: string; composition_title: string; arrangement_creator: string | null } & Record<string, unknown>;
  observation: { midi_sidecar: { timed_events: unknown[] } };
  annotation_target: {
    measure_range: [number, number];
    structure?: string;
    key_moments?: string[];
    teaching_notes?: Array<{ measure: number; note: string; technique?: string[] }>;
    teaching_goals?: string[];
    style_tips?: string[];
  };
  target_trace: { session: TraceTurn[] } & Record<string, unknown>;
}
interface SftLine {
  id: string;
  song_id: string;
  component: "jam_human" | "jam_para" | "grounding" | "full_surface_qa" | "abstention" | "rehearsal";
  tools_key: "mcp41" | "inspector9" | "none";
  record_ref?: string;
  messages: SftMessage[];
  verify?: unknown;
}

// ─── Load inputs (A2-v1 working set — verbatim) ──────────────────────────────

const recordsPath = join(PUBLIC_DIR, "records.jsonl");
const splitsPath = join(PUBLIC_DIR, "splits.json");
const WS_RECORDS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0", "records");
const R001_RENAME: Readonly<Record<string, string>> = {
  "bach-prelude-c-major-bwv846:m061-064:piano:mcp-session:v1":
    "bach-prelude-c-major-bwv846:m061-062:piano:mcp-session:v1",
};

const sealedRecords: PublicRecord[] = readFileSync(recordsPath, "utf8")
  .trim().split("\n").map((l) => JSON.parse(l) as PublicRecord);
const pubSplits = JSON.parse(readFileSync(splitsPath, "utf8")) as { test: string[]; train: string[] };
const splits = {
  train: pubSplits.train.map((id) => R001_RENAME[id] ?? id),
  test: pubSplits.test.map((id) => R001_RENAME[id] ?? id),
};
function worksetFile(id: string): string {
  return join(WS_RECORDS_DIR, `${id.replace(/:piano:mcp-session:v1$/, "").replace(/:/g, "-")}.json`);
}
const records: PublicRecord[] = [
  ...splits.train.map((id) => ({ id, split: "train" as const })),
  ...splits.test.map((id) => ({ id, split: "test" as const })),
].map(({ id, split }) => {
  const r = JSON.parse(readFileSync(worksetFile(id), "utf8")) as PublicRecord;
  if (r.id !== id) throw new Error(`A2: ${worksetFile(id)} carries id ${r.id}, expected ${id}`);
  return { ...r, split };
});

const catalog: ToolSchemaCatalog = loadToolSchemaCatalog();
const failures: string[] = [];
function gateAssert(cond: boolean, msg: string): void {
  if (!cond) failures.push(msg);
}
function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// ─── G1: split integrity ──────────────────────────────────────────────────────

const trainIds = new Set(splits.train);
const testIds = new Set(splits.test);
gateAssert(testIds.size === 12, `G1: expected 12 test ids, got ${testIds.size}`);
gateAssert([...testIds].every((id) => id.startsWith("clair-de-lune:")), "G1: test split has a non-clair id");
for (const r of records) {
  const inTrain = trainIds.has(r.id);
  const inTest = testIds.has(r.id);
  gateAssert(inTrain !== inTest, `G1: ${r.id} not in exactly one split`);
  gateAssert(r.split === (inTrain ? "train" : "test"), `G1: ${r.id} split field disagrees`);
}
const trainRecords = records.filter((r) => r.split === "train");
gateAssert(trainRecords.length === 103, `G1: expected 103 train records, got ${trainRecords.length}`);
const gradientRecords = trainRecords.filter((r) => !INNER_VAL_SONGS.has(r.scope.song_id));
const innerValRecords = trainRecords.filter((r) => INNER_VAL_SONGS.has(r.scope.song_id));
gateAssert(gradientRecords.length === 78, `G1: expected 78 gradient records, got ${gradientRecords.length}`);
gateAssert(innerValRecords.length === 25, `G1: expected 25 inner-val records, got ${innerValRecords.length}`);

// ─── C1 (jam) — verbatim v1 ──────────────────────────────────────────────────

function toJamLine(
  r: PublicRecord,
  component: "jam_human" | "jam_para",
  idSuffix?: string,
  userOverride?: string,
): SftLine {
  const messages: SftMessage[] = [{ role: "system", content: SYSTEM_TEXT }];
  for (const turn of r.target_trace.session) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: userOverride ?? (turn.content as string) });
    } else if (turn.role === "assistant") {
      const msg: SftMessage = { role: "assistant", content: (turn.content as string) ?? "" };
      if (turn.tool_calls && turn.tool_calls.length > 0) {
        msg.tool_calls = turn.tool_calls.map((tc) => ({ name: tc.tool, arguments: tc.arguments }));
      }
      messages.push(msg);
    } else {
      messages.push({ role: "tool", name: turn.tool as string, content: JSON.stringify(turn.content) });
    }
  }
  return {
    id: idSuffix ? `${r.id}::${idSuffix}` : r.id,
    song_id: r.scope.song_id,
    component,
    tools_key: "mcp41",
    record_ref: r.id,
    messages,
  };
}
function buildC1(): { human: SftLine[]; para: SftLine[] } {
  const human = gradientRecords.map((r) => toJamLine(r, "jam_human"));
  const para: SftLine[] = [];
  for (const r of gradientRecords) {
    const userTurn = r.target_trace.session.find((t) => t.role === "user");
    if (!userTurn) throw new Error(`${r.id}: no user turn`);
    for (const k of [1, 2] as const) {
      const newAsk = paraphraseAsk(r.id, r.scope.song_id, userTurn.content as string, k);
      para.push(toJamLine(r, "jam_para", `para${k}`, newAsk));
    }
  }
  return { human, para };
}

// ─── C2 (grounding) — verbatim v1 (same stream tags → byte-identical) ────────

function buildC2(): { train: GroundingLine[]; val: GroundingLine[] } {
  const train = generateGroundingSessions({
    records: gradientRecords as never, sessionsTotal: 200, streamTag: "ftv1:ground", systemText: SYSTEM_TEXT,
  });
  const val = generateGroundingSessions({
    records: innerValRecords as never, sessionsTotal: 50, streamTag: "ftv1:ground:val", systemText: SYSTEM_TEXT,
  });
  return { train, val };
}

// ─── C3 (full-surface QA) — NEW ──────────────────────────────────────────────

function buildC3(): FullSurfaceLine[] {
  return generateFullSurfaceQa({
    records: gradientRecords as never,
    total: B2.C3_FULL_SURFACE,
    fadedFraction: 0.15,
    streamTag: "ftb2:full",
    systemText: SYSTEM_TEXT,
  });
}

// ─── C4 (abstention) — NEW ───────────────────────────────────────────────────

function buildC4(): AbstentionLine[] {
  return generateAbstention({
    records: gradientRecords as never,
    pairsPerFlavor: B2.C4_ABSTENTION_PAIRS_PER_FLAVOR,
    streamTag: "ftb2:abstain",
  });
}
function buildC4Val(): AbstentionLine[] {
  return generateAbstention({
    records: innerValRecords as never,
    pairsPerFlavor: B2.C4_VAL_PAIRS_PER_FLAVOR,
    streamTag: "ftb2:abstain:val",
    idNamespace: "abstain-val",
  });
}

// ─── Double-build byte-identity (P0-LOCK §5) ─────────────────────────────────

const c1a = buildC1();
const c2a = buildC2();
const c3a = buildC3();
const c4a = buildC4();
const c4vala = buildC4Val();
const c1b = buildC1();
const c2b = buildC2();
const c3b = buildC3();
const c4b = buildC4();
gateAssert(JSON.stringify(c1a) === JSON.stringify(c1b), "DET: C1 double-build diverged");
gateAssert(JSON.stringify(c2a) === JSON.stringify(c2b), "DET: C2 double-build diverged");
gateAssert(JSON.stringify(c3a) === JSON.stringify(c3b), "DET: C3 double-build diverged");
gateAssert(JSON.stringify(c4a) === JSON.stringify(c4b), "DET: C4 double-build diverged");

// ─── C5 (rehearsal) — load base-model completions ─────────────────────────────

const rehearsalPath = join(OUT_DIR, "rehearsal-b2-raw.jsonl");
let rehearsal: SftLine[] = [];
let rehearsalRawSha = "";
if (!existsSync(rehearsalPath)) {
  failures.push("C5: data/rehearsal-b2-raw.jsonl missing — run gen-rehearsal-b2.ts first");
} else {
  const rawText = readFileSync(rehearsalPath, "utf8");
  rehearsalRawSha = sha256(rawText);
  const raw = rawText.trim().split("\n").map((l) => JSON.parse(l) as { idx: number; prompt: string; response: string; system: string });
  gateAssert(raw.length === B2.C5_REHEARSAL, `C5: expected ${B2.C5_REHEARSAL} completions, got ${raw.length}`);
  rehearsal = raw.map((r) => ({
    id: `rehearsal-b2::${String(r.idx).padStart(2, "0")}`,
    song_id: "none",
    component: "rehearsal" as const,
    tools_key: "none" as const,
    messages: [
      { role: "system" as const, content: SYSTEM_TEXT },
      { role: "user" as const, content: r.prompt },
      { role: "assistant" as const, content: r.response },
    ],
  }));
  gateAssert(raw.every((r) => r.system === SYSTEM_TEXT), "C5: completions not under the pinned SYSTEM_TEXT");
}

// ─── Assemble + interleave (no blocking by source file, §4) ──────────────────

const trainOrdered: SftLine[] = [
  ...c1a.human,
  ...c1a.para,
  ...(c2a.train as unknown as SftLine[]),
  ...(c3a as unknown as SftLine[]),
  ...(c4a as unknown as SftLine[]),
  ...rehearsal,
];
// Deterministic interleave: shuffle the on-disk order so components intermix.
const trainLines = lcgShuffle([...trainOrdered], makeLcg(hashString("ftb2:interleave")));

const valJamLines: SftLine[] = innerValRecords.map((r) => toJamLine(r, "jam_human"));
const valGroundingLines = c2a.val as unknown as SftLine[];
const valAbstentionLines = c4vala as unknown as SftLine[];

// ─── G2: schema validity ──────────────────────────────────────────────────────

for (const r of trainRecords) {
  const report = validateTrace(r.target_trace as never, catalog);
  gateAssert(report.mismatches.length === 0, `G2: ${r.id} validateTrace mismatches`);
}
function harden(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(harden);
  if (typeof schema !== "object" || schema === null) return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) out[k] = harden(v);
  if (out.type === "object" && !("additionalProperties" in out)) out.additionalProperties = false;
  return out;
}
const ajv = new Ajv({ strict: false });
const inspectorSchemas = inspectorToolSchemas();
const inspectorValidators = new Map(
  inspectorSchemas.map((t) => [t.name, ajv.compile(harden(structuredClone(t.inputSchema)) as object)]),
);
for (const line of [...trainLines, ...valGroundingLines]) {
  if (line.tools_key !== "inspector9") continue;
  for (const m of line.messages) {
    if (m.role === "assistant" && m.tool_calls) {
      for (const tc of m.tool_calls) {
        const v = inspectorValidators.get(tc.name);
        gateAssert(!!v, `G2: ${line.id} unknown inspector tool "${tc.name}"`);
        if (v) gateAssert(v(tc.arguments) === true, `G2: ${line.id} args invalid for ${tc.name}`);
      }
    }
    if (m.role === "tool") {
      gateAssert(inspectorValidators.has(m.name ?? ""), `G2: ${line.id} tool turn "${m.name}" not in inspector catalog`);
    }
  }
}
for (const line of trainLines) {
  if (line.tools_key !== "mcp41") continue;
  for (const m of line.messages) {
    if (m.role === "assistant" && m.tool_calls) {
      for (const tc of m.tool_calls) {
        gateAssert(catalog.tools.some((t) => t.name === tc.name), `G2: ${line.id} tool_call "${tc.name}" not in 41-tool catalog`);
      }
    }
  }
}

// ─── G3: byte round-trip + unique ids ─────────────────────────────────────────

for (const line of [...trainLines, ...valJamLines, ...valGroundingLines, ...valAbstentionLines]) {
  const s = JSON.stringify(line);
  gateAssert(JSON.stringify(JSON.parse(s)) === s, `G3: ${line.id} round-trip drift`);
  for (const m of line.messages) {
    if (m.role === "tool") {
      try { JSON.parse(m.content); } catch { failures.push(`G3: ${line.id} tool content not JSON`); }
    }
  }
}
{
  const ids = new Set<string>();
  for (const line of [...trainLines, ...valJamLines, ...valGroundingLines, ...valAbstentionLines]) {
    gateAssert(!ids.has(line.id), `G3: duplicate line id ${line.id}`);
    ids.add(line.id);
  }
}

// ─── G4: exact counts + ratio band + interleave no-block ──────────────────────

const byComp = (c: string) => trainLines.filter((l) => l.component === c).length;
gateAssert(byComp("jam_human") === 78, `G4: jam_human ${byComp("jam_human")} != 78`);
gateAssert(byComp("jam_para") === 156, `G4: jam_para ${byComp("jam_para")} != 156`);
gateAssert(byComp("grounding") === 200, `G4: grounding ${byComp("grounding")} != 200`);
gateAssert(byComp("full_surface_qa") === B2.C3_FULL_SURFACE, `G4: full_surface_qa ${byComp("full_surface_qa")} != ${B2.C3_FULL_SURFACE}`);
gateAssert(byComp("abstention") === B2.C4_ABSTENTION_TOTAL, `G4: abstention ${byComp("abstention")} != ${B2.C4_ABSTENTION_TOTAL}`);
gateAssert(byComp("rehearsal") === B2.C5_REHEARSAL, `G4: rehearsal ${byComp("rehearsal")} != ${B2.C5_REHEARSAL}`);
const TRAIN_TOTAL = 78 + 156 + 200 + B2.C3_FULL_SURFACE + B2.C4_ABSTENTION_TOTAL + B2.C5_REHEARSAL;
gateAssert(trainLines.length === TRAIN_TOTAL, `G4: train total ${trainLines.length} != ${TRAIN_TOTAL}`);
gateAssert(valJamLines.length === 25, `G4: val-jam ${valJamLines.length} != 25`);
gateAssert(valGroundingLines.length === 50, `G4: val-grounding ${valGroundingLines.length} != 50`);
gateAssert(valAbstentionLines.length === B2.C4_VAL_TOTAL, `G4: val-abstention ${valAbstentionLines.length} != ${B2.C4_VAL_TOTAL}`);

// C4 answerable:unanswerable ratio band
const c4Ans = c4a.flatMap((l) => l.verify).filter((v) => v.kind === "answerable").length;
const c4Unans = c4a.flatMap((l) => l.verify).filter((v) => v.kind === "unanswerable").length;
const c4Ratio = c4Unans > 0 ? c4Ans / c4Unans : 0;
gateAssert(c4Ans === 72 && c4Unans === 72, `G4: C4 answerable/unanswerable ${c4Ans}/${c4Unans} != 72/72`);

// replay proportion (C5 + C4 answerable twins) ∈ [15%, 30%]
const replayCount = B2.C5_REHEARSAL + c4Ans;
const replayFrac = replayCount / TRAIN_TOTAL;
gateAssert(
  replayFrac >= B2.REPLAY_MIN && replayFrac <= B2.REPLAY_MAX,
  `G4: replay fraction ${replayFrac.toFixed(3)} outside [${B2.REPLAY_MIN}, ${B2.REPLAY_MAX}]`,
);

// interleave: no component block longer than MAX_COMPONENT_RUN on disk
{
  let run = 1;
  let maxRun = 1;
  for (let i = 1; i < trainLines.length; i++) {
    run = trainLines[i].component === trainLines[i - 1].component ? run + 1 : 1;
    if (run > maxRun) maxRun = run;
  }
  gateAssert(maxRun <= B2.MAX_COMPONENT_RUN, `G4: interleave block run ${maxRun} > ${B2.MAX_COMPONENT_RUN} (components blocked)`);
}

// per-song jam_human counts
{
  const perSong: Record<string, number> = {};
  for (const l of trainLines) if (l.component === "jam_human") perSong[l.song_id] = (perSong[l.song_id] ?? 0) + 1;
  for (const [song, expected] of Object.entries(EXPECTED_SONG_COUNTS)) {
    if (INNER_VAL_SONGS.has(song)) continue;
    gateAssert(perSong[song] === expected, `G4: ${song} jam_human ${perSong[song]} != ${expected}`);
  }
}

// ─── G5: contamination gate (over ALL components) ─────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
const blacklist: string[] = [];
for (const r of [...sealedRecords, ...records]) {
  for (const q of generateQuestionSet(r as never).questions) {
    if (!isNotComputable(q)) blacklist.push(norm(q.questionText));
  }
}
gateAssert(blacklist.length > 700, `G5: blacklist unexpectedly small (${blacklist.length})`);
const HARNESS_MARKERS = [
  "options:", "respond with only", "single letter", "a, b, c, or d",
  "you are answering multiple-choice questions", "use the midi inspector tools as needed",
  "tool calls are free and fast",
];
const OPTION_BLOCK_RE = /\ba\)\s.*\bb\)\s.*\bc\)\s.*\bd\)\s/s;
const annotationNeedles: string[] = [];
for (const r of [...sealedRecords, ...records]) {
  const at = r.annotation_target;
  const push = (s?: string) => { if (s && s.length >= 15) annotationNeedles.push(norm(s)); };
  push(at.structure);
  for (const s of at.key_moments ?? []) push(s);
  for (const s of at.teaching_goals ?? []) push(s);
  for (const s of at.style_tips ?? []) push(s);
  for (const tn of at.teaching_notes ?? []) push(tn.note);
}
function contaminationScan(line: SftLine, checkAnnotation: boolean): void {
  for (const m of line.messages) {
    const n = norm(m.content ?? "");
    if (!n) continue;
    for (const q of blacklist) if (n.includes(q)) failures.push(`G5: ${line.id} blacklisted MCQ text: "${q.slice(0, 50)}…"`);
    for (const marker of HARNESS_MARKERS) if (n.includes(marker)) failures.push(`G5: ${line.id} harness marker "${marker}"`);
    if (OPTION_BLOCK_RE.test(n)) failures.push(`G5: ${line.id} contains an A)/B)/C)/D) option block`);
    if (n.includes("clair")) failures.push(`G5: ${line.id} references clair-de-lune`);
    if (checkAnnotation) {
      for (const needle of annotationNeedles) if (n.includes(needle)) failures.push(`G5: ${line.id} annotation prose: "${needle.slice(0, 40)}…"`);
    }
  }
}
// C3/C4 caveat (§4): they carry MIDI facts / prose Qs deliberately, so they get
// the FULL scan incl. annotation-prose exclusion (skill overlap OK; string overlap forbidden).
const ANNOTATION_CHECK = new Set(["grounding", "full_surface_qa", "abstention"]);
for (const line of trainLines) contaminationScan(line, ANNOTATION_CHECK.has(line.component));
for (const line of [...valGroundingLines, ...valAbstentionLines]) contaminationScan(line, true);

// provenance boundary
const gradientIds = new Set(gradientRecords.map((r) => r.id));
const innerValIds = new Set(innerValRecords.map((r) => r.id));
for (const l of c2a.train) gateAssert(gradientIds.has(l.record_ref), `G5: train grounding ${l.id} non-gradient ref`);
for (const l of c2a.val) gateAssert(innerValIds.has(l.record_ref), `G5: val grounding ${l.id} non-inner-val ref`);
for (const l of c3a) gateAssert(gradientIds.has(l.record_ref), `G5: full_surface ${l.id} non-gradient ref`);
for (const l of c4a) gateAssert(gradientIds.has(l.record_ref), `G5: abstention ${l.id} non-gradient ref`);
for (const l of c4vala) gateAssert(innerValIds.has(l.record_ref), `G5: abstention-val ${l.id} non-inner-val ref`);
for (const l of c1a.para) gateAssert(gradientIds.has(l.record_ref ?? ""), `G5: paraphrase ${l.id} non-gradient ref`);

// ─── G6b: inspector re-execution + containment — C2 AND C3 ────────────────────

const recordById = new Map(records.map((r) => [r.id, r]));
function reexecuteGrounding(lines: GroundingLine[] | FullSurfaceLine[], tag: string): void {
  for (const l of lines) {
    const rec = recordById.get(l.record_ref);
    if (!rec) { failures.push(`G6b(${tag}): ${l.id} record_ref not found`); continue; }
    const msgs = l.messages;
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m.role === "assistant" && m.tool_calls) {
        for (let c = 0; c < m.tool_calls.length; c++) {
          const tc = m.tool_calls[c];
          const toolTurn = msgs[i + 1 + c];
          if (!toolTurn || toolTurn.role !== "tool" || toolTurn.name !== tc.name) {
            failures.push(`G6b(${tag}): ${l.id} msg ${i}: tool turn misaligned for ${tc.name}`); continue;
          }
          const impl = INSPECTOR_TOOLS.find((t) => t.name === tc.name);
          if (!impl) { failures.push(`G6b(${tag}): ${l.id} unknown tool ${tc.name}`); continue; }
          const expected = JSON.stringify(impl.run(rec as never, tc.arguments));
          if (expected !== toolTurn.content) failures.push(`G6b(${tag}): ${l.id} msg ${i + 1 + c}: tool result drift for ${tc.name}`);
        }
      }
    }
    for (const v of l.verify) {
      const answer = msgs[v.answerMsgIndex];
      if (!answer || answer.role !== "assistant") { failures.push(`G6b(${tag}): ${l.id} answerMsgIndex not assistant`); continue; }
      for (const gold of v.golds) {
        if (!answerContainsB2(answer.content, gold as never)) {
          failures.push(`G6b(${tag}): ${l.id} answer fails containment for ${JSON.stringify(gold)}: "${answer.content.slice(0, 80)}"`);
        }
      }
    }
  }
}
reexecuteGrounding([...c2a.train, ...c2a.val], "C2");
reexecuteGrounding([...c3a], "C3");

// ─── G6c: paraphrase anchors + frozen turns (C1) ──────────────────────────────

const humanById = new Map(c1a.human.map((l) => [l.record_ref ?? "", l]));
for (const l of c1a.para) {
  const human = humanById.get(l.record_ref ?? "");
  if (!human) { failures.push(`G6c: ${l.id} no matching human line`); continue; }
  gateAssert(l.messages.length === human.messages.length, `G6c: ${l.id} turn count differs`);
  const rec = recordById.get(l.record_ref ?? "")!;
  const [mStart, mEnd] = rec.annotation_target.measure_range;
  const anchor = SONG_DISPLAY[l.song_id]?.anchor ?? "";
  for (let i = 0; i < l.messages.length; i++) {
    const a = l.messages[i];
    const b = human.messages[i];
    if (a.role === "user") {
      gateAssert(a.content.includes(String(mStart)) && a.content.includes(String(mEnd)), `G6c: ${l.id} missing measures`);
      gateAssert(a.content.includes(anchor), `G6c: ${l.id} missing anchor "${anchor}"`);
      gateAssert(a.content !== b.content, `G6c: ${l.id} paraphrase identical to human`);
    } else {
      gateAssert(JSON.stringify(a) === JSON.stringify(b), `G6c: ${l.id} msg ${i} (${a.role}) not byte-frozen`);
    }
  }
}

// ─── G8: abstention calibration (C4) ──────────────────────────────────────────

const MIDI_ONLY = new Set(["pitch_class_count", "hand_register", "rhythm_onset", "annotation_grounding"]);
function eventsOfRec(rec: PublicRecord): Array<{ hand: string; measure: number; name: string; pitch: number }> {
  const tool = INSPECTOR_TOOLS.find((t) => t.name === "get_events_in_hand")!;
  return [
    ...(tool.run(rec as never, { hand: "right" }) as Array<{ hand: string; measure: number; name: string; pitch: number }>),
    ...(tool.run(rec as never, { hand: "left" }) as Array<{ hand: string; measure: number; name: string; pitch: number }>),
  ];
}
function checkAbstention(lines: AbstentionLine[], tag: string): void {
  for (const l of lines) {
    const rec = recordById.get(l.record_ref);
    if (!rec) { failures.push(`G8(${tag}): ${l.id} record_ref not found`); continue; }
    const answer = l.messages[l.messages.length - 1];
    for (const v of l.verify) {
      if (answer.role !== "assistant") { failures.push(`G8(${tag}): ${l.id} last turn not assistant`); continue; }
      // containment on golds
      for (const gold of v.golds) {
        if (!answerContainsB2(answer.content, gold)) {
          failures.push(`G8(${tag}): ${l.id} answer fails containment for ${JSON.stringify(gold)}: "${answer.content.slice(0, 80)}"`);
        }
      }
      if (v.kind === "unanswerable") {
        gateAssert(MIDI_ONLY.has(v.qtype), `G8(${tag}): ${l.id} unanswerable qtype "${v.qtype}" not MIDI-only`);
        gateAssert(v.golds.length === 1 && v.golds[0].kind === "abstain", `G8(${tag}): ${l.id} unanswerable gold not abstain`);
        // false-premise probe: the named event must be genuinely ABSENT (EXTERNAL_VERIFIER)
        if (v.probe?.name && v.probe.measure !== undefined) {
          const present = eventsOfRec(rec).some((e) => e.measure === v.probe!.measure && e.name === v.probe!.name);
          gateAssert(!present, `G8(${tag}): ${l.id} false-premise ${v.probe.name}@m${v.probe.measure} is actually PRESENT`);
        }
      } else {
        // answerable gold re-derived from record fields / events
        if (v.qtype === "key_time_sig") {
          gateAssert(
            v.golds.some((g) => g.kind === "text" && g.value === rec.scope.key),
            `G8(${tag}): ${l.id} key_time_sig gold not the record key`,
          );
        } else if (v.qtype === "provenance") {
          const last = rec.provenance.composer.split(/\s+/).pop() ?? rec.provenance.composer;
          gateAssert(v.golds.some((g) => g.kind === "text" && g.value === last), `G8(${tag}): ${l.id} provenance gold not composer`);
        } else if (v.qtype === "measure_range") {
          const [lo, hi] = rec.annotation_target.measure_range;
          const nums = v.golds.filter((g) => g.kind === "number").map((g) => (g as { value: number }).value);
          gateAssert(nums.includes(lo) && nums.includes(hi), `G8(${tag}): ${l.id} measure_range gold != record range`);
        } else if (v.qtype === "note_count" && v.probe?.measure !== undefined) {
          const count = eventsOfRec(rec).filter((e) => e.measure === v.probe!.measure).length;
          gateAssert(v.golds.some((g) => g.kind === "number" && g.value === count), `G8(${tag}): ${l.id} note_count gold != recomputed`);
        } else if (v.qtype === "extreme_pitch") {
          const top = eventsOfRec(rec).reduce((a, b) => (b.pitch > a.pitch ? b : a));
          gateAssert(v.golds.some((g) => g.kind === "note" && g.value === top.name), `G8(${tag}): ${l.id} extreme_pitch gold != max`);
        } else if (v.qtype === "event_grounding" && v.probe?.name && v.probe.measure !== undefined) {
          const hits = eventsOfRec(rec).filter((e) => e.measure === v.probe!.measure && e.name === v.probe!.name);
          const hands = new Set(hits.map((e) => e.hand));
          gateAssert(hands.size === 1, `G8(${tag}): ${l.id} event_grounding probe not unambiguous`);
          gateAssert(v.golds.some((g) => g.kind === "hand" && g.value === [...hands][0]), `G8(${tag}): ${l.id} event_grounding gold hand mismatch`);
        }
      }
    }
  }
}
checkAbstention(c4a, "C4");
checkAbstention(c4vala, "C4-val");

// ─── G6a: MCP execution verification (jam only) ──────────────────────────────

interface ToolResultShape { content: Array<{ type: string; text?: string }>; isError?: boolean }
async function execVerifyMcp(): Promise<{ executed: number; unique: number; findings: string[] }> {
  const humanCallKeys = new Set<string>();
  for (const r of trainRecords) {
    for (const turn of r.target_trace.session) {
      if (turn.role === "assistant" && turn.tool_calls) {
        for (const tc of turn.tool_calls) humanCallKeys.add(`${tc.tool}|${JSON.stringify(tc.arguments)}`);
      }
    }
  }
  const uniqueCalls = new Map<string, { name: string; arguments: Record<string, unknown> }>();
  for (const line of [...trainLines, ...valJamLines]) {
    if (line.tools_key !== "mcp41") continue;
    for (const m of line.messages) {
      if (m.role === "assistant" && m.tool_calls) {
        for (const tc of m.tool_calls) uniqueCalls.set(`${tc.name}|${JSON.stringify(tc.arguments)}`, tc);
      }
    }
  }
  const findings: string[] = [];
  const isolatedHome = mkdtempSync(join(tmpdir(), "ftb2-exec-"));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(REPO_ROOT, "dist", "mcp-server.js")],
    env: { ...process.env, HOME: isolatedHome, USERPROFILE: isolatedHome },
    cwd: REPO_ROOT,
  });
  const client = new Client({ name: "ftb2-exec-verify", version: "1.0.0" });
  await client.connect(transport);
  let executed = 0;
  try {
    for (const [key, tc] of uniqueCalls) {
      const res = (await client.callTool({ name: tc.name, arguments: tc.arguments })) as ToolResultShape;
      executed++;
      if (res.isError === true) {
        const errText = res.content.filter((c) => c.type === "text" && c.text).map((c) => c.text).join(" ").slice(0, 160);
        if (humanCallKeys.has(key)) findings.push(`human-record call ${tc.name}(${JSON.stringify(tc.arguments)}) fails: ${errText}`);
        else failures.push(`G6a: synthetic call ${tc.name}(${JSON.stringify(tc.arguments)}) returned isError: ${errText}`);
      }
      if (tc.name === "play_song") await client.callTool({ name: "stop_playback", arguments: {} });
    }
  } finally {
    await client.close();
  }
  return { executed, unique: uniqueCalls.size, findings };
}

const execStats = await execVerifyMcp();

// ─── Emit ─────────────────────────────────────────────────────────────────────

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const gateReportPath = join(OUT_DIR, "P1b2-gate-report.json");

if (failures.length > 0) {
  writeFileSync(
    gateReportPath,
    JSON.stringify({ schema: "finetune-arc-b2-p1-gate/1.0.0", verdict: "FAIL", failures }, null, 2) + "\n",
    "utf8",
  );
  console.error(`P1-b2 GATE FAIL — ${failures.length} failure(s):`);
  for (const f of failures.slice(0, 30)) console.error(`  - ${f}`);
  process.exit(1);
}

const toolsMcp41 = readFileSync(join(V0_DATA_DIR, "tools.json"), "utf8");
const toolsInspector9 =
  JSON.stringify(
    { source: "src/dataset/eval/midi-inspector.ts inspectorToolSchemas()", tool_count: inspectorSchemas.length, tools: inspectorSchemas },
    null, 2,
  ) + "\n";

const trainText = trainLines.map((l) => JSON.stringify(l)).join("\n") + "\n";
const valJamText = valJamLines.map((l) => JSON.stringify(l)).join("\n") + "\n";
const valGroundText = valGroundingLines.map((l) => JSON.stringify(l)).join("\n") + "\n";
const valAbstainText = valAbstentionLines.map((l) => JSON.stringify(l)).join("\n") + "\n";

writeFileSync(join(OUT_DIR, "sft-train-b2.jsonl"), trainText, "utf8");
writeFileSync(join(OUT_DIR, "sft-val-jam.jsonl"), valJamText, "utf8");
writeFileSync(join(OUT_DIR, "sft-val-grounding.jsonl"), valGroundText, "utf8");
writeFileSync(join(OUT_DIR, "sft-val-abstention.jsonl"), valAbstainText, "utf8");
writeFileSync(join(OUT_DIR, "tools-mcp41.json"), toolsMcp41, "utf8");
writeFileSync(join(OUT_DIR, "tools-inspector9.json"), toolsInspector9, "utf8");

// component histograms for C3/C4
const c3Families: Record<string, number> = {};
for (const l of c3a) for (const v of l.verify) c3Families[v.family] = (c3Families[v.family] ?? 0) + 1;
const c3Faded = c3a.flatMap((l) => l.verify).filter((v) => v.format === "faded").length;
const c4Flavors: Record<string, { answerable: number; unanswerable: number }> = {};
for (const l of c4a) for (const v of l.verify) {
  const f = (c4Flavors[v.flavor] ??= { answerable: 0, unanswerable: 0 });
  if (v.kind === "answerable") f.answerable++; else f.unanswerable++;
}

const report = {
  schema: "finetune-arc-b2-p1-gate/1.0.0",
  verdict: "PASS",
  generated_by: "experiments/finetune-arc-b2/scripts/build-b2-data.ts",
  lock: "experiments/finetune-arc-b2/P0-LOCK.md",
  inputs: {
    source: "datasets/jam-actions-v0 working set (r001+r002), selected by public splits.json (r001 rename) — inherited A2-v1",
    sealed_records_jsonl_sha256: sha256(readFileSync(recordsPath, "utf8")),
    splits_json_sha256: sha256(readFileSync(splitsPath, "utf8")),
    midi_inspector_sha256: sha256(readFileSync(join(REPO_ROOT, "src", "dataset", "eval", "midi-inspector.ts"), "utf8")),
    rehearsal_b2_raw_sha256: rehearsalRawSha,
    scripts: {
      "build-b2-data.ts": sha256(readFileSync(join(__dirname, "build-b2-data.ts"), "utf8")),
      "full-surface-gen.ts": sha256(readFileSync(join(__dirname, "full-surface-gen.ts"), "utf8")),
      "abstention-gen.ts": sha256(readFileSync(join(__dirname, "abstention-gen.ts"), "utf8")),
      "gen-rehearsal-b2.ts": sha256(readFileSync(join(__dirname, "gen-rehearsal-b2.ts"), "utf8")),
      "det-b2.ts": sha256(readFileSync(join(__dirname, "det-b2.ts"), "utf8")),
      "grounding-gen.ts": sha256(readFileSync(join(REPO_ROOT, "experiments", "finetune-arc-v1", "scripts", "grounding-gen.ts"), "utf8")),
      "paraphrase-bank.ts": sha256(readFileSync(join(REPO_ROOT, "experiments", "finetune-arc-v1", "scripts", "paraphrase-bank.ts"), "utf8")),
      "det-util.ts": sha256(readFileSync(join(REPO_ROOT, "experiments", "finetune-arc-v1", "scripts", "det-util.ts"), "utf8")),
    },
  },
  system_text: SYSTEM_TEXT,
  counts: {
    train_total: trainLines.length,
    jam_human: 78, jam_para: 156, grounding: 200,
    full_surface_qa: byComp("full_surface_qa"),
    abstention: byComp("abstention"),
    abstention_answerable: c4Ans,
    abstention_unanswerable: c4Unans,
    abstention_ratio_ans_over_unans: Number(c4Ratio.toFixed(4)),
    rehearsal: byComp("rehearsal"),
    val_jam: valJamLines.length,
    val_grounding: valGroundingLines.length,
    val_abstention: valAbstentionLines.length,
    replay_fraction: Number(replayFrac.toFixed(4)),
  },
  histograms: {
    c3_full_surface_families: c3Families,
    c3_faded_count: c3Faded,
    c4_flavors: c4Flavors,
  },
  gates: {
    G1_split_integrity: "PASS",
    G2_schema_validity: "PASS",
    G3_byte_round_trip: "PASS",
    G4_counts_ratio_interleave: "PASS",
    G5_contamination: { verdict: "PASS", mcq_blacklist_size: blacklist.length, annotation_needles: annotationNeedles.length },
    G6a_mcp_execution: {
      verdict: execStats.findings.length > 0 ? "PASS_WITH_FINDINGS" : "PASS",
      unique_calls: execStats.unique, executed: execStats.executed, findings: execStats.findings,
    },
    G6b_inspector_reexecution: "PASS (C2 + C3)",
    G6c_paraphrase_anchors: "PASS",
    G8_abstention_calibration: "PASS",
    DET_double_build: "PASS",
    G7_render_failfast: "DEFERRED — render-check-b2.py (training venv) + on-pod stage0",
  },
  outputs: {
    "sft-train-b2.jsonl": sha256(trainText),
    "sft-val-jam.jsonl": sha256(valJamText),
    "sft-val-grounding.jsonl": sha256(valGroundText),
    "sft-val-abstention.jsonl": sha256(valAbstainText),
    "tools-mcp41.json": sha256(toolsMcp41),
    "tools-inspector9.json": sha256(toolsInspector9),
  },
};
writeFileSync(gateReportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log("P1-b2 GATE PASS");
console.log(`  train ${trainLines.length} (78 human + 156 para + 200 grounding + ${byComp("full_surface_qa")} full-surface + ${byComp("abstention")} abstention + ${byComp("rehearsal")} rehearsal)`);
console.log(`  C4 answerable/unanswerable: ${c4Ans}/${c4Unans} (ratio ${c4Ratio.toFixed(3)}) | replay ${(replayFrac * 100).toFixed(1)}%`);
console.log(`  C3 families: ${JSON.stringify(c3Families)} | faded ${c3Faded}`);
console.log(`  G6a executed ${execStats.executed}/${execStats.unique} unique MCP calls`);
console.log(`  report: ${gateReportPath}`);
