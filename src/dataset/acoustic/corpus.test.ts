import { describe, it, expect, vi } from "vitest";
import { PERTURBATION_KINDS } from "./schema.js";
import { smallestSeedForIndex } from "./builder.js";
import { PHRASE_SPECS, TEST_SONG_ID, TRAIN_SONG_IDS } from "./phrases.js";
import { buildAllRecords, targetIndexSeeds } from "./generate-corpus.js";
import { toSftLine } from "../../../experiments/acoustic-sft/format-sft.js";
import { trivialBaselines } from "../../../experiments/acoustic-sft/eval.js";

// Every test here synthesises audio and runs the real pitch and onset code over it.
// That is the point of the suite, and it is not fast: the 108-record corpus measures
// 1407 ms on the rig, and CI coverage instrumentation on the slower matrix cell pushed
// two of these past vitest's 5 s default while the faster cell passed the same commit.
// One budget for the whole file, so the next slow case here does not have to be found
// by a red build the way the first two were.
vi.setConfig({ testTimeout: 30_000 });


describe("4-note reductions", () => {
  it("loads three distinct library phrases and never clair-de-lune", () => {
    expect(PHRASE_SPECS).toHaveLength(3);
    const ids = PHRASE_SPECS.map((p) => p.song_id);
    expect(ids).toContain("bach-prelude-c-major-bwv846");
    expect(ids).toContain("schumann-traumerei");
    expect(ids).toContain("fur-elise");
    expect(ids).not.toContain("clair-de-lune");
    for (const p of PHRASE_SPECS) {
      expect(p.notes).toHaveLength(4);
    }
    const signatures = PHRASE_SPECS.map((p) => p.notes.map((n) => n.midi).join("-"));
    expect(new Set(signatures).size).toBe(3);
  });
});

describe("target-index seeds", () => {
  it("are the smallest seeds that hit indexes 0-3", () => {
    const seeds = targetIndexSeeds(4);
    expect(seeds).toHaveLength(4);
    expect(new Set(seeds).size).toBe(4);
    seeds.forEach((seed, i) => {
      expect(smallestSeedForIndex(i, 4)).toBe(seed);
    });
  });
});

describe("108-record phrase split", () => {
  it("is 36 per phrase, train 72 / test 36, held out by phrase", () => {
    const records = buildAllRecords();
    expect(records).toHaveLength(108);
    expect(records.filter((r) => r.split === "train")).toHaveLength(72);
    expect(records.filter((r) => r.split === "test")).toHaveLength(36);
    expect(records.every((r) => r.scope.song_id !== "clair-de-lune")).toBe(true);
    expect(records.filter((r) => r.split === "test").every((r) => r.scope.song_id === TEST_SONG_ID)).toBe(true);
    expect(
      records.filter((r) => r.split === "train").every((r) =>
        (TRAIN_SONG_IDS as readonly string[]).includes(r.scope.song_id),
      ),
    ).toBe(true);
    for (const phrase of PHRASE_SPECS) {
      const n = records.filter((r) => r.scope.song_id === phrase.song_id);
      expect(n).toHaveLength(36);
      expect(n.filter((r) => r.observation.perturbation.kind === "silence")).toHaveLength(4);
    }
    expect(PERTURBATION_KINDS).toHaveLength(9);
  });
});

describe("SFT formatter holdout", () => {
  it("does not put the test phrase into train messages", () => {
    const records = buildAllRecords();
    const train = records.filter((r) => r.split === "train").map(toSftLine);
    expect(train).toHaveLength(72);
    expect(train.every((l) => l.song_id !== TEST_SONG_ID)).toBe(true);
    expect(train.every((l) => l.messages[0]?.role === "system")).toBe(true);
  });
});

describe("eval baselines", () => {
  it("uniform is 1/9 and majority equals uniform on this balanced gold", () => {
    const records = buildAllRecords().filter((r) => r.split === "test");
    const b = trivialBaselines(records);
    expect(b.uniform).toBeCloseTo(1 / 9, 10);
    expect(b.majority).toBeCloseTo(1 / 9, 10);
  });
});
