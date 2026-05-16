// ─── phrase-slicer.test.ts ────────────────────────────────────────────────────
//
// Tests for src/dataset/phrase-slicer.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { slicePhrase } from "./phrase-slicer.js";
import type { TimedEvent } from "./schema.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Minimal valid TimedEvent factory. */
function makeEvent(
  measure: number,
  note: number,
  opts: Partial<TimedEvent> = {},
): TimedEvent {
  return {
    t_seconds: measure * 1.0,
    t_ticks: (measure - 1) * 480 + (opts.t_ticks ?? 0),
    dur_seconds: 0.25,
    dur_ticks: 120,
    note,
    name: "E4",
    velocity: 50,
    channel: 0,
    hand: "right",
    measure,
    beat: 0,
    ...opts,
  };
}

/** Build a simple 8-measure phrase with 2 notes per measure. */
function makeEightMeasurePhrase(): TimedEvent[] {
  const events: TimedEvent[] = [];
  for (let m = 1; m <= 8; m++) {
    events.push(makeEvent(m, 60 + m, { t_ticks: (m - 1) * 480, t_seconds: (m - 1) * 0.5 }));
    events.push(makeEvent(m, 64 + m, { t_ticks: (m - 1) * 480 + 120, t_seconds: (m - 1) * 0.5 + 0.125 }));
  }
  return events;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("slicePhrase — basic windowing", () => {
  it("returns all events when window covers all measures", () => {
    const events = makeEightMeasurePhrase();
    const result = slicePhrase(events, { start_measure: 1, end_measure: 8 });
    expect(result.events).toHaveLength(events.length);
    expect(result.meta.event_count).toBe(events.length);
    expect(result.meta.measure_range).toEqual([1, 8]);
    expect(result.meta.measure_count).toBe(8);
  });

  it("filters to the specified measure range", () => {
    const events = makeEightMeasurePhrase();
    const result = slicePhrase(events, { start_measure: 3, end_measure: 5 });
    // Measures 3, 4, 5 → 3 × 2 = 6 events
    expect(result.events).toHaveLength(6);
    for (const e of result.events) {
      expect(e.measure).toBeGreaterThanOrEqual(3);
      expect(e.measure).toBeLessThanOrEqual(5);
    }
    expect(result.meta.measure_count).toBe(3);
  });

  it("returns sorted events (by tick, then note)", () => {
    // Deliberately add events out of order
    const events: TimedEvent[] = [
      makeEvent(2, 76, { t_ticks: 480 }),
      makeEvent(1, 60, { t_ticks: 0 }),
      makeEvent(1, 64, { t_ticks: 120 }),
      makeEvent(2, 72, { t_ticks: 600 }),
    ];
    const result = slicePhrase(events, { start_measure: 1, end_measure: 2 });
    const ticks = result.events.map((e) => e.t_ticks);
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
  });
});

describe("slicePhrase — metadata", () => {
  it("computes correct start/end ticks and seconds", () => {
    const events: TimedEvent[] = [
      makeEvent(1, 60, { t_ticks: 100, t_seconds: 0.5, dur_ticks: 120, dur_seconds: 0.25 }),
      makeEvent(2, 64, { t_ticks: 900, t_seconds: 1.5, dur_ticks: 240, dur_seconds: 0.5 }),
    ];
    const result = slicePhrase(events, { start_measure: 1, end_measure: 2 });
    expect(result.meta.start_tick).toBe(100);
    expect(result.meta.end_tick).toBe(900 + 240); // 1140
    expect(result.meta.start_seconds).toBeCloseTo(0.5);
    expect(result.meta.end_seconds).toBeCloseTo(2.0);
  });

  it("sets phrase_window string correctly", () => {
    const events = makeEightMeasurePhrase();
    const result = slicePhrase(events, { start_measure: 1, end_measure: 8 });
    expect(result.meta.phrase_window).toBe("measures 1-8");
  });
});

describe("slicePhrase — edge cases", () => {
  it("returns empty events when window is out of bounds (too high)", () => {
    const events = makeEightMeasurePhrase();
    const result = slicePhrase(events, { start_measure: 10, end_measure: 12 });
    expect(result.events).toHaveLength(0);
    expect(result.meta.event_count).toBe(0);
    expect(result.meta.start_tick).toBeNull();
    expect(result.meta.end_tick).toBeNull();
    expect(result.meta.start_seconds).toBeNull();
    expect(result.meta.end_seconds).toBeNull();
    expect(result.meta.measure_count).toBe(0);
  });

  it("returns empty events when window is out of bounds (too low)", () => {
    const events = makeEightMeasurePhrase();
    // All events are in measures 1–8; requesting measure 0 should return nothing.
    // Note: measure field values start at 1 in the sidecar schema.
    const result = slicePhrase([], { start_measure: 1, end_measure: 8 });
    expect(result.events).toHaveLength(0);
    expect(result.meta.start_tick).toBeNull();
  });

  it("handles single-measure slice", () => {
    const events = makeEightMeasurePhrase();
    const result = slicePhrase(events, { start_measure: 4, end_measure: 4 });
    expect(result.meta.measure_count).toBe(1);
    expect(result.events.every((e) => e.measure === 4)).toBe(true);
  });

  it("handles multi-track events (both hands)", () => {
    const events: TimedEvent[] = [
      makeEvent(1, 72, { hand: "right", t_ticks: 0 }),
      makeEvent(1, 48, { hand: "left", t_ticks: 0 }),
      makeEvent(2, 74, { hand: "right", t_ticks: 480 }),
      makeEvent(2, 50, { hand: "left", t_ticks: 480 }),
    ];
    const result = slicePhrase(events, { start_measure: 1, end_measure: 2 });
    expect(result.events).toHaveLength(4);
    const hands = new Set(result.events.map((e) => e.hand));
    expect(hands).toContain("right");
    expect(hands).toContain("left");
  });

  it("preserves MIDI tick truth (no anacrusis fixing)", () => {
    // A note at tick 0 (anacrusis) should be preserved as-is.
    const event = makeEvent(1, 60, { t_ticks: 0, t_seconds: 0 });
    const result = slicePhrase([event], { start_measure: 1, end_measure: 1 });
    expect(result.events[0].t_ticks).toBe(0);
    expect(result.events[0].t_seconds).toBe(0);
  });

  it("includes notes that start inside the window even if they sustain past the end", () => {
    // Note starts at measure 2, sustains for many ticks (past measure 2 boundary).
    const event = makeEvent(2, 60, {
      t_ticks: 480,
      dur_ticks: 9600, // very long — past measure 3
    });
    const result = slicePhrase([event], { start_measure: 1, end_measure: 2 });
    // Should be included because start measure (2) is within window.
    expect(result.events).toHaveLength(1);
    expect(result.events[0].note).toBe(60);
  });
});
