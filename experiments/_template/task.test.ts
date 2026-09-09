import { describe, it, expect } from "vitest";
import { assertNoStraddle, assertSchemaOwner } from "../../src/dataset/experiment/index.js";
import { RELEASE_LOOKBACK_SEC } from "../../src/audio/ensemble.js";
import { firstStoppedId, TEST_CHORD_KEY, whoFirstTask } from "./task.js";
import { buildAllRecords, splitOf } from "./generate.js";

describe("who-first template", () => {
  it("gold is who stopped first, measured from recentlyReleased, not from sounding: []", () => {
    const records = buildAllRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const r of records) {
      const view = r.observation.view;
      expect(view.instruments.every((i) => i.sounding.length === 0)).toBe(true);
      expect(view.instruments.every((i) => i.recentlyReleased.length > 0)).toBe(true);
      expect(firstStoppedId(view)).toBe(r.observation.gold.verdict);
      expect(r.thresholds.release_lookback_sec).toBe(RELEASE_LOOKBACK_SEC);
      expect(JSON.stringify(r)).not.toMatch(/createTapOutput/);
    }
  });

  it("does not let a chord straddle the split", () => {
    assertNoStraddle(whoFirstTask.cases(), (c) => whoFirstTask.splitKey(c), splitOf);
    const records = buildAllRecords();
    const testKeys = new Set(records.filter((r) => r.split === "test").map((r) => r.id.split("_")[1]));
    expect([...testKeys]).toEqual([TEST_CHORD_KEY]);
  });

  it("does not claim a published schema_version", () => {
    expect(whoFirstTask.schemaVersion).not.toBe("jam-actions-acoustic-v0/1.0.0");
    expect(() => assertSchemaOwner(whoFirstTask)).not.toThrow();
  });
});
