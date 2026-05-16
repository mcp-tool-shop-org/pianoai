// ─── jam-actions-v0 Phrase Slicer ────────────────────────────────────────────
//
// Slices a song's MIDI sidecar events to a measure window and returns the
// filtered events plus phrase-level metadata.
//
// Design decisions (per synthesis Slice 1 resolution #2):
//   - Preserves MIDI tick truth as canonical. No anacrusis "fixing".
//   - A note belongs to a phrase if its START measure falls within [start, end].
//     Notes that start inside but sustain past the end are included (truth first).
//   - Empty result is not an error — callers must decide how to handle it.
//   - Multi-track songs: all events from all hands included; hand field is
//     preserved from the sidecar (right/left).
//
// Slice 3 scope: slicing only. ABC + REMI conversion live in separate adapters.
// ─────────────────────────────────────────────────────────────────────────────

import type { TimedEvent } from "./schema.js";

// ─── Public types ────────────────────────────────────────────────────────────

export interface PhraseWindow {
  /** Inclusive start measure (1-indexed). */
  start_measure: number;
  /** Inclusive end measure (1-indexed). */
  end_measure: number;
}

export interface PhraseMeta {
  /** Canonical measure range string, e.g. "measures 1-8". */
  phrase_window: string;
  measure_range: [number, number];
  /** Absolute tick of the first event in the phrase (or null if empty). */
  start_tick: number | null;
  /** Absolute tick of the last note-OFF boundary in the phrase (or null if empty). */
  end_tick: number | null;
  /** Wall-clock start time in seconds of the first event (or null if empty). */
  start_seconds: number | null;
  /** Wall-clock end time in seconds of the last note-OFF boundary (or null if empty). */
  end_seconds: number | null;
  /** Count of events in the slice. */
  event_count: number;
  /** How many distinct measures were found in the slice. */
  measure_count: number;
}

export interface SliceResult {
  events: TimedEvent[];
  meta: PhraseMeta;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Slice a list of timed events to a measure window.
 *
 * @param events   Full list of timed events from the MIDI sidecar.
 * @param window   The measure range to extract [start_measure, end_measure],
 *                 both inclusive and 1-indexed.
 * @returns        Filtered events (sorted by t_ticks ascending) + phrase metadata.
 */
export function slicePhrase(
  events: TimedEvent[],
  window: PhraseWindow,
): SliceResult {
  const { start_measure, end_measure } = window;

  // Filter: include notes whose START measure falls within the window.
  const filtered = events.filter(
    (e) => e.measure >= start_measure && e.measure <= end_measure,
  );

  // Sort by tick then note number (stable ordering for REMI).
  const sorted = [...filtered].sort(
    (a, b) => a.t_ticks - b.t_ticks || a.note - b.note,
  );

  // Compute metadata.
  let startTick: number | null = null;
  let endTick: number | null = null;
  let startSeconds: number | null = null;
  let endSeconds: number | null = null;
  const measuresFound = new Set<number>();

  for (const e of sorted) {
    const noteEndTick = e.t_ticks + e.dur_ticks;
    const noteEndSeconds = e.t_seconds + e.dur_seconds;

    measuresFound.add(e.measure);

    if (startTick === null || e.t_ticks < startTick) {
      startTick = e.t_ticks;
      startSeconds = e.t_seconds;
    }
    if (endTick === null || noteEndTick > endTick) {
      endTick = noteEndTick;
      endSeconds = noteEndSeconds;
    }
  }

  const meta: PhraseMeta = {
    phrase_window: `measures ${start_measure}-${end_measure}`,
    measure_range: [start_measure, end_measure],
    start_tick: startTick,
    end_tick: endTick,
    start_seconds: startSeconds,
    end_seconds: endSeconds,
    event_count: sorted.length,
    measure_count: measuresFound.size,
  };

  return { events: sorted, meta };
}
