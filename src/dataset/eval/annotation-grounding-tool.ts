// ─── jam-actions-v0 Slice 17 — Tool-Scaffolded E3 Variant ───────────────────
//
// Adds a fourth evaluation context (`tool_inspected`) on top of the existing
// E3 harness in `annotation-grounding.ts`. In this context the model receives
// the annotation_target + the question, plus the MIDI Inspector tool schemas
// (NOT the raw MIDI sidecar). The model performs multi-turn tool calls to
// inspect MIDI events, then emits a final MCQ answer.
//
// Hard rules (LOCKED by Slice 17 kickoff):
//   - annotation-grounding.ts is byte-identical. MCQ generators imported, not forked.
//   - Tools (midi-inspector.ts) are PURE deterministic functions over timed_events.
//     They run LOCALLY in this process — there is no network call back to a tool
//     server. Tool calls are executed in-process inside the multi-turn loop.
//   - No MCP-server changes. The tool surface here is INTERNAL to E3.
//   - Tool-call iteration is capped (default MAX_TOOL_ITERATIONS=10) to prevent
//     runaway loops. Cap-hit is recorded explicitly in the trace.
//   - Graceful handling: malformed args, unknown tools, no tool calls — all
//     recorded with explicit failure mode, never thrown.
//
// The new context is exposed alongside the existing 3 contexts so a slice doc
// can compare all four side-by-side:
//   - text_only     (legacy: annotation prose only)
//   - full          (legacy: annotation + raw MIDI sidecar text)
//   - random_midi   (legacy: annotation + WRONG MIDI sidecar)
//   - tool_inspected (NEW:   annotation + MIDI inspector tool schemas, multi-turn)
//
// The new release threshold (operator-locked, not enforced here, reported in
// the slice doc): `tool_inspected − text_only ≥ +0.10`.
// ─────────────────────────────────────────────────────────────────────────────

import {
  generateQuestionSet,
  selectRandomMidiPartner,
  extractAnnotationProse,
  LOAD_BEARING_TYPES,
  QUESTION_TYPES,
  isNotComputable as isNotComputableE3,
  type E3Record,
  type MCQuestion,
  type QuestionType,
} from "./annotation-grounding.js";
import {
  inspectorToolSchemas,
  findInspectorTool,
} from "./midi-inspector.js";
import {
  parseE3Response,
  E3_ABSTAIN,
  type LlmBackend,
  type ToolSchema,
  type CallMeta,
  type RunMeta,
  type E3Context as LegacyE3Context,
  E3_MARGIN_THRESHOLD,
} from "./llm-runner.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Max tool-call iterations per question. Prevents runaway loops. */
export const MAX_TOOL_ITERATIONS = 10;

/** Re-export the legacy threshold so callers don't need two imports. */
export { E3_MARGIN_THRESHOLD };

// ─── Extended context: includes `tool_inspected` ─────────────────────────────

export type E3ContextWithTool = LegacyE3Context | "tool_inspected";

// ─── Tool-call trace ─────────────────────────────────────────────────────────

/**
 * Per-call record of what the model invoked and what came back.
 * Stored in the question result for slice-doc tool-use statistics.
 */
export interface ToolCallTraceEntry {
  /** 1-based iteration index within the multi-turn loop. */
  iteration: number;
  /** Tool name requested by the model. */
  tool: string;
  /** Arguments the model passed (raw from the model — may be malformed). */
  arguments: Record<string, unknown>;
  /** Result the tool returned (or `{ error: ... }` for malformed args/unknown). */
  result: unknown;
  /** True iff the tool name is unknown or its args could not be parsed. */
  is_error: boolean;
  /** When is_error: the error string. */
  error_reason: string | null;
}

/**
 * Full trace + stats for a single tool-scaffolded question call.
 */
export interface ToolInspectedTrace {
  /** Multi-turn tool-call log (one entry per tool invocation). */
  calls: ToolCallTraceEntry[];
  /** Total number of tool calls the model made. */
  tool_call_count: number;
  /** True if MAX_TOOL_ITERATIONS was reached (loop terminated early). */
  iteration_cap_hit: boolean;
  /** Per-tool histogram (tool_name → call_count). */
  tool_histogram: Record<string, number>;
  /**
   * Reason the loop terminated:
   *   "model_answered"       — model emitted text content (no more tool calls)
   *   "iteration_cap"        — MAX_TOOL_ITERATIONS reached
   *   "model_silent"         — model returned no text and no tool calls
   *   "backend_error"        — backend threw mid-loop
   */
  termination_reason:
    | "model_answered"
    | "iteration_cap"
    | "model_silent"
    | "backend_error";
  /** Raw final text from the model (may contain the A/B/C/D answer). */
  final_text: string | null;
}

// ─── Multi-turn backend interface ────────────────────────────────────────────

/**
 * Minimal multi-turn backend for tool-inspected E3. Implementations:
 *   - OllamaMultiTurnBackend in this file (production, calls /api/chat directly)
 *   - Mock backends in annotation-grounding-tool.test.ts (no LLM)
 *
 * The interface is intentionally NOT folded into `LlmBackend` — that interface
 * is locked by Slices 7.5+ and changing it would ripple through every test.
 * Tool-inspected E3 is the FIRST place we need multi-turn tool conversations;
 * keeping the abstraction here lets us iterate without touching the legacy
 * runner contract.
 */
export interface ToolUseMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    tool: string;
    arguments: Record<string, unknown>;
  }>;
}

export interface MultiTurnResponse {
  /** Text content from the assistant (final answer, or empty if all tool calls). */
  content: string;
  /** Tool calls the model emitted this turn (may be empty). */
  tool_calls: Array<{ tool: string; arguments: Record<string, unknown> }>;
}

export interface MultiTurnBackend {
  readonly name: string;
  readonly model: string;
  /**
   * Send a conversation + tool schemas; receive the model's next turn.
   * Multi-turn loops feed prior tool results back as `role:"tool"` messages.
   */
  chat(args: {
    messages: ToolUseMessage[];
    tools: ToolSchema[];
  }): Promise<MultiTurnResponse>;
  /** Metadata from the most recent chat call. */
  lastCallMetadata(): CallMeta;
}

// ─── OllamaMultiTurnBackend (production) ─────────────────────────────────────

/**
 * Production multi-turn backend over Ollama's /api/chat endpoint.
 *
 * Note: this is a thin parallel to `OllamaBackend.callWithTools`, but accepts
 * an arbitrary message history (so we can feed tool results back) and returns
 * BOTH content and tool_calls (so the loop can decide what to do next).
 *
 * Built on raw fetch — no extra deps. Same env-var handling as OllamaBackend.
 */
interface OllamaApiToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface OllamaApiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaApiToolCall[];
}

interface OllamaApiChatResponse {
  model: string;
  message: OllamaApiMessage;
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaMultiTurnBackend implements MultiTurnBackend {
  readonly name = "ollama";
  readonly model: string;
  private readonly baseUrl: string;
  private _lastMeta: CallMeta = {
    promptTokens: 0,
    completionTokens: 0,
    latencyMs: 0,
    costEstimate: 0,
  };

  constructor(model: string, baseUrl?: string) {
    this.model = model;
    const raw =
      baseUrl ?? (process.env.OLLAMA_HOST ?? "http://localhost:11434");
    this.baseUrl =
      raw.startsWith("http://") || raw.startsWith("https://")
        ? raw
        : `http://${raw}`;
  }

  async chat(args: {
    messages: ToolUseMessage[];
    tools: ToolSchema[];
  }): Promise<MultiTurnResponse> {
    const ollamaTools = args.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    const url = `${this.baseUrl}/api/chat`;
    const t0 = Date.now();
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: args.messages,
          tools: ollamaTools,
          stream: false,
        }),
      });
    } catch (err) {
      throw new Error(
        `Ollama not reachable at ${this.baseUrl}. ` +
          `Underlying error: ${String(err)}`,
      );
    }
    const latencyMs = Date.now() - t0;
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(
        `Ollama returned HTTP ${resp.status}: ${text.slice(0, 200)}`,
      );
    }
    const data = (await resp.json()) as OllamaApiChatResponse;
    this._lastMeta = {
      promptTokens: data.prompt_eval_count ?? 0,
      completionTokens: data.eval_count ?? 0,
      latencyMs,
      costEstimate: 0,
    };

    const toolCalls = data.message.tool_calls ?? [];
    return {
      content: data.message.content ?? "",
      tool_calls: toolCalls.map((tc) => ({
        tool: tc.function.name,
        arguments: tc.function.arguments,
      })),
    };
  }

  lastCallMetadata(): CallMeta {
    return { ...this._lastMeta };
  }
}

// ─── Prompt builders ─────────────────────────────────────────────────────────

const E3_TOOL_SYSTEM_TEXT =
  "You are answering multiple-choice questions about piano music phrases. " +
  "Each question has exactly 4 options labeled A, B, C, D.\n\n" +
  "You DO NOT see the raw MIDI data. Instead, you have access to a set of " +
  "MIDI INSPECTION TOOLS that let you query specific facts about the phrase " +
  "(notes in a measure, hand balance, pitch at a position, etc.).\n\n" +
  "Strategy:\n" +
  "  1. Read the annotation and question carefully.\n" +
  "  2. If the question requires MIDI-grounded evidence " +
  "(pitch counts, hand counts, specific notes, beat onsets), CALL THE TOOLS to inspect.\n" +
  "  3. After gathering enough evidence, respond with ONLY the single letter " +
  "(A, B, C, or D) of your chosen answer. " +
  "No explanation, no punctuation — just the letter.\n\n" +
  "Tool calls are free and fast; use them whenever the annotation alone does " +
  "not contain a specific fact you need.";

// B-2 abstain surface (finetune-arc-b2 P0-LOCK §6): the tool_inspected variant
// gains the out-of-band E option too, so a model that genuinely cannot ground a
// question (even with the tools) can decline rather than guess. The tool surface
// is answerable, so abstention here is itself a signal (reported, not a bar).
const E3_TOOL_SYSTEM_TEXT_ABSTAIN =
  E3_TOOL_SYSTEM_TEXT.replace(
    "respond with ONLY the single letter " + "(A, B, C, or D) of your chosen answer. ",
    "respond with ONLY the single letter (A, B, C, D, or E) of your chosen answer, " +
      "where E means the question CANNOT be determined even after inspecting — do NOT guess. ",
  );

/**
 * Build the user message for the tool-inspected condition. Includes the
 * annotation_target prose + question + options + a "use tools as needed"
 * instruction. Does NOT include the raw MIDI sidecar.
 */
export function buildE3ToolUserPrompt(
  record: E3Record,
  question: MCQuestion,
  opts?: { abstain?: boolean },
): string {
  const at = record.annotation_target;
  const abstain = opts?.abstain === true;
  const optionLabels = ["A", "B", "C", "D"] as const;
  let optionsText = question.options
    .map((opt, i) => `${optionLabels[i]}) ${opt}`)
    .join("\n");
  if (abstain) optionsText += `\nE) cannot be determined from what is given`;

  const annotationBlock = [
    at.structure ? `Structure: ${at.structure}` : null,
    at.key_moments?.length
      ? `Key moments: ${at.key_moments.join("; ")}`
      : null,
    at.teaching_goals?.length
      ? `Teaching goals: ${at.teaching_goals.join("; ")}`
      : null,
    at.style_tips?.length ? `Style tips: ${at.style_tips.join("; ")}` : null,
    at.teaching_notes?.length
      ? `Teaching notes: ${at.teaching_notes
          .map(
            (tn) =>
              `m${tn.measure}: ${tn.note}` +
              (tn.technique?.length ? ` (${tn.technique.join(", ")})` : ""),
          )
          .join("; ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const scopeBlock =
    `Song: ${record.scope.song_id}\n` +
    `Composer: ${record.provenance.composer}\n` +
    `Key: ${record.scope.key}\n` +
    `Time signature: ${record.scope.time_signature}\n` +
    `Phrase: ${record.scope.phrase_window}`;

  return (
    `${scopeBlock}\n\n` +
    `Annotation:\n${annotationBlock}\n\n` +
    `Question: ${question.questionText}\n` +
    `Options:\n${optionsText}\n\n` +
    `Use the MIDI inspector tools as needed to inspect the phrase, ` +
    `then respond with ONLY ${abstain ? "A, B, C, D, or E" : "A, B, C, or D"}.`
  );
}

// ─── Multi-turn tool-inspected question runner ───────────────────────────────

export interface ToolInspectedQuestionRunResult {
  run: number;
  context: "tool_inspected";
  questionType: QuestionType;
  meta: RunMeta;
  selectedOptionIndex: number | null;
  correct: boolean;
  score: number;
  trace: ToolInspectedTrace;
  /** B-2 3-way outcome (§6.2); "abstain" only in the abstain surface. */
  outcome: "correct" | "wrong" | "abstain";
}

/**
 * Run a single tool-inspected E3 question against a multi-turn backend.
 *
 * Multi-turn loop:
 *   1. Send system + user message with tool schemas.
 *   2. If model emits tool_calls: execute each locally, append as tool
 *      messages, loop.
 *   3. If model emits text content with no tool_calls: parse for A/B/C/D.
 *   4. Cap at MAX_TOOL_ITERATIONS to prevent runaway.
 *
 * The runner records the FULL trace (every tool call + result) for slice-doc
 * statistics. On any failure mode (parse failure, cap hit, backend error), the
 * trace records the explicit reason and the question scores 0.
 */
export async function runToolInspectedQuestion(
  record: E3Record,
  question: MCQuestion,
  backend: MultiTurnBackend,
  runIndex: number,
  maxIterations: number = MAX_TOOL_ITERATIONS,
  opts?: { abstain?: boolean },
): Promise<ToolInspectedQuestionRunResult> {
  const abstain = opts?.abstain === true;
  const runId = `${record.id}:E3:tool_inspected:${question.questionType}:run${runIndex + 1}`;
  const tools = inspectorToolSchemas();

  const userMessage = buildE3ToolUserPrompt(record, question, { abstain });
  const messages: ToolUseMessage[] = [
    { role: "system", content: abstain ? E3_TOOL_SYSTEM_TEXT_ABSTAIN : E3_TOOL_SYSTEM_TEXT },
    { role: "user", content: userMessage },
  ];

  const trace: ToolInspectedTrace = {
    calls: [],
    tool_call_count: 0,
    iteration_cap_hit: false,
    tool_histogram: {},
    termination_reason: "model_silent",
    final_text: null,
  };

  let cumulativeMeta: CallMeta = {
    promptTokens: 0,
    completionTokens: 0,
    latencyMs: 0,
    costEstimate: 0,
  };

  let iteration = 0;
  let finalText: string | null = null;
  let backendError: string | null = null;

  while (iteration < maxIterations) {
    iteration++;
    let resp: MultiTurnResponse;
    try {
      resp = await backend.chat({ messages, tools });
    } catch (err) {
      backendError = String(err);
      trace.termination_reason = "backend_error";
      break;
    }
    const callMeta = backend.lastCallMetadata();
    cumulativeMeta = {
      promptTokens: cumulativeMeta.promptTokens + callMeta.promptTokens,
      completionTokens: cumulativeMeta.completionTokens + callMeta.completionTokens,
      latencyMs: cumulativeMeta.latencyMs + callMeta.latencyMs,
      costEstimate: cumulativeMeta.costEstimate + callMeta.costEstimate,
    };

    if (resp.tool_calls && resp.tool_calls.length > 0) {
      // Execute each tool call locally; append result as a tool message.
      // Append the assistant turn first (with its tool_calls), so the loop
      // history correctly reflects the multi-turn shape.
      messages.push({
        role: "assistant",
        content: resp.content ?? "",
        tool_calls: resp.tool_calls,
      });

      for (const tc of resp.tool_calls) {
        const tool = findInspectorTool(tc.tool);
        let result: unknown;
        let isError = false;
        let errorReason: string | null = null;
        if (!tool) {
          isError = true;
          errorReason = `unknown tool: ${tc.tool}`;
          result = { error: errorReason };
        } else {
          try {
            result = tool.run(record, tc.arguments ?? {});
          } catch (err) {
            isError = true;
            errorReason = `tool ${tc.tool} threw: ${String(err)}`;
            result = { error: errorReason };
          }
        }

        trace.calls.push({
          iteration,
          tool: tc.tool,
          arguments: tc.arguments ?? {},
          result,
          is_error: isError,
          error_reason: errorReason,
        });
        trace.tool_call_count++;
        trace.tool_histogram[tc.tool] =
          (trace.tool_histogram[tc.tool] ?? 0) + 1;

        messages.push({
          role: "tool",
          content: JSON.stringify(result),
        });
      }
      // Continue loop — the model has the tool results, can answer next turn.
      continue;
    }

    // No tool calls this turn: the model has answered (or given up).
    finalText = resp.content;
    if (finalText && finalText.trim().length > 0) {
      trace.termination_reason = "model_answered";
    } else {
      trace.termination_reason = "model_silent";
    }
    break;
  }

  if (iteration >= maxIterations && trace.termination_reason === "model_silent") {
    trace.iteration_cap_hit = true;
    trace.termination_reason = "iteration_cap";
  }

  trace.final_text = finalText;

  const meta: RunMeta = {
    runId,
    backend: backend.name,
    modelId: backend.model,
    promptTokens: cumulativeMeta.promptTokens,
    completionTokens: cumulativeMeta.completionTokens,
    costUsd: cumulativeMeta.costEstimate,
    latencyMs: cumulativeMeta.latencyMs,
    parseOk: finalText !== null && finalText.length > 0,
    parseError: backendError,
  };

  if (finalText === null || finalText.length === 0) {
    return {
      run: runIndex + 1,
      context: "tool_inspected",
      questionType: question.questionType,
      meta: { ...meta, parseOk: false, parseError: meta.parseError ?? "no final answer" },
      selectedOptionIndex: null,
      correct: false,
      score: 0,
      trace,
      outcome: "wrong",
    };
  }

  const selectedIndex = parseE3Response(finalText, abstain);
  if (selectedIndex === null) {
    return {
      run: runIndex + 1,
      context: "tool_inspected",
      questionType: question.questionType,
      meta: { ...meta, parseOk: false, parseError: abstain ? "no A/B/C/D/E found in final response" : "no A/B/C/D found in final response" },
      selectedOptionIndex: null,
      correct: false,
      score: 0,
      trace,
      outcome: "wrong",
    };
  }

  // B-2 abstain (§6.2): the model declined even after tool access. Scored as
  // not-correct (tool_inspected_mean unchanged); the abstain is carried in
  // `outcome` and reported as a signal (the tool surface is answerable).
  if (selectedIndex === E3_ABSTAIN) {
    return {
      run: runIndex + 1,
      context: "tool_inspected",
      questionType: question.questionType,
      meta,
      selectedOptionIndex: null,
      correct: false,
      score: 0,
      trace,
      outcome: "abstain",
    };
  }

  const correct = selectedIndex === question.correctOptionIndex;
  return {
    run: runIndex + 1,
    context: "tool_inspected",
    questionType: question.questionType,
    meta,
    selectedOptionIndex: selectedIndex,
    correct,
    score: correct ? 1 : 0,
    trace,
    outcome: correct ? "correct" : "wrong",
  };
}

// ─── Record runner (all load-bearing questions × n runs, tool_inspected only) ─

export interface ToolInspectedRecordResult {
  recordId: string;
  questions: Array<{
    questionType: QuestionType;
    questionText: string;
    correctOptionIndex: number;
    options: [string, string, string, string];
    runs: ToolInspectedQuestionRunResult[];
    majorityScore: number;
  }>;
  aggregate: {
    tool_inspected: number | null;
  };
  randomMidiPartnerId: string;
  /** Aggregate tool-use statistics over all (question × run) tool calls. */
  toolUseStats: {
    total_tool_calls: number;
    mean_calls_per_question: number;
    questions_with_zero_calls: number;
    questions_with_one_call: number;
    questions_with_2_calls: number;
    questions_with_3plus_calls: number;
    tool_histogram: Record<string, number>;
    iteration_cap_hit_count: number;
    backend_error_count: number;
    model_silent_count: number;
    model_answered_count: number;
  };
}

function strictMajorityPass(scores: number[]): boolean {
  if (scores.length === 0) return false;
  const passes = scores.filter((s) => s === 1).length;
  return passes >= Math.ceil(scores.length / 2);
}

/**
 * Run tool-inspected E3 across all 4 load-bearing question types for one
 * record (PITCH_CLASS_COUNT, HAND_REGISTER, RHYTHM_ONSET, ANNOTATION_GROUNDING).
 * n is the number of fresh model calls per question.
 */
export async function runToolInspectedForRecord(
  record: E3Record,
  allRecords: E3Record[],
  backend: MultiTurnBackend,
  n: number,
  maxIterations: number = MAX_TOOL_ITERATIONS,
  opts?: { abstain?: boolean },
): Promise<ToolInspectedRecordResult> {
  const abstain = opts?.abstain === true;
  const questionSet = generateQuestionSet(record);
  const randomMidiRecord = selectRandomMidiPartner(record, allRecords);

  const typeOrder: QuestionType[] = [
    QUESTION_TYPES.PITCH_CLASS_COUNT,
    QUESTION_TYPES.HAND_REGISTER,
    QUESTION_TYPES.RHYTHM_ONSET,
    QUESTION_TYPES.ANNOTATION_GROUNDING,
  ];

  const loadBearingTypeValues = new Set<QuestionType>(LOAD_BEARING_TYPES);

  const questionResults: ToolInspectedRecordResult["questions"] = [];

  // Aggregate tool-use stats across all questions × runs.
  const tally = {
    total_tool_calls: 0,
    mean_calls_per_question: 0,
    questions_with_zero_calls: 0,
    questions_with_one_call: 0,
    questions_with_2_calls: 0,
    questions_with_3plus_calls: 0,
    tool_histogram: {} as Record<string, number>,
    iteration_cap_hit_count: 0,
    backend_error_count: 0,
    model_silent_count: 0,
    model_answered_count: 0,
  };
  let totalRuns = 0;

  for (const qType of typeOrder) {
    const idx = questionSet.questionTypeIndex.get(qType)!;
    const q = questionSet.questions[idx];
    if (isNotComputableE3(q)) continue;
    if (!loadBearingTypeValues.has(qType)) continue;

    const mcq = q as MCQuestion;
    const runs: ToolInspectedQuestionRunResult[] = [];
    for (let r = 0; r < n; r++) {
      const result = await runToolInspectedQuestion(
        record,
        mcq,
        backend,
        r,
        maxIterations,
        { abstain },
      );
      runs.push(result);
      totalRuns++;

      tally.total_tool_calls += result.trace.tool_call_count;
      if (result.trace.tool_call_count === 0) tally.questions_with_zero_calls++;
      else if (result.trace.tool_call_count === 1) tally.questions_with_one_call++;
      else if (result.trace.tool_call_count === 2) tally.questions_with_2_calls++;
      else tally.questions_with_3plus_calls++;

      for (const [tool, c] of Object.entries(result.trace.tool_histogram)) {
        tally.tool_histogram[tool] = (tally.tool_histogram[tool] ?? 0) + c;
      }
      switch (result.trace.termination_reason) {
        case "iteration_cap":
          tally.iteration_cap_hit_count++;
          break;
        case "backend_error":
          tally.backend_error_count++;
          break;
        case "model_silent":
          tally.model_silent_count++;
          break;
        case "model_answered":
          tally.model_answered_count++;
          break;
      }
    }

    const scores = runs.map((r) => r.score);
    const majorityScore = strictMajorityPass(scores) ? 1 : 0;

    questionResults.push({
      questionType: qType,
      questionText: mcq.questionText,
      correctOptionIndex: mcq.correctOptionIndex,
      options: mcq.options,
      runs,
      majorityScore,
    });
  }

  tally.mean_calls_per_question =
    totalRuns > 0 ? tally.total_tool_calls / totalRuns : 0;

  const lbResults = questionResults.filter((q) =>
    loadBearingTypeValues.has(q.questionType),
  );
  const aggregate_tool_inspected =
    lbResults.length === 0
      ? null
      : lbResults.reduce((s, q) => s + q.majorityScore, 0) / lbResults.length;

  return {
    recordId: record.id,
    questions: questionResults,
    aggregate: { tool_inspected: aggregate_tool_inspected },
    randomMidiPartnerId: randomMidiRecord.id,
    toolUseStats: tally,
  };
}

// ─── Convenience: legacy LlmBackend adapter ──────────────────────────────────
//
// The corpus eval runner already constructs an OllamaBackend (LlmBackend
// interface) for E1/E2/E3 legacy contexts. For tool_inspected we need a
// MultiTurnBackend. To avoid building two backends in the runner, expose
// a constructor that adapts an existing OllamaBackend's host + model. The
// runner can call this once and reuse for tool_inspected calls.
//
// NOTE: this does NOT add a method to the LlmBackend interface — that
// interface remains locked. Tool-inspected E3 is the only consumer of the
// MultiTurnBackend interface.

/** Construct a production OllamaMultiTurnBackend from a model id. */
export function createOllamaMultiTurnBackend(
  model: string,
  baseUrl?: string,
): OllamaMultiTurnBackend {
  return new OllamaMultiTurnBackend(model, baseUrl);
}

// ─── Re-exports for downstream consumers ─────────────────────────────────────

export { extractAnnotationProse, selectRandomMidiPartner } from "./annotation-grounding.js";
