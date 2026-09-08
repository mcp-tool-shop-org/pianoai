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
  it("meets tools > 9, songs > 24, shapes > 7, no majority shape", () => {
    const report = coverageReport(committedRecords());
    const songs = loadPublishableSongs();
    report.genres = [...new Set(songs.map((s) => s.genre))].sort();
    report.genre_count = report.genres.length;
    expect(COVERAGE_FLOORS.tools).toBe(9);
    expect(COVERAGE_FLOORS.songs).toBe(24);
    expect(COVERAGE_FLOORS.shapes).toBe(7);
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

// ─── Gold must vary within a family ──────────────────────────────────────────
//
// Found by the first fine-tune on this corpus, not by any test. Every sections
// record is "0:none" (no song on the publishable shelf has sections) and every
// compare record is "different_key" (every pair happens to differ). A model that
// always emits the constant scores 100% on both, so the majority-class baseline
// IS the ceiling and the family measures nothing. Both passed the coverage
// floors, because they add tools and shapes, and both passed the tool-less
// baseline, because pretraining cannot guess a convention -- which is not the
// same as the question needing a tool. 40 of 305 records, 13 of the held-out
// 100, measure nothing.
//
// The two known cases are named here so the list can only change on purpose.
// Fixing the corpus shrinks it; a new degenerate family grows it; either fails
// this test until someone edits it with intent.
//
// 2026-09-08 this assertion failed. It found three more constant-gold
// families than it was told to name:
//   teaching_cues  every answer is "0"     — the shelf has no teaching cues
//   teaching_note  every answer is "(none)" — same gap
//   server         one train-only record whose answer is "54"
// After the repair, the named list is empty: every remaining family varies.
// The predicate (size < 2, exact equality) is unchanged. Do not put names
// back to make a constant family pass.
describe("gold varies within every scored family", () => {
  const KNOWN_DEGENERATE = [] as const;

  it("names exactly the known constant-gold families, no more and no fewer", () => {
    const byFamily = new Map<string, Set<string>>();
    for (const r of committedRecords()) {
      if (!byFamily.has(r.family)) byFamily.set(r.family, new Set());
      byFamily.get(r.family)!.add(r.observation.gold.answer);
    }
    const degenerate = [...byFamily]
      .filter(([, answers]) => answers.size < 2)
      .map(([f]) => f)
      .sort();
    expect(degenerate).toEqual([...KNOWN_DEGENERATE]);
  });

  it("has at least two gold values in train and in test separately", () => {
    for (const side of ["train", "test"] as const) {
      const byFamily = new Map<string, Set<string>>();
      for (const r of committedRecords().filter((x) => x.split === side)) {
        if (!byFamily.has(r.family)) byFamily.set(r.family, new Set());
        byFamily.get(r.family)!.add(r.observation.gold.answer);
      }
      for (const [family, answers] of byFamily) {
        expect(answers.size, `${family} ${side}`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe("teaching gold is musicalLanguage, not measure-level empty fields", () => {
  it("re-derives teaching_goals and key_moments from musicalLanguage", () => {
    const songs = loadPublishableSongs();
    const byId = new Map(songs.map((s) => [s.id, s]));
    for (const r of committedRecords().filter((x) => x.family === "teaching_goals" || x.family === "key_moments")) {
      const song = byId.get(r.scope.song_id);
      expect(song, r.id).toBeDefined();
      expect(rederiveGold(r), r.id).toBe(r.observation.gold.answer);
      expect(r.observation.gold.engine).toMatch(/musicalLanguage/);
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

  // Numbers are compared with a tolerance; everything else exactly.
  //
  // Measured 2026-09-08: rebuilding on Node 24 differs from the committed
  // corpus on 3 of 305 records, all in one field -- the YIN cents inside the
  // acoustic tool-result turn -- by 3.8e-13 cents. That is V8's Math.pow and
  // Math.sin changing in the last place between majors, the same class as
  // v0's wav_sha256 finding, and thirteen orders of magnitude under the
  // 5-cent guard band. A byte-exact comparison would fail every engine except
  // the one that generated the corpus and prove nothing about the generator.
  // 1e-6 is six orders under the tracker's own 0.179 c p95 and seven above the
  // observed noise; any real semantic change is far beyond it.
  const NUMERIC_TOLERANCE = 1e-6;
  function expectCloseDeep(a: unknown, b: unknown, path: string): void {
    if (typeof a === "number" && typeof b === "number") {
      expect(Math.abs(a - b), path).toBeLessThanOrEqual(NUMERIC_TOLERANCE);
      return;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      expect(Array.isArray(a) && Array.isArray(b), path).toBe(true);
      expect((a as unknown[]).length, path).toBe((b as unknown[]).length);
      (a as unknown[]).forEach((x, i) => expectCloseDeep(x, (b as unknown[])[i], `${path}[${i}]`));
      return;
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
      const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
      expect(ka, path).toEqual(kb);
      for (const k of ka) expectCloseDeep((a as any)[k], (b as any)[k], `${path}.${k}`);
      return;
    }
    expect(a, path).toBe(b);
  }

  it("rebuilds the committed corpus, exactly except for last-place float noise", () => {
    const committed = committedRecords();
    expect(built.length).toBe(committed.length);
    const byId = new Map(committed.map((r) => [r.id, r]));
    for (const b of built) {
      const c = byId.get(b.id);
      expect(c, b.id).toBeDefined();
      expectCloseDeep(c, b, b.id);
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
