// ─── jam-actions-v0 E2 Phrase Continuation Eval ───────────────────────────────
//
// Evaluates phrase continuation signal across paired records. For each
// prompt/continuation_target pair, computes 4 symbolic-music metrics on the
// ground-truth continuation (C) vs a shuffled-bars negative control.
//
// Metrics (from synthesis Section 4, E2):
//   1. Note overlap (Jaccard on (pitch, beat-quantized-position) tuples)
//   2. Pitch-class histogram Overlapped Area (OA) — sanity baseline; gold ≈ shuffled
//   3. Rhythm / onset-grid cosine similarity — gold ≠ shuffled (order matters)
//   4. Groove similarity (onset density by beat position per bar) — canonical metric
//      carrying the locked future-model target (gold OA must beat shuffled by ≥0.15)
//
// Shuffled-bars control: shuffle bar order within C, preserving note content.
// Measures gold vs shuffled on all 4 metrics. Rhythm/groove should diverge.
//
// not_computable is a first-class result — never fabricate a metric value.
//
// Uses phrase-slicer.ts TimedEvent shape. No LLM calls, no HTTP, no MCP changes.
// ─────────────────────────────────────────────────────────────────────────────

import type { TimedEvent } from "../schema.js";

// ─── Core types ───────────────────────────────────────────────────────────────

/** A note quantized to (pitch, beat-grid-slot) for overlap comparison. */
export interface QuantizedNote {
  pitch: number;
  /** Beat position within the phrase, quantized to a grid slot. */
  gridSlot: number;
}

/** Pitch-class histogram: 12 bins [C, C#, D, D#, E, F, F#, G, G#, A, A#, B]. */
export type PitchClassHistogram = [
  number, number, number, number, number, number,
  number, number, number, number, number, number,
];

/**
 * Groove histogram: maps (beat-position-within-bar) → note count.
 * Aggregated over all bars in the phrase. Beat positions quantized to grid.
 */
export type GrooveHistogram = Map<number, number>;

/** Not-computable marker with explicit reason. */
export interface NotComputable {
  not_computable: true;
  reason: string;
}

/** Serializable form of NotComputable for JSON output. */
export interface NotComputableJson {
  not_computable: true;
  reason: string;
}

/** A computed scalar metric or not_computable. */
export type MetricResult = number | NotComputable;

/** Serializable metric result. */
export type MetricResultJson = number | NotComputableJson;

export function isNotComputable<T>(r: T | NotComputable): r is NotComputable {
  return typeof r === "object" && r !== null && (r as NotComputable).not_computable === true;
}

export function notComputable(reason: string): NotComputable {
  return { not_computable: true, reason };
}

// ─── Grid quantization ────────────────────────────────────────────────────────

/** Number of grid slots per beat (sixteenth-note grid = 4 slots per quarter). */
export const GRID_SLOTS_PER_BEAT = 4;

/**
 * Quantize a beat position (fractional) to the nearest grid slot integer.
 * Beat 0.0 → slot 0, beat 0.25 → slot 1, beat 0.5 → slot 2, etc.
 */
export function quantizeBeat(beat: number): number {
  return Math.round(beat * GRID_SLOTS_PER_BEAT);
}

/**
 * Compute the beat-within-bar from a beat value that includes an absolute
 * beat count within the measure. The `beat` field in timed_events is a
 * fractional position within the measure (0-indexed from measure start).
 */
export function beatWithinBar(beat: number): number {
  // beat field is already measure-relative (0 to time_sig_numerator).
  // Just quantize it.
  return quantizeBeat(beat);
}

// ─── Shuffled-bars control ────────────────────────────────────────────────────

/**
 * Shuffle bar order within a continuation target's timed events.
 *
 * - Groups events by measure number.
 * - Shuffles the group order (Fisher-Yates with seeded pseudo-random).
 * - Reassigns measure numbers (now disordered) while preserving beat positions.
 * - Returns the shuffled events.
 *
 * If there is only 1 distinct measure, returns not_computable — a single bar
 * cannot be shuffled in a way that destroys ordering signal.
 */
export function shuffleBars(
  events: TimedEvent[],
): TimedEvent[] | NotComputable {
  const measures = [...new Set(events.map((e) => e.measure))].sort(
    (a, b) => a - b,
  );

  if (measures.length < 2) {
    return notComputable(
      `continuation_target has only ${measures.length} distinct measure(s); cannot shuffle bars — at least 2 required`,
    );
  }

  // Group events by measure.
  const groups = new Map<number, TimedEvent[]>();
  for (const m of measures) {
    groups.set(m, []);
  }
  for (const e of events) {
    groups.get(e.measure)!.push(e);
  }

  // Shuffle measure order deterministically (LCG seeded on measure count + event count).
  const shuffledOrder = shuffleMeasureOrder(measures, events.length);

  // Rebuild event list: assign events from shuffled groups to original measure slots.
  // This changes the measure field (and the logical position in the piece) while
  // preserving the beat-within-bar for each note (relative position within its bar).
  const shuffledEvents: TimedEvent[] = [];
  for (let i = 0; i < measures.length; i++) {
    const originalMeasure = measures[i]; // the target slot
    const sourceMeasure = shuffledOrder[i]; // which original bar fills this slot
    const sourceEvents = groups.get(sourceMeasure)!;
    for (const e of sourceEvents) {
      shuffledEvents.push({
        ...e,
        measure: originalMeasure,
      });
    }
  }

  // Sort by measure, then beat, then note for stable ordering.
  shuffledEvents.sort(
    (a, b) => a.measure - b.measure || a.beat - b.beat || a.note - b.note,
  );

  return shuffledEvents;
}

/**
 * Deterministic shuffle of measure indices via LCG.
 * Seed: (measureCount * 1000) + eventCount, avoids external RNG.
 */
function shuffleMeasureOrder(measures: number[], seed: number): number[] {
  const arr = [...measures];
  // LCG parameters (Numerical Recipes).
  const a = 1664525;
  const c = 1013904223;
  const m = 2 ** 32;
  let s = seed % m;

  for (let i = arr.length - 1; i > 0; i--) {
    s = (a * s + c) % m;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Metric 1: Note overlap (Jaccard on quantized (pitch, gridSlot) tuples) ──

/**
 * Convert timed events to a set of (pitch, gridSlot) tuples, quantized to
 * the sixteenth-note grid.
 *
 * Beat positions are measure-relative (the `beat` field), so the gridSlot
 * combines (measure-index-within-phrase, quantized-beat) to form a unique
 * position within the phrase.
 *
 * `phraseStartMeasure` is the first measure number in the phrase, used to
 * normalize measure indices to 0-based.
 */
export function eventsToQuantizedSet(
  events: TimedEvent[],
  phraseStartMeasure: number,
): Set<string> {
  const result = new Set<string>();
  for (const e of events) {
    const measureIndex = e.measure - phraseStartMeasure; // 0-based
    const beatSlot = quantizeBeat(e.beat);
    result.add(`${e.note}:${measureIndex}:${beatSlot}`);
  }
  return result;
}

/**
 * Jaccard similarity between two sets: |A ∩ B| / |A ∪ B|.
 * Returns 1.0 for two empty sets (both empty = identical).
 * Returns 0.0 for one empty and one non-empty.
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  if (a.size === 0 || b.size === 0) return 0.0;

  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return intersection / union;
}

/**
 * Compute note-set Jaccard similarity between gold events and a reference set.
 *
 * For Slice 6 (harness validation):
 * - Gold vs gold → should be 1.0 (sanity check)
 * - Gold vs shuffled → will differ only if shuffled changes grid positions
 *   (it doesn't for bars that have the same beat patterns — see note below).
 *
 * Important: Jaccard on (pitch, beat-within-bar) tuples is unchanged by bar
 * shuffling when the same notes appear at the same beat positions within each bar.
 * For the Satie/Fur Elise patterns (few pitches, sparse beats), shuffling often
 * produces the same set. The metric is included for completeness and future-model
 * use (model may produce different notes). Report honestly when it doesn't diverge.
 */
export function computeNoteOverlap(
  goldEvents: TimedEvent[],
  referenceEvents: TimedEvent[],
  phraseStartMeasure: number,
): MetricResult {
  if (goldEvents.length === 0 && referenceEvents.length === 0) {
    return notComputable("no events in either gold or reference");
  }

  const goldSet = eventsToQuantizedSet(goldEvents, phraseStartMeasure);
  const refSet = eventsToQuantizedSet(referenceEvents, phraseStartMeasure);
  return jaccardSimilarity(goldSet, refSet);
}

// ─── Metric 2: Pitch-class histogram OA ──────────────────────────────────────

/**
 * Build a 12-bin pitch-class histogram (normalized to sum to 1.0).
 * Bin 0 = C, 1 = C#, ..., 11 = B.
 * Returns null if events is empty (not_computable upstream).
 */
export function buildPitchClassHistogram(
  events: TimedEvent[],
): PitchClassHistogram | null {
  if (events.length === 0) return null;

  const bins: PitchClassHistogram = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const e of events) {
    bins[e.note % 12]++;
  }

  // Normalize to sum to 1.
  const total = bins.reduce((s, v) => s + v, 0);
  return bins.map((v) => v / total) as PitchClassHistogram;
}

/**
 * Overlapped Area between two pitch-class histograms.
 * OA = sum over 12 bins of min(p_i, q_i). Ranges 0–1.
 * Meaningful interpretation: 1.0 = identical distributions; 0.0 = disjoint.
 */
export function pitchClassOA(
  a: PitchClassHistogram,
  b: PitchClassHistogram,
): number {
  let overlap = 0;
  for (let i = 0; i < 12; i++) {
    overlap += Math.min(a[i], b[i]);
  }
  return overlap;
}

/**
 * Compute pitch-class histogram OA between gold events and reference events.
 *
 * Sanity baseline: gold vs shuffled should be ≈ 1.0 because shuffling bars
 * preserves note content. If it's not close to 1.0, the shuffler is broken.
 */
export function computePitchClassOA(
  goldEvents: TimedEvent[],
  referenceEvents: TimedEvent[],
): MetricResult {
  const goldHist = buildPitchClassHistogram(goldEvents);
  const refHist = buildPitchClassHistogram(referenceEvents);

  if (goldHist === null || refHist === null) {
    return notComputable(
      goldHist === null
        ? "no events in gold continuation"
        : "no events in reference (shuffled control)",
    );
  }

  return pitchClassOA(goldHist, refHist);
}

// ─── Metric 3: Rhythm / onset-grid similarity ─────────────────────────────────

/**
 * Build an onset-presence vector over the sixteenth-note grid for a phrase.
 *
 * Grid size = (number of beats per bar) × GRID_SLOTS_PER_BEAT × (number of bars).
 * A slot is 1 if any note onset falls in it, 0 otherwise.
 *
 * `beatsPerBar`: numerator of the time signature.
 * `numBars`: number of distinct measures in the events.
 * `phraseStartMeasure`: first measure number (for normalization).
 */
export function buildOnsetVector(
  events: TimedEvent[],
  beatsPerBar: number,
  phraseStartMeasure: number,
): number[] {
  const measures = [...new Set(events.map((e) => e.measure))].sort(
    (a, b) => a - b,
  );
  const numBars = measures.length;
  const slotsPerBar = beatsPerBar * GRID_SLOTS_PER_BEAT;
  const totalSlots = numBars * slotsPerBar;

  const vector = new Array<number>(totalSlots).fill(0);

  for (const e of events) {
    const barIndex = e.measure - phraseStartMeasure; // 0-based
    const beatSlot = quantizeBeat(e.beat);
    const globalSlot = barIndex * slotsPerBar + beatSlot;
    if (globalSlot >= 0 && globalSlot < totalSlots) {
      vector[globalSlot] = 1;
    }
  }

  return vector;
}

/**
 * Cosine similarity between two onset vectors.
 * Returns 1.0 for identical vectors; 0.0 for orthogonal (completely different).
 * Returns null if either vector is all-zero.
 */
export function cosineSimilarity(a: number[], b: number[]): number | null {
  if (a.length !== b.length) return null;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return null;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Parse time signature numerator from string "N/D".
 * Returns null on parse failure.
 */
export function parseBeatsPerBar(timeSignature: string): number | null {
  const match = /^(\d+)\/\d+$/.exec(timeSignature);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Compute rhythm/onset-grid cosine similarity between gold and reference.
 *
 * Gold vs shuffled SHOULD diverge here (same notes, different order = different
 * grid pattern). If it doesn't, either: (a) the metric is broken, or (b) the
 * phrase is so sparse that shuffling doesn't change the grid (flag this).
 */
export function computeRhythmSimilarity(
  goldEvents: TimedEvent[],
  referenceEvents: TimedEvent[],
  timeSignature: string,
  phraseStartMeasure: number,
): MetricResult {
  if (goldEvents.length === 0) {
    return notComputable("no events in gold continuation");
  }
  if (referenceEvents.length === 0) {
    return notComputable("no events in reference (shuffled control)");
  }

  const beatsPerBar = parseBeatsPerBar(timeSignature);
  if (beatsPerBar === null) {
    return notComputable(
      `cannot parse time signature: "${timeSignature}"`,
    );
  }

  const goldVector = buildOnsetVector(goldEvents, beatsPerBar, phraseStartMeasure);
  const refVector = buildOnsetVector(referenceEvents, beatsPerBar, phraseStartMeasure);

  // Align vectors (reference may have same phraseStartMeasure but shuffled measure labels).
  // Both vectors are built from 0-indexed bar slots, so phraseStartMeasure is shared.
  const sim = cosineSimilarity(goldVector, refVector);
  if (sim === null) {
    return notComputable(
      "onset vectors are all-zero — no onset data in one or both sides",
    );
  }

  return sim;
}

// ─── Metric 4: Groove similarity ──────────────────────────────────────────────

/**
 * Build a groove histogram: onset-density by **phrase-level** grid slot.
 *
 * This is an order-sensitive representation: bar 1 beat 1 is slot 0,
 * bar 1 beat 2 is slot 4, bar 2 beat 1 is slot (slotsPerBar), etc.
 * Shuffling bars produces a different histogram because each bar's onsets
 * now land at different absolute slots.
 *
 * This distinguishes groove from within-bar-folded histograms (which are
 * bar-order-invariant and would always show grooveOA = 1.0 vs shuffled).
 *
 * `beatsPerBar`: from the time signature numerator.
 * `phraseStartMeasure`: first measure in the phrase (normalizes to 0-indexed bar).
 * `numBars`: total bars in the phrase (determines histogram length).
 *
 * Returns a fixed-length array of length (numBars × beatsPerBar × GRID_SLOTS_PER_BEAT).
 * Normalized to sum to 1.
 */
export function buildGrooveHistogram(
  events: TimedEvent[],
  beatsPerBar: number,
  phraseStartMeasure: number,
  numBars: number,
): number[] {
  const slotsPerBar = beatsPerBar * GRID_SLOTS_PER_BEAT;
  const totalSlots = numBars * slotsPerBar;
  const hist = new Array<number>(totalSlots).fill(0);

  for (const e of events) {
    const barIndex = e.measure - phraseStartMeasure; // 0-based
    const beatSlot = quantizeBeat(e.beat);
    const slot = barIndex * slotsPerBar + beatSlot;
    if (slot >= 0 && slot < totalSlots) {
      hist[slot]++;
    }
  }

  // Normalize to sum to 1.
  const total = hist.reduce((s, v) => s + v, 0);
  if (total === 0) return hist;
  return hist.map((v) => v / total);
}

/**
 * Overlapped Area between two normalized groove histograms.
 * OA = sum over slots of min(p_i, q_i). Ranges 0–1.
 */
export function grooveOA(a: number[], b: number[]): number {
  let overlap = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    overlap += Math.min(a[i], b[i]);
  }
  return overlap;
}

/**
 * Compute groove similarity between gold events and reference.
 *
 * Uses phrase-level groove histograms (bar order-sensitive): slot i in bar j
 * maps to absolute position j*slotsPerBar + i. This means shuffling bars
 * produces different histograms and the OA diverges from 1.0.
 *
 * The canonical metric for E2. Gold should show a musically coherent phrase-level
 * groove; shuffled bars will show a diluted/different groove because the same
 * notes now appear at different absolute phrase positions. The locked future-model
 * gate: groove OA of model output vs gold must beat shuffled baseline by ≥0.15.
 *
 * Requires ≥2 bars to be meaningful (shuffling a single bar is a no-op).
 */
export function computeGrooveSimilarity(
  goldEvents: TimedEvent[],
  referenceEvents: TimedEvent[],
  timeSignature: string,
): MetricResult {
  if (goldEvents.length === 0) {
    return notComputable("no events in gold continuation");
  }
  if (referenceEvents.length === 0) {
    return notComputable("no events in reference (shuffled control)");
  }

  const beatsPerBar = parseBeatsPerBar(timeSignature);
  if (beatsPerBar === null) {
    return notComputable(
      `cannot parse time signature: "${timeSignature}"`,
    );
  }

  const goldMeasures = [...new Set(goldEvents.map((e) => e.measure))].sort(
    (a, b) => a - b,
  );
  const goldMeasureCount = goldMeasures.length;
  if (goldMeasureCount < 2) {
    return notComputable(
      `groove histogram requires ≥2 bars; gold has only ${goldMeasureCount} bar(s)`,
    );
  }

  const phraseStartMeasure = goldMeasures[0];

  // Gold groove uses gold's own measures.
  const goldGroove = buildGrooveHistogram(
    goldEvents,
    beatsPerBar,
    phraseStartMeasure,
    goldMeasureCount,
  );

  // Reference (shuffled) groove: use the same phraseStartMeasure and numBars
  // (the shuffled events have the same measure labels as gold, just different content).
  const refGroove = buildGrooveHistogram(
    referenceEvents,
    beatsPerBar,
    phraseStartMeasure,
    goldMeasureCount,
  );

  return grooveOA(goldGroove, refGroove);
}

// ─── Pair record types ────────────────────────────────────────────────────────

/** Minimal record shape needed for E2 eval. */
export interface PairRecord {
  id: string;
  scope: {
    song_id: string;
    phrase_window: string;
    time_signature: string;
    window_role?: string;
    paired_prompt_record_id?: string;
    continuation_target_window?: [number, number];
  };
  observation: {
    midi_sidecar: {
      timed_events: TimedEvent[];
    };
  };
}

/** A resolved prompt + continuation_target pair. */
export interface ResolvedPair {
  promptRecord: PairRecord;
  targetRecord: PairRecord;
}

// ─── Paired-record integrity check ───────────────────────────────────────────

export interface IntegrityCheckResult {
  passed: boolean;
  pairCount: number;
  orphanCount: number;
  missingPairedIds: string[];
  orphanTargetIds: string[];
  details: string;
}

/**
 * Verify that all paired records form valid (prompt, continuation_target) pairs:
 * - Every prompt has a continuation_target_window.
 * - Every continuation_target has a paired_prompt_record_id that resolves.
 * - No orphan continuation_targets (whose paired prompt doesn't exist).
 * - pair count matches expected (22 for the full Slice 5 corpus).
 */
export function checkPairedIntegrity(
  allRecords: PairRecord[],
  expectedPairCount: number,
): IntegrityCheckResult {
  const byId = new Map<string, PairRecord>();
  for (const r of allRecords) {
    byId.set(r.id, r);
  }

  const prompts = allRecords.filter((r) => r.scope.window_role === "prompt");
  const targets = allRecords.filter(
    (r) => r.scope.window_role === "continuation_target",
  );

  const missingPairedIds: string[] = [];
  const orphanTargetIds: string[] = [];

  // Check every target resolves to a real prompt.
  for (const target of targets) {
    const pairedId = target.scope.paired_prompt_record_id;
    if (!pairedId) {
      orphanTargetIds.push(
        `${target.id} — missing paired_prompt_record_id field`,
      );
    } else if (!byId.has(pairedId)) {
      missingPairedIds.push(
        `${target.id} → paired_prompt_record_id "${pairedId}" not found`,
      );
      orphanTargetIds.push(`${target.id} — paired prompt "${pairedId}" not in corpus`);
    }
  }

  // Check every prompt has a matching target.
  for (const prompt of prompts) {
    const expectedTargetId = allRecords.find(
      (r) =>
        r.scope.window_role === "continuation_target" &&
        r.scope.paired_prompt_record_id === prompt.id,
    );
    if (!expectedTargetId) {
      orphanTargetIds.push(
        `Prompt ${prompt.id} has no matching continuation_target`,
      );
    }
  }

  const pairCount = prompts.length;
  const orphanCount = orphanTargetIds.length + missingPairedIds.length;
  const passed =
    orphanCount === 0 &&
    missingPairedIds.length === 0 &&
    pairCount === expectedPairCount &&
    targets.length === pairCount;

  let details: string;
  if (passed) {
    details = `All ${pairCount} pairs valid. 0 orphans. pair_count=${pairCount}/${expectedPairCount}.`;
  } else {
    const issues: string[] = [];
    if (pairCount !== expectedPairCount) {
      issues.push(
        `pair count mismatch: found ${pairCount}, expected ${expectedPairCount}`,
      );
    }
    if (targets.length !== pairCount) {
      issues.push(
        `target count mismatch: found ${targets.length} targets, ${pairCount} prompts`,
      );
    }
    if (missingPairedIds.length > 0) {
      issues.push(`missing paired prompt IDs: ${missingPairedIds.join("; ")}`);
    }
    if (orphanTargetIds.length > 0) {
      issues.push(`orphan targets: ${orphanTargetIds.join("; ")}`);
    }
    details = `INTEGRITY FAIL — ${issues.join(" | ")}`;
  }

  return {
    passed,
    pairCount,
    orphanCount,
    missingPairedIds,
    orphanTargetIds,
    details,
  };
}

/**
 * Resolve all (prompt, continuation_target) pairs from a flat record list.
 * Pairs are ordered by prompt ID for deterministic output.
 */
export function resolvePairs(allRecords: PairRecord[]): ResolvedPair[] {
  const byId = new Map<string, PairRecord>();
  for (const r of allRecords) byId.set(r.id, r);

  const prompts = allRecords
    .filter((r) => r.scope.window_role === "prompt")
    .sort((a, b) => a.id.localeCompare(b.id));

  const pairs: ResolvedPair[] = [];
  for (const prompt of prompts) {
    const target = allRecords.find(
      (r) =>
        r.scope.window_role === "continuation_target" &&
        r.scope.paired_prompt_record_id === prompt.id,
    );
    if (target) {
      pairs.push({ promptRecord: prompt, targetRecord: target });
    }
  }
  return pairs;
}

// ─── Per-pair eval result ──────────────────────────────────────────────────────

export interface ShuffleStatus {
  computable: boolean;
  reason?: string;
}

export interface PairMetrics {
  noteOverlap_goldVsGold: MetricResult;     // sanity: should be 1.0
  noteOverlap_goldVsShuffled: MetricResult; // may not diverge much (see docstring)
  pitchClassOA_goldVsShuffled: MetricResult; // sanity: should be ≈ 1.0
  rhythmSimilarity_goldVsShuffled: MetricResult; // should diverge
  grooveSimilarity_goldVsShuffled: MetricResult; // canonical metric
}

export interface PairE2Result {
  promptId: string;
  targetId: string;
  songId: string;
  timeSignature: string;
  targetMeasureRange: string;
  targetEventCount: number;
  targetBarCount: number;
  shuffleStatus: ShuffleStatus;
  metrics: PairMetrics;
}

// ─── Per-pair evaluation ──────────────────────────────────────────────────────

/**
 * Evaluate a single (prompt, continuation_target) pair across all 4 metrics.
 */
export function evaluatePair(pair: ResolvedPair): PairE2Result {
  const target = pair.targetRecord;
  const goldEvents = target.observation.midi_sidecar.timed_events;
  const timeSignature = target.scope.time_signature;

  // Extract phrase start measure from phrase_window string "measures N-M".
  const phraseMatch = /measures (\d+)-(\d+)/.exec(target.scope.phrase_window);
  const phraseStartMeasure = phraseMatch ? parseInt(phraseMatch[1], 10) : 1;
  const targetMeasures = [...new Set(goldEvents.map((e) => e.measure))];

  // Generate shuffled-bars control.
  const shuffledResult = shuffleBars(goldEvents);
  const shuffleOk = !isNotComputable(shuffledResult);
  const shuffleStatus: ShuffleStatus = shuffleOk
    ? { computable: true }
    : {
        computable: false,
        reason: (shuffledResult as NotComputable).reason,
      };

  const shuffledEvents = shuffleOk ? (shuffledResult as TimedEvent[]) : [];

  // Metric 1a: Note overlap — gold vs gold (sanity check, must be 1.0).
  const noteOverlap_goldVsGold = computeNoteOverlap(
    goldEvents,
    goldEvents,
    phraseStartMeasure,
  );

  // Metric 1b: Note overlap — gold vs shuffled.
  const noteOverlap_goldVsShuffled = shuffleOk
    ? computeNoteOverlap(goldEvents, shuffledEvents, phraseStartMeasure)
    : notComputable(shuffleStatus.reason ?? "shuffle not computable");

  // Metric 2: Pitch-class OA — gold vs shuffled.
  const pitchClassOA_goldVsShuffled = shuffleOk
    ? computePitchClassOA(goldEvents, shuffledEvents)
    : notComputable(shuffleStatus.reason ?? "shuffle not computable");

  // Metric 3: Rhythm similarity — gold vs shuffled.
  const rhythmSimilarity_goldVsShuffled = shuffleOk
    ? computeRhythmSimilarity(
        goldEvents,
        shuffledEvents,
        timeSignature,
        phraseStartMeasure,
      )
    : notComputable(shuffleStatus.reason ?? "shuffle not computable");

  // Metric 4: Groove similarity — gold vs shuffled.
  const grooveSimilarity_goldVsShuffled = shuffleOk
    ? computeGrooveSimilarity(goldEvents, shuffledEvents, timeSignature)
    : notComputable(shuffleStatus.reason ?? "shuffle not computable");

  return {
    promptId: pair.promptRecord.id,
    targetId: target.id,
    songId: target.scope.song_id,
    timeSignature,
    targetMeasureRange: target.scope.phrase_window,
    targetEventCount: goldEvents.length,
    targetBarCount: targetMeasures.length,
    shuffleStatus,
    metrics: {
      noteOverlap_goldVsGold,
      noteOverlap_goldVsShuffled,
      pitchClassOA_goldVsShuffled,
      rhythmSimilarity_goldVsShuffled,
      grooveSimilarity_goldVsShuffled,
    },
  };
}

// ─── Aggregate metrics ────────────────────────────────────────────────────────

export interface MetricAggregate {
  metricName: string;
  computablePairCount: number;
  notComputablePairCount: number;
  goldValues: number[];
  /** mean of computable gold values */
  mean: number | null;
  /** min of computable gold values */
  min: number | null;
  /** max of computable gold values */
  max: number | null;
}

export interface AggregateE2Results {
  noteOverlap_goldVsGold: MetricAggregate;
  noteOverlap_goldVsShuffled: MetricAggregate;
  pitchClassOA_goldVsShuffled: MetricAggregate;
  rhythmSimilarity_goldVsShuffled: MetricAggregate;
  grooveSimilarity_goldVsShuffled: MetricAggregate;
}

function aggregateMetric(
  name: string,
  pairResults: PairE2Result[],
  getter: (m: PairMetrics) => MetricResult,
): MetricAggregate {
  const goldValues: number[] = [];
  let notComputableCount = 0;

  for (const r of pairResults) {
    const v = getter(r.metrics);
    if (isNotComputable(v)) {
      notComputableCount++;
    } else {
      goldValues.push(v);
    }
  }

  const mean =
    goldValues.length > 0
      ? goldValues.reduce((s, v) => s + v, 0) / goldValues.length
      : null;
  const min = goldValues.length > 0 ? Math.min(...goldValues) : null;
  const max = goldValues.length > 0 ? Math.max(...goldValues) : null;

  return {
    metricName: name,
    computablePairCount: goldValues.length,
    notComputablePairCount: notComputableCount,
    goldValues,
    mean,
    min,
    max,
  };
}

// ─── Serialization helpers ────────────────────────────────────────────────────

function serializeMetricResult(r: MetricResult): MetricResultJson {
  if (isNotComputable(r)) {
    return { not_computable: true, reason: r.reason };
  }
  return r;
}

function serializePairResult(r: PairE2Result): object {
  return {
    promptId: r.promptId,
    targetId: r.targetId,
    songId: r.songId,
    timeSignature: r.timeSignature,
    targetMeasureRange: r.targetMeasureRange,
    targetEventCount: r.targetEventCount,
    targetBarCount: r.targetBarCount,
    shuffleStatus: r.shuffleStatus,
    metrics: {
      noteOverlap_goldVsGold: serializeMetricResult(r.metrics.noteOverlap_goldVsGold),
      noteOverlap_goldVsShuffled: serializeMetricResult(r.metrics.noteOverlap_goldVsShuffled),
      pitchClassOA_goldVsShuffled: serializeMetricResult(r.metrics.pitchClassOA_goldVsShuffled),
      rhythmSimilarity_goldVsShuffled: serializeMetricResult(r.metrics.rhythmSimilarity_goldVsShuffled),
      grooveSimilarity_goldVsShuffled: serializeMetricResult(r.metrics.grooveSimilarity_goldVsShuffled),
    },
  };
}

// ─── Full E2 eval run ─────────────────────────────────────────────────────────

export interface E2EvalRun {
  evalDate: string;
  schemaVersion: string;
  integrityCheck: IntegrityCheckResult;
  pairResults: object[]; // serialized for JSON
  aggregate: {
    noteOverlap_goldVsGold: MetricAggregate;
    noteOverlap_goldVsShuffled: MetricAggregate;
    pitchClassOA_goldVsShuffled: MetricAggregate;
    rhythmSimilarity_goldVsShuffled: MetricAggregate;
    grooveSimilarity_goldVsShuffled: MetricAggregate;
  };
  hardGates: {
    integrityPassed: boolean;
    /** pairs where gold > shuffled by ≥0.05 margin on rhythm */
    rhythmGoldBeatShuffledPairCount: number;
    /** pairs where gold > shuffled by ≥0.05 margin on groove */
    grooveGoldBeatShuffledPairCount: number;
    /** Groove OA gold mean minus shuffled mean (for future-model threshold reference) */
    grooveOAMeanDelta: number | null;
    notComputableAudit: Array<{
      pairId: string;
      metric: string;
      reason: string;
    }>;
  };
}

/** Minimum margin for gold to "beat" shuffled on rhythm/groove per pair. */
export const BEAT_MARGIN = 0.05;

/** Locked future-model target margin (from synthesis Section 4, E2). */
export const FUTURE_MODEL_GROOVE_MARGIN = 0.15;

export function runFullE2Eval(
  allRecords: PairRecord[],
  expectedPairCount = 22,
): E2EvalRun {
  // 1. Integrity check.
  const integrityCheck = checkPairedIntegrity(allRecords, expectedPairCount);

  // 2. Resolve pairs.
  const pairs = resolvePairs(allRecords);

  // 3. Evaluate each pair.
  const pairResults = pairs.map((p) => evaluatePair(p));

  // 4. Aggregate.
  const aggNoteGoldVsGold = aggregateMetric(
    "note_overlap_gold_vs_gold",
    pairResults,
    (m) => m.noteOverlap_goldVsGold,
  );
  const aggNoteGoldVsShuffled = aggregateMetric(
    "note_overlap_gold_vs_shuffled",
    pairResults,
    (m) => m.noteOverlap_goldVsShuffled,
  );
  const aggPitchClassOA = aggregateMetric(
    "pitch_class_oa_gold_vs_shuffled",
    pairResults,
    (m) => m.pitchClassOA_goldVsShuffled,
  );
  const aggRhythm = aggregateMetric(
    "rhythm_similarity_gold_vs_shuffled",
    pairResults,
    (m) => m.rhythmSimilarity_goldVsShuffled,
  );
  const aggGroove = aggregateMetric(
    "groove_similarity_gold_vs_shuffled",
    pairResults,
    (m) => m.grooveSimilarity_goldVsShuffled,
  );

  // 5. Hard gate computations.

  // For rhythm: count pairs where gold < shuffled (gold is reference, we want gold > shuffled).
  // Actually in our design:
  // - gold vs gold = 1.0 (reference sanity)
  // - gold vs shuffled = lower when shuffled differs from gold ordering
  // The LOWER the gold-vs-shuffled similarity, the MORE the shuffling has changed things.
  // So: rhythmSimilarity_goldVsShuffled < (1.0 - BEAT_MARGIN) means shuffled IS different.
  //
  // Wait — re-reading the spec: "gold outperforms shuffled" means the gold continuation has
  // a HIGHER similarity to itself (trivially 1.0) vs the shuffled version having a lower
  // similarity to gold. Since we measure gold-vs-shuffled, a LOWER score means gold ≠ shuffled,
  // which is the signal we want for rhythm/groove.
  //
  // The spec says "gold outperforms shuffled by clear margin on rhythm/groove metrics."
  // This means: for rhythm/groove, the score gold-vs-shuffled should be < 1.0 (they differ),
  // and specifically gold-vs-self = 1.0 while gold-vs-shuffled < (1.0 - BEAT_MARGIN).
  //
  // In practice: rhythmSim < (1.0 - BEAT_MARGIN) → shuffling destroys ordering = GOOD signal.

  let rhythmGoldBeatShuffledPairCount = 0;
  let grooveGoldBeatShuffledPairCount = 0;

  for (const r of pairResults) {
    const rhythmSim = r.metrics.rhythmSimilarity_goldVsShuffled;
    if (!isNotComputable(rhythmSim) && rhythmSim < 1.0 - BEAT_MARGIN) {
      rhythmGoldBeatShuffledPairCount++;
    }

    const grooveSim = r.metrics.grooveSimilarity_goldVsShuffled;
    if (!isNotComputable(grooveSim) && grooveSim < 1.0 - BEAT_MARGIN) {
      grooveGoldBeatShuffledPairCount++;
    }
  }

  // Groove OA mean delta: not directly applicable here since we compute
  // gold-vs-shuffled OA (lower = more different). Report mean of gold-vs-shuffled
  // groove OA as the "groove margin reference" for future-model use.
  // Future model: grooveOA(model, gold) must exceed grooveOA(shuffled, gold) by ≥0.15.
  const grooveOAMeanDelta = aggGroove.mean !== null ? 1.0 - aggGroove.mean : null;

  // not_computable audit.
  const notComputableAudit: Array<{
    pairId: string;
    metric: string;
    reason: string;
  }> = [];
  for (const r of pairResults) {
    const checks: Array<[string, MetricResult]> = [
      ["noteOverlap_goldVsGold", r.metrics.noteOverlap_goldVsGold],
      ["noteOverlap_goldVsShuffled", r.metrics.noteOverlap_goldVsShuffled],
      ["pitchClassOA_goldVsShuffled", r.metrics.pitchClassOA_goldVsShuffled],
      ["rhythmSimilarity_goldVsShuffled", r.metrics.rhythmSimilarity_goldVsShuffled],
      ["grooveSimilarity_goldVsShuffled", r.metrics.grooveSimilarity_goldVsShuffled],
    ];
    for (const [metricName, val] of checks) {
      if (isNotComputable(val)) {
        notComputableAudit.push({
          pairId: r.targetId,
          metric: metricName,
          reason: val.reason,
        });
      }
    }
  }

  return {
    evalDate: new Date().toISOString(),
    schemaVersion: "e2-phrase-continuation/1.0.0",
    integrityCheck,
    pairResults: pairResults.map(serializePairResult),
    aggregate: {
      noteOverlap_goldVsGold: aggNoteGoldVsGold,
      noteOverlap_goldVsShuffled: aggNoteGoldVsShuffled,
      pitchClassOA_goldVsShuffled: aggPitchClassOA,
      rhythmSimilarity_goldVsShuffled: aggRhythm,
      grooveSimilarity_goldVsShuffled: aggGroove,
    },
    hardGates: {
      integrityPassed: integrityCheck.passed,
      rhythmGoldBeatShuffledPairCount,
      grooveGoldBeatShuffledPairCount,
      grooveOAMeanDelta,
      notComputableAudit,
    },
  };
}
