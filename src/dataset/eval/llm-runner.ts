// ─── jam-actions-v0 Slice 7.5 LLM Runner (Backend-Agnostic) ──────────────────
//
// Backend-agnostic dispatcher + prompt builders + output parsers.
// All eval logic lives here; backend-specific calls live in llm-backends/*.
//
// Three backends (in priority order):
//   1. ollama-intern (default) — raw Ollama HTTP, shares endpoint with intern
//   2. ollama            — raw Ollama HTTP (localhost:11434), explicit
//   3. anthropic         — Anthropic SDK (optional, explicit --backend anthropic)
//
// Design constraints:
//   - NO paid API required for default run
//   - Anthropic SDK must be dynamically imported only when used
//   - Reuses eval harnesses (tool-use.ts, phrase-continuation.ts,
//     annotation-grounding.ts) for scoring — no reimplementation
//   - NO corpus modification
//   - Backend interface makes it easy to add new backends (vLLM, llama.cpp, etc.)
//
// Locked thresholds (from synthesis Section 4):
//   E1: gold pass rate ≥ 0.70
//   E2: groove OA ≥ 0.797 vs gold
//   E3: full > text-only by ≥0.10; full > random-MIDI by ≥0.10
// ─────────────────────────────────────────────────────────────────────────────

import type { ToolSchemaCatalog } from "../trace-validator.js";
import {
  evaluateGoldTrace,
  type RecordEvaluation,
} from "./tool-use.js";
import {
  evaluatePair,
  type PairRecord,
  type PairE2Result,
  isNotComputable,
} from "./phrase-continuation.js";
import {
  generateQuestionSet,
  extractAnnotationProse,
  selectRandomMidiPartner,
  LOAD_BEARING_TYPES,
  QUESTION_TYPES,
  isNotComputable as isNotComputableE3,
  type E3Record,
  type MCQuestion,
  type QuestionType,
} from "./annotation-grounding.js";
import type { TargetTrace, TimedEvent } from "../schema.js";

// ─── Backend interface ────────────────────────────────────────────────────────

/** Schema for a single tool, compatible with MCP schema catalog format. */
export interface ToolSchema {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/** Result from a tool-use call. */
export interface ToolUseResult {
  toolCalls: Array<{ tool: string; arguments: Record<string, unknown> }>;
  rawText: string | null;
}

/** Per-call metadata returned by every backend. */
export interface CallMeta {
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  costEstimate: number; // USD; 0 for local backends
}

/**
 * Backend interface — implement this to add new LLM backends.
 * Current implementations: OllamaBackend, OllamaInternBackend, AnthropicBackend.
 * Future: vLLM, llama.cpp server, LM Studio, etc.
 */
export interface LlmBackend {
  /** Human-readable backend name (for logging and reports). */
  readonly name: string;
  /** Model identifier (e.g. "hermes3:8b", "claude-sonnet-4-5"). */
  readonly model: string;

  /**
   * Tool-use call (E1): pass tool schemas + system + user.
   * Returns tool call blocks.
   */
  callWithTools(args: {
    systemPrompt: string;
    userMessage: string;
    tools: ToolSchema[];
  }): Promise<ToolUseResult>;

  /**
   * Structured output call (E2): pass JSON schema + prompt.
   * Returns parsed JSON matching the schema.
   */
  callStructured<T>(args: {
    systemPrompt: string;
    userMessage: string;
    outputSchema: Record<string, unknown>;
  }): Promise<T>;

  /**
   * Plain text completion call (E3): pass prompt, get text back.
   */
  callPlain(args: {
    systemPrompt: string;
    userMessage: string;
    maxTokens?: number;
  }): Promise<string>;

  /** Metadata from the most recent call (tokens, cost, latency). */
  lastCallMetadata(): CallMeta;
}

// ─── Per-run metadata ─────────────────────────────────────────────────────────

export interface RunMeta {
  runId: string; // "<recordId>:<eval>:run<n>"
  backend: string;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
  parseOk: boolean;
  parseError: string | null;
}

// ─── Locked thresholds ────────────────────────────────────────────────────────

export const E1_GOLD_PASS_RATE_THRESHOLD = 0.70;
export const E2_GROOVE_THRESHOLD = 0.797;
export const E3_MARGIN_THRESHOLD = 0.10;

// ─── Majority pass helper ─────────────────────────────────────────────────────

/** Returns true if ≥ ceil(n/2) runs passed (majority-pass). */
export function majorityPass(runs: Array<{ score: number }>): boolean {
  const passCount = runs.filter((r) => r.score === 1).length;
  return passCount >= Math.ceil(runs.length / 2);
}

// ─── E1: Tool-use prompt builder ──────────────────────────────────────────────

/** System prompt for E1 — backend-agnostic, stable across all E1 runs. */
const E1_SYSTEM_TEXT =
  "You are operating AI Jam Sessions, a music education platform. " +
  "Tools available are the full MCP tool surface listed below. " +
  "Given the user's request, produce ONLY the sequence of tool calls that " +
  "the session would make — no additional prose. " +
  "Use the exact tool names and argument names as defined in the tool schemas.";

export interface E1Prompt {
  systemPrompt: string;
  userMessage: string;
}

export function buildE1Prompt(record: { target_trace: TargetTrace }): E1Prompt {
  const { task_family, objective } = record.target_trace;
  const userMessage =
    `Task family: ${task_family}\n` +
    `Objective: ${objective}\n\n` +
    "Call the appropriate tools in the correct order to complete this task.";
  return { systemPrompt: E1_SYSTEM_TEXT, userMessage };
}

/** Convert ToolSchemaCatalog to backend-agnostic ToolSchema[]. */
export function buildE1ToolSchemas(catalog: ToolSchemaCatalog): ToolSchema[] {
  return catalog.tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema as Record<string, unknown>,
  }));
}

// ─── E1 output parser ─────────────────────────────────────────────────────────

/** Extract tool calls from a ToolUseResult. */
export function parseE1Response(
  result: ToolUseResult,
): Array<{ tool: string; arguments: Record<string, unknown> }> {
  return result.toolCalls;
}

// ─── E1 record runner ──────────────────────────────────────────────────────────

export interface E1RunResult {
  run: number;
  meta: RunMeta;
  toolCalls: Array<{ tool: string; arguments: Record<string, unknown> }>;
  evaluation: RecordEvaluation | null;
  passed: boolean;
}

export async function runE1ForRecord(
  record: { id: string; target_trace: TargetTrace },
  catalog: ToolSchemaCatalog,
  backend: LlmBackend,
  runIndex: number,
): Promise<E1RunResult> {
  const runId = `${record.id}:E1:run${runIndex + 1}`;
  const prompt = buildE1Prompt(record);
  const tools = buildE1ToolSchemas(catalog);

  let result: ToolUseResult;
  try {
    result = await backend.callWithTools({
      systemPrompt: prompt.systemPrompt,
      userMessage: prompt.userMessage,
      tools,
    });
  } catch (err) {
    const meta = backend.lastCallMetadata();
    return {
      run: runIndex + 1,
      meta: {
        runId,
        backend: backend.name,
        modelId: backend.model,
        promptTokens: meta.promptTokens,
        completionTokens: meta.completionTokens,
        costUsd: meta.costEstimate,
        latencyMs: meta.latencyMs,
        parseOk: false,
        parseError: String(err),
      },
      toolCalls: [],
      evaluation: null,
      passed: false,
    };
  }

  const callMeta = backend.lastCallMetadata();
  const meta: RunMeta = {
    runId,
    backend: backend.name,
    modelId: backend.model,
    promptTokens: callMeta.promptTokens,
    completionTokens: callMeta.completionTokens,
    costUsd: callMeta.costEstimate,
    latencyMs: callMeta.latencyMs,
    parseOk: true,
    parseError: null,
  };

  const toolCalls = parseE1Response(result);

  if (toolCalls.length === 0) {
    return {
      run: runIndex + 1,
      meta: { ...meta, parseOk: false, parseError: "no tool calls in response" },
      toolCalls: [],
      evaluation: null,
      passed: false,
    };
  }

  // Reconstruct a TargetTrace from the model's tool calls for evaluation
  const modelTrace: TargetTrace = {
    task_family: record.target_trace.task_family,
    objective: record.target_trace.objective,
    session: toolCalls.map((tc, i) => ({
      turn: i + 1,
      role: "assistant" as const,
      content: `Tool call ${i + 1}`,
      tool_calls: [{ tool: tc.tool, arguments: tc.arguments }],
    })),
  };

  const evaluation = evaluateGoldTrace(
    { id: record.id, target_trace: modelTrace },
    catalog,
  );

  return {
    run: runIndex + 1,
    meta,
    toolCalls,
    evaluation,
    passed: evaluation.overallScore === 1,
  };
}

/** Check E1 majority-pass for a set of runs. */
export function checkE1Pass(runs: E1RunResult[]): boolean {
  return majorityPass(runs.map((r) => ({ score: r.passed ? 1 : 0 })));
}

// ─── E2: Phrase continuation prompt builder ───────────────────────────────────

const E2_SYSTEM_TEXT =
  "You are predicting musical phrase continuations for piano music. " +
  "Given the REMI token sequence and metadata for a prompt phrase, " +
  "output the continuation phrase as REMI tokens and ABC notation. " +
  "The continuation should match the musical style, key, tempo, and " +
  "rhythmic patterns established in the prompt. " +
  "Output ONLY via the predict_continuation tool — no prose.";

/** JSON schema for E2 structured output (backend-agnostic). */
export const E2_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    tokens_remi: {
      type: "array",
      items: { type: "string" },
      description:
        "REMI token sequence for the continuation phrase (Bar_N, Position_N, Pitch_N, Velocity_N, Duration_N tokens)",
    },
    tokens_abc: {
      type: "string",
      description: "ABC notation string for the continuation phrase",
    },
  },
  required: ["tokens_remi", "tokens_abc"],
};

export function buildE2UserPrompt(promptRecord: PairRecord): string {
  const s = promptRecord.scope;
  const tokensRemi = (
    (promptRecord as unknown as { observation: { tokens_remi?: string[] } })
      .observation.tokens_remi ?? []
  ).join(" ");

  return (
    `Composer: ${s.song_id}\n` +
    `Phrase window: ${s.phrase_window}\n` +
    `Key: ${(s as PairRecord["scope"] & { key?: string }).key ?? "unknown"}\n` +
    `Time signature: ${s.time_signature}\n` +
    `Tempo: ${(s as PairRecord["scope"] & { tempo_bpm?: number }).tempo_bpm ?? "unknown"} BPM\n` +
    `Instrument: ${(s as PairRecord["scope"] & { instrument?: string }).instrument ?? "piano"}\n\n` +
    `REMI tokens for this prompt phrase:\n${tokensRemi}\n\n` +
    `Predict the continuation phrase for the next ${
      (s as PairRecord["scope"] & { continuation_target_window?: [number, number] })
        .continuation_target_window
        ? (s as PairRecord["scope"] & { continuation_target_window?: [number, number] })
            .continuation_target_window![1] -
          (s as PairRecord["scope"] & { continuation_target_window?: [number, number] })
            .continuation_target_window![0] +
          1
        : 4
    } measures. Use predict_continuation to output the tokens.`
  );
}

// ─── E2 output parser ─────────────────────────────────────────────────────────

export interface E2ParsedOutput {
  tokens_remi: string[];
  tokens_abc: string;
}

export function parseE2Output(data: unknown): E2ParsedOutput | null {
  if (
    data !== null &&
    typeof data === "object" &&
    Array.isArray((data as Record<string, unknown>).tokens_remi) &&
    typeof (data as Record<string, unknown>).tokens_abc === "string"
  ) {
    return {
      tokens_remi: (data as { tokens_remi: string[] }).tokens_remi,
      tokens_abc: (data as { tokens_abc: string }).tokens_abc,
    };
  }
  return null;
}

// ─── E2 pair runner ────────────────────────────────────────────────────────────

export interface E2RunResult {
  run: number;
  meta: RunMeta;
  parsedOutput: E2ParsedOutput | null;
  pairResult: PairE2Result | null;
  grooveOA: number | null;
  passed: boolean;
}

export async function runE2ForPair(
  promptRecord: PairRecord & { observation: { tokens_remi?: string[] } },
  targetRecord: PairRecord,
  backend: LlmBackend,
  runIndex: number,
): Promise<E2RunResult> {
  const runId = `${promptRecord.id}:E2:run${runIndex + 1}`;
  const userMessage = buildE2UserPrompt(promptRecord as unknown as PairRecord);

  let rawOutput: unknown;
  try {
    rawOutput = await backend.callStructured<unknown>({
      systemPrompt: E2_SYSTEM_TEXT,
      userMessage,
      outputSchema: E2_OUTPUT_SCHEMA,
    });
  } catch (err) {
    const meta = backend.lastCallMetadata();
    return {
      run: runIndex + 1,
      meta: {
        runId,
        backend: backend.name,
        modelId: backend.model,
        promptTokens: meta.promptTokens,
        completionTokens: meta.completionTokens,
        costUsd: meta.costEstimate,
        latencyMs: meta.latencyMs,
        parseOk: false,
        parseError: String(err),
      },
      parsedOutput: null,
      pairResult: null,
      grooveOA: null,
      passed: false,
    };
  }

  const callMeta = backend.lastCallMetadata();
  const meta: RunMeta = {
    runId,
    backend: backend.name,
    modelId: backend.model,
    promptTokens: callMeta.promptTokens,
    completionTokens: callMeta.completionTokens,
    costUsd: callMeta.costEstimate,
    latencyMs: callMeta.latencyMs,
    parseOk: true,
    parseError: null,
  };

  const parsed = parseE2Output(rawOutput);
  if (!parsed) {
    return {
      run: runIndex + 1,
      meta: {
        ...meta,
        parseOk: false,
        parseError: "structured output missing tokens_remi or tokens_abc fields",
      },
      parsedOutput: null,
      pairResult: null,
      grooveOA: null,
      passed: false,
    };
  }

  const modelTimed = synthTimedEventsFromRemi(
    parsed.tokens_remi,
    targetRecord.scope.phrase_window,
    targetRecord.scope.time_signature,
  );

  const modelRecord: PairRecord = {
    id: `${promptRecord.id}:model-prediction:run${runIndex + 1}`,
    scope: {
      ...targetRecord.scope,
      window_role: "continuation_target",
      paired_prompt_record_id: promptRecord.id,
    },
    observation: {
      midi_sidecar: {
        timed_events: modelTimed,
      },
    },
  };

  const pairResult = evaluatePair({
    promptRecord: promptRecord as unknown as PairRecord,
    targetRecord: modelRecord,
  });

  const grooveSim = pairResult.metrics.grooveSimilarity_goldVsShuffled;
  const grooveOA = isNotComputable(grooveSim) ? null : (grooveSim as number);

  return {
    run: runIndex + 1,
    meta,
    parsedOutput: parsed,
    pairResult,
    grooveOA,
    passed: grooveOA !== null && grooveOA >= E2_GROOVE_THRESHOLD,
  };
}

/**
 * Synthesize minimal TimedEvent array from REMI tokens for groove scoring.
 * REMI format: Bar_N Position_P Pitch_X Velocity_V Duration_D ...
 */
function synthTimedEventsFromRemi(
  tokens: string[],
  phraseWindow: string,
  timeSignature: string,
): TimedEvent[] {
  const phraseMatch = /measures? (\d+)-(\d+)/.exec(phraseWindow);
  const startMeasure = phraseMatch ? parseInt(phraseMatch[1], 10) : 1;

  const tsMatch = /^(\d+)\/\d+$/.exec(timeSignature);
  const beatsPerBar = tsMatch ? parseInt(tsMatch[1], 10) : 4;
  const positionsPerBar = 96;

  const events: TimedEvent[] = [];
  let currentBar = 0;
  let currentPosition = 0;
  let currentVelocity = 64;
  let currentDuration = 8;

  for (const tok of tokens) {
    if (tok.startsWith("Bar_")) {
      currentBar = parseInt(tok.slice(4), 10);
      currentPosition = 0;
    } else if (tok.startsWith("Position_")) {
      currentPosition = parseInt(tok.slice(9), 10);
    } else if (tok.startsWith("Velocity_")) {
      currentVelocity = parseInt(tok.slice(9), 10);
    } else if (tok.startsWith("Duration_")) {
      currentDuration = parseInt(tok.slice(9), 10);
    } else if (tok.startsWith("Pitch_")) {
      const pitch = parseInt(tok.slice(6), 10);
      const measure = startMeasure + (currentBar - 1);
      const beat = (currentPosition / positionsPerBar) * beatsPerBar;

      events.push({
        t_seconds: 0,
        t_ticks: 0,
        dur_seconds: currentDuration * 0.125,
        dur_ticks: currentDuration * 60,
        note: pitch,
        name: `MIDI${pitch}`,
        velocity: currentVelocity,
        channel: 0,
        hand: "right",
        measure,
        beat,
      });
    }
  }

  return events;
}

// ─── E3: Annotation grounding prompt builders ──────────────────────────────────

const E3_SYSTEM_TEXT =
  "You are answering multiple-choice questions about piano music phrases. " +
  "Each question has exactly 4 options labeled A, B, C, D. " +
  "Respond with ONLY the single letter (A, B, C, or D) of your chosen answer. " +
  "No explanation, no punctuation — just the letter.";

export type E3Context = "full" | "text_only" | "random_midi";

/**
 * Build user prompt for E3 MCQ in a given context.
 * Full context: scope + MIDI + annotation + question.
 * Text-only context: annotation prose only + question.
 * Random-MIDI context: annotation + different record's REMI + question.
 */
export function buildE3UserPrompt(
  record: E3Record,
  question: MCQuestion,
  context: E3Context,
  randomMidiRecord?: E3Record,
): string {
  const at = record.annotation_target;
  const optionLabels = ["A", "B", "C", "D"] as const;
  const optionsText = question.options
    .map((opt, i) => `${optionLabels[i]}) ${opt}`)
    .join("\n");

  const questionBlock =
    `\nQuestion: ${question.questionText}\n` +
    `Options:\n${optionsText}\n\n` +
    `Answer (A/B/C/D):`;

  if (context === "text_only") {
    const prose = extractAnnotationProse(record);
    return `Annotation:\n${prose}\n` + questionBlock;
  }

  const annotationBlock = [
    at.structure ? `Structure: ${at.structure}` : null,
    at.key_moments?.length ? `Key moments: ${at.key_moments.join("; ")}` : null,
    at.teaching_goals?.length ? `Teaching goals: ${at.teaching_goals.join("; ")}` : null,
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

  if (context === "random_midi") {
    const remiSource = randomMidiRecord ?? record;
    const remiTokens = (
      remiSource as unknown as { observation: { tokens_remi?: string[] } }
    ).observation.tokens_remi?.join(" ") ?? "(no tokens)";
    return (
      `Annotation (from this phrase):\n${annotationBlock}\n\n` +
      `MIDI tokens (from a different phrase — may not match annotation):\n${remiTokens}\n` +
      questionBlock
    );
  }

  // Full context
  const remiTokens = (
    record as unknown as { observation: { tokens_remi?: string[] } }
  ).observation.tokens_remi?.join(" ") ?? "(no tokens)";

  const scopeBlock =
    `Song: ${record.scope.song_id}\n` +
    `Composer: ${record.provenance.composer}\n` +
    `Key: ${record.scope.key}\n` +
    `Time signature: ${record.scope.time_signature}\n` +
    `Phrase: ${record.scope.phrase_window}`;

  return (
    `${scopeBlock}\n\n` +
    `MIDI tokens:\n${remiTokens}\n\n` +
    `Annotation:\n${annotationBlock}\n` +
    questionBlock
  );
}

// ─── E3 output parser ─────────────────────────────────────────────────────────

/** Parse a single-letter answer (A/B/C/D) from model plain text response. */
export function parseE3Response(text: string): number | null {
  const match = /\b([A-D])\b/.exec(text.trim());
  if (match) {
    return ["A", "B", "C", "D"].indexOf(match[1]);
  }
  return null;
}

// ─── E3 single question runner ─────────────────────────────────────────────────

export interface E3QuestionRunResult {
  run: number;
  context: E3Context;
  questionType: QuestionType;
  meta: RunMeta;
  selectedOptionIndex: number | null;
  correct: boolean;
  score: number;
}

export async function runE3Question(
  record: E3Record,
  question: MCQuestion,
  context: E3Context,
  backend: LlmBackend,
  runIndex: number,
  randomMidiRecord: E3Record,
): Promise<E3QuestionRunResult> {
  const runId = `${record.id}:E3:${context}:${question.questionType}:run${runIndex + 1}`;
  const userMessage = buildE3UserPrompt(record, question, context, randomMidiRecord);

  let responseText: string;
  try {
    responseText = await backend.callPlain({
      systemPrompt: E3_SYSTEM_TEXT,
      userMessage,
      maxTokens: 16, // Single letter only
    });
  } catch (err) {
    const meta = backend.lastCallMetadata();
    return {
      run: runIndex + 1,
      context,
      questionType: question.questionType,
      meta: {
        runId,
        backend: backend.name,
        modelId: backend.model,
        promptTokens: meta.promptTokens,
        completionTokens: meta.completionTokens,
        costUsd: meta.costEstimate,
        latencyMs: meta.latencyMs,
        parseOk: false,
        parseError: String(err),
      },
      selectedOptionIndex: null,
      correct: false,
      score: 0,
    };
  }

  const callMeta = backend.lastCallMetadata();
  const meta: RunMeta = {
    runId,
    backend: backend.name,
    modelId: backend.model,
    promptTokens: callMeta.promptTokens,
    completionTokens: callMeta.completionTokens,
    costUsd: callMeta.costEstimate,
    latencyMs: callMeta.latencyMs,
    parseOk: true,
    parseError: null,
  };

  const selectedIndex = parseE3Response(responseText);
  if (selectedIndex === null) {
    return {
      run: runIndex + 1,
      context,
      questionType: question.questionType,
      meta: { ...meta, parseOk: false, parseError: "no A/B/C/D found in response" },
      selectedOptionIndex: null,
      correct: false,
      score: 0,
    };
  }

  const correct = selectedIndex === question.correctOptionIndex;

  return {
    run: runIndex + 1,
    context,
    questionType: question.questionType,
    meta,
    selectedOptionIndex: selectedIndex,
    correct,
    score: correct ? 1 : 0,
  };
}

// ─── E3 record runner (all questions × 3 contexts × n runs) ──────────────────

export interface E3RecordResult {
  recordId: string;
  questions: Array<{
    questionType: QuestionType;
    questionText: string;
    correctOptionIndex: number;
    options: [string, string, string, string];
    runs: {
      full: E3QuestionRunResult[];
      text_only: E3QuestionRunResult[];
      random_midi: E3QuestionRunResult[];
    };
    majorityScore: {
      full: number;
      text_only: number;
      random_midi: number;
    };
  }>;
  aggregate: {
    full: number | null;
    text_only: number | null;
    random_midi: number | null;
  };
  randomMidiPartnerId: string;
  totalCostUsd: number;
}

export async function runE3ForRecord(
  record: E3Record,
  allRecords: E3Record[],
  backend: LlmBackend,
  n: number,
): Promise<E3RecordResult> {
  const questionSet = generateQuestionSet(record);
  const randomMidiRecord = selectRandomMidiPartner(record, allRecords);

  const loadBearingTypeValues = new Set(LOAD_BEARING_TYPES as readonly QuestionType[]);
  const typeOrder: QuestionType[] = [
    QUESTION_TYPES.PITCH_CLASS_COUNT,
    QUESTION_TYPES.HAND_REGISTER,
    QUESTION_TYPES.RHYTHM_ONSET,
    QUESTION_TYPES.ANNOTATION_GROUNDING,
  ];

  const questionResults: E3RecordResult["questions"] = [];
  let totalCostUsd = 0;

  for (const qType of typeOrder) {
    const idx = questionSet.questionTypeIndex.get(qType)!;
    const q = questionSet.questions[idx];

    if (isNotComputableE3(q)) {
      continue;
    }

    const mcq = q as MCQuestion;
    const contexts: E3Context[] = ["full", "text_only", "random_midi"];
    const allRuns: Record<E3Context, E3QuestionRunResult[]> = {
      full: [],
      text_only: [],
      random_midi: [],
    };

    for (const ctx of contexts) {
      for (let r = 0; r < n; r++) {
        const result = await runE3Question(
          record,
          mcq,
          ctx,
          backend,
          r,
          randomMidiRecord,
        );
        allRuns[ctx].push(result);
        totalCostUsd += result.meta.costUsd;
      }
    }

    const majorityScore = {
      full: majorityPass(allRuns.full) ? 1 : 0,
      text_only: majorityPass(allRuns.text_only) ? 1 : 0,
      random_midi: majorityPass(allRuns.random_midi) ? 1 : 0,
    };

    questionResults.push({
      questionType: qType,
      questionText: mcq.questionText,
      correctOptionIndex: mcq.correctOptionIndex,
      options: mcq.options,
      runs: allRuns,
      majorityScore,
    });
  }

  const lbResults = questionResults.filter((q) =>
    loadBearingTypeValues.has(q.questionType),
  );

  function aggregateContext(ctx: "full" | "text_only" | "random_midi"): number | null {
    if (lbResults.length === 0) return null;
    const sum = lbResults.reduce((s, q) => s + q.majorityScore[ctx], 0);
    return sum / lbResults.length;
  }

  const aggregate = {
    full: aggregateContext("full"),
    text_only: aggregateContext("text_only"),
    random_midi: aggregateContext("random_midi"),
  };

  return {
    recordId: record.id,
    questions: questionResults,
    aggregate,
    randomMidiPartnerId: randomMidiRecord.id,
    totalCostUsd,
  };
}

// ─── E3 margin check ──────────────────────────────────────────────────────────

/** Check E3 margin: full must beat text_only and random_midi by ≥ E3_MARGIN_THRESHOLD. */
export function checkE3Margins(result: E3RecordResult): {
  fullVsTextOnly: boolean;
  fullVsRandomMidi: boolean;
} {
  const { full, text_only, random_midi } = result.aggregate;
  return {
    fullVsTextOnly:
      full !== null && text_only !== null
        ? full - text_only >= E3_MARGIN_THRESHOLD
        : false,
    fullVsRandomMidi:
      full !== null && random_midi !== null
        ? full - random_midi >= E3_MARGIN_THRESHOLD
        : false,
  };
}
