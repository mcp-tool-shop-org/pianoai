// ─── jam-actions-v0 Slice 20 — Release Threshold Framework ──────────────────
//
// Pure library for evaluating a 7-axis Release Candidate (RC) gate against a
// Slice-19-shaped baseline assessment. The library is deliberately NOT
// responsible for reading or aggregating raw eval artifacts — that lives in
// `scripts/check-release-gate.ts`, which derives the assessment shape from the
// canonical Slice 19 baseline JSON and the source-of-record per-question
// traces, then feeds the result to `evaluateReleaseGate`.
//
// Design constraints (LOCKED for Slice 20):
//   - PURE FUNCTION — no I/O, no global state, fully unit-testable
//   - Returns a structured per-axis verdict alongside a single aggregate
//     pass/fail derived by the composition rule
//   - Composition rule: axes 1–6 are BLOCKING (all must pass); axis 7 is
//     REPORTING (the artifact must declare it satisfies reporting, otherwise
//     the gate fails on axis 7 as well)
//   - All thresholds are numeric and overridable; the library encodes default
//     thresholds as exported constants so CLI flags can override per axis
//
// Doctrine — the 7 axes:
//
//   Axis 1: Absolute tool_inspected floor
//     Default 0.65. Captures "the model with tools meaningfully outperforms
//     text-alone in absolute terms," not just on margin. Slice 19 sits at
//     0.606 (fails).
//
//   Axis 2: tool_inspected − text_only margin
//     Default corpus mean ≥ +0.10 AND ≥ 60% of records clear +0.10. The +0.10
//     margin convention is locked from Slice 17 doctrine; the records-clearing
//     clause guards against a single-stratum-driven corpus mean. Slice 19:
//     corpus +0.127 passes the mean clause, 9/16 (56.25%) fails the clearance
//     clause.
//
//   Axis 3: Tool-call rate (corpus)
//     Default ≥ 0.25. A single corpus floor; per-subset (enriched vs
//     non-enriched) splits are reported but not separately gated to avoid
//     forcing enrichment removal. Slice 19: 0.328 passes.
//
//   Axis 4: Correct-after-tool-call rate
//     Default ≥ 0.75. When the model calls a tool, the answer should usually
//     be correct. Slice 19: 0.820 passes.
//
//   Axis 5: Misinterpretation rate (complement of axis 4 strictly on
//     tool-called questions)
//     Default ≤ 0.20. Slice 19: 0.180 passes.
//
//   Axis 6: Stratum floor / no catastrophic subgroup
//     Compound: every stratum mean margin ≥ 0 AND every stratum has ≥ 1
//     record clearing +0.10. Slice 19: Schumann fails both clauses (mean
//     −0.278, 0/2 cleared).
//
//   Axis 7: Enriched-vs-non-enriched reporting (declared)
//     The assessment must declare it includes both subsets' numbers across
//     all 4 conditions in the released documentation. Not a numeric pass/fail;
//     fails only if the assessment artifact omits the declaration.
//
// This module is the CANDIDATE RC gate definition. It is NOT a release
// approval claim. Producing a "PASS" verdict from this validator does NOT
// mean the dataset is RC ready — that's a downstream decision the operator
// makes after considering the gate's output alongside other factors.
//
// ─────────────────────────────────────────────────────────────────────────────

/** Per-stratum input shape required by the gate. */
export interface StratumAssessment {
  /** Stratum identifier (e.g. "bach", "schumann"). */
  stratum: string;
  /** Number of records in this stratum (≥ 1). */
  n_records: number;
  /** Mean of (tool_inspected − text_only) over the stratum's records. */
  margin_tool_minus_text_mean: number;
  /** Number of records in this stratum with margin ≥ +0.10. */
  records_clearing_margin: number;
}

/** Subset slice (enriched vs non-enriched) input shape. */
export interface SubsetAssessment {
  /** Number of records in this subset. */
  n_records: number;
  /** Corpus-mean tool_inspected metric. */
  tool_inspected_mean: number;
  /** Corpus-mean text_only metric. */
  text_only_mean: number;
  /** Corpus-mean (tool_inspected − text_only) margin. */
  margin_tool_minus_text_mean: number;
  /** Number of records clearing +0.10 margin. */
  records_clearing_margin: number;
  /** Tool-call rate (questions with ≥1 tool call / total questions). */
  tool_call_rate: number;
}

/** Top-level input artifact the gate evaluates. */
export interface ReleaseGateInput {
  /**
   * Number of corpus records (must equal the sum across strata and across
   * enriched + non_enriched subsets).
   */
  n_records: number;
  /** Corpus-mean tool_inspected metric (post-fair-gold). */
  tool_inspected_mean: number;
  /** Corpus-mean text_only metric. */
  text_only_mean: number;
  /** Corpus-mean tool−text margin. */
  margin_tool_minus_text_mean: number;
  /** Number of records clearing tool−text margin ≥ +0.10. */
  records_clearing_margin: number;
  /** Corpus tool-call rate. */
  tool_call_rate: number;
  /** Fraction of tool-called questions where the model answered correctly. */
  correct_after_tool_rate: number;
  /**
   * Fraction of tool-called questions where the model answered incorrectly
   * (complement of correct_after_tool_rate; carried explicitly to keep
   * axis-4/5 reporting symmetric).
   */
  misinterp_rate: number;
  /** Per-stratum assessment used to evaluate axis 6. */
  per_stratum: StratumAssessment[];
  /** Enriched-subset assessment used for axis 7 reporting. */
  enriched: SubsetAssessment;
  /** Non-enriched-subset assessment used for axis 7 reporting. */
  non_enriched: SubsetAssessment;
  /**
   * Whether the release documentation includes both enriched and
   * non-enriched numbers across all 4 conditions (axis 7).
   */
  reports_enriched_vs_non_enriched: boolean;
}

/** Numeric and structural thresholds the gate evaluates against. */
export interface ReleaseGateThresholds {
  /** Axis 1: minimum corpus mean tool_inspected. */
  axis1_absolute_floor: number;
  /** Axis 2: minimum corpus mean tool−text margin. */
  axis2_corpus_margin_floor: number;
  /** Axis 2: minimum fraction of records that must clear the margin. */
  axis2_records_clearing_fraction_floor: number;
  /** Axis 2: per-record margin threshold (the "+0.10 bar"). */
  axis2_per_record_margin: number;
  /** Axis 3: minimum corpus tool-call rate. */
  axis3_tool_use_rate_floor: number;
  /** Axis 4: minimum correct-after-tool-call rate. */
  axis4_correct_after_tool_floor: number;
  /** Axis 5: maximum misinterpretation rate. */
  axis5_misinterp_ceiling: number;
  /** Axis 6: minimum stratum mean margin. */
  axis6_stratum_mean_margin_floor: number;
  /** Axis 6: minimum records clearing margin per stratum (e.g. 1). */
  axis6_stratum_min_records_clearing: number;
}

/** Default thresholds — Slice 20 candidate RC gate. */
export const DEFAULT_THRESHOLDS: ReleaseGateThresholds = {
  axis1_absolute_floor: 0.65,
  axis2_corpus_margin_floor: 0.10,
  axis2_records_clearing_fraction_floor: 0.60,
  axis2_per_record_margin: 0.10,
  axis3_tool_use_rate_floor: 0.25,
  axis4_correct_after_tool_floor: 0.75,
  axis5_misinterp_ceiling: 0.20,
  axis6_stratum_mean_margin_floor: 0.0,
  axis6_stratum_min_records_clearing: 1,
};

/** Per-axis verdict shape. */
export interface AxisVerdict {
  /** 1..7. */
  axis: number;
  /** Short axis label (e.g. "absolute_floor"). */
  name: string;
  /** Pass/fail for this axis. */
  passed: boolean;
  /** Whether this axis blocks the aggregate verdict (false for axis 7). */
  blocking: boolean;
  /** The threshold value(s) applied. */
  threshold: unknown;
  /** The measured value(s) compared against threshold. */
  measured: unknown;
  /** Human-readable rationale / explanation of pass-fail. */
  note: string;
}

/** Top-level gate verdict. */
export interface GateResult {
  /** True if and only if every BLOCKING axis passed AND axis 7 declared. */
  passed: boolean;
  /** Subset of axis verdicts that failed (blocking and non-blocking). */
  failing_axes: number[];
  /** Subset of BLOCKING axis verdicts that failed. */
  blocking_failures: number[];
  /** Per-axis verdicts in axis-number order. */
  axes: AxisVerdict[];
  /** Snapshot of the thresholds the gate ran against. */
  thresholds_used: ReleaseGateThresholds;
  /** Human-readable summary line. */
  summary: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function nearlyAtLeast(value: number, threshold: number): boolean {
  // Strict ≥ for now; helper exists in case we want to tolerate fp noise later.
  return value >= threshold;
}

function nearlyAtMost(value: number, threshold: number): boolean {
  return value <= threshold;
}

// ─── main API ───────────────────────────────────────────────────────────────

/**
 * Evaluate a 7-axis Release Candidate gate against a Slice-19-shaped
 * assessment.
 *
 * @param input        The corpus-level assessment plus per-stratum and
 *                     per-subset rollups.
 * @param thresholds   Numeric thresholds (defaults from `DEFAULT_THRESHOLDS`).
 * @returns            A `GateResult` with per-axis verdicts plus the
 *                     aggregate `passed` flag (BLOCKING-only composition).
 */
export function evaluateReleaseGate(
  input: ReleaseGateInput,
  thresholds: ReleaseGateThresholds = DEFAULT_THRESHOLDS,
): GateResult {
  const axes: AxisVerdict[] = [];

  // ─── Axis 1: Absolute tool_inspected floor ────────────────────────────────
  {
    const passed = nearlyAtLeast(input.tool_inspected_mean, thresholds.axis1_absolute_floor);
    axes.push({
      axis: 1,
      name: "absolute_floor",
      passed,
      blocking: true,
      threshold: { floor: thresholds.axis1_absolute_floor },
      measured: { tool_inspected_mean: input.tool_inspected_mean },
      note: passed
        ? `Corpus tool_inspected mean ${input.tool_inspected_mean.toFixed(3)} ≥ ${thresholds.axis1_absolute_floor.toFixed(3)}`
        : `Corpus tool_inspected mean ${input.tool_inspected_mean.toFixed(3)} < ${thresholds.axis1_absolute_floor.toFixed(3)} — model with tools does not yet clear absolute-capability floor`,
    });
  }

  // ─── Axis 2: tool−text margin (compound: corpus mean AND records-clearing fraction) ─
  {
    const clearingFraction = input.n_records > 0 ? input.records_clearing_margin / input.n_records : 0;
    const meanOk = nearlyAtLeast(input.margin_tool_minus_text_mean, thresholds.axis2_corpus_margin_floor);
    const clearOk = nearlyAtLeast(clearingFraction, thresholds.axis2_records_clearing_fraction_floor);
    const passed = meanOk && clearOk;
    const meanNote = meanOk
      ? `corpus margin ${input.margin_tool_minus_text_mean.toFixed(3)} ≥ ${thresholds.axis2_corpus_margin_floor.toFixed(3)}`
      : `corpus margin ${input.margin_tool_minus_text_mean.toFixed(3)} < ${thresholds.axis2_corpus_margin_floor.toFixed(3)}`;
    const clearNote = clearOk
      ? `${input.records_clearing_margin}/${input.n_records} (${(clearingFraction * 100).toFixed(1)}%) clearing +${thresholds.axis2_per_record_margin.toFixed(2)} ≥ ${(thresholds.axis2_records_clearing_fraction_floor * 100).toFixed(1)}%`
      : `${input.records_clearing_margin}/${input.n_records} (${(clearingFraction * 100).toFixed(1)}%) clearing +${thresholds.axis2_per_record_margin.toFixed(2)} < ${(thresholds.axis2_records_clearing_fraction_floor * 100).toFixed(1)}%`;
    axes.push({
      axis: 2,
      name: "margin",
      passed,
      blocking: true,
      threshold: {
        corpus_margin_floor: thresholds.axis2_corpus_margin_floor,
        records_clearing_fraction_floor: thresholds.axis2_records_clearing_fraction_floor,
        per_record_margin: thresholds.axis2_per_record_margin,
      },
      measured: {
        corpus_margin_mean: input.margin_tool_minus_text_mean,
        records_clearing: input.records_clearing_margin,
        n_records: input.n_records,
        clearing_fraction: clearingFraction,
      },
      note: passed
        ? `Compound PASS: ${meanNote}; ${clearNote}`
        : `Compound FAIL: ${meanNote}; ${clearNote}`,
    });
  }

  // ─── Axis 3: Tool-call rate ───────────────────────────────────────────────
  {
    const passed = nearlyAtLeast(input.tool_call_rate, thresholds.axis3_tool_use_rate_floor);
    axes.push({
      axis: 3,
      name: "tool_use_rate",
      passed,
      blocking: true,
      threshold: { floor: thresholds.axis3_tool_use_rate_floor },
      measured: {
        corpus_tool_call_rate: input.tool_call_rate,
        enriched_tool_call_rate: input.enriched.tool_call_rate,
        non_enriched_tool_call_rate: input.non_enriched.tool_call_rate,
      },
      note: passed
        ? `Corpus tool-call rate ${(input.tool_call_rate * 100).toFixed(1)}% ≥ ${(thresholds.axis3_tool_use_rate_floor * 100).toFixed(1)}% (enriched ${(input.enriched.tool_call_rate * 100).toFixed(1)}% / non-enriched ${(input.non_enriched.tool_call_rate * 100).toFixed(1)}%)`
        : `Corpus tool-call rate ${(input.tool_call_rate * 100).toFixed(1)}% < ${(thresholds.axis3_tool_use_rate_floor * 100).toFixed(1)}% — model appears to ignore the inspector surface`,
    });
  }

  // ─── Axis 4: Correct-after-tool-call rate ─────────────────────────────────
  {
    const passed = nearlyAtLeast(input.correct_after_tool_rate, thresholds.axis4_correct_after_tool_floor);
    axes.push({
      axis: 4,
      name: "correct_after_tool",
      passed,
      blocking: true,
      threshold: { floor: thresholds.axis4_correct_after_tool_floor },
      measured: { correct_after_tool_rate: input.correct_after_tool_rate },
      note: passed
        ? `Correct-after-tool ${(input.correct_after_tool_rate * 100).toFixed(1)}% ≥ ${(thresholds.axis4_correct_after_tool_floor * 100).toFixed(1)}%`
        : `Correct-after-tool ${(input.correct_after_tool_rate * 100).toFixed(1)}% < ${(thresholds.axis4_correct_after_tool_floor * 100).toFixed(1)}% — model frequently misinterprets correct tool data`,
    });
  }

  // ─── Axis 5: Misinterpretation rate ───────────────────────────────────────
  {
    const passed = nearlyAtMost(input.misinterp_rate, thresholds.axis5_misinterp_ceiling);
    axes.push({
      axis: 5,
      name: "misinterp",
      passed,
      blocking: true,
      threshold: { ceiling: thresholds.axis5_misinterp_ceiling },
      measured: { misinterp_rate: input.misinterp_rate },
      note: passed
        ? `Misinterp rate ${(input.misinterp_rate * 100).toFixed(1)}% ≤ ${(thresholds.axis5_misinterp_ceiling * 100).toFixed(1)}%`
        : `Misinterp rate ${(input.misinterp_rate * 100).toFixed(1)}% > ${(thresholds.axis5_misinterp_ceiling * 100).toFixed(1)}% — too many tool-called questions get wrong answers`,
    });
  }

  // ─── Axis 6: Stratum floor / no catastrophic subgroup ─────────────────────
  {
    const failingStrata = input.per_stratum.filter(s => {
      const meanOk = nearlyAtLeast(s.margin_tool_minus_text_mean, thresholds.axis6_stratum_mean_margin_floor);
      const clearOk = nearlyAtLeast(s.records_clearing_margin, thresholds.axis6_stratum_min_records_clearing);
      return !(meanOk && clearOk);
    });
    const passed = failingStrata.length === 0;
    axes.push({
      axis: 6,
      name: "stratum_floor",
      passed,
      blocking: true,
      threshold: {
        stratum_mean_margin_floor: thresholds.axis6_stratum_mean_margin_floor,
        stratum_min_records_clearing: thresholds.axis6_stratum_min_records_clearing,
      },
      measured: {
        n_strata: input.per_stratum.length,
        failing_strata: failingStrata.map(s => ({
          stratum: s.stratum,
          n_records: s.n_records,
          margin_mean: s.margin_tool_minus_text_mean,
          records_clearing: s.records_clearing_margin,
        })),
      },
      note: passed
        ? `All ${input.per_stratum.length} strata clear stratum floor (mean margin ≥ ${thresholds.axis6_stratum_mean_margin_floor.toFixed(2)} AND ≥${thresholds.axis6_stratum_min_records_clearing} record clearing)`
        : `${failingStrata.length} stratum/strata fail: ${failingStrata.map(s => `${s.stratum}(mean ${s.margin_tool_minus_text_mean.toFixed(3)}, ${s.records_clearing_margin}/${s.n_records} clearing)`).join("; ")} — catastrophic subgroup present`,
    });
  }

  // ─── Axis 7: Enriched-vs-non-enriched reporting (declared) ────────────────
  {
    const passed = input.reports_enriched_vs_non_enriched === true;
    axes.push({
      axis: 7,
      name: "enriched_split_reporting",
      passed,
      blocking: false,
      threshold: { reports_enriched_vs_non_enriched: true },
      measured: {
        reports_enriched_vs_non_enriched: input.reports_enriched_vs_non_enriched,
        enriched_n: input.enriched.n_records,
        non_enriched_n: input.non_enriched.n_records,
      },
      note: passed
        ? `Release artifact declares it reports both enriched (n=${input.enriched.n_records}) and non-enriched (n=${input.non_enriched.n_records}) numbers across all 4 conditions`
        : `Release artifact does NOT declare the enriched-vs-non-enriched split — required for transparency about the dataset's prose-leakage asymmetry`,
    });
  }

  const failing = axes.filter(a => !a.passed).map(a => a.axis);
  const blockingFailures = axes.filter(a => !a.passed && a.blocking).map(a => a.axis);

  // Aggregate composition: blocking axes must all pass AND axis 7 reporting must be declared.
  // (Axis 7 is "reporting required, never advisory" — operator framing.)
  const passed = blockingFailures.length === 0 && axes[6].passed;

  const summary = passed
    ? `RC gate PASS (all 6 blocking axes cleared; reporting declared)`
    : `RC gate FAIL — blocking failures: [${blockingFailures.join(", ")}]${
        !axes[6].passed ? " plus reporting axis 7" : ""
      }`;

  return {
    passed,
    failing_axes: failing,
    blocking_failures: blockingFailures,
    axes,
    thresholds_used: thresholds,
    summary,
  };
}
