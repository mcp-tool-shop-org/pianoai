import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineTask, publishedOwner, assertNoStraddle } from "../experiment/index.js";
import { v1Records, coverageV1Task } from "./task.js";
import { rederiveGold, toolSequenceOf, f5DropStats } from "./builder.js";
import { F5_PITCH_CLEARANCE_MULTIPLE, F5_ONSET_CLEARANCE_MULTIPLE, F5_THRESHOLDS } from "./f5-acoustic.js";
import { MEASURED_YIN_LOCKED_P95_CENTS, MEASURED_ONSET_ABS_P95_MS } from "./tracker-error.js";
import { coverageReport, assertCoverageFloors } from "./coverage.js";
import { loadPublishableSongs } from "./library.js";
import {
  COVERAGE_FLOORS,
  PROMPT_VISIBLE_PATHS,
  RECORD_ONLY_PATHS,
  V1_SCHEMA_VERSION,
  type V1Record,
} from "./schema.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 300_000 });

// ─── Two kinds of test, two costs ────────────────────────────────────────────
//
// Structural tests — schema, floors, prompt gates, split, provenance — assert
// properties of the corpus that SHIPS, so they read the committed
// records.jsonl. Milliseconds.
//
// Engine tests rebuild the corpus from source and re-run every engine: 81
// acoustic records each render a take and run YIN and onset detection over it.
// 22 s on this rig. Under coverage instrumentation, which counts every branch
// inside those tight DSP loops, the same work measured 200 s for the build and
// 166 s + 110 s for the two verification tests — a 10x penalty that no timeout
// budget survives on a CI runner. So the engine block is skipped when
// SKIP_DSP_VERIFICATION=1, which only the "Test with coverage" step sets, and
// which runs on a job that has ALREADY run this whole file uninstrumented
// seconds earlier. Correctness runs on every push, twice. The coverage leg goes
// back to measuring coverage.
//
// That is a stated trade, not a quiet one: a gate that skips under one flag on
// one leg is written down here and in ci.yml, and it still bites on two legs
// per push.
const RUN_DSP = process.env.SKIP_DSP_VERIFICATION !== "1";

const CORPUS = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..",
  "datasets", "jam-actions-v1",
);

let committedCache: V1Record[] | null = null;
/** The corpus as committed — the artifact that ships, not a rebuild of it. */
function committedRecords(): V1Record[] {
  if (!committedCache) {
    committedCache = readFileSync(join(CORPUS, "records.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as V1Record);
  }
  return committedCache;
}

describe("v1 schema spine", () => {
  it("declares a new schemaVersion and rejects reuse of v0's", () => {
    expect(V1_SCHEMA_VERSION).toBe("jam-actions-v1/1.0.0");
    expect(publishedOwner(V1_SCHEMA_VERSION)).toBe("coverage-v1");
    expect(coverageV1Task.id).toBe("coverage-v1");
    expect(coverageV1Task.schemaVersion).not.toBe("jam-actions-acoustic-v0/1.0.0");
    expect(() =>
      defineTask({
        id: "someone-else",
        schemaVersion: "jam-actions-acoustic-v0/1.0.0",
        verdicts: ["x"],
        thresholds: {},
        cases: () => [],
        splitKey: () => "a",
      }),
    ).toThrow(/published by task "acoustic-sft"/);
  });

  it("keeps prompt-visible and record-only paths distinct", () => {
    expect([...PROMPT_VISIBLE_PATHS]).toEqual(["target_trace"]);
    expect([...RECORD_ONLY_PATHS]).toContain("observation.gold");
    expect([...RECORD_ONLY_PATHS]).toContain("observation.thresholds");
  });

  it("every committed record carries the v1 schema version", () => {
    const records = committedRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const r of records) expect(r.schema_version, r.id).toBe(V1_SCHEMA_VERSION);
  });
});

describe("v1 coverage floors", () => {
  it("meets tools > 13, songs > 24, shapes > 10, no majority shape", () => {
    const report = coverageReport(committedRecords());
    const songs = loadPublishableSongs();
    report.genres = [...new Set(songs.map((s) => s.genre))].sort();
    report.genre_count = report.genres.length;
    expect(COVERAGE_FLOORS.tools).toBe(13);
    expect(COVERAGE_FLOORS.songs).toBe(24);
    expect(COVERAGE_FLOORS.shapes).toBe(10);
    expect(report.tool_count).toBeGreaterThan(COVERAGE_FLOORS.tools);
    expect(report.song_count).toBeGreaterThan(COVERAGE_FLOORS.songs);
    expect(report.shape_count).toBeGreaterThan(COVERAGE_FLOORS.shapes);
    expect(report.majority_shape_share).toBeLessThanOrEqual(0.5);
    expect(() => assertCoverageFloors(report)).not.toThrow();
  });
});

describe("prompt-visible fields contain no gates", () => {
  it("user turns and tool results do not mention threshold field names", () => {
    const records = committedRecords();
    for (const r of records) {
      const visible = JSON.stringify(r.target_trace);
      expect(visible, r.id).not.toMatch(/pitch_fail_cents|pitch_warn_cents|timing_ms|onset_delta/);
      expect(visible, r.id).not.toContain('"thresholds"');
      const user = r.target_trace.session.filter((t) => t.role === "user").map((t) => t.content).join("\n");
      if (r.observation.gold.answer.length > 3) {
        expect(user, r.id).not.toContain(r.observation.gold.answer);
      }
    }
  });
});

describe("gold re-derived for every non-acoustic record", () => {
  // Every family except acoustic re-derives from MIDI, metadata or the
  // ensemble's intent channel — cheap, deterministic, and run on every leg.
  // The acoustic family renders audio and is in the engine block below.
  it("agrees with the engine that produced it", () => {
    const rows = committedRecords().filter((r) => r.family !== "acoustic");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(rederiveGold(r), r.id).toBe(r.observation.gold.answer);
    }
  });
});

describe("split", () => {
  it("does not let a splitKey straddle train/test", () => {
    assertNoStraddle(
      committedRecords(),
      (c) => coverageV1Task.splitKey(c),
      (c) => c.split,
    );
  });
});

describe("shapes are counted from traces", () => {
  it("has more than one family of tool sequences", () => {
    const shapes = new Set(committedRecords().map(toolSequenceOf));
    expect(shapes.size).toBeGreaterThan(3);
  });
});

describe("F1 harmony", () => {
  it("re-derives the gate and populates both classes", () => {
    const rows = committedRecords().filter((r) => r.family === "harmony");
    const pass = rows.filter((r) => r.observation.gold.answer === "verified");
    const fail = rows.filter((r) => r.observation.gold.answer === "rejected");
    expect(pass.length).toBeGreaterThan(3);
    expect(fail.length).toBeGreaterThan(3);
    for (const r of rows) expect(rederiveGold(r), r.id).toBe(r.observation.gold.answer);
  });
});

describe("F5 acoustic — the guard bands", () => {
  it("clears the stated multiple of the measured tracker error", () => {
    expect(committedRecords().some((r) => r.family === "acoustic")).toBe(true);
    expect(F5_THRESHOLDS.pitch_clearance_multiple).toBeCloseTo(F5_PITCH_CLEARANCE_MULTIPLE, 1);
    expect(F5_THRESHOLDS.onset_clearance_multiple).toBeCloseTo(F5_ONSET_CLEARANCE_MULTIPLE, 1);
    expect(F5_THRESHOLDS.pitch_clearance_cents).toBeGreaterThan(
      MEASURED_YIN_LOCKED_P95_CENTS * (F5_THRESHOLDS.pitch_clearance_multiple as number) * 0.99,
    );
    expect(F5_THRESHOLDS.onset_clearance_ms).toBeGreaterThan(
      MEASURED_ONSET_ABS_P95_MS * (F5_THRESHOLDS.onset_clearance_multiple as number) * 0.99,
    );
  });

  it("exposes no gate in any acoustic prompt", () => {
    for (const r of committedRecords().filter((r) => r.family === "acoustic")) {
      expect(JSON.stringify(r.target_trace), r.id).not.toMatch(/pitch_fail_cents|timing_ms/);
    }
  });
});

describe("F6 ensemble", () => {
  it("serialises no createTapOutput and no live-graph types", () => {
    const rows = committedRecords().filter((r) => r.family === "ensemble");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const blob = JSON.stringify(r);
      expect(blob, r.id).not.toMatch(/createTapOutput|AudioContext|ScriptProcessor|GainNode|tapBus/);
      expect(rederiveGold(r), r.id).toBe(r.observation.gold.answer);
    }
  });
});

// ─── Provenance exclusions are enforced, not documented ──────────────────────
//
// The first build of this corpus carried 7 records each of Satie's Gymnopédie
// No. 1 and Debussy's Arabesque No. 1 into a tree its own note calls the
// publishable subset. Both had already been excluded from the published
// jam-actions-v0 subset because their arrangement provenance could not be
// verified in the Slice 2.5 audit. The note said the right thing; the code had
// one id in its exclusion list.
//
// Deleting the exclusions left every other test in this file green, which is
// why this one exists. A provenance rule with no test is a comment.
describe("publishable tree excludes what the provenance audit rejected", () => {
  const EXCLUDED = [
    "clair-de-lune",           // jam-actions-v0 fine-tune holdout
    "satie-gymnopedie-no1",    // arrangement provenance unverified
    "debussy-arabesque-no1",   // same audit, same finding
  ] as const;

  it("names all three in FORBIDDEN_IDS, so the list cannot quietly shrink", () => {
    for (const id of EXCLUDED) {
      expect(loadPublishableSongs().some((s) => s.id === id), id).toBe(false);
    }
  });

  it("has no record touching an excluded work, composite ids included", () => {
    const rows = committedRecords();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const sid = r.scope?.song_id ?? "";
      for (const id of EXCLUDED) {
        // Compare records use a composite "songA|songB" id, so substring is
        // the right check here rather than equality.
        expect(sid.includes(id), `${r.id} references ${id}`).toBe(false);
      }
    }
  });
});

// ─── The engine block ────────────────────────────────────────────────────────
//
// Rebuild everything from source and hold it against what is committed. This is
// the reproduction gate and the acoustic half of rule 2 in one pass: if the
// generator no longer produces the committed corpus, or an acoustic label no
// longer agrees with what YIN and the onset detector measure, it fails here.
describe.runIf(RUN_DSP)("engine verification (skipped under SKIP_DSP_VERIFICATION=1)", () => {
  let built: V1Record[] = [];

  beforeAll(() => {
    built = v1Records();
  });

  it("rebuilds the committed corpus exactly", () => {
    const committed = committedRecords();
    expect(built.length).toBe(committed.length);
    const byId = new Map(committed.map((r) => [r.id, r]));
    for (const b of built) {
      expect(byId.get(b.id), b.id).toEqual(b);
    }
  });

  it("dropped no take as untrackable, and would have counted it if it had", () => {
    expect(f5DropStats.attempted).toBeGreaterThan(0);
    expect(f5DropStats.droppedUntrackable).toBe(0);
    // The counter is live: sweeping NOTE_GAP to 0.15 s drops 42 of 81. See
    // docs/findings/v1-f5-untrackable-gate-proved.md.
  });

  it("re-derives every acoustic label from a fresh render and track", () => {
    const rows = committedRecords().filter((r) => r.family === "acoustic");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(rederiveGold(r), r.id).toBe(r.observation.gold.answer);
    }
  });
});
