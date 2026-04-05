// ─── ai-jam-sessions: Per-hand scoring breakdown ───────────────────────────
//
// A piano teacher always evaluates hands independently. This module takes
// a PerformanceResult and partitions the match data by hand to produce
// per-hand metrics and actionable practice suggestions.
// ────────────────────────────────────────────────────────────────────────────

import type { PerformanceResult, MissedNote } from "./score-performance.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HandMetrics {
  /** Pitch accuracy 0–100 (% of matched notes with correct pitch) */
  pitchAccuracy: number;
  /** Average absolute timing error in ms */
  timingAccuracyMs: number;
  /** Completeness 0–100 (% of expected notes that were played) */
  completeness: number;
  /** Total expected notes for this hand */
  noteCount: number;
}

export interface HandBreakdown {
  left: HandMetrics;
  right: HandMetrics;
  weakerHand: "left" | "right" | "balanced";
  suggestion: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function emptyMetrics(): HandMetrics {
  return { pitchAccuracy: 0, timingAccuracyMs: 0, completeness: 0, noteCount: 0 };
}

/**
 * Compute a single hand-strength score from metrics (higher = stronger).
 * Uses the same weighting as the overall scorer: 40% pitch + 40% completeness + 20% timing.
 */
function handScore(m: HandMetrics): number {
  return m.pitchAccuracy * 0.4 + m.completeness * 0.4 + Math.max(0, 100 - m.timingAccuracyMs) * 0.2;
}

/**
 * Group missed notes into contiguous measure ranges per hand.
 * Returns strings like "measures 5-8" or "measure 3".
 */
function missedRanges(missed: MissedNote[], hand: string): string[] {
  const measures = [...new Set(missed.filter(m => m.hand === hand).map(m => m.measure))].sort((a, b) => a - b);
  if (measures.length === 0) return [];

  const ranges: string[] = [];
  let start = measures[0];
  let end = measures[0];

  for (let i = 1; i < measures.length; i++) {
    if (measures[i] === end + 1) {
      end = measures[i];
    } else {
      ranges.push(start === end ? `measure ${start}` : `measures ${start}-${end}`);
      start = measures[i];
      end = measures[i];
    }
  }
  ranges.push(start === end ? `measure ${start}` : `measures ${start}-${end}`);
  return ranges;
}

// ─── Main function ──────────────────────────────────────────────────────────

/**
 * Break down a PerformanceResult into per-hand metrics and a practice suggestion.
 *
 * The function uses the `details.missed` array (which carries the `hand` field)
 * to figure out per-hand completeness, and the overall metrics as a baseline
 * for pitch/timing (since individual match data isn't exposed by PerformanceResult).
 *
 * If the result contains missed notes for a hand we can compute completeness
 * per-hand. For pitch and timing we distribute proportionally based on the
 * missed-note ratio.
 */
export function breakdownByHand(result: PerformanceResult): HandBreakdown {
  const { details, metrics } = result;

  // Count expected notes per hand from missed notes + matched notes
  // missed notes have a hand field; matched notes don't have hand exposed directly
  // in PerformanceResult, so we infer from the totals.
  const missedLeft = details.missed.filter(m => m.hand === "left");
  const missedRight = details.missed.filter(m => m.hand === "right");

  const totalMissed = missedLeft.length + missedRight.length;
  const totalMatched = details.matched;
  const totalExpected = details.totalExpected;

  // If we have no expected notes, return balanced empty result
  if (totalExpected === 0) {
    return {
      left: emptyMetrics(),
      right: emptyMetrics(),
      weakerHand: "balanced",
      suggestion: "No notes in this piece to evaluate.",
    };
  }

  // We know exact missed counts per hand but not exact matched per hand.
  // Total expected = matched + missed (possibly some missed have no hand).
  // Best approximation: assume matched notes distribute proportionally to
  // (expectedPerHand - missedPerHand).
  //
  // If all missed notes have hands, expectedLeft + expectedRight = totalExpected
  // and missedLeft + missedRight = totalMissed.
  // matchedLeft = expectedLeft - missedLeft, matchedRight = expectedRight - missedRight.
  // We don't know expectedLeft directly, but:
  // expectedLeft = missedLeft + matchedLeft, expectedRight = missedRight + matchedRight,
  // matchedLeft + matchedRight = totalMatched.
  //
  // Without per-match hand info, we estimate:
  // If there are missed notes from both hands, the ratio of missed notes tells us
  // something about the hand distribution. For the matched pool we split evenly
  // unless we have better info.

  // Without per-match hand data, we estimate the matched distribution using
  // the missed-note ratio as a proxy for hand workload. If one hand has more
  // missed notes, it likely had more expected notes overall.
  //
  // When both hands have missed notes, use the miss ratio to infer workload.
  // When only one hand has misses, we can't infer reliably — split evenly
  // and mark the estimate as low-confidence (used in suggestion text).
  const bothHandsMissed = missedLeft.length > 0 && missedRight.length > 0;
  let matchedLeftEstimate: number;
  let matchedRightEstimate: number;
  let estimateConfidence: "high" | "low";

  if (bothHandsMissed && totalMissed > 0) {
    // Use missed-note ratio as proxy for hand workload distribution
    const leftRatio = missedLeft.length / totalMissed;
    matchedLeftEstimate = Math.round(totalMatched * leftRatio);
    matchedRightEstimate = totalMatched - matchedLeftEstimate;
    estimateConfidence = "high";
  } else {
    // Can't infer distribution — even split with low confidence
    matchedLeftEstimate = Math.round(totalMatched / 2);
    matchedRightEstimate = totalMatched - matchedLeftEstimate;
    estimateConfidence = "low";
  }

  const expectedLeft = missedLeft.length + Math.max(matchedLeftEstimate, 0);
  const expectedRight = missedRight.length + Math.max(matchedRightEstimate, 0);

  // Per-hand completeness
  const completenessLeft = expectedLeft > 0
    ? ((expectedLeft - missedLeft.length) / expectedLeft) * 100
    : 100;
  const completenessRight = expectedRight > 0
    ? ((expectedRight - missedRight.length) / expectedRight) * 100
    : 100;

  // For pitch accuracy and timing, we use the overall values but adjust
  // based on completeness difference (a hand that misses more notes likely has worse accuracy)
  const completenessRatio = completenessLeft > 0 && completenessRight > 0
    ? completenessLeft / completenessRight
    : 1;

  // If completeness is similar, pitch/timing are probably similar too
  const pitchLeft = Math.min(100, Math.round(metrics.pitchAccuracy * Math.min(completenessRatio, 1.1)));
  const pitchRight = Math.min(100, Math.round(metrics.pitchAccuracy * Math.min(1 / completenessRatio, 1.1)));

  // Worse completeness hand likely has worse timing too
  const timingLeft = Math.round(metrics.timingAccuracyMs * (completenessRatio < 1 ? 1.2 : 1.0));
  const timingRight = Math.round(metrics.timingAccuracyMs * (completenessRatio > 1 ? 1.2 : 1.0));

  const left: HandMetrics = {
    pitchAccuracy: Math.round(completenessLeft > 0 ? pitchLeft : 0),
    timingAccuracyMs: completenessLeft > 0 ? timingLeft : 0,
    completeness: Math.round(completenessLeft),
    noteCount: expectedLeft,
  };

  const right: HandMetrics = {
    pitchAccuracy: Math.round(completenessRight > 0 ? pitchRight : 0),
    timingAccuracyMs: completenessRight > 0 ? timingRight : 0,
    completeness: Math.round(completenessRight),
    noteCount: expectedRight,
  };

  // Determine weaker hand from hard facts: missed note counts.
  // The estimated matched-note distribution is useful for metrics display
  // but too unreliable for hand-weakness determination. Miss counts are
  // ground truth from the scoring engine.
  let weakerHand: "left" | "right" | "balanced";
  if (missedLeft.length === missedRight.length) {
    // Equal misses — fall back to handScore from estimated metrics
    const leftScore = handScore(left);
    const rightScore = handScore(right);
    const BALANCE_THRESHOLD = 5;
    if (Math.abs(leftScore - rightScore) < BALANCE_THRESHOLD) {
      weakerHand = "balanced";
    } else {
      weakerHand = leftScore < rightScore ? "left" : "right";
    }
  } else {
    weakerHand = missedLeft.length > missedRight.length ? "left" : "right";
  }

  // Generate suggestion
  const suggestion = generateSuggestion(weakerHand, left, right, missedLeft, missedRight, estimateConfidence);

  return { left, right, weakerHand, suggestion };
}

function generateSuggestion(
  weakerHand: "left" | "right" | "balanced",
  left: HandMetrics,
  right: HandMetrics,
  missedLeft: MissedNote[],
  missedRight: MissedNote[],
  confidence: "high" | "low" = "high",
): string {
  if (left.noteCount === 0 && right.noteCount === 0) {
    return "No notes in this piece to evaluate.";
  }

  if (weakerHand === "balanced") {
    if (left.completeness >= 95 && right.completeness >= 95) {
      return "Both hands are well-balanced. Focus on expression and dynamics.";
    }
    return "Both hands need similar attention. Try practicing hands-separate at a slower tempo.";
  }

  const weaker = weakerHand === "left" ? left : right;
  const missed = weakerHand === "left" ? missedLeft : missedRight;
  const handName = weakerHand;

  const parts: string[] = [];

  if (missed.length > 0) {
    const ranges = missedRanges(missed.concat(), handName);
    const rangeStr = ranges.slice(0, 3).join(", ");
    parts.push(`Your ${handName} hand dropped ${missed.length} note${missed.length === 1 ? "" : "s"} in ${rangeStr}.`);
  }

  if (weaker.completeness < 80) {
    parts.push(`Try practicing hands-separate.`);
  } else if (weaker.timingAccuracyMs > 100) {
    parts.push(`Work on ${handName} hand timing with a metronome.`);
  } else {
    parts.push(`Focus on ${handName} hand accuracy in your next practice session.`);
  }

  if (confidence === "low") {
    parts.push(`(Per-hand estimate is approximate — only one hand had missed notes.)`);
  }

  return parts.join(" ");
}
