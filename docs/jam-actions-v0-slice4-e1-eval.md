# jam-actions-v0 Slice 4 — E1 Tool-Use Correctness Eval

**Eval date:** 2026-05-16
**Tool schemas derived at:** 2026-05-16T13:46:09.703Z
**Schema authority:** `src/dataset/tool-schemas.json` (41 tools from ai-jam-sessions MCP server)
**Harness:** `src/dataset/eval/tool-use.ts`

---

## Aggregate metrics

| Metric | Value | Gate |
|--------|-------|------|
| Gold pass rate (3 pilot records) | 100% | **PASS** |
| Control failure rate (8 negative controls) | 100% | **PASS** |
| Dummy-tool-name baseline score | 0 | **PASS** |

**Dummy baseline interpretation:** The `dummy_tool_name` control (`view_piano_roll_xyz`) must score 0.
A score > 0 here would mean the harness failed to reject a call to a nonexistent tool — the dataset-grounding
kill switch from synthesis Section 4. Score = 0 — PASS.

---

## Per-record results

| Record ID | Tool calls | Schema-valid calls | Trajectory | Multi-turn dep | Score |
|-----------|-----------|-------------------|------------|---------------|-------|
| `bach-prelude-c-major-bwv846:m001-004:piano:mcp-session:v1` | 2 | 2/2 | pass | pass | **1.0 PASS** |
| `fur-elise:m001-008:piano:mcp-session:v1` | 2 | 2/2 | pass | pass | **1.0 PASS** |
| `mozart-k545-mvt1:m001-004:piano:mcp-session:v1` | 2 | 2/2 | pass | pass | **1.0 PASS** |

All three pilot records scored 1.0. Each trace has exactly two tool calls:
1. `view_piano_roll` (observation) — correct `songId`/`startMeasure`/`endMeasure` camelCase args
2. `play_song` (action) — correct `id`/`startMeasure`/`endMeasure`/`mode` args

The observation-before-action dependency is satisfied in every gold trace.

---

## Per-control results

| Control name | Expected failure mode | Detected | Result |
|---|---|---|---|
| `dummy_tool_name` | `tool_name_invalid` | yes (tool_name_invalid) | **Detected (score=0) PASS** |
| `snake_case_args` | `args_schema_invalid` | yes (args_schema_invalid) | **Detected (score=0) PASS** |
| `unsupported_arg_dynamic` | `args_schema_invalid` | yes (args_schema_invalid) | **Detected (score=0) PASS** |
| `unsupported_arg_articulation` | `args_schema_invalid` | yes (args_schema_invalid) | **Detected (score=0) PASS** |
| `unsupported_arg_hand_both` | `args_schema_invalid` | yes (args_schema_invalid) | **Detected (score=0) PASS** |
| `missing_required_arg` | `args_schema_invalid` | yes (args_schema_invalid) | **Detected (score=0) PASS** |
| `wrong_arg_type` | `args_schema_invalid` | yes (args_schema_invalid) | **Detected (score=0) PASS** |
| `trajectory_order_swap` | `trajectory_order_invalid` | yes (trajectory_order_invalid) | **Detected (score=0) PASS** |

### Control descriptions

| # | Control | What it tests |
|---|---------|-------------|
| 1 | `dummy_tool_name` | Tool name `view_piano_roll_xyz` does not exist in the catalog. Dataset-grounding kill switch. |
| 2 | `snake_case_args` | Args use `song_id`/`start_measure`/`end_measure` instead of camelCase. Wrong casing must fail. |
| 3 | `unsupported_arg_dynamic` | `dynamic: "p"` on `view_piano_roll` — desired_future_capability, not a live arg. |
| 4 | `unsupported_arg_articulation` | `articulation: "legato"` — desired_future_capability, not a live arg. |
| 5 | `unsupported_arg_hand_both` | `hand: "both"` on `mute_hand` — enum allows only {left, right}. |
| 6 | `missing_required_arg` | `songId` omitted from `view_piano_roll` — required by schema. |
| 7 | `wrong_arg_type` | `startMeasure: "1"` (string) — schema type is integer, no coercion. |
| 8 | `trajectory_order_swap` | `play_song` before `view_piano_roll` on same scope — violates observation-before-action rule. |

All 8 controls score 0 (correctly rejected). The harness has no false negatives.

---

## Eval methodology

### Tool name check (AST exact-match)
String equality against tool names in `tool-schemas.json`. No fuzzy matching, no substring matching.
Nonexistent tool names return `failureMode: "tool_name_invalid"` immediately, without inspecting args.

### Argument schema validity
Reuses `src/dataset/trace-validator.ts` (ajv, JSON Schema draft-07). Every tool's `inputSchema` is
post-processed with `additionalProperties: false` to reject unknown argument names — matching the
Zod-strict runtime behavior of the real MCP server. Enum values are validated natively by ajv.

### Trajectory order check
Observation tools (currently: `view_piano_roll`) must precede action tools (currently: `play_song`)
when operating on the same scope (`songId/id + startMeasure-endMeasure`). A scope key is derived from
each tool call's arguments. Action before observation on same scope → `trajectory_order_invalid`.

### Multi-turn dependency check
Same mechanism as trajectory order for Slice 4's gold trace patterns. Separated for clarity; future
slices can add cross-turn dependency rules independently.

---

## Open questions

None for Slice 4. All gates passed. Ready for Slice 5 corpus expansion.

Deferred:
- **E2 phrase continuation eval** — separate slice, requires held-out measures.
- **E3 annotation grounding eval** — separate slice, requires MCQ generation.
- **Multi-turn dependency enrichment** — current check is observation-before-action on same scope; future slices can add cross-record dependency rules.
- **Enum boundary tests for play_song modes** — mode:loop passes; mode values {full, measure, hands} are accepted by schema but not tested here (not needed by Slice 4 gold traces).

---

## Harness readiness

Slice 4 establishes that the E1 harness is provably correct:
- Gold traces that ARE valid → score 1.0 (3/3 pass)
- Synthesized traces that ARE invalid → correctly rejected (8/8 controls score 0)

Slice 5 (corpus expansion to ~50 records) can fire. E2 and E3 evals are deferred to subsequent slices.
