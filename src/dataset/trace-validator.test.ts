// ─── trace-validator.test.ts ──────────────────────────────────────────────────
//
// Tests for trace-validator.ts (T-A1-006 / F-328e9820).
//
// Before this file, trace-validator.ts was reached only indirectly through
// enrichment.test.ts's "E1 trace validation preserved on enriched
// target_trace" test — which exercises ONLY the pass path (a valid, fully-
// catalogued trace produces report.ok === true with zero mismatches). None of
// the validator's actual discriminating logic was tested:
//
//   - unknown_tool          — a tool_calls entry naming an uncatalogued tool
//   - arguments_invalid     — a tool call whose arguments fail the schema
//   - tool_turn_unknown_tool — a 'tool'-role turn naming an uncatalogued tool
//   - harden()'s additionalProperties:false enforcement — the sharpest case:
//     if harden() silently regressed to a no-op, every pre-existing test
//     would keep passing (none of them feed an extra-argument case), which is
//     exactly the "proves only half the invariant" failure mode this audit
//     hunts for.
//
// Also calls smokeTestValidator()/SECTION_7_PROTOTYPE_TRACE from a real test
// so their result gates `pnpm test`, not just ad-hoc script runs (their only
// prior callers were three corpus-building scripts that never run under
// `pnpm test`).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  validateTrace,
  loadToolSchemaCatalog,
  smokeTestValidator,
  SECTION_7_PROTOTYPE_TRACE,
  type ToolSchemaCatalog,
} from "./trace-validator.js";
import type { TargetTrace } from "./schema.js";

const catalog: ToolSchemaCatalog = loadToolSchemaCatalog();

function baseTrace(overrides: Partial<TargetTrace> = {}): TargetTrace {
  return {
    task_family: "test-family",
    objective: "Test objective for trace-validator unit tests.",
    session: [],
    ...overrides,
  } as TargetTrace;
}

// ─── Catalog sanity ────────────────────────────────────────────────────────

describe("loadToolSchemaCatalog", () => {
  it("loads the real catalog with tool_count matching the tools array length", () => {
    expect(catalog.tool_count).toBeGreaterThan(0);
    expect(catalog.tools.length).toBe(catalog.tool_count);
  });

  it("includes view_piano_roll with a required songId string property (used by fixtures below)", () => {
    const tool = catalog.tools.find((t) => t.name === "view_piano_roll");
    expect(tool).toBeDefined();
    const schema = tool!.inputSchema as {
      required?: string[];
      properties?: Record<string, { type?: string }>;
    };
    expect(schema.required).toContain("songId");
    expect(schema.properties?.songId?.type).toBe("string");
  });
});

// ─── unknown_tool ────────────────────────────────────────────────────────────

describe("validateTrace — unknown_tool", () => {
  it("flags a tool_calls entry whose tool name is not in the catalog", () => {
    const trace = baseTrace({
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "Calling a tool that doesn't exist.",
          tool_calls: [{ tool: "definitely_not_a_real_tool", arguments: {} }],
        },
      ],
    });
    const report = validateTrace(trace, catalog);
    expect(report.ok).toBe(false);
    expect(report.total_tool_calls).toBe(1);
    const mismatch = report.mismatches.find((m) => m.kind === "unknown_tool");
    expect(mismatch).toBeDefined();
    expect(mismatch!.tool).toBe("definitely_not_a_real_tool");
    expect(mismatch!.turn).toBe(1);
  });

  it("does not flag a real catalogued tool called with valid arguments", () => {
    const trace = baseTrace({
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "Viewing the piano roll.",
          tool_calls: [{ tool: "view_piano_roll", arguments: { songId: "fur-elise" } }],
        },
      ],
    });
    const report = validateTrace(trace, catalog);
    expect(report.ok).toBe(true);
    expect(report.mismatches).toEqual([]);
  });
});

// ─── arguments_invalid ───────────────────────────────────────────────────────

describe("validateTrace — arguments_invalid", () => {
  it("flags a tool call whose arguments fail the catalog's JSON schema (missing required + wrong type)", () => {
    const trace = baseTrace({
      session: [
        {
          turn: 2,
          role: "assistant",
          content: "Viewing the piano roll with malformed args.",
          tool_calls: [
            // songId is required (string) but omitted; startMeasure is the
            // wrong type (string, not integer).
            { tool: "view_piano_roll", arguments: { startMeasure: "one" } },
          ],
        },
      ],
    });
    const report = validateTrace(trace, catalog);
    expect(report.ok).toBe(false);
    expect(report.total_tool_calls).toBe(1);
    const mismatch = report.mismatches.find((m) => m.kind === "arguments_invalid");
    expect(mismatch).toBeDefined();
    expect(mismatch!.tool).toBe("view_piano_roll");
    expect(mismatch!.turn).toBe(2);
    expect(mismatch!.ajv_errors).toBeDefined();
    expect((mismatch!.ajv_errors as unknown[]).length).toBeGreaterThan(0);
    expect(mismatch!.message.length).toBeGreaterThan(0);
  });
});

// ─── tool_turn_unknown_tool ───────────────────────────────────────────────────

describe("validateTrace — tool_turn_unknown_tool", () => {
  it("flags a 'tool'-role turn referencing an uncatalogued tool", () => {
    const trace = baseTrace({
      session: [
        {
          turn: 3,
          role: "tool",
          tool: "not_a_real_tool_either",
          content: { whatever: true },
        },
      ],
    });
    const report = validateTrace(trace, catalog);
    expect(report.ok).toBe(false);
    expect(report.total_tool_turns).toBe(1);
    const mismatch = report.mismatches.find((m) => m.kind === "tool_turn_unknown_tool");
    expect(mismatch).toBeDefined();
    expect(mismatch!.tool).toBe("not_a_real_tool_either");
    expect(mismatch!.turn).toBe(3);
  });

  it("does not flag a 'tool'-role turn referencing a real catalogued tool", () => {
    const trace = baseTrace({
      session: [
        {
          turn: 3,
          role: "tool",
          tool: "view_piano_roll",
          content: { svg_returned: true },
        },
      ],
    });
    const report = validateTrace(trace, catalog);
    expect(report.ok).toBe(true);
    expect(report.total_tool_turns).toBe(1);
    expect(report.mismatches).toEqual([]);
  });
});

// ─── harden() additionalProperties:false enforcement ─────────────────────────
//
// The sharpest case per the finding: if harden() ever silently regressed to a
// no-op, this describe block is the ONLY place in the suite that would catch
// it — every other trace-validator test (here or in enrichment.test.ts) uses
// exactly-declared argument sets, so an extra-property leak would otherwise
// go undetected.

describe("validateTrace — harden() additionalProperties:false enforcement", () => {
  it("passes a trace whose arguments contain only declared properties", () => {
    const trace = baseTrace({
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "Viewing the piano roll with a full, valid argument set.",
          tool_calls: [
            {
              tool: "view_piano_roll",
              arguments: {
                songId: "fur-elise",
                startMeasure: 1,
                endMeasure: 8,
                color_mode: "hand",
              },
            },
          ],
        },
      ],
    });
    const report = validateTrace(trace, catalog);
    expect(report.ok).toBe(true);
    expect(report.mismatches).toEqual([]);
  });

  it("REJECTS a trace whose arguments include one extra undeclared property — proves harden() still forces additionalProperties:false", () => {
    const trace = baseTrace({
      session: [
        {
          turn: 1,
          role: "assistant",
          content: "Viewing the piano roll with a bogus extra argument.",
          tool_calls: [
            {
              tool: "view_piano_roll",
              arguments: {
                songId: "fur-elise",
                // Undeclared property. The published draft-07 JSON Schema
                // alone defaults to additionalProperties: true and would
                // accept this; the real MCP server's Zod-strict runtime
                // rejects it. harden() exists specifically so the validator
                // matches that runtime strictness rather than the laxer
                // published schema.
                thisPropertyDoesNotExist: "surprise",
              },
            },
          ],
        },
      ],
    });
    const report = validateTrace(trace, catalog);
    expect(report.ok).toBe(false);
    const mismatch = report.mismatches.find((m) => m.kind === "arguments_invalid");
    expect(mismatch).toBeDefined();
    expect(mismatch!.tool).toBe("view_piano_roll");
    // ajv's additionalProperties error names the offending property — assert
    // the rejection is actually FOR the extra property, not some unrelated
    // schema complaint.
    const ajvErrors = mismatch!.ajv_errors as Array<{
      params?: { additionalProperty?: string };
    }>;
    expect(
      ajvErrors.some((e) => e.params?.additionalProperty === "thisPropertyDoesNotExist"),
    ).toBe(true);
  });
});

// ─── smokeTestValidator / SECTION_7_PROTOTYPE_TRACE ──────────────────────────
//
// Previously exported but never invoked by any test — only by three one-off
// corpus-building scripts, none of which run under `pnpm test`. These calls
// make the smoke result gate the real suite.

describe("smokeTestValidator", () => {
  it("passes against the real catalog using the file's own prototype trace", () => {
    const { passed, report } = smokeTestValidator(catalog);
    expect(passed).toBe(true);
    expect(report.ok).toBe(true);
    expect(report.mismatches).toEqual([]);
  });

  it("SECTION_7_PROTOTYPE_TRACE validates cleanly and exercises at least 2 real tool calls", () => {
    const report = validateTrace(SECTION_7_PROTOTYPE_TRACE, catalog);
    expect(report.ok).toBe(true);
    expect(report.total_tool_calls).toBeGreaterThanOrEqual(2);
    expect(report.total_tool_turns).toBeGreaterThanOrEqual(2);
    expect(report.schema_source.tool_count).toBe(catalog.tool_count);
  });
});
