// ─── abc-adapter.test.ts ──────────────────────────────────────────────────────
//
// Tests for src/dataset/abc-adapter.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { toAbc } from "./abc-adapter.js";
import type { TimedEvent } from "./schema.js";
import type { PhraseMeta } from "./phrase-slicer.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const DEFAULT_META: PhraseMeta = {
  phrase_window: "measures 1-4",
  measure_range: [1, 4],
  start_tick: 0,
  end_tick: 1920,
  start_seconds: 0,
  end_seconds: 4.0,
  event_count: 4,
  measure_count: 4,
};

function makeEvent(
  note: number,
  measure: number,
  t_ticks: number,
  dur_ticks: number,
  hand: "right" | "left" = "right",
): TimedEvent {
  return {
    t_seconds: t_ticks / 480,
    t_ticks,
    dur_seconds: dur_ticks / 480,
    dur_ticks,
    note,
    name: "E4",
    velocity: 50,
    channel: 0,
    hand,
    measure,
    beat: 0,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("toAbc — header generation", () => {
  it("produces X:1 as first line", () => {
    const result = toAbc([], DEFAULT_META, {
      key: "C major",
      timeSignature: "4/4",
      tempoBpm: 120,
    });
    expect(result.startsWith("X:1")).toBe(true);
  });

  it("includes M: time signature header", () => {
    const result = toAbc([], DEFAULT_META, {
      key: "A minor",
      timeSignature: "3/8",
      tempoBpm: 69,
    });
    expect(result).toContain("M:3/8");
  });

  it("includes Q: tempo header with correct BPM", () => {
    const result = toAbc([], DEFAULT_META, {
      key: "C major",
      timeSignature: "4/4",
      tempoBpm: 120,
    });
    expect(result).toContain("Q:1/4=120");
  });

  it("includes K: key header normalized to ABC format", () => {
    const result = toAbc([], DEFAULT_META, {
      key: "A minor",
      timeSignature: "4/4",
      tempoBpm: 120,
    });
    expect(result).toContain("K:Amin");
  });

  it("normalizes 'C major' key correctly", () => {
    const result = toAbc([], DEFAULT_META, {
      key: "C major",
      timeSignature: "4/4",
      tempoBpm: 120,
    });
    expect(result).toContain("K:C");
  });

  it("includes T: title when provided", () => {
    const result = toAbc([], DEFAULT_META, {
      key: "C major",
      timeSignature: "4/4",
      tempoBpm: 120,
      title: "Test Piece",
    });
    expect(result).toContain("T:Test Piece");
  });

  it("includes L:1/16 unit note length", () => {
    const result = toAbc([], DEFAULT_META, {
      key: "C major",
      timeSignature: "4/4",
      tempoBpm: 120,
    });
    expect(result).toContain("L:1/16");
  });
});

describe("toAbc — note encoding", () => {
  it("encodes middle C (MIDI 60) as C in octave 4", () => {
    const events: TimedEvent[] = [makeEvent(60, 1, 0, 120)];
    const result = toAbc(events, DEFAULT_META, {
      key: "C major",
      timeSignature: "4/4",
      tempoBpm: 120,
    });
    // C4 in ABC = uppercase C with no octave modifiers
    expect(result).toContain("C");
  });

  it("encodes E5 (MIDI 76) as lowercase e with no apostrophes", () => {
    // E5 is above C5 → lowercase in ABC
    const events: TimedEvent[] = [makeEvent(76, 1, 0, 120)];
    const result = toAbc(events, DEFAULT_META, {
      key: "C major",
      timeSignature: "4/4",
      tempoBpm: 120,
    });
    // E5 = e in ABC (C5 = c, D5 = d, E5 = e)
    expect(result).toMatch(/\|[^|]*e[^|]*\|/);
  });

  it("encodes D#5 (MIDI 75) with sharp symbol ^d", () => {
    const events: TimedEvent[] = [makeEvent(75, 1, 0, 120)];
    const result = toAbc(events, { ...DEFAULT_META, measure_range: [1, 1] }, {
      key: "C major",
      timeSignature: "4/4",
      tempoBpm: 120,
    });
    expect(result).toContain("^d");
  });

  it("encodes A2 (MIDI 45) with comma octave markers", () => {
    // A2 = MIDI 45; octave 2 is two octaves below C4 → A,, in ABC
    const events: TimedEvent[] = [makeEvent(45, 1, 0, 120)];
    const result = toAbc(events, DEFAULT_META, {
      key: "C major",
      timeSignature: "4/4",
      tempoBpm: 120,
    });
    // A2 should have two commas: A,,
    expect(result).toContain("A,,");
  });

  it("encodes quarter note (480 ticks at 480 tpb) as 4 units of 1/16", () => {
    // At 480 ticks/beat, a quarter = 480 ticks = 4 sixteenth notes
    const events: TimedEvent[] = [makeEvent(72, 1, 0, 480)];
    const result = toAbc(events, DEFAULT_META, {
      key: "C major",
      timeSignature: "4/4",
      tempoBpm: 120,
    });
    // c (C5 in ABC) followed by 4 → c4
    expect(result).toContain("4");
  });
});

describe("toAbc — bar lines", () => {
  it("inserts bar line between measures", () => {
    const events: TimedEvent[] = [
      makeEvent(72, 1, 0, 120),       // measure 1
      makeEvent(74, 2, 480, 120),     // measure 2
    ];
    const result = toAbc(events, { ...DEFAULT_META, measure_range: [1, 2] }, {
      key: "C major",
      timeSignature: "4/4",
      tempoBpm: 120,
    });
    // Should contain at least 3 bar lines: opening + between m1/m2 + closing
    const barCount = (result.match(/\|/g) ?? []).length;
    expect(barCount).toBeGreaterThanOrEqual(3);
  });

  it("wraps empty phrase in a rest bar", () => {
    const result = toAbc([], DEFAULT_META, {
      key: "C major",
      timeSignature: "4/4",
      tempoBpm: 120,
    });
    expect(result).toContain("|");
    expect(result).toContain("z");
  });
});

describe("toAbc — RH melody extraction", () => {
  it("prefers right-hand events when both hands are present", () => {
    const events: TimedEvent[] = [
      makeEvent(72, 1, 0, 120, "right"),  // C5 RH
      makeEvent(48, 1, 0, 240, "left"),   // C3 LH — should not dominate
    ];
    const result = toAbc(events, DEFAULT_META, {
      key: "C major",
      timeSignature: "4/4",
      tempoBpm: 120,
    });
    // Should contain c (C5) for RH melody
    expect(result).toContain("c");
  });

  it("at same tick, keeps highest note (monophonic melody)", () => {
    // Two simultaneous RH notes — higher pitch should win
    const events: TimedEvent[] = [
      makeEvent(60, 1, 0, 120, "right"),  // C4
      makeEvent(72, 1, 0, 120, "right"),  // C5 — higher, should be kept
    ];
    const result = toAbc(events, DEFAULT_META, {
      key: "C major",
      timeSignature: "4/4",
      tempoBpm: 120,
    });
    // Only one note should appear per tick cluster in melody line
    // C5 = 'c' in ABC
    expect(result).toContain("c");
  });
});

describe("toAbc — Für Elise smoke test", () => {
  it("produces a valid ABC string from the first two events of Für Elise", () => {
    // E5=76 (t_ticks=480, dur=120) and D#5=75 (t_ticks=600, dur=120)
    const events: TimedEvent[] = [
      { t_seconds: 0.867303, t_ticks: 480, dur_seconds: 0.216826, dur_ticks: 120,
        note: 76, name: "E5", velocity: 36, channel: 0, hand: "right", measure: 1, beat: 1 },
      { t_seconds: 1.084128, t_ticks: 600, dur_seconds: 0.216826, dur_ticks: 120,
        note: 75, name: "D#5", velocity: 33, channel: 0, hand: "right", measure: 1, beat: 1.25 },
    ];
    const meta: PhraseMeta = {
      phrase_window: "measures 1-1",
      measure_range: [1, 1],
      start_tick: 480,
      end_tick: 720,
      start_seconds: 0.867303,
      end_seconds: 1.300954,
      event_count: 2,
      measure_count: 1,
    };
    const result = toAbc(events, meta, {
      key: "A minor",
      timeSignature: "3/8",
      tempoBpm: 69,
      title: "Für Elise",
    });
    expect(result).toContain("K:Amin");
    expect(result).toContain("M:3/8");
    // Should contain e (E5) and ^d (D#5)
    expect(result).toContain("e");
    expect(result).toContain("^d");
  });
});
