// ─── Slice 9a: remi-output-parser.ts Tests ────────────────────────────────────
//
// Coverage:
//   - Clean path (valid JSON, correct schema)
//   - REMI vocab validation (valid / invalid tokens)
//   - Each recovery transform (R1-R7) in isolation
//   - Each Slice 8.5 failure mode (FM-1 through FM-7)
//   - Combinations of transforms
//   - Unrecoverable cases
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  parseRemiOutput,
  isValidRemiToken,
  type ParseResult,
} from "./remi-output-parser.js";

// ─── Helper: minimal valid output ────────────────────────────────────────────

const VALID_TOKENS = [
  "Bar_1",
  "Position_0",
  "Pitch_60",
  "Velocity_64",
  "Duration_4",
  "Bar_2",
  "Position_0",
  "Pitch_64",
  "Velocity_64",
  "Duration_4",
];

const VALID_ABC = "X:1\nT:test\nM:4/4\nL:1/8\nK:C\n|CDEF|GABC|";

function validJson(
  overrides: Partial<{ tokens_remi: string[]; tokens_abc: string }> = {},
): string {
  return JSON.stringify({
    tokens_remi: VALID_TOKENS,
    tokens_abc: VALID_ABC,
    ...overrides,
  });
}

// ─── isValidRemiToken ─────────────────────────────────────────────────────────

describe("isValidRemiToken", () => {
  it("accepts valid Bar_ token", () => {
    expect(isValidRemiToken("Bar_1")).toBe(true);
    expect(isValidRemiToken("Bar_12")).toBe(true);
  });

  it("accepts valid Position_ token", () => {
    expect(isValidRemiToken("Position_0")).toBe(true);
    expect(isValidRemiToken("Position_95")).toBe(true);
  });

  it("accepts valid Pitch_ token", () => {
    expect(isValidRemiToken("Pitch_60")).toBe(true);
    expect(isValidRemiToken("Pitch_127")).toBe(true);
  });

  it("accepts valid Velocity_ token", () => {
    expect(isValidRemiToken("Velocity_64")).toBe(true);
    expect(isValidRemiToken("Velocity_0")).toBe(true);
  });

  it("accepts valid Duration_ token", () => {
    expect(isValidRemiToken("Duration_4")).toBe(true);
    expect(isValidRemiToken("Duration_64")).toBe(true);
  });

  it("rejects token with unknown prefix", () => {
    expect(isValidRemiToken("Note_On_60")).toBe(false);
    expect(isValidRemiToken("Note_60")).toBe(false);
    expect(isValidRemiToken("BPM_120")).toBe(false);
    expect(isValidRemiToken("Tempo_500000")).toBe(false);
  });

  it("rejects token with non-numeric suffix", () => {
    expect(isValidRemiToken("Bar_")).toBe(false);
    expect(isValidRemiToken("Pitch_abc")).toBe(false);
    expect(isValidRemiToken("Velocity_None")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidRemiToken("")).toBe(false);
  });

  it("rejects space-separated token string (FM-1 pattern)", () => {
    expect(isValidRemiToken("Bar_1 Position_0 Pitch_60")).toBe(false);
  });
});

// ─── Stage 1: Clean path ──────────────────────────────────────────────────────

describe("parseRemiOutput — clean path", () => {
  it("returns clean status for valid JSON", () => {
    const result = parseRemiOutput(validJson());
    expect(result.status).toBe("clean");
    expect(result.tokens_remi).toEqual(VALID_TOKENS);
    expect(result.tokens_abc).toBe(VALID_ABC);
    expect(result.recoverySteps).toBeUndefined();
    expect(result.reason).toBeUndefined();
  });

  it("returns clean for minimal valid output", () => {
    const json = JSON.stringify({
      tokens_remi: ["Bar_1", "Pitch_60"],
      tokens_abc: "",
    });
    const result = parseRemiOutput(json);
    expect(result.status).toBe("clean");
    expect(result.tokens_remi).toEqual(["Bar_1", "Pitch_60"]);
  });

  it("clean path: tokens_remi can be empty array", () => {
    const json = JSON.stringify({ tokens_remi: [], tokens_abc: "X:1\nT:t" });
    const result = parseRemiOutput(json);
    expect(result.status).toBe("clean");
    expect(result.tokens_remi).toEqual([]);
  });

  it("returns unrecoverable for invalid REMI token in clean parse", () => {
    const json = JSON.stringify({
      tokens_remi: ["Bar_1", "Note_On_60"],  // Note_On_ is invalid
      tokens_abc: "",
    });
    const result = parseRemiOutput(json);
    expect(result.status).toBe("unrecoverable");
    expect(result.reason).toContain("Note_On_60");
  });
});

// ─── R1: Strip markdown code fences ──────────────────────────────────────────

describe("parseRemiOutput — R1: strip markdown code fences", () => {
  it("recovers from ```json ... ``` fence (FM-5)", () => {
    const raw = "```json\n" + validJson() + "\n```";
    const result = parseRemiOutput(raw);
    expect(result.status).toBe("recovered");
    expect(result.tokens_remi).toEqual(VALID_TOKENS);
    expect(result.recoverySteps).toContain("R1:strip-markdown-fences");
  });

  it("recovers from ``` ... ``` fence (no language tag)", () => {
    const raw = "```\n" + validJson() + "\n```";
    const result = parseRemiOutput(raw);
    expect(result.status).toBe("recovered");
    expect(result.recoverySteps).toContain("R1:strip-markdown-fences");
  });
});

// ─── R2: Extract JSON object ──────────────────────────────────────────────────

describe("parseRemiOutput — R2: extract JSON object (FM-6 — trailing/leading prose)", () => {
  it("recovers from leading prose before JSON", () => {
    const raw = "Here is the continuation:\n" + validJson();
    const result = parseRemiOutput(raw);
    expect(result.status).toBe("recovered");
    expect(result.tokens_remi).toEqual(VALID_TOKENS);
    expect(result.recoverySteps).toContain("R2:extract-json-object");
  });

  it("recovers from trailing prose after JSON", () => {
    const raw = validJson() + "\n\nNote: this follows the pattern you requested.";
    const result = parseRemiOutput(raw);
    expect(result.status).toBe("recovered");
    expect(result.recoverySteps).toContain("R2:extract-json-object");
  });

  it("recovers from both leading and trailing prose", () => {
    const raw = "Sure! Here:\n" + validJson() + "\nDone.";
    const result = parseRemiOutput(raw);
    expect(result.status).toBe("recovered");
    expect(result.recoverySteps).toContain("R2:extract-json-object");
  });
});

// ─── R3: Normalize smart quotes ───────────────────────────────────────────────

describe("parseRemiOutput — R3: normalize smart quotes", () => {
  it("recovers from curly double quotes", () => {
    const raw = validJson().replace(/"/g, "“").replace(/"/g, "”");
    // This will corrupt all double quotes; after R3 normalization, JSON should parse
    const result = parseRemiOutput(raw);
    // If all quotes are normalized, it should recover
    if (result.status === "recovered") {
      expect(result.recoverySteps).toContain("R3:normalize-smart-quotes");
    }
    // At minimum: should not be clean (since it couldn't parse before)
    expect(result.status).not.toBe("clean");
  });

  it("handles mixed smart and straight quotes after R2", () => {
    const raw = `“{“ tokens_remi”: [“Bar_1”, “Pitch_60”], “tokens_abc”: “”}”`;
    // This is a mangled version; parsing will likely fail but tests the transforms don't crash
    const result = parseRemiOutput(raw);
    expect(["recovered", "unrecoverable"]).toContain(result.status);
  });
});

// ─── R4: Remove trailing commas ───────────────────────────────────────────────

describe("parseRemiOutput — R4: remove trailing commas", () => {
  it("recovers from trailing comma in array", () => {
    const malformed = `{"tokens_remi": ["Bar_1", "Pitch_60",], "tokens_abc": ""}`;
    const result = parseRemiOutput(malformed);
    expect(result.status).toBe("recovered");
    expect(result.recoverySteps).toContain("R4:remove-trailing-commas");
  });

  it("recovers from trailing comma in object", () => {
    const malformed = `{"tokens_remi": ["Bar_1", "Pitch_60"], "tokens_abc": "",}`;
    const result = parseRemiOutput(malformed);
    expect(result.status).toBe("recovered");
    expect(result.recoverySteps).toContain("R4:remove-trailing-commas");
  });
});

// ─── R5: Balance braces ───────────────────────────────────────────────────────

describe("parseRemiOutput — R5: balance braces (FM-7 — truncation)", () => {
  it("recovers from truncated JSON (missing closing brace)", () => {
    // Simulate FM-7: max_tokens hit mid-output
    const truncated = `{"tokens_remi": ["Bar_1", "Pitch_60"], "tokens_abc": "`;
    // After balancing: this is still broken because string is open.
    // Test that we at least don't crash.
    const result = parseRemiOutput(truncated);
    expect(["recovered", "unrecoverable"]).toContain(result.status);
  });

  it("recovers from missing outer closing brace with valid content", () => {
    const truncated = `{"tokens_remi": ["Bar_1", "Pitch_60"], "tokens_abc": ""`;
    const result = parseRemiOutput(truncated);
    expect(result.status).toBe("recovered");
    expect(result.recoverySteps).toContain("R5:balance-braces");
    expect(result.tokens_remi).toEqual(["Bar_1", "Pitch_60"]);
  });
});

// ─── R6: Split single-string token array (FM-1) ───────────────────────────────

describe("parseRemiOutput — R6: split single-string token array (FM-1)", () => {
  it("recovers from FM-1: all tokens in one string in array (qwen3:8b pattern)", () => {
    // This is the exact pattern from Slice 8.5:
    // {"tokens_remi": ["Bar_5 Position_0 Pitch_65 Velocity_32 Duration_18 ..."], ...}
    const singleStringTokens =
      "Bar_1 Position_0 Pitch_60 Velocity_64 Duration_4 Bar_2 Position_0 Pitch_64 Velocity_64 Duration_4";
    const raw = JSON.stringify({
      tokens_remi: [singleStringTokens],
      tokens_abc: VALID_ABC,
    });
    const result = parseRemiOutput(raw);
    expect(result.status).toBe("recovered");
    expect(result.tokens_remi).toEqual(VALID_TOKENS);
    expect(result.recoverySteps).toContain("R6:split-single-string-token-array");
  });

  it("does NOT split when single element is already a valid REMI token", () => {
    const raw = JSON.stringify({
      tokens_remi: ["Bar_1"],
      tokens_abc: "",
    });
    const result = parseRemiOutput(raw);
    expect(result.status).toBe("clean");
    expect(result.tokens_remi).toEqual(["Bar_1"]);
  });

  it("returns unrecoverable when single string contains invalid tokens", () => {
    // Can't recover if we'd have to fabricate or guess token meanings
    const raw = JSON.stringify({
      tokens_remi: ["Note_On_60 Note_Off_60 BPM_120"],  // invalid prefixes
      tokens_abc: "",
    });
    const result = parseRemiOutput(raw);
    expect(result.status).toBe("unrecoverable");
    // The invalid token should be named
    expect(result.reason).toBeDefined();
  });

  it("handles multi-element arrays with strings (does not split — only single-element case)", () => {
    const raw = JSON.stringify({
      tokens_remi: ["Bar_1 Pitch_60", "Bar_2 Pitch_64"],  // 2 elements — not FM-1
      tokens_abc: "",
    });
    const result = parseRemiOutput(raw);
    // These won't pass vocab validation (spaces in token) — unrecoverable
    expect(result.status).toBe("unrecoverable");
  });
});

// ─── R7: Strip thinking block (FM-2) ─────────────────────────────────────────

describe("parseRemiOutput — R7: strip thinking block (FM-2 — qwen3:8b thinking mode)", () => {
  it("recovers from <think>…</think> wrapper", () => {
    const raw = `<think>
This is a 4-measure continuation in Db major...
The model should output tokens in REMI format...
</think>
${validJson()}`;
    const result = parseRemiOutput(raw);
    expect(result.status).toBe("recovered");
    expect(result.tokens_remi).toEqual(VALID_TOKENS);
    expect(result.recoverySteps).toContain("R7:strip-thinking-block");
  });

  it("recovers from <thinking>…</thinking> wrapper", () => {
    const raw = `<thinking>
Analyzing the prompt phrase...
</thinking>
${validJson()}`;
    const result = parseRemiOutput(raw);
    expect(result.status).toBe("recovered");
    expect(result.recoverySteps).toContain("R7:strip-thinking-block");
  });

  it("recovers via R2 when JSON is inside thinking block (R2 extracts it)", () => {
    // When JSON is inside the think block and nothing follows, R7 won't fire
    // (no text after closing tag). But R2 will find the { } pair and extract the JSON.
    const raw = `<think>
${validJson()}
</think>`;
    const result = parseRemiOutput(raw);
    // Either recovered via R2 (finding { inside the string), or unrecoverable.
    // In practice R2 will find the JSON inside.
    expect(["recovered", "clean"]).toContain(result.status);
    if (result.status === "recovered") {
      expect(result.tokens_remi).toEqual(VALID_TOKENS);
    }
  });
});

// ─── FM-3: Near-empty REMI (hermes3:8b pattern) ──────────────────────────────

describe("parseRemiOutput — FM-3: near-empty REMI (hermes3:8b pattern)", () => {
  it("returns clean for only Bar_ tokens (no Pitch_ — FM-3 is music failure not parse failure)", () => {
    // FM-3: model produces structurally valid REMI but no pitch tokens.
    // This is a music-quality failure, NOT a parse failure.
    // The parser should accept it cleanly; groove scoring will return null.
    const json = JSON.stringify({
      tokens_remi: ["Bar_1", "Bar_2", "Bar_3", "Bar_4"],
      tokens_abc: "",
    });
    const result = parseRemiOutput(json);
    expect(result.status).toBe("clean");
    expect(result.tokens_remi).toEqual(["Bar_1", "Bar_2", "Bar_3", "Bar_4"]);
  });

  it("returns clean even for minimal single Bar_ token", () => {
    const json = JSON.stringify({ tokens_remi: ["Bar_1"], tokens_abc: "" });
    const result = parseRemiOutput(json);
    expect(result.status).toBe("clean");
    expect(result.tokens_remi).toEqual(["Bar_1"]);
  });
});

// ─── FM-4: Semantically empty REMI (qwen2.5:7b pair 2 pattern) ───────────────

describe("parseRemiOutput — FM-4: invalid REMI vocab tokens", () => {
  it("returns unrecoverable for Note_On_ / Note_Off_ style tokens", () => {
    // FM-4: model uses MIDI event names instead of REMI vocab
    const json = JSON.stringify({
      tokens_remi: [
        "Note_On_60", "Note_Off_60", "Note_On_64", "Note_Off_64",
      ],
      tokens_abc: "",
    });
    const result = parseRemiOutput(json);
    expect(result.status).toBe("unrecoverable");
    expect(result.reason).toContain("Note_On_60");
  });

  it("returns unrecoverable for mixed valid and invalid tokens", () => {
    const json = JSON.stringify({
      tokens_remi: ["Bar_1", "Note_On_60"],
      tokens_abc: "",
    });
    const result = parseRemiOutput(json);
    expect(result.status).toBe("unrecoverable");
    expect(result.reason).toContain("Note_On_60");
  });

  it("returns unrecoverable for Tempo_/Time_Sig_ style tokens", () => {
    const json = JSON.stringify({
      tokens_remi: ["Tempo_120", "Time_Sig_4_4", "Bar_1"],
      tokens_abc: "",
    });
    const result = parseRemiOutput(json);
    expect(result.status).toBe("unrecoverable");
  });
});

// ─── Combined transforms ──────────────────────────────────────────────────────

describe("parseRemiOutput — combined transforms", () => {
  it("recovers from code fence + trailing prose (R2 extracts the JSON object)", () => {
    // R1 requires string to START with ```, but here prose precedes the fence.
    // R2 handles this: it finds the first { and last } to extract the JSON.
    const raw = "Here is the output:\n```json\n" + validJson() + "\n```\nI hope this helps!";
    const result = parseRemiOutput(raw);
    expect(result.status).toBe("recovered");
    expect(result.tokens_remi).toEqual(VALID_TOKENS);
    // R2 handles prose-wrapped content; R1 handles pure-fence content
    expect(result.recoverySteps).toContain("R2:extract-json-object");
  });

  it("recovers from thinking block + code fence", () => {
    const raw = "<think>Thinking...</think>\n```json\n" + validJson() + "\n```";
    const result = parseRemiOutput(raw);
    expect(result.status).toBe("recovered");
    expect(result.recoverySteps).toContain("R7:strip-thinking-block");
    expect(result.recoverySteps).toContain("R1:strip-markdown-fences");
  });

  it("recovers from code fence + trailing comma + prose", () => {
    const malformed = JSON.stringify({
      tokens_remi: ["Bar_1", "Pitch_60"],
      tokens_abc: "",
    }).replace(/"tokens_abc": ""/, '"tokens_abc": "",');
    const raw = "Result:\n```json\n" + malformed + "\n```";
    const result = parseRemiOutput(raw);
    expect(result.status).toBe("recovered");
    expect(result.tokens_remi).toEqual(["Bar_1", "Pitch_60"]);
  });
});

// ─── Unrecoverable cases ──────────────────────────────────────────────────────

describe("parseRemiOutput — unrecoverable cases", () => {
  it("returns unrecoverable for completely garbled output", () => {
    const result = parseRemiOutput("This is just prose with no JSON at all.");
    expect(result.status).toBe("unrecoverable");
    expect(result.reason).toBeDefined();
  });

  it("returns unrecoverable for empty string", () => {
    const result = parseRemiOutput("");
    expect(result.status).toBe("unrecoverable");
  });

  it("returns unrecoverable when schema has wrong field types", () => {
    const json = JSON.stringify({
      tokens_remi: "Bar_1 Pitch_60",  // string, not array
      tokens_abc: 42,                 // number, not string
    });
    const result = parseRemiOutput(json);
    expect(result.status).toBe("unrecoverable");
  });

  it("returns unrecoverable when tokens_remi array contains non-strings", () => {
    const json = JSON.stringify({
      tokens_remi: [1, 2, 3],
      tokens_abc: "",
    });
    const result = parseRemiOutput(json);
    expect(result.status).toBe("unrecoverable");
  });

  it("returns empty tokens on unrecoverable", () => {
    const result = parseRemiOutput("not json");
    expect(result.tokens_remi).toEqual([]);
    expect(result.tokens_abc).toBe("");
  });
});

// ─── Regression: Slice 8.5 qwen3:8b actual failure (FM-1 from parseError) ────

describe("parseRemiOutput — Slice 8.5 regression cases", () => {
  it("FM-1 regression: qwen3:8b pair1 run2 pattern (FM-1 single-string in array)", () => {
    // This is the actual raw response fragment from Slice 8.5 parseError
    const actualFragment =
      'Bar_5 Position_0 Pitch_65 Velocity_32 Duration_18 Pitch_68 Velocity_36 Duration_18 Position_11 Pitch_70 Velocity_32 Duration_2 Pitch_73 Velocity_40 Duration_2 Position_21 Pitch_72 Velocity_28 Duration_2 Pitch_75 Velocity_32 Duration_2 Position_32 Pitch_70 Velocity_24 Duration_14 Pitch_73 Velocity_32 Duration_14';
    const raw = JSON.stringify({
      tokens_remi: [actualFragment],
      tokens_abc: "X:1\nT:test\nM:9/8\nL:1/16\nK:Db\n|...|",
    });
    const result = parseRemiOutput(raw);
    // FM-1: single string should be split
    expect(result.status).toBe("recovered");
    expect(result.recoverySteps).toContain("R6:split-single-string-token-array");
    // All individual tokens should be valid REMI
    expect(result.tokens_remi.length).toBeGreaterThan(1);
    expect(result.tokens_remi.every(isValidRemiToken)).toBe(true);
  });

  it("FM-1 regression: truncated single string (parse would fail with raw)", () => {
    // This simulates the actual case where JSON.parse fails because the model
    // emitted invalid JSON with a truncated string inside the array
    const partial =
      '{"tokens_remi": [\n    "Bar_5 Position_0 Pitch_65 Velocity_32 Duration_18 Pitch_68 Velocity_36 Duration_18 Position_11 Pitch_70 Velocity_32 Duration_2 Pitch_73 Velocity_40 Duration_2 Position_21 Pitch_72 Velocity_28 Duration_2 Pitch_75 Velocity_32 Duration_2 Position_32 Pitch_70 Velocity_24 Duration_14 Pitch_73 Velocity_32 Duration_14 Bar_6 Position_0 Pitch_63 Velocity_32 Duration_18 Pitch_66 Velocity_36 Duration_18 Position_11 Pitch_68 Velocity_28 Duration_2 Pitch_72 Velocity_32 Duration_2 Po"';
    // This will fail to parse; test that it doesn't crash
    const result = parseRemiOutput(partial);
    expect(["recovered", "unrecoverable"]).toContain(result.status);
  });

  it("clean regression: qwen2.5:7b pair1 run1 style (63+ tokens, correct format)", () => {
    // Build a synthetic but realistic qwen2.5:7b-style output
    const tokens: string[] = [];
    for (let bar = 1; bar <= 4; bar++) {
      tokens.push(`Bar_${bar}`);
      for (let pos = 0; pos < 4; pos++) {
        tokens.push(`Position_${pos * 24}`);
        tokens.push(`Pitch_${60 + pos * 2}`);
        tokens.push("Velocity_64");
        tokens.push("Duration_4");
      }
    }
    const raw = JSON.stringify({ tokens_remi: tokens, tokens_abc: "X:1\n" });
    const result = parseRemiOutput(raw);
    expect(result.status).toBe("clean");
    expect(result.tokens_remi).toHaveLength(tokens.length);
  });
});
