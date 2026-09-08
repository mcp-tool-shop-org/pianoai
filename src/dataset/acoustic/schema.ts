// ─── jam-actions-acoustic-v0 Record Schema ───────────────────────────────────
//
// A NEW corpus. It is not jam-actions-v0. That corpus has a DOI, and
// enrichment.ts locks schema_version to /^jam-actions-v0\/\d+\.\d+\.\d+$/.
// A new corpus using that string would be indistinguishable from the
// published set. Standing rule: a new corpus gets a new schema id, always.
//
// Envelope matches jam-actions-v0 where the fields are honest (id, provenance
// of the SCORE, scope, target_trace, eval_metadata). Observation is replaced:
// there is no REMI, no ABC, no piano-roll SVG. Those fields are required on
// jam-actions-v0 and {todo:...} is rejected by schema-placeholder.test.ts, so
// faking them would not even validate.
//
// source_type describes the SCORE (transcribed-by-author for library MIDI).
// acoustic.render describes the AUDIO (engine, seed, recipe, wav_sha256).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import {
  ProvenanceSchema,
  ScopeSchema,
  MidiSidecarSchema,
  AnnotationTargetSchema,
  TargetTraceSchema,
  EvalMetadataSchema,
} from "../schema.js";

export const ACOUSTIC_SCHEMA_VERSION = "jam-actions-acoustic-v0/1.0.0";

export const PERTURBATION_KINDS = [
  "clean",
  "sharp_60",
  "sharp_30",
  "late_80",
  "late_25",
  "dropped",
  "extra",
  "vibrato",
  "silence",
] as const;

export type PerturbationKind = (typeof PERTURBATION_KINDS)[number];

export const GOLD_VERDICTS = [
  "match",
  "pitch_fail",
  "pitch_warn",
  "timing_fail",
  "timing_pass",
  "missed",
  "extra",
  "in_tune",
  "nothing_to_grade",
] as const;

export type GoldVerdict = (typeof GOLD_VERDICTS)[number];

/**
 * Thresholds the gold answer depends on. Both the 40 ms gate and the 0.15
 * onset delta have already changed once on this arc; a record that omits
 * them cannot be reinterpreted after the next change.
 */
export const AcousticThresholdsSchema = z.object({
  timing_ms: z.number().positive(),
  pitch_fail_cents: z.number().positive(),
  pitch_warn_cents: z.number().positive(),
  onset_delta: z.number().positive(),
  min_duration_sec: z.number().nonnegative(),
});

export type AcousticThresholds = z.infer<typeof AcousticThresholdsSchema>;

export const DEFAULT_ACOUSTIC_THRESHOLDS: AcousticThresholds = {
  timing_ms: 40,
  pitch_fail_cents: 50,
  pitch_warn_cents: 25,
  onset_delta: 0.15,
  min_duration_sec: 0.05,
};

export const PhraseNoteSchema = z.object({
  midi: z.number().int().min(0).max(127),
  time: z.number().min(0),
  duration: z.number().positive(),
  name: z.string().min(1),
});

export type PhraseNote = z.infer<typeof PhraseNoteSchema>;

/** Everything needed to re-render the take. No expected outputs stored here. */
export const AcousticRecipeSchema = z.object({
  engine: z.literal("fixtures-sine-v1"),
  seed: z.number().int(),
  song_id: z.string().min(1),
  phrase_window: z.string().min(1),
  notes: z.array(PhraseNoteSchema).min(1),
  kind: z.enum(PERTURBATION_KINDS),
  target_index: z.number().int().min(0),
  sample_rate: z.number().positive(),
  pre_roll_sec: z.number().nonnegative(),
  gap_sec: z.number().nonnegative(),
  click_amplitude: z.number().min(0),
});

export type AcousticRecipe = z.infer<typeof AcousticRecipeSchema>;

export const AcousticRenderSchema = z.object({
  engine: z.literal("fixtures-sine-v1"),
  seed: z.number().int(),
  recipe: AcousticRecipeSchema,
  wav_sha256: z.string().regex(/^[0-9a-f]{64}$/, "must be lowercase hex sha256"),
  sample_rate: z.number().positive(),
});

export type AcousticRender = z.infer<typeof AcousticRenderSchema>;

export const AcousticPerturbationSchema = z.object({
  kind: z.enum(PERTURBATION_KINDS),
  target_index: z.number().int().min(0),
});

export type AcousticPerturbation = z.infer<typeof AcousticPerturbationSchema>;

export const AcousticGoldSchema = z.object({
  verdict: z.enum(GOLD_VERDICTS),
  thresholds: AcousticThresholdsSchema,
  target_index: z.number().int().min(0),
  expected_cents: z.number().nullable(),
  expected_timing_ms: z.number().nullable(),
});

export type AcousticGold = z.infer<typeof AcousticGoldSchema>;

export const AcousticObservationSchema = z.object({
  /** The unperturbed phrase — the SCORE we grade against. */
  midi_sidecar: MidiSidecarSchema,
  render: AcousticRenderSchema,
  perturbation: AcousticPerturbationSchema,
  thresholds: AcousticThresholdsSchema,
  gold: AcousticGoldSchema,
});

export type AcousticObservation = z.infer<typeof AcousticObservationSchema>;

export const AcousticRecordSchema = z.object({
  id: z.string().min(1),
  schema_version: z.literal(ACOUSTIC_SCHEMA_VERSION),
  provenance: ProvenanceSchema,
  scope: ScopeSchema,
  observation: AcousticObservationSchema,
  annotation_target: AnnotationTargetSchema,
  target_trace: TargetTraceSchema,
  eval_metadata: EvalMetadataSchema,
});

export type AcousticRecord = z.infer<typeof AcousticRecordSchema>;

export function parseAcousticRecord(input: unknown): AcousticRecord {
  return AcousticRecordSchema.parse(input);
}
