// ─── Tests for release-gate.ts (jam-actions-v0 Slice 20 + Slice 22) ─────────
//
// Validates the pure 7-axis RC gate library. No I/O, no real artifact reads.
// Uses synthetic ReleaseGateInput fixtures designed to exercise each axis at
// its boundary plus the composition rule.
//
// Coverage:
//   - Slice 20 baseline fixture (no per_record) — pre-revision fallback path
//   - Slice 22 helpers: isMarginPass, isCeilingSaturatedPass, classifyRecord,
//     recordPassesAxis2
//   - Slice 22 axis-2 union logic (bucket A + bucket B + neither + both)
//   - Slice 22 axis-6 compound rule (bucket A + bucket B + regression cases)
//   - Slice 19 baseline regression: with per_record provided, must still FAIL
//   - Slice 21 baseline forward: with per_record provided, must PASS
//   - Per-axis pass case (input that passes everything)
//   - Axis 1 fail boundary
//   - Axis 2 compound fail (mean OR clearance-fraction)
//   - Axis 3 fail (tool-call rate floor)
//   - Axis 4 fail (correct-after-tool floor)
//   - Axis 5 fail (misinterp ceiling)
//   - Axis 6 fail (catastrophic stratum)
//   - Axis 7 fail (reporting not declared)
//   - Custom thresholds (override)
//   - Composition rule: blocking-only aggregate verdict
//   - Schema version emitted based on per_record presence
//
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  evaluateReleaseGate,
  isMarginPass,
  isCeilingSaturatedPass,
  recordPassesAxis2,
  classifyRecord,
  DEFAULT_THRESHOLDS,
  type ReleaseGateInput,
  type ReleaseGateThresholds,
  type PerRecordAssessment,
} from "./release-gate.js";

// ─── Fixture builders ────────────────────────────────────────────────────────

/**
 * Build a "passing" baseline that clears every axis at default thresholds
 * UNDER THE PRE-REVISION (Slice 20) logic — no `per_record` supplied. Kept
 * for backward-compat tests asserting fallback behavior.
 */
function passingFixture(): ReleaseGateInput {
  return {
    n_records: 16,
    tool_inspected_mean: 0.70,
    text_only_mean: 0.50,
    margin_tool_minus_text_mean: 0.20,
    records_clearing_margin: 12, // 12/16 = 75% clears
    tool_call_rate: 0.40,
    correct_after_tool_rate: 0.85,
    misinterp_rate: 0.15,
    per_stratum: [
      { stratum: "bach", n_records: 6, margin_tool_minus_text_mean: 0.30, records_clearing_margin: 5 },
      { stratum: "pathetique", n_records: 5, margin_tool_minus_text_mean: 0.15, records_clearing_margin: 3 },
      { stratum: "schumann", n_records: 2, margin_tool_minus_text_mean: 0.10, records_clearing_margin: 1 },
      { stratum: "chopin", n_records: 2, margin_tool_minus_text_mean: 0.30, records_clearing_margin: 2 },
      { stratum: "clair-de-lune", n_records: 1, margin_tool_minus_text_mean: 0.15, records_clearing_margin: 1 },
    ],
    enriched: {
      n_records: 9,
      tool_inspected_mean: 0.70,
      text_only_mean: 0.55,
      margin_tool_minus_text_mean: 0.15,
      records_clearing_margin: 6,
      tool_call_rate: 0.20,
    },
    non_enriched: {
      n_records: 7,
      tool_inspected_mean: 0.65,
      text_only_mean: 0.45,
      margin_tool_minus_text_mean: 0.25,
      records_clearing_margin: 6,
      tool_call_rate: 0.55,
    },
    reports_enriched_vs_non_enriched: true,
  };
}

/**
 * Slice 19 baseline fixture — encodes the canonical post-repair E3 numbers
 * from `slice19-fair-e3-baseline-results.json` and the derived correct-after-
 * tool / misinterp split. This is the load-bearing fixture: its verdict per
 * axis MUST match the slice doc's manual assessment.
 *
 * In Slice 22, this fixture is intentionally left WITHOUT `per_record` to
 * exercise the pre-revision (1.0.0) fallback path; the Slice-22 revised
 * version is `slice19FixtureRevised` below, which carries per_record and
 * tests the regression case (must still FAIL the revised gate).
 */
function slice19Fixture(): ReleaseGateInput {
  return {
    n_records: 16,
    tool_inspected_mean: 0.6059027777777777,
    text_only_mean: 0.4791666666666667,
    margin_tool_minus_text_mean: 0.1267361111111111,
    records_clearing_margin: 9, // 9/16 = 56.25%
    tool_call_rate: 0.3279569892473118, // 61/186
    correct_after_tool_rate: 50 / 61, // 0.8197
    misinterp_rate: 11 / 61, // 0.1803
    per_stratum: [
      { stratum: "bach", n_records: 6, margin_tool_minus_text_mean: 0.2916666666666667, records_clearing_margin: 5 },
      { stratum: "pathetique", n_records: 5, margin_tool_minus_text_mean: 0.0333, records_clearing_margin: 1 },
      { stratum: "schumann", n_records: 2, margin_tool_minus_text_mean: -0.2777777777777778, records_clearing_margin: 0 },
      { stratum: "chopin", n_records: 2, margin_tool_minus_text_mean: 0.25, records_clearing_margin: 2 },
      { stratum: "clair-de-lune", n_records: 1, margin_tool_minus_text_mean: 0.1666666666666667, records_clearing_margin: 1 },
    ],
    enriched: {
      n_records: 9,
      tool_inspected_mean: 0.6512345679012346,
      text_only_mean: 0.574074074074074,
      margin_tool_minus_text_mean: 0.07716049382716049,
      records_clearing_margin: 5,
      tool_call_rate: 0.12745098039215685,
    },
    non_enriched: {
      n_records: 7,
      tool_inspected_mean: 0.5476190476190477,
      text_only_mean: 0.35714285714285715,
      margin_tool_minus_text_mean: 0.19047619047619047,
      records_clearing_margin: 4,
      tool_call_rate: 0.5714285714285714,
    },
    reports_enriched_vs_non_enriched: true,
  };
}

/**
 * Slice 22 helper — build a per-record assessment fixture from a compact
 * spec. Defaults all four condition means to 0 and misinterp_count to 0;
 * callers override only the fields relevant to the test.
 */
function rec(
  recordId: string,
  stratum: string,
  fields: Partial<Omit<PerRecordAssessment, "recordId" | "stratum">> = {},
): PerRecordAssessment {
  return {
    recordId,
    stratum,
    tool_inspected_mean: 0,
    text_only_mean: 0,
    random_midi_mean: 0,
    margin_vs_text_only: 0,
    misinterp_count: 0,
    ...fields,
  };
}

/**
 * Slice 22 — Slice 19 baseline with `per_record` provided. Encodes the
 * 16-record per-record breakdown derived from `slice19-fair-e3-baseline-
 * results.json` + per-record misinterp counts derived from the
 * slice18-5-e3-post-repair and slice19-e3-tool-fresh source artifacts. Under
 * the revised gate, Slice 19 must STILL FAIL axes 1, 2, 6 (diagnostic power
 * preserved).
 */
function slice19FixtureRevised(): ReleaseGateInput {
  const base = slice19Fixture();
  return {
    ...base,
    per_record: [
      // bach (6 records, 5 margin_pass)
      rec("bach-prelude-c-major-bwv846:m009-012:piano:mcp-session:v1", "bach", {
        tool_inspected_mean: 0.5, text_only_mean: 0.5, random_midi_mean: 0.5833,
        margin_vs_text_only: 0, misinterp_count: 1,
      }),
      rec("bach-prelude-c-major-bwv846:m029-032:piano:mcp-session:v1", "bach", {
        tool_inspected_mean: 0.4167, text_only_mean: 0, random_midi_mean: 0,
        margin_vs_text_only: 0.4167, misinterp_count: 3,
      }),
      rec("bach-prelude-c-major-bwv846:m037-040:piano:mcp-session:v1", "bach", {
        tool_inspected_mean: 0.6667, text_only_mean: 0.25, random_midi_mean: 0.0833,
        margin_vs_text_only: 0.4167, misinterp_count: 0,
      }),
      rec("bach-prelude-c-major-bwv846:m045-048:piano:mcp-session:v1", "bach", {
        tool_inspected_mean: 0.75, text_only_mean: 0.5, random_midi_mean: 0.5,
        margin_vs_text_only: 0.25, misinterp_count: 1,
      }),
      rec("bach-prelude-c-major-bwv846:m049-052:piano:mcp-session:v1", "bach", {
        tool_inspected_mean: 0.6667, text_only_mean: 0.1667, random_midi_mean: 0.1667,
        margin_vs_text_only: 0.5, misinterp_count: 0,
      }),
      rec("bach-prelude-c-major-bwv846:m053-056:piano:mcp-session:v1", "bach", {
        tool_inspected_mean: 0.5, text_only_mean: 0.3333, random_midi_mean: 0.4167,
        margin_vs_text_only: 0.1667, misinterp_count: 1,
      }),
      // pathetique (5 records, 1 margin_pass)
      rec("pathetique-mvt2:m001-004:piano:mcp-session:v1", "pathetique", {
        tool_inspected_mean: 0.9167, text_only_mean: 0.75, random_midi_mean: 0.6667,
        margin_vs_text_only: 0.1667, misinterp_count: 0,
      }),
      rec("pathetique-mvt2:m009-012:piano:mcp-session:v1", "pathetique", {
        tool_inspected_mean: 0.3333, text_only_mean: 0.3333, random_midi_mean: 0.0833,
        margin_vs_text_only: 0, misinterp_count: 1,
      }),
      rec("pathetique-mvt2:m017-020:piano:mcp-session:v1", "pathetique", {
        tool_inspected_mean: 0.6667, text_only_mean: 0.5833, random_midi_mean: 0.5,
        margin_vs_text_only: 0.0833, misinterp_count: 2,
      }),
      rec("pathetique-mvt2:m025-028:piano:mcp-session:v1", "pathetique", {
        tool_inspected_mean: 0.5833, text_only_mean: 0.6667, random_midi_mean: 0.3333,
        margin_vs_text_only: -0.0833, misinterp_count: 0,
      }),
      rec("pathetique-mvt2:m029-032:piano:mcp-session:v1", "pathetique", {
        tool_inspected_mean: 0.3333, text_only_mean: 0.3333, random_midi_mean: 0.3333,
        margin_vs_text_only: 0, misinterp_count: 0,
      }),
      // schumann (2 records, 0 margin_pass, 0 ceiling_saturated_pass in Slice 19)
      rec("schumann-traumerei:m001-004:piano:mcp-session:v1", "schumann", {
        tool_inspected_mean: 1.0, text_only_mean: 1.0, random_midi_mean: 0.75,
        margin_vs_text_only: 0, misinterp_count: 0,
      }),
      rec("schumann-traumerei:m045-048:piano:mcp-session:v1", "schumann", {
        tool_inspected_mean: 0.1111, text_only_mean: 0.6667, random_midi_mean: 0.6667,
        margin_vs_text_only: -0.5556, misinterp_count: 0,
      }),
      // chopin (2 records, 2 margin_pass)
      rec("chopin-nocturne-op9-no2:m001-004:piano:mcp-session:v1", "chopin", {
        tool_inspected_mean: 0.75, text_only_mean: 0.5, random_midi_mean: 0.5,
        margin_vs_text_only: 0.25, misinterp_count: 0,
      }),
      rec("chopin-nocturne-op9-no2:m009-012:piano:mcp-session:v1", "chopin", {
        tool_inspected_mean: 1.0, text_only_mean: 0.75, random_midi_mean: 0.5833,
        margin_vs_text_only: 0.25, misinterp_count: 0,
      }),
      // clair-de-lune (1 record, 1 margin_pass)
      rec("clair-de-lune:m031-034:piano:mcp-session:v1", "clair-de-lune", {
        tool_inspected_mean: 0.5, text_only_mean: 0.3333, random_midi_mean: 0.1667,
        margin_vs_text_only: 0.1667, misinterp_count: 2,
      }),
    ],
  };
}

/**
 * Slice 22 — Slice 21 baseline fixture with `per_record` provided.
 * Identical to slice19 except for schumann-traumerei:m045-048's per-record
 * means (R6-aware rewrite saturated all 4 conditions to 1.0 with
 * misinterp_count = 0). Under the revised gate, Slice 21 must PASS all 6
 * blocking axes — axis 2 lifts to 10/16 (62.5%) passing, axis 6 lifts to
 * all 5 strata qualifying.
 */
function slice21FixtureRevised(): ReleaseGateInput {
  // Slice 21 baseline aggregate numbers (matching slice21-release-gate-
  // assessment.json's gate_input).
  const slice19 = slice19FixtureRevised();
  const perRecord = slice19.per_record!.map(r =>
    r.recordId === "schumann-traumerei:m045-048:piano:mcp-session:v1"
      ? {
          ...r,
          tool_inspected_mean: 1.0,
          text_only_mean: 1.0,
          random_midi_mean: 1.0,
          margin_vs_text_only: 0,
          misinterp_count: 0,
        }
      : r,
  );
  return {
    n_records: 16,
    tool_inspected_mean: 0.6614583333333333,
    text_only_mean: 0.5,
    margin_tool_minus_text_mean: 0.16145833333333334,
    records_clearing_margin: 9, // legacy: 9/16
    tool_call_rate: 0.3279569892473118,
    correct_after_tool_rate: 0.819672131147541,
    misinterp_rate: 0.18032786885245902,
    per_stratum: [
      { stratum: "bach", n_records: 6, margin_tool_minus_text_mean: 0.2916666666666667, records_clearing_margin: 5 },
      { stratum: "pathetique", n_records: 5, margin_tool_minus_text_mean: 0.033333333333333326, records_clearing_margin: 1 },
      { stratum: "schumann", n_records: 2, margin_tool_minus_text_mean: 0, records_clearing_margin: 0 },
      { stratum: "chopin", n_records: 2, margin_tool_minus_text_mean: 0.25, records_clearing_margin: 2 },
      { stratum: "clair-de-lune", n_records: 1, margin_tool_minus_text_mean: 0.16666666666666669, records_clearing_margin: 1 },
    ],
    per_record: perRecord,
    enriched: {
      n_records: 9,
      tool_inspected_mean: 0.75,
      text_only_mean: 0.611111111111111,
      margin_tool_minus_text_mean: 0.13888888888888892,
      records_clearing_margin: 5,
      tool_call_rate: 0.12745098039215685,
    },
    non_enriched: {
      n_records: 7,
      tool_inspected_mean: 0.5476190476190477,
      text_only_mean: 0.35714285714285715,
      margin_tool_minus_text_mean: 0.19047619047619047,
      records_clearing_margin: 4,
      tool_call_rate: 0.5714285714285714,
    },
    reports_enriched_vs_non_enriched: true,
  };
}

// ─── Axis-level verdict tests ─────────────────────────────────────────────────

describe("evaluateReleaseGate — passing baseline", () => {
  it("returns passed=true and no failing axes when every axis clears default thresholds", () => {
    const result = evaluateReleaseGate(passingFixture());
    expect(result.passed).toBe(true);
    expect(result.failing_axes).toEqual([]);
    expect(result.blocking_failures).toEqual([]);
    expect(result.axes).toHaveLength(7);
    expect(result.axes.every(a => a.passed)).toBe(true);
    expect(result.summary).toContain("PASS");
  });

  it("exposes axis-7 as non-blocking in the per-axis verdict", () => {
    const result = evaluateReleaseGate(passingFixture());
    expect(result.axes[6].axis).toBe(7);
    expect(result.axes[6].blocking).toBe(false);
    // All axes 1-6 are blocking.
    for (let i = 0; i < 6; i++) {
      expect(result.axes[i].blocking).toBe(true);
    }
  });

  it("emits schema 1.0.0 when per_record is absent (pre-revision fallback)", () => {
    // Slice 22: schema version derives from per_record presence.
    const result = evaluateReleaseGate(passingFixture());
    expect(result.schema_version).toBe("release-gate-assessment/1.0.0");
  });
});

describe("evaluateReleaseGate — Slice 19 baseline (canonical fixture, pre-revision fallback path)", () => {
  // Slice 22 note: this fixture does NOT supply `per_record`, so the
  // validator falls back to the Slice-20 (1.0.0) logic. Axis 2 still fails
  // on the clearing-fraction clause, axis 6 still fails on Schumann.
  it("matches the slice-doc verdict on each axis (pre-revision logic)", () => {
    const result = evaluateReleaseGate(slice19Fixture());

    // Axis 1: tool_inspected 0.606 < 0.65 -> FAIL
    expect(result.axes[0].axis).toBe(1);
    expect(result.axes[0].passed).toBe(false);

    // Axis 2 (pre-revision): corpus margin 0.127 >= 0.10 BUT 9/16=56.25% < 60% -> FAIL
    expect(result.axes[1].axis).toBe(2);
    expect(result.axes[1].passed).toBe(false);

    // Axis 3: tool-call rate 0.328 >= 0.25 -> PASS
    expect(result.axes[2].axis).toBe(3);
    expect(result.axes[2].passed).toBe(true);

    // Axis 4: correct-after-tool 0.82 >= 0.75 -> PASS
    expect(result.axes[3].axis).toBe(4);
    expect(result.axes[3].passed).toBe(true);

    // Axis 5: misinterp 0.180 <= 0.20 -> PASS
    expect(result.axes[4].axis).toBe(5);
    expect(result.axes[4].passed).toBe(true);

    // Axis 6 (pre-revision): Schumann mean -0.278, 0/2 clearing -> FAIL
    expect(result.axes[5].axis).toBe(6);
    expect(result.axes[5].passed).toBe(false);

    // Axis 7: declared -> PASS
    expect(result.axes[6].axis).toBe(7);
    expect(result.axes[6].passed).toBe(true);

    // Aggregate: blocking failures on 1, 2, 6
    expect(result.blocking_failures).toEqual([1, 2, 6]);
    expect(result.passed).toBe(false);
  });

  it("returns a non-empty stratum-failure list on axis 6 (pre-revision logic)", () => {
    const result = evaluateReleaseGate(slice19Fixture());
    const axis6 = result.axes[5];
    const measured = axis6.measured as { failing_strata: Array<{ stratum: string }> };
    const stratumNames = measured.failing_strata.map(s => s.stratum);
    expect(stratumNames).toContain("schumann");
    // pathetique mean +0.033 passes the >=0 floor with 1 ≥ 1 clearing —
    // should PASS the legacy stratum check.
    expect(stratumNames).not.toContain("pathetique");
  });
});

// ─── Per-axis fail boundary tests ────────────────────────────────────────────

describe("evaluateReleaseGate — per-axis fail boundaries", () => {
  it("axis 1 fails when tool_inspected_mean drops below 0.65", () => {
    const input = passingFixture();
    input.tool_inspected_mean = 0.64;
    const result = evaluateReleaseGate(input);
    expect(result.axes[0].passed).toBe(false);
    expect(result.blocking_failures).toContain(1);
  });

  it("axis 2 (pre-revision) fails when corpus margin is below the floor (mean clause)", () => {
    const input = passingFixture();
    input.margin_tool_minus_text_mean = 0.09;
    const result = evaluateReleaseGate(input);
    expect(result.axes[1].passed).toBe(false);
    expect(result.blocking_failures).toContain(2);
  });

  it("axis 2 (pre-revision) fails when records-clearing fraction is below 60%", () => {
    const input = passingFixture();
    // 9/16 = 56.25% — exactly Slice 19's value
    input.records_clearing_margin = 9;
    const result = evaluateReleaseGate(input);
    expect(result.axes[1].passed).toBe(false);
    expect(result.blocking_failures).toContain(2);
  });

  it("axis 3 fails when tool-call rate is below 0.25", () => {
    const input = passingFixture();
    input.tool_call_rate = 0.24;
    const result = evaluateReleaseGate(input);
    expect(result.axes[2].passed).toBe(false);
    expect(result.blocking_failures).toContain(3);
  });

  it("axis 4 fails when correct-after-tool drops below 0.75", () => {
    const input = passingFixture();
    input.correct_after_tool_rate = 0.74;
    const result = evaluateReleaseGate(input);
    expect(result.axes[3].passed).toBe(false);
    expect(result.blocking_failures).toContain(4);
  });

  it("axis 5 fails when misinterp rate exceeds 0.20", () => {
    const input = passingFixture();
    input.misinterp_rate = 0.21;
    const result = evaluateReleaseGate(input);
    expect(result.axes[4].passed).toBe(false);
    expect(result.blocking_failures).toContain(5);
  });

  it("axis 6 (pre-revision) fails when any stratum has a negative mean margin", () => {
    const input = passingFixture();
    // Drop Schumann's margin to negative
    input.per_stratum = input.per_stratum.map(s =>
      s.stratum === "schumann"
        ? { ...s, margin_tool_minus_text_mean: -0.1 }
        : s
    );
    const result = evaluateReleaseGate(input);
    expect(result.axes[5].passed).toBe(false);
    expect(result.blocking_failures).toContain(6);
  });

  it("axis 6 (pre-revision) fails when any stratum has zero records clearing the margin", () => {
    const input = passingFixture();
    input.per_stratum = input.per_stratum.map(s =>
      s.stratum === "schumann"
        ? { ...s, records_clearing_margin: 0 }
        : s
    );
    const result = evaluateReleaseGate(input);
    expect(result.axes[5].passed).toBe(false);
    expect(result.blocking_failures).toContain(6);
  });

  it("axis 7 fails when the enriched-vs-non split is not declared", () => {
    const input = passingFixture();
    input.reports_enriched_vs_non_enriched = false;
    const result = evaluateReleaseGate(input);
    expect(result.axes[6].passed).toBe(false);
    // Axis 7 is non-blocking; failing it still flips aggregate per the
    // composition rule (reporting required).
    expect(result.blocking_failures).not.toContain(7);
    expect(result.failing_axes).toContain(7);
    expect(result.passed).toBe(false);
  });
});

// ─── Composition rule tests ─────────────────────────────────────────────────

describe("evaluateReleaseGate — composition rule", () => {
  it("aggregate passes when all blocking axes pass and axis 7 is declared", () => {
    const result = evaluateReleaseGate(passingFixture());
    expect(result.passed).toBe(true);
  });

  it("aggregate fails when any single blocking axis fails", () => {
    const input = passingFixture();
    input.tool_inspected_mean = 0.50; // breaks axis 1
    const result = evaluateReleaseGate(input);
    expect(result.passed).toBe(false);
    expect(result.blocking_failures).toEqual([1]);
  });

  it("aggregate fails when only axis 7 fails (reporting required)", () => {
    const input = passingFixture();
    input.reports_enriched_vs_non_enriched = false;
    const result = evaluateReleaseGate(input);
    expect(result.passed).toBe(false);
    expect(result.blocking_failures).toEqual([]);
    expect(result.failing_axes).toEqual([7]);
  });
});

// ─── Threshold-override tests ───────────────────────────────────────────────

describe("evaluateReleaseGate — custom thresholds", () => {
  it("respects an override that lowers axis 1 to current state", () => {
    const overrides: ReleaseGateThresholds = {
      ...DEFAULT_THRESHOLDS,
      axis1_absolute_floor: 0.60,
    };
    const result = evaluateReleaseGate(slice19Fixture(), overrides);
    expect(result.axes[0].passed).toBe(true);
    // But axis 2 + 6 still fail (pre-revision logic), so aggregate still fails.
    expect(result.passed).toBe(false);
    expect(result.blocking_failures).toContain(2);
    expect(result.blocking_failures).toContain(6);
  });

  it("snapshots the thresholds used in the result", () => {
    const overrides: ReleaseGateThresholds = {
      ...DEFAULT_THRESHOLDS,
      axis5_misinterp_ceiling: 0.10,
    };
    const result = evaluateReleaseGate(slice19Fixture(), overrides);
    expect(result.thresholds_used.axis5_misinterp_ceiling).toBe(0.10);
    // Slice 19 misinterp 0.180 > 0.10, so axis 5 should now fail.
    expect(result.axes[4].passed).toBe(false);
  });
});

// ─── Default thresholds — sanity ─────────────────────────────────────────────

describe("DEFAULT_THRESHOLDS", () => {
  it("encodes the Slice 20 + Slice 22 default RC gate thresholds", () => {
    // Slice 20 thresholds (UNCHANGED in Slice 22 for axes 1, 3, 4, 5, 7;
    // axes 2 + 6 corpus-level thresholds also unchanged in shape)
    expect(DEFAULT_THRESHOLDS.axis1_absolute_floor).toBe(0.65);
    expect(DEFAULT_THRESHOLDS.axis2_corpus_margin_floor).toBe(0.10);
    expect(DEFAULT_THRESHOLDS.axis2_records_clearing_fraction_floor).toBe(0.60);
    expect(DEFAULT_THRESHOLDS.axis2_per_record_margin).toBe(0.10);
    expect(DEFAULT_THRESHOLDS.axis3_tool_use_rate_floor).toBe(0.25);
    expect(DEFAULT_THRESHOLDS.axis4_correct_after_tool_floor).toBe(0.75);
    expect(DEFAULT_THRESHOLDS.axis5_misinterp_ceiling).toBe(0.20);
    expect(DEFAULT_THRESHOLDS.axis6_stratum_mean_margin_floor).toBe(0.0);
    expect(DEFAULT_THRESHOLDS.axis6_stratum_min_records_clearing).toBe(1);
    // Slice 22 additions
    expect(DEFAULT_THRESHOLDS.ceiling_saturated_floor).toBe(0.90);
    expect(DEFAULT_THRESHOLDS.axis6_stratum_min_mean_margin_when_ceiling).toBe(-0.10);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ─── Slice 22 — revised axes 2 + 6 ──────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────

describe("Slice 22 — isMarginPass helper", () => {
  it("returns true when margin >= +0.10 (default per-record floor)", () => {
    const r = rec("a", "bach", { margin_vs_text_only: 0.10 });
    expect(isMarginPass(r)).toBe(true);
  });

  it("returns true when margin > +0.10", () => {
    const r = rec("a", "bach", { margin_vs_text_only: 0.50 });
    expect(isMarginPass(r)).toBe(true);
  });

  it("returns false when margin < +0.10", () => {
    const r = rec("a", "bach", { margin_vs_text_only: 0.09 });
    expect(isMarginPass(r)).toBe(false);
  });

  it("respects a custom per-record-margin override", () => {
    const r = rec("a", "bach", { margin_vs_text_only: 0.05 });
    expect(isMarginPass(r, 0.05)).toBe(true);
    expect(isMarginPass(r, 0.10)).toBe(false);
  });
});

describe("Slice 22 — isCeilingSaturatedPass helper", () => {
  it("returns true when all 4 conditions meet ≥0.90 floor and misinterp=0", () => {
    const r = rec("schumann-m045", "schumann", {
      tool_inspected_mean: 1.0,
      text_only_mean: 1.0,
      random_midi_mean: 1.0,
      margin_vs_text_only: 0,
      misinterp_count: 0,
    });
    expect(isCeilingSaturatedPass(r)).toBe(true);
  });

  it("returns false when tool_inspected < 0.90 (one false condition)", () => {
    const r = rec("a", "bach", {
      tool_inspected_mean: 0.89,
      text_only_mean: 1.0,
      random_midi_mean: 1.0,
      misinterp_count: 0,
    });
    expect(isCeilingSaturatedPass(r)).toBe(false);
  });

  it("returns false when text_only < 0.90 (one false condition)", () => {
    const r = rec("a", "bach", {
      tool_inspected_mean: 1.0,
      text_only_mean: 0.89,
      random_midi_mean: 1.0,
      misinterp_count: 0,
    });
    expect(isCeilingSaturatedPass(r)).toBe(false);
  });

  it("returns false when random_midi < 0.90 (one false condition)", () => {
    // This is the failure mode that excludes schumann-traumerei:m001-004
    // from bucket B (tool=1.0, text=1.0, random_midi=0.75).
    const r = rec("schumann-m001", "schumann", {
      tool_inspected_mean: 1.0,
      text_only_mean: 1.0,
      random_midi_mean: 0.75,
      misinterp_count: 0,
    });
    expect(isCeilingSaturatedPass(r)).toBe(false);
  });

  it("returns false when misinterp_count > 0 even though all conditions are saturated", () => {
    // Operator's locked clause: ceiling_saturated_pass requires misinterp=0
    // to exclude the failure mode where the model ignores tools, gets prose
    // right, BUT misuses tool data when it does call them.
    const r = rec("a", "bach", {
      tool_inspected_mean: 1.0,
      text_only_mean: 1.0,
      random_midi_mean: 1.0,
      misinterp_count: 1,
    });
    expect(isCeilingSaturatedPass(r)).toBe(false);
  });

  it("respects a custom ceiling-saturated floor override", () => {
    const r = rec("a", "bach", {
      tool_inspected_mean: 0.85,
      text_only_mean: 0.85,
      random_midi_mean: 0.85,
      misinterp_count: 0,
    });
    expect(isCeilingSaturatedPass(r, 0.80)).toBe(true);
    expect(isCeilingSaturatedPass(r, 0.90)).toBe(false);
  });

  it("returns true at the exact floor (boundary check, ≥ not >)", () => {
    const r = rec("a", "bach", {
      tool_inspected_mean: 0.90,
      text_only_mean: 0.90,
      random_midi_mean: 0.90,
      misinterp_count: 0,
    });
    expect(isCeilingSaturatedPass(r)).toBe(true);
  });
});

describe("Slice 22 — recordPassesAxis2 (union of bucket A and bucket B)", () => {
  it("passes via bucket A only (margin_pass=true, ceiling_saturated=false)", () => {
    const r = rec("a", "bach", {
      tool_inspected_mean: 0.5,
      text_only_mean: 0.0,
      random_midi_mean: 0.0,
      margin_vs_text_only: 0.5,
      misinterp_count: 0,
    });
    expect(isMarginPass(r)).toBe(true);
    expect(isCeilingSaturatedPass(r)).toBe(false);
    expect(recordPassesAxis2(r)).toBe(true);
  });

  it("passes via bucket B only (margin_pass=false, ceiling_saturated=true)", () => {
    // Slice 21's schumann m045 — the load-bearing case the revision was
    // designed for.
    const r = rec("schumann-m045", "schumann", {
      tool_inspected_mean: 1.0,
      text_only_mean: 1.0,
      random_midi_mean: 1.0,
      margin_vs_text_only: 0,
      misinterp_count: 0,
    });
    expect(isMarginPass(r)).toBe(false);
    expect(isCeilingSaturatedPass(r)).toBe(true);
    expect(recordPassesAxis2(r)).toBe(true);
  });

  it("passes via both buckets (margin_pass=true AND ceiling_saturated=true)", () => {
    // A hypothetical "double-good" record: text_only at 0.85 and
    // tool_inspected at 0.95, all saturated, margin +0.10. Both buckets true.
    const r = rec("a", "bach", {
      tool_inspected_mean: 1.0,
      text_only_mean: 0.90,
      random_midi_mean: 0.95,
      margin_vs_text_only: 0.10,
      misinterp_count: 0,
    });
    expect(isMarginPass(r)).toBe(true);
    expect(isCeilingSaturatedPass(r)).toBe(true);
    expect(recordPassesAxis2(r)).toBe(true);
  });

  it("fails when neither bucket holds (no margin AND not saturated)", () => {
    const r = rec("a", "bach", {
      tool_inspected_mean: 0.5,
      text_only_mean: 0.5,
      random_midi_mean: 0.5,
      margin_vs_text_only: 0,
      misinterp_count: 0,
    });
    expect(isMarginPass(r)).toBe(false);
    expect(isCeilingSaturatedPass(r)).toBe(false);
    expect(recordPassesAxis2(r)).toBe(false);
  });
});

describe("Slice 22 — classifyRecord", () => {
  it("returns a structured classification with both bucket flags and the union", () => {
    const r = rec("schumann-m045", "schumann", {
      tool_inspected_mean: 1.0,
      text_only_mean: 1.0,
      random_midi_mean: 1.0,
      margin_vs_text_only: 0,
      misinterp_count: 0,
    });
    const c = classifyRecord(r);
    expect(c.recordId).toBe("schumann-m045");
    expect(c.stratum).toBe("schumann");
    expect(c.margin_pass).toBe(false);
    expect(c.ceiling_saturated_pass).toBe(true);
    expect(c.passes_axis2).toBe(true);
    expect(c.tool_inspected_mean).toBe(1.0);
    expect(c.text_only_mean).toBe(1.0);
    expect(c.random_midi_mean).toBe(1.0);
    expect(c.margin_vs_text_only).toBe(0);
    expect(c.misinterp_count).toBe(0);
  });
});

describe("Slice 22 — axis 2 with per_record (revised union logic)", () => {
  it("counts records passing via union of bucket A + bucket B (Slice 21 baseline forward)", () => {
    const result = evaluateReleaseGate(slice21FixtureRevised());
    const axis2 = result.axes[1];
    expect(axis2.passed).toBe(true);
    const measured = axis2.measured as {
      records_passing_axis2: number;
      n_records: number;
      passing_fraction: number;
      bucket_counts: { margin_pass_only: number; ceiling_saturated_only: number; both: number; neither: number };
    };
    expect(measured.records_passing_axis2).toBe(10);
    expect(measured.n_records).toBe(16);
    expect(measured.passing_fraction).toBeCloseTo(0.625, 3);
    expect(measured.bucket_counts.margin_pass_only).toBe(9);
    expect(measured.bucket_counts.ceiling_saturated_only).toBe(1);
    expect(measured.bucket_counts.both).toBe(0);
    expect(measured.bucket_counts.neither).toBe(6);
  });

  it("FAILS axis 2 on Slice 19 baseline (regression — no record qualifies for bucket B)", () => {
    const result = evaluateReleaseGate(slice19FixtureRevised());
    const axis2 = result.axes[1];
    expect(axis2.passed).toBe(false);
    const measured = axis2.measured as {
      records_passing_axis2: number;
      n_records: number;
      passing_fraction: number;
      bucket_counts: { margin_pass_only: number; ceiling_saturated_only: number; both: number; neither: number };
    };
    expect(measured.records_passing_axis2).toBe(9);
    expect(measured.bucket_counts.ceiling_saturated_only).toBe(0);
    expect(measured.passing_fraction).toBeCloseTo(0.5625, 3);
  });

  it("emits schema 2.0.0 when per_record is provided", () => {
    const result = evaluateReleaseGate(slice21FixtureRevised());
    expect(result.schema_version).toBe("release-gate-assessment/2.0.0");
  });

  it("marks axis 2 threshold.revised=true when per_record is provided", () => {
    const result = evaluateReleaseGate(slice21FixtureRevised());
    const threshold = result.axes[1].threshold as { revised: boolean };
    expect(threshold.revised).toBe(true);
  });

  it("marks axis 2 threshold.revised=false when per_record is absent (legacy)", () => {
    const result = evaluateReleaseGate(slice19Fixture());
    const threshold = result.axes[1].threshold as { revised: boolean };
    expect(threshold.revised).toBe(false);
  });
});

describe("Slice 22 — axis 6 with per_record (revised compound rule)", () => {
  it("PASSES axis 6 when a stratum qualifies via bucket B (Slice 21 schumann via ceiling_saturated_pass)", () => {
    const result = evaluateReleaseGate(slice21FixtureRevised());
    const axis6 = result.axes[5];
    expect(axis6.passed).toBe(true);
    const measured = axis6.measured as {
      stratum_qualifications: Array<{
        stratum: string;
        qualified_via: "bucket_a" | "bucket_b" | "none";
      }>;
    };
    const schumann = measured.stratum_qualifications.find(s => s.stratum === "schumann");
    expect(schumann?.qualified_via).toBe("bucket_b");
    // Other 4 strata should all qualify via bucket A
    const others = measured.stratum_qualifications.filter(s => s.stratum !== "schumann");
    for (const s of others) {
      expect(s.qualified_via).toBe("bucket_a");
    }
  });

  it("FAILS axis 6 on Slice 19 baseline (Schumann has no bucket-A and no bucket-B record)", () => {
    const result = evaluateReleaseGate(slice19FixtureRevised());
    const axis6 = result.axes[5];
    expect(axis6.passed).toBe(false);
    const measured = axis6.measured as {
      failing_strata: Array<{ stratum: string; reason?: string }>;
    };
    const schumann = measured.failing_strata.find(s => s.stratum === "schumann");
    expect(schumann).toBeDefined();
    expect(schumann?.reason).toContain("no margin_pass and no ceiling_saturated_pass record");
  });

  it("FAILS axis 6 when stratum has ceiling_saturated_pass but mean margin < -0.10 (regression case)", () => {
    // Construct a synthetic stratum: 1 ceiling_saturated_pass record but
    // the stratum mean margin is -0.15, below the -0.10 floor for bucket B.
    const input: ReleaseGateInput = {
      ...slice21FixtureRevised(),
      per_stratum: [
        { stratum: "test", n_records: 2, margin_tool_minus_text_mean: -0.15, records_clearing_margin: 0 },
      ],
      per_record: [
        rec("test-a", "test", {
          tool_inspected_mean: 1.0,
          text_only_mean: 1.0,
          random_midi_mean: 1.0,
          margin_vs_text_only: 0,
          misinterp_count: 0,
        }),
        rec("test-b", "test", {
          tool_inspected_mean: 0.0,
          text_only_mean: 0.3,
          random_midi_mean: 0.0,
          margin_vs_text_only: -0.30,
          misinterp_count: 0,
        }),
      ],
    };
    const result = evaluateReleaseGate(input);
    const axis6 = result.axes[5];
    expect(axis6.passed).toBe(false);
    const measured = axis6.measured as {
      failing_strata: Array<{ stratum: string; reason?: string }>;
    };
    const test = measured.failing_strata.find(s => s.stratum === "test");
    expect(test).toBeDefined();
    expect(test?.reason).toContain("ceiling_saturated record(s) but stratum mean margin");
  });

  it("PASSES axis 6 stratum via bucket A even when stratum mean margin is slightly negative (no ceiling-bucket constraint applies)", () => {
    // Bucket A doesn't impose stratum-mean constraint beyond legacy
    // floor 0.0 — but in the revised compound rule, bucket-A qualification
    // alone suffices, regardless of the legacy mean floor. This test
    // documents that bucket-A qualifying records short-circuit the
    // bucket-B mean-margin gate.
    const input: ReleaseGateInput = {
      ...slice21FixtureRevised(),
      per_stratum: [
        { stratum: "test", n_records: 2, margin_tool_minus_text_mean: -0.05, records_clearing_margin: 1 },
      ],
      per_record: [
        rec("test-a", "test", {
          tool_inspected_mean: 0.6,
          text_only_mean: 0.4,
          random_midi_mean: 0.4,
          margin_vs_text_only: 0.20,
          misinterp_count: 0,
        }),
        rec("test-b", "test", {
          tool_inspected_mean: 0.1,
          text_only_mean: 0.4,
          random_midi_mean: 0.4,
          margin_vs_text_only: -0.30,
          misinterp_count: 0,
        }),
      ],
    };
    const result = evaluateReleaseGate(input);
    const axis6 = result.axes[5];
    expect(axis6.passed).toBe(true);
    const measured = axis6.measured as {
      stratum_qualifications: Array<{ stratum: string; qualified_via: string }>;
    };
    const test = measured.stratum_qualifications.find(s => s.stratum === "test");
    expect(test?.qualified_via).toBe("bucket_a");
  });
});

// ─── Slice 19 regression / Slice 21 forward (end-to-end) ───────────────────

describe("Slice 22 — Slice 19 baseline regression check (revised gate must still FAIL)", () => {
  it("Slice 19 with per_record FAILS axes 1, 2, 6 (diagnostic power preserved)", () => {
    const result = evaluateReleaseGate(slice19FixtureRevised());
    expect(result.schema_version).toBe("release-gate-assessment/2.0.0");
    // Axis 1: 0.606 < 0.65
    expect(result.axes[0].passed).toBe(false);
    // Axis 2 (revised union): still 9 margin_only + 0 ceiling_saturated = 9/16 = 56.25% < 60%
    expect(result.axes[1].passed).toBe(false);
    // Axis 6 (revised compound): Schumann has no bucket-A and no bucket-B record
    expect(result.axes[5].passed).toBe(false);
    expect(result.blocking_failures).toEqual([1, 2, 6]);
    expect(result.passed).toBe(false);
  });
});

describe("Slice 22 — Slice 21 baseline forward (revised gate clears)", () => {
  it("Slice 21 with per_record PASSES all 6 blocking axes (the bug fix)", () => {
    const result = evaluateReleaseGate(slice21FixtureRevised());
    expect(result.schema_version).toBe("release-gate-assessment/2.0.0");
    // Axis 1: 0.661 >= 0.65 PASS
    expect(result.axes[0].passed).toBe(true);
    // Axis 2 (revised): 10/16 (62.5%) passing >= 60% PASS
    expect(result.axes[1].passed).toBe(true);
    // Axis 3: 0.328 >= 0.25 PASS
    expect(result.axes[2].passed).toBe(true);
    // Axis 4: 0.820 >= 0.75 PASS
    expect(result.axes[3].passed).toBe(true);
    // Axis 5: 0.180 <= 0.20 PASS
    expect(result.axes[4].passed).toBe(true);
    // Axis 6 (revised): Schumann passes via bucket B PASS
    expect(result.axes[5].passed).toBe(true);
    // Axis 7: declared PASS
    expect(result.axes[6].passed).toBe(true);
    expect(result.blocking_failures).toEqual([]);
    expect(result.passed).toBe(true);
  });
});
