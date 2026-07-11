// ─── grounding-gen.ts — Finetune Arc v1, component 2 (grounding traces) ──────
//
// P0-LOCK.md §3-C2: multi-turn free-form QA sessions where the assistant
// answers musical questions about a TRAIN-record phrase by calling the
// 9-tool inspector surface, grounded in the REAL executed result.
//
//   - 9 question families (F1–F9), ≥4 structural question surfaces each
//     (findings 34/35/36) — independently authored, NEVER the harness's MCQ
//     templates (gate G5 asserts mechanically).
//   - Answer formats: sentence / terse / yesno ≈ 65 / 23 / 12 (findings 37/43).
//   - Session lengths 1/2/3 QA ≈ 60/25/15 (findings 39/40).
//   - NO annotation prose, NO option lists, NO letter answers (P0-LOCK §4).
//   - Gold values computed by executing the real inspector functions — the
//     tool is the verifier (gate G6b re-executes and byte-compares).
//
// Fully deterministic: every choice flows from makeLcg(hashString(streamTag)).
// ─────────────────────────────────────────────────────────────────────────────

import {
  INSPECTOR_TOOLS,
  noteName,
  pitchClassName,
} from "../../../src/dataset/eval/midi-inspector.js";
import type { E3Record } from "../../../src/dataset/eval/annotation-grounding.js";
import { makeLcg, lcgInt, lcgShuffle, hashString } from "./det-util.js";
import { SONG_DISPLAY } from "./paraphrase-bank.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnswerFormat = "sentence" | "terse" | "yesno";

export interface GoldSpec {
  kind: "number" | "note" | "hand" | "yesno";
  value: number | string | boolean;
}

export interface SftMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  name?: string;
}

export interface GroundingLine {
  id: string;
  song_id: string;
  component: "grounding";
  tools_key: "inspector9";
  record_ref: string;
  messages: SftMessage[];
  /** Gate G6b verification anchors: per QA item, the message index of its
   *  final answer turn and the gold values that must pass containment. */
  verify: Array<{ family: string; format: AnswerFormat; answerMsgIndex: number; golds: GoldSpec[] }>;
}

interface QaItem {
  family: string;
  format: AnswerFormat;
  question: string;
  /** assistant/tool turns: [asst(call), tool, (asst(call), tool,)? asst(answer)] */
  turns: SftMessage[];
  golds: GoldSpec[];
}

type Rec = E3Record & { id: string; scope: { song_id: string; phrase_window: string } };

// ─── Small helpers ────────────────────────────────────────────────────────────

function runTool(rec: Rec, name: string, args: Record<string, unknown>): unknown {
  const tool = INSPECTOR_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`unknown inspector tool ${name}`);
  return tool.run(rec, args);
}

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

const INTENTS = [
  "Let me check that against the actual MIDI events.",
  "I'll look that up with the inspector.",
  "Let me pull the real note data.",
  "Checking the phrase data now.",
  "Good question — let me inspect the events rather than guess.",
];

function events(rec: Rec) {
  return rec.observation.midi_sidecar.timed_events;
}

function singleNotePositions(rec: Rec): Array<{ hand: "right" | "left"; measure: number; beat: number; note: number }> {
  const map = new Map<string, Array<{ hand: "right" | "left"; measure: number; beat: number; note: number }>>();
  for (const e of events(rec)) {
    if (e.hand !== "right" && e.hand !== "left") continue;
    const key = `${e.hand}|${e.measure}|${e.beat}`;
    const arr = map.get(key) ?? [];
    arr.push({ hand: e.hand, measure: e.measure, beat: e.beat, note: e.note });
    map.set(key, arr);
  }
  return [...map.values()].filter((a) => a.length === 1).map((a) => a[0]);
}

function uniqueMeasures(rec: Rec): number[] {
  return [...new Set(events(rec).map((e) => e.measure))].sort((a, b) => a - b);
}

const handWord = (h: "right" | "left") => (h === "right" ? "right" : "left");

// ─── Families ─────────────────────────────────────────────────────────────────
//
// Each family: applicable(rec) + build(rec, lcg, format) → QaItem | null.
// Question surfaces are structurally varied and DISJOINT from the harness's
// seven MCQ templates (gate G5 re-asserts on every build).

interface Family {
  key: string;
  terseOk: boolean;
  applicable: (rec: Rec) => boolean;
  build: (rec: Rec, lcg: () => number, format: AnswerFormat) => QaItem | null;
}

const F1: Family = {
  key: "F1_position_lookup",
  terseOk: true,
  applicable: (rec) => singleNotePositions(rec).length > 0,
  build: (rec, lcg, format) => {
    const pos = pick(lcg, singleNotePositions(rec));
    const gold = noteName(pos.note);
    const h = handWord(pos.hand);
    const qs = [
      `What note lands at beat ${pos.beat} of measure ${pos.measure} in the ${h} hand?`,
      `At bar ${pos.measure}, beat ${pos.beat} — what's the ${h}-hand note there?`,
      `Tell me the ${h}-hand pitch at measure ${pos.measure}, beat ${pos.beat}.`,
      `If I stop at beat ${pos.beat} of bar ${pos.measure}, what am I hearing from the ${h} hand?`,
      `The ${h} hand at measure ${pos.measure}, beat ${pos.beat} — what note is that?`,
    ];
    let question = pick(lcg, qs);
    const { turns } = callTurns(rec, pick(lcg, INTENTS), "get_pitch_at", {
      measure: pos.measure,
      beat: pos.beat,
      hand: pos.hand,
    });
    let answer: string;
    if (format === "terse") {
      question += " Just the note name.";
      answer = `${gold}.`;
    } else {
      answer = pick(lcg, [
        `That's ${gold} — the ${h} hand at beat ${pos.beat} of measure ${pos.measure}.`,
        `The inspector shows ${gold} there: ${h} hand, measure ${pos.measure}, beat ${pos.beat}.`,
        `You're hearing ${gold} at that spot in the ${h} hand.`,
        `Measure ${pos.measure}, beat ${pos.beat} in the ${h} hand is ${gold}.`,
      ]);
    }
    turns.push({ role: "assistant", content: answer });
    return { family: F1.key, format, question, turns, golds: [{ kind: "note", value: gold }] };
  },
};

const F2: Family = {
  key: "F2_extremes",
  terseOk: true,
  applicable: (rec) => events(rec).length > 0,
  build: (rec, lcg, format) => {
    const dir = pick(lcg, ["highest", "lowest"] as const);
    const scopes: Array<"both" | "right" | "left"> = ["both"];
    if (events(rec).some((e) => e.hand === "right")) scopes.push("right");
    if (events(rec).some((e) => e.hand === "left")) scopes.push("left");
    const scope = pick(lcg, scopes);
    const args: Record<string, unknown> = scope === "both" ? {} : { hand: scope };
    const toolName = dir === "highest" ? "find_highest_pitch" : "find_lowest_pitch";
    const result = runTool(rec, toolName, args) as { name: string; measure: number } | null;
    if (!result) return null;
    const gold = result.name;
    const scopeText = scope === "both" ? "in this phrase" : `in the ${scope} hand here`;
    const qs = [
      `What's the ${dir} note ${scopeText}?`,
      `Where does the ${dir === "highest" ? "top" : "bottom"} of the range sit ${scopeText}?`,
      `How ${dir === "highest" ? "high" : "low"} does it go ${scopeText} — which note?`,
      `Find me the single ${dir} pitch ${scopeText}.`,
    ];
    let question = pick(lcg, qs);
    const { turns } = callTurns(rec, pick(lcg, INTENTS), toolName, args);
    let answer: string;
    if (format === "terse") {
      question += " Just the note name.";
      answer = `${gold}.`;
    } else {
      answer = pick(lcg, [
        `The ${dir} note ${scopeText} is ${gold}, in measure ${result.measure}.`,
        `That would be ${gold} — it lands in measure ${result.measure}.`,
        `${gold}. The inspector places it in measure ${result.measure}.`,
      ]);
    }
    turns.push({ role: "assistant", content: answer });
    return { family: F2.key, format, question, turns, golds: [{ kind: "note", value: gold }] };
  },
};

const F3: Family = {
  key: "F3_texture_balance",
  terseOk: true,
  applicable: (rec) => {
    const r = runTool(rec, "get_hand_balance", {}) as { right_count: number; left_count: number };
    return r.right_count !== r.left_count && r.right_count + r.left_count > 0;
  },
  build: (rec, lcg, format) => {
    const { turns, result } = callTurns(rec, pick(lcg, INTENTS), "get_hand_balance", {});
    const r = result as { right_count: number; left_count: number };
    const winner: "right" | "left" = r.right_count > r.left_count ? "right" : "left";
    const wCount = Math.max(r.right_count, r.left_count);
    const lCount = Math.min(r.right_count, r.left_count);
    const qs = [
      `Which hand is doing more of the work in this passage?`,
      `How are the notes split between the hands here?`,
      `Is the busier hand the right or the left in this phrase?`,
      `Where's the density in this passage — right hand or left?`,
    ];
    let question = pick(lcg, qs);
    let answer: string;
    const golds: GoldSpec[] = [{ kind: "hand", value: winner }];
    if (format === "terse") {
      question += " One word: right or left.";
      answer = `${winner === "right" ? "Right" : "Left"}.`;
    } else {
      answer = pick(lcg, [
        `The ${winner} hand carries it — ${wCount} notes against ${lCount}.`,
        `It leans ${winner}: ${wCount} ${winner}-hand notes to ${lCount} in the other hand.`,
        `The split is ${wCount} to ${lCount}, so the ${winner} hand is the busier one.`,
      ]);
      golds.push({ kind: "number", value: wCount }, { kind: "number", value: lCount });
    }
    turns.push({ role: "assistant", content: answer });
    return { family: F3.key, format, question, turns, golds };
  },
};

const F4: Family = {
  key: "F4_pitch_class_census",
  terseOk: true,
  applicable: (rec) => events(rec).length > 0,
  build: (rec, lcg, format) => {
    const variant = pick(lcg, ["count_of_class", "distinct"] as const);
    if (variant === "count_of_class") {
      const present = [...new Set(events(rec).map((e) => pitchClassName(e.note)))].sort();
      const pc = pick(lcg, present);
      const { turns, result } = callTurns(rec, pick(lcg, INTENTS), "count_notes_with_pitch_class", {
        pitch_class: pc,
      });
      const gold = (result as { count: number }).count;
      const qs = [
        `How often does ${pc} show up across this passage?`,
        `Count the ${pc}s in this phrase for me — every octave counts.`,
        `How many times is ${pc} struck in these measures?`,
        `What's the total number of ${pc} notes here?`,
      ];
      let question = pick(lcg, qs);
      let answer: string;
      if (format === "terse") {
        question += " Answer with just the number.";
        answer = `${gold}.`;
      } else {
        answer = pick(lcg, [
          `${pc} appears ${gold} times in this phrase.`,
          `The count comes back ${gold} — that's every ${pc} across both hands.`,
          `There are ${gold} ${pc}s in the passage.`,
        ]);
      }
      turns.push({ role: "assistant", content: answer });
      return { family: F4.key, format, question, turns, golds: [{ kind: "number", value: gold }] };
    }
    const { turns, result } = callTurns(rec, pick(lcg, INTENTS), "count_distinct_pitch_classes", {});
    const gold = (result as { count: number }).count;
    const qs = [
      `How many different pitch classes does this passage use?`,
      `What's the size of the pitch-class palette here?`,
      `Counting each letter-name once, how many distinct pitches are in play?`,
      `How varied is the pitch content — how many distinct pitch classes?`,
    ];
    let question = pick(lcg, qs);
    let answer: string;
    if (format === "terse") {
      question += " Answer with just the number.";
      answer = `${gold}.`;
    } else {
      answer = pick(lcg, [
        `The passage draws on ${gold} distinct pitch classes.`,
        `${gold} different pitch classes — that's the whole palette here.`,
        `The inspector counts ${gold} distinct pitch classes in these bars.`,
      ]);
    }
    turns.push({ role: "assistant", content: answer });
    return { family: F4.key, format, question, turns, golds: [{ kind: "number", value: gold }] };
  },
};

const F5: Family = {
  key: "F5_downbeat_rhythm",
  terseOk: true,
  applicable: (rec) => (runTool(rec, "count_beat_1_onsets", {}) as { count: number }).count > 0,
  build: (rec, lcg, format) => {
    const { turns, result } = callTurns(rec, pick(lcg, INTENTS), "count_beat_1_onsets", {});
    const gold = (result as { count: number }).count;
    const qs = [
      `Across the whole passage, how many notes land right on a downbeat?`,
      `How many downbeat attacks are there in these measures?`,
      `Count the notes that hit the first beat of their bar here.`,
      `How anchored is this phrase — how many notes strike on the downbeat?`,
    ];
    let question = pick(lcg, qs);
    let answer: string;
    if (format === "terse") {
      question += " Answer with just the number.";
      answer = `${gold}.`;
    } else {
      answer = pick(lcg, [
        `${gold} notes land squarely on a downbeat in this passage.`,
        `The count is ${gold} downbeat onsets across the phrase.`,
        `There are ${gold} of them — ${gold} notes striking beat one of their bar.`,
      ]);
    }
    turns.push({ role: "assistant", content: answer });
    return { family: F5.key, format, question, turns, golds: [{ kind: "number", value: gold }] };
  },
};

const F6: Family = {
  key: "F6_measure_contents",
  terseOk: true,
  applicable: (rec) => uniqueMeasures(rec).length > 0,
  build: (rec, lcg, format) => {
    const m = pick(lcg, uniqueMeasures(rec));
    const { turns, result } = callTurns(rec, pick(lcg, INTENTS), "get_events_in_measure", {
      measure_number: m,
    });
    const arr = result as Array<{ name: string }>;
    const gold = arr.length;
    const qs = [
      `How many notes sound in measure ${m}?`,
      `What's the note count for bar ${m} alone?`,
      `Measure ${m} — how many events are in it, both hands together?`,
      `If I isolate bar ${m}, how many notes am I dealing with?`,
    ];
    let question = pick(lcg, qs);
    let answer: string;
    if (format === "terse") {
      question += " Answer with just the number.";
      answer = `${gold}.`;
    } else {
      const preview = arr.slice(0, 3).map((e) => e.name).join(", ");
      answer = pick(lcg, [
        `Measure ${m} holds ${gold} notes${gold > 0 ? ` — it opens ${preview}${arr.length > 3 ? ", …" : ""}` : ""}.`,
        `Bar ${m} has ${gold} events across both hands.`,
        `${gold} notes in measure ${m}${gold > 0 ? `, starting with ${preview}` : ""}.`,
      ]);
    }
    turns.push({ role: "assistant", content: answer });
    return { family: F6.key, format, question, turns, golds: [{ kind: "number", value: gold }] };
  },
};

const F7: Family = {
  key: "F7_hand_contents",
  terseOk: true,
  applicable: (rec) => events(rec).some((e) => e.hand === "right" || e.hand === "left"),
  build: (rec, lcg, format) => {
    const hands = (["right", "left"] as const).filter((h) => events(rec).some((e) => e.hand === h));
    const hand = pick(lcg, [...hands]);
    const variant = format === "terse" ? "count" : pick(lcg, ["count", "range"] as const);
    const { turns, result } = callTurns(rec, pick(lcg, INTENTS), "get_events_in_hand", { hand });
    const arr = result as Array<{ name: string; pitch: number }>;
    if (arr.length === 0) return null;
    if (variant === "count") {
      const gold = arr.length;
      const qs = [
        `How many notes does the ${hand} hand play in this passage?`,
        `What's the ${hand} hand's total note count here?`,
        `Just the ${hand} hand — how many notes is it responsible for?`,
        `Count the ${hand}-hand notes across the phrase.`,
      ];
      let question = pick(lcg, qs);
      let answer: string;
      if (format === "terse") {
        question += " Answer with just the number.";
        answer = `${gold}.`;
      } else {
        answer = pick(lcg, [
          `The ${hand} hand plays ${gold} notes across this passage.`,
          `${gold} notes for the ${hand} hand here.`,
          `That hand carries ${gold} events in these bars.`,
        ]);
      }
      turns.push({ role: "assistant", content: answer });
      return { family: F7.key, format, question, turns, golds: [{ kind: "number", value: gold }] };
    }
    const lowest = arr.reduce((a, b) => (b.pitch < a.pitch ? b : a));
    const highest = arr.reduce((a, b) => (b.pitch > a.pitch ? b : a));
    const qs = [
      `What range does the ${hand} hand cover in this passage?`,
      `How wide is the ${hand} hand's territory here — from what to what?`,
      `Give me the ${hand} hand's span in these bars.`,
      `Between which two notes does the ${hand} hand live in this phrase?`,
    ];
    const question = pick(lcg, qs);
    const answer = pick(lcg, [
      `The ${hand} hand spans ${lowest.name} up to ${highest.name} in this passage.`,
      `It runs from ${lowest.name} at the bottom to ${highest.name} on top.`,
      `Everything the ${hand} hand plays sits between ${lowest.name} and ${highest.name}.`,
    ]);
    turns.push({ role: "assistant", content: answer });
    return {
      family: F7.key,
      format,
      question,
      turns,
      golds: [
        { kind: "note", value: lowest.name },
        { kind: "note", value: highest.name },
      ],
    };
  },
};

const F8: Family = {
  key: "F8_composition",
  terseOk: false,
  applicable: (rec) => uniqueMeasures(rec).length >= 2,
  build: (rec, lcg, _format) => {
    const variant = pick(lcg, ["busier_measure", "phrase_span"] as const);
    if (variant === "busier_measure") {
      const ms = lcgShuffle([...uniqueMeasures(rec)], lcg).slice(0, 2).sort((a, b) => a - b);
      if (ms.length < 2) return null;
      const [m1, m2] = ms;
      const c1 = callTurns(rec, pick(lcg, [
        `Let me count each measure separately.`,
        `I'll inspect the two bars one at a time.`,
        `Let me pull measure ${m1} first.`,
      ]), "get_events_in_measure", { measure_number: m1 });
      const n1 = (c1.result as unknown[]).length;
      const c2 = callTurns(rec, pick(lcg, [
        `Now measure ${m2}.`,
        `And the second bar.`,
        `Now the other one.`,
      ]), "get_events_in_measure", { measure_number: m2 });
      const n2 = (c2.result as unknown[]).length;
      const qs = [
        `Which is busier — measure ${m1} or measure ${m2}?`,
        `Compare the activity in bars ${m1} and ${m2}: which one has more notes?`,
        `Between measures ${m1} and ${m2}, where's the denser writing?`,
        `Does measure ${m1} or measure ${m2} carry more notes?`,
      ];
      const question = pick(lcg, qs);
      const golds: GoldSpec[] = [
        { kind: "number", value: n1 },
        { kind: "number", value: n2 },
      ];
      let answer: string;
      if (n1 === n2) {
        answer = `They're even — measure ${m1} and measure ${m2} both hold ${n1} notes.`;
      } else {
        const busy = n1 > n2 ? m1 : m2;
        answer = pick(lcg, [
          `Measure ${busy} is the busier one: ${Math.max(n1, n2)} notes against ${Math.min(n1, n2)}.`,
          `Bar ${busy} wins — the counts come back ${n1} for measure ${m1} and ${n2} for measure ${m2}.`,
          `The denser bar is ${busy}: measure ${m1} has ${n1} notes, measure ${m2} has ${n2}.`,
        ]);
      }
      const turns = [...c1.turns, ...c2.turns, { role: "assistant", content: answer } as SftMessage];
      return { family: F8.key, format: "sentence", question, turns, golds };
    }
    const hi = callTurns(rec, pick(lcg, [
      `Let me find the top of the range first.`,
      `I'll check the highest note first.`,
    ]), "find_highest_pitch", {});
    const lo = callTurns(rec, pick(lcg, [
      `And now the bottom.`,
      `Now the lowest note.`,
    ]), "find_lowest_pitch", {});
    const hiR = hi.result as { name: string } | null;
    const loR = lo.result as { name: string } | null;
    if (!hiR || !loR) return null;
    const qs = [
      `What are the outer edges of this phrase — its very top and very bottom notes?`,
      `Give me the full compass of the passage: lowest note and highest note.`,
      `How far apart are the extremes here? Name both notes.`,
      `Bracket this phrase for me — bottom note and top note.`,
    ];
    const question = pick(lcg, qs);
    const answer = pick(lcg, [
      `The phrase runs from ${loR.name} at the bottom up to ${hiR.name} at the top.`,
      `Bottom is ${loR.name}, top is ${hiR.name} — that's the full compass.`,
      `Everything here sits between ${loR.name} and ${hiR.name}.`,
    ]);
    const turns = [...hi.turns, ...lo.turns, { role: "assistant", content: answer } as SftMessage];
    return {
      family: F8.key,
      format: "sentence",
      question,
      turns,
      golds: [
        { kind: "note", value: loR.name },
        { kind: "note", value: hiR.name },
      ],
    };
  },
};

const F9: Family = {
  key: "F9_claim_verification",
  terseOk: false,
  applicable: (rec) => events(rec).length > 0,
  build: (rec, lcg, _format) => {
    const variant = pick(lcg, ["hand_claim", "downbeat_claim", "pitch_class_claim"] as const);
    const truthy = lcg() < 0.5;

    if (variant === "hand_claim") {
      const bal = runTool(rec, "get_hand_balance", {}) as { right_count: number; left_count: number };
      if (bal.right_count === bal.left_count) return null;
      const actual: "right" | "left" = bal.right_count > bal.left_count ? "right" : "left";
      const claimed = truthy ? actual : actual === "right" ? "left" : "right";
      const qs = [
        `It sounds like the ${claimed} hand is doing most of the work here — am I right?`,
        `My impression is that the ${claimed} hand carries this passage. Can you check that?`,
        `I'd bet the ${claimed} hand has more notes here. True?`,
        `The ${claimed} hand feels busier to me in these bars — is that actually the case?`,
      ];
      const question = pick(lcg, qs);
      const { turns } = callTurns(rec, pick(lcg, INTENTS), "get_hand_balance", {});
      const w = Math.max(bal.right_count, bal.left_count);
      const l = Math.min(bal.right_count, bal.left_count);
      const answer = truthy
        ? pick(lcg, [
            `Yes — the ${actual} hand leads, ${w} notes to ${l}.`,
            `Yes, that holds up: ${w} ${actual}-hand notes against ${l}.`,
          ])
        : pick(lcg, [
            `Actually, no — it's the ${actual} hand that carries it, ${w} notes to ${l}.`,
            `No, the data says otherwise: the ${actual} hand leads ${w} to ${l}.`,
          ]);
      turns.push({ role: "assistant", content: answer });
      return {
        family: F9.key,
        format: "yesno",
        question,
        turns,
        golds: [
          { kind: "yesno", value: truthy },
          { kind: "hand", value: actual },
        ],
      };
    }

    if (variant === "downbeat_claim") {
      const actual = (runTool(rec, "count_beat_1_onsets", {}) as { count: number }).count;
      if (actual === 0) return null;
      let claimed = actual;
      if (!truthy) {
        const delta = 1 + lcgInt(lcg, 2);
        claimed = lcg() < 0.5 && actual - delta > 0 ? actual - delta : actual + delta;
      }
      const qs = [
        `I count ${claimed} notes landing on downbeats in this passage — did I get that right?`,
        `By my ear there are ${claimed} downbeat attacks here. Can you verify?`,
        `Quick check: ${claimed} downbeat onsets in these bars, yes?`,
        `Am I correct that ${claimed} notes strike beat one across this phrase?`,
      ];
      const question = pick(lcg, qs);
      const { turns } = callTurns(rec, pick(lcg, INTENTS), "count_beat_1_onsets", {});
      const answer = truthy
        ? pick(lcg, [
            `Yes — exactly ${actual} downbeat onsets.`,
            `Yes, ${actual} is right.`,
          ])
        : pick(lcg, [
            `Actually, no — the real count is ${actual}, not ${claimed}.`,
            `No, close but not quite: it's ${actual}.`,
          ]);
      turns.push({ role: "assistant", content: answer });
      return {
        family: F9.key,
        format: "yesno",
        question,
        turns,
        golds: [
          { kind: "yesno", value: truthy },
          { kind: "number", value: actual },
        ],
      };
    }

    // pitch_class_claim: "there's no {pc} anywhere in this passage, right?"
    const present = new Set(events(rec).map((e) => pitchClassName(e.note)));
    const all = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const absent = all.filter((p) => !present.has(p));
    // truthy claim = "no {pc}" where pc is absent; false claim = "no {pc}" where pc present.
    const pool = truthy ? absent : [...present];
    if (pool.length === 0) return null;
    const pc = pick(lcg, pool);
    const count = (runTool(rec, "count_notes_with_pitch_class", { pitch_class: pc }) as { count: number }).count;
    const qs = [
      `There's no ${pc} anywhere in this passage, right?`,
      `I don't think a single ${pc} appears in these bars — can you confirm?`,
      `This phrase avoids ${pc} entirely, doesn't it?`,
      `Am I right that ${pc} never shows up here?`,
    ];
    const question = pick(lcg, qs);
    const { turns } = callTurns(rec, pick(lcg, INTENTS), "count_notes_with_pitch_class", { pitch_class: pc });
    const answer = truthy
      ? pick(lcg, [
          `Yes — the count for ${pc} is zero; the passage never touches it.`,
          `Yes, confirmed: no ${pc} at all.`,
        ])
      : pick(lcg, [
          `Actually, no — ${pc} appears ${count} times here.`,
          `No, it does show up: ${count} ${pc}${count === 1 ? "" : "s"} in the passage.`,
        ]);
    turns.push({ role: "assistant", content: answer });
    const golds: GoldSpec[] = [{ kind: "yesno", value: truthy }];
    if (!truthy) golds.push({ kind: "number", value: count });
    return { family: F9.key, format: "yesno", question, turns, golds };
  },
};

export const FAMILIES: Family[] = [F1, F2, F3, F4, F5, F6, F7, F8, F9];

// ─── Session assembly ─────────────────────────────────────────────────────────

const CONTEXT_HEADERS = [
  (song: string, pw: string) => `We're looking at ${song}, ${pw}.`,
  (song: string, pw: string) => `I've got ${song} open at ${pw}.`,
  (song: string, pw: string) => `Working on ${pw} of ${song} right now.`,
  (song: string, pw: string) => `Same piece as my practice set — ${song}, ${pw}.`,
];

const FOLLOWUP_LEADS = ["", "One more thing — ", "Also: ", "Next question: ", "While we're here: "];

export interface GroundingPlanOpts {
  /** Records eligible for sessions (gradient records for train, inner-val for val). */
  records: Rec[];
  sessionsTotal: number;
  /** Disjoint LCG stream tag (P0-LOCK §5): "ground" for train, "ground:val" for val. */
  streamTag: string;
  systemText: string;
}

/** Length plan: 60% 1-QA, 25% 2-QA, 15% 3-QA (P0-LOCK §3-C2, findings 39/40). */
function sessionLengths(total: number, lcg: () => number): number[] {
  const n1 = Math.round(total * 0.6);
  const n2 = Math.round(total * 0.25);
  const n3 = total - n1 - n2;
  return lcgShuffle(
    [...Array(n1).fill(1), ...Array(n2).fill(2), ...Array(n3).fill(3)],
    lcg,
  );
}

/** Format plan over item slots: sentence/terse/yesno ≈ 65/23/12 (yesno ⇔ F9). */
function formatPlan(items: number, lcg: () => number): AnswerFormat[] {
  const nYes = Math.round(items * 0.12);
  const nTerse = Math.round(items * 0.23);
  const nSent = items - nYes - nTerse;
  return lcgShuffle(
    [
      ...Array(nSent).fill("sentence" as AnswerFormat),
      ...Array(nTerse).fill("terse" as AnswerFormat),
      ...Array(nYes).fill("yesno" as AnswerFormat),
    ],
    lcg,
  );
}

export function generateGroundingSessions(opts: GroundingPlanOpts): GroundingLine[] {
  const { records, sessionsTotal, streamTag, systemText } = opts;
  const lcg = makeLcg(hashString(streamTag));

  // Record assignment: 2 sessions per record, remainder LCG-picked without replacement.
  const base: Rec[] = [];
  for (const r of records) base.push(r, r);
  if (base.length > sessionsTotal) throw new Error("sessionsTotal below 2-per-record floor");
  const extraCount = sessionsTotal - base.length;
  const extras = lcgShuffle([...records], lcg).slice(0, extraCount);
  const assignment = lcgShuffle([...base, ...extras], lcg);

  const lengths = sessionLengths(sessionsTotal, lcg);
  const totalItems = lengths.reduce((a, b) => a + b, 0);
  const formats = formatPlan(totalItems, lcg);

  // Family cycle: repeated shuffled decks of F1..F8 for non-yesno slots (F9 ⇔ yesno).
  const nonYesFamilies = FAMILIES.filter((f) => f.key !== F9.key);
  let deck: Family[] = [];
  const nextFamily = (): Family => {
    if (deck.length === 0) deck = lcgShuffle([...nonYesFamilies], lcg);
    return deck.pop()!;
  };

  const lines: GroundingLine[] = [];
  let fmtIdx = 0;

  for (let s = 0; s < sessionsTotal; s++) {
    const rec = assignment[s];
    const nItems = lengths[s];
    const sessionLcg = makeLcg(hashString(`${streamTag}:${rec.id}:s${s}`));
    const songMeta = SONG_DISPLAY[rec.scope.song_id];
    if (!songMeta) throw new Error(`no SONG_DISPLAY for ${rec.scope.song_id}`);

    const messages: SftMessage[] = [{ role: "system", content: systemText }];
    const verify: GroundingLine["verify"] = [];
    const usedFamilies = new Set<string>();

    for (let i = 0; i < nItems; i++) {
      const format = formats[fmtIdx++];
      let item: QaItem | null = null;
      if (format === "yesno") {
        item = F9.applicable(rec) ? F9.build(rec, sessionLcg, "yesno") : null;
        if (!item) {
          // deterministic fallback: sentence item from the deck
          item = buildWithFallback(rec, sessionLcg, "sentence", nextFamily, usedFamilies);
        }
      } else {
        item = buildWithFallback(rec, sessionLcg, format, nextFamily, usedFamilies);
      }
      if (!item) throw new Error(`no applicable family for ${rec.id} (session ${s}, item ${i})`);
      usedFamilies.add(item.family);

      const userText =
        i === 0
          ? `${pick(sessionLcg, CONTEXT_HEADERS)(songMeta.display, rec.scope.phrase_window)}\n\n${item.question}`
          : `${pick(sessionLcg, FOLLOWUP_LEADS)}${item.question}`;
      messages.push({ role: "user", content: userText });
      messages.push(...item.turns);
      verify.push({
        family: item.family,
        format: item.format,
        answerMsgIndex: messages.length - 1,
        golds: item.golds,
      });
    }

    lines.push({
      id: `${rec.id}::ground::s${s}`,
      song_id: rec.scope.song_id,
      component: "grounding",
      tools_key: "inspector9",
      record_ref: rec.id,
      messages,
      verify,
    });
  }

  return lines;
}

function buildWithFallback(
  rec: Rec,
  lcg: () => number,
  format: AnswerFormat,
  nextFamily: () => Family,
  used: Set<string>,
): QaItem | null {
  // Try up to a full deck's worth of draws; prefer unused families in-session,
  // demote terse→sentence when the drawn family doesn't support terse.
  for (let tries = 0; tries < 24; tries++) {
    const fam = nextFamily();
    if (used.has(fam.key) && tries < 8) continue;
    if (!fam.applicable(rec)) continue;
    const fmt: AnswerFormat = format === "terse" && !fam.terseOk ? "sentence" : format;
    const item = fam.build(rec, lcg, fmt);
    if (item) return item;
  }
  return null;
}
