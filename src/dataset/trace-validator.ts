// ─── jam-actions-v0 Trace Validator ──────────────────────────────────────────
//
// Validates every `target_trace.session[*].tool_calls[*]` against
// `tool-schemas.json` — the canonical MCP tool surface extracted by
// `scripts/extract-mcp-tool-schemas.ts`.
//
// Collects ALL mismatches (does NOT throw on first failure).
//
// Strictness: every tool's inputSchema is post-processed to set
// `additionalProperties: false`, so unknown argument names are flagged
// (matches the runtime Zod-strict behavior of the real MCP server, which
// the published JSON Schema does not preserve).
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv, type ValidateFunction } from "ajv";
import type { TargetTrace, ToolCall, Turn } from "./schema.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ToolSchemaEntry {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolSchemaCatalog {
  server_name: string;
  derived_from: string;
  derived_at: string;
  tool_count: number;
  tools: ToolSchemaEntry[];
}

export type MismatchKind =
  | "unknown_tool"
  | "arguments_invalid"
  | "tool_turn_unknown_tool";

export interface Mismatch {
  turn: number;
  tool: string;
  kind: MismatchKind;
  message: string;
  /** Raw ajv error details when kind === "arguments_invalid". */
  ajv_errors?: unknown[];
}

export interface ValidationReport {
  ok: boolean;
  total_tool_calls: number;
  total_tool_turns: number;
  mismatches: Mismatch[];
  schema_source: { derived_from: string; derived_at: string; tool_count: number };
}

// ─── Catalog loader ──────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG_PATH = join(__dirname, "tool-schemas.json");

export function loadToolSchemaCatalog(
  catalogPath: string = DEFAULT_CATALOG_PATH,
): ToolSchemaCatalog {
  const raw = readFileSync(catalogPath, "utf8");
  return JSON.parse(raw) as ToolSchemaCatalog;
}

// ─── Validator builder ───────────────────────────────────────────────────────

/**
 * Clone a tool inputSchema and force `additionalProperties: false` on every
 * object node so the validator rejects unknown argument names. The MCP server
 * uses Zod strict-object at runtime, which the published draft-07 schema does
 * not preserve.
 */
function harden(schema: unknown): unknown {
  if (schema === null || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(harden);

  const out: Record<string, unknown> = {};
  const obj = schema as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    out[key] = harden(value);
  }
  if (obj.type === "object" && obj.additionalProperties === undefined) {
    out.additionalProperties = false;
  }
  return out;
}

interface CompiledCatalog {
  byName: Map<string, ValidateFunction>;
  catalog: ToolSchemaCatalog;
}

// F-afd2c768: memoize compiled catalogs by object identity. The catalog
// (tool-schemas.json) is static within a process run, and corpus-scale
// callers (scripts/validate-jam-actions-corpus.ts and friends) load it once
// and pass the SAME object into validateTrace() once per record — up to 145
// times across the current corpus — so recompiling a fresh AJV instance and
// re-compiling every tool's schema from scratch on every call was pure
// waste. Keyed on object identity (WeakMap) rather than e.g.
// `catalog.derived_at`: two structurally different catalog objects could in
// principle share a `derived_at` string (a test fixture that mutates a
// cloned catalog without bumping it, for instance), and caching on that
// string would silently return the WRONG compiled validators for one of
// them. Object identity can't collide that way, and lets the cache entry be
// garbage-collected once the catalog itself is no longer referenced.
const compiledCatalogCache = new WeakMap<ToolSchemaCatalog, CompiledCatalog>();

function compileCatalog(catalog: ToolSchemaCatalog): CompiledCatalog {
  const cached = compiledCatalogCache.get(catalog);
  if (cached) return cached;

  const ajv = new Ajv({
    strict: false,
    allErrors: true,
    allowUnionTypes: true,
  });
  const byName = new Map<string, ValidateFunction>();
  for (const tool of catalog.tools) {
    const hardened = harden(tool.inputSchema) as Record<string, unknown>;
    byName.set(tool.name, ajv.compile(hardened));
  }
  const compiled: CompiledCatalog = { byName, catalog };
  compiledCatalogCache.set(catalog, compiled);
  return compiled;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateTrace(
  trace: TargetTrace,
  catalog: ToolSchemaCatalog = loadToolSchemaCatalog(),
): ValidationReport {
  const compiled = compileCatalog(catalog);
  const mismatches: Mismatch[] = [];
  let totalToolCalls = 0;
  let totalToolTurns = 0;

  for (const turn of trace.session) {
    if (turn.role === "assistant" && turn.tool_calls) {
      for (const call of turn.tool_calls) {
        totalToolCalls += 1;
        checkToolCall(turn.turn, call, compiled, mismatches);
      }
    } else if (turn.role === "tool") {
      totalToolTurns += 1;
      const validator = compiled.byName.get(turn.tool);
      if (!validator) {
        mismatches.push({
          turn: turn.turn,
          tool: turn.tool,
          kind: "tool_turn_unknown_tool",
          message: `Tool turn references "${turn.tool}" which is not in the catalog.`,
        });
      }
    }
  }

  return {
    ok: mismatches.length === 0,
    total_tool_calls: totalToolCalls,
    total_tool_turns: totalToolTurns,
    mismatches,
    schema_source: {
      derived_from: catalog.derived_from,
      derived_at: catalog.derived_at,
      tool_count: catalog.tool_count,
    },
  };
}

function checkToolCall(
  turnNumber: number,
  call: ToolCall,
  compiled: CompiledCatalog,
  mismatches: Mismatch[],
): void {
  const validator = compiled.byName.get(call.tool);
  if (!validator) {
    mismatches.push({
      turn: turnNumber,
      tool: call.tool,
      kind: "unknown_tool",
      message: `Tool "${call.tool}" is not in the catalog.`,
    });
    return;
  }
  const ok = validator(call.arguments);
  if (!ok) {
    mismatches.push({
      turn: turnNumber,
      tool: call.tool,
      kind: "arguments_invalid",
      message: formatAjvErrors(validator.errors ?? []),
      ajv_errors: validator.errors ?? [],
    });
  }
}

function formatAjvErrors(errors: unknown[]): string {
  return errors
    .map((e) => {
      const err = e as { instancePath?: string; message?: string; params?: Record<string, unknown> };
      const path = err.instancePath || "(root)";
      const params = err.params ? ` ${JSON.stringify(err.params)}` : "";
      return `${path}: ${err.message ?? "invalid"}${params}`;
    })
    .join("; ");
}

// ─── Smoke test ──────────────────────────────────────────────────────────────
//
// The synthesis Section 7 revised prototype trace, inlined. If this fails to
// validate, either the validator has a bug OR the prototype drifted out of
// sync with the real MCP surface — either way, the build should abort.

export const SECTION_7_PROTOTYPE_TRACE: TargetTrace = {
  task_family: "analyze-and-play-phrase",
  objective:
    "Read mm. 1–8 of Für Elise, view the piano roll, analyze the opening figure, play the phrase in a loop, then produce a phrase annotation.",
  session: [
    {
      turn: 1,
      role: "user",
      content: "Read measures 1–8 of Für Elise and tell me what's happening musically before we play it.",
    },
    {
      turn: 2,
      role: "assistant",
      content: "Let me view the piano roll for mm. 1–8.",
      tool_calls: [
        {
          tool: "view_piano_roll",
          arguments: { songId: "fur-elise", startMeasure: 1, endMeasure: 8 },
        },
      ],
    },
    {
      turn: 3,
      role: "tool",
      tool: "view_piano_roll",
      content: { svg_returned: true, measures: 8, rh_notes: 42, lh_notes: 14 },
    },
    {
      turn: 4,
      role: "assistant",
      content:
        "I can see the opening oscillation: RH alternates E5 and D#5 over an A-minor bassline. The motion is metric and quiet — it's the A-theme entrance. The phrase resolves at m. 4 with a half cadence to E, then restates from m. 5. Let me loop mm. 1–8 so you can hear the phrasing.",
      tool_calls: [
        {
          tool: "play_song",
          arguments: { id: "fur-elise", startMeasure: 1, endMeasure: 8, mode: "loop" },
        },
      ],
    },
    {
      turn: 5,
      role: "tool",
      tool: "play_song",
      content: { playback_started: true, mode: "loop" },
    },
    {
      turn: 6,
      role: "assistant",
      content:
        "Phrase summary — Für Elise mm. 1–8: A-theme opening. Oscillating E–D# neighbor motion in RH over A-minor bassline. Half cadence at m. 4, restated from m. 5. Teaching focus: evenness of RH oscillation, voice independence, light cantabile touch.",
    },
  ],
};

export interface SmokeTestResult {
  passed: boolean;
  report: ValidationReport;
}

export function smokeTestValidator(
  catalog: ToolSchemaCatalog = loadToolSchemaCatalog(),
): SmokeTestResult {
  const report = validateTrace(SECTION_7_PROTOTYPE_TRACE, catalog);
  return { passed: report.ok, report };
}
