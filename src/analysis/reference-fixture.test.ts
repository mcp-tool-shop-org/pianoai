// Guards the committed analysis reference fixture: every annotated chord must
// parse in the analyzer's vocabulary, and each section's changes must be a
// monotonic, non-overlapping, contiguous beat timeline. A broken fixture would
// silently corrupt the validation numbers, so this fails CI instead.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseChordLabel } from "./symbols.js";

const FIXTURE = fileURLToPath(new URL("../../experiments/analysis-arc/reference-changes.json", import.meta.url));

interface RefChange { startBeat: number; endBeat: number; chord: string }
interface RefSection { songId: string; label: string; measureRange: [number, number]; changes: RefChange[] }
interface Fixture { schemaVersion: string; sections: RefSection[] }

describe("analysis reference fixture", () => {
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;

  it("has sections", () => {
    expect(fixture.sections.length).toBeGreaterThanOrEqual(6);
  });

  it("every annotated chord parses in the analyzer vocabulary", () => {
    for (const section of fixture.sections) {
      for (const c of section.changes) {
        expect(parseChordLabel(c.chord), `${section.songId}: "${c.chord}"`).not.toBeNull();
      }
    }
  });

  it("each section's changes form a contiguous, non-overlapping timeline from beat 0", () => {
    for (const section of fixture.sections) {
      let cursor = 0;
      for (const c of section.changes) {
        expect(c.startBeat, `${section.songId} start`).toBe(cursor);
        expect(c.endBeat, `${section.songId} end`).toBeGreaterThan(c.startBeat);
        cursor = c.endBeat;
      }
      expect(cursor, `${section.songId} total beats`).toBeGreaterThan(0);
    }
  });
});
