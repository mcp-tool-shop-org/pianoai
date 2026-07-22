// ─── Tests: the auto_reharmonize tool core ───────────────────────────────────
//
// Exercises reharmonizeSongSection with a STUB ChordProposer (no live model), so
// the tool's whole non-Ollama surface is deterministic: range parsing, item
// building, the verified/not-verified outcomes, telemetry, and the structured
// errors. The Ollama-optional probe + proposer construction live in the server
// handler and are covered over MCP-stdio (mcp-server.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { reharmonizeSongSection, parseSectionRange } from "./auto-reharmonize-tool.js";
import type { ChordProposer, ChordChoice } from "./reharmonize.js";
import type { SongEntry } from "../songs/types.js";

function mkSong(measures: Array<{ number: number; rightHand: string; leftHand: string }>): SongEntry {
  return {
    id: "test-song", title: "Test Song", genre: "jazz", difficulty: "intermediate",
    key: "A minor", tempo: 120, timeSignature: "4/4", durationSeconds: 10,
    musicalLanguage: { description: "d", structure: "ABA", keyMoments: ["k"], teachingGoals: ["t"], styleTips: ["s"] },
    measures: measures.map((m) => ({ number: m.number, rightHand: m.rightHand, leftHand: m.leftHand })),
    tags: [],
  };
}

/** A ChordProposer that always returns the same canned chords. */
class StubProposer implements ChordProposer {
  constructor(private readonly chords: ChordChoice[]) {}
  async proposeChords(): Promise<ChordChoice[]> {
    return this.chords;
  }
}

const AM3 = mkSong([
  { number: 1, rightHand: "A4:q C5:q E5:q", leftHand: "A2 C3 E3" },
  { number: 2, rightHand: "A4:q C5:q E5:q", leftHand: "A2 C3 E3" },
  { number: 3, rightHand: "A4:q C5:q E5:q", leftHand: "A2 C3 E3" },
]);
const GOOD: ChordChoice[] = [
  { measure: 1, intendedChord: "Fmaj7" },
  { measure: 2, intendedChord: "Dm7" },
  { measure: 3, intendedChord: "E7" },
];
const TRIVIAL: ChordChoice[] = [
  { measure: 1, intendedChord: "Am" },
  { measure: 2, intendedChord: "Am" },
  { measure: 3, intendedChord: "Am" },
];

describe("parseSectionRange", () => {
  it("defaults to measures 1-8", () => {
    expect(parseSectionRange()).toEqual({ start: 1, bars: 8 });
    expect(parseSectionRange("")).toEqual({ start: 1, bars: 8 });
  });
  it("parses a start-end range", () => {
    expect(parseSectionRange("3-10")).toEqual({ start: 3, bars: 8 });
  });
  it("parses a single measure", () => {
    expect(parseSectionRange("5")).toEqual({ start: 5, bars: 1 });
  });
  it("rejects a reversed range", () => {
    expect(parseSectionRange("8-1")).toHaveProperty("error");
  });
  it("rejects a non-numeric range", () => {
    expect(parseSectionRange("a-b")).toHaveProperty("error");
  });
  it("rejects a zero / negative start (1-based)", () => {
    expect(parseSectionRange("0-4")).toHaveProperty("error");
  });
});

describe("reharmonizeSongSection", () => {
  it("returns a verified reharmonization + telemetry for good chords", async () => {
    const r = await reharmonizeSongSection(AM3, { measures: "1-3", maxSamples: 4, proposer: new StubProposer(GOOD) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.verified).toBe(true);
    expect(r.payload.reharmonization.map((m) => m.intendedChord)).toEqual(["Fmaj7", "Dm7", "E7"]);
    // Every voicing was rendered deterministically → confirmed by the chord engine.
    expect(r.payload.telemetry.chordFidelity).toBe("3/3");
    expect(r.payload.telemetry.passedAtSample).toBe(1);
    expect(r.payload.telemetry.maxSamples).toBe(4);
    expect(r.payload.telemetry.changedFraction).toBe(1); // Am → Fmaj7/Dm7/E7, all changed
    expect(r.text).toContain("✅ VERIFIED");
    expect(r.text).toContain("```json");
  });

  it("does not verify a copy-the-original proposer (best fallback, verified false)", async () => {
    const r = await reharmonizeSongSection(AM3, { measures: "1-3", maxSamples: 4, proposer: new StubProposer(TRIVIAL) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.verified).toBe(false); // fidelity holds but non-triviality bites
    expect(r.text).toContain("not verified");
  });

  it("defaults to measures 1-8 when no range is given", async () => {
    const r = await reharmonizeSongSection(AM3, { maxSamples: 2, proposer: new StubProposer(GOOD) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.measureRange).toEqual([1, 3]); // only 3 measures exist
  });

  it("returns a structured error when the section has no melody", async () => {
    const empty = mkSong([{ number: 1, rightHand: "R", leftHand: "A2 C3 E3" }]);
    const r = await reharmonizeSongSection(empty, { measures: "1-1", proposer: new StubProposer(GOOD) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("no_melody_in_section");
    expect(r.hint).toBeTruthy();
  });

  it("returns a structured error on a bad measure range", async () => {
    const r = await reharmonizeSongSection(AM3, { measures: "8-1", proposer: new StubProposer(GOOD) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("bad_measure_range");
  });
});
