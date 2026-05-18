// ─── jam-actions-v0 Slice 17 — MIDI Inspector Tool Surface ───────────────────
//
// PURE, DETERMINISTIC library of inspection functions over a record's
// `observation.midi_sidecar.timed_events`. No LLM, no I/O, no global state.
// Each function takes a record (or its events array) and parameters, returns
// structured data.
//
// Designed to be exposed to a model via tool-use schemas (`callWithTools`)
// in the new `annotation-grounding-tool.ts` evaluator. The model calls these
// tools to inspect symbolic music evidence and answer MCQs.
//
// Hard rules (locked by Slice 17 kickoff):
//   - Tools are PURE: no fetch, no fs, no random, no Date.now()
//   - Tools handle missing fields gracefully (e.g. measure not present → null
//     OR empty array, never an exception)
//   - Schemas are JSON Schema draft-07 compatible (Ollama/MCP-style tool-use)
//   - NOT registered as MCP tools — this is an internal E3 evaluator surface
//
// Tool catalog:
//   1. get_events_in_measure       (record, measure_number)
//   2. get_events_in_hand          (record, hand)
//   3. count_distinct_pitch_classes(record, measure_range?)
//   4. count_beat_1_onsets         (record)
//   5. get_pitch_at                (record, measure, beat, hand?)
//   6. get_hand_balance            (record)
//   7. find_highest_pitch          (record, hand?)
//   8. find_lowest_pitch           (record, hand?)
//
// ─────────────────────────────────────────────────────────────────────────────

import type { TimedEvent } from "../schema.js";
import type { E3Record } from "./annotation-grounding.js";
import { noteName, pitchClassName } from "./annotation-grounding.js";

// ─── Tolerances ──────────────────────────────────────────────────────────────

/** Beat-equality tolerance for nearest-position lookup in `get_pitch_at`. */
export const BEAT_EPSILON = 0.1;

/** Threshold for the "beat 1" indexing heuristic (see annotation-grounding.ts). */
const DOWNBEAT_THRESHOLD = 0.5;

// ─── Inspector result shape — a slim view of TimedEvent ──────────────────────

/**
 * The slim event object returned by inspector tools to the model.
 * We do NOT return the full TimedEvent (t_seconds, t_ticks, etc.) — those add
 * noise without informing MCQ answers. The model sees only: hand, measure,
 * beat, pitch (MIDI number), name (note name string).
 */
export interface InspectorEvent {
  hand: "right" | "left";
  measure: number;
  beat: number;
  pitch: number;
  name: string;
}

function slim(e: TimedEvent): InspectorEvent {
  return {
    hand: e.hand,
    measure: e.measure,
    beat: e.beat,
    pitch: e.note,
    name: e.name,
  };
}

// ─── Internal helper: extract events from record-or-events input ──────────────

function eventsOf(
  recordOrEvents: E3Record | TimedEvent[] | undefined | null,
): TimedEvent[] {
  if (!recordOrEvents) return [];
  if (Array.isArray(recordOrEvents)) return recordOrEvents;
  return recordOrEvents.observation?.midi_sidecar?.timed_events ?? [];
}

// ─── Tool 1: get_events_in_measure ───────────────────────────────────────────

/**
 * Returns all events that occur in the given measure, sorted by beat ascending
 * then hand (right before left for stable ordering). Returns [] if the measure
 * has no events.
 */
export function get_events_in_measure(
  recordOrEvents: E3Record | TimedEvent[],
  measureNumber: number,
): InspectorEvent[] {
  if (!Number.isFinite(measureNumber) || measureNumber < 1) return [];
  const events = eventsOf(recordOrEvents);
  return events
    .filter((e) => e.measure === measureNumber)
    .sort((a, b) => {
      if (a.beat !== b.beat) return a.beat - b.beat;
      if (a.hand !== b.hand) return a.hand === "right" ? -1 : 1;
      return a.note - b.note;
    })
    .map(slim);
}

export const GET_EVENTS_IN_MEASURE_SCHEMA = {
  name: "get_events_in_measure",
  description:
    "Return all MIDI events (notes) that occur in the given measure of the phrase, " +
    "with hand, beat (measure-relative, 0-indexed), pitch (MIDI number), and name (e.g. 'E5').",
  inputSchema: {
    type: "object",
    properties: {
      measure_number: {
        type: "integer",
        description: "1-indexed measure number within the score (matches scope.phrase_window).",
        minimum: 1,
      },
    },
    required: ["measure_number"],
    additionalProperties: false,
  },
} as const;

// ─── Tool 2: get_events_in_hand ──────────────────────────────────────────────

/**
 * Returns all events played by the given hand, sorted by measure ascending
 * then beat ascending.
 */
export function get_events_in_hand(
  recordOrEvents: E3Record | TimedEvent[],
  hand: "right" | "left",
): InspectorEvent[] {
  if (hand !== "right" && hand !== "left") return [];
  const events = eventsOf(recordOrEvents);
  return events
    .filter((e) => e.hand === hand)
    .sort((a, b) => {
      if (a.measure !== b.measure) return a.measure - b.measure;
      return a.beat - b.beat;
    })
    .map(slim);
}

export const GET_EVENTS_IN_HAND_SCHEMA = {
  name: "get_events_in_hand",
  description:
    "Return all MIDI events played by the given hand (right or left) across the entire phrase, " +
    "sorted by measure then beat.",
  inputSchema: {
    type: "object",
    properties: {
      hand: {
        type: "string",
        enum: ["right", "left"],
        description: "Which hand played the notes.",
      },
    },
    required: ["hand"],
    additionalProperties: false,
  },
} as const;

// ─── Tool 3: count_distinct_pitch_classes ────────────────────────────────────

/**
 * Count distinct pitch classes (C, C#, D, ..., B) across the phrase, optionally
 * restricted to a measure range [start, end] inclusive.
 * Returns { count, classes } where classes is sorted alphabetically.
 */
export function count_distinct_pitch_classes(
  recordOrEvents: E3Record | TimedEvent[],
  measureRange?: [number, number],
): { count: number; classes: string[] } {
  let events = eventsOf(recordOrEvents);
  if (measureRange) {
    const [lo, hi] = measureRange;
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi) {
      events = events.filter((e) => e.measure >= lo && e.measure <= hi);
    }
  }
  const set = new Set<string>();
  for (const e of events) set.add(pitchClassName(e.note));
  const classes = [...set].sort();
  return { count: classes.length, classes };
}

export const COUNT_DISTINCT_PITCH_CLASSES_SCHEMA = {
  name: "count_distinct_pitch_classes",
  description:
    "Count the number of DISTINCT pitch classes (C, C#, D, D#, E, F, F#, G, G#, A, A#, B) " +
    "appearing in the phrase. Optionally restrict to a measure range. " +
    "Returns the count and the sorted list of distinct pitch class names.",
  inputSchema: {
    type: "object",
    properties: {
      measure_range: {
        type: "array",
        items: { type: "integer", minimum: 1 },
        minItems: 2,
        maxItems: 2,
        description:
          "Optional [start_measure, end_measure] inclusive. Omit to count across the whole phrase.",
      },
    },
    required: [],
    additionalProperties: false,
  },
} as const;

// ─── Tool 4: count_beat_1_onsets ─────────────────────────────────────────────

/**
 * Count events that start on beat 1 (the downbeat of each measure).
 *
 * Uses the SAME indexing heuristic as `annotation-grounding.ts`:
 *   - If any beat == 0 and none == 1.0 → 0-indexed; beat 1 = beat 0
 *   - If any beat == 1.0 and none == 0 → 1-indexed; beat 1 = beat 1.0
 *   - Else (mixed) → events with beat < 0.5 count as "on or near beat 1"
 *
 * Returns { count, events } where events are the slim view of matched events.
 */
export function count_beat_1_onsets(
  recordOrEvents: E3Record | TimedEvent[],
): { count: number; events: InspectorEvent[] } {
  const events = eventsOf(recordOrEvents);
  if (events.length === 0) return { count: 0, events: [] };

  const hasZeroBeat = events.some((e) => e.beat === 0);
  const hasOneBeat = events.some((e) => e.beat === 1.0);

  let matched: TimedEvent[];
  if (hasZeroBeat && !hasOneBeat) {
    matched = events.filter((e) => e.beat === 0);
  } else if (!hasZeroBeat && hasOneBeat) {
    matched = events.filter((e) => e.beat === 1.0);
  } else {
    matched = events.filter((e) => e.beat < DOWNBEAT_THRESHOLD);
  }

  return {
    count: matched.length,
    events: matched
      .sort((a, b) => {
        if (a.measure !== b.measure) return a.measure - b.measure;
        if (a.hand !== b.hand) return a.hand === "right" ? -1 : 1;
        return a.beat - b.beat;
      })
      .map(slim),
  };
}

export const COUNT_BEAT_1_ONSETS_SCHEMA = {
  name: "count_beat_1_onsets",
  description:
    "Count events whose onset falls on beat 1 (the downbeat) of any measure in the phrase. " +
    "Returns the count and the list of matched events. Uses a robust heuristic that handles " +
    "both 0-indexed (beat=0) and 1-indexed (beat=1.0) downbeat conventions.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
} as const;

// ─── Tool 5: get_pitch_at ────────────────────────────────────────────────────

/**
 * Look up the pitch at a specific (measure, beat) position, optionally
 * filtered by hand. Uses BEAT_EPSILON (±0.1 beats) tolerance for nearest match.
 *
 * If multiple events fall within tolerance at the same (measure, hand), returns
 * the one with the smallest |beat - requested_beat|. If hand is undefined and
 * multiple hands match, returns the closest match across hands.
 *
 * Returns null when no event is found within tolerance.
 */
export function get_pitch_at(
  recordOrEvents: E3Record | TimedEvent[],
  measure: number,
  beat: number,
  hand?: "right" | "left",
): InspectorEvent | null {
  if (!Number.isFinite(measure) || !Number.isFinite(beat)) return null;
  const events = eventsOf(recordOrEvents);
  const candidates = events.filter((e) => {
    if (e.measure !== measure) return false;
    if (Math.abs(e.beat - beat) > BEAT_EPSILON) return false;
    if (hand && e.hand !== hand) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  // Pick the closest by |beat - requested|, then by smallest pitch for stable tiebreak.
  candidates.sort((a, b) => {
    const da = Math.abs(a.beat - beat);
    const db = Math.abs(b.beat - beat);
    if (da !== db) return da - db;
    return a.note - b.note;
  });
  return slim(candidates[0]);
}

export const GET_PITCH_AT_SCHEMA = {
  name: "get_pitch_at",
  description:
    "Look up the pitch played at a specific (measure, beat) position, optionally restricted to a hand. " +
    `Uses a ±${BEAT_EPSILON}-beat tolerance for nearest match. ` +
    "Returns the event (or null if no event falls within tolerance). " +
    "If multiple events match, returns the one closest in beat to the requested position.",
  inputSchema: {
    type: "object",
    properties: {
      measure: {
        type: "integer",
        minimum: 1,
        description: "1-indexed measure number.",
      },
      beat: {
        type: "number",
        minimum: 0,
        description: "Measure-relative beat (0-indexed, as stored in timed_events).",
      },
      hand: {
        type: "string",
        enum: ["right", "left"],
        description: "Optional hand filter. Omit to search both hands.",
      },
    },
    required: ["measure", "beat"],
    additionalProperties: false,
  },
} as const;

// ─── Tool 6: get_hand_balance ────────────────────────────────────────────────

/**
 * Return counts of right-hand vs left-hand events and the ratio rh/(rh+lh).
 * Returns { right_count, left_count, ratio } where ratio is in [0, 1] (or null
 * if both counts are zero).
 */
export function get_hand_balance(
  recordOrEvents: E3Record | TimedEvent[],
): { right_count: number; left_count: number; ratio: number | null } {
  const events = eventsOf(recordOrEvents);
  let rh = 0;
  let lh = 0;
  for (const e of events) {
    if (e.hand === "right") rh++;
    else if (e.hand === "left") lh++;
  }
  const total = rh + lh;
  return {
    right_count: rh,
    left_count: lh,
    ratio: total > 0 ? rh / total : null,
  };
}

export const GET_HAND_BALANCE_SCHEMA = {
  name: "get_hand_balance",
  description:
    "Return the count of right-hand and left-hand events plus the ratio rh/(rh+lh). " +
    "Useful for deciding which hand plays more notes in the phrase.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
} as const;

// ─── Tool 7: find_highest_pitch ──────────────────────────────────────────────

/**
 * Find the event with the highest MIDI pitch, optionally restricted to a hand.
 * Ties broken by earliest (measure, beat).
 * Returns null if no events match.
 */
export function find_highest_pitch(
  recordOrEvents: E3Record | TimedEvent[],
  hand?: "right" | "left",
): InspectorEvent | null {
  const events = eventsOf(recordOrEvents);
  const filtered = hand ? events.filter((e) => e.hand === hand) : events;
  if (filtered.length === 0) return null;
  let best = filtered[0];
  for (const e of filtered) {
    if (
      e.note > best.note ||
      (e.note === best.note &&
        (e.measure < best.measure ||
          (e.measure === best.measure && e.beat < best.beat)))
    ) {
      best = e;
    }
  }
  return slim(best);
}

export const FIND_HIGHEST_PITCH_SCHEMA = {
  name: "find_highest_pitch",
  description:
    "Find the highest-pitched event in the phrase, optionally restricted to one hand. " +
    "Returns the event with the largest MIDI note number (ties broken by earliest measure+beat).",
  inputSchema: {
    type: "object",
    properties: {
      hand: {
        type: "string",
        enum: ["right", "left"],
        description: "Optional hand filter. Omit to search both hands.",
      },
    },
    required: [],
    additionalProperties: false,
  },
} as const;

// ─── Tool 8: find_lowest_pitch ───────────────────────────────────────────────

/**
 * Find the event with the lowest MIDI pitch, optionally restricted to a hand.
 * Ties broken by earliest (measure, beat).
 * Returns null if no events match.
 */
export function find_lowest_pitch(
  recordOrEvents: E3Record | TimedEvent[],
  hand?: "right" | "left",
): InspectorEvent | null {
  const events = eventsOf(recordOrEvents);
  const filtered = hand ? events.filter((e) => e.hand === hand) : events;
  if (filtered.length === 0) return null;
  let best = filtered[0];
  for (const e of filtered) {
    if (
      e.note < best.note ||
      (e.note === best.note &&
        (e.measure < best.measure ||
          (e.measure === best.measure && e.beat < best.beat)))
    ) {
      best = e;
    }
  }
  return slim(best);
}

export const FIND_LOWEST_PITCH_SCHEMA = {
  name: "find_lowest_pitch",
  description:
    "Find the lowest-pitched event in the phrase, optionally restricted to one hand. " +
    "Returns the event with the smallest MIDI note number (ties broken by earliest measure+beat).",
  inputSchema: {
    type: "object",
    properties: {
      hand: {
        type: "string",
        enum: ["right", "left"],
        description: "Optional hand filter. Omit to search both hands.",
      },
    },
    required: [],
    additionalProperties: false,
  },
} as const;

// ─── Tool catalog (the 8 tools as a registry) ────────────────────────────────

/**
 * Registry mapping tool name → { schema, run }.
 * `run(record, args)` invokes the underlying impl with parsed arguments from the
 * model's tool call. Returns the impl result (already JSON-serializable).
 *
 * Tools handle bad arguments defensively: unknown or missing required fields
 * are coerced to null/empty results rather than thrown. This matches the
 * "tools must handle malformed args gracefully" requirement.
 */
export interface InspectorTool {
  name: string;
  schema: typeof GET_EVENTS_IN_MEASURE_SCHEMA;
  run: (record: E3Record, args: Record<string, unknown>) => unknown;
}

function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asHand(v: unknown): "right" | "left" | undefined {
  if (v === "right" || v === "left") return v;
  return undefined;
}

function asMeasureRange(v: unknown): [number, number] | undefined {
  if (!Array.isArray(v) || v.length !== 2) return undefined;
  const lo = asInt(v[0]);
  const hi = asInt(v[1]);
  if (lo === null || hi === null) return undefined;
  return [lo, hi];
}

export const INSPECTOR_TOOLS: InspectorTool[] = [
  {
    name: "get_events_in_measure",
    schema: GET_EVENTS_IN_MEASURE_SCHEMA,
    run: (record, args) => {
      const m = asInt(args.measure_number);
      if (m === null) return [];
      return get_events_in_measure(record, m);
    },
  },
  {
    name: "get_events_in_hand",
    schema: GET_EVENTS_IN_HAND_SCHEMA as unknown as typeof GET_EVENTS_IN_MEASURE_SCHEMA,
    run: (record, args) => {
      const h = asHand(args.hand);
      if (!h) return [];
      return get_events_in_hand(record, h);
    },
  },
  {
    name: "count_distinct_pitch_classes",
    schema: COUNT_DISTINCT_PITCH_CLASSES_SCHEMA as unknown as typeof GET_EVENTS_IN_MEASURE_SCHEMA,
    run: (record, args) => {
      const mr = asMeasureRange(args.measure_range);
      return count_distinct_pitch_classes(record, mr);
    },
  },
  {
    name: "count_beat_1_onsets",
    schema: COUNT_BEAT_1_ONSETS_SCHEMA as unknown as typeof GET_EVENTS_IN_MEASURE_SCHEMA,
    run: (record) => count_beat_1_onsets(record),
  },
  {
    name: "get_pitch_at",
    schema: GET_PITCH_AT_SCHEMA as unknown as typeof GET_EVENTS_IN_MEASURE_SCHEMA,
    run: (record, args) => {
      const m = asInt(args.measure);
      const b = asNum(args.beat);
      const h = asHand(args.hand);
      if (m === null || b === null) return null;
      return get_pitch_at(record, m, b, h);
    },
  },
  {
    name: "get_hand_balance",
    schema: GET_HAND_BALANCE_SCHEMA as unknown as typeof GET_EVENTS_IN_MEASURE_SCHEMA,
    run: (record) => get_hand_balance(record),
  },
  {
    name: "find_highest_pitch",
    schema: FIND_HIGHEST_PITCH_SCHEMA as unknown as typeof GET_EVENTS_IN_MEASURE_SCHEMA,
    run: (record, args) => {
      const h = asHand(args.hand);
      return find_highest_pitch(record, h);
    },
  },
  {
    name: "find_lowest_pitch",
    schema: FIND_LOWEST_PITCH_SCHEMA as unknown as typeof GET_EVENTS_IN_MEASURE_SCHEMA,
    run: (record, args) => {
      const h = asHand(args.hand);
      return find_lowest_pitch(record, h);
    },
  },
];

/** Tool catalog list used by tool-use exposers (schemas only). */
export function inspectorToolSchemas(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  return INSPECTOR_TOOLS.map((t) => ({
    name: t.schema.name,
    description: t.schema.description,
    inputSchema: t.schema.inputSchema as Record<string, unknown>,
  }));
}

/** Find a tool by name. Returns null when unknown. */
export function findInspectorTool(name: string): InspectorTool | null {
  return INSPECTOR_TOOLS.find((t) => t.name === name) ?? null;
}

// ─── Re-export note-name helpers for callers ─────────────────────────────────

export { noteName, pitchClassName };
