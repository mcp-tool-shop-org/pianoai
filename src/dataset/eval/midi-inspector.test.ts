// ─── jam-actions-v0 Slice 17 — MIDI Inspector Tests ──────────────────────────
//
// Unit tests for the pure MIDI inspector tool surface in `midi-inspector.ts`.
//
// Coverage:
//   - All 8 tools (correctness against hand-computed fixtures from real records)
//   - Edge cases: empty hand, missing measure, out-of-range beat
//   - Determinism (same input → same output)
//   - JSON schema validity
//   - Tool registry roundtrip via INSPECTOR_TOOLS / findInspectorTool
//
// Fixtures: 2-3 real corpus records (loaded from disk) — `bach-prelude-c-major-bwv846-m001-004`
// and `pathetique-mvt2-m025-028` — both required by Slice 17 demo. Hand-computed
// expected values verified before writing the assertions.
//
// NO LLM calls, NO fetch, NO global state.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  get_events_in_measure,
  get_events_in_hand,
  count_distinct_pitch_classes,
  count_beat_1_onsets,
  get_pitch_at,
  get_hand_balance,
  find_highest_pitch,
  find_lowest_pitch,
  INSPECTOR_TOOLS,
  inspectorToolSchemas,
  findInspectorTool,
  BEAT_EPSILON,
} from "./midi-inspector.js";
import type { E3Record } from "./annotation-grounding.js";
import type { TimedEvent } from "../schema.js";

// ─── Fixture loaders ─────────────────────────────────────────────────────────

const RECORDS_DIR = join(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  "../../../datasets/jam-actions-v0-public/records",
);

function loadRecord(filename: string): E3Record {
  return JSON.parse(
    readFileSync(join(RECORDS_DIR, filename), "utf8"),
  ) as E3Record;
}

const bach = loadRecord("bach-prelude-c-major-bwv846-m001-004.json");
const pathetique = loadRecord("pathetique-mvt2-m025-028.json");

// A small in-memory record for edge-case tests.
function makeSyntheticRecord(events: TimedEvent[]): E3Record {
  return {
    id: "synth:m001-002:piano:test:v1",
    scope: {
      song_id: "synth",
      phrase_window: "measures 1-2",
      key: "C major",
      time_signature: "4/4",
    },
    provenance: {
      composition_title: "Synthetic",
      composer: "Test",
      arrangement_creator: "Test",
      arrangement_license: null,
    },
    observation: { midi_sidecar: { timed_events: events } },
    annotation_target: { measure_range: [1, 2] },
  };
}

function ev(
  partial: Partial<TimedEvent> & {
    note: number;
    hand: "right" | "left";
    measure: number;
    beat: number;
  },
): TimedEvent {
  return {
    t_seconds: 0,
    t_ticks: 0,
    dur_seconds: 0.5,
    dur_ticks: 240,
    velocity: 64,
    channel: 0,
    name: "MIDI",
    ...partial,
  };
}

// ─── Tool 1: get_events_in_measure ───────────────────────────────────────────

describe("get_events_in_measure", () => {
  it("returns 16 right-hand events for bach m1 (hand-computed)", () => {
    const m1 = get_events_in_measure(bach, 1);
    // Bach Prelude m1 has 16 RH events + 0 LH events. Hand-computed.
    expect(m1.length).toBe(16);
    // First RH event is C4 (note 60) at beat 0.0021.
    expect(m1[0].pitch).toBe(60);
    expect(m1[0].name).toBe("C4");
    expect(m1[0].hand).toBe("right");
  });

  it("returns 10 events for pathetique m25 (hand-computed)", () => {
    const m25 = get_events_in_measure(pathetique, 25);
    // Hand-computed: 10 events in m25 (mixed hands).
    expect(m25.length).toBe(10);
    // First event sorted by beat: E5 (note 76, right) at beat 0.7396.
    expect(m25[0].pitch).toBe(76);
    expect(m25[0].hand).toBe("right");
  });

  it("returns empty array for missing measure", () => {
    const result = get_events_in_measure(bach, 99);
    expect(result).toEqual([]);
  });

  it("returns empty array for invalid measure (zero/negative/NaN)", () => {
    expect(get_events_in_measure(bach, 0)).toEqual([]);
    expect(get_events_in_measure(bach, -1)).toEqual([]);
    expect(get_events_in_measure(bach, NaN)).toEqual([]);
  });

  it("is deterministic: same call produces same output", () => {
    const a = get_events_in_measure(bach, 1);
    const b = get_events_in_measure(bach, 1);
    expect(a).toEqual(b);
  });
});

// ─── Tool 2: get_events_in_hand ──────────────────────────────────────────────

describe("get_events_in_hand", () => {
  it("returns 62 right-hand events for bach (hand-computed)", () => {
    const right = get_events_in_hand(bach, "right");
    expect(right.length).toBe(62);
    expect(right.every((e) => e.hand === "right")).toBe(true);
  });

  it("returns 2 left-hand events for bach (hand-computed)", () => {
    const left = get_events_in_hand(bach, "left");
    expect(left.length).toBe(2);
  });

  it("returns 23 right and 17 left for pathetique (hand-computed)", () => {
    expect(get_events_in_hand(pathetique, "right").length).toBe(23);
    expect(get_events_in_hand(pathetique, "left").length).toBe(17);
  });

  it("returns sorted by (measure, beat) ascending", () => {
    const right = get_events_in_hand(bach, "right");
    for (let i = 1; i < right.length; i++) {
      const prev = right[i - 1];
      const cur = right[i];
      expect(prev.measure <= cur.measure).toBe(true);
      if (prev.measure === cur.measure) {
        expect(prev.beat <= cur.beat).toBe(true);
      }
    }
  });

  it("returns empty array for unknown hand string", () => {
    // @ts-expect-error — testing defensive behavior at runtime
    const result = get_events_in_hand(bach, "foot");
    expect(result).toEqual([]);
  });
});

// ─── Tool 3: count_distinct_pitch_classes ────────────────────────────────────

describe("count_distinct_pitch_classes", () => {
  it("returns 7 pitch classes for bach (hand-computed: C/D/E/F/G/A/B)", () => {
    const result = count_distinct_pitch_classes(bach);
    expect(result.count).toBe(7);
    expect(result.classes).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
  });

  it("returns sorted classes alphabetically", () => {
    const result = count_distinct_pitch_classes(pathetique);
    const sorted = [...result.classes].sort();
    expect(result.classes).toEqual(sorted);
  });

  it("restricts to measure_range when provided", () => {
    const all = count_distinct_pitch_classes(bach);
    const m1Only = count_distinct_pitch_classes(bach, [1, 1]);
    // m1-only count must be ≤ all-measure count
    expect(m1Only.count).toBeLessThanOrEqual(all.count);
  });

  it("returns count=0 with empty events", () => {
    const empty = makeSyntheticRecord([]);
    expect(count_distinct_pitch_classes(empty)).toEqual({ count: 0, classes: [] });
  });
});

// ─── Tool 4: count_beat_1_onsets ─────────────────────────────────────────────

describe("count_beat_1_onsets", () => {
  it("returns count + events array of consistent length", () => {
    const result = count_beat_1_onsets(bach);
    expect(result.count).toBe(result.events.length);
  });

  it("matches 0-indexed downbeat convention when all beats < 1", () => {
    const events = [
      ev({ note: 60, hand: "right", measure: 1, beat: 0 }),
      ev({ note: 62, hand: "right", measure: 1, beat: 0.5 }),
      ev({ note: 64, hand: "right", measure: 2, beat: 0 }),
    ];
    const rec = makeSyntheticRecord(events);
    const result = count_beat_1_onsets(rec);
    expect(result.count).toBe(2); // m1 beat 0, m2 beat 0
  });

  it("matches 1-indexed downbeat convention when 1.0 present and 0 absent", () => {
    const events = [
      ev({ note: 60, hand: "right", measure: 1, beat: 1.0 }),
      ev({ note: 62, hand: "right", measure: 1, beat: 1.5 }),
      ev({ note: 64, hand: "right", measure: 2, beat: 1.0 }),
    ];
    const rec = makeSyntheticRecord(events);
    const result = count_beat_1_onsets(rec);
    expect(result.count).toBe(2);
  });

  it("returns 0 with empty events", () => {
    const empty = makeSyntheticRecord([]);
    expect(count_beat_1_onsets(empty)).toEqual({ count: 0, events: [] });
  });
});

// ─── Tool 5: get_pitch_at ────────────────────────────────────────────────────

describe("get_pitch_at", () => {
  it("looks up the C4 onset at bach m1 beat 0", () => {
    // bach m1 first event: C4 (60) at beat 0.0021 — within BEAT_EPSILON of 0.
    const result = get_pitch_at(bach, 1, 0);
    expect(result).not.toBeNull();
    expect(result!.pitch).toBe(60);
    expect(result!.measure).toBe(1);
  });

  it("returns null for out-of-range measure", () => {
    expect(get_pitch_at(bach, 99, 0)).toBeNull();
  });

  it("returns null for beat far outside any event", () => {
    expect(get_pitch_at(bach, 1, 99)).toBeNull();
  });

  it("filters by hand when provided", () => {
    // bach m1 is right-hand only; filtering by left should return null.
    expect(get_pitch_at(bach, 1, 0, "left")).toBeNull();
    expect(get_pitch_at(bach, 1, 0, "right")).not.toBeNull();
  });

  it("picks the closest event when multiple match within tolerance", () => {
    // Two events at m1 beat 0.0 and 0.05 → request beat 0.04 → should pick 0.05.
    const events = [
      ev({ note: 60, hand: "right", measure: 1, beat: 0 }),
      ev({ note: 62, hand: "right", measure: 1, beat: 0.05 }),
    ];
    const rec = makeSyntheticRecord(events);
    const result = get_pitch_at(rec, 1, 0.04);
    expect(result).not.toBeNull();
    expect(result!.pitch).toBe(62);
  });

  it(`enforces ±${BEAT_EPSILON}-beat tolerance`, () => {
    const events = [ev({ note: 60, hand: "right", measure: 1, beat: 0.5 })];
    const rec = makeSyntheticRecord(events);
    // request beat 0.0 → 0.5 is OUTSIDE the ±0.1 tolerance → null.
    expect(get_pitch_at(rec, 1, 0.0)).toBeNull();
    // request beat 0.45 → within tolerance.
    expect(get_pitch_at(rec, 1, 0.45)).not.toBeNull();
  });
});

// ─── Tool 6: get_hand_balance ────────────────────────────────────────────────

describe("get_hand_balance", () => {
  it("returns 62/2 for bach (hand-computed)", () => {
    const result = get_hand_balance(bach);
    expect(result.right_count).toBe(62);
    expect(result.left_count).toBe(2);
    expect(result.ratio).toBeCloseTo(62 / 64, 4);
  });

  it("returns 23/17 for pathetique (hand-computed)", () => {
    const result = get_hand_balance(pathetique);
    expect(result.right_count).toBe(23);
    expect(result.left_count).toBe(17);
    expect(result.ratio).toBeCloseTo(23 / 40, 4);
  });

  it("returns null ratio for empty events", () => {
    const empty = makeSyntheticRecord([]);
    const result = get_hand_balance(empty);
    expect(result).toEqual({ right_count: 0, left_count: 0, ratio: null });
  });
});

// ─── Tool 7: find_highest_pitch ──────────────────────────────────────────────

describe("find_highest_pitch", () => {
  it("returns F5 (note 77) for bach (hand-computed)", () => {
    const result = find_highest_pitch(bach);
    expect(result).not.toBeNull();
    expect(result!.pitch).toBe(77);
    expect(result!.measure).toBe(2);
  });

  it("restricts to right hand when hand='right'", () => {
    const rightResult = find_highest_pitch(bach, "right");
    expect(rightResult).not.toBeNull();
    expect(rightResult!.hand).toBe("right");
  });

  it("returns null for empty events", () => {
    const empty = makeSyntheticRecord([]);
    expect(find_highest_pitch(empty)).toBeNull();
  });

  it("breaks ties by earliest (measure, beat)", () => {
    const events = [
      ev({ note: 72, hand: "right", measure: 2, beat: 0 }),
      ev({ note: 72, hand: "right", measure: 1, beat: 0.5 }),
      ev({ note: 72, hand: "right", measure: 1, beat: 0 }),
    ];
    const rec = makeSyntheticRecord(events);
    const result = find_highest_pitch(rec);
    expect(result).not.toBeNull();
    expect(result!.measure).toBe(1);
    expect(result!.beat).toBe(0);
  });
});

// ─── Tool 8: find_lowest_pitch ───────────────────────────────────────────────

describe("find_lowest_pitch", () => {
  it("returns B3 (note 59) for bach (hand-computed)", () => {
    const result = find_lowest_pitch(bach);
    expect(result).not.toBeNull();
    expect(result!.pitch).toBe(59);
    expect(result!.measure).toBe(3);
  });

  it("returns null when filtering hand with no events", () => {
    const events = [ev({ note: 60, hand: "right", measure: 1, beat: 0 })];
    const rec = makeSyntheticRecord(events);
    expect(find_lowest_pitch(rec, "left")).toBeNull();
  });
});

// ─── Tool registry ───────────────────────────────────────────────────────────

describe("INSPECTOR_TOOLS registry", () => {
  it("exposes 8 tools", () => {
    expect(INSPECTOR_TOOLS.length).toBe(8);
  });

  it("all tools have unique names", () => {
    const names = INSPECTOR_TOOLS.map((t) => t.name);
    const set = new Set(names);
    expect(set.size).toBe(names.length);
  });

  it("each tool's schema has the standard JSON-schema shape", () => {
    for (const t of INSPECTOR_TOOLS) {
      expect(t.schema.name).toBe(t.name);
      expect(typeof t.schema.description).toBe("string");
      expect(t.schema.description.length).toBeGreaterThan(20);
      expect(t.schema.inputSchema.type).toBe("object");
      expect(t.schema.inputSchema).toHaveProperty("properties");
      expect(t.schema.inputSchema).toHaveProperty("required");
    }
  });

  it("inspectorToolSchemas() returns 8 tool descriptors", () => {
    const schemas = inspectorToolSchemas();
    expect(schemas.length).toBe(8);
    for (const s of schemas) {
      expect(typeof s.name).toBe("string");
      expect(typeof s.description).toBe("string");
      expect(typeof s.inputSchema).toBe("object");
    }
  });

  it("findInspectorTool returns the right tool by name", () => {
    expect(findInspectorTool("get_hand_balance")?.name).toBe("get_hand_balance");
    expect(findInspectorTool("count_beat_1_onsets")?.name).toBe("count_beat_1_onsets");
    expect(findInspectorTool("nonexistent_tool")).toBeNull();
  });

  it("tools handle malformed arguments gracefully (don't throw)", () => {
    const eim = findInspectorTool("get_events_in_measure")!;
    // Bad measure_number: string that can't parse → empty
    expect(eim.run(bach, { measure_number: "not-a-number" })).toEqual([]);
    // Missing arg → empty
    expect(eim.run(bach, {})).toEqual([]);

    const gpa = findInspectorTool("get_pitch_at")!;
    expect(gpa.run(bach, {})).toBeNull();
    expect(gpa.run(bach, { measure: "abc", beat: "xyz" })).toBeNull();

    const eih = findInspectorTool("get_events_in_hand")!;
    expect(eih.run(bach, { hand: "foot" })).toEqual([]);
  });

  it("tool registry round-trip matches direct invocation", () => {
    const direct = get_hand_balance(bach);
    const viaRegistry = findInspectorTool("get_hand_balance")!.run(bach, {});
    expect(viaRegistry).toEqual(direct);
  });

  it("tools are pure: same input → same output across multiple calls", () => {
    const a = findInspectorTool("count_distinct_pitch_classes")!.run(bach, {});
    const b = findInspectorTool("count_distinct_pitch_classes")!.run(bach, {});
    const c = findInspectorTool("count_distinct_pitch_classes")!.run(bach, {});
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });
});
