// ─── jam-actions-v0 Dataset Record Schema ────────────────────────────────────
//
// TypeScript types + Zod runtime schemas for the v0 record shape.
// Field names match the JSON shape (snake_case), not TS style guides — they
// are wire/serialization names, not internal identifiers.
//
// Slice 1 scope: schema only. No bulk builders, no provenance gate module.
// Verdict enum includes `public_candidate` per synthesis Section 5 amendment.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const SOURCE_TYPES = [
  "user-recorded",
  "transcribed-by-author",
  "licensed",
  "scraped",
] as const;

export const PD_STATUSES = ["public_domain", "copyrighted", "unknown"] as const;

export const RECORD_VERDICTS = [
  "public",
  "public_candidate",
  "internal",
  "excluded",
] as const;

export const HANDS = ["right", "left"] as const;

// ─── Provenance ──────────────────────────────────────────────────────────────

export const ProvenanceSchema = z.object({
  source_url: z.string().min(1),
  source_collected_at: z.string().min(1),
  source_type: z.enum(SOURCE_TYPES),
  composition_title: z.string().min(1),
  composer: z.string().min(1),
  composition_year: z.number().int(),
  composition_pd_status_us: z.enum(PD_STATUSES),
  composition_pd_status_eu: z.enum(PD_STATUSES),
  arrangement_creator: z.string().nullable(),
  arrangement_license: z.string().nullable(),
  arrangement_license_version: z.string().nullable(),
  arrangement_evidence_url: z.string().nullable(),
  record_verdict: z.enum(RECORD_VERDICTS),
  verdict_reason: z.string().min(1),
  verifier: z.string().min(1),
  verified_at: z.string().min(1),
  training_use_permitted: z.boolean(),
});

export type Provenance = z.infer<typeof ProvenanceSchema>;

// ─── Scope ───────────────────────────────────────────────────────────────────

export const ScopeSchema = z.object({
  song_id: z.string().min(1),
  phrase_window: z.string().min(1),
  instrument: z.string().min(1),
  key: z.string().min(1),
  tempo_bpm: z.number().positive(),
  time_signature: z.string().regex(/^\d+\/\d+$/),
});

export type Scope = z.infer<typeof ScopeSchema>;

// ─── Observation ─────────────────────────────────────────────────────────────

export const TimedEventSchema = z.object({
  t_seconds: z.number().min(0),
  t_ticks: z.number().int().min(0),
  dur_seconds: z.number().positive(),
  dur_ticks: z.number().int().positive(),
  note: z.number().int().min(0).max(127),
  name: z.string().min(1),
  velocity: z.number().int().min(0).max(127),
  channel: z.number().int().min(0).max(15),
  hand: z.enum(HANDS),
  measure: z.number().int().min(1),
  beat: z.number().min(0),
});

export type TimedEvent = z.infer<typeof TimedEventSchema>;

export const MidiSidecarSchema = z.object({
  midi_sha256: z.string().regex(/^[0-9a-f]{64}$/, "must be lowercase hex sha256"),
  ticks_per_beat: z.number().int().positive(),
  timed_events: z.array(TimedEventSchema).min(1),
});

export type MidiSidecar = z.infer<typeof MidiSidecarSchema>;

// REMI tokens or a TODO placeholder marker — Slice 1 allows either, validators
// in the report flag any record still carrying the placeholder.
export const RemiTokensSchema = z.union([
  z.array(z.string()),
  z.object({ todo: z.string().min(1) }),
]);

export const AbcTokensSchema = z.union([
  z.string().min(1),
  z.object({ todo: z.string().min(1) }),
]);

export const ObservationSchema = z.object({
  midi_sidecar: MidiSidecarSchema,
  tokens_remi: RemiTokensSchema,
  tokens_abc: AbcTokensSchema,
  piano_roll_svg_path: z.string().min(1),
  piano_roll_svg_inline: z.string().min(1),
});

export type Observation = z.infer<typeof ObservationSchema>;

// ─── Annotation Target ───────────────────────────────────────────────────────

export const TeachingNoteSchema = z.object({
  measure: z.number().int().min(1),
  note: z.string().min(1),
  technique: z.array(z.string().min(1)).optional(),
});

export type TeachingNote = z.infer<typeof TeachingNoteSchema>;

export const AnnotationTargetSchema = z.object({
  measure_range: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
  structure: z.string().min(1),
  key_moments: z.array(z.string().min(1)).min(1),
  teaching_goals: z.array(z.string().min(1)).min(1),
  style_tips: z.array(z.string().min(1)).min(1),
  teaching_notes: z.array(TeachingNoteSchema).min(1),
});

export type AnnotationTarget = z.infer<typeof AnnotationTargetSchema>;

// ─── Target Trace ────────────────────────────────────────────────────────────

export const ToolCallSchema = z.object({
  tool: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

export const UserTurnSchema = z.object({
  turn: z.number().int().min(1),
  role: z.literal("user"),
  content: z.string().min(1),
});

export const AssistantTurnSchema = z.object({
  turn: z.number().int().min(1),
  role: z.literal("assistant"),
  content: z.string().min(1),
  tool_calls: z.array(ToolCallSchema).optional(),
});

export const ToolTurnSchema = z.object({
  turn: z.number().int().min(1),
  role: z.literal("tool"),
  tool: z.string().min(1),
  content: z.unknown(),
});

export const TurnSchema = z.discriminatedUnion("role", [
  UserTurnSchema,
  AssistantTurnSchema,
  ToolTurnSchema,
]);

export type UserTurn = z.infer<typeof UserTurnSchema>;
export type AssistantTurn = z.infer<typeof AssistantTurnSchema>;
export type ToolTurn = z.infer<typeof ToolTurnSchema>;
export type Turn = z.infer<typeof TurnSchema>;

export const TargetTraceSchema = z.object({
  task_family: z.string().min(1),
  objective: z.string().min(1),
  session: z.array(TurnSchema).min(1),
});

export type TargetTrace = z.infer<typeof TargetTraceSchema>;

// ─── Eval Metadata ───────────────────────────────────────────────────────────

export const EvalMetadataSchema = z.object({
  split: z.enum(["train", "val", "test"]),
  split_strategy: z.string().min(1),
  leakage_check: z.enum(["passed", "failed", "pending"]),
  eval_eligibility: z.array(z.string().min(1)),
  phrase_continuation_eligible: z.boolean(),
  phrase_continuation_eligible_reason: z.string().optional(),
});

export type EvalMetadata = z.infer<typeof EvalMetadataSchema>;

// ─── Record ──────────────────────────────────────────────────────────────────

export const RecordSchema = z.object({
  id: z.string().min(1),
  schema_version: z.string().regex(/^jam-actions-v0\/\d+\.\d+\.\d+$/),
  provenance: ProvenanceSchema,
  scope: ScopeSchema,
  observation: ObservationSchema,
  annotation_target: AnnotationTargetSchema,
  target_trace: TargetTraceSchema,
  eval_metadata: EvalMetadataSchema,
});

export type Record = z.infer<typeof RecordSchema>;

export const SCHEMA_VERSION = "jam-actions-v0/1.0.0";
