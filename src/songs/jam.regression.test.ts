// ─── Gate 2: library-wide inferChord regression ──────────────────────────────
//
// `inferChord` is a library-wide engine — its labels feed jam briefs, the E-R
// source-harmony baseline (the non-triviality guard), and the fidelity detector.
// A change to its tie-break (e.g. the bass-aware disambiguation) can shift
// EXISTING impliedChord labels, especially for inversions. This test pins every
// measure's label to a committed snapshot so any shift is FORCED to surface and
// be adjudicated (a more-correct inversion label, or a genuine regression?).
//
// After an INTENDED engine change, regenerate the fixture with
//   pnpm exec tsx scripts/implied-chord-snapshot.ts
// then read the `git diff` on experiments/maker-arc/implied-chord-snapshot.json
// and record the adjudication in the change's report before committing.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initializeFromLibrary } from "./library.js";
import { getAllSongs } from "./registry.js";
import { buildImpliedChordLines } from "./implied-chord-snapshot.js";

const LIBRARY_DIR = fileURLToPath(new URL("../../songs/library", import.meta.url));
const SNAPSHOT_PATH = fileURLToPath(
  new URL("../../experiments/maker-arc/implied-chord-snapshot.json", import.meta.url),
);

interface Snapshot {
  schemaVersion: string;
  songCount: number;
  measureCount: number;
  lines: string[];
}

describe("inferChord library regression (Gate 2)", () => {
  let actual: string[];
  let snapshot: Snapshot;

  beforeAll(() => {
    initializeFromLibrary(LIBRARY_DIR);
    actual = buildImpliedChordLines(getAllSongs());
    snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as Snapshot;
  });

  it("loads the real ready library (sanity — not an empty registry)", () => {
    expect(getAllSongs().length).toBeGreaterThan(50);
  });

  it("song and measure counts match the committed snapshot", () => {
    expect(actual.length).toBe(snapshot.measureCount);
  });

  it("every measure's impliedChord matches the committed snapshot", () => {
    // Report shifts as `<song> m<n> [<lh>]: <old> → <new>` rather than a raw
    // array diff over ~2000 lines, so an intended engine change is adjudicable
    // at a glance.
    const splitLabel = (line: string) => {
      const i = line.lastIndexOf("\t");
      return [line.slice(0, i), line.slice(i + 1)] as const;
    };
    const exp = new Map(snapshot.lines.map(splitLabel));
    const act = new Map(actual.map(splitLabel));

    const shifts: string[] = [];
    for (const [key, label] of act) {
      const before = exp.get(key);
      if (before !== undefined && before !== label) {
        shifts.push(`${key.replace(/\t/g, " ")}: ${before} → ${label}`);
      }
    }
    const added = [...act.keys()].filter((k) => !exp.has(k)).map((k) => k.replace(/\t/g, " "));
    const removed = [...exp.keys()].filter((k) => !act.has(k)).map((k) => k.replace(/\t/g, " "));

    expect(shifts, `impliedChord label shifts (adjudicate each):\n${shifts.join("\n")}`).toEqual([]);
    expect(added, `measures present now but absent from the snapshot:\n${added.join("\n")}`).toEqual([]);
    expect(removed, `measures in the snapshot but absent now:\n${removed.join("\n")}`).toEqual([]);
  });
});
