// ─── Meter — beats, tactus, and metric strength ──────────────────────────────
//
// The metrical scaffolding for beat-synchronous segmentation and salience
// weighting. All positions/durations are in QUARTER-NOTE BEATS (the unit the
// platform's DURATION_MAP uses), regardless of the time-signature denominator.
//
// Metric strength implements the metrical hierarchy — a downbeat outranks a
// mid-bar accent, which outranks a beat, which outranks an off-beat, which
// outranks a finer subdivision. Grounding: Lerdahl & Jackendoff 1983 (A
// Generative Theory of Tonal Music — metrical well-formedness / dot-grid) and
// Parncutt 1994 (A perceptual model of pulse salience, Music Perception 11(4),
// DOI:10.2307/40285633 — metric accents weight what listeners hear as
// structural). Combined with durational accent (a longer note carries more
// harmonic weight), this is what stops a passing off-beat sixteenth from
// out-voting a held downbeat chord tone — the exact failure the ACE study-swarm
// (finding 9: a non-chord tone can out-salience a real chord tone) warns about.
// ─────────────────────────────────────────────────────────────────────────────

/** Parsed meter, all fields in quarter-note-beat units. */
export interface Meter {
  numerator: number;
  denominator: number;
  /** Quarter-note beats per measure = numerator × 4 / denominator. */
  beatsPerMeasure: number;
  /** Segmentation grid step (the tactus), in quarter-note beats. */
  tactus: number;
  /** True for compound meters (6/8, 9/8, 12/8) — the beat is a dotted quarter. */
  compound: boolean;
}

/**
 * Relative metric-strength weights by hierarchy level. These are a design
 * choice (documented + tunable + validated), not a law — the profile is
 * normalized downstream, so only the RATIOS matter. Defaults follow the
 * standard 4-level dot-grid intuition (downbeat ≫ mid-bar ≫ beat ≫ off-beat ≫
 * subdivision). Raising the spread makes the analyzer trust strong-beat pitches
 * more; the validation harness is how a change here is judged.
 */
export const METRIC_WEIGHTS = {
  /** The measure downbeat (position 0). */
  downbeat: 4,
  /** The primary mid-bar accent (half-bar in even simple meters only). */
  primary: 3,
  /** An on-tactus beat. */
  beat: 2,
  /** A natural subdivision off-beat (eighth in simple, eighth in compound). */
  offbeat: 1,
  /** Anything finer / off the natural grid (sixteenths, triplet partials). */
  weak: 0.5,
} as const;

/** Float-tolerant "is `pos` an integer multiple of `unit`?" */
function approxMultiple(pos: number, unit: number): boolean {
  if (unit <= 0) return false;
  const q = pos / unit;
  return Math.abs(q - Math.round(q)) < 1e-3;
}

/**
 * Parse a time-signature string ("4/4", "3/4", "6/8") into a Meter. Degenerate
 * or unparseable input falls back to 4/4 — mirroring the whole codebase's
 * time-signature discipline (measures.ts sanitizeTimeSigParts), so a malformed
 * song can never produce a zero/negative/NaN tactus that would hang or fault
 * the segmenter.
 */
export function parseMeter(timeSignature: string): Meter {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(timeSignature ?? "");
  let numerator = 4;
  let denominator = 4;
  if (m) {
    const n = Number.parseInt(m[1], 10);
    const d = Number.parseInt(m[2], 10);
    // Same sane bounds as measures.ts (1..64); anything outside → 4/4.
    if (n >= 1 && n <= 64 && d >= 1 && d <= 64) {
      numerator = n;
      denominator = d;
    }
  }

  const beatsPerMeasure = (numerator * 4) / denominator;
  // Compound: denominator 8 with a numerator divisible by 3 and > 3 (6/8, 9/8,
  // 12/8). The felt beat is the dotted quarter (3 eighths = 1.5 quarters). 3/8
  // is simple triple, not compound.
  const compound = denominator === 8 && numerator % 3 === 0 && numerator > 3;
  const tactus = compound ? 1.5 : 4 / denominator;

  return { numerator, denominator, beatsPerMeasure, tactus, compound };
}

/**
 * Metric strength of a position within a measure (quarter-note beats from the
 * barline). Higher = more structurally accented. Used to weight each event's
 * contribution to its segment's pitch-class profile by where it is struck.
 */
export function metricStrength(posInMeasure: number, meter: Meter): number {
  const { beatsPerMeasure, tactus, compound, numerator, denominator } = meter;

  // The downbeat (and, defensively, any full-bar multiple).
  if (approxMultiple(posInMeasure, beatsPerMeasure)) return METRIC_WEIGHTS.downbeat;

  // Primary mid-bar accent: the half-bar, but only for EVEN SIMPLE meters
  // (2/4, 4/4, 2/2). Triple meters (3/4) have no felt mid-bar accent — their
  // half-bar lands on an off-beat — and compound meters express their primary
  // pulses through the tactus below instead.
  if (!compound && numerator % 2 === 0 && approxMultiple(posInMeasure, beatsPerMeasure / 2)) {
    return METRIC_WEIGHTS.primary;
  }

  // On a tactus (beat) boundary.
  if (approxMultiple(posInMeasure, tactus)) return METRIC_WEIGHTS.beat;

  // On the natural subdivision (the eighth): tactus/2 in simple meters, the
  // written eighth (4/denominator) in compound meters — where tactus/2 = 0.75
  // would wrongly weight dotted-eighth positions instead of the real eighths.
  const subdivision = compound ? 4 / denominator : tactus / 2;
  if (approxMultiple(posInMeasure, subdivision)) return METRIC_WEIGHTS.offbeat;

  // Finer than the natural grid (sixteenths) or a triplet partial that lands
  // between grid points — structurally weak.
  return METRIC_WEIGHTS.weak;
}
