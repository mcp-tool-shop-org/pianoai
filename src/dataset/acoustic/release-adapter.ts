// ─── Acoustic corpus → jam-actions release gate ──────────────────────────────
//
// Thin adapter. Does NOT rewrite evaluateReleaseGate. Maps an acoustic
// assessment onto ReleaseGateInput and DECLARES that there is no enrichment
// split. Skipping axis 7 fails it; declaring the non-transfer satisfies it.
//
// random_midi_mean is filled from random_audio_mean — the foil for this
// corpus is a wrong take / shuffled perturbation, not shuffled MIDI. The
// gate's field name is unchanged so the existing function can score it.
// ─────────────────────────────────────────────────────────────────────────────

import {
  evaluateReleaseGate,
  type ReleaseGateInput,
  type ReleaseGateThresholds,
  type SubsetAssessment,
  type StratumAssessment,
  type PerRecordAssessment,
  type GateResult,
} from "../release/release-gate.js";

/**
 * The sentence the assessment artifact must carry. Axis 7 fails if this
 * declaration is omitted; it passes when the adapter sets
 * `reports_enriched_vs_non_enriched: true` with empty enriched numbers.
 */
export const NO_ENRICHMENT_SPLIT_DECLARATION =
  "jam-actions-acoustic-v0 has no enrichment split. " +
  "The MIDI-corpus enriched vs non-enriched axis does not transfer. " +
  "Enriched n=0; the whole corpus is reported as non-enriched. " +
  "The four conditions are tool_inspected, text_only, random_audio " +
  "(mapped onto the gate's random_midi field), and (implicit) full.";

const EMPTY_SUBSET: SubsetAssessment = {
  n_records: 0,
  tool_inspected_mean: 0,
  text_only_mean: 0,
  margin_tool_minus_text_mean: 0,
  records_clearing_margin: 0,
  tool_call_rate: 0,
};

export interface AcousticAssessment {
  n_records: number;
  tool_inspected_mean: number;
  text_only_mean: number;
  /** Foil: model given a wrong take. Written into random_midi_mean. */
  random_audio_mean: number;
  margin_tool_minus_text_mean: number;
  records_clearing_margin: number;
  tool_call_rate: number;
  correct_after_tool_rate: number;
  misinterp_rate: number;
  axis5_tool_called_count?: number;
  per_stratum: StratumAssessment[];
  per_record?: PerRecordAssessment[];
  /**
   * Must be true. The adapter will not silently skip axis 7; it will refuse
   * to build an input that omits the declaration.
   */
  declare_no_enrichment_split: boolean;
}

function asNonEnriched(a: AcousticAssessment): SubsetAssessment {
  return {
    n_records: a.n_records,
    tool_inspected_mean: a.tool_inspected_mean,
    text_only_mean: a.text_only_mean,
    margin_tool_minus_text_mean: a.margin_tool_minus_text_mean,
    records_clearing_margin: a.records_clearing_margin,
    tool_call_rate: a.tool_call_rate,
  };
}

/**
 * Map an acoustic assessment onto the jam-actions gate input.
 *
 * Throws if `declare_no_enrichment_split` is not true — that is the axis-7
 * declaration. A caller who wants to see axis 7 fail can pass the raw
 * `evaluateReleaseGate` an input with `reports_enriched_vs_non_enriched: false`.
 */
export function toReleaseGateInput(assessment: AcousticAssessment): ReleaseGateInput {
  if (assessment.declare_no_enrichment_split !== true) {
    throw new Error(
      "Acoustic assessments must declare that there is no enrichment split. " +
      "Set declare_no_enrichment_split: true. Skipping axis 7 fails the gate; " +
      "declaring the non-transfer satisfies it.",
    );
  }

  const per_record = assessment.per_record?.map((r) => ({
    ...r,
    // Gate field is random_midi_mean; acoustic foil is random_audio.
    random_midi_mean: r.random_midi_mean,
  }));

  return {
    n_records: assessment.n_records,
    tool_inspected_mean: assessment.tool_inspected_mean,
    text_only_mean: assessment.text_only_mean,
    margin_tool_minus_text_mean: assessment.margin_tool_minus_text_mean,
    records_clearing_margin: assessment.records_clearing_margin,
    tool_call_rate: assessment.tool_call_rate,
    correct_after_tool_rate: assessment.correct_after_tool_rate,
    misinterp_rate: assessment.misinterp_rate,
    axis5_tool_called_count: assessment.axis5_tool_called_count,
    per_stratum: assessment.per_stratum,
    per_record,
    enriched: EMPTY_SUBSET,
    non_enriched: asNonEnriched(assessment),
    reports_enriched_vs_non_enriched: true,
  };
}

export function evaluateAcousticReleaseGate(
  assessment: AcousticAssessment,
  thresholds?: ReleaseGateThresholds,
): GateResult & { declaration: string } {
  const result = evaluateReleaseGate(toReleaseGateInput(assessment), thresholds);
  return { ...result, declaration: NO_ENRICHMENT_SPLIT_DECLARATION };
}
