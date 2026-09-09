import { describe, it, expect } from "vitest";
import { mcpStructuredError } from "./mcp-error.js";

describe("mcpStructuredError — P9-002 envelope", () => {
  it("puts code, message, and hint in the JSON error object and flags isError", () => {
    const r = mcpStructuredError(
      "bad_reharmonization",
      "Couldn't parse reharmonization: not valid JSON",
      'Pass a JSON array: [{"measure": 1, "intendedChord": "Am7", "voicing": "A2 C3 E3 G3"}]',
    );
    expect(r.isError).toBe(true);
    const text = r.content[0].text;
    expect(text).toContain("❌");
    const parsed = JSON.parse(text.slice(text.indexOf("{")));
    expect(parsed.error).toEqual({
      code: "bad_reharmonization",
      message: "Couldn't parse reharmonization: not valid JSON",
      hint: 'Pass a JSON array: [{"measure": 1, "intendedChord": "Am7", "voicing": "A2 C3 E3 G3"}]',
    });
  });
});
