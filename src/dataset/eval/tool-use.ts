// ─── jam-actions-v0 E1 Tool-Use Correctness Eval ─────────────────────────────
//
// Evaluates gold traces from pilot records against synthesized negative
// controls. No LLM calls — this is gold-trace + negative-control validation
// only. Proves the harness has teeth before any model inference begins.
//
// Eval metrics (from synthesis Section 4, E1):
//   - AST exact-match on tool name (string equality against tool-schemas.json)
//   - Argument-schema validity (ajv against tool's JSON Schema)
//   - Argument-value match on closed-vocabulary args (enum validation via ajv)
//   - Trajectory order (tool calls appear in canonical gold-trace order)
//   - Multi-turn dependency (observation tool precedes action tool on same scope)
//
// Uses src/dataset/trace-validator.ts for all ajv compilation — do not
// reinvent.
//
// Required negative controls (all must score 0 — correctly rejected):
//   1. dummy_tool_name         — tool: "view_piano_roll_xyz"
//   2. snake_case_args         — songId→song_id etc.
//   3. unsupported_arg_dynamic — arguments: { ..., dynamic: "p" }
//   4. unsupported_arg_articulation — arguments: { ..., articulation: "legato" }
//   5. unsupported_arg_hand_both — arguments: { ..., hand: "both" }
//   6. missing_required_arg    — omit songId from view_piano_roll
//   7. wrong_arg_type          — startMeasure: "1" (string, not integer)
//   8. trajectory_order_swap   — play_song before view_piano_roll
// ─────────────────────────────────────────────────────────────────────────────

import {
  loadToolSchemaCatalog,
  validateTrace,
  type ToolSchemaCatalog,
} from "../trace-validator.js";
import type { TargetTrace } from "../schema.js";

// ─── Result types ────────────────────────────────────────────────────────────

export interface ToolCallEvaluation {
  turn: number;
  tool: string;
  toolNameValid: boolean;
  argsSchemaValid: boolean;
  failureMode: string | null;
  ajvErrors?: unknown[];
}

export interface RecordEvaluation {
  recordId: string;
  toolCalls: ToolCallEvaluation[];
  trajectoryValid: boolean;
  trajectoryFailureReason: string | null;
  multiTurnDependencyValid: boolean;
  multiTurnDependencyFailureReason: string | null;
  overallScore: number; // 0 or 1
}

export interface ControlEvaluation {
  controlName: string;
  description: string;
  detected: boolean;
  detectedFailureMode: string | null;
  expectedFailureMode: string;
  score: number; // 0 if correctly rejected (GOOD), 1 if validator missed it (BAD)
}

export interface EvalRun {
  evalDate: string;
  toolSchemasDerivedAt: string;
  records: RecordEvaluation[];
  controls: ControlEvaluation[];
  summary: {
    goldPassRate: number;        // avg over records — should be 1.0
    controlFailureRate: number;  // proportion of controls correctly rejected — should be 1.0
    dummyBaselineScore: number;  // MUST be 0
  };
}

// ─── Failure-mode constants ───────────────────────────────────────────────────

/** Failure modes as closed string literals for downstream tooling. */
export const FAILURE_MODES = {
  TOOL_NAME_INVALID: "tool_name_invalid",
  ARGS_SCHEMA_INVALID: "args_schema_invalid",
  TRAJECTORY_ORDER_INVALID: "trajectory_order_invalid",
} as const;

export type FailureMode = (typeof FAILURE_MODES)[keyof typeof FAILURE_MODES];

// ─── Observation tools (define the canonical observation/action taxonomy) ─────

/**
 * Tools that observe state — they are required to precede action tools when
 * operating on the same scope (songId/id + measure range). Extend this list
 * as more observation tools enter the MCP surface.
 */
const OBSERVATION_TOOLS = new Set(["view_piano_roll"]);

/**
 * Tools that act on state — they must be preceded by an observation tool on
 * the same scope. Extend this list as more action tools enter the MCP surface.
 */
const ACTION_TOOLS = new Set(["play_song"]);

// ─── Scope key helpers ────────────────────────────────────────────────────────

/**
 * Extract a normalized scope key from a tool call's arguments.
 * For observation tools: {songId, startMeasure, endMeasure}
 * For action tools: {id, startMeasure, endMeasure}
 * Returns null if scope cannot be determined.
 */
function getScopeKey(
  tool: string,
  args: Record<string, unknown>,
): string | null {
  let songKey: string | undefined;
  if (OBSERVATION_TOOLS.has(tool)) {
    songKey = args.songId as string | undefined;
  } else if (ACTION_TOOLS.has(tool)) {
    songKey = args.id as string | undefined;
  }
  if (!songKey) return null;
  const start = args.startMeasure ?? "*";
  const end = args.endMeasure ?? "*";
  return `${songKey}:${start}-${end}`;
}

// ─── Individual tool-call evaluation ─────────────────────────────────────────

function evaluateToolCall(
  turnNumber: number,
  tool: string,
  args: Record<string, unknown>,
  catalog: ToolSchemaCatalog,
): ToolCallEvaluation {
  // AST exact-match on tool name
  const knownTools = new Set(catalog.tools.map((t) => t.name));
  const toolNameValid = knownTools.has(tool);

  if (!toolNameValid) {
    return {
      turn: turnNumber,
      tool,
      toolNameValid: false,
      argsSchemaValid: false,
      failureMode: FAILURE_MODES.TOOL_NAME_INVALID,
    };
  }

  // Argument-schema validity via trace-validator's compilation pipeline.
  // We synthesize a minimal trace for just this one tool call so we can
  // reuse the existing validateTrace infrastructure (which handles
  // additionalProperties: false hardening internally).
  const singleCallTrace: TargetTrace = {
    task_family: "eval-probe",
    objective: "single-call probe",
    session: [
      {
        turn: turnNumber,
        role: "assistant",
        content: "eval probe",
        tool_calls: [{ tool, arguments: args }],
      },
    ],
  };

  const report = validateTrace(singleCallTrace, catalog);
  const mismatch = report.mismatches.find(
    (m) => m.turn === turnNumber && m.tool === tool,
  );

  const argsSchemaValid = mismatch === undefined;
  const failureMode = argsSchemaValid ? null : FAILURE_MODES.ARGS_SCHEMA_INVALID;

  return {
    turn: turnNumber,
    tool,
    toolNameValid: true,
    argsSchemaValid,
    failureMode,
    ajvErrors: mismatch?.ajv_errors,
  };
}

// ─── Trajectory order check ───────────────────────────────────────────────────

/**
 * Verify that tool calls in the trace appear in the same order as they do in
 * the gold trace (as defined by the record itself). For the three gold records
 * the canonical order is always: view_piano_roll → play_song.
 *
 * For negative controls we check the observation-before-action rule:
 * any action tool call must come AFTER an observation tool call in the
 * assistant-turn sequence.
 */
function checkTrajectoryOrder(trace: TargetTrace): {
  valid: boolean;
  reason: string | null;
} {
  // Collect tool calls in order of their turns (assistant turns only).
  const toolCallsInOrder: Array<{ turn: number; tool: string }> = [];
  for (const turn of trace.session) {
    if (turn.role === "assistant" && turn.tool_calls) {
      for (const call of turn.tool_calls) {
        toolCallsInOrder.push({ turn: turn.turn, tool: call.tool });
      }
    }
  }

  // Check observation-before-action on same scope.
  // We track which scopes have been observed.
  const observedScopes = new Set<string>();
  for (const turn of trace.session) {
    if (turn.role === "assistant" && turn.tool_calls) {
      for (const call of turn.tool_calls) {
        const args = call.arguments as Record<string, unknown>;
        if (OBSERVATION_TOOLS.has(call.tool)) {
          const key = getScopeKey(call.tool, args);
          if (key) observedScopes.add(key);
        } else if (ACTION_TOOLS.has(call.tool)) {
          const key = getScopeKey(call.tool, args);
          if (key && !observedScopes.has(key)) {
            // Action tool fired without prior observation on the same scope.
            // Find which observation tool would have been needed.
            const observationTool = [...OBSERVATION_TOOLS][0]; // view_piano_roll
            return {
              valid: false,
              reason: `Action tool "${call.tool}" on scope "${key}" appeared before observation tool "${observationTool}" on the same scope. Expected observation before action.`,
            };
          }
        }
      }
    }
  }

  return { valid: true, reason: null };
}

// ─── Multi-turn dependency check ──────────────────────────────────────────────

/**
 * Verify multi-turn dependency: an observation tool (e.g. view_piano_roll)
 * must appear BEFORE an action tool (e.g. play_song) in the session when they
 * operate on the same scope.
 *
 * In Slice 4, this is the same check as trajectory order for the patterns we
 * have. Separated here for clarity and to allow future enrichment.
 */
function checkMultiTurnDependency(trace: TargetTrace): {
  valid: boolean;
  reason: string | null;
} {
  // For the current gold trace pattern this is equivalent to the trajectory
  // order check. We run it independently so both fields are populated in the
  // result, and so future slices can add more complex dependency rules here
  // without touching the trajectory check.
  return checkTrajectoryOrder(trace);
}

// ─── Gold trace evaluation ────────────────────────────────────────────────────

export function evaluateGoldTrace(
  record: { id: string; target_trace: TargetTrace },
  toolSchemas: ToolSchemaCatalog,
): RecordEvaluation {
  const toolCallEvals: ToolCallEvaluation[] = [];

  for (const turn of record.target_trace.session) {
    if (turn.role === "assistant" && turn.tool_calls) {
      for (const call of turn.tool_calls) {
        const result = evaluateToolCall(
          turn.turn,
          call.tool,
          call.arguments as Record<string, unknown>,
          toolSchemas,
        );
        toolCallEvals.push(result);
      }
    }
  }

  const trajectoryResult = checkTrajectoryOrder(record.target_trace);
  const dependencyResult = checkMultiTurnDependency(record.target_trace);

  // Overall score: 1.0 only if all tool calls pass AND trajectory AND
  // multi-turn dependency all pass.
  const allToolCallsPass =
    toolCallEvals.length > 0 &&
    toolCallEvals.every((tc) => tc.toolNameValid && tc.argsSchemaValid);
  const overallScore =
    allToolCallsPass && trajectoryResult.valid && dependencyResult.valid
      ? 1
      : 0;

  return {
    recordId: record.id,
    toolCalls: toolCallEvals,
    trajectoryValid: trajectoryResult.valid,
    trajectoryFailureReason: trajectoryResult.reason,
    multiTurnDependencyValid: dependencyResult.valid,
    multiTurnDependencyFailureReason: dependencyResult.reason,
    overallScore,
  };
}

// ─── Negative control definitions ────────────────────────────────────────────

/**
 * A minimal base tool call for use in negative controls.
 * Uses view_piano_roll as the observation tool — a real tool with well-known args.
 */
function makeBaseObservationCall(overrides: Record<string, unknown> = {}) {
  return {
    tool: "view_piano_roll",
    arguments: {
      songId: "fur-elise",
      startMeasure: 1,
      endMeasure: 8,
      ...overrides,
    },
  };
}

/**
 * A minimal play_song call for trajectory-order controls.
 */
function makeBaseActionCall(overrides: Record<string, unknown> = {}) {
  return {
    tool: "play_song",
    arguments: {
      id: "fur-elise",
      startMeasure: 1,
      endMeasure: 8,
      mode: "loop",
      ...overrides,
    },
  };
}

/**
 * Build a TargetTrace containing exactly one assistant tool call.
 */
function makeSingleCallTrace(
  tool: string,
  args: Record<string, unknown>,
): TargetTrace {
  return {
    task_family: "negative-control-probe",
    objective: "negative control probe",
    session: [
      {
        turn: 1,
        role: "assistant",
        content: "probe",
        tool_calls: [{ tool, arguments: args }],
      },
    ],
  };
}

/**
 * Build a TargetTrace with action before observation (trajectory order swap).
 */
function makeOrderSwappedTrace(): TargetTrace {
  return {
    task_family: "negative-control-probe",
    objective: "trajectory order swap negative control",
    session: [
      {
        turn: 1,
        role: "assistant",
        content: "Playing before observing (wrong order).",
        // play_song BEFORE view_piano_roll — violates observation-before-action
        tool_calls: [
          {
            tool: "play_song",
            arguments: {
              id: "fur-elise",
              startMeasure: 1,
              endMeasure: 8,
              mode: "loop",
            },
          },
        ],
      },
      {
        turn: 2,
        role: "tool",
        tool: "play_song",
        content: { playback_started: true },
      },
      {
        turn: 3,
        role: "assistant",
        content: "Now viewing the piano roll (too late).",
        tool_calls: [
          {
            tool: "view_piano_roll",
            arguments: {
              songId: "fur-elise",
              startMeasure: 1,
              endMeasure: 8,
            },
          },
        ],
      },
    ],
  };
}

interface NegativeControlSpec {
  name: string;
  description: string;
  expectedFailureMode: string;
  trace: TargetTrace;
}

function buildNegativeControlSpecs(): NegativeControlSpec[] {
  return [
    // 1. dummy_tool_name — tool name not in catalog
    {
      name: "dummy_tool_name",
      description:
        'Tool name "view_piano_roll_xyz" does not exist in the MCP catalog. ' +
        "Dataset-grounding kill switch: a model that learned to call nonexistent tools " +
        "is not grounded in the real instrument surface.",
      expectedFailureMode: FAILURE_MODES.TOOL_NAME_INVALID,
      trace: makeSingleCallTrace("view_piano_roll_xyz", {
        songId: "fur-elise",
        startMeasure: 1,
        endMeasure: 8,
      }),
    },

    // 2. snake_case_args — wrong argument naming convention
    {
      name: "snake_case_args",
      description:
        "Arguments use snake_case (song_id, start_measure, end_measure) instead of " +
        "camelCase (songId, startMeasure, endMeasure). Schema requires camelCase. " +
        "Wrong casing must fail even if value types are correct.",
      expectedFailureMode: FAILURE_MODES.ARGS_SCHEMA_INVALID,
      trace: makeSingleCallTrace("view_piano_roll", {
        song_id: "fur-elise",   // wrong: should be songId
        start_measure: 1,       // wrong: should be startMeasure
        end_measure: 8,         // wrong: should be endMeasure
      }),
    },

    // 3. unsupported_arg_dynamic — additionalProperties: false rejects unknown arg
    {
      name: "unsupported_arg_dynamic",
      description:
        'Argument "dynamic" (value "p") is not in view_piano_roll\'s schema. ' +
        "The tool schema sets additionalProperties: false (via hardening in trace-validator). " +
        "This was a desired_future_capability in the synthesis — not a live arg.",
      expectedFailureMode: FAILURE_MODES.ARGS_SCHEMA_INVALID,
      trace: makeSingleCallTrace("view_piano_roll", {
        songId: "fur-elise",
        startMeasure: 1,
        endMeasure: 8,
        dynamic: "p", // unsupported arg
      }),
    },

    // 4. unsupported_arg_articulation
    {
      name: "unsupported_arg_articulation",
      description:
        'Argument "articulation" (value "legato") is not in view_piano_roll\'s schema. ' +
        "This was a desired_future_capability — not a live arg.",
      expectedFailureMode: FAILURE_MODES.ARGS_SCHEMA_INVALID,
      trace: makeSingleCallTrace("view_piano_roll", {
        songId: "fur-elise",
        startMeasure: 1,
        endMeasure: 8,
        articulation: "legato", // unsupported arg
      }),
    },

    // 5. unsupported_arg_hand_both — hand: "both" not an enum value
    {
      name: "unsupported_arg_hand_both",
      description:
        'Argument "hand" with value "both" is not valid for any tool in the surface. ' +
        "mute_hand accepts enum {left, right} — not both. This tests enum boundary enforcement.",
      expectedFailureMode: FAILURE_MODES.ARGS_SCHEMA_INVALID,
      trace: makeSingleCallTrace("mute_hand", {
        hand: "both", // invalid enum value — only left/right allowed
        muted: true,
      }),
    },

    // 6. missing_required_arg — omit required songId from view_piano_roll
    {
      name: "missing_required_arg",
      description:
        "Required argument songId is omitted from view_piano_roll call. " +
        "Schema declares songId as required — missing it must fail.",
      expectedFailureMode: FAILURE_MODES.ARGS_SCHEMA_INVALID,
      trace: makeSingleCallTrace("view_piano_roll", {
        // songId intentionally omitted
        startMeasure: 1,
        endMeasure: 8,
      }),
    },

    // 7. wrong_arg_type — startMeasure as string instead of integer
    {
      name: "wrong_arg_type",
      description:
        'Argument startMeasure is "1" (string) instead of 1 (integer). ' +
        "Schema type is integer — type coercion must NOT be accepted.",
      expectedFailureMode: FAILURE_MODES.ARGS_SCHEMA_INVALID,
      trace: makeSingleCallTrace("view_piano_roll", {
        songId: "fur-elise",
        startMeasure: "1", // string, not integer
        endMeasure: 8,
      }),
    },

    // 8. trajectory_order_swap — action before observation
    {
      name: "trajectory_order_swap",
      description:
        "play_song is called BEFORE view_piano_roll on the same scope (fur-elise, mm. 1-8). " +
        "Canonical order requires observation before action. Swapping violates the " +
        "multi-turn dependency rule.",
      expectedFailureMode: FAILURE_MODES.TRAJECTORY_ORDER_INVALID,
      trace: makeOrderSwappedTrace(),
    },
  ];
}

// ─── Negative control evaluation ──────────────────────────────────────────────

/**
 * Evaluate a single negative control trace. Returns detected=true if the
 * harness correctly rejected it (score=0), or detected=false if the harness
 * missed the error (score=1, which is BAD).
 */
function evaluateControl(
  spec: NegativeControlSpec,
  toolSchemas: ToolSchemaCatalog,
): ControlEvaluation {
  // For trajectory-order controls we check trajectory order first.
  if (spec.expectedFailureMode === FAILURE_MODES.TRAJECTORY_ORDER_INVALID) {
    const { valid, reason } = checkTrajectoryOrder(spec.trace);
    if (!valid) {
      return {
        controlName: spec.name,
        description: spec.description,
        detected: true,
        detectedFailureMode: FAILURE_MODES.TRAJECTORY_ORDER_INVALID,
        expectedFailureMode: spec.expectedFailureMode,
        score: 0, // correctly rejected
      };
    }
    // Trajectory check passed when it shouldn't have — harness missed it.
    return {
      controlName: spec.name,
      description: spec.description,
      detected: false,
      detectedFailureMode: null,
      expectedFailureMode: spec.expectedFailureMode,
      score: 1, // BAD — missed the error
    };
  }

  // For tool-name and args-schema controls, evaluate all tool calls.
  for (const turn of spec.trace.session) {
    if (turn.role === "assistant" && turn.tool_calls) {
      for (const call of turn.tool_calls) {
        const result = evaluateToolCall(
          turn.turn,
          call.tool,
          call.arguments as Record<string, unknown>,
          toolSchemas,
        );
        if (result.failureMode !== null) {
          return {
            controlName: spec.name,
            description: spec.description,
            detected: true,
            detectedFailureMode: result.failureMode,
            expectedFailureMode: spec.expectedFailureMode,
            score: 0, // correctly rejected
          };
        }
      }
    }
  }

  // No failure detected — harness missed it.
  return {
    controlName: spec.name,
    description: spec.description,
    detected: false,
    detectedFailureMode: null,
    expectedFailureMode: spec.expectedFailureMode,
    score: 1, // BAD — missed the error
  };
}

export function evaluateNegativeControls(
  toolSchemas: ToolSchemaCatalog,
): ControlEvaluation[] {
  const specs = buildNegativeControlSpecs();
  return specs.map((spec) => evaluateControl(spec, toolSchemas));
}

// ─── Full eval run ────────────────────────────────────────────────────────────

export function runFullEval(
  records: Array<{ id: string; target_trace: TargetTrace }>,
  toolSchemas: ToolSchemaCatalog,
): EvalRun {
  const recordEvals = records.map((r) => evaluateGoldTrace(r, toolSchemas));
  const controlEvals = evaluateNegativeControls(toolSchemas);

  const goldPassRate =
    recordEvals.length === 0
      ? 0
      : recordEvals.reduce((sum, r) => sum + r.overallScore, 0) /
        recordEvals.length;

  // controlFailureRate = proportion of controls that were correctly rejected
  const controlFailureRate =
    controlEvals.length === 0
      ? 0
      : controlEvals.filter((c) => c.score === 0).length / controlEvals.length;

  // dummy baseline = score of the dummy_tool_name control (must be 0)
  const dummyControl = controlEvals.find((c) => c.controlName === "dummy_tool_name");
  const dummyBaselineScore = dummyControl?.score ?? -1; // -1 signals control not found

  return {
    evalDate: new Date().toISOString(),
    toolSchemasDerivedAt: toolSchemas.derived_at,
    records: recordEvals,
    controls: controlEvals,
    summary: {
      goldPassRate,
      controlFailureRate,
      dummyBaselineScore,
    },
  };
}

// ─── Default catalog loader re-export ────────────────────────────────────────
// Convenience re-export so CLI runner doesn't need to import trace-validator.

export { loadToolSchemaCatalog };
