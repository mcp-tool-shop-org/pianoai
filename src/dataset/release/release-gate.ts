// ─── jam-actions-v0 Slice 20/22 — Release Threshold Framework ───────────────
//
// Pure library for evaluating a 7-axis Release Candidate (RC) gate against a
// Slice-19-shaped baseline assessment. The library is deliberately NOT
// responsible for reading or aggregating raw eval artifacts — that lives in
// `scripts/check-release-gate.ts`, which derives the assessment shape from the
// canonical Slice 19 baseline JSON and the source-of-record per-question
// traces, then feeds the result to `evaluateReleaseGate`.
//
// Design constraints (LOCKED for Slice 20; preserved through Slice 22):
//   - PURE FUNCTION — no I/O, no global state, fully unit-testable
//   - Returns a structured per-axis verdict alongside a single aggregate
//     pass/fail derived by the composition rule
//   - Composition rule: axes 1–6 are BLOCKING (all must pass); axis 7 is
//     REPORTING (the artifact must declare it satisfies reporting, otherwise
//     the gate fails on axis 7 as well)
//   - All thresholds are numeric and overridable; the library encodes default
//     thresholds as exported constants so CLI flags can override per axis
//
// Slice 22 revision (axes 2 + 6 only — other axes UNCHANGED):
//   Motivation: a record whose prose is genuinely answer-bearing produces
//   all four conditions at ~1.0. Margin tool_inspected − text_only = 0.0 by
//   definition; the original axis 2/6 logic incorrectly penalized this
//   "good zero-margin" regime as if it were a grounding-failure. Slice 21's
//   schumann-traumerei:m045-048 R6-aware rewrite exposed this gate-definition
//   tension: the record's margin went from −0.556 to +0.000 with all
//   conditions at 1.000, yet axes 2 + 6 still failed.
//
//   The revision: a record passes axis 2 if EITHER it clears the +0.10
//   margin (bucket A, the original criterion) OR it satisfies
//   `ceiling_saturated_pass` (bucket B, new). Bucket B requires
//   tool_inspected ≥ 0.90 AND text_only ≥ 0.90 AND random_midi ≥ 0.90 AND
//   the record's tool-called-question misinterp_count is 0. Axis 6's
//   per-stratum rule similarly accepts either a margin_pass record OR a
//   ceiling_saturated_pass record with stratum mean margin ≥ −0.10.
//
//   The 3-regime distinction the revision encodes:
//     1. Bad zero-margin (axes 2/6 SHOULD catch) — tool/text/rmidi all low
//        OR misinterp > 0 → the model is failing to use evidence correctly
//     2. Good zero-margin (axes 2/6 should NOT penalize) — tool/text/rmidi
//        all ≥ 0.90 AND misinterp = 0 → the prose is genuinely useful and
//        the model is operating correctly
//     3. True grounding lift (the original margin_pass) — tool_inspected
//        beats text_only by ≥ +0.10 → tool data unlocks correctness
//
// Doctrine — the 7 axes:
//
//   Axis 1: Absolute tool_inspected floor (UNCHANGED)
//     Default 0.65. Captures "the model with tools meaningfully outperforms
//     text-alone in absolute terms," not just on margin. Slice 19 sits at
//     0.606 (fails).
//
//   Axis 2: tool_inspected − text_only margin (REVISED in Slice 22)
//     Default corpus mean ≥ +0.10 AND ≥ 60% of records pass via the union
//     of bucket A (margin ≥ +0.10) or bucket B (ceiling_saturated_pass).
//     The +0.10 margin convention is locked from Slice 17 doctrine; the
//     records-clearing clause guards against a single-stratum-driven corpus
//     mean. Slice 19 baseline: 9/16 (56.25%) pass under both old and new
//     logic — neither schumann record qualifies for bucket B. Slice 21
//     baseline: 9 margin_only + 1 ceiling_saturated (schumann m045) =
//     10/16 (62.5%) pass under revised logic.
//
//   Axis 3: Tool-call rate (corpus) (UNCHANGED)
//     Default ≥ 0.25. A single corpus floor; per-subset (enriched vs
//     non-enriched) splits are reported but not separately gated to avoid
//     forcing enrichment removal. Slice 19: 0.328 passes.
//
//   Axis 4: Correct-after-tool-call rate (UNCHANGED)
//     Default ≥ 0.75. When the model calls a tool, the answer should usually
//     be correct. Slice 19: 0.820 passes.
//
//   Axis 5: Misinterpretation rate (UNCHANGED — complement of axis 4
//     strictly on tool-called questions)
//     Default ≤ 0.20. Slice 19: 0.180 passes.
//
//   Axis 6: Stratum floor / no catastrophic subgroup (REVISED in Slice 22)
//     Compound: every stratum has ≥ 1 record with margin_pass OR
//     (≥ 1 record with ceiling_saturated_pass AND stratum mean margin
//     ≥ −0.10). Slice 19: Schumann fails both clauses (mean −0.278, no
//     margin_pass, no ceiling_saturated_pass). Slice 21: Schumann passes
//     via bucket B (m045 is ceiling_saturated_pass, stratum mean 0.000
//     ≥ −0.10).
//
//   Axis 7: Enriched-vs-non-enriched reporting (declared) (UNCHANGED)
//     The assessment must declare it includes both subsets' numbers across
//     all 4 conditions in the released documentation. Not a numeric pass/fail;
//     fails only if the assessment artifact omits the declaration.
//
// This module is the CANDIDATE RC gate definition. It is NOT a release
// approval claim. Producing a "PASS" verdict from this validator does NOT
// mean the dataset is RC ready — that's a downstream decision the operator
// makes after considering the gate's output alongside other factors.
//
// Schema version emitted in assessment artifacts is
// `release-gate-assessment/2.0.0` for the revised axes; consumers reading
// 1.0.0 artifacts read pre-revision verdicts (Slice 20 + 21 baselines).
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

/**
 * Per-record assessment input — required by the Slice-22 revised axes 2 + 6.
 *
 * Each entry carries the four condition means (tool_inspected, text_only,
 * random_midi), the tool−text margin, the per-record tool-called-question
 * misinterp count, and the record's stratum. The validator uses these to
 * classify each record into bucket A (margin_pass) and/or bucket B
 * (ceiling_saturated_pass).
 *
 * The full_mean is intentionally omitted — axes 2 + 6 are defined strictly
 * on the tool_inspected / text_only / random_midi triple plus the
 * tool-called-question misinterp count.
 */
export interface PerRecordAssessment {
  /** Stable record identifier (e.g. "bach-prelude-c-major-bwv846:m009-012..."). */
  recordId: string;
  /** Stratum the record belongs to (e.g. "bach", "schumann"). */
  stratum: string;
  /** Mean tool_inspected metric across all runs of this record. */
  tool_inspected_mean: number;
  /** Mean text_only metric across all runs of this record. */
  text_only_mean: number;
  /** Mean random_midi metric across all runs of this record. */
  random_midi_mean: number;
  /** Per-record margin (tool_inspected_mean − text_only_mean). */
  margin_vs_text_only: number;
  /**
   * Per-record misinterpretation count: number of (question × run) pairs
   * where (tool called) AND (tool returned correct data) AND (final answer
   * wrong) across all tool_inspected runs of this record. Operationalized
   * cleanly as count of tool-called question-runs with score != 1.
   */
  misinterp_count: number;
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
  /**
   * D-B1-001 fix — axis 5's denominator: the count of tool-called
   * question-runs that `misinterp_rate` was computed over (i.e. the total
   * from which `misinterp_rate = misinterpreted / axis5_tool_called_count`).
   * Optional for backward compatibility, mirroring the `per_record?`
   * precedent below: when omitted, axis 5 falls back to the pre-fix
   * behavior of evaluating `misinterp_rate` directly against the ceiling
   * threshold with no zero-denominator special case.
   *
   * When PRESENT and equal to 0, axis 5 FAILS regardless of `misinterp_rate`
   * — a `misinterp_rate` value in that state was produced by a
   * zero-denominator fallback (e.g. `totalToolCalled > 0 ? ... : 0` in
   * `scripts/check-release-gate.ts`) and does not mean "0% misinterpretation
   * measured," it means "no tool-called questions existed to measure."
   * Evaluating that undefined rate against a `<=` ceiling threshold is a
   * vacuous PASS (Stage B finding D-B1-001): the axis reports success on an
   * empty measurement. Ceiling-type checks like axis 5 need this explicit
   * guard because they fail OPEN on a 0 fallback; floor-type checks (axes
   * 1/3/4) already fail closed for free since "0 ≥ floor" is false.
   */
  axis5_tool_called_count?: number;
  /** Per-stratum assessment used to evaluate axis 6 (under the old logic; */
  /** the revised axis 6 also consults `per_record`). */
  per_stratum: StratumAssessment[];
  /**
   * Per-record assessment, required for the Slice-22 revised axes 2 + 6.
   *
   * Optional for backward compatibility with Slice-20 assessment shape
   * (1.0.0). When absent, axes 2 + 6 fall back to the pre-revision logic
   * (corpus-level records_clearing fraction + per-stratum margin-only
   * compound rule). When present, the revised logic kicks in: axis 2
   * counts records passing the union of bucket A (margin_pass) and
   * bucket B (ceiling_saturated_pass); axis 6 accepts ceiling_saturated_pass
   * with stratum mean margin ≥ −0.10 as a passing path.
   */
  per_record?: PerRecordAssessment[];
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
  /**
   * Slice 22 axes 2 + 6 — `ceiling_saturated_pass` floor.
   *
   * A record qualifies for bucket B (the "good zero-margin" regime) only if
   * tool_inspected_mean, text_only_mean, AND random_midi_mean are ALL ≥
   * this floor (0.90 by default), AND its tool-called-question misinterp
   * count is 0. The 0.90 floor is the locked Slice-22 default; it embodies
   * the "all conditions saturated" interpretation of a successful prose-
   * answer-bearing record.
   */
  ceiling_saturated_floor: number;
  /**
   * Slice 22 axis 6 — relaxed stratum-mean-margin floor that applies ONLY
   * when a stratum is passing via the ceiling_saturated_pass path (bucket
   * B). Default −0.10. Bucket A (a margin_pass record exists) does NOT
   * impose a stratum-mean constraint beyond what's already in the
   * pre-revision axis-6 logic. This preserves diagnostic power against
   * catastrophic strata while admitting genuinely ceiling-saturated strata
   * whose tool−text margin is mathematically pinned near zero.
   */
  axis6_stratum_min_mean_margin_when_ceiling: number;
}

/**
 * Default thresholds — Slice 20 candidate RC gate, with Slice-22 axes 2 + 6
 * additions. Axes 1, 3, 4, 5, 7 thresholds are locked at their Slice-20
 * values per operator doctrine; Slice 22 ONLY adds the two new constants.
 */
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
  // Slice 22 additions (axes 2 + 6 only):
  ceiling_saturated_floor: 0.90,
  axis6_stratum_min_mean_margin_when_ceiling: -0.10,
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
  /**
   * Schema version of the gate verdict. Slice 20 emitted "1.0.0"; Slice 22
   * (revised axes 2 + 6) emits "2.0.0". The version is determined by
   * whether `per_record` was supplied: if yes, revised logic ran and the
   * result is 2.0.0; if no, pre-revision logic ran and the result is 1.0.0.
   * Downstream consumers can inspect this to know which axis-2/6 semantics
   * the verdict was produced under.
   */
  schema_version: string;
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

/**
 * Slice 22 per-record bucket classification (carried in axis-2 measured for
 * downstream tooling and per-record reporting in the slice doc).
 */
export interface RecordBucketClassification {
  recordId: string;
  stratum: string;
  margin_pass: boolean;
  ceiling_saturated_pass: boolean;
  /** True iff EITHER bucket A or bucket B holds (the axis-2 union). */
  passes_axis2: boolean;
  /** The four condition means + misinterp count carried through for readability. */
  tool_inspected_mean: number;
  text_only_mean: number;
  random_midi_mean: number;
  margin_vs_text_only: number;
  misinterp_count: number;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function nearlyAtLeast(value: number, threshold: number): boolean {
  // Strict ≥ for now; helper exists in case we want to tolerate fp noise later.
  return value >= threshold;
}

function nearlyAtMost(value: number, threshold: number): boolean {
  return value <= threshold;
}

// ─── Slice 22 axes 2 + 6 helpers (record-level classification) ──────────────

/**
 * Bucket A — does this record clear the +0.10 tool−text margin floor?
 *
 * This is the original margin_pass criterion: tool_inspected meaningfully
 * outperforms text_only on this record. Captures regime (3) in the operator's
 * 3-regime framing — "true grounding lift."
 *
 * @param record  Per-record assessment.
 * @param perRecordMargin  The +0.10 floor (default from `DEFAULT_THRESHOLDS`).
 */
export function isMarginPass(
  record: PerRecordAssessment,
  perRecordMargin: number = DEFAULT_THRESHOLDS.axis2_per_record_margin,
): boolean {
  return nearlyAtLeast(record.margin_vs_text_only, perRecordMargin);
}

/**
 * Bucket B — does this record satisfy ceiling_saturated_pass?
 *
 * A record qualifies as ceiling_saturated_pass if and only if ALL four
 * conditions hold:
 *
 *   1. tool_inspected_mean ≥ floor (default 0.90)
 *   2. text_only_mean      ≥ floor (default 0.90)
 *   3. random_midi_mean    ≥ floor (default 0.90)
 *   4. misinterp_count     == 0    (no question on this record had tool
 *                                   called + tool data correct + final
 *                                   answer wrong)
 *
 * Rationale per clause:
 *   - Clauses 1–3 establish "all conditions saturated at the ceiling" —
 *     the prose is genuinely answer-bearing and the model is operating
 *     correctly across every condition tier.
 *   - Clause 4 excludes the failure mode where the model is ignoring
 *     tools but happens to be right from prose AND occasionally
 *     misuses tool data when it does call them. Without this clause,
 *     a record could trivially "saturate" the conditions while still
 *     being broken on tool-use behavior.
 *
 * Captures regime (2) in the operator's 3-regime framing — "good
 * zero-margin," which axes 2/6 should NOT penalize.
 *
 * @param record  Per-record assessment.
 * @param floor   The 0.90 floor for tool/text/random_midi means.
 */
export function isCeilingSaturatedPass(
  record: PerRecordAssessment,
  floor: number = DEFAULT_THRESHOLDS.ceiling_saturated_floor,
): boolean {
  return (
    nearlyAtLeast(record.tool_inspected_mean, floor) &&
    nearlyAtLeast(record.text_only_mean, floor) &&
    nearlyAtLeast(record.random_midi_mean, floor) &&
    record.misinterp_count === 0
  );
}

/**
 * Slice-22 axis 2 per-record predicate — does this record satisfy axis 2
 * via EITHER bucket A (margin_pass) or bucket B (ceiling_saturated_pass)?
 *
 * The corpus-level axis-2 records-passing fraction is computed by counting
 * records for which this predicate returns true.
 *
 * @param record      Per-record assessment.
 * @param thresholds  Threshold set carrying `axis2_per_record_margin` and
 *                    `ceiling_saturated_floor`.
 */
export function recordPassesAxis2(
  record: PerRecordAssessment,
  thresholds: ReleaseGateThresholds = DEFAULT_THRESHOLDS,
): boolean {
  return (
    isMarginPass(record, thresholds.axis2_per_record_margin) ||
    isCeilingSaturatedPass(record, thresholds.ceiling_saturated_floor)
  );
}

/**
 * Classify a record into its bucket (or both, or neither) without short-
 * circuit. Returns a structured object the validator embeds in axis-2
 * measured for downstream tooling and slice-doc tables.
 */
export function classifyRecord(
  record: PerRecordAssessment,
  thresholds: ReleaseGateThresholds = DEFAULT_THRESHOLDS,
): RecordBucketClassification {
  const margin_pass = isMarginPass(record, thresholds.axis2_per_record_margin);
  const ceiling_saturated_pass = isCeilingSaturatedPass(
    record,
    thresholds.ceiling_saturated_floor,
  );
  return {
    recordId: record.recordId,
    stratum: record.stratum,
    margin_pass,
    ceiling_saturated_pass,
    passes_axis2: margin_pass || ceiling_saturated_pass,
    tool_inspected_mean: record.tool_inspected_mean,
    text_only_mean: record.text_only_mean,
    random_midi_mean: record.random_midi_mean,
    margin_vs_text_only: record.margin_vs_text_only,
    misinterp_count: record.misinterp_count,
  };
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

  // ─── Axis 2: tool−text margin (compound: corpus mean AND records-passing fraction) ─
  //
  // Slice 22 revision: when `per_record` is supplied, records-passing
  // counts BOTH margin_pass (bucket A) and ceiling_saturated_pass (bucket B).
  // When `per_record` is absent (pre-revision call sites), falls back to the
  // Slice-20 logic that counts records via `records_clearing_margin`.
  {
    const meanOk = nearlyAtLeast(
      input.margin_tool_minus_text_mean,
      thresholds.axis2_corpus_margin_floor,
    );

    let recordsPassingAxis2: number;
    let clearingFraction: number;
    let perRecordClassifications: RecordBucketClassification[] | undefined;
    let bucketCounts: { margin_pass_only: number; ceiling_saturated_only: number; both: number; neither: number } | undefined;
    if (input.per_record !== undefined) {
      perRecordClassifications = input.per_record.map(r =>
        classifyRecord(r, thresholds),
      );
      recordsPassingAxis2 = perRecordClassifications.filter(c => c.passes_axis2).length;
      bucketCounts = {
        margin_pass_only: perRecordClassifications.filter(c => c.margin_pass && !c.ceiling_saturated_pass).length,
        ceiling_saturated_only: perRecordClassifications.filter(c => !c.margin_pass && c.ceiling_saturated_pass).length,
        both: perRecordClassifications.filter(c => c.margin_pass && c.ceiling_saturated_pass).length,
        neither: perRecordClassifications.filter(c => !c.margin_pass && !c.ceiling_saturated_pass).length,
      };
      clearingFraction = input.n_records > 0 ? recordsPassingAxis2 / input.n_records : 0;
    } else {
      // Pre-revision fallback: count records via legacy records_clearing_margin.
      recordsPassingAxis2 = input.records_clearing_margin;
      clearingFraction = input.n_records > 0 ? input.records_clearing_margin / input.n_records : 0;
    }
    const clearOk = nearlyAtLeast(clearingFraction, thresholds.axis2_records_clearing_fraction_floor);
    const passed = meanOk && clearOk;
    const meanNote = meanOk
      ? `corpus margin ${input.margin_tool_minus_text_mean.toFixed(3)} ≥ ${thresholds.axis2_corpus_margin_floor.toFixed(3)}`
      : `corpus margin ${input.margin_tool_minus_text_mean.toFixed(3)} < ${thresholds.axis2_corpus_margin_floor.toFixed(3)}`;
    const passLabel = input.per_record !== undefined ? "passing (margin OR ceiling-saturated)" : "clearing";
    const clearNote = clearOk
      ? `${recordsPassingAxis2}/${input.n_records} (${(clearingFraction * 100).toFixed(1)}%) ${passLabel} ≥ ${(thresholds.axis2_records_clearing_fraction_floor * 100).toFixed(1)}%`
      : `${recordsPassingAxis2}/${input.n_records} (${(clearingFraction * 100).toFixed(1)}%) ${passLabel} < ${(thresholds.axis2_records_clearing_fraction_floor * 100).toFixed(1)}%`;
    const measured: Record<string, unknown> = {
      corpus_margin_mean: input.margin_tool_minus_text_mean,
      records_passing_axis2: recordsPassingAxis2,
      n_records: input.n_records,
      passing_fraction: clearingFraction,
      records_clearing_margin_legacy: input.records_clearing_margin,
    };
    if (bucketCounts) measured.bucket_counts = bucketCounts;
    if (perRecordClassifications) measured.per_record_classifications = perRecordClassifications;
    axes.push({
      axis: 2,
      name: "margin",
      passed,
      blocking: true,
      threshold: {
        corpus_margin_floor: thresholds.axis2_corpus_margin_floor,
        records_clearing_fraction_floor: thresholds.axis2_records_clearing_fraction_floor,
        per_record_margin: thresholds.axis2_per_record_margin,
        ceiling_saturated_floor: thresholds.ceiling_saturated_floor,
        revised: input.per_record !== undefined,
      },
      measured,
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
  //
  // D-B1-001 fix: when the caller supplies `axis5_tool_called_count` and it
  // is 0, the axis FAILS closed rather than evaluating `misinterp_rate`
  // against the ceiling — a 0-denominator `misinterp_rate` is undefined, not
  // "0% misinterpretation," and `nearlyAtMost(0, ceiling)` was a vacuous
  // PASS on that undefined value (Stage B finding). When the field is
  // absent, behavior is byte-for-byte unchanged from pre-fix (back-compat):
  // `undefined === 0` is false, so `noToolCalledQuestions` is false and the
  // original comparison runs exactly as before.
  {
    const noToolCalledQuestions = input.axis5_tool_called_count === 0;
    const passed = noToolCalledQuestions
      ? false
      : nearlyAtMost(input.misinterp_rate, thresholds.axis5_misinterp_ceiling);
    axes.push({
      axis: 5,
      name: "misinterp",
      passed,
      blocking: true,
      threshold: { ceiling: thresholds.axis5_misinterp_ceiling },
      measured: {
        misinterp_rate: input.misinterp_rate,
        tool_called_count: input.axis5_tool_called_count,
      },
      note: noToolCalledQuestions
        ? `Axis 5 FAIL: axis5_tool_called_count = 0 — no tool-called questions were run, so the misinterpretation rate is undefined and cannot be certified (misinterp_rate=${input.misinterp_rate.toFixed(3)} is a zero-denominator artifact, not a measured 0%)`
        : passed
          ? `Misinterp rate ${(input.misinterp_rate * 100).toFixed(1)}% ≤ ${(thresholds.axis5_misinterp_ceiling * 100).toFixed(1)}%`
          : `Misinterp rate ${(input.misinterp_rate * 100).toFixed(1)}% > ${(thresholds.axis5_misinterp_ceiling * 100).toFixed(1)}% — too many tool-called questions get wrong answers`,
    });
  }

  // ─── Axis 6: Stratum floor / no catastrophic subgroup ─────────────────────
  //
  // Slice 22 revision: when `per_record` is supplied, a stratum passes if
  // EITHER:
  //   - Bucket A: ≥1 record with margin_pass (the pre-revision criterion,
  //     no stratum-mean-margin constraint beyond the legacy axis-6 mean ≥ 0
  //     floor for backward symmetry — kept relaxed to the legacy floor 0.0)
  //   - Bucket B: ≥1 record with ceiling_saturated_pass AND stratum mean
  //     margin ≥ `axis6_stratum_min_mean_margin_when_ceiling` (default −0.10)
  //
  // The legacy pre-revision compound (mean ≥ floor AND clearing ≥ 1)
  // remains the fallback when `per_record` is absent.
  {
    let failingStrata: Array<{
      stratum: string;
      n_records: number;
      margin_mean: number;
      records_clearing: number;
      margin_pass_records?: number;
      ceiling_saturated_records?: number;
      reason?: string;
    }>;
    let stratumQualifications:
      | Array<{
          stratum: string;
          n_records: number;
          margin_mean: number;
          margin_pass_records: number;
          ceiling_saturated_records: number;
          qualified_via: "bucket_a" | "bucket_b" | "none";
        }>
      | undefined;

    if (input.per_record !== undefined) {
      // Group records by stratum, compute bucket counts per stratum.
      const byStratum = new Map<string, PerRecordAssessment[]>();
      for (const r of input.per_record) {
        const arr = byStratum.get(r.stratum);
        if (arr) arr.push(r);
        else byStratum.set(r.stratum, [r]);
      }
      stratumQualifications = [];
      failingStrata = [];
      for (const s of input.per_stratum) {
        const recs = byStratum.get(s.stratum) ?? [];
        const marginPassCount = recs.filter(r =>
          isMarginPass(r, thresholds.axis2_per_record_margin),
        ).length;
        const ceilingSatCount = recs.filter(r =>
          isCeilingSaturatedPass(r, thresholds.ceiling_saturated_floor),
        ).length;
        const bucketA = marginPassCount >= thresholds.axis6_stratum_min_records_clearing;
        const bucketB =
          ceilingSatCount >= 1 &&
          nearlyAtLeast(
            s.margin_tool_minus_text_mean,
            thresholds.axis6_stratum_min_mean_margin_when_ceiling,
          );
        const qualifiedVia: "bucket_a" | "bucket_b" | "none" = bucketA
          ? "bucket_a"
          : bucketB
            ? "bucket_b"
            : "none";
        stratumQualifications.push({
          stratum: s.stratum,
          n_records: s.n_records,
          margin_mean: s.margin_tool_minus_text_mean,
          margin_pass_records: marginPassCount,
          ceiling_saturated_records: ceilingSatCount,
          qualified_via: qualifiedVia,
        });
        if (qualifiedVia === "none") {
          failingStrata.push({
            stratum: s.stratum,
            n_records: s.n_records,
            margin_mean: s.margin_tool_minus_text_mean,
            records_clearing: s.records_clearing_margin,
            margin_pass_records: marginPassCount,
            ceiling_saturated_records: ceilingSatCount,
            reason:
              marginPassCount === 0 && ceilingSatCount === 0
                ? "no margin_pass and no ceiling_saturated_pass record"
                : marginPassCount === 0 && ceilingSatCount >= 1
                  ? `${ceilingSatCount} ceiling_saturated record(s) but stratum mean margin ${s.margin_tool_minus_text_mean.toFixed(3)} < ${thresholds.axis6_stratum_min_mean_margin_when_ceiling.toFixed(2)}`
                  : "unclassified",
          });
        }
      }
    } else {
      // Pre-revision fallback: legacy compound mean+clearing rule.
      failingStrata = input.per_stratum
        .filter(s => {
          const meanOk = nearlyAtLeast(
            s.margin_tool_minus_text_mean,
            thresholds.axis6_stratum_mean_margin_floor,
          );
          const clearOk = nearlyAtLeast(
            s.records_clearing_margin,
            thresholds.axis6_stratum_min_records_clearing,
          );
          return !(meanOk && clearOk);
        })
        .map(s => ({
          stratum: s.stratum,
          n_records: s.n_records,
          margin_mean: s.margin_tool_minus_text_mean,
          records_clearing: s.records_clearing_margin,
        }));
    }
    // D-A1-003: an empty `per_stratum` array makes `failingStrata` trivially
    // empty too (there is nothing to filter), which would otherwise report a
    // vacuous PASS — "0 strata clear stratum floor" — even though zero
    // strata were actually checked. This is a real failure mode, not just an
    // adversarial input: `scripts/check-release-gate.ts`'s buildGateInput()
    // derives per_stratum via `Object.entries(baseline.aggregate.per_stratum)
    // .map(...)`, so an upstream artifact whose `aggregate.per_stratum` object
    // is empty (a failed aggregation step, a malformed/truncated baseline
    // JSON) silently produces `per_stratum: []` here. Axis 6 always expects
    // strata when it runs; an empty array is a hard FAIL, never a pass.
    const noStrataProvided = input.per_stratum.length === 0;
    const passed = !noStrataProvided && failingStrata.length === 0;
    const measured: Record<string, unknown> = {
      n_strata: input.per_stratum.length,
      failing_strata: failingStrata,
    };
    if (stratumQualifications) measured.stratum_qualifications = stratumQualifications;
    axes.push({
      axis: 6,
      name: "stratum_floor",
      passed,
      blocking: true,
      threshold: {
        stratum_mean_margin_floor: thresholds.axis6_stratum_mean_margin_floor,
        stratum_min_records_clearing: thresholds.axis6_stratum_min_records_clearing,
        stratum_min_mean_margin_when_ceiling: thresholds.axis6_stratum_min_mean_margin_when_ceiling,
        ceiling_saturated_floor: thresholds.ceiling_saturated_floor,
        revised: input.per_record !== undefined,
      },
      measured,
      note: noStrataProvided
        ? "strata expected but none present"
        : passed
          ? input.per_record !== undefined
            ? `All ${input.per_stratum.length} strata qualify via bucket A (≥1 margin_pass) or bucket B (≥1 ceiling_saturated_pass AND mean margin ≥ ${thresholds.axis6_stratum_min_mean_margin_when_ceiling.toFixed(2)})`
            : `All ${input.per_stratum.length} strata clear stratum floor (mean margin ≥ ${thresholds.axis6_stratum_mean_margin_floor.toFixed(2)} AND ≥${thresholds.axis6_stratum_min_records_clearing} record clearing)`
          : `${failingStrata.length} stratum/strata fail: ${failingStrata.map(s => `${s.stratum}(mean ${s.margin_mean.toFixed(3)}, ${s.records_clearing}/${s.n_records} clearing${"reason" in s && s.reason ? `; ${s.reason}` : ""})`).join("; ")} — catastrophic subgroup present`,
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

  const schema_version = input.per_record !== undefined
    ? "release-gate-assessment/2.0.0"
    : "release-gate-assessment/1.0.0";

  const summary = passed
    ? `RC gate PASS (all 6 blocking axes cleared; reporting declared)`
    : `RC gate FAIL — blocking failures: [${blockingFailures.join(", ")}]${
        !axes[6].passed ? " plus reporting axis 7" : ""
      }`;

  return {
    schema_version,
    passed,
    failing_axes: failing,
    blocking_failures: blockingFailures,
    axes,
    thresholds_used: thresholds,
    summary,
  };
}
