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
//
// The committed snapshot stays at 108 songs. After the history purge a checkout
// only has MIDI for 14 of them; this file compares the snapshot over the songs
// present on disk and still requires those 14 to match.
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

/** Songs whose MIDI stays in the tree after the non-free purge. */
const PURGE_KEPT_IDS = [
  "bach-prelude-c-major-bwv846",
  "fur-elise",
  "mozart-k545-mvt1",
  "clair-de-lune",
  "satie-gymnopedie-no1",
  "debussy-arabesque-no1",
  "bethena",
  "elite-syncopations",
  "maple-leaf-rag",
  "peacherine-rag",
  "pineapple-rag",
  "solace",
  "the-easy-winners",
  "the-entertainer",
] as const;

interface Snapshot {
  schemaVersion: string;
  songCount: number;
  measureCount: number;
  lines: string[];
}

describe("inferChord library regression (Gate 2)", () => {
  let actual: string[];
  let snapshot: Snapshot;
  let presentIds: Set<string>;

  beforeAll(() => {
    initializeFromLibrary(LIBRARY_DIR);
    presentIds = new Set(getAllSongs().map((s) => s.id));
    actual = buildImpliedChordLines(getAllSongs());
    snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as Snapshot;
  });

  it("the committed snapshot still covers 108 songs", () => {
    expect(snapshot.songCount).toBe(108);
    expect(snapshot.lines.length).toBe(snapshot.measureCount);
  });

  it("at least the 14 songs that keep their MIDI are present and loaded", () => {
    expect(getAllSongs().length).toBeGreaterThanOrEqual(14);
    for (const id of PURGE_KEPT_IDS) {
      expect(presentIds.has(id), `${id} must be on disk and loaded`).toBe(true);
    }
  });

  it("every present song's impliedChord matches the committed snapshot", () => {
    // Report shifts as `<song> m<n> [<lh>]: <old> → <new>` rather than a raw
    // array diff over ~2000 lines, so an intended engine change is adjudicable
    // at a glance.
    const splitLabel = (line: string) => {
      const i = line.lastIndexOf("\t");
      return [line.slice(0, i), line.slice(i + 1)] as const;
    };
    const songIdOf = (line: string) => line.slice(0, line.indexOf("\t"));
    const exp = new Map(
      snapshot.lines.filter((line) => presentIds.has(songIdOf(line))).map(splitLabel),
    );
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
