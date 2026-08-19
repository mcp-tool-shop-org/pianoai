// ─── Human-audio panel: trial lists, loudness math, honest labels ────────────
//
// Slice A of the Composition Panel. Pure: no DOM, no Web Audio, no node:fs.
// Reuses makeRng / shuffledOrder / aggregatePanel / interpretPanel from bws.ts.
// Pairwise A/B votes are k=2 BWS records so the shipped bootstrap CIs stay.
// ─────────────────────────────────────────────────────────────────────────────

import {
  makeRng,
  shuffledOrder,
  aggregatePanel,
  interpretPanel,
  type BwsVote,
  type PanelSystem,
  type PanelResult,
} from "./bws.js";
import type { CatalogMelodyNote } from "./human-audio-catalog.js";
import type { Realization } from "./types.js";

export const HUMAN_AUDIO_SYSTEM_IDS = ["floor", "nearest", "refined", "engine"] as const;
export type HumanAudioSystemId = (typeof HUMAN_AUDIO_SYSTEM_IDS)[number];

export const HUMAN_AUDIO_SYSTEMS: Record<HumanAudioSystemId, PanelSystem> = {
  floor: { id: "floor", note: "Root-position floor (invalid anchor)" },
  nearest: { id: "nearest", note: "Nearest-tone baseline" },
  refined: { id: "refined", note: "Refined (valid anchor)" },
  engine: { id: "engine", note: "Composition engine (local model)" },
};

export const ENGINE_UNAVAILABLE_MESSAGE =
  "engine system unavailable — local model not reachable";

export const LOUDNESS_TOLERANCE_DB = 0.5;
export const VOTE_BUDGET_PROVISIONAL = 15;
export const VOTE_BUDGET_STABLE_K4 = 66;
export const FLOOR_SCREEN_RATE = 0.15;
export const FLOOR_INJECT_RATE = 0.1;
export const FLOOR_INJECT_MIN = 3;
export const VALID_SYSTEM_IDS: HumanAudioSystemId[] = ["nearest", "refined", "engine"];

export interface ClipNote {
  midi: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
  role: "melody" | "voicing";
}

export interface TrialSpec {
  id: string;
  songId: string;
  /** System assigned to the A button (blind). */
  sideA: HumanAudioSystemId;
  /** System assigned to the B button (blind). */
  sideB: HumanAudioSystemId;
  /** True when one side is the floor and the other is a valid system. */
  floorTrial: boolean;
}

export interface EngineProbe {
  reachable: boolean;
  corsBlocked?: boolean;
  reason?: string;
  status?: number;
}

export interface LoudnessMatchOk {
  ok: true;
  gainA: number;
  gainB: number;
  offsetDbA: number;
  offsetDbB: number;
  matchedDb: number;
  deltaDb: number;
}

export interface LoudnessMatchFail {
  ok: false;
  reason: string;
}

export type LoudnessMatch = LoudnessMatchOk | LoudnessMatchFail;

export interface HumanAudioOutcome {
  result: PanelResult;
  screened: boolean;
  screenRate: number;
  provisional: boolean;
  uninterpretable: boolean;
  listenerLabel: string;
  pairLabels: Record<string, string>;
  rankingHeadline: string;
  nextStep: string;
}

export interface PairwiseVoteInput {
  sideA: HumanAudioSystemId;
  sideB: HumanAudioSystemId;
  picked: "A" | "B";
  family: string;
}

const VALID_SET = new Set<string>(VALID_SYSTEM_IDS);

export function detectSystems(engineReachable: boolean): HumanAudioSystemId[] {
  const base: HumanAudioSystemId[] = ["floor", "nearest", "refined"];
  return engineReachable ? [...base, "engine"] : base;
}

export function isFloorTrialPair(a: HumanAudioSystemId, b: HumanAudioSystemId): boolean {
  const ids = new Set([a, b]);
  return ids.has("floor") && [...ids].some((id) => VALID_SET.has(id));
}

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function allPairs(systems: HumanAudioSystemId[]): Array<[HumanAudioSystemId, HumanAudioSystemId]> {
  const out: Array<[HumanAudioSystemId, HumanAudioSystemId]> = [];
  for (let i = 0; i < systems.length; i++) {
    for (let j = i + 1; j < systems.length; j++) out.push([systems[i], systems[j]]);
  }
  return out;
}

/**
 * Declarative trial list (B7): every song × system-pair, plus extra floor
 * trials until they are ≥10% of the list and at least 3. Order and A/B side
 * assignment are seeded via makeRng.
 */
export function buildTrialList(opts: {
  songIds: string[];
  systems: HumanAudioSystemId[];
  seed: number;
}): TrialSpec[] {
  const { songIds, systems, seed } = opts;
  if (songIds.length === 0) throw new Error("buildTrialList: no songs");
  if (systems.length < 2) throw new Error("buildTrialList: need ≥2 systems");

  const pairs = allPairs(systems);
  const ranking: TrialSpec[] = [];
  let seq = 0;
  for (const songId of songIds) {
    for (const [x, y] of pairs) {
      ranking.push({
        id: `t${seq++}`,
        songId,
        sideA: x,
        sideB: y,
        floorTrial: isFloorTrialPair(x, y),
      });
    }
  }

  const floorPool = ranking.filter((t) => t.floorTrial);
  if (floorPool.length === 0) {
    throw new Error("buildTrialList: no floor-vs-valid pair — include the floor system");
  }

  const minFloor = Math.max(FLOOR_INJECT_MIN, Math.ceil(FLOOR_INJECT_RATE * ranking.length));
  const extra: TrialSpec[] = [];
  let need = minFloor - ranking.filter((t) => t.floorTrial).length;
  let inject = 0;
  while (need > 0) {
    const src = floorPool[inject % floorPool.length];
    extra.push({
      ...src,
      id: `t${seq++}`,
      floorTrial: true,
    });
    inject++;
    need--;
  }

  const combined = [...ranking, ...extra];
  const rng = makeRng(seed >>> 0);
  const order = shuffledOrder(combined.length, rng);
  const shuffled = order.map((i) => combined[i]);

  return shuffled.map((t) => {
    const flip = rng() < 0.5;
    return {
      ...t,
      sideA: flip ? t.sideB : t.sideA,
      sideB: flip ? t.sideA : t.sideB,
      floorTrial: isFloorTrialPair(flip ? t.sideB : t.sideA, flip ? t.sideA : t.sideB),
    };
  });
}

export function buildClipNotes(opts: {
  melody: CatalogMelodyNote[];
  realization?: Realization | { frames: Array<{ measure: number; voices: number[] }> };
  beatsPerMeasure: number;
  voicingVelocity?: number;
}): ClipNote[] {
  const voicingVelocity = opts.voicingVelocity ?? 64;
  const notes: ClipNote[] = opts.melody.map((m) => ({
    midi: m.midi,
    startBeat: m.startBeat,
    durationBeats: m.durationBeats,
    velocity: m.velocity,
    role: "melody",
  }));
  const frames = opts.realization?.frames ?? [];
  for (const f of frames) {
    if (!f.voices?.length) continue;
    const startBeat = (f.measure - 1) * opts.beatsPerMeasure;
    for (const midi of f.voices) {
      notes.push({
        midi,
        startBeat,
        durationBeats: opts.beatsPerMeasure,
        velocity: voicingVelocity,
        role: "voicing",
      });
    }
  }
  notes.sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);
  return notes;
}

export function clipDurationBeats(notes: ClipNote[], beatsPerMeasure: number, measures: number): number {
  const fromNotes = notes.reduce((m, n) => Math.max(m, n.startBeat + n.durationBeats), 0);
  return Math.max(fromNotes, measures * beatsPerMeasure);
}

export function dbFromRms(rms: number): number {
  if (!(rms > 0) || !Number.isFinite(rms)) return Number.NEGATIVE_INFINITY;
  return 20 * Math.log10(rms);
}

export function measureRms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let acc = 0;
  for (let i = 0; i < samples.length; i++) acc += samples[i] * samples[i];
  return Math.sqrt(acc / samples.length);
}

/**
 * Attenuate the louder clip to the quieter (never boost into clipping) so the
 * presented pair matches within LOUDNESS_TOLERANCE_DB. Zero-energy clips halt.
 */
export function loudnessOffsetsFromRms(rmsA: number, rmsB: number): LoudnessMatch {
  if (!(rmsA > 0) || !(rmsB > 0) || !Number.isFinite(rmsA) || !Number.isFinite(rmsB)) {
    return { ok: false, reason: "loudness-match-infeasible: a clip has no measurable energy" };
  }
  const dbA = dbFromRms(rmsA);
  const dbB = dbFromRms(rmsB);
  const target = Math.min(dbA, dbB);
  const offsetDbA = target - dbA;
  const offsetDbB = target - dbB;
  return {
    ok: true,
    gainA: 10 ** (offsetDbA / 20),
    gainB: 10 ** (offsetDbB / 20),
    offsetDbA,
    offsetDbB,
    matchedDb: target,
    deltaDb: Math.abs(dbA - dbB),
  };
}

export function gainsMatchWithinTolerance(gainA: number, rmsA: number, gainB: number, rmsB: number): boolean {
  const d = Math.abs(dbFromRms(rmsA * gainA) - dbFromRms(rmsB * gainB));
  return Number.isFinite(d) && d <= LOUDNESS_TOLERANCE_DB + 1e-9;
}

export function pairwiseVoteToBws(input: PairwiseVoteInput): { vote: BwsVote; tuple: string[] } {
  const tuple = [input.sideA, input.sideB];
  const best = input.picked === "A" ? 0 : 1;
  return {
    vote: { options: [0, 1], best, worst: 1 - best, family: input.family },
    tuple,
  };
}

export function pairBudgetLabel(votes: number): string {
  if (votes < VOTE_BUDGET_PROVISIONAL) return `collecting — ${votes}/${VOTE_BUDGET_PROVISIONAL}`;
  return `${votes} votes`;
}

export function rankingStatus(pairVotes: Record<string, number>): { provisional: boolean; label: string } {
  const values = Object.values(pairVotes);
  if (values.length === 0) {
    return { provisional: true, label: "PROVISIONAL — no votes yet" };
  }
  const min = Math.min(...values);
  if (min < VOTE_BUDGET_PROVISIONAL) {
    return {
      provisional: true,
      label: `PROVISIONAL — every pair needs ≥${VOTE_BUDGET_PROVISIONAL} votes before this ranking is trusted (stable k=4 bar is ~${VOTE_BUDGET_STABLE_K4}/pair)`,
    };
  }
  return {
    provisional: false,
    label: `Ranking uses ≥${VOTE_BUDGET_PROVISIONAL} votes per pair. A stable k=4 ranking wants ~${VOTE_BUDGET_STABLE_K4} per pair.`,
  };
}

export function listenerCountLabel(n: number): string {
  if (n >= 3) return "the robust claim";
  return "your blind preference";
}

export function screenListener(floorTrials: number, floorMisPicks: number): { screened: boolean; rate: number } {
  if (floorTrials <= 0) return { screened: false, rate: 0 };
  const rate = floorMisPicks / floorTrials;
  return { screened: rate > FLOOR_SCREEN_RATE, rate };
}

export function countPairVotes(
  votes: Array<{ sideA: string; sideB: string }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of votes) {
    const k = pairKey(v.sideA, v.sideB);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function scoreHumanAudio(opts: {
  systems: HumanAudioSystemId[];
  votes: PairwiseVoteInput[];
  seed: number;
  floorTrials: number;
  floorMisPicks: number;
  remainingFloorWinsForValid: number;
  remainingFloorTrials: number;
  listenerCount: number;
  enginePresent: boolean;
}): HumanAudioOutcome {
  const systems: PanelSystem[] = opts.systems.map((id) => HUMAN_AUDIO_SYSTEMS[id]);
  const bwsVotes: BwsVote[] = [];
  const tuples: string[][] = [];
  for (const v of opts.votes) {
    const rec = pairwiseVoteToBws(v);
    bwsVotes.push(rec.vote);
    tuples.push(rec.tuple);
  }

  const pairVotes = countPairVotes(opts.votes);
  for (const [x, y] of allPairs(opts.systems)) {
    const k = pairKey(x, y);
    if (pairVotes[k] == null) pairVotes[k] = 0;
  }
  const pairLabels: Record<string, string> = {};
  for (const [k, n] of Object.entries(pairVotes)) pairLabels[k] = pairBudgetLabel(n);
  const { provisional, label: budgetLabel } = rankingStatus(pairVotes);

  const screen = screenListener(opts.floorTrials, opts.floorMisPicks);
  const listenerLabel = listenerCountLabel(opts.listenerCount);

  const floorSeparation =
    opts.remainingFloorTrials > 0
      ? opts.remainingFloorWinsForValid / opts.remainingFloorTrials >= 1 - FLOOR_SCREEN_RATE
      : false;

  const agg = aggregatePanel(systems, bwsVotes, tuples, { bootstrap: 200, seed: opts.seed });
  const engineId = opts.enginePresent ? "engine" : "refined";
  const interpreted = interpretPanel(agg, { floor: "floor", valid: "refined", engine: engineId }, { floorMargin: 0.15 });

  const uninterpretable = screen.screened
    ? !floorSeparation
    : !interpreted.interpretable && interpreted.verdict.startsWith("UNINTERPRETABLE");

  let rankingHeadline: string;
  let nextStep: string;
  let verdict = interpreted.verdict;

  if (screen.screened && !floorSeparation) {
    rankingHeadline = "UNINTERPRETABLE";
    verdict =
      "UNINTERPRETABLE — this listener missed the floor side on more than 15% of catch trials, and the remaining votes still cannot separate a valid voicing from the theory-invalid floor. That is a first-class outcome, not a crash: the run says nothing about the systems.";
    nextStep = "Start a new run (new seed). Listen for which backing fits the tune — the floor side is a catch trial mixed in blind.";
  } else if (screen.screened && floorSeparation) {
    rankingHeadline = provisional ? "PROVISIONAL" : interpreted.interpretable ? "INCONCLUSIVE" : "UNINTERPRETABLE";
    verdict =
      `This listener is screened out (floor mis-pick ${(screen.rate * 100).toFixed(0)}% > 15%). Their votes are excluded from the published ranking. Remaining votes still separate valid from floor.`;
    nextStep = "Keep collecting votes from another listener, or export this run as a screened record.";
  } else if (uninterpretable) {
    rankingHeadline = "UNINTERPRETABLE";
    nextStep = "The floor gate failed — do not read the ranking as a system comparison. Run more trials, or treat this as a null.";
  } else if (provisional) {
    rankingHeadline = "PROVISIONAL";
    nextStep = `Keep voting. ${budgetLabel}`;
  } else if (interpreted.verdict.startsWith("INCONCLUSIVE")) {
    rankingHeadline = "INCONCLUSIVE";
    nextStep = "Judges discriminate, but the standing is not clean. Collect toward ~66 votes per pair for a stable k=4 ranking, or stop and export.";
  } else {
    rankingHeadline = "Ranking";
    nextStep = `This is ${listenerLabel}. Export the JSON if you want a receipt.`;
  }

  const result: PanelResult = {
    ...interpreted,
    verdict,
    interpretable: !uninterpretable && interpreted.interpretable,
  };

  return {
    result,
    screened: screen.screened,
    screenRate: screen.rate,
    provisional,
    uninterpretable,
    listenerLabel,
    pairLabels,
    rankingHeadline,
    nextStep,
  };
}

export async function probeLocalModel(
  fetchImpl: typeof fetch,
  url = "http://127.0.0.1:11434/api/tags",
): Promise<EngineProbe> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    try {
      const res = await fetchImpl(url, { method: "GET", signal: ctrl.signal });
      return { reachable: res.ok, status: res.status, reason: res.ok ? undefined : `HTTP ${res.status}` };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const cors = /failed to fetch|networkerror|cors|access-control/i.test(msg);
    return { reachable: false, corsBlocked: cors, reason: msg };
  }
}

export interface HumanAudioRunRecord {
  v: 1;
  kind: "human-audio";
  seed: number;
  createdAt: string;
  songIds: string[];
  systems: HumanAudioSystemId[];
  engineTag: "reachable" | "unavailable";
  engineProbe: EngineProbe;
  trials: TrialSpec[];
  votes: Array<{
    trialId: string;
    picked: "A" | "B";
    sideA: HumanAudioSystemId;
    sideB: HumanAudioSystemId;
    at: string;
  }>;
  loudness: Array<{
    trialId: string;
    rmsA: number;
    rmsB: number;
    offsetDbA: number;
    offsetDbB: number;
    gainA: number;
    gainB: number;
    voicePath: "sampler" | "synth";
  }>;
  outcome?: HumanAudioOutcome;
}

export function emptyRunRecord(partial: Omit<HumanAudioRunRecord, "v" | "kind" | "votes" | "loudness">): HumanAudioRunRecord {
  return { v: 1, kind: "human-audio", votes: [], loudness: [], ...partial };
}

export const PANEL_RUNS_STORAGE_KEY = "ai-jam-cockpit:panel-runs";

export function serializePanelRuns(runs: HumanAudioRunRecord[]): string {
  return JSON.stringify({ v: 1, runs });
}

export function deserializePanelRuns(raw: string): HumanAudioRunRecord[] {
  try {
    const parsed = JSON.parse(raw) as { v?: number; runs?: unknown };
    if (!parsed || !Array.isArray(parsed.runs)) return [];
    return parsed.runs.filter((r): r is HumanAudioRunRecord => {
      if (!r || typeof r !== "object") return false;
      const rec = r as HumanAudioRunRecord;
      return rec.kind === "human-audio" && rec.v === 1 && typeof rec.seed === "number" && Array.isArray(rec.trials);
    });
  } catch {
    return [];
  }
}
