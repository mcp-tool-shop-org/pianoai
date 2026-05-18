// ─── jam-actions-v0 Slice 17 — Tool-Scaffolded E3 Tests ─────────────────────
//
// Unit tests for `annotation-grounding-tool.ts`. Uses MOCK backends (no live
// LLM, no fetch, no global state). Verifies:
//   - Multi-turn tool call loop executes tool calls locally and feeds results
//     back to the next turn
//   - Tool-call trace is recorded faithfully (count, histogram, args, results)
//   - Termination reasons are reported correctly (model_answered, iteration_cap,
//     model_silent, backend_error)
//   - The final A/B/C/D answer is parsed and scored
//   - Graceful fall-through when the model doesn't call tools (still produces
//     a final answer or scores 0)
//   - Question runner aggregates correctly across n runs (majority pass)
//
// NO real LLM calls. NO fetch. NO live Ollama dependency.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  runToolInspectedQuestion,
  runToolInspectedForRecord,
  buildE3ToolUserPrompt,
  MAX_TOOL_ITERATIONS,
  type MultiTurnBackend,
  type MultiTurnResponse,
  type ToolUseMessage,
} from "./annotation-grounding-tool.js";
import {
  generateQuestionSet,
  isNotComputable,
  type E3Record,
  type MCQuestion,
} from "./annotation-grounding.js";
import type { ToolSchema, CallMeta } from "./llm-runner.js";

// ─── Mock backend builder ────────────────────────────────────────────────────

/**
 * Script the mock backend with a fixed sequence of responses (one per turn).
 * If the loop calls chat() more times than the script has, returns an empty
 * final response (model_silent).
 */
function makeScriptedBackend(script: MultiTurnResponse[]): MultiTurnBackend & {
  callCount(): number;
  lastMessages(): ToolUseMessage[];
  lastTools(): ToolSchema[];
} {
  let idx = 0;
  let lastMessages: ToolUseMessage[] = [];
  let lastTools: ToolSchema[] = [];
  const meta: CallMeta = {
    promptTokens: 10,
    completionTokens: 5,
    latencyMs: 1,
    costEstimate: 0,
  };
  return {
    name: "mock",
    model: "mock-model",
    async chat(args): Promise<MultiTurnResponse> {
      lastMessages = args.messages;
      lastTools = args.tools;
      if (idx >= script.length) {
        return { content: "", tool_calls: [] };
      }
      return script[idx++];
    },
    lastCallMetadata: () => ({ ...meta }),
    callCount: () => idx,
    lastMessages: () => lastMessages,
    lastTools: () => lastTools,
  };
}

// ─── Fixture record ──────────────────────────────────────────────────────────

function makeFixtureRecord(): E3Record {
  return {
    id: "test-rec:m001-002:piano:mcp-session:v1",
    scope: {
      song_id: "test-song",
      phrase_window: "measures 1-2",
      key: "C major",
      time_signature: "4/4",
    },
    provenance: {
      composition_title: "Test",
      composer: "Test",
      arrangement_creator: "Test",
      arrangement_license: null,
    },
    observation: {
      midi_sidecar: {
        timed_events: [
          { t_seconds: 0, t_ticks: 0, dur_seconds: 0.5, dur_ticks: 240, note: 60, name: "C4", velocity: 64, channel: 0, hand: "right", measure: 1, beat: 0 },
          { t_seconds: 0.5, t_ticks: 240, dur_seconds: 0.5, dur_ticks: 240, note: 64, name: "E4", velocity: 60, channel: 0, hand: "right", measure: 1, beat: 0.5 },
          { t_seconds: 1, t_ticks: 480, dur_seconds: 0.5, dur_ticks: 240, note: 67, name: "G4", velocity: 60, channel: 0, hand: "right", measure: 2, beat: 0 },
          { t_seconds: 1.5, t_ticks: 720, dur_seconds: 0.5, dur_ticks: 240, note: 48, name: "C3", velocity: 60, channel: 0, hand: "left", measure: 1, beat: 0 },
          { t_seconds: 2, t_ticks: 960, dur_seconds: 0.5, dur_ticks: 240, note: 52, name: "E3", velocity: 60, channel: 0, hand: "left", measure: 1, beat: 0.5 },
          { t_seconds: 2.5, t_ticks: 1200, dur_seconds: 0.5, dur_ticks: 240, note: 55, name: "G3", velocity: 60, channel: 0, hand: "left", measure: 2, beat: 0 },
        ],
      },
    },
    annotation_target: {
      measure_range: [1, 2],
      structure: "Test phrase",
      teaching_notes: [{ measure: 1, note: "Practice slowly." }],
    },
  };
}

function findMCQ(record: E3Record, type: string): MCQuestion {
  const qs = generateQuestionSet(record);
  const q = qs.questions[qs.questionTypeIndex.get(type as never)!];
  if (isNotComputable(q)) {
    throw new Error(`question type ${type} not computable for fixture`);
  }
  return q as MCQuestion;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("buildE3ToolUserPrompt", () => {
  it("includes annotation but NOT raw MIDI tokens", () => {
    const record = makeFixtureRecord();
    const q = findMCQ(record, "pitch_class_count");
    const prompt = buildE3ToolUserPrompt(record, q);
    // Annotation prose present
    expect(prompt).toContain("Test phrase");
    expect(prompt).toContain("Practice slowly.");
    // Question present
    expect(prompt).toContain("Question:");
    // Options present
    expect(prompt).toContain("A)");
    expect(prompt).toContain("B)");
    expect(prompt).toContain("C)");
    expect(prompt).toContain("D)");
    // Does NOT include raw note events
    expect(prompt).not.toMatch(/Pitch_/);
    expect(prompt).not.toMatch(/Bar_/);
  });
});

describe("runToolInspectedQuestion — happy path", () => {
  it("model calls tools then answers correctly", async () => {
    const record = makeFixtureRecord();
    const q = findMCQ(record, "hand_register");
    const correctLetter = ["A", "B", "C", "D"][q.correctOptionIndex];

    const backend = makeScriptedBackend([
      // Turn 1: model calls get_hand_balance
      {
        content: "",
        tool_calls: [{ tool: "get_hand_balance", arguments: {} }],
      },
      // Turn 2: model answers with the correct letter
      { content: correctLetter, tool_calls: [] },
    ]);

    const result = await runToolInspectedQuestion(record, q, backend, 0);

    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
    expect(result.selectedOptionIndex).toBe(q.correctOptionIndex);
    expect(result.trace.tool_call_count).toBe(1);
    expect(result.trace.tool_histogram["get_hand_balance"]).toBe(1);
    expect(result.trace.termination_reason).toBe("model_answered");
    expect(result.trace.iteration_cap_hit).toBe(false);
    expect(result.trace.calls[0].is_error).toBe(false);
    // Tool result should have actual numbers from our fixture (3 RH / 3 LH).
    expect(result.trace.calls[0].result).toMatchObject({
      right_count: 3,
      left_count: 3,
    });
  });
});

describe("runToolInspectedQuestion — multi-turn tool conversation", () => {
  it("supports >1 tool call and feeds results back as tool messages", async () => {
    const record = makeFixtureRecord();
    const q = findMCQ(record, "pitch_class_count");
    const correctLetter = ["A", "B", "C", "D"][q.correctOptionIndex];

    const backend = makeScriptedBackend([
      {
        content: "",
        tool_calls: [
          { tool: "count_distinct_pitch_classes", arguments: {} },
        ],
      },
      {
        content: "",
        tool_calls: [{ tool: "get_events_in_measure", arguments: { measure_number: 1 } }],
      },
      { content: correctLetter, tool_calls: [] },
    ]);

    const result = await runToolInspectedQuestion(record, q, backend, 0);

    expect(result.trace.tool_call_count).toBe(2);
    expect(result.trace.calls.length).toBe(2);
    expect(result.trace.calls[0].tool).toBe("count_distinct_pitch_classes");
    expect(result.trace.calls[1].tool).toBe("get_events_in_measure");
    expect(result.trace.termination_reason).toBe("model_answered");

    // Verify the conversation now includes tool messages and assistant turns.
    const msgs = backend.lastMessages();
    expect(msgs.some((m) => m.role === "tool")).toBe(true);
    expect(msgs.filter((m) => m.role === "assistant").length).toBeGreaterThan(0);
  });
});

describe("runToolInspectedQuestion — graceful fall-through", () => {
  it("falls through when model doesn't call any tools (text-only answer)", async () => {
    const record = makeFixtureRecord();
    const q = findMCQ(record, "pitch_class_count");
    const correctLetter = ["A", "B", "C", "D"][q.correctOptionIndex];

    const backend = makeScriptedBackend([
      // Model answers immediately without using tools — tool_call_count=0
      { content: correctLetter, tool_calls: [] },
    ]);

    const result = await runToolInspectedQuestion(record, q, backend, 0);

    expect(result.trace.tool_call_count).toBe(0);
    expect(result.trace.termination_reason).toBe("model_answered");
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
  });

  it("handles unknown tool names without throwing", async () => {
    const record = makeFixtureRecord();
    const q = findMCQ(record, "hand_register");
    const correctLetter = ["A", "B", "C", "D"][q.correctOptionIndex];

    const backend = makeScriptedBackend([
      {
        content: "",
        tool_calls: [{ tool: "nonexistent_inspector", arguments: { foo: "bar" } }],
      },
      { content: correctLetter, tool_calls: [] },
    ]);

    const result = await runToolInspectedQuestion(record, q, backend, 0);

    expect(result.trace.calls[0].is_error).toBe(true);
    expect(result.trace.calls[0].error_reason).toContain("unknown tool");
    expect(result.correct).toBe(true);
  });

  it("returns score=0 when model never emits an A/B/C/D", async () => {
    const record = makeFixtureRecord();
    const q = findMCQ(record, "pitch_class_count");

    const backend = makeScriptedBackend([
      // Model emits prose without a clear letter
      { content: "hmm, this is hard to say", tool_calls: [] },
    ]);

    const result = await runToolInspectedQuestion(record, q, backend, 0);

    expect(result.score).toBe(0);
    expect(result.correct).toBe(false);
    expect(result.selectedOptionIndex).toBeNull();
  });
});

describe("runToolInspectedQuestion — iteration cap", () => {
  it("hits the cap when model keeps calling tools forever", async () => {
    const record = makeFixtureRecord();
    const q = findMCQ(record, "hand_register");

    // Build a script with > MAX_TOOL_ITERATIONS tool-call responses.
    const cycle: MultiTurnResponse = {
      content: "",
      tool_calls: [{ tool: "get_hand_balance", arguments: {} }],
    };
    const script: MultiTurnResponse[] = Array.from({ length: MAX_TOOL_ITERATIONS + 5 }).map(() => cycle);

    const backend = makeScriptedBackend(script);
    const result = await runToolInspectedQuestion(record, q, backend, 0);

    expect(result.trace.iteration_cap_hit).toBe(true);
    expect(result.trace.termination_reason).toBe("iteration_cap");
    expect(result.trace.tool_call_count).toBe(MAX_TOOL_ITERATIONS);
    expect(result.score).toBe(0);
  });

  it("respects a custom maxIterations override", async () => {
    const record = makeFixtureRecord();
    const q = findMCQ(record, "hand_register");

    const cycle: MultiTurnResponse = {
      content: "",
      tool_calls: [{ tool: "get_hand_balance", arguments: {} }],
    };
    const script: MultiTurnResponse[] = Array.from({ length: 10 }).map(() => cycle);

    const backend = makeScriptedBackend(script);
    const result = await runToolInspectedQuestion(record, q, backend, 0, 3);

    expect(result.trace.tool_call_count).toBe(3);
    expect(result.trace.iteration_cap_hit).toBe(true);
  });
});

describe("runToolInspectedQuestion — backend error", () => {
  it("records backend_error when backend throws mid-loop", async () => {
    const record = makeFixtureRecord();
    const q = findMCQ(record, "hand_register");

    const backend: MultiTurnBackend = {
      name: "throwing-mock",
      model: "mock",
      async chat() {
        throw new Error("simulated network failure");
      },
      lastCallMetadata: () => ({
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 0,
        costEstimate: 0,
      }),
    };

    const result = await runToolInspectedQuestion(record, q, backend, 0);
    expect(result.trace.termination_reason).toBe("backend_error");
    expect(result.score).toBe(0);
    expect(result.meta.parseError).toContain("simulated network failure");
  });
});

describe("runToolInspectedForRecord — record-level aggregation", () => {
  it("aggregates n runs across all load-bearing question types", async () => {
    const record = makeFixtureRecord();
    // Always answer the correct letter; never call tools.
    const allRecords: E3Record[] = [
      record,
      { ...record, id: "test-rec-2:m001-002:piano:mcp-session:v1" },
    ];

    // Build a backend that infers the current question from the user message
    // and returns the correct letter. The runner runs questions in the order
    // {pitch_class_count, hand_register, rhythm_onset, annotation_grounding}
    // with n runs each — outer order is q × run-index.
    const qs = generateQuestionSet(record);
    const qByText = new Map<string, MCQuestion>();
    for (const q of qs.questions) {
      if (!isNotComputable(q)) qByText.set((q as MCQuestion).questionText, q as MCQuestion);
    }

    const backend: MultiTurnBackend = {
      name: "perfect-mock",
      model: "perfect",
      async chat(args): Promise<MultiTurnResponse> {
        const userMsg = args.messages.find((m) => m.role === "user");
        const text = userMsg?.content ?? "";
        // Match the question by substring (questionText is uniquely identifying).
        let matched: MCQuestion | null = null;
        for (const [qt, q] of qByText.entries()) {
          if (text.includes(qt)) {
            matched = q;
            break;
          }
        }
        if (!matched) return { content: "", tool_calls: [] };
        const letter = ["A", "B", "C", "D"][matched.correctOptionIndex];
        return { content: letter, tool_calls: [] };
      },
      lastCallMetadata: () => ({
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 0,
        costEstimate: 0,
      }),
    };

    const result = await runToolInspectedForRecord(record, allRecords, backend, 2);

    // 4 load-bearing question types × 2 runs = 8 calls
    expect(result.questions.length).toBe(4);
    // Mock always answers correctly → aggregate = 1.0
    expect(result.aggregate.tool_inspected).toBe(1.0);
    // Tool stats: 0 calls total since the mock never used tools
    expect(result.toolUseStats.total_tool_calls).toBe(0);
    expect(result.toolUseStats.mean_calls_per_question).toBe(0);
    expect(result.toolUseStats.questions_with_zero_calls).toBe(8);
    expect(result.toolUseStats.model_answered_count).toBe(8);
  });
});
