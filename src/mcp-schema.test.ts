import { describe, it, expect } from "vitest";
import { zDifficulty, zGenre, zMeasure, zMidiNotes, zSongId } from "./mcp-schema.js";

function issue(schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: Array<{ message: string }> } } }, value: unknown): string {
  const r = schema.safeParse(value);
  expect(r.success).toBe(false);
  return r.error!.issues.map((i) => i.message).join(" | ");
}

describe("mcp-schema — P9-001 descriptive Zod messages", () => {
  it("zSongId names the field shape and points at list_songs when missing or the wrong type", () => {
    expect(issue(zSongId(), undefined)).toMatch(/list_songs/);
    expect(issue(zSongId(), 123)).toMatch(/fur-elise/);
    expect(zSongId().safeParse("fur-elise").success).toBe(true);
  });

  it("zGenre lists the allowed values instead of a bare invalid_type", () => {
    expect(issue(zGenre(), 123)).toMatch(/classical/);
    expect(issue(zGenre(), "banana")).toMatch(/jazz/);
    expect(zGenre().safeParse("classical").success).toBe(true);
  });

  it("zDifficulty lists beginner/intermediate/advanced", () => {
    expect(issue(zDifficulty(), "expert")).toMatch(/beginner/);
    expect(zDifficulty().safeParse("intermediate").success).toBe(true);
  });

  it("zMidiNotes asks for an array like [60, 64, 67] when given a string", () => {
    expect(issue(zMidiNotes(), "not-an-array")).toMatch(/\[60, 64, 67\]/);
    expect(zMidiNotes().safeParse([60, 64, 67]).success).toBe(true);
  });

  it("zMeasure rejects a non-number with a 1-based example", () => {
    expect(issue(zMeasure(), "first")).toMatch(/1-based/);
    expect(zMeasure().safeParse(1).success).toBe(true);
  });
});
