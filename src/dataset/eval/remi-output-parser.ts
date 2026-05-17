// ─── jam-actions-v0 Slice 9a REMI Output Parser ────────────────────────────────
//
// Tolerant parser for LLM E2 structured output.
// Strategy: strict-first → recovery-second → unrecoverable.
//
// Motivation (from Slice 8.5 failure-mode analysis):
//   FM-1: Token-as-string-in-array — model puts all tokens in a single
//         space-separated string inside a one-element array (observed in qwen3:8b).
//   FM-2: Thinking-token bleed — qwen3:8b reasoning wraps entire output in
//         <think>…</think> blocks; tokens_remi ends up with 0-1 real REMI tokens.
//   FM-3: Near-empty REMI — model produces only control tokens (Bar_ only, no
//         Pitch_) yielding 0 note events. Scores 4-7 tokens, grooveOA=null.
//         Observed in hermes3:8b (all 6 E2 runs).
//   FM-4: Semantically empty REMI — model produces 63-116 tokens that parse OK
//         but contain no Pitch_ tokens (e.g., uses non-standard MIDI vocab like
//         Note_On_/Note_Off_). Observed in qwen2.5:7b pair 2 runs 1 & 3.
//   FM-5: Markdown code fences — ```json … ``` wrapper around JSON body.
//   FM-6: Trailing prose / leading prose — model adds explanation before/after JSON.
//   FM-7: Truncated JSON — response cut at max_tokens boundary.
//
// Recovery strategy (applied in order; stops on first success):
//   R1. Strip markdown code fences (``` json ... ```)
//   R2. Extract first {...} JSON object (strip leading/trailing prose)
//   R3. Normalize smart quotes → straight quotes
//   R4. Remove trailing commas before } or ]
//   R5. Balance open braces/brackets (close unclosed)
//   R6. Split single-string token arrays (FM-1)
//   R7. Strip thinking-block wrapper (FM-2)
//
// After JSON parse succeeds: validate REMI vocab.
//   Valid prefixes: Bar_ / Position_ / Pitch_ / Velocity_ / Duration_
//   Any token with an unrecognized prefix → 'unrecoverable' (not guessable).
//   Note: we do NOT require Pitch_ tokens to be present — that's a music-quality
//   failure (FM-3 / FM-4), not a parse failure. The parser's job is to recover
//   JSON structure; downstream groove scoring will naturally return null for
//   note-empty sequences.
//
// Parse status:
//   'clean'         — strict parse passed, schema matched
//   'recovered'     — recovery transform(s) applied, then schema matched
//   'unrecoverable' — no recovery worked, or REMI vocab invalid
//
// ─────────────────────────────────────────────────────────────────────────────

// ─── Valid REMI token prefixes ───────────────────────────────────────────────

/** Valid REMI token prefixes from Huang & Yang 2020 (hand-rolled in Slice 3). */
const VALID_REMI_PREFIXES = [
  "Bar_",
  "Position_",
  "Pitch_",
  "Velocity_",
  "Duration_",
] as const;

export type RemiPrefix = (typeof VALID_REMI_PREFIXES)[number];

/**
 * Check whether a string is a valid REMI token.
 * Valid: starts with one of the 5 known prefixes, followed by a numeric value.
 */
export function isValidRemiToken(token: string): boolean {
  for (const prefix of VALID_REMI_PREFIXES) {
    if (token.startsWith(prefix)) {
      const suffix = token.slice(prefix.length);
      // Suffix must be non-empty and purely numeric
      return suffix.length > 0 && /^\d+$/.test(suffix);
    }
  }
  return false;
}

// ─── Parse result ─────────────────────────────────────────────────────────────

export type ParseStatus = "clean" | "recovered" | "unrecoverable";

export interface ParseResult {
  status: ParseStatus;
  tokens_remi: string[];
  tokens_abc: string;
  /** Recovery transforms applied (only present when status === 'recovered'). */
  recoverySteps?: string[];
  /** Reason for failure (only present when status === 'unrecoverable'). */
  reason?: string;
}

// ─── Schema validation ────────────────────────────────────────────────────────

interface ExpectedSchema {
  tokens_remi: string[];
  tokens_abc: string;
}

/**
 * Validate that a parsed JSON value matches the E2 output schema.
 * Returns the typed object or null.
 */
function matchSchema(data: unknown): ExpectedSchema | null {
  if (
    data === null ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    return null;
  }

  const d = data as Record<string, unknown>;

  // tokens_remi must be an array
  if (!Array.isArray(d.tokens_remi)) return null;

  // tokens_abc must be a string
  if (typeof d.tokens_abc !== "string") return null;

  // tokens_remi elements must all be strings
  const tokensRemi = d.tokens_remi as unknown[];
  if (!tokensRemi.every((t) => typeof t === "string")) return null;

  return {
    tokens_remi: d.tokens_remi as string[],
    tokens_abc: d.tokens_abc,
  };
}

// ─── Recovery transforms ───────────────────────────────────────────────────────

/**
 * R1: Strip markdown code fences.
 * Handles: ```json\n{...}\n``` and ```\n{...}\n```
 */
function stripMarkdownFences(raw: string): { text: string; applied: boolean } {
  const fenceMatch = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/.exec(raw.trim());
  if (fenceMatch) {
    return { text: fenceMatch[1].trim(), applied: true };
  }
  return { text: raw, applied: false };
}

/**
 * R2: Extract first {...} object (strip leading/trailing prose).
 * Finds the first { and last } to isolate the JSON object.
 */
function extractJsonObject(raw: string): { text: string; applied: boolean } {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const extracted = raw.slice(start, end + 1);
    if (extracted !== raw.trim()) {
      return { text: extracted, applied: true };
    }
  }
  return { text: raw, applied: false };
}

/**
 * R3: Normalize smart quotes → straight quotes.
 * Handles: " " ' ' and similar Unicode curly-quote variants.
 */
function normalizeSmartQuotes(raw: string): { text: string; applied: boolean } {
  const normalized = raw
    .replace(/[“”„‟]/g, '"')  // curly double quotes
    .replace(/[‘’‚‛]/g, "'");  // curly single quotes
  return { text: normalized, applied: normalized !== raw };
}

/**
 * R4: Remove trailing commas before } or ].
 * Handles patterns like: ["a", "b",] or {"key": "val",}
 */
function removeTrailingCommas(raw: string): { text: string; applied: boolean } {
  const normalized = raw.replace(/,(\s*[}\]])/g, "$1");
  return { text: normalized, applied: normalized !== raw };
}

/**
 * R5: Balance open braces/brackets.
 * Scans for unclosed { and [ and appends matching closers.
 * Only appends; does not attempt structural repair.
 */
function balanceBraces(raw: string): { text: string; applied: boolean } {
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (const ch of raw) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{" || ch === "[") {
      stack.push(ch === "{" ? "}" : "]");
    } else if (ch === "}" || ch === "]") {
      if (stack.length > 0 && stack[stack.length - 1] === ch) {
        stack.pop();
      }
    }
  }

  if (stack.length === 0) return { text: raw, applied: false };

  const suffix = stack.reverse().join("");
  return { text: raw + suffix, applied: true };
}

/**
 * R6: Split single-string token arrays (FM-1 — token-as-string-in-array).
 *
 * Detects the pattern: tokens_remi is a one-element array containing a
 * space-separated string of REMI tokens, e.g.:
 *   {"tokens_remi": ["Bar_1 Position_0 Pitch_60 ..."], "tokens_abc": "..."}
 *
 * Recovery: split on whitespace and validate each fragment is a REMI token.
 * If splitting produces ≥2 valid REMI tokens, apply the transform.
 * If the single element is already a valid REMI token (no split needed), skip.
 */
function splitSingleStringTokenArray(
  data: Record<string, unknown>,
): { data: Record<string, unknown>; applied: boolean } {
  const tr = data.tokens_remi;
  if (!Array.isArray(tr) || tr.length !== 1 || typeof tr[0] !== "string") {
    return { data, applied: false };
  }

  const single = tr[0] as string;

  // If it's already a valid individual REMI token, no split needed
  if (isValidRemiToken(single)) {
    return { data, applied: false };
  }

  // Try splitting on whitespace
  const parts = single.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length < 2) return { data, applied: false };

  // All parts must be valid REMI tokens for recovery to be safe
  if (!parts.every(isValidRemiToken)) {
    return { data, applied: false };
  }

  return {
    data: { ...data, tokens_remi: parts },
    applied: true,
  };
}

/**
 * R7: Strip thinking-block wrapper (FM-2 — qwen3:8b / reasoning models).
 *
 * Models with chain-of-thought may wrap output in <think>…</think>.
 * The real JSON output follows after the closing tag.
 * Also handles <thinking>…</thinking> variants.
 */
function stripThinkingBlock(raw: string): { text: string; applied: boolean } {
  // Match <think>...</think> or <thinking>...</thinking> at the start
  const thinkMatch = /^<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>\s*([\s\S]*)$/i.exec(
    raw.trim(),
  );
  if (thinkMatch) {
    const afterThink = thinkMatch[2].trim();
    if (afterThink.length > 0) {
      return { text: afterThink, applied: true };
    }
  }
  return { text: raw, applied: false };
}

// ─── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parse raw LLM output for E2 structured response.
 *
 * Returns a ParseResult with status 'clean', 'recovered', or 'unrecoverable'.
 * Recovery transforms are applied in sequence; each successful transform is
 * logged in recoverySteps.
 *
 * Recovery never fabricates REMI tokens. If a token has an unrecognized prefix,
 * it returns 'unrecoverable' rather than guessing what was intended.
 */
/**
 * Validate REMI vocab and return a ParseResult, or null if validation fails.
 * Used by both Stage 1 (clean) and Stage 2 (recovered) after schema match.
 */
function validateAndBuildResult(
  schema: ExpectedSchema,
  status: "clean" | "recovered",
  recoverySteps?: string[],
): ParseResult | null {
  // R6: split single-string token array (applies to object-level, can be needed even in Stage 1)
  let finalTokens = schema.tokens_remi;
  const r6Steps: string[] = [];
  const r6 = splitSingleStringTokenArray({ tokens_remi: schema.tokens_remi, tokens_abc: schema.tokens_abc } as Record<string, unknown>);
  if (r6.applied) {
    const data = r6.data as { tokens_remi: string[]; tokens_abc: string };
    finalTokens = data.tokens_remi;
    r6Steps.push("R6:split-single-string-token-array");
  }

  // Validate REMI vocab on the (possibly split) tokens
  const invalidToken = finalTokens.find((t) => !isValidRemiToken(t));
  if (invalidToken) {
    const allSteps = [...(recoverySteps ?? []), ...r6Steps];
    return {
      status: "unrecoverable",
      tokens_remi: [],
      tokens_abc: "",
      reason: `Invalid REMI token: "${invalidToken}"`,
      ...(allSteps.length > 0 ? { recoverySteps: allSteps } : {}),
    };
  }

  const allSteps = [...(recoverySteps ?? []), ...r6Steps];
  const finalStatus: "clean" | "recovered" =
    allSteps.length > 0 ? "recovered" : status;

  return {
    status: finalStatus,
    tokens_remi: finalTokens,
    tokens_abc: schema.tokens_abc,
    ...(allSteps.length > 0 ? { recoverySteps: allSteps } : {}),
  };
}

export function parseRemiOutput(raw: string): ParseResult {
  // ─── Stage 1: Strict parse ────────────────────────────────────────────────
  try {
    const parsed = JSON.parse(raw) as unknown;
    const schema = matchSchema(parsed);
    if (schema) {
      const result = validateAndBuildResult(schema, "clean");
      if (result) return result;
      // If validateAndBuildResult returns null (shouldn't happen), fall through
    }
    // JSON parsed but schema mismatch — fall through to recovery
  } catch {
    // JSON parse failed — fall through to recovery
  }

  // ─── Stage 2: Recovery transforms ────────────────────────────────────────
  const recoverySteps: string[] = [];
  let working = raw;

  // R7 first: strip thinking blocks (structural prefix that hides JSON)
  {
    const r7 = stripThinkingBlock(working);
    if (r7.applied) {
      working = r7.text;
      recoverySteps.push("R7:strip-thinking-block");
    }
  }

  // R1: strip markdown code fences
  {
    const r1 = stripMarkdownFences(working);
    if (r1.applied) {
      working = r1.text;
      recoverySteps.push("R1:strip-markdown-fences");
    }
  }

  // R2: extract first JSON object
  {
    const r2 = extractJsonObject(working);
    if (r2.applied) {
      working = r2.text;
      recoverySteps.push("R2:extract-json-object");
    }
  }

  // R3: normalize smart quotes
  {
    const r3 = normalizeSmartQuotes(working);
    if (r3.applied) {
      working = r3.text;
      recoverySteps.push("R3:normalize-smart-quotes");
    }
  }

  // R4: remove trailing commas
  {
    const r4 = removeTrailingCommas(working);
    if (r4.applied) {
      working = r4.text;
      recoverySteps.push("R4:remove-trailing-commas");
    }
  }

  // R5: balance braces
  {
    const r5 = balanceBraces(working);
    if (r5.applied) {
      working = r5.text;
      recoverySteps.push("R5:balance-braces");
    }
  }

  // Try JSON parse after string-level transforms
  let parsedAfterStringRecovery: unknown = null;
  let stringRecoveryParsed = false;
  try {
    parsedAfterStringRecovery = JSON.parse(working);
    stringRecoveryParsed = true;
  } catch {
    // JSON still not valid after string-level transforms
  }

  if (stringRecoveryParsed && parsedAfterStringRecovery !== null) {
    const schema = matchSchema(parsedAfterStringRecovery);
    if (schema) {
      const result = validateAndBuildResult(schema, "recovered", recoverySteps);
      if (result) return result;
    }

    // Schema mismatch after all transforms
    return {
      status: "unrecoverable",
      tokens_remi: [],
      tokens_abc: "",
      reason: `JSON parsed but schema mismatch after recovery. ` +
        `Expected {tokens_remi: string[], tokens_abc: string}. ` +
        `Got: ${JSON.stringify(parsedAfterStringRecovery).slice(0, 200)}`,
      recoverySteps,
    };
  }

  // All transforms failed
  return {
    status: "unrecoverable",
    tokens_remi: [],
    tokens_abc: "",
    reason: `JSON parse failed after all recovery transforms. ` +
      `Input (first 300 chars): ${raw.slice(0, 300)}`,
    recoverySteps: recoverySteps.length > 0 ? recoverySteps : undefined,
  };
}
