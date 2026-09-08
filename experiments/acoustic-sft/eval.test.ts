import { describe, it, expect } from "vitest";
import { evaluateAcousticSplit, type PredLine } from "./eval.js";
import { buildAllRecords } from "../../src/dataset/acoustic/generate-corpus.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// buildAllRecords() renders 108 takes and runs the real pitch and onset code over
// each one. Measured at 1407 ms on the rig; under CI's coverage instrumentation on
// the slower matrix cell that overran vitest's 5 s default and failed Node 22 while
// Node 24 passed. The work is real, not hung, so it gets an explicit budget rather
// than a smaller corpus — same call as the spawned-CLI help test.
const BUILD_BUDGET_MS = 30_000;

describe("evaluateAcousticSplit", () => {
  it("warns an aggregate LoRA number without a base-model number is unfalsifiable", () => {
    const records = buildAllRecords().filter((r) => r.split === "test");
    const dir = join(tmpdir(), "acoustic-eval-test");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "records.jsonl");
    writeFileSync(path, records.map((r) => JSON.stringify(r)).join("\n") + "\n");

    const perfect: PredLine[] = records.map((r) => ({
      id: r.id,
      verdict: r.observation.gold.verdict,
    }));
    const withLora = evaluateAcousticSplit({ recordsPath: path, loraPredictions: perfect });
    expect(withLora.lora_overall).toBe(1);
    expect(withLora.base_model_overall).toBeNull();
    expect(withLora.note).toMatch(/unfalsifiable/i);
    expect(withLora.per_kind.every((k) => k.n === 4)).toBe(true);

    const withBoth = evaluateAcousticSplit({
      recordsPath: path,
      loraPredictions: perfect,
      basePredictions: records.map((r) => ({ id: r.id, verdict: "match" })),
    });
    expect(withBoth.base_model_overall).toBeGreaterThanOrEqual(0);
    expect(withBoth.base_model_overall).toBeLessThan(1);
  }, BUILD_BUDGET_MS);
});
