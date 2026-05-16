// ─── jam-actions-v0 REMI Tokenizer ───────────────────────────────────────────
//
// Hand-rolled minimal REMI tokenizer following the Huang & Yang 2020 spec:
//   "Pop Music Transformer: Beat-based Modeling and Generation of Expressive
//    Pop Piano Compositions." arXiv:2002.00212
//
// REMI token vocabulary (5 token classes):
//   Bar_<N>          — bar (measure) marker: Bar_1, Bar_2, …
//   Position_<0-95>  — position within bar (96 positions per bar, i.e. 1/96th
//                      beat-fraction steps). Huang & Yang use 16th-triplet
//                      resolution = 96 per 4/4 measure.
//   Pitch_<0-127>    — MIDI note number (standard MIDI pitch range).
//   Velocity_<bin>   — velocity quantized to 32 bins (0, 4, 8, …, 124).
//   Duration_<N>     — duration as number of 1/16-note units (1 = 1/16, 4 = quarter).
//
// Implementation choices (documented deviations from the original paper):
//
//   1. Position quantization: The paper uses 96 positions per 4/4 bar (one 1/96th
//      per position). We adapt for arbitrary time signatures:
//      Position_0 to Position_(SUBDIVISIONS_PER_MEASURE - 1).
//      For 3/8: SUBDIVISIONS = 24 (8 × 3, using eighth-note triplet resolution).
//      For 4/4: SUBDIVISIONS = 96 (Huang & Yang original).
//      Position = round(tick_offset_in_measure / ticks_per_subdivision).
//
//   2. Bar numbering: Bar tokens are 1-indexed, matching the sidecar `measure` field.
//      The paper uses 0-indexed; we use 1-indexed for clarity (labels match score).
//
//   3. Velocity binning: 32 bins of size 4 (0–3→0, 4–7→4, …, 124–127→124).
//      This matches the original paper's velocity quantization table.
//
//   4. Duration encoding: Duration_N where N = ceil(dur_ticks / ticks_per_sixteenth).
//      Clamped to [1, 64] (64 sixteenth notes = 1 whole note in 4/4 extended).
//
//   5. Chord voicing: ALL notes in the phrase are tokenized (both hands), not just
//      the melody. Notes at the same tick cluster are sorted lowest-to-highest and
//      each emits its own Position/Pitch/Velocity/Duration quartet. The Position
//      token is only emitted once per tick cluster (shared by all simultaneous notes).
//
//   6. No Beat tokens (the paper extends REMI to include Beat_ tokens in some
//      formulations). We use Bar + Position as the full temporal context.
//
// This tokenizer produces MAESTRO/POP909-comparable REMI sequences at the
// symbolic level. Round-trip reconstruction is possible from the raw sidecar
// timed_events — tokens are derivative of the MIDI truth.
// ─────────────────────────────────────────────────────────────────────────────

import type { TimedEvent } from "./schema.js";
import type { PhraseMeta } from "./phrase-slicer.js";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Number of position subdivisions per measure for common time signatures. */
const SUBDIVISIONS: Record<string, number> = {
  "4/4": 96,
  "3/4": 72,
  "3/8": 36, // 12 per eighth × 3 beats = 36; fine-grained within each beat
  "6/8": 48, // 8 per eighth × 6 beats = 48
  "2/4": 48,
  "2/2": 96,
};

const DEFAULT_SUBDIVISIONS = 96;
const VELOCITY_BIN_SIZE = 4;
const MAX_DURATION_UNITS = 64; // max 64 sixteenth notes
const TICK_CLUSTER_TOLERANCE = 5; // ticks — simultaneous note window

// ─── Public API ──────────────────────────────────────────────────────────────

export interface RemiOptions {
  timeSignature: string;  // e.g. "3/8", "4/4"
  ticksPerBeat: number;   // from MIDI header (sidecar ticks_per_beat)
}

/**
 * Convert a phrase's timed events to REMI token strings.
 *
 * @param events  Sorted events from slicePhrase (all hands).
 * @param meta    Phrase metadata (used for measure range context).
 * @param opts    Tokenizer options.
 * @returns       Array of REMI token strings (Bar/Position/Pitch/Velocity/Duration).
 */
export function toRemi(
  events: TimedEvent[],
  meta: PhraseMeta,
  opts: RemiOptions,
): string[] {
  if (events.length === 0) return [];

  const subdivisions = SUBDIVISIONS[opts.timeSignature] ?? DEFAULT_SUBDIVISIONS;
  const ticksPerMeasure = computeTicksPerMeasure(opts.timeSignature, opts.ticksPerBeat);
  const ticksPerSubdivision = ticksPerMeasure / subdivisions;
  const ticksPerSixteenth = (opts.ticksPerBeat * 4) / 16; // always 480*4/16 = 120 for TPB=480

  const tokens: string[] = [];
  let currentMeasure = -1;

  // Group events into tick clusters (simultaneous notes).
  const clusters = groupIntoTickClusters(events, TICK_CLUSTER_TOLERANCE);

  for (const cluster of clusters) {
    // Determine which measure this cluster belongs to.
    const refEvent = cluster[0];
    const measureNum = refEvent.measure;

    // Emit Bar token when entering a new measure.
    if (measureNum !== currentMeasure) {
      tokens.push(`Bar_${measureNum}`);
      currentMeasure = measureNum;
    }

    // Compute position within the current measure.
    const measureStartTick = (measureNum - 1) * ticksPerMeasure;
    // Use the actual start tick from the sidecar.
    const tickInMeasure = Math.max(0, refEvent.t_ticks - measureStartTick);
    const positionIndex = Math.round(tickInMeasure / ticksPerSubdivision);
    const clampedPosition = Math.min(positionIndex, subdivisions - 1);
    tokens.push(`Position_${clampedPosition}`);

    // Sort cluster by pitch (lowest first) for deterministic ordering.
    const sorted = [...cluster].sort((a, b) => a.note - b.note);

    for (const event of sorted) {
      // Pitch token.
      tokens.push(`Pitch_${event.note}`);

      // Velocity token — quantize to 32 bins of size 4.
      const velocityBin = Math.floor(event.velocity / VELOCITY_BIN_SIZE) * VELOCITY_BIN_SIZE;
      tokens.push(`Velocity_${Math.min(velocityBin, 124)}`);

      // Duration token — in sixteenth-note units.
      const durationUnits = Math.max(
        1,
        Math.min(MAX_DURATION_UNITS, Math.round(event.dur_ticks / ticksPerSixteenth)),
      );
      tokens.push(`Duration_${durationUnits}`);
    }
  }

  return tokens;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Group sorted timed events into clusters of simultaneous notes.
 * Events within `tolerance` ticks of the cluster start are considered simultaneous.
 */
function groupIntoTickClusters(
  events: TimedEvent[],
  tolerance: number,
): TimedEvent[][] {
  if (events.length === 0) return [];

  const clusters: TimedEvent[][] = [];
  let current: TimedEvent[] = [events[0]];
  let clusterStartTick = events[0].t_ticks;

  for (let i = 1; i < events.length; i++) {
    const e = events[i];
    if (e.t_ticks - clusterStartTick <= tolerance) {
      current.push(e);
    } else {
      clusters.push(current);
      current = [e];
      clusterStartTick = e.t_ticks;
    }
  }
  clusters.push(current);
  return clusters;
}

/**
 * Compute the number of MIDI ticks per measure given the time signature and
 * the number of ticks per beat (from the MIDI header).
 *
 * In standard MIDI: ticksPerBeat = ticks per quarter note.
 * A 3/8 measure = 3 eighth notes = 1.5 quarter notes = 1.5 × ticksPerBeat.
 * A 4/4 measure = 4 quarter notes = 4 × ticksPerBeat.
 */
function computeTicksPerMeasure(timeSignature: string, ticksPerBeat: number): number {
  const [num, den] = timeSignature.split("/").map(Number);
  if (!num || !den) return ticksPerBeat * 4; // fallback: 4/4
  // Quarter-note equivalents per measure = num * (4 / den)
  const quartersPerMeasure = (num * 4) / den;
  return Math.round(quartersPerMeasure * ticksPerBeat);
}
