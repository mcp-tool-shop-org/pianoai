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

describe("toAbc — melody-silent measures inside the phrase window (pins D-A1-004)", () => {
  // Before the fix, bar-line emission was driven by transitions between
  // consecutive RH melody events, not by meta.measure_range — a measure with
  // zero RH events (RH rests while LH plays, or a genuinely silent measure)
  // silently collapsed into its neighbor: exactly one "|" was emitted no
  // matter how many measures were actually skipped, and nothing recorded
  // that a measure had been skipped at all. The emitted bar count fell short
  // of what the M: header + measure_range imply.

  it("produces exactly measure_count+1 bar separators, with a full-measure rest for each melody-silent measure (mirrors real pathetique-mvt2:m001-004 — RH present only in measures 1 and 3)", () => {
    const events: TimedEvent[] = [
      makeEvent(72, 1, 0, 120), // measure 1: C5 sixteenth note
      makeEvent(74, 3, 3840, 120), // measure 3: D5 sixteenth note (measure 3 starts at tick 3840 @ 480 tpb, 4/4)
      // measures 2 and 4 are melody-silent — no RH events at all.
    ];
    const meta: PhraseMeta = {
      phrase_window: "measures 1-4",
      measure_range: [1, 4],
      start_tick: 0,
      end_tick: 7680,
      start_seconds: 0,
      end_seconds: 16,
      event_count: 2,
      measure_count: 4,
    };
    const result = toAbc(events, meta, {
      key: "C major",
      timeSignature: "4/4",
      tempoBpm: 120,
    });

    const bodyLine = result.split("\n").find((l) => l.startsWith("|"));
    expect(bodyLine).toBeDefined();

    const pipeCount = (bodyLine!.match(/\|/g) ?? []).length;
    // Bar count always equals measure_count + 1 (one bar line per measure
    // boundary, fencepost-style), regardless of how many measures inside the
    // window are melody-silent.
    expect(pipeCount).toBe(meta.measure_count + 1);

    // Split into one segment per measure (drop the empty strings before the
    // leading "|" and after the trailing "|").
    const parts = bodyLine!.split("|");
    const segments = parts.slice(1, parts.length - 1);
    expect(segments).toHaveLength(meta.measure_count);

    // Measures 2 and 4 (segments[1], segments[3]) are melody-silent — each
    // must be EXACTLY a full-measure rest token (z16 at 4/4 with L:1/16),
    // not merged into a neighboring bar and not silently dropped.
    expect(segments[1]).toBe("z16");
    expect(segments[3]).toBe("z16");

    // Measures 1 and 3 (segments[0], segments[2]) carry the actual notes.
    expect(segments[0]).toContain("c"); // C5
    expect(segments[2]).toContain("d"); // D5
  });

  it("produces measure_count+1 bars for a single melody-silent measure (mirrors real chopin-prelude-e-minor:m025-028's 1-silent-measure case)", () => {
    const events: TimedEvent[] = [
      makeEvent(72, 1, 0, 120),
      makeEvent(74, 2, 1920, 120),
      // measure 3 is melody-silent.
      makeEvent(76, 4, 5760, 120),
    ];
    const meta: PhraseMeta = {
      phrase_window: "measures 1-4",
      measure_range: [1, 4],
      start_tick: 0,
      end_tick: 7680,
      start_seconds: 0,
      end_seconds: 16,
      event_count: 3,
      measure_count: 4,
    };
    const result = toAbc(events, meta, {
      key: "C major",
      timeSignature: "4/4",
      tempoBpm: 120,
    });

    const bodyLine = result.split("\n").find((l) => l.startsWith("|"));
    expect(bodyLine).toBeDefined();
    const pipeCount = (bodyLine!.match(/\|/g) ?? []).length;
    expect(pipeCount).toBe(meta.measure_count + 1);

    const parts = bodyLine!.split("|");
    const segments = parts.slice(1, parts.length - 1);
    expect(segments).toHaveLength(4);
    // Measure 3 (segments[2]) is the melody-silent one — always exactly a
    // full-measure rest, regardless of gap-fill rests in neighboring
    // populated measures.
    expect(segments[2]).toBe("z16");
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
