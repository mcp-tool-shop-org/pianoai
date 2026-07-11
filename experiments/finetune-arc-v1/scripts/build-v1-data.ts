#!/usr/bin/env tsx
// ─── build-v1-data.ts — Finetune Arc v1 P1: the gated corpus builder ─────────
//
// P0-LOCK.md §3 (design), §4 (contamination gate), §5 (determinism), §6
// (verifiers). Builds the 494-example v1 training set + the two validation
// files, runs gates G1–G6, and writes outputs ONLY when every gate passes
// (ANDON: any failure exits 1 writing nothing but the failing report).
//
//   G1  split integrity (v0 pattern + clair-de-lune zero-tolerance)
//   G2  schema validity — jam calls vs the 41-tool catalog (validateTrace on
//       human records; byte-frozen turns transitively cover paraphrases),
//       grounding calls vs the inspector-9 catalog (AJV-hardened)
//   G3  byte round-trip on every emitted line
//   G4  exact counts (78/156/200/50/60; per-song; histograms reported)
//   G5  contamination gate (MCQ-text blacklist over ALL 115 records, harness
//       format markers, 'clair' zero-reference, annotation-prose exclusion,
//       provenance boundary)
//   G6b inspector re-execution: every grounding tool turn byte-equals the
//       re-executed result; every answer passes the containment matcher
//   G6c paraphrase anchors + frozen-turn byte-equality vs the human record
//   G6a MCP execution: every unique jam tool_call executes against the REAL
//       server (dist/mcp-server.js over MCP-stdio) with isError=false
//   +   in-process double-build byte-identity (P0-LOCK §5)
//
// G7 (chat-template render ≤ 12288) runs via the training venv separately
// (render-check-v1.py) — recorded in the gate report by the wrapper.
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
import { inspectorToolSchemas } from "../../../src/dataset/eval/midi-inspector.js";
// Contamination sources — imported by the GATE ONLY (P0-LOCK §2).
import {
  generateQuestionSet,
  isNotComputable,
  type E3Record,
} from "../../../src/dataset/eval/annotation-grounding.js";
import { paraphraseAsk, SONG_DISPLAY } from "./paraphrase-bank.js";
import {
  generateGroundingSessions,
  type GroundingLine,
  type SftMessage,
} from "./grounding-gen.js";
import { answerContains } from "./det-util.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const PUBLIC_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0-public");
const V0_DATA_DIR = join(REPO_ROOT, "experiments", "finetune-arc", "data");
const OUT_DIR = join(__dirname, "..", "data");

const SYSTEM_TEXT = "You are operating AI Jam Sessions, a music education platform.";
const INNER_VAL_SONGS: ReadonlySet<string> = new Set(["chopin-prelude-e-minor", "fur-elise"]);
const EXPECTED_SONG_COUNTS: Readonly<Record<string, number>> = {
  "bach-prelude-c-major-bwv846": 16,
  "chopin-nocturne-op9-no2": 18,
  "chopin-prelude-e-minor": 12,
  "fur-elise": 13,
  "mozart-k545-mvt1": 16,
  "pathetique-mvt2": 16,
  "schumann-traumerei": 12,
};

// ─── Types (v0 shapes + v1 fields) ───────────────────────────────────────────

interface TraceTurn {
  turn: number;
  role: "user" | "assistant" | "tool";
  content: string | Record<string, unknown>;
  tool_calls?: Array<{ tool: string; arguments: Record<string, unknown> }>;
  tool?: string;
}

interface PublicRecord extends E3Record {
  id: string;
  split: "train" | "test";
  scope: E3Record["scope"] & { song_id: string; phrase_window: string };
  target_trace: { session: TraceTurn[] } & Record<string, unknown>;
}

interface SftLine {
  id: string;
  song_id: string;
  component: "jam_human" | "jam_para" | "grounding" | "rehearsal";
  tools_key: "mcp41" | "inspector9" | "none";
  record_ref?: string;
  messages: SftMessage[];
  verify?: GroundingLine["verify"];
}

// ─── Load inputs ──────────────────────────────────────────────────────────────

const recordsPath = join(PUBLIC_DIR, "records.jsonl");
const splitsPath = join(PUBLIC_DIR, "splits.json");
const records: PublicRecord[] = readFileSync(recordsPath, "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as PublicRecord);
const splits = JSON.parse(readFileSync(splitsPath, "utf8")) as { test: string[]; train: string[] };
const catalog: ToolSchemaCatalog = loadToolSchemaCatalog();

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
  gateAssert(r.split === (inTrain ? "train" : "test"), `G1: ${r.id} split field disagrees`);
}
const trainRecords = records.filter((r) => r.split === "train");
gateAssert(trainRecords.length === 103, `G1: expected 103 train records, got ${trainRecords.length}`);
const gradientRecords = trainRecords.filter((r) => !INNER_VAL_SONGS.has(r.scope.song_id));
const innerValRecords = trainRecords.filter((r) => INNER_VAL_SONGS.has(r.scope.song_id));
gateAssert(gradientRecords.length === 78, `G1: expected 78 gradient records, got ${gradientRecords.length}`);
gateAssert(innerValRecords.length === 25, `G1: expected 25 inner-val records, got ${innerValRecords.length}`);

// ─── Component builders (deterministic — run twice for the double-build) ─────

function toJamLine(r: PublicRecord, component: "jam_human", idSuffix?: string): SftLine;
function toJamLine(r: PublicRecord, component: "jam_para", idSuffix: string, userOverride?: string): SftLine;
function toJamLine(
  r: PublicRecord,
  component: "jam_human" | "jam_para",
  idSuffix?: string,
  userOverride?: string,
): SftLine {
  const messages: SftMessage[] = [{ role: "system", content: SYSTEM_TEXT }];
  for (const turn of r.target_trace.session) {
    if (turn.role === "user") {
      messages.push({
        role: "user",
        content: userOverride ?? (turn.content as string),
      });
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

function buildC2(): { train: GroundingLine[]; val: GroundingLine[] } {
  const train = generateGroundingSessions({
    records: gradientRecords as never,
    sessionsTotal: 200,
    streamTag: "ftv1:ground",
    systemText: SYSTEM_TEXT,
  });
  const val = generateGroundingSessions({
    records: innerValRecords as never,
    sessionsTotal: 50,
    streamTag: "ftv1:ground:val",
    systemText: SYSTEM_TEXT,
  });
  return { train, val };
}

// ─── Double-build byte-identity (P0-LOCK §5) ──────────────────────────────────

const c1a = buildC1();
const c2a = buildC2();
const c1b = buildC1();
const c2b = buildC2();
gateAssert(
  JSON.stringify(c1a) === JSON.stringify(c1b),
  "DET: component-1 double-build diverged (non-determinism)",
);
gateAssert(
  JSON.stringify(c2a) === JSON.stringify(c2b),
  "DET: component-2 double-build diverged (non-determinism)",
);

// ─── Component 3: load rehearsal-raw.jsonl ────────────────────────────────────

const rehearsalPath = join(OUT_DIR, "rehearsal-raw.jsonl");
let rehearsal: SftLine[] = [];
let rehearsalRawSha = "";
if (!existsSync(rehearsalPath)) {
  failures.push("C3: data/rehearsal-raw.jsonl missing — run gen-rehearsal.ts first");
} else {
  const rawText = readFileSync(rehearsalPath, "utf8");
  rehearsalRawSha = sha256(rawText);
  const raw = rawText
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { idx: number; prompt: string; response: string; system: string });
  gateAssert(raw.length === 60, `C3: expected 60 rehearsal completions, got ${raw.length}`);
  rehearsal = raw.map((r) => ({
    id: `rehearsal::${String(r.idx).padStart(2, "0")}`,
    song_id: "none",
    component: "rehearsal" as const,
    tools_key: "none" as const,
    messages: [
      { role: "system" as const, content: SYSTEM_TEXT },
      { role: "user" as const, content: r.prompt },
      { role: "assistant" as const, content: r.response },
    ],
  }));
  gateAssert(
    raw.every((r) => r.system === SYSTEM_TEXT),
    "C3: rehearsal completions were not generated under the pinned SYSTEM_TEXT",
  );
}

// ─── Assemble files ───────────────────────────────────────────────────────────

const trainLines: SftLine[] = [
  ...c1a.human,
  ...c1a.para,
  ...(c2a.train as unknown as SftLine[]),
  ...rehearsal,
];
const valJamLines: SftLine[] = innerValRecords.map((r) => toJamLine(r, "jam_human"));
const valGroundingLines = c2a.val as unknown as SftLine[];

// ─── G2: schema validity ──────────────────────────────────────────────────────

for (const r of trainRecords) {
  const report = validateTrace(r.target_trace as never, catalog);
  gateAssert(
    report.mismatches.length === 0,
    `G2: ${r.id} validateTrace mismatches: ${JSON.stringify(report.mismatches)}`,
  );
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
        if (v) gateAssert(v(tc.arguments) === true, `G2: ${line.id} args invalid for ${tc.name}: ${JSON.stringify(tc.arguments)}`);
      }
    }
    if (m.role === "tool") {
      gateAssert(
        inspectorValidators.has(m.name ?? ""),
        `G2: ${line.id} tool turn name "${m.name}" not in inspector catalog`,
      );
    }
  }
}
for (const line of trainLines) {
  if (line.tools_key !== "mcp41") continue;
  for (const m of line.messages) {
    if (m.role === "assistant" && m.tool_calls) {
      for (const tc of m.tool_calls) {
        gateAssert(
          catalog.tools.some((t) => t.name === tc.name),
          `G2: ${line.id} tool_call name "${tc.name}" not in 41-tool catalog`,
        );
      }
    }
  }
}

// ─── G3: byte round-trip ──────────────────────────────────────────────────────

for (const line of [...trainLines, ...valJamLines, ...valGroundingLines]) {
  const s = JSON.stringify(line);
  gateAssert(JSON.stringify(JSON.parse(s)) === s, `G3: ${line.id} round-trip drift`);
  for (const m of line.messages) {
    if (m.role === "tool") {
      try {
        JSON.parse(m.content);
      } catch {
        failures.push(`G3: ${line.id} tool turn content is not valid JSON`);
      }
    }
  }
}
{
  const ids = new Set<string>();
  for (const line of [...trainLines, ...valJamLines, ...valGroundingLines]) {
    gateAssert(!ids.has(line.id), `G3: duplicate line id ${line.id}`);
    ids.add(line.id);
  }
}

// ─── G4: exact counts ─────────────────────────────────────────────────────────

const byComponent = (c: string) => trainLines.filter((l) => l.component === c).length;
gateAssert(byComponent("jam_human") === 78, `G4: jam_human ${byComponent("jam_human")} != 78`);
gateAssert(byComponent("jam_para") === 156, `G4: jam_para ${byComponent("jam_para")} != 156`);
gateAssert(byComponent("grounding") === 200, `G4: grounding ${byComponent("grounding")} != 200`);
gateAssert(byComponent("rehearsal") === 60, `G4: rehearsal ${byComponent("rehearsal")} != 60`);
gateAssert(trainLines.length === 494, `G4: total ${trainLines.length} != 494`);
gateAssert(valJamLines.length === 25, `G4: val-jam ${valJamLines.length} != 25`);
gateAssert(valGroundingLines.length === 50, `G4: val-grounding ${valGroundingLines.length} != 50`);
{
  const perSong: Record<string, number> = {};
  for (const l of trainLines) {
    if (l.component === "jam_human") perSong[l.song_id] = (perSong[l.song_id] ?? 0) + 1;
  }
  for (const [song, expected] of Object.entries(EXPECTED_SONG_COUNTS)) {
    if (INNER_VAL_SONGS.has(song)) continue;
    gateAssert(perSong[song] === expected, `G4: ${song} jam_human ${perSong[song]} != ${expected}`);
  }
}
const groundingHistogram: Record<string, number> = {};
const formatHistogram: Record<string, number> = {};
let groundingItemsTrain = 0;
for (const l of c2a.train) {
  for (const v of l.verify) {
    groundingHistogram[v.family] = (groundingHistogram[v.family] ?? 0) + 1;
    formatHistogram[v.format] = (formatHistogram[v.format] ?? 0) + 1;
    groundingItemsTrain++;
  }
}

// ─── G5: contamination gate ───────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

const blacklist: string[] = [];
for (const r of records) {
  for (const q of generateQuestionSet(r as never).questions) {
    if (!isNotComputable(q)) blacklist.push(norm(q.questionText));
  }
}
gateAssert(blacklist.length > 700, `G5: blacklist unexpectedly small (${blacklist.length})`);

const HARNESS_MARKERS = [
  "options:",
  "respond with only",
  "single letter",
  "a, b, c, or d",
  "you are answering multiple-choice questions",
  "use the midi inspector tools as needed",
  "tool calls are free and fast",
];
const OPTION_BLOCK_RE = /\ba\)\s.*\bb\)\s.*\bc\)\s.*\bd\)\s/s;

const annotationNeedles: string[] = [];
for (const r of records) {
  const at = (r as PublicRecord).annotation_target;
  const push = (s?: string) => {
    if (s && s.length >= 15) annotationNeedles.push(norm(s));
  };
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
    for (const q of blacklist) {
      if (n.includes(q)) failures.push(`G5: ${line.id} contains blacklisted MCQ text: "${q.slice(0, 60)}…"`);
    }
    for (const marker of HARNESS_MARKERS) {
      if (n.includes(marker)) failures.push(`G5: ${line.id} contains harness marker "${marker}"`);
    }
    if (OPTION_BLOCK_RE.test(n)) failures.push(`G5: ${line.id} contains an A)/B)/C)/D) option block`);
    if (n.includes("clair")) failures.push(`G5: ${line.id} references clair-de-lune`);
    if (checkAnnotation) {
      for (const needle of annotationNeedles) {
        if (n.includes(needle)) {
          failures.push(`G5: ${line.id} contains annotation prose: "${needle.slice(0, 50)}…"`);
        }
      }
    }
  }
}
for (const line of trainLines) contaminationScan(line, line.component === "grounding");
for (const line of valGroundingLines) contaminationScan(line, true);
// Provenance boundary (P0-LOCK §4.5)
const gradientIds = new Set(gradientRecords.map((r) => r.id));
const innerValIds = new Set(innerValRecords.map((r) => r.id));
for (const l of c2a.train) {
  gateAssert(gradientIds.has(l.record_ref), `G5: train grounding ${l.id} refs non-gradient record`);
}
for (const l of c2a.val) {
  gateAssert(innerValIds.has(l.record_ref), `G5: val grounding ${l.id} refs non-inner-val record`);
}
for (const l of c1a.para) {
  gateAssert(gradientIds.has(l.record_ref ?? ""), `G5: paraphrase ${l.id} refs non-gradient record`);
}

// ─── G6b: inspector re-execution + answer containment ────────────────────────

import { INSPECTOR_TOOLS } from "../../../src/dataset/eval/midi-inspector.js";
const recordById = new Map(records.map((r) => [r.id, r]));
for (const l of [...c2a.train, ...c2a.val]) {
  const rec = recordById.get(l.record_ref);
  if (!rec) {
    failures.push(`G6b: ${l.id} record_ref not found`);
    continue;
  }
  const msgs = l.messages;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role === "assistant" && m.tool_calls) {
      for (let c = 0; c < m.tool_calls.length; c++) {
        const tc = m.tool_calls[c];
        const toolTurn = msgs[i + 1 + c];
        if (!toolTurn || toolTurn.role !== "tool" || toolTurn.name !== tc.name) {
          failures.push(`G6b: ${l.id} msg ${i}: tool turn misaligned for ${tc.name}`);
          continue;
        }
        const impl = INSPECTOR_TOOLS.find((t) => t.name === tc.name);
        if (!impl) {
          failures.push(`G6b: ${l.id} unknown tool ${tc.name}`);
          continue;
        }
        const expected = JSON.stringify(impl.run(rec as never, tc.arguments));
        if (expected !== toolTurn.content) {
          failures.push(`G6b: ${l.id} msg ${i + 1 + c}: tool result drift for ${tc.name}`);
        }
      }
    }
  }
  for (const v of l.verify) {
    const answer = msgs[v.answerMsgIndex];
    if (!answer || answer.role !== "assistant") {
      failures.push(`G6b: ${l.id} answerMsgIndex ${v.answerMsgIndex} is not an assistant turn`);
      continue;
    }
    for (const gold of v.golds) {
      if (!answerContains(answer.content, gold as never)) {
        failures.push(
          `G6b: ${l.id} answer fails containment for ${JSON.stringify(gold)}: "${answer.content.slice(0, 80)}"`,
        );
      }
    }
  }
}

// ─── G6c: paraphrase anchors + frozen turns ───────────────────────────────────

const humanById = new Map(c1a.human.map((l) => [l.record_ref ?? "", l]));
for (const l of c1a.para) {
  const human = humanById.get(l.record_ref ?? "");
  if (!human) {
    failures.push(`G6c: ${l.id} no matching human line`);
    continue;
  }
  gateAssert(l.messages.length === human.messages.length, `G6c: ${l.id} turn count differs from human`);
  const rec = recordById.get(l.record_ref ?? "") as PublicRecord;
  const [mStart, mEnd] = rec.annotation_target.measure_range;
  const anchor = SONG_DISPLAY[l.song_id]?.anchor ?? "";
  for (let i = 0; i < l.messages.length; i++) {
    const a = l.messages[i];
    const b = human.messages[i];
    if (a.role === "user") {
      gateAssert(
        a.content.includes(String(mStart)) && a.content.includes(String(mEnd)),
        `G6c: ${l.id} paraphrase missing literal measures ${mStart}/${mEnd}`,
      );
      gateAssert(a.content.includes(anchor), `G6c: ${l.id} paraphrase missing song anchor "${anchor}"`);
      gateAssert(a.content !== b.content, `G6c: ${l.id} paraphrase identical to human ask`);
    } else {
      gateAssert(
        JSON.stringify(a) === JSON.stringify(b),
        `G6c: ${l.id} msg ${i} (${a.role}) not byte-frozen vs human record`,
      );
    }
  }
}

// ─── G6a: MCP execution verification (async) ─────────────────────────────────

interface ToolResultShape {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

async function execVerifyMcp(): Promise<{ executed: number; unique: number; findings: string[] }> {
  // Calls byte-identical to a HUMAN-record call report failures as enumerated
  // findings (P0-LOCK amendment A1-v1: immutable published data); calls of
  // synthetic origin hard-fail the gate. All C1 calls are human-frozen by
  // construction (G6c) — the origin set is derived from the records directly.
  const humanCallKeys = new Set<string>();
  for (const r of trainRecords) {
    for (const turn of r.target_trace.session) {
      if (turn.role === "assistant" && turn.tool_calls) {
        for (const tc of turn.tool_calls) {
          humanCallKeys.add(`${tc.tool}|${JSON.stringify(tc.arguments)}`);
        }
      }
    }
  }
  const uniqueCalls = new Map<string, { name: string; arguments: Record<string, unknown> }>();
  for (const line of [...trainLines, ...valJamLines]) {
    if (line.tools_key !== "mcp41") continue;
    for (const m of line.messages) {
      if (m.role === "assistant" && m.tool_calls) {
        for (const tc of m.tool_calls) {
          uniqueCalls.set(`${tc.name}|${JSON.stringify(tc.arguments)}`, tc);
        }
      }
    }
  }
  const findings: string[] = [];
  const isolatedHome = mkdtempSync(join(tmpdir(), "ftv1-exec-"));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(REPO_ROOT, "dist", "mcp-server.js")],
    env: { ...process.env, HOME: isolatedHome, USERPROFILE: isolatedHome },
    cwd: REPO_ROOT,
  });
  const client = new Client({ name: "ftv1-exec-verify", version: "1.0.0" });
  await client.connect(transport);
  let executed = 0;
  try {
    for (const [key, tc] of uniqueCalls) {
      const res = (await client.callTool({ name: tc.name, arguments: tc.arguments })) as ToolResultShape;
      executed++;
      if (res.isError === true) {
        const errText = res.content
          .filter((c) => c.type === "text" && c.text)
          .map((c) => c.text)
          .join(" ")
          .slice(0, 160);
        if (humanCallKeys.has(key)) {
          findings.push(
            `A1-v1 finding: human-record call ${tc.name}(${JSON.stringify(tc.arguments)}) fails live execution: ${errText}`,
          );
        } else {
          failures.push(`G6a: synthetic call ${tc.name}(${JSON.stringify(tc.arguments)}) returned isError: ${errText}`);
        }
      }
      if (tc.name === "play_song") {
        await client.callTool({ name: "stop_playback", arguments: {} });
      }
    }
  } finally {
    await client.close();
  }
  return { executed, unique: uniqueCalls.size, findings };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const execStats = await execVerifyMcp();

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const gateReportPath = join(OUT_DIR, "P1v1-gate-report.json");

if (failures.length > 0) {
  writeFileSync(
    gateReportPath,
    JSON.stringify({ schema: "finetune-arc-v1-p1-gate/1.0.0", verdict: "FAIL", failures }, null, 2) + "\n",
    "utf8",
  );
  console.error(`P1-v1 GATE FAIL — ${failures.length} failure(s):`);
  for (const f of failures.slice(0, 25)) console.error(`  - ${f}`);
  process.exit(1);
}

// tools catalogs
const toolsMcp41 = readFileSync(join(V0_DATA_DIR, "tools.json"), "utf8");
const toolsInspector9 = JSON.stringify(
  {
    source: "src/dataset/eval/midi-inspector.ts inspectorToolSchemas()",
    tool_count: inspectorSchemas.length,
    tools: inspectorSchemas,
  },
  null,
  2,
) + "\n";

const trainText = trainLines.map((l) => JSON.stringify(l)).join("\n") + "\n";
const valJamText = valJamLines.map((l) => JSON.stringify(l)).join("\n") + "\n";
const valGroundText = valGroundingLines.map((l) => JSON.stringify(l)).join("\n") + "\n";

// v0 inner-val message-content parity assert (P0-LOCK §8: byte-identical val)
{
  const v0Val = readFileSync(join(V0_DATA_DIR, "sft-inner-val.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { id: string; messages: unknown });
  const v0ById = new Map(v0Val.map((l) => [l.id, JSON.stringify(l.messages)]));
  for (const l of valJamLines) {
    if (v0ById.get(l.id) !== JSON.stringify(l.messages)) {
      console.error(`FATAL: val-jam ${l.id} messages differ from v0 sft-inner-val.jsonl`);
      process.exit(1);
    }
  }
}

writeFileSync(join(OUT_DIR, "sft-train-v1.jsonl"), trainText, "utf8");
writeFileSync(join(OUT_DIR, "sft-val-jam.jsonl"), valJamText, "utf8");
writeFileSync(join(OUT_DIR, "sft-val-grounding.jsonl"), valGroundText, "utf8");
writeFileSync(join(OUT_DIR, "tools-mcp41.json"), toolsMcp41, "utf8");
writeFileSync(join(OUT_DIR, "tools-inspector9.json"), toolsInspector9, "utf8");

const report = {
  schema: "finetune-arc-v1-p1-gate/1.0.0",
  verdict: "PASS",
  generated_by: "experiments/finetune-arc-v1/scripts/build-v1-data.ts",
  lock: "experiments/finetune-arc-v1/P0-LOCK.md",
  inputs: {
    records_jsonl_sha256: sha256(readFileSync(recordsPath, "utf8")),
    splits_json_sha256: sha256(readFileSync(splitsPath, "utf8")),
    tool_schemas_sha256: sha256(readFileSync(join(REPO_ROOT, "src", "dataset", "tool-schemas.json"), "utf8")),
    midi_inspector_sha256: sha256(readFileSync(join(REPO_ROOT, "src", "dataset", "eval", "midi-inspector.ts"), "utf8")),
    rehearsal_raw_sha256: rehearsalRawSha,
    scripts: {
      "build-v1-data.ts": sha256(readFileSync(join(__dirname, "build-v1-data.ts"), "utf8")),
      "paraphrase-bank.ts": sha256(readFileSync(join(__dirname, "paraphrase-bank.ts"), "utf8")),
      "grounding-gen.ts": sha256(readFileSync(join(__dirname, "grounding-gen.ts"), "utf8")),
      "det-util.ts": sha256(readFileSync(join(__dirname, "det-util.ts"), "utf8")),
      "gen-rehearsal.ts": sha256(readFileSync(join(__dirname, "gen-rehearsal.ts"), "utf8")),
    },
  },
  system_text: SYSTEM_TEXT,
  counts: {
    train_total: trainLines.length,
    jam_human: 78,
    jam_para: 156,
    grounding_sessions: 200,
    grounding_items: groundingItemsTrain,
    rehearsal: rehearsal.length,
    val_jam: valJamLines.length,
    val_grounding_sessions: valGroundingLines.length,
  },
  histograms: {
    grounding_families: groundingHistogram,
    grounding_formats: formatHistogram,
  },
  gates: {
    G1_split_integrity: "PASS",
    G2_schema_validity: "PASS",
    G3_byte_round_trip: "PASS",
    G4_counts: "PASS",
    G5_contamination: {
      verdict: "PASS",
      mcq_blacklist_size: blacklist.length,
      annotation_needles: annotationNeedles.length,
      harness_markers: HARNESS_MARKERS.length,
    },
    G6a_mcp_execution: {
      verdict: execStats.findings.length > 0 ? "PASS_WITH_FINDINGS" : "PASS",
      unique_calls: execStats.unique,
      executed: execStats.executed,
      findings: execStats.findings,
    },
    G6b_inspector_reexecution: "PASS",
    G6c_paraphrase_anchors: "PASS",
    DET_double_build: "PASS",
    G7_render_failfast: "DEFERRED — render-check-v1.py (training venv) + on-pod stage0",
  },
  outputs: {
    "sft-train-v1.jsonl": sha256(trainText),
    "sft-val-jam.jsonl": sha256(valJamText),
    "sft-val-grounding.jsonl": sha256(valGroundText),
    "tools-mcp41.json": sha256(toolsMcp41),
    "tools-inspector9.json": sha256(toolsInspector9),
  },
};
writeFileSync(gateReportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log("P1-v1 GATE PASS");
console.log(`  train 494 (78 human + 156 para + 200 grounding + 60 rehearsal)`);
console.log(`  grounding items: ${groundingItemsTrain} | families: ${JSON.stringify(groundingHistogram)}`);
console.log(`  formats: ${JSON.stringify(formatHistogram)}`);
console.log(`  G6a executed ${execStats.executed}/${execStats.unique} unique MCP calls`);
console.log(`  report: ${gateReportPath}`);
