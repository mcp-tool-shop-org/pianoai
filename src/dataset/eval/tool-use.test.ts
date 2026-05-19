// ─── tool-use.test.ts ─────────────────────────────────────────────────────────
//
// E1 Tool-Use Correctness Eval harness tests.
//
// Tests each metric in isolation, each negative control, and a regression
// that all 3 pilot records score 1.0 on the gold eval.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateGoldTrace,
  evaluateNegativeControls,
  runFullEval,
  FAILURE_MODES,
  loadToolSchemaCatalog,
  type RecordEvaluation,
  type ControlEvaluation,
} from "./tool-use.js";
import type { ToolSchemaCatalog } from "../trace-validator.js";
import type { TargetTrace } from "../schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Test fixtures ────────────────────────────────────────────────────────────

// Paths (up two levels from src/dataset/eval to repo root)
const REPO_ROOT = join(__dirname, "..", "..", "..");
const RECORDS_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0", "records");

let catalog: ToolSchemaCatalog;
let pilotRecords: Array<{ id: string; target_trace: TargetTrace }>;

beforeAll(() => {
  catalog = loadToolSchemaCatalog();

  const files = readdirSync(RECORDS_DIR).filter((f) => f.endsWith(".json"));
  pilotRecords = files.map((f) => {
    const raw = JSON.parse(readFileSync(join(RECORDS_DIR, f), "utf8"));
    return { id: raw.id as string, target_trace: raw.target_trace as TargetTrace };
  });
});

// ─── Gold trace regression — all 3 pilot records must score 1.0 ──────────────

describe("gold trace regression — all pilot records score 1.0", () => {
  it("loads at least 3 pilot records", () => {
    expect(pilotRecords.length).toBeGreaterThanOrEqual(3);
  });

  it("fur-elise record scores 1.0", () => {
    const furElise = pilotRecords.find((r) =>
      r.id.startsWith("fur-elise"),
    );
    expect(furElise).toBeDefined();
    const result = evaluateGoldTrace(furElise!, catalog);
    expect(result.overallScore).toBe(1);
    expect(result.trajectoryValid).toBe(true);
    expect(result.multiTurnDependencyValid).toBe(true);
    expect(result.toolCalls.every((tc) => tc.toolNameValid)).toBe(true);
    expect(result.toolCalls.every((tc) => tc.argsSchemaValid)).toBe(true);
  });

  it("bach-prelude record scores 1.0", () => {
    const bach = pilotRecords.find((r) =>
      r.id.startsWith("bach-prelude"),
    );
    expect(bach).toBeDefined();
    const result = evaluateGoldTrace(bach!, catalog);
    expect(result.overallScore).toBe(1);
    expect(result.trajectoryValid).toBe(true);
    expect(result.multiTurnDependencyValid).toBe(true);
    expect(result.toolCalls.every((tc) => tc.toolNameValid)).toBe(true);
    expect(result.toolCalls.every((tc) => tc.argsSchemaValid)).toBe(true);
  });

  it("mozart-k545 record scores 1.0", () => {
    const mozart = pilotRecords.find((r) =>
      r.id.startsWith("mozart"),
    );
    expect(mozart).toBeDefined();
    const result = evaluateGoldTrace(mozart!, catalog);
    expect(result.overallScore).toBe(1);
    expect(result.trajectoryValid).toBe(true);
    expect(result.multiTurnDependencyValid).toBe(true);
    expect(result.toolCalls.every((tc) => tc.toolNameValid)).toBe(true);
    expect(result.toolCalls.every((tc) => tc.argsSchemaValid)).toBe(true);
  });

  it(
    "all pilot records individually score 1.0",
    () => {
      for (const record of pilotRecords) {
        const result = evaluateGoldTrace(record, catalog);
        expect(result.overallScore, `record ${record.id}`).toBe(1);
      }
    },
    30000,
  );
});

// ─── Tool name metric (AST exact-match) ──────────────────────────────────────

describe("metric: tool name exact-match", () => {
  it("valid tool name view_piano_roll scores toolNameValid=true", () => {
    const trace: TargetTrace = {
      task_family: "test",
      objective: "test",
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "test",
          tool_calls: [
            { tool: "view_piano_roll", arguments: { songId: "fur-elise" } },
          ],
        },
      ],
    };
    const result = evaluateGoldTrace({ id: "test", target_trace: trace }, catalog);
    expect(result.toolCalls[0].toolNameValid).toBe(true);
    expect(result.toolCalls[0].failureMode).toBeNull();
  });

  it("invalid tool name scores toolNameValid=false with tool_name_invalid", () => {
    const trace: TargetTrace = {
      task_family: "test",
      objective: "test",
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "test",
          tool_calls: [
            { tool: "view_piano_roll_xyz", arguments: { songId: "fur-elise" } },
          ],
        },
      ],
    };
    const result = evaluateGoldTrace({ id: "test", target_trace: trace }, catalog);
    expect(result.toolCalls[0].toolNameValid).toBe(false);
    expect(result.toolCalls[0].failureMode).toBe(FAILURE_MODES.TOOL_NAME_INVALID);
    expect(result.overallScore).toBe(0);
  });

  it("play_song is a valid tool name", () => {
    const trace: TargetTrace = {
      task_family: "test",
      objective: "test",
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "test",
          tool_calls: [
            {
              tool: "play_song",
              arguments: { id: "fur-elise", startMeasure: 1, endMeasure: 8, mode: "loop" },
            },
          ],
        },
      ],
    };
    const result = evaluateGoldTrace({ id: "test", target_trace: trace }, catalog);
    expect(result.toolCalls[0].toolNameValid).toBe(true);
  });
});

// ─── Argument schema validity ─────────────────────────────────────────────────

describe("metric: argument schema validity", () => {
  it("valid view_piano_roll args pass", () => {
    const trace: TargetTrace = {
      task_family: "test",
      objective: "test",
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "test",
          tool_calls: [
            {
              tool: "view_piano_roll",
              arguments: { songId: "fur-elise", startMeasure: 1, endMeasure: 8 },
            },
          ],
        },
      ],
    };
    const result = evaluateGoldTrace({ id: "test", target_trace: trace }, catalog);
    expect(result.toolCalls[0].argsSchemaValid).toBe(true);
  });

  it("snake_case args fail (song_id instead of songId)", () => {
    const trace: TargetTrace = {
      task_family: "test",
      objective: "test",
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "test",
          tool_calls: [
            {
              tool: "view_piano_roll",
              arguments: { song_id: "fur-elise", start_measure: 1, end_measure: 8 },
            },
          ],
        },
      ],
    };
    const result = evaluateGoldTrace({ id: "test", target_trace: trace }, catalog);
    expect(result.toolCalls[0].argsSchemaValid).toBe(false);
    expect(result.toolCalls[0].failureMode).toBe(FAILURE_MODES.ARGS_SCHEMA_INVALID);
  });

  it("unknown arg 'dynamic' fails (additionalProperties: false)", () => {
    const trace: TargetTrace = {
      task_family: "test",
      objective: "test",
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "test",
          tool_calls: [
            {
              tool: "view_piano_roll",
              arguments: {
                songId: "fur-elise",
                startMeasure: 1,
                endMeasure: 8,
                dynamic: "p",
              },
            },
          ],
        },
      ],
    };
    const result = evaluateGoldTrace({ id: "test", target_trace: trace }, catalog);
    expect(result.toolCalls[0].argsSchemaValid).toBe(false);
    expect(result.toolCalls[0].failureMode).toBe(FAILURE_MODES.ARGS_SCHEMA_INVALID);
  });

  it("unknown arg 'articulation' fails", () => {
    const trace: TargetTrace = {
      task_family: "test",
      objective: "test",
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "test",
          tool_calls: [
            {
              tool: "view_piano_roll",
              arguments: {
                songId: "fur-elise",
                startMeasure: 1,
                endMeasure: 8,
                articulation: "legato",
              },
            },
          ],
        },
      ],
    };
    const result = evaluateGoldTrace({ id: "test", target_trace: trace }, catalog);
    expect(result.toolCalls[0].argsSchemaValid).toBe(false);
    expect(result.toolCalls[0].failureMode).toBe(FAILURE_MODES.ARGS_SCHEMA_INVALID);
  });

  it("hand: 'both' fails for mute_hand (invalid enum value)", () => {
    const trace: TargetTrace = {
      task_family: "test",
      objective: "test",
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "test",
          tool_calls: [
            {
              tool: "mute_hand",
              arguments: { hand: "both", muted: true },
            },
          ],
        },
      ],
    };
    const result = evaluateGoldTrace({ id: "test", target_trace: trace }, catalog);
    expect(result.toolCalls[0].argsSchemaValid).toBe(false);
    expect(result.toolCalls[0].failureMode).toBe(FAILURE_MODES.ARGS_SCHEMA_INVALID);
  });

  it("missing required arg songId fails", () => {
    const trace: TargetTrace = {
      task_family: "test",
      objective: "test",
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "test",
          tool_calls: [
            {
              tool: "view_piano_roll",
              arguments: { startMeasure: 1, endMeasure: 8 }, // songId omitted
            },
          ],
        },
      ],
    };
    const result = evaluateGoldTrace({ id: "test", target_trace: trace }, catalog);
    expect(result.toolCalls[0].argsSchemaValid).toBe(false);
    expect(result.toolCalls[0].failureMode).toBe(FAILURE_MODES.ARGS_SCHEMA_INVALID);
  });

  it("wrong arg type startMeasure: '1' (string) fails", () => {
    const trace: TargetTrace = {
      task_family: "test",
      objective: "test",
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "test",
          tool_calls: [
            {
              tool: "view_piano_roll",
              arguments: {
                songId: "fur-elise",
                startMeasure: "1", // string instead of integer
                endMeasure: 8,
              },
            },
          ],
        },
      ],
    };
    const result = evaluateGoldTrace({ id: "test", target_trace: trace }, catalog);
    expect(result.toolCalls[0].argsSchemaValid).toBe(false);
    expect(result.toolCalls[0].failureMode).toBe(FAILURE_MODES.ARGS_SCHEMA_INVALID);
  });

  it("valid play_song args with mode: loop pass", () => {
    const trace: TargetTrace = {
      task_family: "test",
      objective: "test",
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "test",
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
      ],
    };
    const result = evaluateGoldTrace({ id: "test", target_trace: trace }, catalog);
    expect(result.toolCalls[0].argsSchemaValid).toBe(true);
  });
});

// ─── Trajectory order metric ──────────────────────────────────────────────────

describe("metric: trajectory order", () => {
  it("view_piano_roll before play_song passes (canonical order)", () => {
    const trace: TargetTrace = {
      task_family: "test",
      objective: "test",
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "viewing",
          tool_calls: [
            {
              tool: "view_piano_roll",
              arguments: { songId: "fur-elise", startMeasure: 1, endMeasure: 8 },
            },
          ],
        },
        {
          turn: 2,
          role: "tool",
          tool: "view_piano_roll",
          content: { svg_returned: true },
        },
        {
          turn: 3,
          role: "assistant",
          content: "playing",
          tool_calls: [
            {
              tool: "play_song",
              arguments: { id: "fur-elise", startMeasure: 1, endMeasure: 8, mode: "loop" },
            },
          ],
        },
      ],
    };
    const result = evaluateGoldTrace({ id: "test", target_trace: trace }, catalog);
    expect(result.trajectoryValid).toBe(true);
    expect(result.multiTurnDependencyValid).toBe(true);
  });

  it("play_song before view_piano_roll fails (order swap)", () => {
    const trace: TargetTrace = {
      task_family: "test",
      objective: "test",
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "playing first (wrong)",
          tool_calls: [
            {
              tool: "play_song",
              arguments: { id: "fur-elise", startMeasure: 1, endMeasure: 8, mode: "loop" },
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
          content: "viewing after (too late)",
          tool_calls: [
            {
              tool: "view_piano_roll",
              arguments: { songId: "fur-elise", startMeasure: 1, endMeasure: 8 },
            },
          ],
        },
      ],
    };
    const result = evaluateGoldTrace({ id: "test", target_trace: trace }, catalog);
    expect(result.trajectoryValid).toBe(false);
    expect(result.trajectoryFailureReason).toContain("play_song");
    expect(result.multiTurnDependencyValid).toBe(false);
    expect(result.overallScore).toBe(0);
  });
});

// ─── Multi-turn dependency metric ─────────────────────────────────────────────

describe("metric: multi-turn dependency", () => {
  it("action tool requires prior observation on same scope", () => {
    // view_piano_roll on scope A, play_song on scope A — should pass
    const trace: TargetTrace = {
      task_family: "test",
      objective: "test",
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "viewing",
          tool_calls: [
            {
              tool: "view_piano_roll",
              arguments: { songId: "fur-elise", startMeasure: 1, endMeasure: 8 },
            },
          ],
        },
        {
          turn: 2,
          role: "tool",
          tool: "view_piano_roll",
          content: { svg_returned: true },
        },
        {
          turn: 3,
          role: "assistant",
          content: "playing",
          tool_calls: [
            {
              tool: "play_song",
              arguments: { id: "fur-elise", startMeasure: 1, endMeasure: 8, mode: "loop" },
            },
          ],
        },
      ],
    };
    const result = evaluateGoldTrace({ id: "test", target_trace: trace }, catalog);
    expect(result.multiTurnDependencyValid).toBe(true);
  });

  it("play_song without preceding view_piano_roll on same scope fails dependency", () => {
    const trace: TargetTrace = {
      task_family: "test",
      objective: "test",
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "playing without observing",
          tool_calls: [
            {
              tool: "play_song",
              arguments: { id: "fur-elise", startMeasure: 1, endMeasure: 8, mode: "loop" },
            },
          ],
        },
      ],
    };
    const result = evaluateGoldTrace({ id: "test", target_trace: trace }, catalog);
    expect(result.multiTurnDependencyValid).toBe(false);
    expect(result.overallScore).toBe(0);
  });
});

// ─── Negative control evaluations (all must score 0) ─────────────────────────

describe("negative controls — all must score 0 (correctly rejected)", () => {
  let controls: ControlEvaluation[];

  beforeAll(() => {
    controls = evaluateNegativeControls(catalog);
  });

  function getControl(name: string): ControlEvaluation {
    const c = controls.find((c) => c.controlName === name);
    if (!c) throw new Error(`Control "${name}" not found in evaluateNegativeControls()`);
    return c;
  }

  it("evaluates exactly 8 negative controls", () => {
    expect(controls.length).toBe(8);
  });

  it("control 1: dummy_tool_name scores 0 (detected=true, tool_name_invalid)", () => {
    const c = getControl("dummy_tool_name");
    expect(c.score, "dummy baseline MUST be 0").toBe(0);
    expect(c.detected).toBe(true);
    expect(c.detectedFailureMode).toBe(FAILURE_MODES.TOOL_NAME_INVALID);
    expect(c.expectedFailureMode).toBe(FAILURE_MODES.TOOL_NAME_INVALID);
  });

  it("control 2: snake_case_args scores 0 (args_schema_invalid)", () => {
    const c = getControl("snake_case_args");
    expect(c.score).toBe(0);
    expect(c.detected).toBe(true);
    expect(c.detectedFailureMode).toBe(FAILURE_MODES.ARGS_SCHEMA_INVALID);
  });

  it("control 3: unsupported_arg_dynamic scores 0 (args_schema_invalid)", () => {
    const c = getControl("unsupported_arg_dynamic");
    expect(c.score).toBe(0);
    expect(c.detected).toBe(true);
    expect(c.detectedFailureMode).toBe(FAILURE_MODES.ARGS_SCHEMA_INVALID);
  });

  it("control 4: unsupported_arg_articulation scores 0 (args_schema_invalid)", () => {
    const c = getControl("unsupported_arg_articulation");
    expect(c.score).toBe(0);
    expect(c.detected).toBe(true);
    expect(c.detectedFailureMode).toBe(FAILURE_MODES.ARGS_SCHEMA_INVALID);
  });

  it("control 5: unsupported_arg_hand_both scores 0 (args_schema_invalid)", () => {
    const c = getControl("unsupported_arg_hand_both");
    expect(c.score).toBe(0);
    expect(c.detected).toBe(true);
    expect(c.detectedFailureMode).toBe(FAILURE_MODES.ARGS_SCHEMA_INVALID);
  });

  it("control 6: missing_required_arg scores 0 (args_schema_invalid)", () => {
    const c = getControl("missing_required_arg");
    expect(c.score).toBe(0);
    expect(c.detected).toBe(true);
    expect(c.detectedFailureMode).toBe(FAILURE_MODES.ARGS_SCHEMA_INVALID);
  });

  it("control 7: wrong_arg_type scores 0 (args_schema_invalid)", () => {
    const c = getControl("wrong_arg_type");
    expect(c.score).toBe(0);
    expect(c.detected).toBe(true);
    expect(c.detectedFailureMode).toBe(FAILURE_MODES.ARGS_SCHEMA_INVALID);
  });

  it("control 8: trajectory_order_swap scores 0 (trajectory_order_invalid)", () => {
    const c = getControl("trajectory_order_swap");
    expect(c.score).toBe(0);
    expect(c.detected).toBe(true);
    expect(c.detectedFailureMode).toBe(FAILURE_MODES.TRAJECTORY_ORDER_INVALID);
  });

  it("no control scores > 0 (harness has no false negatives)", () => {
    const missed = controls.filter((c) => c.score > 0);
    expect(missed, `Controls missed by harness: ${missed.map((c) => c.controlName).join(", ")}`).toHaveLength(0);
  });
});

// ─── Full eval run aggregate metrics ─────────────────────────────────────────

describe("runFullEval aggregate metrics", () => {
  let evalRun: ReturnType<typeof runFullEval>;

  beforeAll(() => {
    evalRun = runFullEval(pilotRecords, catalog);
  });

  it("goldPassRate is 1.0 (all corpus records pass)", () => {
    expect(evalRun.summary.goldPassRate).toBe(1.0);
  });

  it("controlFailureRate is 1.0 (all 8 controls correctly rejected)", () => {
    expect(evalRun.summary.controlFailureRate).toBe(1.0);
  });

  it("dummyBaselineScore is 0 (dataset-grounding kill switch confirmed)", () => {
    expect(evalRun.summary.dummyBaselineScore).toBe(0);
  });

  it("evalRun contains at least 3 record evaluations (Slice 5: 45 records)", () => {
    // Slice 3 had 3 pilot records. Slice 5 expanded to 45. The test loads all records on disk.
    expect(evalRun.records.length).toBeGreaterThanOrEqual(3);
  });

  it("evalRun contains 8 control evaluations", () => {
    expect(evalRun.controls.length).toBe(8);
  });

  it("evalRun has evalDate and toolSchemasDerivedAt populated", () => {
    expect(evalRun.evalDate).toBeTruthy();
    expect(evalRun.toolSchemasDerivedAt).toBeTruthy();
  });
});

// ─── FAILURE_MODES enum contract ──────────────────────────────────────────────

describe("FAILURE_MODES constants", () => {
  it("TOOL_NAME_INVALID is 'tool_name_invalid'", () => {
    expect(FAILURE_MODES.TOOL_NAME_INVALID).toBe("tool_name_invalid");
  });

  it("ARGS_SCHEMA_INVALID is 'args_schema_invalid'", () => {
    expect(FAILURE_MODES.ARGS_SCHEMA_INVALID).toBe("args_schema_invalid");
  });

  it("TRAJECTORY_ORDER_INVALID is 'trajectory_order_invalid'", () => {
    expect(FAILURE_MODES.TRAJECTORY_ORDER_INVALID).toBe("trajectory_order_invalid");
  });
});
