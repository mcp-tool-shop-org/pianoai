// ─── abstention-gen.ts — Finetune Arc B-2, component 4 (calibrated abstention) ─
//
// P0-LOCK.md (B-2) §4-C4: teach the model to DECLINE the genuinely-unanswerable
// question instead of guessing (SQuAD-2.0-style context-grounded abstention,
// arXiv:1806.03822; R-Tuning arXiv:2311.09677), while still ANSWERING the
// answerable ones (over-refusal guard — Alignment-for-Honesty arXiv:2312.07000,
// GRAIT/CRaFT). Three pedagogy-derived flavors, each with a paired ANSWERABLE
// twin (aural-skills "notate only what you're sure of" + error-detection
// "no-error"):
//
//   (a) prose-lacks-the-fact  — a MIDI-only question over prose + score METADATA
//       (key/meter/phrase/composer, NO raw notes) → decline; the twin asks a
//       metadata-answerable question (key_time_sig / measure_range / provenance)
//       → answer. This mirrors the B-2 `text_only` eval surface exactly.
//   (b) data-lacks-the-field  — a note list with NO hand attribution; a
//       hand_register question → decline NAMING the missing field; the twin asks
//       something the list DOES carry (a count / the top note) → answer.
//   (c) false-premise         — a note list; a question asserting an event that
//       is NOT present → REJECT the premise (serves EXTERNAL_VERIFIER); the twin
//       asks about an event that IS present → answer the hand.
//
// Every UNANSWERABLE item's question type ∈ the 4 MIDI-only types
// {pitch_class_count, hand_register, rhythm_onset, annotation_grounding} (G8).
// The GRAIT/CRaFT static-conflict guard is honored: a twin is never a
// near-identical context with the opposite label — it asks a DIFFERENT question.
// tools_key "none". Drawn from the 78 GRADIENT records only. NO annotation-prose
// text is reproduced (leakage rule §4.4) — flavor (a)'s prose is authored-generic.
// Deterministic: makeLcg(hashString("ftb2:abstain")).
// ─────────────────────────────────────────────────────────────────────────────

import {
  INSPECTOR_TOOLS,
  noteName,
  pitchClassName,
} from "../../../src/dataset/eval/midi-inspector.js";
import type { E3Record } from "../../../src/dataset/eval/annotation-grounding.js";
import type { SftMessage } from "../../finetune-arc-v1/scripts/grounding-gen.js";
import { SONG_DISPLAY } from "../../finetune-arc-v1/scripts/paraphrase-bank.js";
import { makeLcg, lcgInt, lcgShuffle, hashString, type GoldSpecB2 } from "./det-b2.js";

export type AbstainFlavor = "a" | "b" | "c";
export type AbstainKind = "answerable" | "unanswerable";
/** Unanswerable question types are constrained to the 4 MIDI-only types (G8). */
export type MidiOnlyType = "pitch_class_count" | "hand_register" | "rhythm_onset" | "annotation_grounding";
export type AnswerableType = "key_time_sig" | "measure_range" | "provenance" | "note_count" | "extreme_pitch" | "event_grounding";

export interface AbstentionLine {
  id: string;
  song_id: string;
  component: "abstention";
  tools_key: "none";
  record_ref: string;
  messages: SftMessage[];
  verify: Array<{
    flavor: AbstainFlavor;
    kind: AbstainKind;
    qtype: MidiOnlyType | AnswerableType;
    answerMsgIndex: number;
    golds: GoldSpecB2[];
    /** Independent re-derivation hint for the gate (G8): the (measure, note)
     *  the item probes, so the gate can re-execute against the record — assert
     *  the false-premise event is truly ABSENT, the present event's hand, or a
     *  per-measure count. */
    probe?: { measure?: number; name?: string };
  }>;
}

type Rec = E3Record & {
  id: string;
  scope: { song_id: string; phrase_window: string; key: string; time_signature: string };
  provenance: { composer: string; composition_title: string };
};

interface Ev { hand: "right" | "left"; measure: number; beat: number; pitch: number; name: string }

const SYSTEM_TEXT = "You are operating AI Jam Sessions, a music education platform.";

function pick<T>(lcg: () => number, arr: T[]): T {
  return arr[lcgInt(lcg, arr.length)];
}

function events(rec: Rec): Ev[] {
  const tool = INSPECTOR_TOOLS.find((t) => t.name === "get_events_in_hand")!;
  return [
    ...(tool.run(rec, { hand: "right" }) as Ev[]),
    ...(tool.run(rec, { hand: "left" }) as Ev[]),
  ].filter((e) => e && (e.hand === "right" || e.hand === "left"));
}

/** Compact non-MIDI metadata header — the prose-answerable facts, no raw notes. */
function metadataHeader(rec: Rec): string {
  return (
    `Key: ${rec.scope.key}. Time signature: ${rec.scope.time_signature}. ` +
    `Phrase: ${rec.scope.phrase_window}. ` +
    `Piece: ${rec.provenance.composition_title} by ${rec.provenance.composer}.`
  );
}

/** Authored-generic teaching prose — carries NO note-level facts and reproduces
 *  no record's annotation_target (leakage rule §4.4). */
const GENERIC_PROSE: string[] = [
  "This passage is about shaping a clear line and keeping the pulse steady underneath it.",
  "The focus here is legato phrasing and letting the harmony breathe toward the cadence.",
  "Work this section for evenness of touch and a gentle swell into the phrase's peak.",
  "The teaching goal is voicing balance — bring the melody out and keep the accompaniment soft.",
  "Here the aim is a singing tone on top with a calm, supporting texture beneath.",
  "Practice this for phrase direction: a small crescendo in, then an easing at the close.",
];

const DECLINE_LEADS = ["", "Honestly, ", "Short answer: ", "I have to be straight with you — "];

// ─── Flavor (a): prose + metadata lacks the note-level fact ──────────────────

function flavorAUnanswerable(rec: Rec, lcg: () => number, idx: number, qtype: "pitch_class_count" | "rhythm_onset"): AbstentionLine {
  const prose = pick(lcg, GENERIC_PROSE);
  const context = `${metadataHeader(rec)}\n\nTeaching note: ${prose}`;
  const question =
    qtype === "pitch_class_count"
      ? pick(lcg, [
          `From this, how many C#s does the passage contain?`,
          `Based on the description, what's the total count of D naturals in these bars?`,
          `How many notes with pitch class G appear here?`,
        ])
      : pick(lcg, [
          `From this, how many notes land on the downbeat?`,
          `Based on the description, how many onsets fall on beat one?`,
          `How many notes strike the first beat of their measure here?`,
        ]);
  const answer =
    `${pick(lcg, DECLINE_LEADS)}that cannot be determined from the annotation alone. ` +
    `The metadata and teaching note describe the phrase's key, meter, and character, ` +
    `but the note list doesn't include the individual events you'd need to count that.`;
  return oneTurn(rec, "a", "unanswerable", qtype, `${context}\n\n${question}`, answer, [{ kind: "abstain" }], idx);
}

function flavorAAnswerable(rec: Rec, lcg: () => number, idx: number): AbstentionLine {
  const prose = pick(lcg, GENERIC_PROSE);
  const context = `${metadataHeader(rec)}\n\nTeaching note: ${prose}`;
  const variant = pick(lcg, ["key_time_sig", "measure_range", "provenance"] as const);
  let question: string;
  let answer: string;
  let golds: GoldSpecB2[];
  let qtype: AnswerableType;
  if (variant === "key_time_sig") {
    qtype = "key_time_sig";
    question = pick(lcg, [`What key and time signature is this phrase in?`, `Remind me of the key and meter here.`]);
    answer = `This phrase is in ${rec.scope.key}, ${rec.scope.time_signature} time.`;
    golds = [{ kind: "text", value: rec.scope.key }, { kind: "text", value: rec.scope.time_signature }];
  } else if (variant === "measure_range") {
    qtype = "measure_range";
    const m = /(\d+)\D+(\d+)/.exec(rec.scope.phrase_window);
    const lo = m ? Number(m[1]) : 1;
    const hi = m ? Number(m[2]) : 1;
    question = pick(lcg, [`Which measures does this phrase cover?`, `What's the measure range here?`]);
    answer = `This phrase covers measures ${lo}–${hi}.`;
    golds = [{ kind: "number", value: lo }, { kind: "number", value: hi }];
  } else {
    qtype = "provenance";
    const composer = rec.provenance.composer;
    const last = composer.split(/\s+/).pop() ?? composer;
    question = pick(lcg, [`Who composed this piece?`, `Which composer wrote this?`]);
    answer = `This is ${rec.provenance.composition_title}, composed by ${composer}.`;
    golds = [{ kind: "text", value: last }];
  }
  return oneTurn(rec, "a", "answerable", qtype, `${context}\n\n${question}`, answer, golds, idx);
}

// ─── Flavor (b): a note list with the hand field missing ─────────────────────

/** Serialize events WITHOUT hand attribution (single-track view). */
function noHandList(evs: Ev[]): string {
  const measures = [...new Set(evs.map((e) => e.measure))].sort((a, b) => a - b);
  return measures
    .map((m) => `m${m}: ${evs.filter((e) => e.measure === m).map((e) => e.name).join(", ")}`)
    .join("; ");
}

function flavorBUnanswerable(rec: Rec, evs: Ev[], lcg: () => number, idx: number): AbstentionLine {
  const context = `Here is the note list for this phrase (pitches and measures only, no hand information):\n${noHandList(evs)}`;
  const question = pick(lcg, [
    `Which hand plays the highest note here?`,
    `Is the right hand or the left hand busier in this passage?`,
    `Which hand carries the melody in these bars?`,
  ]);
  const answer =
    `${pick(lcg, DECLINE_LEADS)}the note list doesn't include hand assignments, ` +
    `so which hand plays what isn't something this data can answer. ` +
    `You'd need the per-note hand labeling, and it isn't in the data provided.`;
  return oneTurn(rec, "b", "unanswerable", "hand_register", `${context}\n\n${question}`, answer, [{ kind: "abstain" }], idx);
}

function flavorBAnswerable(rec: Rec, evs: Ev[], lcg: () => number, idx: number): AbstentionLine {
  const context = `Here is the note list for this phrase (pitches and measures only, no hand information):\n${noHandList(evs)}`;
  const variant = pick(lcg, ["note_count", "extreme_pitch"] as const);
  let question: string;
  let answer: string;
  let golds: GoldSpecB2[];
  let qtype: AnswerableType;
  if (variant === "note_count") {
    qtype = "note_count";
    const measures = [...new Set(evs.map((e) => e.measure))].sort((a, b) => a - b);
    const m = pick(lcg, measures);
    const count = evs.filter((e) => e.measure === m).length;
    question = pick(lcg, [`How many notes are listed in measure ${m}?`, `Count the notes shown for bar ${m}.`]);
    answer = `Counting the entries for measure ${m}, there are ${count}.`;
    golds = [{ kind: "number", value: count }];
    return oneTurn(rec, "b", "answerable", qtype, `${context}\n\n${question}`, answer, golds, idx, { measure: m });
  } else {
    qtype = "extreme_pitch";
    const top = evs.reduce((a, b) => (b.pitch > a.pitch ? b : a));
    question = pick(lcg, [`What's the highest note in this list?`, `Which pitch listed is the highest?`]);
    answer = `The highest note in the list is ${top.name}.`;
    golds = [{ kind: "note", value: top.name }];
    return oneTurn(rec, "b", "answerable", qtype, `${context}\n\n${question}`, answer, golds, idx, { name: top.name });
  }
}

// ─── Flavor (c): false premise (an event that isn't there) ───────────────────

/** Serialize events WITH hand attribution (for the false-premise check). */
function handedList(evs: Ev[]): string {
  const measures = [...new Set(evs.map((e) => e.measure))].sort((a, b) => a - b);
  return measures
    .map((m) => {
      const inM = evs.filter((e) => e.measure === m);
      const rh = inM.filter((e) => e.hand === "right").map((e) => e.name);
      const lh = inM.filter((e) => e.hand === "left").map((e) => e.name);
      const parts: string[] = [];
      if (lh.length) parts.push(`LH ${lh.join(", ")}`);
      if (rh.length) parts.push(`RH ${rh.join(", ")}`);
      return `m${m}: ${parts.join("; ")}`;
    })
    .join(". ");
}

/** Find a (measure, absent note name) pair: a measure that HAS events but does
 *  NOT contain the chosen pitch. Returns null if none found (caller falls back). */
function findAbsentNote(evs: Ev[], lcg: () => number): { measure: number; absent: string } | null {
  const measures = lcgShuffle([...new Set(evs.map((e) => e.measure))], lcg);
  const allPitches = evs.map((e) => e.pitch);
  const lo = Math.min(...allPitches);
  const hi = Math.max(...allPitches);
  for (const m of measures) {
    const inM = new Set(evs.filter((e) => e.measure === m).map((e) => e.name));
    // candidate pitches within the phrase's register but absent from measure m
    const candidates: string[] = [];
    for (let p = lo; p <= hi; p++) {
      const nm = noteName(p);
      if (!inM.has(nm)) candidates.push(nm);
    }
    if (candidates.length > 0) return { measure: m, absent: pick(lcg, candidates) };
  }
  return null;
}

function flavorCUnanswerable(rec: Rec, evs: Ev[], lcg: () => number, idx: number): AbstentionLine | null {
  const found = findAbsentNote(evs, lcg);
  if (!found) return null;
  const context = `Here is the note list for this phrase:\n${handedList(evs)}`;
  const question = pick(lcg, [
    `In measure ${found.measure}, which hand plays the ${found.absent}?`,
    `The ${found.absent} in measure ${found.measure} — is that a right-hand or left-hand note?`,
    `Tell me which hand takes the ${found.absent} in bar ${found.measure}.`,
  ]);
  const answer =
    `${pick(lcg, DECLINE_LEADS)}the premise doesn't hold — there's no ${found.absent} in measure ${found.measure} ` +
    `in this passage, so that note isn't in the passage to attribute to a hand. ` +
    `No such note appears at that spot in the list.`;
  return oneTurn(rec, "c", "unanswerable", "annotation_grounding", `${context}\n\n${question}`, answer, [{ kind: "abstain" }], idx, {
    measure: found.measure,
    name: found.absent,
  });
}

function flavorCAnswerable(rec: Rec, evs: Ev[], lcg: () => number, idx: number): AbstentionLine | null {
  // pick a present (note, measure, hand) that is UNAMBIGUOUS: exactly one hand
  // plays that note name in that measure.
  const byKey = new Map<string, Set<"right" | "left">>();
  for (const e of evs) {
    const k = `${e.measure}|${e.name}`;
    const s = byKey.get(k) ?? new Set();
    s.add(e.hand);
    byKey.set(k, s);
  }
  const unambiguous = [...byKey.entries()].filter(([, hands]) => hands.size === 1);
  if (unambiguous.length === 0) return null;
  const [key, hands] = pick(lcg, unambiguous);
  const [measureStr, name] = key.split("|");
  const measure = Number(measureStr);
  const hand = [...hands][0];
  const context = `Here is the note list for this phrase:\n${handedList(evs)}`;
  const question = pick(lcg, [
    `In measure ${measure}, which hand plays the ${name}?`,
    `The ${name} in measure ${measure} — right hand or left hand?`,
    `Which hand takes the ${name} in bar ${measure}?`,
  ]);
  const answer = `That's the ${hand} hand — the ${name} in measure ${measure} is in the ${hand}-hand part of the list.`;
  return oneTurn(rec, "c", "answerable", "event_grounding", `${context}\n\n${question}`, answer, [{ kind: "hand", value: hand }], idx, {
    measure,
    name,
  });
}

// ─── Line assembly ────────────────────────────────────────────────────────────

function oneTurn(
  rec: Rec,
  flavor: AbstainFlavor,
  kind: AbstainKind,
  qtype: MidiOnlyType | AnswerableType,
  userContent: string,
  answer: string,
  golds: GoldSpecB2[],
  idx: number,
  probe?: { measure?: number; name?: string },
): AbstentionLine {
  const messages: SftMessage[] = [
    { role: "system", content: SYSTEM_TEXT },
    { role: "user", content: userContent },
    { role: "assistant", content: answer },
  ];
  return {
    id: `abstain::${flavor}::${kind}::${String(idx).padStart(3, "0")}`,
    song_id: rec.scope.song_id,
    component: "abstention",
    tools_key: "none",
    record_ref: rec.id,
    messages,
    verify: [{ flavor, kind, qtype, answerMsgIndex: messages.length - 1, golds, ...(probe ? { probe } : {}) }],
  };
}

export interface AbstentionPlanOpts {
  records: Rec[];
  /** number of (unanswerable + answerable) PAIRS per flavor. */
  pairsPerFlavor: number;
  streamTag: string;
  /** id prefix; defaults "abstain". The val slice uses "abstain-val" so its
   *  ids never collide with the train slice (G3 uniqueness). */
  idNamespace?: string;
}

export function generateAbstention(opts: AbstentionPlanOpts): AbstentionLine[] {
  const { records, pairsPerFlavor, streamTag } = opts;
  const idNamespace = opts.idNamespace ?? "abstain";
  const lcg = makeLcg(hashString(streamTag));
  // Records with usable events (all gradient records qualify).
  const usable = records.filter((r) => events(r).length >= 4);
  const rr = lcgShuffle([...usable], lcg);
  let cursor = 0;
  const nextRec = (): Rec => rr[cursor++ % rr.length];

  const lines: AbstentionLine[] = [];
  let idx = 0;

  for (let p = 0; p < pairsPerFlavor; p++) {
    // (a) — alternate the MIDI-only qtype between pitch_class_count / rhythm_onset.
    {
      const ra = nextRec();
      const t: "pitch_class_count" | "rhythm_onset" = p % 2 === 0 ? "pitch_class_count" : "rhythm_onset";
      lines.push(flavorAUnanswerable(ra, makeLcg(hashString(`${streamTag}:a:u:${idx}`)), idx++, t));
      const rb = nextRec();
      lines.push(flavorAAnswerable(rb, makeLcg(hashString(`${streamTag}:a:a:${idx}`)), idx++));
    }
    // (b)
    {
      const r1 = nextRec();
      lines.push(flavorBUnanswerable(r1, events(r1), makeLcg(hashString(`${streamTag}:b:u:${idx}`)), idx++));
      const r2 = nextRec();
      lines.push(flavorBAnswerable(r2, events(r2), makeLcg(hashString(`${streamTag}:b:a:${idx}`)), idx++));
    }
    // (c) — skip a record if no absent/unambiguous note found (rare); advance.
    {
      let attempts = 0;
      let uItem: AbstentionLine | null = null;
      while (!uItem && attempts < rr.length) {
        const r = nextRec();
        uItem = flavorCUnanswerable(r, events(r), makeLcg(hashString(`${streamTag}:c:u:${idx}`)), idx);
        attempts++;
      }
      if (uItem) lines.push(uItem), idx++;
      attempts = 0;
      let aItem: AbstentionLine | null = null;
      while (!aItem && attempts < rr.length) {
        const r = nextRec();
        aItem = flavorCAnswerable(r, events(r), makeLcg(hashString(`${streamTag}:c:a:${idx}`)), idx);
        attempts++;
      }
      if (aItem) lines.push(aItem), idx++;
    }
  }

  if (idNamespace !== "abstain") {
    for (const l of lines) l.id = l.id.replace(/^abstain::/, `${idNamespace}::`);
  }
  return lines;
}
