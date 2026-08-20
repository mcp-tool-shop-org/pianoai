import { describe, it, expect } from "vitest";
import {
  isGeneratorFamily,
  eligibleJudges,
  judgeFamilyOf,
  parseOllamaTagNames,
  parseJudgeReply,
  kendallTau,
  comparePanelRankings,
  serializeAllPanelRuns,
  deserializeAllPanelRuns,
  emptyLlmRunRecord,
  rankingChartModel,
  BANNED_PANEL_VOCAB,
  NO_ELIGIBLE_JUDGES_MESSAGE,
  type LlmPanelRunRecord,
} from "./llm-panel.js";
import { interpretPanel, aggregatePanel, type PanelSystem, type BwsVote, type PanelScore } from "./bws.js";
import { emptyRunRecord, deserializePanelRuns, serializePanelRuns } from "./human-audio-panel.js";
import { buildTrialList } from "./human-audio-panel.js";

describe("judge-family exclusion", () => {
  it("pins every qwen2.5* model out of the roster", () => {
    expect(isGeneratorFamily("qwen2.5:7b")).toBe(true);
    expect(isGeneratorFamily("qwen2.5:14b")).toBe(true);
    expect(isGeneratorFamily("qwen2.5-coder:7b")).toBe(true);
    expect(isGeneratorFamily("Qwen2.5:7b")).toBe(true);
    expect(isGeneratorFamily("qwen3:8b")).toBe(false);
    expect(isGeneratorFamily("mistral-small:24b")).toBe(false);
  });

  it("eligibleJudges drops the generator family and keeps one seat per family", () => {
    const seats = eligibleJudges([
      "qwen2.5:7b",
      "mistral-small:24b",
      "mistral:7b",
      "granite4.1:30b",
      "gemma4:31b",
    ]);
    expect(seats.map((s) => s.family).sort()).toEqual(["gemma", "granite", "mistral"]);
    expect(seats.find((s) => s.family === "mistral")?.model).toBe("mistral-small:24b");
    expect(seats.some((s) => isGeneratorFamily(s.model))).toBe(false);
  });

  it("zero eligible is an empty list, not a fallback", () => {
    expect(eligibleJudges(["qwen2.5:7b", "qwen2.5:14b"])).toEqual([]);
    expect(NO_ELIGIBLE_JUDGES_MESSAGE).toMatch(/qwen2\.5 generator family/);
  });

  it("tags family from the model name", () => {
    expect(judgeFamilyOf("hermes3:8b")).toBe("hermes");
    expect(judgeFamilyOf("aya-expanse:32b")).toBe("aya");
  });
});

describe("Ollama tags + wrapper-object judge parse", () => {
  it("reads model names from /api/tags", () => {
    expect(parseOllamaTagNames({ models: [{ name: "mistral-small:24b" }, { name: "qwen2.5:7b" }] })).toEqual([
      "mistral-small:24b",
      "qwen2.5:7b",
    ]);
    expect(parseOllamaTagNames({})).toEqual([]);
  });

  it("parses a bare {best,worst} object and a single wrapper key", () => {
    expect(parseJudgeReply(JSON.stringify({ best: 1, worst: 3 }), 3)).toEqual({ best: 0, worst: 2 });
    expect(parseJudgeReply(JSON.stringify({ vote: { best: 2, worst: 1 } }), 3)).toEqual({ best: 1, worst: 0 });
    expect(parseJudgeReply("nope", 3)).toBeNull();
  });
});

describe("Kendall τ", () => {
  it("is 1 for identical rankings", () => {
    const t = kendallTau(["engine", "refined", "nearest", "floor"], ["engine", "refined", "nearest", "floor"]);
    expect(t.tau).toBe(1);
    expect(t.concordant).toBe(6);
    expect(t.discordant).toBe(0);
    expect(t.n).toBe(4);
  });

  it("is -1 for a full reversal", () => {
    const t = kendallTau(["a", "b", "c"], ["c", "b", "a"]);
    expect(t.tau).toBe(-1);
    expect(t.discordant).toBe(3);
    expect(t.concordant).toBe(0);
  });

  it("counts a single adjacent swap as one discordant pair", () => {
    const t = kendallTau(
      ["engine", "refined", "nearest", "floor"],
      ["engine", "nearest", "refined", "floor"],
    );
    expect(t.concordant).toBe(5);
    expect(t.discordant).toBe(1);
    expect(t.tau).toBeCloseTo(4 / 6, 8);
  });
});

describe("Compare labeling against a PROVISIONAL human run", () => {
  it("names the τ, the engine-rank mismatch, and the provisional hedge", () => {
    const cmp = comparePanelRankings({
      humanRanking: ["refined", "engine", "nearest", "floor"],
      llmRanking: ["engine", "refined", "nearest", "floor"],
      humanProvisional: true,
      humanListenerLabel: "your blind preference",
      llmVotesCollected: 8,
      llmVotesPossible: 12,
    });
    expect(cmp.engineRankMatch).toBe(false);
    expect(cmp.engineRankLlm).toBe(1);
    expect(cmp.engineRankHuman).toBe(2);
    expect(cmp.headline).toMatch(/Kendall τ/);
    expect(cmp.detail).toMatch(/PROVISIONAL/);
    expect(cmp.detail).toMatch(/directional only/);
    expect(cmp.detail).toMatch(/your blind preference/);
    expect(cmp.detail).not.toMatch(BANNED_PANEL_VOCAB);
    expect(cmp.headline).not.toMatch(BANNED_PANEL_VOCAB);
  });

  it("reports an engine-rank match when both put engine in the same slot", () => {
    const cmp = comparePanelRankings({
      humanRanking: ["engine", "refined", "floor"],
      llmRanking: ["engine", "floor", "refined"],
      humanProvisional: false,
      humanListenerLabel: "your blind preference",
      llmVotesCollected: 9,
      llmVotesPossible: 9,
    });
    expect(cmp.engineRankMatch).toBe(true);
    expect(cmp.detail).toMatch(/rank 1 on both sides/);
    expect(cmp.detail).not.toMatch(/PROVISIONAL/);
  });
});

describe("History round-trip with mixed record kinds", () => {
  it("keeps a slice-A human-audio record byte-identical beside an llm record", () => {
    const trials = buildTrialList({ songIds: ["imagine"], systems: ["floor", "nearest", "refined"], seed: 2 });
    const human = emptyRunRecord({
      seed: 2,
      createdAt: "2026-08-19T00:00:00.000Z",
      songIds: ["imagine"],
      systems: ["floor", "nearest", "refined"],
      engineTag: "unavailable",
      engineProbe: { reachable: false },
      trials,
    });
    const llm = emptyLlmRunRecord({
      seed: 9,
      createdAt: "2026-08-19T01:00:00.000Z",
      songIds: ["imagine"],
      systems: ["floor", "nearest", "refined"],
      engineTag: "unavailable",
      engineProbe: { reachable: false },
      judges: [{ model: "mistral-small:24b", family: "mistral", status: "ok" }],
    });
    const json = serializeAllPanelRuns([human, llm]);
    const mixed = deserializeAllPanelRuns(json);
    expect(mixed).toHaveLength(2);
    expect(mixed[0]).toEqual(human);
    expect(mixed[1]).toEqual(llm);
    expect(deserializePanelRuns(serializePanelRuns([human]))).toEqual([human]);
    expect(deserializePanelRuns(json).every((r) => r.kind === "human-audio")).toBe(true);
  });
});

describe("interpretPanel + ranking chart — honesty sweep", () => {
  it("chart places negatives left of zero", () => {
    const scores: PanelScore[] = [
      { id: "a", bwsScore: 0.4, btStrength: 1, best: 2, worst: 0, appearances: 4, ci: [0.1, 0.6] },
      { id: "b", bwsScore: -0.3, btStrength: 1, best: 0, worst: 2, appearances: 4, ci: [-0.5, -0.1] },
    ];
    const bars = rankingChartModel(scores);
    expect(bars[0].negative).toBe(false);
    expect(bars[1].negative).toBe(true);
    expect(bars[1].leftPct).toBeLessThan(bars[1].zeroPct);
    expect(bars[0].leftPct).toBeCloseTo(bars[0].zeroPct, 5);
  });

  it("interpretPanel outputs stay inside the banned-vocab sweep", () => {
    const systems: PanelSystem[] = [
      { id: "A", note: "" }, { id: "B", note: "" }, { id: "C", note: "" }, { id: "D", note: "" },
    ];
    const votes: BwsVote[] = [];
    const ts: string[][] = [];
    for (let i = 0; i < 12; i++) {
      votes.push({ options: [0, 1, 2, 3], best: 0, worst: 3, family: `f${i % 3}` });
      ts.push(["A", "B", "C", "D"]);
    }
    const agg = aggregatePanel(systems, votes, ts, { bootstrap: 80, seed: 1 });
    const pos = interpretPanel(agg, { floor: "D", valid: "A", engine: "A" });
    const inc = interpretPanel(agg, { floor: "D", valid: "A", engine: "C" });
    expect(pos.verdict).not.toMatch(BANNED_PANEL_VOCAB);
    expect(inc.verdict).not.toMatch(BANNED_PANEL_VOCAB);
    expect(pos.verdict).toMatch(/Directional only/);
  });
});

describe("llm run record shape", () => {
  it("emptyLlmRunRecord is kind llm and replay-ready", () => {
    const rec: LlmPanelRunRecord = emptyLlmRunRecord({
      seed: 1,
      createdAt: "t",
      songIds: ["imagine"],
      systems: ["floor", "nearest", "refined"],
      engineTag: "unavailable",
      engineProbe: { reachable: false },
      judges: [],
    });
    expect(rec.kind).toBe("llm");
    expect(rec.votes).toEqual([]);
    expect(rec.bwsVotes).toEqual([]);
  });
});
