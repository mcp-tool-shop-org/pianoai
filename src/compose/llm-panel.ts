// ─── LLM panel: judge roster, persist union, Kendall τ, Compare labels ────────
//
// Node-free. The cockpit browser caller uses these helpers and posts to
// Ollama with the same fetch pattern as slice A. Scoring stays in bws.ts.

import type { PanelResult, PanelScore, BwsVote } from "./bws.js";
import { parseJudgeResponse } from "./bws-judge-text.js";
import type { HumanAudioRunRecord, HumanAudioSystemId, EngineProbe } from "./human-audio-panel.js";

/** The composition-engine generator family — never a judge. */
export const GENERATOR_FAMILY_PREFIX = "qwen2.5";

export const NO_ELIGIBLE_JUDGES_MESSAGE =
  "No eligible local judge models are installed. Install at least one local chat model outside the qwen generator family (for example mistral-small, granite, gemma, or hermes), then start again.";

export interface JudgeSeat {
  model: string;
  family: string;
}

export interface JudgeSeatStatus extends JudgeSeat {
  status: "ok" | "failed";
  failReason?: string;
}

export function isGeneratorFamily(model: string): boolean {
  const lower = model.trim().toLowerCase();
  const base = lower.split(":")[0] ?? "";
  // The external-verifier rule: the judge must come from a DIFFERENT model
  // family than the generator. The generator is qwen2.5, so the whole Qwen
  // lineage is out — qwen3 judging qwen2.5's voicings is still same-family.
  if (base.startsWith("qwen")) return true;
  // Fine-tunes of the generator (jam-ft-*-qwen25, etc.) are the same family.
  return /qwen2\.?5/.test(lower);
}

/** Embedding models cannot chat — a judge seat they hold can never be filled. */
export function isEmbeddingModel(model: string): boolean {
  return /embed/i.test(model);
}

/**
 * Cloud-routed tags are not local judges: the panel's contract is LOCAL
 * models, and a cloud seat would spend account quota without being asked for.
 */
export function isCloudTag(model: string): boolean {
  return /(?::|-)cloud$/i.test(model.trim());
}

export function judgeFamilyOf(model: string): string {
  const base = model.trim().toLowerCase().split(":")[0] ?? "unknown";
  // Lineage matters, not just the name prefix: a fine-tune votes with its
  // base family (one seat per family exists for judge independence).
  if (base.includes("gemma")) return "gemma"; // gemma4, translategemma, …
  if (base.startsWith("devstral") || base.startsWith("mistral")) return "mistral";
  if (base.startsWith("granite")) return "granite";
  if (base.startsWith("hermes")) return "hermes";
  if (base.startsWith("aya")) return "aya";
  if (base.startsWith("qwen")) return "qwen";
  const cut = base.replace(/[0-9].*$/, "").replace(/-.*$/, "");
  return cut || base;
}

/**
 * Local chat models eligible to judge: installed tags minus the qwen
 * generator lineage, embedding models, and cloud-routed tags. One seat per
 * family.
 */
export function eligibleJudges(installed: string[]): JudgeSeat[] {
  const seen = new Set<string>();
  const out: JudgeSeat[] = [];
  for (const model of installed) {
    if (!model || isGeneratorFamily(model) || isEmbeddingModel(model) || isCloudTag(model)) continue;
    const family = judgeFamilyOf(model);
    if (seen.has(family)) continue;
    seen.add(family);
    out.push({ model, family });
  }
  return out;
}

export function parseOllamaTagNames(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const models = (payload as { models?: unknown }).models;
  if (!Array.isArray(models)) return [];
  const names: string[] = [];
  for (const m of models) {
    if (m && typeof m === "object" && typeof (m as { name?: unknown }).name === "string") {
      names.push((m as { name: string }).name);
    }
  }
  return names;
}

export function parseJudgeReply(raw: string, k: number): { best: number; worst: number } | null {
  return parseJudgeResponse(raw, k);
}

export interface KendallTau {
  tau: number;
  n: number;
  concordant: number;
  discordant: number;
  tiesA: number;
  tiesB: number;
}

/**
 * Kendall τ-b over two rankings of the same system ids (best→worst).
 * Items missing from one ranking are ignored. Ties (same rank index) count
 * in the denominator only.
 */
export function kendallTau(rankA: string[], rankB: string[]): KendallTau {
  const common = rankA.filter((id) => rankB.includes(id));
  const n = common.length;
  const posA = new Map(rankA.map((id, i) => [id, i]));
  const posB = new Map(rankB.map((id, i) => [id, i]));
  let concordant = 0;
  let discordant = 0;
  let tiesA = 0;
  let tiesB = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const da = (posA.get(common[i]) ?? 0) - (posA.get(common[j]) ?? 0);
      const db = (posB.get(common[i]) ?? 0) - (posB.get(common[j]) ?? 0);
      const sa = Math.sign(da);
      const sb = Math.sign(db);
      if (sa === 0 && sb === 0) {
        tiesA++;
        tiesB++;
      } else if (sa === 0) tiesA++;
      else if (sb === 0) tiesB++;
      else if (sa === sb) concordant++;
      else discordant++;
    }
  }
  const denom = Math.sqrt((concordant + discordant + tiesA) * (concordant + discordant + tiesB));
  const tau = denom > 0 ? (concordant - discordant) / denom : 0;
  return { tau, n, concordant, discordant, tiesA, tiesB };
}

export interface CompareResult {
  tau: KendallTau;
  engineRankHuman: number | null;
  engineRankLlm: number | null;
  engineRankMatch: boolean;
  humanProvisional: boolean;
  headline: string;
  detail: string;
}

export function comparePanelRankings(opts: {
  humanRanking: string[];
  llmRanking: string[];
  humanProvisional: boolean;
  humanUninterpretable?: boolean;
  humanListenerLabel: string;
  llmVotesCollected: number;
  llmVotesPossible: number;
}): CompareResult {
  const tau = kendallTau(opts.humanRanking, opts.llmRanking);
  const engineRankHuman = rankOf(opts.humanRanking, "engine");
  const engineRankLlm = rankOf(opts.llmRanking, "engine");
  const engineRankMatch =
    engineRankHuman != null && engineRankLlm != null && engineRankHuman === engineRankLlm;
  const tauTxt = Number.isFinite(tau.tau) ? tau.tau.toFixed(2) : "—";
  const engineTxt =
    engineRankHuman == null || engineRankLlm == null
      ? "The engine is missing from one ranking, so an engine-rank match cannot be stated."
      : engineRankMatch
        ? `The engine lands at rank ${engineRankHuman} on both sides.`
        : `The engine is rank ${engineRankLlm} for the local-model panel and rank ${engineRankHuman} for the human-audio panel.`;
  const provisional = opts.humanUninterpretable
    ? " The human ranking is UNINTERPRETABLE (its floor gate failed) — τ against it is noise, shown for the record only."
    : opts.humanProvisional
      ? " The human ranking is PROVISIONAL (under 15 votes per pair) — treat τ as a directional hint, not a concordance claim."
      : "";
  return {
    tau,
    engineRankHuman,
    engineRankLlm,
    engineRankMatch,
    humanProvisional: opts.humanProvisional,
    headline: `Kendall τ = ${tauTxt} over ${tau.n} shared systems.`,
    detail:
      `${engineTxt} Local-model votes ${opts.llmVotesCollected}/${opts.llmVotesPossible}. ` +
      `Human side: ${opts.humanListenerLabel}.${provisional} ` +
      `The local-model ranking is directional only.`,
  };
}

function rankOf(ranking: string[], id: string): number | null {
  const i = ranking.indexOf(id);
  return i < 0 ? null : i + 1;
}

export interface LlmPanelVote {
  songId: string;
  judgeModel: string;
  family: string;
  options: number[];
  best: number | null;
  worst: number | null;
  tuple: string[];
}

export interface LlmPanelRunRecord {
  v: 1;
  kind: "llm";
  seed: number;
  createdAt: string;
  songIds: string[];
  systems: HumanAudioSystemId[];
  engineTag: "reachable" | "unavailable";
  engineProbe: EngineProbe;
  judges: JudgeSeatStatus[];
  votes: LlmPanelVote[];
  tupleSystems: string[][];
  bwsVotes: BwsVote[];
  result?: PanelResult;
  votesCollected: number;
  votesPossible: number;
}

export type PanelStoredRun = HumanAudioRunRecord | LlmPanelRunRecord;

export function isHumanAudioRun(r: PanelStoredRun): r is HumanAudioRunRecord {
  return r.kind === "human-audio";
}

export function isLlmRun(r: PanelStoredRun): r is LlmPanelRunRecord {
  return r.kind === "llm";
}

export function emptyLlmRunRecord(
  partial: Omit<LlmPanelRunRecord, "v" | "kind" | "votes" | "tupleSystems" | "bwsVotes" | "votesCollected" | "votesPossible">,
): LlmPanelRunRecord {
  return {
    v: 1,
    kind: "llm",
    votes: [],
    tupleSystems: [],
    bwsVotes: [],
    votesCollected: 0,
    votesPossible: 0,
    ...partial,
  };
}

export function humanRunProvisional(run: HumanAudioRunRecord): boolean {
  return !!run.outcome?.provisional;
}

/** Readable floor for a ranking bar, in CSS pixels (VIS-013). */
export const CHART_BAR_MIN_PX = 8;

export function rankingChartModel(
  scores: PanelScore[],
  trackWidthPx = 200,
): Array<{
  id: string;
  score: number;
  ciLo: number;
  ciHi: number;
  leftPct: number;
  widthPct: number;
  widthPx: number;
  zeroPct: number;
  whiskerLoPct: number;
  whiskerHiPct: number;
  negative: boolean;
}> {
  const domain = 1; // BWS in [-1, 1]
  const toPct = (x: number) => ((x + domain) / (2 * domain)) * 100;
  const track = Math.max(1, trackWidthPx);
  const minPct = (CHART_BAR_MIN_PX / track) * 100;
  return scores.map((s) => {
    const a = Math.min(s.bwsScore, 0);
    const b = Math.max(s.bwsScore, 0);
    const left = s.bwsScore >= 0 ? toPct(0) : toPct(a);
    const right = s.bwsScore >= 0 ? toPct(b) : toPct(0);
    const rawPct = Math.max(0, right - left);
    const widthPct = Math.max(minPct, rawPct);
    return {
      id: s.id,
      score: s.bwsScore,
      ciLo: s.ci[0],
      ciHi: s.ci[1],
      leftPct: left,
      widthPct,
      widthPx: (widthPct / 100) * track,
      zeroPct: toPct(0),
      whiskerLoPct: toPct(s.ci[0]),
      whiskerHiPct: toPct(s.ci[1]),
      negative: s.bwsScore < 0,
    };
  });
}

export const BANNED_PANEL_VOCAB = /\$0|smoke.?screen|priced.?ask|quality:\s*N\/100/i;

export function serializeAllPanelRuns(runs: PanelStoredRun[]): string {
  return JSON.stringify({ v: 1, runs });
}

export function deserializeAllPanelRuns(raw: string): PanelStoredRun[] {
  try {
    const parsed = JSON.parse(raw) as { v?: number; runs?: unknown };
    if (!parsed || !Array.isArray(parsed.runs)) return [];
    const out: PanelStoredRun[] = [];
    for (const r of parsed.runs) {
      if (!r || typeof r !== "object") continue;
      const rec = r as PanelStoredRun;
      if (rec.v !== 1 || typeof rec.seed !== "number") continue;
      if (rec.kind === "human-audio" && Array.isArray((rec as HumanAudioRunRecord).trials)) {
        out.push(rec as HumanAudioRunRecord);
      } else if (rec.kind === "llm" && Array.isArray((rec as LlmPanelRunRecord).judges)) {
        out.push(rec as LlmPanelRunRecord);
      }
    }
    return out;
  } catch {
    return [];
  }
}
