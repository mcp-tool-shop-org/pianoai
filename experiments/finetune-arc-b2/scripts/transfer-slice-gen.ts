#!/usr/bin/env tsx
// ─── transfer-slice-gen.ts — Finetune Arc B-2, §6.5 memorization transfer slice ─
//
// P0-LOCK.md (B-2) §6.5: a small HELD-OUT diagnostic of `full`-surface
// aggregation questions over LONGER note-lists and NOVEL phrasing than C3
// trained on. It detects whether any C3 gain is real generalization or template
// subgraph-matching (Dziri arXiv:2305.18654). DIAGNOSTIC ONLY — reported
// descriptively by P6, never pooled into the primary/secondary bars.
//
// Held-out by construction:
//   - drawn from the INNER-VAL records (chopin-prelude-e-minor, fur-elise) —
//     C3 draws ONLY from the 78 gradient records, so these note-lists never
//     appeared in training;
//   - the whole-phrase note list is presented in-context (LONGER than C3's
//     per-family retrieval), with a DISTINCT question bank (novel phrasing);
//   - clair-de-lune is untouched (the test song stays sealed for the cohort).
//
// Each item is a self-contained {context, question, gold} the P5 eval poses to
// the model on the `full` surface (raw notes in-context, no tool); the answer is
// scored by the shared containment matcher. Deterministic: makeLcg("ftb2:transfer").
// This is NOT training data — no assistant turn.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { INSPECTOR_TOOLS, pitchClassName } from "../../../src/dataset/eval/midi-inspector.js";
import { SONG_DISPLAY } from "../../finetune-arc-v1/scripts/paraphrase-bank.js";
import { makeLcg, lcgInt, lcgShuffle, hashString } from "./det-b2.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const WS_RECORDS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0", "records");
const PUBLIC_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0-public");
const OUT_DIR = join(__dirname, "..", "data");

const INNER_VAL_SONGS = new Set(["chopin-prelude-e-minor", "fur-elise"]);

interface Ev { hand: "right" | "left"; measure: number; beat: number; pitch: number; name: string }

function loadInnerValRecords(): Array<{ id: string; scope: { song_id: string; phrase_window: string }; ev: Ev[] }> {
  const splits = JSON.parse(readFileSync(join(PUBLIC_DIR, "splits.json"), "utf8")) as { train: string[] };
  const rename: Record<string, string> = {
    "bach-prelude-c-major-bwv846:m061-064:piano:mcp-session:v1": "bach-prelude-c-major-bwv846:m061-062:piano:mcp-session:v1",
  };
  const out: Array<{ id: string; scope: { song_id: string; phrase_window: string }; ev: Ev[] }> = [];
  const getHand = INSPECTOR_TOOLS.find((t) => t.name === "get_events_in_hand")!;
  for (const rawId of splits.train) {
    const id = rename[rawId] ?? rawId;
    const file = join(WS_RECORDS_DIR, `${id.replace(/:piano:mcp-session:v1$/, "").replace(/:/g, "-")}.json`);
    const r = JSON.parse(readFileSync(file, "utf8")) as { id: string; scope: { song_id: string; phrase_window: string } };
    if (!INNER_VAL_SONGS.has(r.scope.song_id)) continue;
    const ev = [
      ...(getHand.run(r as never, { hand: "right" }) as Ev[]),
      ...(getHand.run(r as never, { hand: "left" }) as Ev[]),
    ].filter((e) => e && (e.hand === "right" || e.hand === "left"));
    out.push({ id: r.id, scope: r.scope, ev });
  }
  return out;
}

/** Whole-phrase note list, chunked by measure/hand — the LONG in-context list. */
function fullList(ev: Ev[]): string {
  const measures = [...new Set(ev.map((e) => e.measure))].sort((a, b) => a - b);
  return measures.map((m) => {
    const inM = ev.filter((e) => e.measure === m);
    const rh = inM.filter((e) => e.hand === "right").map((e) => e.name);
    const lh = inM.filter((e) => e.hand === "left").map((e) => e.name);
    const parts: string[] = [];
    if (lh.length) parts.push(`LH ${lh.join(" ")}`);
    if (rh.length) parts.push(`RH ${rh.join(" ")}`);
    return `m${m}: ${parts.join(" | ")}`;
  }).join("\n");
}

// NOVEL phrasing bank — deliberately distinct from C3's question templates.
const Q_PITCH = [
  (pc: string) => `Tally up every ${pc} you can see in the notes above and give the total.`,
  (pc: string) => `Scanning the full list, what is the running total of ${pc} occurrences?`,
];
const Q_DISTINCT = [
  `Across everything shown, how many different letter-names (pitch classes) are in play?`,
  `Take the whole list and tell me the size of the pitch-class vocabulary.`,
];
const Q_HAND = [
  (h: string) => `Sweep through the ${h}-hand entries only and report how many there are.`,
  (h: string) => `Restricting to the ${h} hand across the whole excerpt, what's the tally?`,
];

interface TransferItem {
  id: string;
  record_ref: string;
  song_id: string;
  surface: "full";
  context: string;
  question: string;
  gold: { kind: "number"; value: number };
  note_list_length: number;
  family: string;
}

function main(): void {
  const recs = loadInnerValRecords();
  const lcg = makeLcg(hashString("ftb2:transfer"));
  // Prefer the longest note-lists (LONGER than C3's typical per-family slice).
  const sorted = [...recs].sort((a, b) => b.ev.length - a.ev.length);
  const chosen = sorted.slice(0, Math.min(24, sorted.length));
  const items: TransferItem[] = [];
  let idx = 0;
  for (const r of lcgShuffle(chosen, lcg)) {
    const ev = r.ev;
    const list = fullList(ev);
    const song = SONG_DISPLAY[r.scope.song_id]?.display ?? r.scope.song_id;
    const header = `${song}, ${r.scope.phrase_window}. Here is the full note list:\n${list}`;
    const fam = lcgInt(lcg, 3);
    let question: string;
    let gold: number;
    let family: string;
    if (fam === 0) {
      const present = [...new Set(ev.map((e) => pitchClassName(e.pitch)))].sort();
      const pc = present[lcgInt(lcg, present.length)];
      question = Q_PITCH[lcgInt(lcg, Q_PITCH.length)](pc);
      gold = ev.filter((e) => pitchClassName(e.pitch) === pc).length;
      family = "pitch_class_count";
    } else if (fam === 1) {
      question = Q_DISTINCT[lcgInt(lcg, Q_DISTINCT.length)];
      gold = new Set(ev.map((e) => pitchClassName(e.pitch))).size;
      family = "distinct_pitch_classes";
    } else {
      const hands = (["right", "left"] as const).filter((h) => ev.some((e) => e.hand === h));
      const h = hands[lcgInt(lcg, hands.length)];
      question = Q_HAND[lcgInt(lcg, Q_HAND.length)](h);
      gold = ev.filter((e) => e.hand === h).length;
      family = "hand_note_count";
    }
    items.push({
      id: `transfer::${String(idx).padStart(3, "0")}`,
      record_ref: r.id,
      song_id: r.scope.song_id,
      surface: "full",
      context: header,
      question,
      gold: { kind: "number", value: gold },
      note_list_length: ev.length,
      family,
    });
    idx++;
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "transfer-slice-b2.jsonl"), items.map((i) => JSON.stringify(i)).join("\n") + "\n", "utf8");
  const lens = items.map((i) => i.note_list_length);
  console.log(`[transfer-slice] wrote ${items.length} held-out full-surface items -> data/transfer-slice-b2.jsonl`);
  console.log(`  note-list lengths: min ${Math.min(...lens)} / mean ${Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)} / max ${Math.max(...lens)}`);
  console.log(`  families: ${JSON.stringify(items.reduce((acc, i) => ({ ...acc, [i.family]: (acc[i.family] ?? 0) + 1 }), {} as Record<string, number>))}`);
}

main();
