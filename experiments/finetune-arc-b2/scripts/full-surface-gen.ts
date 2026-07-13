// ─── full-surface-gen.ts — Finetune Arc B-2, component 3 (full-surface QA) ───
//
// P0-LOCK.md (B-2) §4-C3: teach answering aggregation questions from the raw
// MIDI events in-context (the `full` eval surface), pedagogy-shaped (§1b):
//
//   - the assistant RETRIEVES the raw events with the inspector (a real,
//     re-executable call), then does the aggregation ITSELF over the returned
//     events — an explicit enumerate→group-by→count worked procedure. This is
//     the competence the `full` surface needs: a 7B can't match a counting
//     TOOL at exact aggregation, so we teach the PROCEDURE, co-trained with the
//     retrieval (ToRA-style), not a disjoint counting surface.
//   - TERSE atomic steps, not narrated chains (small models learn worse from
//     long chains — Li 2025); one enumerate line, one group-by-count line.
//   - EVIDENCE BEFORE CONCLUSION — the retrieved events are quoted (chunked by
//     measure and hand) BEFORE the answer sentence (Kodály's transferable
//     kernel; Gordon MLT chunking).
//   - a MINORITY backward-faded — the group-by line is omitted so the answer
//     jumps enumerate→count (Sweller/Cooper 1985), varying the template.
//   - list length / note density / question phrasing vary (anti-memorization;
//     Dziri subgraph-matching risk). Drawn from the 78 GRADIENT records only.
//
// Every fact is re-derived from a real inspector call the gate re-executes
// (G6b-analog); the gold count is verified by the containment matcher.
// Fully deterministic: makeLcg(hashString(streamTag)). Disjoint stream tag
// "ftb2:full" (never collides with v1's "ftv1:ground").
// ─────────────────────────────────────────────────────────────────────────────

import {
  INSPECTOR_TOOLS,
  pitchClassName,
} from "../../../src/dataset/eval/midi-inspector.js";
import type { E3Record } from "../../../src/dataset/eval/annotation-grounding.js";
import type { GoldSpec, SftMessage } from "../../finetune-arc-v1/scripts/grounding-gen.js";
import { SONG_DISPLAY } from "../../finetune-arc-v1/scripts/paraphrase-bank.js";
import { makeLcg, lcgInt, lcgShuffle, hashString } from "./det-b2.js";

// ─── Shape (mirrors v1's GroundingLine; component name differs) ──────────────

export interface FullSurfaceLine {
  id: string;
  song_id: string;
  component: "full_surface_qa";
  tools_key: "inspector9";
  record_ref: string;
  messages: SftMessage[];
  /** Same gate anchors as C2: per QA item, the answer turn index + golds. The
   *  builder's G6b re-execution walks messages for the retrieval calls too. */
  verify: Array<{ family: string; format: string; answerMsgIndex: number; golds: GoldSpec[] }>;
}

type Rec = E3Record & { id: string; scope: { song_id: string; phrase_window: string } };

interface Ev {
  hand: "right" | "left";
  measure: number;
  beat: number;
  pitch: number;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function runTool(rec: Rec, name: string, args: Record<string, unknown>): unknown {
  const tool = INSPECTOR_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`unknown inspector tool ${name}`);
  return tool.run(rec, args);
}

/** A retrieval call turn-pair: [assistant(intent+call), tool(result)]. */
function callTurns(
  rec: Rec,
  intent: string,
  name: string,
  args: Record<string, unknown>,
): { turns: SftMessage[]; result: unknown } {
  const result = runTool(rec, name, args);
  return {
    turns: [
      { role: "assistant", content: intent, tool_calls: [{ name, arguments: args }] },
      { role: "tool", name, content: JSON.stringify(result) },
    ],
    result,
  };
}

function pick<T>(lcg: () => number, arr: T[]): T {
  return arr[lcgInt(lcg, arr.length)];
}

const RETRIEVE_INTENTS = [
  "Let me pull the actual events and count them myself.",
  "I'll retrieve the raw notes and work through it.",
  "Let me get the events so I can enumerate them.",
  "I'll list the notes out and tally them.",
];

const RETRIEVE_INTENTS_2 = [
  "And the other hand.",
  "Now the left-hand events.",
  "Same for the other hand.",
];

function evOf(result: unknown): Ev[] {
  return (result as Ev[]).filter((e) => e && (e.hand === "right" || e.hand === "left"));
}

/** Chunk events into an evidence string grouped by measure, then hand within
 *  the measure. e.g. "m9 — LH A3; RH C4, E4, G4. m10 — RH C5." (Gordon MLT). */
function enumerateByMeasure(events: Ev[]): string {
  const measures = [...new Set(events.map((e) => e.measure))].sort((a, b) => a - b);
  const chunks: string[] = [];
  for (const m of measures) {
    const inM = events.filter((e) => e.measure === m);
    const rh = inM.filter((e) => e.hand === "right").map((e) => e.name);
    const lh = inM.filter((e) => e.hand === "left").map((e) => e.name);
    const parts: string[] = [];
    if (lh.length) parts.push(`LH ${lh.join(", ")}`);
    if (rh.length) parts.push(`RH ${rh.join(", ")}`);
    chunks.push(`m${m} — ${parts.join("; ")}`);
  }
  return chunks.join(". ") + ".";
}

// ─── Families ─────────────────────────────────────────────────────────────────

interface FsFamily {
  key: string;
  applicable: (rec: Rec) => boolean;
  build: (rec: Rec, lcg: () => number, faded: boolean) => FsItem | null;
}

interface FsItem {
  family: string;
  faded: boolean;
  question: string;
  turns: SftMessage[];
  golds: GoldSpec[];
}

function events(rec: Rec): Ev[] {
  return evOf(runTool(rec, "get_events_in_hand", { hand: "right" }))
    .concat(evOf(runTool(rec, "get_events_in_hand", { hand: "left" })));
}

/** Retrieve all events via a right-then-left call pair. */
function retrieveBothHands(rec: Rec, lcg: () => number): { turns: SftMessage[]; all: Ev[] } {
  const r = callTurns(rec, pick(lcg, RETRIEVE_INTENTS), "get_events_in_hand", { hand: "right" });
  const l = callTurns(rec, pick(lcg, RETRIEVE_INTENTS_2), "get_events_in_hand", { hand: "left" });
  return { turns: [...r.turns, ...l.turns], all: [...evOf(r.result), ...evOf(l.result)] };
}

// FS1 — pitch-class count over the whole phrase.
const FS1: FsFamily = {
  key: "FS1_pitch_class_count",
  applicable: (rec) => events(rec).length > 0,
  build: (rec, lcg, faded) => {
    const present = [...new Set(events(rec).map((e) => pitchClassName(e.pitch)))].sort();
    const pc = pick(lcg, present);
    const { turns, all } = retrieveBothHands(rec, lcg);
    const matches = all.filter((e) => pitchClassName(e.pitch) === pc);
    const gold = matches.length;
    const qs = [
      `Reading the raw notes, how many ${pc}s are in this passage?`,
      `Count every ${pc} across these measures from the events themselves.`,
      `From the note list, how many times does pitch class ${pc} occur?`,
      `Working from the actual events: total ${pc} count?`,
    ];
    const evidence = enumerateByMeasure(all);
    const matchList = matches.map((e) => `${e.name} (m${e.measure})`).join(", ");
    const answer = faded
      ? `Events: ${evidence} Counting the ${pc}s gives ${gold}.`
      : `Events: ${evidence} Now the ${pc}s only: ${matchList || "none"}. That's ${gold}.`;
    turns.push({ role: "assistant", content: answer });
    return { family: FS1.key, faded, question: pick(lcg, qs), turns, golds: [{ kind: "number", value: gold }] };
  },
};

// FS2 — downbeat onsets (retrieve the matched events via the inspector, then
// enumerate the evidence and state the count).
const FS2: FsFamily = {
  key: "FS2_downbeat_onsets",
  applicable: (rec) => (runTool(rec, "count_beat_1_onsets", {}) as { count: number }).count > 0,
  build: (rec, lcg, faded) => {
    const { turns, result } = callTurns(rec, pick(lcg, RETRIEVE_INTENTS), "count_beat_1_onsets", {});
    const r = result as { count: number; events: Ev[] };
    const gold = r.count;
    const qs = [
      `How many notes land on a downbeat in this phrase? Work it from the events.`,
      `From the raw onsets, count the downbeat attacks.`,
      `Reading the events, how many notes strike beat one of their measure?`,
    ];
    const evidence = enumerateByMeasure(evOf(r.events));
    const answer = faded
      ? `Downbeat events: ${evidence} That's ${gold}.`
      : `Downbeat events: ${evidence} Counting them: ${gold} notes on a downbeat.`;
    turns.push({ role: "assistant", content: answer });
    return { family: FS2.key, faded, question: pick(lcg, qs), turns, golds: [{ kind: "number", value: gold }] };
  },
};

// FS3 — note count in a single measure.
const FS3: FsFamily = {
  key: "FS3_measure_note_count",
  applicable: (rec) => events(rec).length > 0,
  build: (rec, lcg, faded) => {
    const ms = [...new Set(events(rec).map((e) => e.measure))].sort((a, b) => a - b);
    const m = pick(lcg, ms);
    const { turns, result } = callTurns(rec, pick(lcg, RETRIEVE_INTENTS), "get_events_in_measure", {
      measure_number: m,
    });
    const inM = evOf(result);
    const gold = inM.length;
    const qs = [
      `How many notes sound in measure ${m}? Count them from the events.`,
      `From the raw events of bar ${m}, how many notes are there?`,
      `Reading measure ${m} directly, what's the note count?`,
    ];
    const rh = inM.filter((e) => e.hand === "right").map((e) => e.name);
    const lh = inM.filter((e) => e.hand === "left").map((e) => e.name);
    const evidence = `m${m} — ${lh.length ? `LH ${lh.join(", ")}` : ""}${lh.length && rh.length ? "; " : ""}${rh.length ? `RH ${rh.join(", ")}` : ""}.`;
    const answer = faded
      ? `Events: ${evidence} That's ${gold} notes.`
      : `Events: ${evidence} Tallying both hands: ${gold} notes in measure ${m}.`;
    turns.push({ role: "assistant", content: answer });
    return { family: FS3.key, faded, question: pick(lcg, qs), turns, golds: [{ kind: "number", value: gold }] };
  },
};

// FS4 — note count for a single hand across the phrase.
const FS4: FsFamily = {
  key: "FS4_hand_note_count",
  applicable: (rec) => (["right", "left"] as const).some((h) => events(rec).some((e) => e.hand === h)),
  build: (rec, lcg, faded) => {
    const hands = (["right", "left"] as const).filter((h) => events(rec).some((e) => e.hand === h));
    const hand = pick(lcg, [...hands]);
    const { turns, result } = callTurns(rec, pick(lcg, RETRIEVE_INTENTS), "get_events_in_hand", { hand });
    const arr = evOf(result);
    const gold = arr.length;
    const hw = hand === "right" ? "right" : "left";
    const qs = [
      `How many notes does the ${hw} hand play here? Count from the events.`,
      `From the raw ${hw}-hand events, what's the total note count?`,
      `Reading just the ${hw} hand, how many notes is that?`,
    ];
    const evidence = enumerateByMeasure(arr);
    const answer = faded
      ? `${hw[0].toUpperCase()}${hw.slice(1)}-hand events: ${evidence} That's ${gold}.`
      : `${hw[0].toUpperCase()}${hw.slice(1)}-hand events: ${evidence} Counting them: ${gold} notes.`;
    turns.push({ role: "assistant", content: answer });
    return { family: FS4.key, faded, question: pick(lcg, qs), turns, golds: [{ kind: "number", value: gold }] };
  },
};

// FS5 — how many DISTINCT pitch classes.
const FS5: FsFamily = {
  key: "FS5_distinct_pitch_classes",
  applicable: (rec) => events(rec).length > 0,
  build: (rec, lcg, faded) => {
    const { turns, all } = retrieveBothHands(rec, lcg);
    const distinct = [...new Set(all.map((e) => pitchClassName(e.pitch)))].sort();
    const gold = distinct.length;
    const qs = [
      `How many distinct pitch classes does this passage use? Derive it from the notes.`,
      `From the raw events, count the unique pitch classes.`,
      `Reading the note list, how many different pitch classes appear?`,
    ];
    const evidence = enumerateByMeasure(all);
    const answer = faded
      ? `Events: ${evidence} The distinct set has ${gold}.`
      : `Events: ${evidence} Distinct pitch classes: ${distinct.join(", ")} — that's ${gold}.`;
    turns.push({ role: "assistant", content: answer });
    return { family: FS5.key, faded, question: pick(lcg, qs), turns, golds: [{ kind: "number", value: gold }] };
  },
};

const FS_FAMILIES: FsFamily[] = [FS1, FS2, FS3, FS4, FS5];

// ─── Session assembly ─────────────────────────────────────────────────────────

const CONTEXT_HEADERS = [
  (song: string, pw: string) => `We're on ${song}, ${pw}.`,
  (song: string, pw: string) => `Looking at ${song} — ${pw}.`,
  (song: string, pw: string) => `${song}, ${pw}. I want to work this from the notes themselves.`,
];

export interface FullSurfacePlanOpts {
  records: Rec[];
  /** Total number of full-surface QA lines (one QA per line — single-turn). */
  total: number;
  /** Fraction of lines that are backward-faded (group-by step omitted). */
  fadedFraction: number;
  streamTag: string;
  systemText: string;
}

export function generateFullSurfaceQa(opts: FullSurfacePlanOpts): FullSurfaceLine[] {
  const { records, total, fadedFraction, streamTag, systemText } = opts;
  const lcg = makeLcg(hashString(streamTag));

  // Assignment: round-robin over records (varied densities), remainder LCG-picked.
  const base: Rec[] = [];
  let i = 0;
  while (base.length < total) {
    base.push(records[i % records.length]);
    i++;
  }
  const assignment = lcgShuffle(base, lcg);

  // Faded plan: a shuffled boolean mask sized to fadedFraction.
  const nFaded = Math.round(total * fadedFraction);
  const fadedMask = lcgShuffle(
    [...Array(nFaded).fill(true), ...Array(total - nFaded).fill(false)],
    lcg,
  ) as boolean[];

  // Family cycle: shuffled decks so families interleave, not block by record.
  let deck: FsFamily[] = [];
  const nextFamily = (): FsFamily => {
    if (deck.length === 0) deck = lcgShuffle([...FS_FAMILIES], lcg);
    return deck.pop()!;
  };

  const lines: FullSurfaceLine[] = [];
  for (let s = 0; s < total; s++) {
    const rec = assignment[s];
    const faded = fadedMask[s];
    const itemLcg = makeLcg(hashString(`${streamTag}:${rec.id}:s${s}`));
    const songMeta = SONG_DISPLAY[rec.scope.song_id];
    if (!songMeta) throw new Error(`no SONG_DISPLAY for ${rec.scope.song_id}`);

    // Draw an applicable family (prefer the deck order; fall back within a deck).
    let item: FsItem | null = null;
    for (let tries = 0; tries < 24 && !item; tries++) {
      const fam = nextFamily();
      if (!fam.applicable(rec)) continue;
      item = fam.build(rec, itemLcg, faded);
    }
    if (!item) throw new Error(`no applicable full-surface family for ${rec.id} (line ${s})`);

    const header = pick(itemLcg, CONTEXT_HEADERS)(songMeta.display, rec.scope.phrase_window);
    const messages: SftMessage[] = [
      { role: "system", content: systemText },
      { role: "user", content: `${header}\n\n${item.question}` },
      ...item.turns,
    ];
    lines.push({
      id: `${rec.id}::fullqa::s${s}`,
      song_id: rec.scope.song_id,
      component: "full_surface_qa",
      tools_key: "inspector9",
      record_ref: rec.id,
      messages,
      verify: [
        {
          family: item.family,
          format: item.faded ? "faded" : "worked",
          answerMsgIndex: messages.length - 1,
          golds: item.golds,
        },
      ],
    });
  }
  return lines;
}
