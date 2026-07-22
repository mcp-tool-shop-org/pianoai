// ─── E2 Model-Continuation Gate (the locked future-model slot, wired) ─────────
//
// phrase-continuation.ts has carried a locked, preregistered, never-used bar
// since Slice 6:
//
//   FUTURE_MODEL_GROOVE_MARGIN = 0.15
//   "Future model: grooveOA(model, gold) must exceed grooveOA(shuffled, gold)
//    by ≥0.15."
//
// This module wires that slot. For a (prompt, continuation_target) pair and a
// model-generated continuation:
//
//   grooveOA_modelVsGold    = groove OA between the GOLD continuation's
//                             phrase-level groove histogram and the MODEL's,
//                             on gold's grid (computeGrooveSimilarity).
//   grooveOA_shuffledVsGold = the same metric for the deterministic
//                             shuffled-bars control of the GOLD continuation —
//                             the negative baseline the eval has always used.
//   margin                  = modelVsGold − shuffledVsGold
//   clearsBar               ⇔ margin ≥ FUTURE_MODEL_GROOVE_MARGIN
//
// Reporting rule (honest, both views): per-pair clear counts are reported over
// ALL pairs (an unscoreable pair — parse failure, note-empty output, or a
// not-computable control — can never clear), while mean margins are reported
// over the margin-computable subset only, with the not-computable audit
// carried alongside. not_computable is a first-class result — never fabricate.
//
// Note on the pre-existing in-run E2 metric: llm-runner.ts's runE2ForPair
// scores grooveOA(model, shuffled(model)) — a SELF-coherence check (does the
// model's own continuation have bar-order structure), not fit-to-gold. That
// slot is left untouched; this module is the model-vs-gold margin the locked
// bar actually specifies.
//
// Deterministic; no LLM calls; no HTTP.
// ─────────────────────────────────────────────────────────────────────────────

import type { TimedEvent } from "../schema.js";
import {
  FUTURE_MODEL_GROOVE_MARGIN,
  computeGrooveSimilarity,
  computeNoteOverlap,
  computePitchClassOA,
  computeRhythmSimilarity,
  shuffleBars,
  isNotComputable,
  notComputable,
  type MetricResult,
  type MetricResultJson,
  type NotComputable,
  type ResolvedPair,
} from "./phrase-continuation.js";
import { meterAwareGrooveOA, type RequantizeOptions } from "./score-time-gold.js";
import {
  signTest,
  permutationTestPairedMean,
  type SignTestResult,
  type PermutationTestResult,
} from "./paired-tests.js";

// ─── Per-pair score ───────────────────────────────────────────────────────────

export interface ModelContinuationScore {
  promptId: string;
  targetId: string;
  songId: string;
  timeSignature: string;
  targetMeasureRange: string;
  goldEventCount: number;
  goldBarCount: number;
  modelEventCount: number;
  modelBarCount: number;
  /** groove OA of the model continuation vs the gold continuation (canonical). */
  grooveOA_modelVsGold: MetricResult;
  /** groove OA of the deterministic shuffled-bars control vs gold (baseline). */
  grooveOA_shuffledVsGold: MetricResult;
  /** modelVsGold − shuffledVsGold; null when either side is not computable. */
  margin: number | null;
  /** margin !== null && margin ≥ FUTURE_MODEL_GROOVE_MARGIN. */
  clearsBar: boolean;
  // Supporting (informational) model-vs-gold metrics.
  noteOverlap_modelVsGold: MetricResult;
  pitchClassOA_modelVsGold: MetricResult;
  rhythmSimilarity_modelVsGold: MetricResult;
}

/** Serializable form (NotComputable objects survive JSON round-trips as-is). */
export interface ModelContinuationScoreJson
  extends Omit<
    ModelContinuationScore,
    | "grooveOA_modelVsGold"
    | "grooveOA_shuffledVsGold"
    | "noteOverlap_modelVsGold"
    | "pitchClassOA_modelVsGold"
    | "rhythmSimilarity_modelVsGold"
  > {
  grooveOA_modelVsGold: MetricResultJson;
  grooveOA_shuffledVsGold: MetricResultJson;
  noteOverlap_modelVsGold: MetricResultJson;
  pitchClassOA_modelVsGold: MetricResultJson;
  rhythmSimilarity_modelVsGold: MetricResultJson;
}

/**
 * Anchor a model continuation's measure numbering to the target window.
 *
 * REMI in the wild carries BOTH bar conventions: the E2 one-shot example
 * numbers the continuation from Bar_1, while a model echoing the prompt
 * phrase's absolute numbering emits Bar_5… for an m5-8 continuation. Without
 * anchoring, the second convention lands every event outside gold's groove
 * grid and scores 0.000 for labeling, not for music. Shift so the model's
 * FIRST bar aligns with the target's start measure, preserving relative
 * offsets (gaps included). Idempotent when already aligned.
 */
export function alignContinuationMeasures(
  modelEvents: TimedEvent[],
  targetStartMeasure: number,
): TimedEvent[] {
  if (modelEvents.length === 0) return modelEvents;
  const minMeasure = Math.min(...modelEvents.map((e) => e.measure));
  const offset = targetStartMeasure - minMeasure;
  if (offset === 0) return modelEvents;
  return modelEvents.map((e) => ({ ...e, measure: e.measure + offset }));
}

/**
 * Score a model-generated continuation against a resolved (prompt, target)
 * pair at the locked future-model bar.
 *
 * `modelEvents` is the model's continuation as TimedEvents; measure numbering
 * is anchored to the target window via alignContinuationMeasures (both
 * Bar_1-relative and absolute-numbered continuations score identically).
 */
export function scoreModelContinuation(
  pair: ResolvedPair,
  modelEvents: TimedEvent[],
): ModelContinuationScore {
  const target = pair.targetRecord;
  const goldEvents = target.observation.midi_sidecar.timed_events;
  const timeSignature = target.scope.time_signature;

  const phraseMatch = /measures (\d+)-(\d+)/.exec(target.scope.phrase_window);
  const phraseStartMeasure = phraseMatch ? parseInt(phraseMatch[1], 10) : 1;
  modelEvents = alignContinuationMeasures(modelEvents, phraseStartMeasure);

  const goldBars = new Set(goldEvents.map((e) => e.measure)).size;
  const modelBars = new Set(modelEvents.map((e) => e.measure)).size;

  // Canonical metric: model vs gold on gold's grid.
  const grooveOA_modelVsGold =
    modelEvents.length === 0
      ? notComputable("model continuation has no note events")
      : computeGrooveSimilarity(goldEvents, modelEvents, timeSignature);

  // Baseline: the eval's deterministic shuffled-bars control vs gold.
  const shuffled = shuffleBars(goldEvents);
  const grooveOA_shuffledVsGold = isNotComputable(shuffled)
    ? (shuffled as NotComputable)
    : computeGrooveSimilarity(goldEvents, shuffled as TimedEvent[], timeSignature);

  const margin =
    !isNotComputable(grooveOA_modelVsGold) && !isNotComputable(grooveOA_shuffledVsGold)
      ? (grooveOA_modelVsGold as number) - (grooveOA_shuffledVsGold as number)
      : null;

  return {
    promptId: pair.promptRecord.id,
    targetId: target.id,
    songId: target.scope.song_id,
    timeSignature,
    targetMeasureRange: target.scope.phrase_window,
    goldEventCount: goldEvents.length,
    goldBarCount: goldBars,
    modelEventCount: modelEvents.length,
    modelBarCount: modelBars,
    grooveOA_modelVsGold,
    grooveOA_shuffledVsGold,
    margin,
    clearsBar: margin !== null && margin >= FUTURE_MODEL_GROOVE_MARGIN,
    noteOverlap_modelVsGold:
      modelEvents.length === 0
        ? notComputable("model continuation has no note events")
        : computeNoteOverlap(goldEvents, modelEvents, phraseStartMeasure),
    pitchClassOA_modelVsGold:
      modelEvents.length === 0
        ? notComputable("model continuation has no note events")
        : computePitchClassOA(goldEvents, modelEvents),
    rhythmSimilarity_modelVsGold:
      modelEvents.length === 0
        ? notComputable("model continuation has no note events")
        : computeRhythmSimilarity(goldEvents, modelEvents, timeSignature, phraseStartMeasure),
  };
}

// ─── Aggregate ────────────────────────────────────────────────────────────────

export interface ModelContinuationAggregate {
  modelLabel: string;
  /** The locked bar this aggregate is judged against (0.15, preregistered). */
  bar: number;
  /** All pairs the generator was run on (scoreable or not). */
  pairCount: number;
  /** Pairs where the margin is a number (model output parsed + control computable). */
  computablePairCount: number;
  /** Pairs whose margin ≥ bar. Numerator over ALL pairs — unscoreable can't clear. */
  pairsClearingBar: number;
  /** pairsClearingBar / pairCount. The strict all-pairs view. */
  clearRateAllPairs: number | null;
  /** Means over the margin-computable subset (so meanMargin = meanModel − meanShuffled). */
  meanModelVsGold: number | null;
  meanShuffledVsGold: number | null;
  meanMargin: number | null;
  minMargin: number | null;
  maxMargin: number | null;
  /** meanMargin ≥ bar over the computable subset. The headline aggregate verdict. */
  aggregateClearsBar: boolean;
  notComputableAudit: Array<{ pairId: string; metric: string; reason: string }>;
}

export function aggregateModelContinuations(
  modelLabel: string,
  scores: ModelContinuationScore[],
): ModelContinuationAggregate {
  const computable = scores.filter((s) => s.margin !== null);
  const margins = computable.map((s) => s.margin as number);
  const modelVals = computable.map((s) => s.grooveOA_modelVsGold as number);
  const shuffledVals = computable.map((s) => s.grooveOA_shuffledVsGold as number);

  const mean = (xs: number[]) =>
    xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

  const notComputableAudit: ModelContinuationAggregate["notComputableAudit"] = [];
  for (const s of scores) {
    const checks: Array<[string, MetricResult]> = [
      ["grooveOA_modelVsGold", s.grooveOA_modelVsGold],
      ["grooveOA_shuffledVsGold", s.grooveOA_shuffledVsGold],
    ];
    for (const [metric, v] of checks) {
      if (isNotComputable(v)) {
        notComputableAudit.push({ pairId: s.targetId, metric, reason: v.reason });
      }
    }
  }

  const meanMargin = mean(margins);
  return {
    modelLabel,
    bar: FUTURE_MODEL_GROOVE_MARGIN,
    pairCount: scores.length,
    computablePairCount: computable.length,
    pairsClearingBar: scores.filter((s) => s.clearsBar).length,
    clearRateAllPairs:
      scores.length > 0 ? scores.filter((s) => s.clearsBar).length / scores.length : null,
    meanModelVsGold: mean(modelVals),
    meanShuffledVsGold: mean(shuffledVals),
    meanMargin,
    minMargin: margins.length > 0 ? Math.min(...margins) : null,
    maxMargin: margins.length > 0 ? Math.max(...margins) : null,
    aggregateClearsBar: meanMargin !== null && meanMargin >= FUTURE_MODEL_GROOVE_MARGIN,
    notComputableAudit,
  };
}

// ─── E2v2: conjunctive two-axis scoring vs a generative foil ──────────────────
//
// The E2v2 repair (design §6.2.4): replace the single onset-only groove metric
// vs a shuffle control with a CONJUNCTIVE two-axis score vs a generative foil.
//
//   RHYTHM axis  — meter-aware groove OA vs SCORE-TIME gold (score-time-gold.ts,
//                  fixes the rubato-cloning confound + Debussy triplet mis-binning)
//   TONAL  axis  — pitch-class histogram OA vs gold (F11, the MIR-standard tonal
//                  feature) — closes the "right rhythm, wrong notes" gaming mode
//
// Each axis' MARGIN is over the FOIL's same-axis score (Markov foil or copy-
// forward, markov-foil.ts), not over a permutation of gold. A conjunctive gate
// (both axes clear) is level-α with NO multiplicity penalty (Berger–Hsu
// Intersection–Union Test, finding F10) and names/closes the Goodhart failure
// modes the v1 single-axis gate exposed (F9).
//
// The bars below are `[LOCK]` PROPOSALS — Slice 3's $0 pre-measurement computes
// the real numbers from gold/foil separation and the director signs them ex ante
// (Fork 5) before any training run. They are NOT the sealed v1 constant.
// ─────────────────────────────────────────────────────────────────────────────

/** `[LOCK]` proposal — rhythm-axis margin the model must beat the foil by. */
export const E2V2_RHYTHM_MARGIN = 0.15;
/** `[LOCK]` proposal — tonal-axis margin the model must beat the foil by. */
export const E2V2_TONAL_MARGIN = 0.1;
/** `[LOCK]` proposal — min gold-vs-foil separation, per axis, to qualify an item. */
export const E2V2_SCREEN_SEPARATION = 0.15;

export interface E2v2AxisScore {
  /** Axis metric of the model continuation vs gold. */
  modelVsGold: MetricResult;
  /** Same axis metric of the foil vs gold (the control this margin is over). */
  foilVsGold: MetricResult;
  /** modelVsGold − foilVsGold; null when either side is not computable. */
  margin: number | null;
}

export interface E2v2ContinuationScore {
  promptId: string;
  targetId: string;
  songId: string;
  timeSignature: string;
  targetMeasureRange: string;
  foilLabel: string;
  goldEventCount: number;
  modelEventCount: number;
  foilEventCount: number;
  /** Meter-aware groove OA axis (score-time). */
  rhythm: E2v2AxisScore;
  /** Pitch-class OA axis. */
  tonal: E2v2AxisScore;
  rhythmBar: number;
  tonalBar: number;
  /** Conjunctive: both axes computable AND both margins ≥ their bars (F10 IUT). */
  clearsBar: boolean;
}

function axisMargin(modelVsGold: MetricResult, foilVsGold: MetricResult): number | null {
  return !isNotComputable(modelVsGold) && !isNotComputable(foilVsGold)
    ? (modelVsGold as number) - (foilVsGold as number)
    : null;
}

export interface E2v2ScoreOptions extends RequantizeOptions {
  rhythmBar?: number;
  tonalBar?: number;
  foilLabel?: string;
}

/**
 * Score a model continuation on both axes against a resolved pair and a
 * pre-built foil (Markov or copy-forward, at the target measures). Conjunctive
 * verdict per F10. Model measures are anchored to the target window exactly as
 * the v1 scorer does; the foil is already at the target measures.
 */
export function scoreE2v2Continuation(
  pair: ResolvedPair,
  modelEvents: TimedEvent[],
  foilEvents: TimedEvent[],
  opts: E2v2ScoreOptions = {},
): E2v2ContinuationScore {
  const target = pair.targetRecord;
  const goldEvents = target.observation.midi_sidecar.timed_events;
  const timeSignature = target.scope.time_signature;
  const rhythmBar = opts.rhythmBar ?? E2V2_RHYTHM_MARGIN;
  const tonalBar = opts.tonalBar ?? E2V2_TONAL_MARGIN;

  const phraseMatch = /measures (\d+)-(\d+)/.exec(target.scope.phrase_window);
  const phraseStartMeasure = phraseMatch ? parseInt(phraseMatch[1], 10) : 1;
  const model = alignContinuationMeasures(modelEvents, phraseStartMeasure);

  const empty = (n: number) => n === 0;

  // RHYTHM axis — meter-aware groove OA vs score-time gold.
  const rhythmModel = empty(model.length)
    ? notComputable("model continuation has no note events")
    : meterAwareGrooveOA(goldEvents, model, timeSignature, opts);
  const rhythmFoil = empty(foilEvents.length)
    ? notComputable("foil has no note events")
    : meterAwareGrooveOA(goldEvents, foilEvents, timeSignature, opts);

  // TONAL axis — pitch-class histogram OA (grid-independent).
  const tonalModel = empty(model.length)
    ? notComputable("model continuation has no note events")
    : computePitchClassOA(goldEvents, model);
  const tonalFoil = empty(foilEvents.length)
    ? notComputable("foil has no note events")
    : computePitchClassOA(goldEvents, foilEvents);

  const rhythm: E2v2AxisScore = {
    modelVsGold: rhythmModel,
    foilVsGold: rhythmFoil,
    margin: axisMargin(rhythmModel, rhythmFoil),
  };
  const tonal: E2v2AxisScore = {
    modelVsGold: tonalModel,
    foilVsGold: tonalFoil,
    margin: axisMargin(tonalModel, tonalFoil),
  };

  const clearsBar =
    rhythm.margin !== null &&
    tonal.margin !== null &&
    rhythm.margin >= rhythmBar &&
    tonal.margin >= tonalBar;

  return {
    promptId: pair.promptRecord.id,
    targetId: target.id,
    songId: target.scope.song_id,
    timeSignature,
    targetMeasureRange: target.scope.phrase_window,
    foilLabel: opts.foilLabel ?? "foil",
    goldEventCount: goldEvents.length,
    modelEventCount: model.length,
    foilEventCount: foilEvents.length,
    rhythm,
    tonal,
    rhythmBar,
    tonalBar,
    clearsBar,
  };
}

// ─── E2v2 item screen (model-blind, frozen with the item list) ────────────────

export interface E2v2ItemScreen {
  targetId: string;
  songId: string;
  targetMeasureRange: string;
  foilLabel: string;
  /** grooveOA(gold,gold) − grooveOA(gold,foil): rhythm discrimination on this item. */
  rhythmSeparation: number | null;
  /** pitchClassOA(gold,gold) − pitchClassOA(gold,foil): tonal discrimination. */
  tonalSeparation: number | null;
  separationBar: number;
  /** Item may gate only if BOTH axes separate ≥ bar (F26 set-separation validity). */
  qualifies: boolean;
  reason: string;
}

export interface E2v2ScreenOptions extends RequantizeOptions {
  separationBar?: number;
  foilLabel?: string;
}

/**
 * Screen an item for gate-eligibility using gold + foil ONLY (never the model —
 * screening on the candidate would bias toward it, finding F14). An item
 * qualifies only if the instrument demonstrably separates gold from the foil on
 * BOTH axes (F26). The output is meant to be frozen alongside the item list.
 */
export function screenItemE2v2(
  pair: ResolvedPair,
  foilEvents: TimedEvent[],
  opts: E2v2ScreenOptions = {},
): E2v2ItemScreen {
  const target = pair.targetRecord;
  const goldEvents = target.observation.midi_sidecar.timed_events;
  const timeSignature = target.scope.time_signature;
  const separationBar = opts.separationBar ?? E2V2_SCREEN_SEPARATION;
  const foilLabel = opts.foilLabel ?? "foil";

  const num = (r: MetricResult): number | null => (isNotComputable(r) ? null : (r as number));

  const goldSelfRhythm = num(meterAwareGrooveOA(goldEvents, goldEvents, timeSignature, opts));
  const foilRhythm =
    foilEvents.length === 0 ? null : num(meterAwareGrooveOA(goldEvents, foilEvents, timeSignature, opts));
  const goldSelfTonal = num(computePitchClassOA(goldEvents, goldEvents));
  const foilTonal = foilEvents.length === 0 ? null : num(computePitchClassOA(goldEvents, foilEvents));

  const rhythmSeparation =
    goldSelfRhythm !== null && foilRhythm !== null ? goldSelfRhythm - foilRhythm : null;
  const tonalSeparation =
    goldSelfTonal !== null && foilTonal !== null ? goldSelfTonal - foilTonal : null;

  let qualifies = false;
  let reason: string;
  if (rhythmSeparation === null || tonalSeparation === null) {
    reason = "not computable — gold or foil produced no scoreable groove/pitch histogram";
  } else if (rhythmSeparation < separationBar && tonalSeparation < separationBar) {
    reason = `both axes below separation bar (rhythm ${rhythmSeparation.toFixed(3)}, tonal ${tonalSeparation.toFixed(3)} < ${separationBar})`;
  } else if (rhythmSeparation < separationBar) {
    reason = `rhythm separation ${rhythmSeparation.toFixed(3)} < ${separationBar} — instrument cannot distinguish gold from foil on rhythm here`;
  } else if (tonalSeparation < separationBar) {
    reason = `tonal separation ${tonalSeparation.toFixed(3)} < ${separationBar} — instrument cannot distinguish gold from foil on pitch here`;
  } else {
    qualifies = true;
    reason = `qualifies — rhythm ${rhythmSeparation.toFixed(3)}, tonal ${tonalSeparation.toFixed(3)} ≥ ${separationBar}`;
  }

  return {
    targetId: target.id,
    songId: target.scope.song_id,
    targetMeasureRange: target.scope.phrase_window,
    foilLabel,
    rhythmSeparation,
    tonalSeparation,
    separationBar,
    qualifies,
    reason,
  };
}

// ─── E2v2 aggregate (over the screened item set) ──────────────────────────────

export interface E2v2AxisAggregate {
  meanModelVsGold: number | null;
  meanFoilVsGold: number | null;
  meanMargin: number | null;
  minMargin: number | null;
  maxMargin: number | null;
  bar: number;
  /** meanMargin ≥ bar — the effect-size gate for this axis. */
  meanClearsBar: boolean;
  /** Exact binomial sign test that item margins tend above 0 (beats the foil). */
  signTest: SignTestResult;
  /** Paired sign-flip permutation test that mean margin > 0 (finding F13). */
  permutationTest: PermutationTestResult;
}

export interface E2v2Aggregate {
  modelLabel: string;
  foilLabel: string;
  alpha: number;
  /** Items fed to the aggregate (should already be the SCREENED set). */
  pairCount: number;
  /** Items where BOTH axis margins are computable. */
  computablePairCount: number;
  /** Items clearing the conjunctive per-item bar. */
  pairsClearingBar: number;
  clearRateAllPairs: number | null;
  rhythm: E2v2AxisAggregate;
  tonal: E2v2AxisAggregate;
  /** Conjunctive headline: BOTH axes' mean margin ≥ their bars. */
  aggregateClearsBar: boolean;
  /** Conjunctive significance: BOTH axes' one-sided permutation p < alpha. */
  bothAxesSignificant: boolean;
  notComputableAudit: Array<{ pairId: string; axis: string; side: string; reason: string }>;
}

function aggregateAxis(
  scores: E2v2ContinuationScore[],
  pick: (s: E2v2ContinuationScore) => E2v2AxisScore,
  bar: number,
  seed: number,
): E2v2AxisAggregate {
  const withMargin = scores.filter((s) => pick(s).margin !== null);
  const margins = withMargin.map((s) => pick(s).margin as number);
  const modelVals = withMargin
    .map((s) => pick(s).modelVsGold)
    .filter((v) => !isNotComputable(v)) as number[];
  const foilVals = withMargin
    .map((s) => pick(s).foilVsGold)
    .filter((v) => !isNotComputable(v)) as number[];
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const meanMargin = mean(margins);
  return {
    meanModelVsGold: mean(modelVals),
    meanFoilVsGold: mean(foilVals),
    meanMargin,
    minMargin: margins.length ? Math.min(...margins) : null,
    maxMargin: margins.length ? Math.max(...margins) : null,
    bar,
    meanClearsBar: meanMargin !== null && meanMargin >= bar,
    signTest: signTest(margins, 0, "greater"),
    permutationTest: permutationTestPairedMean(margins, { alternative: "greater", seed }),
  };
}

/**
 * Aggregate E2v2 scores over an item set (pass the SCREENED items — the caller
 * filters to `qualifies` before calling). Reports each axis' effect-size gate
 * and exact paired significance, then the conjunctive headline (both axes clear)
 * and conjunctive significance (both axes p < α). All computed over the margin-
 * computable subset; not_computable is audited, never fabricated.
 */
export function aggregateE2v2(
  modelLabel: string,
  scores: E2v2ContinuationScore[],
  opts: { alpha?: number; seed?: number; foilLabel?: string } = {},
): E2v2Aggregate {
  const alpha = opts.alpha ?? 0.05;
  const seed = opts.seed ?? 12345;
  const rhythmBar = scores[0]?.rhythmBar ?? E2V2_RHYTHM_MARGIN;
  const tonalBar = scores[0]?.tonalBar ?? E2V2_TONAL_MARGIN;

  const rhythm = aggregateAxis(scores, (s) => s.rhythm, rhythmBar, seed);
  const tonal = aggregateAxis(scores, (s) => s.tonal, tonalBar, seed + 1);

  const computablePairCount = scores.filter(
    (s) => s.rhythm.margin !== null && s.tonal.margin !== null,
  ).length;

  const notComputableAudit: E2v2Aggregate["notComputableAudit"] = [];
  for (const s of scores) {
    for (const [axis, a] of [
      ["rhythm", s.rhythm],
      ["tonal", s.tonal],
    ] as const) {
      if (isNotComputable(a.modelVsGold)) {
        notComputableAudit.push({ pairId: s.targetId, axis, side: "model", reason: a.modelVsGold.reason });
      }
      if (isNotComputable(a.foilVsGold)) {
        notComputableAudit.push({ pairId: s.targetId, axis, side: "foil", reason: a.foilVsGold.reason });
      }
    }
  }

  return {
    modelLabel,
    foilLabel: opts.foilLabel ?? scores[0]?.foilLabel ?? "foil",
    alpha,
    pairCount: scores.length,
    computablePairCount,
    pairsClearingBar: scores.filter((s) => s.clearsBar).length,
    clearRateAllPairs: scores.length ? scores.filter((s) => s.clearsBar).length / scores.length : null,
    rhythm,
    tonal,
    aggregateClearsBar: rhythm.meanClearsBar && tonal.meanClearsBar,
    bothAxesSignificant: rhythm.permutationTest.pValue < alpha && tonal.permutationTest.pValue < alpha,
    notComputableAudit,
  };
}
