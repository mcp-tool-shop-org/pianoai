// ─── remi-adapter.test.ts ─────────────────────────────────────────────────────
//
// Tests for src/dataset/remi-adapter.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { toRemi } from "./remi-adapter.js";
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

const DEFAULT_OPTS = {
  timeSignature: "4/4",
  ticksPerBeat: 480,
};

function makeEvent(
  note: number,
  measure: number,
  t_ticks: number,
  dur_ticks: number,
  velocity: number = 50,
  hand: "right" | "left" = "right",
): TimedEvent {
  return {
    t_seconds: t_ticks / 480,
    t_ticks,
    dur_seconds: dur_ticks / 480,
    dur_ticks,
    note,
    name: "E4",
    velocity,
    channel: 0,
    hand,
    measure,
    beat: 0,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("toRemi — token types and structure", () => {
  it("returns an empty array for empty events", () => {
    expect(toRemi([], DEFAULT_META, DEFAULT_OPTS)).toEqual([]);
  });

  it("emits Bar_ token at start of each measure", () => {
    const events: TimedEvent[] = [
      makeEvent(60, 1, 0, 120),
      makeEvent(64, 2, 1920, 120),
    ];
    const tokens = toRemi(events, DEFAULT_META, DEFAULT_OPTS);
    const barTokens = tokens.filter((t) => t.startsWith("Bar_"));
    expect(barTokens).toContain("Bar_1");
    expect(barTokens).toContain("Bar_2");
    expect(barTokens.length).toBe(2);
  });

  it("emits Position_ token after each Bar_ token", () => {
    const events: TimedEvent[] = [makeEvent(60, 1, 0, 120)];
    const tokens = toRemi(events, DEFAULT_META, DEFAULT_OPTS);
    const barIdx = tokens.indexOf("Bar_1");
    expect(barIdx).toBeGreaterThanOrEqual(0);
    expect(tokens[barIdx + 1]).toMatch(/^Position_\d+$/);
  });

  it("emits Pitch_ token for each note", () => {
    const events: TimedEvent[] = [makeEvent(76, 1, 0, 120)];
    const tokens = toRemi(events, DEFAULT_META, DEFAULT_OPTS);
    expect(tokens).toContain("Pitch_76");
  });

  it("emits Velocity_ token with quantized value", () => {
    // velocity 36 → bin = floor(36/4)*4 = 36
    const events: TimedEvent[] = [makeEvent(60, 1, 0, 120, 36)];
    const tokens = toRemi(events, DEFAULT_META, DEFAULT_OPTS);
    expect(tokens).toContain("Velocity_36");
  });

  it("emits Duration_ token in sixteenth-note units", () => {
    // dur_ticks=120 at 480 tpb → 120/120 = 1 sixteenth = Duration_1
    const events: TimedEvent[] = [makeEvent(60, 1, 0, 120)];
    const tokens = toRemi(events, DEFAULT_META, DEFAULT_OPTS);
    expect(tokens).toContain("Duration_1");
  });

  it("emits Duration_4 for a quarter note (480 ticks at 480 tpb)", () => {
    const events: TimedEvent[] = [makeEvent(60, 1, 0, 480)];
    const tokens = toRemi(events, DEFAULT_META, DEFAULT_OPTS);
    expect(tokens).toContain("Duration_4");
  });
});

describe("toRemi — token sequence ordering", () => {
  it("follows Bar → Position → Pitch → Velocity → Duration order", () => {
    const events: TimedEvent[] = [makeEvent(60, 1, 0, 120)];
    const tokens = toRemi(events, DEFAULT_META, DEFAULT_OPTS);
    // For a single-note phrase: Bar_1 Position_0 Pitch_60 Velocity_X Duration_1
    expect(tokens[0]).toMatch(/^Bar_/);
    expect(tokens[1]).toMatch(/^Position_/);
    expect(tokens[2]).toMatch(/^Pitch_/);
    expect(tokens[3]).toMatch(/^Velocity_/);
    expect(tokens[4]).toMatch(/^Duration_/);
  });

  it("emits Position only once per tick cluster, then one quartet per note", () => {
    // Two simultaneous notes at the same tick
    const events: TimedEvent[] = [
      makeEvent(60, 1, 0, 120, 50, "left"),
      makeEvent(72, 1, 0, 120, 60, "right"),
    ];
    const tokens = toRemi(events, DEFAULT_META, DEFAULT_OPTS);
    // Should have: 1 Bar + 1 Position + 2 × (Pitch + Velocity + Duration) = 8 tokens
    expect(tokens).toHaveLength(1 + 1 + 2 * 3); // Bar + Position + 2 note quads
  });

  it("sorts simultaneous notes lowest pitch first", () => {
    const events: TimedEvent[] = [
      makeEvent(72, 1, 0, 120, 60, "right"),  // higher note first in input
      makeEvent(60, 1, 0, 120, 50, "left"),   // lower note second
    ];
    const tokens = toRemi(events, DEFAULT_META, DEFAULT_OPTS);
    const pitchTokens = tokens.filter((t) => t.startsWith("Pitch_"));
    expect(pitchTokens[0]).toBe("Pitch_60");  // lower note should come first
    expect(pitchTokens[1]).toBe("Pitch_72");
  });
});

describe("toRemi — position quantization", () => {
  it("Position_0 for notes at the start of a measure", () => {
    const events: TimedEvent[] = [makeEvent(60, 1, 0, 120)];
    const tokens = toRemi(events, DEFAULT_META, DEFAULT_OPTS);
    expect(tokens).toContain("Position_0");
  });

  it("Position value is non-negative and within subdivisions", () => {
    const events: TimedEvent[] = [
      makeEvent(60, 1, 0, 120),
      makeEvent(64, 1, 480, 120),    // 1 beat in (480 ticks)
      makeEvent(67, 1, 960, 120),    // 2 beats in
      makeEvent(72, 1, 1440, 120),   // 3 beats in
    ];
    const tokens = toRemi(events, DEFAULT_META, DEFAULT_OPTS);
    const posTokens = tokens.filter((t) => t.startsWith("Position_"));
    for (const tok of posTokens) {
      const pos = Number(tok.split("_")[1]);
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThan(96); // 4/4 has 96 subdivisions
    }
  });
});

describe("toRemi — velocity quantization", () => {
  it("quantizes velocity 0 → Velocity_0", () => {
    const events: TimedEvent[] = [makeEvent(60, 1, 0, 120, 0)];
    const tokens = toRemi(events, DEFAULT_META, DEFAULT_OPTS);
    expect(tokens).toContain("Velocity_0");
  });

  it("quantizes velocity 127 → Velocity_124 (clamped to max bin)", () => {
    const events: TimedEvent[] = [makeEvent(60, 1, 0, 120, 127)];
    const tokens = toRemi(events, DEFAULT_META, DEFAULT_OPTS);
    expect(tokens).toContain("Velocity_124");
  });

  it("quantizes velocity 50 → Velocity_48 (floor to bin boundary)", () => {
    // floor(50/4)*4 = 48
    const events: TimedEvent[] = [makeEvent(60, 1, 0, 120, 50)];
    const tokens = toRemi(events, DEFAULT_META, DEFAULT_OPTS);
    expect(tokens).toContain("Velocity_48");
  });
});

describe("toRemi — time signature support", () => {
  it("handles 3/8 time signature correctly", () => {
    const events: TimedEvent[] = [makeEvent(60, 1, 0, 120)];
    const tokens = toRemi(events, DEFAULT_META, {
      timeSignature: "3/8",
      ticksPerBeat: 480,
    });
    expect(tokens.length).toBeGreaterThan(0);
    // Position should be within 36 subdivisions for 3/8
    const posTokens = tokens.filter((t) => t.startsWith("Position_"));
    for (const tok of posTokens) {
      const pos = Number(tok.split("_")[1]);
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThan(36);
    }
  });
});

describe("toRemi — Für Elise smoke test", () => {
  it("produces real token sequence from Für Elise m.1 events", () => {
    // First two events of Für Elise mm. 1–8 sidecar
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
    const tokens = toRemi(events, meta, {
      timeSignature: "3/8",
      ticksPerBeat: 480,
    });
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens).toContain("Bar_1");
    expect(tokens).toContain("Pitch_76");
    expect(tokens).toContain("Pitch_75");
    // Velocity_36 for velocity=36 (floor(36/4)*4=36)
    expect(tokens).toContain("Velocity_36");
    // Duration_1 for dur_ticks=120 (120/120=1 sixteenth at 480 tpb)
    expect(tokens).toContain("Duration_1");
  });
});
