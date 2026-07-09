// ─── Measure Slicing ─────────────────────────────────────────────────────────
//
// Slices a flat array of resolved notes into measure buckets based on
// time signature and ticks-per-beat.
// ─────────────────────────────────────────────────────────────────────────────

import type { ResolvedNote, TimeSigEvent } from "./types.js";
import { JamError } from "../../errors.js";

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Hard ceiling on the number of measures a single song can produce.
 * A degenerate time signature or ticksPerBeat (e.g. numerator=0) can drive
 * ticksPerMeasure toward 0 and totalMeasures toward Infinity, which turns
 * sliceIntoMeasures's for-loop into a practically permanent hang on the
 * single-threaded event loop (F-39068b04 / B-A1-024). No real song needs
 * anywhere close to 10,000 measures; anything past this is malformed input.
 */
export const MAX_MEASURES = 10_000;

/** Sane bounds for a time-signature numerator/denominator. */
const MIN_TIME_SIG_PART = 1;
const MAX_TIME_SIG_PART = 64;

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
 * Guards every input so the result is always finite and >= 1 — a
 * degenerate ticksPerBeat/numerator/denominator (e.g. from a malformed
 * MIDI time-signature meta-event) falls back to a sane default instead of
 * producing 0, negative, or non-finite ticks-per-measure (F-39068b04).
 */
export function ticksPerMeasure(
  ticksPerBeat: number,
  numerator: number,
  denominator: number,
): number {
  const safeTicksPerBeat = Number.isFinite(ticksPerBeat) && ticksPerBeat >= 1 ? ticksPerBeat : 480;
  const { numerator: safeNumerator, denominator: safeDenominator } = sanitizeTimeSigParts(numerator, denominator);
  const tpm = safeTicksPerBeat * safeNumerator * (4 / safeDenominator);
  return Math.max(1, Math.round(tpm));
}

/**
 * Determine total number of measures needed to contain all notes.
 * Throws a structured JamError instead of returning Infinity/NaN when the
 * computed count is non-finite or exceeds MAX_MEASURES — this is what lets
 * initializeFromLibrary's existing per-song try/catch skip a malformed file
 * with a useful report instead of sliceIntoMeasures hanging the process
 * (F-39068b04 / B-A1-024).
 */
export function computeTotalMeasures(
  notes: ResolvedNote[],
  tpm: number,
  context?: { songId?: string; source?: string },
): number {
  if (notes.length === 0) return 1;

  const safeTpm = Number.isFinite(tpm) && tpm >= 1 ? tpm : 1;
  const lastNoteTick = notes.reduce((m, n) => Math.max(m, n.startTick + n.durationTicks), 0);
  const totalMeasures = Math.max(1, Math.ceil(lastNoteTick / safeTpm));

  if (!Number.isFinite(totalMeasures) || totalMeasures > MAX_MEASURES) {
    const who = context?.songId ? `Song "${context.songId}"` : "This song";
    const where = context?.source ? ` (${context.source})` : "";
    throw new JamError({
      code: "INPUT_INVALID_SONG",
      message: `${who}${where} would require ${Number.isFinite(totalMeasures) ? totalMeasures.toLocaleString() : "an unbounded number of"} measures ` +
        `(ticksPerMeasure=${safeTpm}, lastNoteTick=${lastNoteTick}), exceeding the maximum of ${MAX_MEASURES.toLocaleString()}.`,
      hint: "This usually means a malformed MIDI time-signature or ticksPerBeat value produced a degenerate ticks-per-measure. Check the source MIDI file's time-signature meta-events.",
    });
  }

  return totalMeasures;
}

/**
 * Slice notes into measure buckets.
 * Defensively clamps totalMeasures to MAX_MEASURES so this loop can never
 * become unbounded even if a future caller bypasses computeTotalMeasures's
 * own cap (defense-in-depth for F-39068b04).
 */
export function sliceIntoMeasures(
  notes: ResolvedNote[],
  totalMeasures: number,
  tpm: number,
): MeasureBucket[] {
  const buckets: MeasureBucket[] = [];
  const safeTotalMeasures = Number.isFinite(totalMeasures)
    ? Math.min(Math.max(1, Math.floor(totalMeasures)), MAX_MEASURES)
    : MAX_MEASURES;

  for (let m = 0; m < safeTotalMeasures; m++) {
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
 * Validate and normalize a numerator/denominator pair. Falls back to 4/4
 * when either part is missing, non-finite, non-positive, or unreasonably
 * large (> 64) — shared by parseTimeSignature (config-string path) and
 * resolveTimeSignature (MIDI-event path), which previously had NO
 * validation at all for the MIDI-derived case (the actual root cause of
 * F-39068b04: a numerator=0 MIDI time-signature event flowed straight
 * through into ticksPerMeasure unchecked).
 */
function sanitizeTimeSigParts(
  numerator: number,
  denominator: number,
): { numerator: number; denominator: number } {
  const numOk = Number.isFinite(numerator) && numerator >= MIN_TIME_SIG_PART && numerator <= MAX_TIME_SIG_PART;
  const denOk = Number.isFinite(denominator) && denominator >= MIN_TIME_SIG_PART && denominator <= MAX_TIME_SIG_PART;
  if (numOk && denOk) return { numerator, denominator };
  return { numerator: 4, denominator: 4 };
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
  if (parts.length === 2) {
    return sanitizeTimeSigParts(parts[0], parts[1]);
  }
  return { numerator: 4, denominator: 4 };
}

/**
 * Get effective time signature from MIDI events or config string.
 * Config string takes priority over MIDI events. MIDI-sourced values are
 * validated the same way as the config-string path (F-39068b04) — a
 * malformed event (e.g. numerator=0) now falls back to 4/4 instead of
 * flowing straight through into ticksPerMeasure.
 */
export function resolveTimeSignature(
  events: TimeSigEvent[],
  configTimeSig?: string,
): { numerator: number; denominator: number } {
  if (configTimeSig) return parseTimeSignature(configTimeSig);
  if (events.length > 0) {
    return sanitizeTimeSigParts(events[0].numerator, events[0].denominator);
  }
  return { numerator: 4, denominator: 4 };
}
