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
