// ─── Tests for release-gate.ts (jam-actions-v0 Slice 20) ────────────────────
//
// Validates the pure 7-axis RC gate library. No I/O, no real artifact reads.
// Uses synthetic ReleaseGateInput fixtures designed to exercise each axis at
// its boundary plus the composition rule.
//
// Coverage:
//   - Slice 19 baseline fixture: documents which axes Slice 19 fails
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
//
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  evaluateReleaseGate,
  DEFAULT_THRESHOLDS,
  type ReleaseGateInput,
  type ReleaseGateThresholds,
} from "./release-gate.js";

// ─── Fixture builders ────────────────────────────────────────────────────────

/**
 * Build a "passing" baseline that clears every axis at default thresholds.
 * Used as the starting point for tests that need to perturb one axis at a
 * time.
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
});

describe("evaluateReleaseGate — Slice 19 baseline (canonical fixture)", () => {
  it("matches the slice-doc verdict on each axis", () => {
    const result = evaluateReleaseGate(slice19Fixture());

    // Axis 1: tool_inspected 0.606 < 0.65 -> FAIL
    expect(result.axes[0].axis).toBe(1);
    expect(result.axes[0].passed).toBe(false);

    // Axis 2: corpus margin 0.127 >= 0.10 BUT 9/16=56.25% < 60% -> FAIL
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

    // Axis 6: Schumann mean -0.278, 0/2 clearing -> FAIL (catastrophic subgroup)
    expect(result.axes[5].axis).toBe(6);
    expect(result.axes[5].passed).toBe(false);

    // Axis 7: declared -> PASS
    expect(result.axes[6].axis).toBe(7);
    expect(result.axes[6].passed).toBe(true);

    // Aggregate: blocking failures on 1, 2, 6
    expect(result.blocking_failures).toEqual([1, 2, 6]);
    expect(result.passed).toBe(false);
  });

  it("returns a non-empty stratum-failure list on axis 6", () => {
    const result = evaluateReleaseGate(slice19Fixture());
    const axis6 = result.axes[5];
    const measured = axis6.measured as { failing_strata: Array<{ stratum: string }> };
    const stratumNames = measured.failing_strata.map(s => s.stratum);
    expect(stratumNames).toContain("schumann");
    // pathetique mean +0.033 passes the >=0 floor but only 1/5 clearing — both
    // clauses must hold, so it should also fail (1 clearing is the minimum,
    // so this passes the per-stratum-records clause). pathetique should PASS
    // the default stratum check (passes mean ≥ 0 AND 1 ≥ 1 clearing).
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

  it("axis 2 fails when corpus margin is below the floor (mean clause)", () => {
    const input = passingFixture();
    input.margin_tool_minus_text_mean = 0.09;
    const result = evaluateReleaseGate(input);
    expect(result.axes[1].passed).toBe(false);
    expect(result.blocking_failures).toContain(2);
  });

  it("axis 2 fails when records-clearing fraction is below 60%", () => {
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

  it("axis 6 fails when any stratum has a negative mean margin", () => {
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

  it("axis 6 fails when any stratum has zero records clearing the margin", () => {
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
    // But axis 2 + 6 still fail, so aggregate still fails.
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
  it("encodes the Slice 20 default RC gate thresholds", () => {
    expect(DEFAULT_THRESHOLDS.axis1_absolute_floor).toBe(0.65);
    expect(DEFAULT_THRESHOLDS.axis2_corpus_margin_floor).toBe(0.10);
    expect(DEFAULT_THRESHOLDS.axis2_records_clearing_fraction_floor).toBe(0.60);
    expect(DEFAULT_THRESHOLDS.axis2_per_record_margin).toBe(0.10);
    expect(DEFAULT_THRESHOLDS.axis3_tool_use_rate_floor).toBe(0.25);
    expect(DEFAULT_THRESHOLDS.axis4_correct_after_tool_floor).toBe(0.75);
    expect(DEFAULT_THRESHOLDS.axis5_misinterp_ceiling).toBe(0.20);
    expect(DEFAULT_THRESHOLDS.axis6_stratum_mean_margin_floor).toBe(0.0);
    expect(DEFAULT_THRESHOLDS.axis6_stratum_min_records_clearing).toBe(1);
  });
});
