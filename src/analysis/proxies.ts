// ─── Ground-truth-free proxies ────────────────────────────────────────────────
//
// There is no absolute "correct" chord label (study-swarm finding 10: expert
// agreement is only ~76% on root). So beyond the small hand-annotated reference
// set, the analyzer is judged library-wide by ground-truth-free proxies (finding
// 11: does the labeling stay key-consistent, and is its harmonic rhythm
// plausible?). These are DESCRIPTIVE — a higher key-consistency is not
// automatically "better" (real music has secondary dominants and borrowed
// chords, which is why even a correct analysis sits well below 100%), but a
// LARGE swing between analyzer and baseline is signal.
// ─────────────────────────────────────────────────────────────────────────────

import type { ChordSpan, HarmonicAnalysis } from "./types.js";
import { parseChordLabel, keyScalePcs } from "./symbols.js";

/** A chord root with a duration weight. */
export interface WeightedRoot {
  /** Root pitch class 0-11 (negative = no-chord, excluded). */
  root: number;
  /** Duration weight in beats. */
  durBeats: number;
}

export interface KeyConsistency {
  /** Beats of real-chord time whose root is diatonic to the key. */
  inKey: number;
  /** Total beats of real-chord time scored. */
  total: number;
  /** inKey / total, or 0 when nothing scored / key unparseable. */
  ratio: number;
  /** True when the key string could not be parsed (ratio is then 0). */
  keyUnparseable: boolean;
}

/** WeightedRoots from analyzer spans (root already resolved). */
export function spansToWeightedRoots(spans: ChordSpan[]): WeightedRoot[] {
  return spans.map((s) => ({ root: s.root, durBeats: Math.max(0, s.endBeat - s.startBeat) }));
}

/** WeightedRoots from symbol+duration labels (baseline / per-measure). */
export function labelsToWeightedRoots(labels: Array<{ symbol: string; durBeats: number }>): WeightedRoot[] {
  return labels.map((l) => {
    const parsed = parseChordLabel(l.symbol);
    return { root: parsed ? parsed.rootPc : -1, durBeats: l.durBeats };
  });
}

/**
 * Duration-weighted fraction of real-chord time whose ROOT is diatonic to the
 * declared key. Excludes no-chord (root < 0). This is the exact proxy the ACE
 * study-swarm applied (the "labels diatonic to the song's declared key" signal).
 */
export function keyConsistency(items: WeightedRoot[], key: string): KeyConsistency {
  const scale = keyScalePcs(key);
  if (!scale) return { inKey: 0, total: 0, ratio: 0, keyUnparseable: true };
  let inKey = 0;
  let total = 0;
  for (const it of items) {
    if (it.root < 0 || it.durBeats <= 0) continue;
    total += it.durBeats;
    if (scale.has(it.root)) inKey += it.durBeats;
  }
  return { inKey, total, ratio: total > 0 ? inKey / total : 0, keyUnparseable: false };
}

export interface HarmonicRhythm {
  /** Total spans (including no-chord). */
  spans: number;
  /** Spans that are a real chord. */
  chordSpans: number;
  /** Measures analyzed. */
  measures: number;
  /** Real chord spans per measure (the harmonic-rhythm rate). */
  chordsPerMeasure: number;
  /** Mean length of a real chord span, in beats. */
  meanSpanBeats: number;
}

/**
 * Harmonic-rhythm plausibility of an analysis. A single-label-per-measure engine
 * pins this near ≤1 chord/measure by construction; a real analyzer should land
 * in the plausible 1–4 chords/bar band (study-swarm finding 8) where the source
 * actually moves.
 */
export function harmonicRhythm(analysis: HarmonicAnalysis): HarmonicRhythm {
  const chordSpans = analysis.spans.filter((s) => s.root >= 0);
  const measures = analysis.perMeasure.length;
  const totalChordBeats = chordSpans.reduce((a, s) => a + (s.endBeat - s.startBeat), 0);
  return {
    spans: analysis.spans.length,
    chordSpans: chordSpans.length,
    measures,
    chordsPerMeasure: measures > 0 ? chordSpans.length / measures : 0,
    meanSpanBeats: chordSpans.length > 0 ? totalChordBeats / chordSpans.length : 0,
  };
}
