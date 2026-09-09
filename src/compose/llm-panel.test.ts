import { describe, it, expect } from "vitest";
import {
  isGeneratorFamily,
  isEmbeddingModel,
  isCloudTag,
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
  CHART_BAR_MIN_PX,
  BANNED_PANEL_VOCAB,
  NO_ELIGIBLE_JUDGES_MESSAGE,
  type LlmPanelRunRecord,
} from "./llm-panel.js";
import { interpretPanel, aggregatePanel, type PanelSystem, type BwsVote, type PanelScore } from "./bws.js";
import { emptyRunRecord, deserializePanelRuns, serializePanelRuns } from "./human-audio-panel.js";
import { buildTrialList } from "./human-audio-panel.js";

describe("judge-family exclusion", () => {
  it("pins the whole qwen lineage out of the roster (the external-verifier rule)", () => {
    expect(isGeneratorFamily("qwen2.5:7b")).toBe(true);
    expect(isGeneratorFamily("qwen2.5:14b")).toBe(true);
    expect(isGeneratorFamily("qwen2.5-coder:7b")).toBe(true);
    expect(isGeneratorFamily("Qwen2.5:7b")).toBe(true);
    expect(isGeneratorFamily("jam-ft-b2-qwen25:seed42")).toBe(true);
    // The generator is qwen2.5 — the judge must be a DIFFERENT family, and
    // qwen3 is the same lineage. Widened by the Advisor over the slice-B
    // brief's literal "qwen2.5 only" wording.
    expect(isGeneratorFamily("qwen3:8b")).toBe(true);
    expect(isGeneratorFamily("qwen3.6:27b")).toBe(true);
    expect(isGeneratorFamily("qwen3-coder:480b-cloud")).toBe(true);
    expect(isGeneratorFamily("mistral-small:24b")).toBe(false);
  });

  it("embedding models and cloud tags never hold a seat", () => {
    expect(isEmbeddingModel("nomic-embed-text:latest")).toBe(true);
    expect(isEmbeddingModel("granite-embedding:30m")).toBe(true);
    expect(isEmbeddingModel("mistral-small:24b")).toBe(false);
    expect(isCloudTag("gemini-3-flash-preview:cloud")).toBe(true);
    expect(isCloudTag("gpt-oss:20b-cloud")).toBe(true);
    expect(isCloudTag("deepseek-v3.1:671b-cloud")).toBe(true);
    expect(isCloudTag("hermes3:8b")).toBe(false);
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

  it("this rig's live tag list seats exactly the local chat families", () => {
    const seats = eligibleJudges([
      "gemma4:31b",
      "hermes3:8b",
      "granite4.1:30b",
      "mistral-small:24b",
      "gemini-3-flash-preview:cloud",
      "kimi-k2.6:cloud",
      "minimax-m3:cloud",
      "gpt-oss:20b-cloud",
      "qwen3-coder:480b-cloud",
      "nomic-embed-text:latest",
      "deepseek-v3.1:671b-cloud",
      "glm-4.6:cloud",
      "aya-expanse:32b",
      "qwen2.5:7b",
      "jam-ft-b2-qwen25:seed42",
    ]);
    expect(seats.map((s) => s.model)).toEqual([
      "gemma4:31b",
      "hermes3:8b",
      "granite4.1:30b",
      "mistral-small:24b",
      "aya-expanse:32b",
    ]);
  });

  it("zero eligible is an empty list, not a fallback", () => {
    expect(eligibleJudges(["qwen2.5:7b", "qwen3:8b", "nomic-embed-text:latest", "glm-4.6:cloud"])).toEqual([]);
    expect(NO_ELIGIBLE_JUDGES_MESSAGE).toMatch(/qwen generator family/);
  });

  it("tags family from the model name, folding fine-tunes into their lineage", () => {
    expect(judgeFamilyOf("hermes3:8b")).toBe("hermes");
    expect(judgeFamilyOf("aya-expanse:32b")).toBe("aya");
    expect(judgeFamilyOf("translategemma:27b")).toBe("gemma");
    expect(judgeFamilyOf("devstral-small-2:24b")).toBe("mistral");
  });

  it("lineage dedup keeps one seat per real family on this rig", () => {
    const seats = eligibleJudges([
      "gemma4:31b",
      "translategemma:27b",
      "mistral-small:24b",
      "devstral-small-2:24b",
      "hermes3:8b",
    ]);
    expect(seats.map((s) => s.model)).toEqual(["gemma4:31b", "mistral-small:24b", "hermes3:8b"]);
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

  it("floors bar width at CHART_BAR_MIN_PX even when BWS is near zero", () => {
    const scores: PanelScore[] = [
      { id: "a", bwsScore: 0.001, btStrength: 1, best: 1, worst: 1, appearances: 4, ci: [0, 0.002] },
    ];
    const bars = rankingChartModel(scores, 200);
    expect(CHART_BAR_MIN_PX).toBe(8);
    expect(bars[0].widthPx).toBe(CHART_BAR_MIN_PX);
    expect(bars[0].widthPct).toBeCloseTo((CHART_BAR_MIN_PX / 200) * 100, 8);
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
