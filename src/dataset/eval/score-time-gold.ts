// ─── E2v2 Slice 1.1 — Score-time gold reference channel ──────────────────────
//
// The E2v1 gate measured "reproduce this performance's phrase-level onset
// placement" far more than "continue the phrase musically" — because the gold
// `timed_events` are PERFORMANCE MIDI (rubato micro-timing lives in the onsets)
// and the shuffled-bars control inherited that exact micro-timing. See
// docs/maker-arc-e2-gate-report.md §finding-2 and docs/maker-arc-e2v2-
// instrument-design.md §6.2.1.
//
// This module is the reference repair. Two design facts, both MEASURED against
// the sealed cohort on 2026-07-22 (design §2), drive it:
//
//   1. Six of ten cohort songs are already effectively score-time; the timing
//      problem is concentrated in the four rubato songs (both Chopins,
//      Pathétique, Träumerei). A quantization applied uniformly is a no-op on
//      the clean six and a genuine correction on the four.
//   2. Debussy's off-grid onsets are NOT rubato — they are triplets the fixed
//      sixteenth grid (GRID_SLOTS_PER_BEAT = 4) cannot represent. On a
//      METER-AWARE grid Debussy's onsets land EXACTLY (measured mean |dev| =
//      0.0000). So the grid must be meter-aware, per finding F3 (the REMI
//      pipeline itself grid-aligns before tokenizing) and the Yang-Lerch
//      framework's score-quantized assumption (F1).
//
// Research grounding (design §5, verified 40/40 oracle + cross-family jury):
//   F1  Yang & Lerch 2020 — objective eval assumes a score-quantized timebase.
//   F3  Huang & Yang 2020 (REMI) — quantize onsets to the meter grid; expressive
//       timing is factored OUT of onsets (into tempo), never left in them.
//   F6  Gillick et al. 2019 — performance = quantized score + timing residual;
//       composition metrics read only the score channel.
//   F7  Liu et al. 2022 — recovering score rhythm from rubato is a research
//       problem; NAIVE uniform nearest-sixteenth snapping is known-inadequate,
//       so we (a) snap on a meter-aware grid and (b) MEASURE the residual we
//       paper over per item and let the screen exclude items we cannot recover.
//
// Nothing here edits the sealed E2v1 primitives (phrase-continuation.ts): the
// FUTURE_MODEL_GROOVE_MARGIN, shuffleBars, and GRID_SLOTS_PER_BEAT constants
// stay byte-identical. E2v2 is additive.
//
// Deterministic; no LLM calls; no HTTP.
// ─────────────────────────────────────────────────────────────────────────────

import type { TimedEvent } from "../schema.js";
import { notComputable, type NotComputable } from "./phrase-continuation.js";

// ─── Meter-aware grid ─────────────────────────────────────────────────────────

/**
 * The fine meter-aware resolution: 96 subdivisions per WHOLE NOTE, i.e. 24 per
 * quarter. This is the Huang & Yang 2020 REMI resolution (96 positions per 4/4
 * bar) generalized to any time signature — 24/quarter captures sixteenths
 * (24/4 = 6), eighth-note triplets (24/3 = 8), and sixteenth-note triplets
 * (24/6 = 4) without residue.
 *
 * subdivisionsPerMeasure = numerator × 96 / denominator reproduces the REMI
 * adapter's SUBDIVISIONS lookup EXACTLY for every time signature present in the
 * corpus (4/4→96, 3/4→72, 3/8→36, 2/4→48, 2/2→96) and extends cleanly to the
 * cohort's 9/8 (→108), which that hand-rolled lookup omits. It differs only on
 * 6/8 (formula 72 vs lookup 48), which is absent from the corpus. See the
 * `mirrors the REMI adapter` test in score-time-gold.test.ts.
 */
export const FINE_SUBDIVISIONS_PER_WHOLE = 96;

/** Parsed meter with both the fine grid and the per-beat subdivision count. */
export interface MeterGrid {
  numerator: number;
  denominator: number;
  /** Denominator-beats per measure (the unit the `beat` field counts in). */
  beatsPerMeasure: number;
  /** Fine subdivisions per measure (numerator × 96 / denominator). */
  subdivisionsPerMeasure: number;
  /** Fine subdivisions per denominator-beat (96 / denominator). */
  subdivisionsPerBeat: number;
}

/**
 * Parse a "N/D" time signature into its meter-aware grid. Returns not_computable
 * for an unparseable signature — never guesses a fallback that would silently
 * mis-bin onsets.
 */
export function meterAwareGrid(timeSignature: string): MeterGrid | NotComputable {
  const m = /^(\d+)\/(\d+)$/.exec(timeSignature.trim());
  if (!m) return notComputable(`cannot parse time signature: "${timeSignature}"`);
  const numerator = parseInt(m[1], 10);
  const denominator = parseInt(m[2], 10);
  if (numerator <= 0 || denominator <= 0) {
    return notComputable(`degenerate time signature: "${timeSignature}"`);
  }
  const subdivisionsPerBeat = FINE_SUBDIVISIONS_PER_WHOLE / denominator;
  return {
    numerator,
    denominator,
    beatsPerMeasure: numerator,
    subdivisionsPerMeasure: numerator * subdivisionsPerBeat,
    subdivisionsPerBeat,
  };
}

// ─── Score-time re-quantization ──────────────────────────────────────────────

export interface RequantizeOptions {
  /**
   * The score-grid resolution to snap onsets to, in slots per denominator-beat.
   * This is the `[LOCK]` timing knob (design §6.2.1 / Fork 5): coarser removes
   * more performance micro-timing; finer stays faithful. It MUST stay
   * triplet-compatible (a multiple of 3) to keep Debussy's triplets exact.
   *
   * Default 12 (twelfths of a beat): captures sixteenths (12/4 = 3),
   * eighth-triplets (12/3 = 4), and sixteenth-triplets (12/6 = 2), while
   * collapsing sub-1/12-beat jitter — the smallest meter-aware grid that both
   * fixes Debussy and quantizes rubato. Slice 3 pre-measures {6, 12, 24} against
   * gold-vs-foil separation and LOCKs the value. See DEFAULT_SCORE_SUBDIVISIONS.
   */
  scoreSubdivisionsPerBeat?: number;
}

/**
 * The default score-grid resolution (slots per denominator-beat). A `[LOCK]`
 * candidate — Slice 3 pre-measurement confirms or replaces it before any
 * training run, per Fork 5.
 */
export const DEFAULT_SCORE_SUBDIVISIONS = 12;

/** One event's re-quantization audit. */
export interface RequantizedEvent {
  event: TimedEvent;
  /** measure-relative beat before snapping. */
  originalBeat: number;
  /** measure-relative beat after snapping to the score grid. */
  snappedBeat: number;
  /** |originalBeat − snappedBeat|: the performance micro-timing papered over. */
  residualBeats: number;
}

export interface RequantizeResult {
  events: TimedEvent[];
  perEvent: RequantizedEvent[];
  /** Fine meter grid used for the report (independent of the score-snap grid). */
  grid: MeterGrid;
  scoreSubdivisionsPerBeat: number;
}

/**
 * Re-quantize performance onsets onto a meter-aware score grid, BEAT-RELATIVE
 * (each onset snaps to the nearest score slot; the integer-beat component is
 * preserved because the slots are anchored at every beat). This is NOT naive
 * nearest-sixteenth snapping (F7): the grid is meter-aware, so triplets land on
 * their own slots instead of being forced onto the sixteenth lattice.
 *
 * Only the `beat` field (and the derived `t_ticks`, kept consistent) is
 * changed — pitch, duration, hand, and measure are untouched. Event COUNT is
 * preserved: no note is merged or dropped, so the validation's
 * event-count-preserved invariant holds by construction (a collision on the
 * score grid keeps both events, they simply share a slot in the histogram).
 */
export function requantizeToScoreTime(
  events: TimedEvent[],
  timeSignature: string,
  opts: RequantizeOptions = {},
): RequantizeResult | NotComputable {
  const grid = meterAwareGrid(timeSignature);
  if ("not_computable" in grid) return grid;

  const scoreSubdivisionsPerBeat = opts.scoreSubdivisionsPerBeat ?? DEFAULT_SCORE_SUBDIVISIONS;
  if (scoreSubdivisionsPerBeat <= 0 || !Number.isFinite(scoreSubdivisionsPerBeat)) {
    return notComputable(`invalid scoreSubdivisionsPerBeat: ${scoreSubdivisionsPerBeat}`);
  }

  const perEvent: RequantizedEvent[] = [];
  const out: TimedEvent[] = [];
  // ticks per denominator-beat (for keeping t_ticks consistent with snapped beat)
  const ticksPerBeat = tickHint(events);

  for (const e of events) {
    const originalBeat = e.beat;
    const snappedBeat = Math.round(originalBeat * scoreSubdivisionsPerBeat) / scoreSubdivisionsPerBeat;
    const residualBeats = Math.abs(originalBeat - snappedBeat);
    // Keep t_ticks internally consistent when we know the tick scale; the
    // metric reads `beat`, but a consistent t_ticks keeps the record honest.
    const measureStartTick = ticksPerBeat !== null ? (e.measure - 1) * ticksPerBeat * grid.beatsPerMeasure : e.t_ticks;
    const snapped: TimedEvent = {
      ...e,
      beat: snappedBeat,
      ...(ticksPerBeat !== null
        ? { t_ticks: Math.round(measureStartTick + snappedBeat * ticksPerBeat) }
        : {}),
    };
    out.push(snapped);
    perEvent.push({ event: snapped, originalBeat, snappedBeat, residualBeats });
  }

  return { events: out, perEvent, grid, scoreSubdivisionsPerBeat };
}

/**
 * Infer ticks-per-denominator-beat from an event whose (t_ticks, measure, beat)
 * are internally consistent, so we can keep t_ticks aligned after snapping.
 * Returns null when it cannot be inferred (metric uses `beat`, so null is safe).
 */
function tickHint(events: TimedEvent[]): number | null {
  for (const e of events) {
    if (e.beat > 0 && e.t_ticks > 0) {
      // t_ticks = measureStart + beat * ticksPerBeat; without measureStart we
      // cannot isolate ticksPerBeat from one event. Use a two-event solve.
    }
  }
  // Two-event solve within the same measure: Δt_ticks / Δbeat = ticksPerBeat.
  const byMeasure = new Map<number, TimedEvent[]>();
  for (const e of events) {
    const arr = byMeasure.get(e.measure) ?? [];
    arr.push(e);
    byMeasure.set(e.measure, arr);
  }
  for (const arr of byMeasure.values()) {
    for (let i = 1; i < arr.length; i++) {
      const db = arr[i].beat - arr[0].beat;
      const dt = arr[i].t_ticks - arr[0].t_ticks;
      if (Math.abs(db) > 1e-6 && dt !== 0) {
        const tpb = dt / db;
        if (tpb > 0 && Number.isFinite(tpb)) return tpb;
      }
    }
  }
  return null;
}

// ─── Per-item validation (drives the screen) ─────────────────────────────────

export interface ScoreTimeValidation {
  songId: string;
  phraseWindow: string;
  timeSignature: string;
  eventCount: number;
  /** No note merged or dropped by the transform. */
  eventCountPreserved: boolean;
  scoreSubdivisionsPerBeat: number;
  /** Max micro-timing papered over across the item's onsets (beats). */
  maxResidualBeats: number;
  meanResidualBeats: number;
  /** Onsets whose residual exceeds toleranceBeats (unreliably recoverable). */
  onsetsOverTolerance: number;
  toleranceBeats: number;
  /** Fraction of onsets over tolerance. */
  fractionOverTolerance: number;
  /** True iff the item's score-time recovery is trustworthy under the [LOCK]s. */
  valid: boolean;
}

export interface ValidateOptions extends RequantizeOptions {
  /**
   * Max micro-timing an onset may be off its assigned score slot before it is
   * "not cleanly recoverable" (beats). `[LOCK]` — Slice 3 sets it. Default half
   * a score slot at the default 12/beat grid (1/24 beat), the point past which
   * a snap is as likely to have chosen the wrong slot as the right one.
   */
  toleranceBeats?: number;
  /**
   * Max fraction of an item's onsets allowed over tolerance before the item is
   * flagged invalid and excluded by the screen. `[LOCK]`. Default 0.10.
   */
  maxFractionOverTolerance?: number;
}

/** Default per-onset residual tolerance (beats). A `[LOCK]` candidate. */
export const DEFAULT_TOLERANCE_BEATS = 1 / 24;
/** Default max fraction of onsets over tolerance. A `[LOCK]` candidate. */
export const DEFAULT_MAX_FRACTION_OVER_TOLERANCE = 0.1;

/**
 * Validate whether an item's gold can be trusted as score-time after
 * re-quantization. An item that fails is FLAGGED for exclusion by the screen —
 * never silently kept (the honesty rail from design §6.2.1). Model-blind:
 * reads gold only.
 */
export function validateScoreTime(
  goldEvents: TimedEvent[],
  timeSignature: string,
  songId: string,
  phraseWindow: string,
  opts: ValidateOptions = {},
): ScoreTimeValidation | NotComputable {
  const requant = requantizeToScoreTime(goldEvents, timeSignature, opts);
  if ("not_computable" in requant) return requant;

  const toleranceBeats = opts.toleranceBeats ?? DEFAULT_TOLERANCE_BEATS;
  const maxFractionOverTolerance = opts.maxFractionOverTolerance ?? DEFAULT_MAX_FRACTION_OVER_TOLERANCE;

  const residuals = requant.perEvent.map((p) => p.residualBeats);
  const eventCount = goldEvents.length;
  const maxResidualBeats = residuals.length ? Math.max(...residuals) : 0;
  const meanResidualBeats = residuals.length
    ? residuals.reduce((a, b) => a + b, 0) / residuals.length
    : 0;
  const onsetsOverTolerance = residuals.filter((r) => r > toleranceBeats + 1e-9).length;
  const fractionOverTolerance = eventCount > 0 ? onsetsOverTolerance / eventCount : 0;
  const eventCountPreserved = requant.events.length === eventCount;
  const valid = eventCountPreserved && fractionOverTolerance <= maxFractionOverTolerance + 1e-9;

  return {
    songId,
    phraseWindow,
    timeSignature,
    eventCount,
    eventCountPreserved,
    scoreSubdivisionsPerBeat: requant.scoreSubdivisionsPerBeat,
    maxResidualBeats,
    meanResidualBeats,
    onsetsOverTolerance,
    toleranceBeats,
    fractionOverTolerance,
    valid,
  };
}

// ─── Meter-aware groove histogram (the RHYTHM axis) ──────────────────────────

/**
 * Build a meter-aware, phrase-level groove histogram: onset density by absolute
 * grid slot across the phrase. Unlike phrase-continuation.ts's
 * buildGrooveHistogram (fixed GRID_SLOTS_PER_BEAT = 4), this bins on the
 * meter-aware `subdivisionsPerBeat`, so triplets occupy their own slots and are
 * not mis-binned onto the sixteenth lattice.
 *
 * Order-sensitive (bar j's slots are offset by j × subdivisionsPerMeasure), so
 * bar order matters — the property the groove metric needs. Normalized to sum 1.
 */
export function buildMeterAwareGrooveHistogram(
  events: TimedEvent[],
  grid: MeterGrid,
  phraseStartMeasure: number,
  numBars: number,
): number[] {
  const slotsPerBar = grid.subdivisionsPerMeasure;
  const totalSlots = numBars * slotsPerBar;
  const hist = new Array<number>(totalSlots).fill(0);
  for (const e of events) {
    const barIndex = e.measure - phraseStartMeasure;
    if (barIndex < 0 || barIndex >= numBars) continue;
    const slotInBar = Math.round(e.beat * grid.subdivisionsPerBeat);
    const slot = barIndex * slotsPerBar + Math.min(slotInBar, slotsPerBar - 1);
    if (slot >= 0 && slot < totalSlots) hist[slot]++;
  }
  const total = hist.reduce((s, v) => s + v, 0);
  if (total === 0) return hist;
  return hist.map((v) => v / total);
}

/** Overlapped Area between two normalized histograms: Σ min(pᵢ, qᵢ) ∈ [0,1]. */
export function overlappedArea(a: number[], b: number[]): number {
  let overlap = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) overlap += Math.min(a[i], b[i]);
  return overlap;
}

/**
 * Meter-aware groove OA between a reference (gold) and another event set, on the
 * reference's own bar span. Both sides are re-quantized to the score grid first
 * so the comparison reads score time, not performance micro-timing.
 *
 * Returns not_computable when the reference cannot form a ≥1-bar groove or the
 * meter is unparseable — never a fabricated number.
 */
export function meterAwareGrooveOA(
  goldEvents: TimedEvent[],
  otherEvents: TimedEvent[],
  timeSignature: string,
  opts: RequantizeOptions = {},
): number | NotComputable {
  if (goldEvents.length === 0) return notComputable("no events in gold");
  if (otherEvents.length === 0) return notComputable("no events in the compared set");
  const grid = meterAwareGrid(timeSignature);
  if ("not_computable" in grid) return grid;

  const gq = requantizeToScoreTime(goldEvents, timeSignature, opts);
  const oq = requantizeToScoreTime(otherEvents, timeSignature, opts);
  if ("not_computable" in gq) return gq;
  if ("not_computable" in oq) return oq;

  const goldMeasures = [...new Set(gq.events.map((e) => e.measure))].sort((a, b) => a - b);
  if (goldMeasures.length < 1) return notComputable("gold has no measures");
  const phraseStart = goldMeasures[0];
  const numBars = goldMeasures[goldMeasures.length - 1] - phraseStart + 1;

  const goldHist = buildMeterAwareGrooveHistogram(gq.events, grid, phraseStart, numBars);
  const otherHist = buildMeterAwareGrooveHistogram(oq.events, grid, phraseStart, numBars);
  return overlappedArea(goldHist, otherHist);
}
