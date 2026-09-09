// ─── Acoustic release-gate adapter tests ─────────────────────────────────────
//
// Axis 7 fails if the declaration is omitted. The adapter must DECLARE that
// there is no enrichment split; it must not skip the axis.

import { describe, it, expect } from "vitest";
import {
  evaluateAcousticReleaseGate,
  NO_ENRICHMENT_SPLIT_DECLARATION,
  toReleaseGateInput,
  type AcousticAssessment,
} from "./release-adapter.js";
import { evaluateReleaseGate } from "../release/release-gate.js";

function stubAssessment(
  extra: Partial<AcousticAssessment> = {},
): AcousticAssessment {
  return {
    n_records: 9,
    tool_inspected_mean: 0,
    text_only_mean: 0,
    random_audio_mean: 0,
    margin_tool_minus_text_mean: 0,
    records_clearing_margin: 0,
    tool_call_rate: 0,
    correct_after_tool_rate: 0,
    misinterp_rate: 0,
    per_stratum: [
      {
        stratum: "clean",
        n_records: 9,
        margin_tool_minus_text_mean: 0,
        records_clearing_margin: 0,
      },
    ],
    declare_no_enrichment_split: true,
    ...extra,
  };
}

describe("declaration", () => {
  it("refuses to build an input that skips the axis-7 declaration", () => {
    expect(() => toReleaseGateInput(stubAssessment({
      declare_no_enrichment_split: false,
    }))).toThrow(/declare/i);
  });

  it("sets reports_enriched_vs_non_enriched true, enriched n=0", () => {
    const input = toReleaseGateInput(stubAssessment());
    expect(input.reports_enriched_vs_non_enriched).toBe(true);
    expect(input.enriched.n_records).toBe(0);
    expect(input.non_enriched.n_records).toBe(9);
  });
});

describe("evaluateAcousticReleaseGate", () => {
  it("passes axis 7 by declaration even when blocking axes fail", () => {
    const result = evaluateAcousticReleaseGate(stubAssessment());
    const axis7 = result.axes.find((a) => a.axis === 7);
    expect(axis7).toBeDefined();
    expect(axis7!.passed).toBe(true);
    expect(result.declaration).toBe(NO_ENRICHMENT_SPLIT_DECLARATION);
    expect(result.passed).toBe(false);
    expect(result.blocking_failures.length).toBeGreaterThan(0);
  });

  it("axis 7 fails on the raw gate when the declaration is omitted", () => {
    const input = toReleaseGateInput(stubAssessment());
    const omitted = { ...input, reports_enriched_vs_non_enriched: false };
    const result = evaluateReleaseGate(omitted);
    const axis7 = result.axes.find((a) => a.axis === 7);
    expect(axis7!.passed).toBe(false);
    expect(result.failing_axes).toContain(7);
  });
});
