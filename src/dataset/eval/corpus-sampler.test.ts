// ─── Tests for corpus-sampler.ts (Slice 12) ───────────────────────────────────
//
// Validates the pure sampler library. No real network, no I/O.
// Uses synthetic record fixtures + the real public-package record list (loaded
// from disk in the corpus determinism test).

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildSample,
  buildSampleManifest,
  classifyPosition,
  deterministicShuffle,
  parseStartMeasure,
  resolveAllPairs,
  SLICE_11_ENRICHED_RECORD_IDS,
  ANACRUSIS_RECORD_IDS,
  DEFAULT_CONFIG,
  type SamplerConfig,
  type SamplerRecord,
} from "./corpus-sampler.js";

// ─── Fixture helpers ───────────────────────────────────────────────────────────

function makePrompt(
  song: string,
  startBar: number,
  endBar: number,
  targetWindow: [number, number],
): SamplerRecord {
  return {
    id: `${song}:m${String(startBar).padStart(3, "0")}-${String(endBar).padStart(3, "0")}:piano:mcp-session:v1`,
    scope: {
      song_id: song,
      phrase_window: `measures ${startBar}-${endBar}`,
      window_role: "prompt",
      continuation_target_window: targetWindow,
    },
    has_target_trace: true,
  };
}

function makeTarget(
  song: string,
  startBar: number,
  endBar: number,
  pairedPromptId: string,
): SamplerRecord {
  return {
    id: `${song}:m${String(startBar).padStart(3, "0")}-${String(endBar).padStart(3, "0")}:piano:mcp-session:v1`,
    scope: {
      song_id: song,
      phrase_window: `measures ${startBar}-${endBar}`,
      window_role: "continuation_target",
      paired_prompt_record_id: pairedPromptId,
    },
    has_target_trace: true,
  };
}

/**
 * Synthetic mini-corpus of 16 records (8 pairs across 2 songs) that satisfies
 * all stratum buckets for unit-test purposes.
 */
function buildMiniCorpus(): SamplerRecord[] {
  const records: SamplerRecord[] = [];
  const songs = ["bach-prelude-c-major-bwv846", "pathetique-mvt2"];
  for (const song of songs) {
    // 4 prompt+target pairs each: m001 m005 m025 m029
    const startBars: Array<[number, number, number, number]> = [
      [1, 4, 5, 8],
      [5, 8, 9, 12],
      [25, 28, 29, 32],
      [29, 32, 33, 36],
    ];
    for (const [ps, pe, ts, te] of startBars) {
      const prompt = makePrompt(song, ps, pe, [ts, te]);
      records.push(prompt);
      records.push(makeTarget(song, ts, te, prompt.id));
    }
  }
  return records;
}

/**
 * Load the actual 115-record public package — used in determinism tests so
 * the sampler is exercised against the real corpus the runner will use.
 */
function loadPublicCorpus(): SamplerRecord[] {
  const dir = join(process.cwd(), "datasets", "jam-actions-v0-public", "records");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const j = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
      id: string;
      scope: SamplerRecord["scope"];
      target_trace?: unknown;
      annotation_target?: { rhythm_onset?: string };
    };
    return {
      id: j.id,
      scope: j.scope,
      has_target_trace: j.target_trace !== undefined,
      rhythm_onset_not_computable:
        j.annotation_target?.rhythm_onset === "not_computable",
    };
  });
}

// ─── 1. Determinism ────────────────────────────────────────────────────────────

describe("corpus-sampler — determinism", () => {
  it("produces byte-identical output across two calls with same inputs and seed", () => {
    const records = loadPublicCorpus();
    const plan1 = buildSample(records, DEFAULT_CONFIG);
    const plan2 = buildSample(records, DEFAULT_CONFIG);

    // generatedAt is a timestamp and will differ — strip it before comparison.
    const strip = (p: { generatedAt: string }): unknown => ({
      ...p,
      generatedAt: "<STRIPPED>",
    });
    expect(JSON.stringify(strip(plan1))).toBe(JSON.stringify(strip(plan2)));
  });

  it("produces different output for different seeds (sanity check)", () => {
    const records = loadPublicCorpus();
    const planA = buildSample(records, { ...DEFAULT_CONFIG, seed: "seed-A" });
    const planB = buildSample(records, { ...DEFAULT_CONFIG, seed: "seed-B" });
    // The non-required portion of the E1 list should differ between seeds.
    const requiredCount = SLICE_11_ENRICHED_RECORD_IDS.length;
    const restA = planA.e1.recordIds.slice(requiredCount).join(",");
    const restB = planB.e1.recordIds.slice(requiredCount).join(",");
    expect(restA).not.toBe(restB);
  });

  it("deterministicShuffle is stable for the same seed and key function", () => {
    const items = ["alpha", "beta", "gamma", "delta", "epsilon"];
    const shuffled1 = deterministicShuffle(items, "seed-X", (s) => s);
    const shuffled2 = deterministicShuffle(items, "seed-X", (s) => s);
    expect(shuffled1).toEqual(shuffled2);
    // Confirm it actually changes the order vs alphabetical.
    expect(shuffled1).not.toEqual([...items].sort());
  });
});

// ─── 2. Required inclusions ────────────────────────────────────────────────────

describe("corpus-sampler — required inclusions", () => {
  it("includes ALL 6 Slice 11 enriched records in E3 sample", () => {
    const records = loadPublicCorpus();
    const plan = buildSample(records, DEFAULT_CONFIG);
    for (const eid of SLICE_11_ENRICHED_RECORD_IDS) {
      expect(plan.e3.recordIds).toContain(eid);
    }
    expect(plan.e3.enrichedIncluded.length).toBe(SLICE_11_ENRICHED_RECORD_IDS.length);
  });

  it("includes ALL 6 Slice 11 enriched records in E1 sample (each has target_trace)", () => {
    const records = loadPublicCorpus();
    const plan = buildSample(records, DEFAULT_CONFIG);
    for (const eid of SLICE_11_ENRICHED_RECORD_IDS) {
      expect(plan.e1.recordIds).toContain(eid);
    }
  });

  it("includes ALL 4 enriched-record pairs in E2 sample", () => {
    const records = loadPublicCorpus();
    const plan = buildSample(records, DEFAULT_CONFIG);
    // Expected pairs (prompt IDs):
    //  - bach m041-044 -> m045-048 (target enriched)
    //  - bach m049-052 -> m053-056 (both enriched)
    //  - pathetique m025-028 -> m029-032 (both enriched)
    //  - schumann m041-044 -> m045-048 (target enriched)
    const expectedPromptIds = [
      "bach-prelude-c-major-bwv846:m041-044:piano:mcp-session:v1",
      "bach-prelude-c-major-bwv846:m049-052:piano:mcp-session:v1",
      "pathetique-mvt2:m025-028:piano:mcp-session:v1",
      "schumann-traumerei:m041-044:piano:mcp-session:v1",
    ];
    const sampledPromptIds = plan.e2.pairs.map((p) => p.promptId);
    for (const pid of expectedPromptIds) {
      expect(sampledPromptIds).toContain(pid);
    }
    expect(plan.e2.enrichedPairsIncluded.length).toBe(4);
  });

  it("throws when a required record is missing from the input pool", () => {
    const records = loadPublicCorpus().filter(
      (r) => r.id !== "pathetique-mvt2:m025-028:piano:mcp-session:v1",
    );
    expect(() => buildSample(records, DEFAULT_CONFIG)).toThrow(
      /required record.*pathetique-mvt2:m025-028/,
    );
  });
});

// ─── 3. Stratification ─────────────────────────────────────────────────────────

describe("corpus-sampler — stratification", () => {
  it("E1 sample contains at least 2 opening, 2 middle, 1 cadential record", () => {
    const records = loadPublicCorpus();
    const plan = buildSample(records, DEFAULT_CONFIG);
    expect(plan.e1.buckets.opening.length).toBeGreaterThanOrEqual(2);
    expect(plan.e1.buckets.middle.length).toBeGreaterThanOrEqual(2);
    expect(plan.e1.buckets.cadential.length).toBeGreaterThanOrEqual(1);
  });

  it("E3 sample contains at least one Bach texture-repetition record and at least one anacrusis record", () => {
    const records = loadPublicCorpus();
    const plan = buildSample(records, DEFAULT_CONFIG);
    expect(plan.e3.buckets.bachTextureRepetition.length).toBeGreaterThanOrEqual(1);
    expect(plan.e3.buckets.anacrusis.length).toBeGreaterThanOrEqual(1);
    // Anacrusis-required (schumann m045-048) must be present.
    expect(plan.e3.recordIds).toContain(ANACRUSIS_RECORD_IDS[0]);
  });

  it("classifyPosition correctly tags opening, middle, cadential", () => {
    const records = buildMiniCorpus();
    // Build a last-start map manually for the mini-corpus.
    const lastMap = new Map<string, number>();
    for (const r of records) {
      const s = parseStartMeasure(r.scope.phrase_window);
      if (s !== null) {
        const cur = lastMap.get(r.scope.song_id) ?? 0;
        if (s > cur) lastMap.set(r.scope.song_id, s);
      }
    }
    const opening = records.find((r) => r.id.includes(":m001-"));
    const cadential = records.find((r) => r.id.includes(":m033-"));
    const middle = records.find((r) => r.id.includes(":m009-"));
    if (!opening || !cadential || !middle) throw new Error("fixture lookup failed");
    expect(classifyPosition(opening, lastMap)).toBe("opening");
    expect(classifyPosition(cadential, lastMap)).toBe("cadential");
    expect(classifyPosition(middle, lastMap)).toBe("middle");
  });
});

// ─── 4. Sample sizes ───────────────────────────────────────────────────────────

describe("corpus-sampler — sizes", () => {
  it("E1 sample contains exactly 24 records by default", () => {
    const records = loadPublicCorpus();
    const plan = buildSample(records, DEFAULT_CONFIG);
    expect(plan.e1.recordIds.length).toBe(24);
  });

  it("E2 sample contains exactly 12 pairs by default", () => {
    const records = loadPublicCorpus();
    const plan = buildSample(records, DEFAULT_CONFIG);
    expect(plan.e2.pairs.length).toBe(12);
  });

  it("E3 sample contains exactly 24 records by default", () => {
    const records = loadPublicCorpus();
    const plan = buildSample(records, DEFAULT_CONFIG);
    expect(plan.e3.recordIds.length).toBe(24);
  });

  it("E1 sample has no duplicate record IDs", () => {
    const records = loadPublicCorpus();
    const plan = buildSample(records, DEFAULT_CONFIG);
    const set = new Set(plan.e1.recordIds);
    expect(set.size).toBe(plan.e1.recordIds.length);
  });
});

// ─── 5. Edge cases ─────────────────────────────────────────────────────────────

describe("corpus-sampler — edge cases", () => {
  it("handles a candidate pool smaller than target size by reporting diagnostic, not throwing", () => {
    const required: string[] = [];
    const tinyCorpus = buildMiniCorpus(); // 16 records
    const config: SamplerConfig = {
      seed: "test-seed",
      e1Size: 100,
      e2PairSize: 2,
      e3Size: 100,
      requiredRecordIds: required,
    };
    const plan = buildSample(tinyCorpus, config);
    expect(plan.e1.recordIds.length).toBeLessThanOrEqual(16);
    expect(plan.diagnostics.some((d) => d.includes("not reached"))).toBe(true);
  });

  it("resolveAllPairs correctly identifies enriched pairs", () => {
    const records = loadPublicCorpus();
    const pairs = resolveAllPairs(records);
    const enriched = pairs.filter((p) => p.containsEnriched);
    expect(enriched.length).toBe(4);
    // Specifically: the pathetique pair has BOTH halves enriched
    const pathPair = enriched.find((p) =>
      p.promptId.startsWith("pathetique-mvt2:m025"),
    );
    expect(pathPair?.enrichedHalves.length).toBe(2);
    // Bach m041-044 -> m045-048: only target is enriched
    const bachFirst = enriched.find((p) =>
      p.promptId.startsWith("bach-prelude-c-major-bwv846:m041"),
    );
    expect(bachFirst?.enrichedHalves.length).toBe(1);
  });

  it("buildSampleManifest produces a fully-populated serializable manifest", () => {
    const records = loadPublicCorpus();
    const plan = buildSample(records, DEFAULT_CONFIG);
    const manifest = buildSampleManifest(plan, DEFAULT_CONFIG);
    expect(manifest.schema_version).toBe("corpus-scale-sample/1.0.0");
    expect(manifest.seed).toBe("slice12-2026-05-17");
    expect(manifest.e1.record_ids.length).toBe(24);
    expect(manifest.e2.pairs.length).toBe(12);
    expect(manifest.e3.record_ids.length).toBe(24);
    expect(manifest.config.required_records).toEqual([
      ...SLICE_11_ENRICHED_RECORD_IDS,
    ]);
    // Round-trip JSON serialization sanity
    const json = JSON.stringify(manifest);
    const parsed = JSON.parse(json) as { schema_version: string };
    expect(parsed.schema_version).toBe("corpus-scale-sample/1.0.0");
  });
});
