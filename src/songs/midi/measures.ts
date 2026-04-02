// ─── Measure Slicing ─────────────────────────────────────────────────────────
//
// Slices a flat array of resolved notes into measure buckets based on
// time signature and ticks-per-beat.
// ─────────────────────────────────────────────────────────────────────────────

import type { ResolvedNote, TimeSigEvent } from "./types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

/** A bucket of notes belonging to a single measure. */
export interface MeasureBucket {
  /** 1-based measure number. */
  number: number;
  /** Absolute tick where this measure starts. */
  startTick: number;
  /** Absolute tick where this measure ends. */
  endTick: number;
  /** Notes whose startTick falls within this measure. */
  notes: ResolvedNote[];
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Compute ticks per measure for a given time signature.
 */
export function ticksPerMeasure(
  ticksPerBeat: number,
  numerator: number,
  denominator: number,
): number {
  return ticksPerBeat * numerator * (4 / denominator);
}

/**
 * Determine total number of measures needed to contain all notes.
 */
export function computeTotalMeasures(
  notes: ResolvedNote[],
  tpm: number,
): number {
  if (notes.length === 0) return 1;
  const lastNoteTick = notes.reduce((m, n) => Math.max(m, n.startTick + n.durationTicks), -Infinity);
  return Math.max(1, Math.ceil(lastNoteTick / tpm));
}

/**
 * Slice notes into measure buckets.
 */
export function sliceIntoMeasures(
  notes: ResolvedNote[],
  totalMeasures: number,
  tpm: number,
): MeasureBucket[] {
  const buckets: MeasureBucket[] = [];

  for (let m = 0; m < totalMeasures; m++) {
    const startTick = m * tpm;
    const endTick = (m + 1) * tpm;

    buckets.push({
      number: m + 1,
      startTick,
      endTick,
      notes: notes.filter(n => n.startTick >= startTick && n.startTick < endTick),
    });
  }

  return buckets;
}

/**
 * Parse a time signature string like "4/4" or "3/4".
 * Returns { numerator, denominator } or defaults to 4/4 on invalid input.
 */
export function parseTimeSignature(
  timeSig?: string,
): { numerator: number; denominator: number } {
  if (!timeSig) return { numerator: 4, denominator: 4 };
  const parts = timeSig.split("/").map(Number);
  if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
    return { numerator: parts[0], denominator: parts[1] };
  }
  return { numerator: 4, denominator: 4 };
}

/**
 * Get effective time signature from MIDI events or config string.
 * Config string takes priority over MIDI events.
 */
export function resolveTimeSignature(
  events: TimeSigEvent[],
  configTimeSig?: string,
): { numerator: number; denominator: number } {
  if (configTimeSig) return parseTimeSignature(configTimeSig);
  if (events.length > 0) {
    return { numerator: events[0].numerator, denominator: events[0].denominator };
  }
  return { numerator: 4, denominator: 4 };
}
