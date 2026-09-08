import { describe, it, expect, vi } from "vitest";
import { defineTask, publishedOwner, assertNoStraddle } from "../experiment/index.js";
import { v1Records, coverageV1Task } from "./task.js";
import { rederiveGold, toolSequenceOf } from "./builder.js";
import { coverageReport, assertCoverageFloors } from "./coverage.js";
import { loadPublishableSongs } from "./library.js";
import { COVERAGE_FLOORS, PROMPT_VISIBLE_PATHS, RECORD_ONLY_PATHS, V1_SCHEMA_VERSION } from "./schema.js";

vi.setConfig({ testTimeout: 60_000 });

describe("v1 schema spine", () => {
  it("declares a new schemaVersion and rejects reuse of v0's", () => {
    expect(V1_SCHEMA_VERSION).toBe("jam-actions-v1/1.0.0");
    expect(publishedOwner(V1_SCHEMA_VERSION)).toBe("coverage-v1");
    expect(coverageV1Task.id).toBe("coverage-v1");
    expect(() => assertSchemaSafe()).not.toThrow();
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
});

function assertSchemaSafe(): void {
  expect(coverageV1Task.schemaVersion).not.toBe("jam-actions-acoustic-v0/1.0.0");
}

describe("v1 coverage floors", () => {
  it("meets tools > 10, songs > 20, shapes > 3, no majority shape", () => {
    const records = v1Records();
    const report = coverageReport(records);
    const songs = loadPublishableSongs();
    report.genres = [...new Set(songs.map((s) => s.genre))].sort();
    report.genre_count = report.genres.length;
    expect(report.tool_count).toBeGreaterThan(COVERAGE_FLOORS.tools);
    expect(report.song_count).toBeGreaterThan(COVERAGE_FLOORS.songs);
    expect(report.shape_count).toBeGreaterThan(COVERAGE_FLOORS.shapes);
    expect(report.majority_shape_share).toBeLessThanOrEqual(0.5);
    expect(() => assertCoverageFloors(report)).not.toThrow();
  });
});

describe("prompt-visible fields contain no gates", () => {
  it("user turns and tool results do not mention threshold field names", () => {
    const records = v1Records();
    expect(records.length).toBeGreaterThan(0);
    for (const r of records) {
      const visible = JSON.stringify(r.target_trace);
      expect(visible).not.toMatch(/pitch_fail_cents|pitch_warn_cents|timing_ms|onset_delta/);
      expect(visible).not.toContain('"thresholds"');
      const user = r.target_trace.session.filter((t) => t.role === "user").map((t) => t.content).join("\n");
      if (r.observation.gold.answer.length > 3) {
        expect(user).not.toContain(r.observation.gold.answer);
      }
    }
  });
});

describe("gold re-derived for every record", () => {
  it("agrees with the engine that produced it", () => {
    const records = v1Records();
    for (const r of records) {
      expect(rederiveGold(r), r.id).toBe(r.observation.gold.answer);
    }
  });
});

describe("split", () => {
  it("does not let a splitKey straddle train/test", () => {
    const records = v1Records();
    assertNoStraddle(
      records,
      (c) => coverageV1Task.splitKey(c),
      (c) => c.split,
    );
  });
});

describe("shapes are counted from traces", () => {
  it("has more than one family of tool sequences", () => {
    const records = v1Records();
    const shapes = new Set(records.map(toolSequenceOf));
    expect(shapes.size).toBeGreaterThan(3);
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
    const rows = v1Records();
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
