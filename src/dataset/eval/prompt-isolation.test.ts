// ─── jam-actions-v0 Slice 13 Prompt Isolation Tests ──────────────────────────
//
// Regression guards for E1/E2 prompt construction. These tests assert the
// **design rule** that E1 and E2 prompts must not contain answer-giving
// annotation content. E3 (annotation-grounding) intentionally USES annotation
// content — its tests confirm that the other direction (annotation IS exposed
// to E3) is preserved.
//
// Technique: a synthetic record is constructed with a SECRET_ANSWER_MARKER
// string embedded in every annotation_target field that could leak. If the
// prompt builder accidentally pulls any annotation field into the user
// message, the marker will appear in the prompt and the test will fail.
//
// Background: Slice 12 surfaced a regression on the 6 Slice-11 enriched
// records: E1 enriched pass rate 16.7% vs non-enriched 44.4%, E2 enriched
// grooveOA mean 0.524 vs non-enriched 0.657. The Slice 12 report hypothesised
// that enriched annotation_target content was leaking into E1/E2 prompts.
// Slice 13 traced the code paths in tool-use.ts, phrase-continuation.ts, and
// llm-runner.ts and found NO leakage path: E1 uses only target_trace.task_family
// + target_trace.objective; E2 uses only scope + REMI tokens. These tests
// codify that design rule as a contract for future slices.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";

import {
  buildE1Prompt,
  buildE2UserPrompt,
  buildE3UserPrompt,
} from "./llm-runner.js";
import type { TargetTrace } from "../schema.js";
import type { PairRecord } from "./phrase-continuation.js";
import type { E3Record, MCQuestion } from "./annotation-grounding.js";

// ─── Secret marker technique ──────────────────────────────────────────────────
//
// SECRET_ANSWER_MARKER is a string that does not appear in any legitimate
// E1/E2 prompt field. If any test prompt contains it, an annotation field
// leaked through.

const SECRET_ANSWER_MARKER = "SECRET_ANSWER_MARKER_DO_NOT_LEAK_INTO_PROMPT";
const SECRET_REASON_MARKER = "SECRET_VERDICT_REASON_MARKER";

// ─── E1 fixture: record with poisoned annotation_target ───────────────────────
//
// We construct a TargetTrace whose objective + task_family are clean, but
// surround it with poisoned annotation/scope/provenance fields. The E1 builder
// takes only target_trace.{task_family,objective} — nothing else — so the
// marker must not appear in the resulting prompt.

interface PoisonedE1Record {
  id: string;
  target_trace: TargetTrace;
  scope: {
    song_id: string;
    musical_phrase_label: string;
  };
  annotation_target: {
    structure: string;
    key_moments: string[];
    teaching_goals: string[];
    style_tips: string[];
    teaching_notes: Array<{ measure: number; note: string; technique?: string[] }>;
  };
  provenance: {
    composer: string;
    composition_title: string;
    verdict_reason: string;
  };
}

function makePoisonedE1Record(): PoisonedE1Record {
  return {
    id: "test-poisoned:m001-004:piano:test-session:v1",
    target_trace: {
      task_family: "analyze-and-play-phrase",
      objective:
        "Read mm. 1-4 of a test piece, view the piano roll, analyze the phrase, " +
        "play in a loop, and predict the continuation.",
      session: [
        {
          turn: 1,
          role: "user",
          content: "Read measures 1 to 4 and play them.",
        },
      ],
    },
    scope: {
      song_id: "test-piece",
      musical_phrase_label: `${SECRET_ANSWER_MARKER} agitato middle episode antecedent`,
    },
    annotation_target: {
      structure: `Contrasting middle episode. ${SECRET_ANSWER_MARKER} peaks at F5 over wandering bass.`,
      key_moments: [
        `m. 1 b0.7 — ${SECRET_ANSWER_MARKER} E5 entry over G3`,
        `m. 2 b2.6 — F5 climax supported by C#2 ${SECRET_ANSWER_MARKER}`,
      ],
      teaching_goals: [
        `voice the right-hand top line ${SECRET_ANSWER_MARKER}`,
      ],
      style_tips: [
        `${SECRET_ANSWER_MARKER} mp to mf — louder than surrounding cantabile`,
      ],
      teaching_notes: [
        {
          measure: 1,
          note: `Enter on E5/G3 sonority. ${SECRET_ANSWER_MARKER}`,
          technique: [`${SECRET_ANSWER_MARKER} voice the top line`],
        },
      ],
    },
    provenance: {
      composer: "Test Composer",
      composition_title: "Test Piece",
      verdict_reason: `${SECRET_REASON_MARKER} verdict reason that must not leak.`,
    },
  };
}

// ─── E2 fixture: paired records with poisoned annotation_target ───────────────

interface PoisonedE2Record extends PairRecord {
  observation: PairRecord["observation"] & {
    tokens_remi?: string[];
  };
  annotation_target: PoisonedE1Record["annotation_target"];
  provenance: PoisonedE1Record["provenance"];
}

function makePoisonedE2Records(): {
  prompt: PoisonedE2Record;
  target: PoisonedE2Record;
} {
  const sharedScope = {
    song_id: "test-piece",
    phrase_window: "measures 1-4",
    time_signature: "4/4",
    key: "C major",
    tempo_bpm: 120,
    instrument: "piano",
    continuation_target_window: [5, 8] as [number, number],
    musical_phrase_label: `${SECRET_ANSWER_MARKER} cantabile opening`,
  };

  const poisonedAnnotation: PoisonedE1Record["annotation_target"] = {
    structure: `${SECRET_ANSWER_MARKER} opening cantabile in F major over tonic pedal.`,
    key_moments: [`m. 1 — ${SECRET_ANSWER_MARKER} A4 entrance over A3 bass`],
    teaching_goals: [`shape the descending line ${SECRET_ANSWER_MARKER}`],
    style_tips: [`${SECRET_ANSWER_MARKER} soften from m. 3 onward`],
    teaching_notes: [
      {
        measure: 2,
        note: `Sustain the bass ${SECRET_ANSWER_MARKER} through the suspension.`,
      },
    ],
  };

  const poisonedProvenance: PoisonedE1Record["provenance"] = {
    composer: "Test Composer",
    composition_title: "Test Piece",
    verdict_reason: `${SECRET_REASON_MARKER} verdict reason that must not leak.`,
  };

  const promptRecord: PoisonedE2Record = {
    id: "test-piece:m001-004:piano:test-session:v1",
    scope: {
      ...sharedScope,
      window_role: "prompt",
    } as PairRecord["scope"],
    observation: {
      midi_sidecar: {
        timed_events: [
          {
            t_seconds: 0,
            t_ticks: 0,
            dur_seconds: 0.5,
            dur_ticks: 240,
            note: 60,
            name: "C4",
            velocity: 64,
            channel: 0,
            hand: "right",
            measure: 1,
            beat: 0,
          },
        ],
        midi_sha256: "0".repeat(64),
        ticks_per_beat: 480,
      },
      tokens_remi: ["Bar_1", "Position_0", "Pitch_60", "Velocity_64", "Duration_4"],
    } as PoisonedE2Record["observation"],
    annotation_target: poisonedAnnotation,
    provenance: poisonedProvenance,
  };

  const targetRecord: PoisonedE2Record = {
    id: "test-piece:m005-008:piano:test-session:v1",
    scope: {
      ...sharedScope,
      phrase_window: "measures 5-8",
      window_role: "continuation_target",
      paired_prompt_record_id: promptRecord.id,
    } as PairRecord["scope"],
    observation: {
      midi_sidecar: {
        timed_events: [],
        midi_sha256: "0".repeat(64),
        ticks_per_beat: 480,
      },
    } as PoisonedE2Record["observation"],
    annotation_target: poisonedAnnotation,
    provenance: poisonedProvenance,
  };

  return { prompt: promptRecord, target: targetRecord };
}

// ─── E3 fixture: ordinary annotation_target (this IS intentionally exposed) ───

function makeCleanE3Record(): E3Record {
  return {
    id: "test-piece:m001-004:piano:test-session:v1",
    scope: {
      song_id: "test-piece",
      phrase_window: "measures 1-4",
      key: "C major",
      time_signature: "4/4",
    },
    provenance: {
      composition_title: "Test Piece",
      composer: "Test Composer",
      arrangement_creator: null,
      arrangement_license: null,
    },
    observation: {
      midi_sidecar: {
        timed_events: [],
      },
    },
    annotation_target: {
      measure_range: [1, 4],
      structure: `${SECRET_ANSWER_MARKER} opening tonic statement`,
      key_moments: [`m. 1 — ${SECRET_ANSWER_MARKER} C4 entry`],
      teaching_goals: [`shape the line ${SECRET_ANSWER_MARKER}`],
      style_tips: [`${SECRET_ANSWER_MARKER} cantabile`],
      teaching_notes: [
        {
          measure: 2,
          note: `${SECRET_ANSWER_MARKER} sustain through the bar.`,
        },
      ],
    },
  };
}

function makeTestMCQ(): MCQuestion {
  return {
    questionType: "pitch_class_count",
    questionText: "How many unique pitch classes appear in this phrase?",
    options: ["2", "3", "4", "5"],
    correctOptionIndex: 1,
    midiGrounded: true,
    goldValue: "3",
  };
}

// ─── E1 prompt isolation tests ────────────────────────────────────────────────

describe("E1 prompt isolation (annotation_target leakage guard)", () => {
  it("E1 prompt does not include annotation_target.structure", () => {
    const record = makePoisonedE1Record();
    const { systemPrompt, userMessage } = buildE1Prompt(record);
    const combined = `${systemPrompt}\n${userMessage}`;
    expect(combined).not.toContain(SECRET_ANSWER_MARKER);
    expect(combined).not.toContain("Contrasting middle episode");
  });

  it("E1 prompt does not include annotation_target.key_moments", () => {
    const record = makePoisonedE1Record();
    const { userMessage } = buildE1Prompt(record);
    expect(userMessage).not.toContain("E5 entry over G3");
    expect(userMessage).not.toContain("F5 climax");
  });

  it("E1 prompt does not include annotation_target.teaching_goals or style_tips", () => {
    const record = makePoisonedE1Record();
    const { userMessage } = buildE1Prompt(record);
    expect(userMessage).not.toContain("voice the right-hand top line");
    expect(userMessage).not.toContain("mp to mf");
    expect(userMessage).not.toContain("cantabile");
  });

  it("E1 prompt does not include annotation_target.teaching_notes prose or technique tags", () => {
    const record = makePoisonedE1Record();
    const { userMessage } = buildE1Prompt(record);
    expect(userMessage).not.toContain("E5/G3 sonority");
    expect(userMessage).not.toContain("voice the top line");
  });

  it("E1 prompt does not include provenance.verdict_reason or scope.musical_phrase_label", () => {
    const record = makePoisonedE1Record();
    const { systemPrompt, userMessage } = buildE1Prompt(record);
    const combined = `${systemPrompt}\n${userMessage}`;
    expect(combined).not.toContain(SECRET_REASON_MARKER);
    // musical_phrase_label is in scope but builds from target_trace, not scope
    expect(combined).not.toContain("agitato middle episode antecedent");
  });

  it("E1 prompt DOES include target_trace.task_family + objective (the allowed fields)", () => {
    const record = makePoisonedE1Record();
    const { userMessage } = buildE1Prompt(record);
    expect(userMessage).toContain("analyze-and-play-phrase");
    expect(userMessage).toContain("Read mm. 1-4 of a test piece");
  });
});

// ─── E2 prompt isolation tests ────────────────────────────────────────────────

describe("E2 prompt isolation (annotation_target leakage guard)", () => {
  it("E2 prompt does not include annotation_target.structure", () => {
    const { prompt } = makePoisonedE2Records();
    const userMessage = buildE2UserPrompt(prompt);
    expect(userMessage).not.toContain(SECRET_ANSWER_MARKER);
    expect(userMessage).not.toContain("opening cantabile in F major");
  });

  it("E2 prompt does not include annotation_target.key_moments or teaching_notes", () => {
    const { prompt } = makePoisonedE2Records();
    const userMessage = buildE2UserPrompt(prompt);
    expect(userMessage).not.toContain("A4 entrance over A3 bass");
    expect(userMessage).not.toContain("Sustain the bass");
  });

  it("E2 prompt does not include annotation_target.teaching_goals or style_tips", () => {
    const { prompt } = makePoisonedE2Records();
    const userMessage = buildE2UserPrompt(prompt);
    expect(userMessage).not.toContain("shape the descending line");
    expect(userMessage).not.toContain("soften from m. 3 onward");
  });

  it("E2 prompt does not include provenance.verdict_reason or scope.musical_phrase_label", () => {
    const { prompt } = makePoisonedE2Records();
    const userMessage = buildE2UserPrompt(prompt);
    expect(userMessage).not.toContain(SECRET_REASON_MARKER);
    expect(userMessage).not.toContain("cantabile opening");
  });

  it("E2 prompt DOES include scope fields and REMI tokens (the allowed fields)", () => {
    const { prompt } = makePoisonedE2Records();
    const userMessage = buildE2UserPrompt(prompt);
    expect(userMessage).toContain("test-piece");
    expect(userMessage).toContain("measures 1-4");
    expect(userMessage).toContain("4/4");
    expect(userMessage).toContain("Bar_1");
    expect(userMessage).toContain("Pitch_60");
  });
});

// ─── E3 prompt regression guard (opposite direction) ──────────────────────────
//
// E3 intentionally exposes annotation_target content — its purpose is to test
// whether the model can answer MCQs grounded in MIDI + annotation. These tests
// confirm that the annotation IS visible to the E3 builder in `full` context,
// so the previous direction's guard doesn't accidentally affect E3.

describe("E3 prompt design guard (annotation IS allowed)", () => {
  it("E3 'full' context prompt DOES include annotation_target content", () => {
    const record = makeCleanE3Record();
    const question = makeTestMCQ();
    const userMessage = buildE3UserPrompt(record, question, "full");
    // The marker must appear because annotation_target is intentionally
    // exposed in E3 — this is the E3 contract.
    expect(userMessage).toContain(SECRET_ANSWER_MARKER);
  });

  it("E3 'text_only' context prompt DOES include annotation prose (the test condition)", () => {
    const record = makeCleanE3Record();
    const question = makeTestMCQ();
    const userMessage = buildE3UserPrompt(record, question, "text_only");
    // text_only context exposes annotation prose without MIDI — that's the
    // ablation condition by design.
    expect(userMessage).toContain(SECRET_ANSWER_MARKER);
  });
});

// ─── Cross-record contamination guards ────────────────────────────────────────
//
// In Slice 12 the qwen2.5:7b runs were stateless (each E1/E2 call is its own
// HTTP request to Ollama). We assert here that calling buildE1Prompt or
// buildE2UserPrompt on a poisoned fixture does NOT mutate the record or pollute
// subsequent calls — i.e. prompt construction is referentially transparent.

describe("Prompt builders are pure (no record mutation, no cross-call state)", () => {
  it("buildE1Prompt does not mutate the input record", () => {
    const record = makePoisonedE1Record();
    const snapshot = JSON.stringify(record);
    buildE1Prompt(record);
    expect(JSON.stringify(record)).toBe(snapshot);
  });

  it("buildE2UserPrompt does not mutate the input record", () => {
    const { prompt } = makePoisonedE2Records();
    const snapshot = JSON.stringify(prompt);
    buildE2UserPrompt(prompt);
    expect(JSON.stringify(prompt)).toBe(snapshot);
  });

  it("Two sequential E1 calls on different records produce independent prompts", () => {
    const recA = makePoisonedE1Record();
    const recB = makePoisonedE1Record();
    recB.target_trace = {
      ...recB.target_trace,
      task_family: "different-task",
      objective: "Different objective text — should not appear in recA's prompt.",
    };
    const { userMessage: msgA } = buildE1Prompt(recA);
    const { userMessage: msgB } = buildE1Prompt(recB);
    expect(msgA).not.toContain("Different objective text");
    expect(msgB).toContain("Different objective text");
    expect(msgB).not.toContain("Read mm. 1-4 of a test piece");
  });
});
