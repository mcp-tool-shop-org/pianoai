// ─── jam-actions-v1 schema ───────────────────────────────────────────────────
//
// NEW corpus. Not jam-actions-acoustic-v0 (published, frozen).
// Spine: prompt-visible vs record-only. The model must call a tool to know
// the answer. Thresholds (when a family has them) stay in the record.
//
// Families in this chunk: F2 chord identification, F3 structural navigation.
// Tracker-error numbers in tracker-error.ts are the guard-band input for
// F5 later; they are not the point of these records.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import {
  ProvenanceSchema,
  ScopeSchema,
  AnnotationTargetSchema,
  TargetTraceSchema,
  EvalMetadataSchema,
} from "../schema.js";

export const V1_SCHEMA_VERSION = "jam-actions-v1/1.0.0";

export const V1_FAMILIES = [
  "chord",
  "measures",
  "transpose",
  "teaching_goals",
  "key_moments",
  "compare",
  "harmony",
  "acoustic",
  "ensemble",
] as const;
export type V1Family = (typeof V1_FAMILIES)[number];

/** Paths the SFT prompt may see. Everything else is record-only. */
export const PROMPT_VISIBLE_PATHS = ["target_trace"] as const;

/** Paths that must never appear in the prompt. */
export const RECORD_ONLY_PATHS = [
  "observation.gold",
  "observation.thresholds",
] as const;

export const COVERAGE_FLOORS = {
  tools: 9,
  songs: 24,
  shapes: 7,
} as const;

export const V1GoldSchema = z.object({
  family: z.enum(V1_FAMILIES),
  answer: z.string().min(1),
  /** Engine that produced the answer — re-run at test time. */
  engine: z.string().min(1),
});
export type V1Gold = z.infer<typeof V1GoldSchema>;

export const V1RecordSchema = z.object({
  id: z.string().min(1),
  schema_version: z.literal(V1_SCHEMA_VERSION),
  family: z.enum(V1_FAMILIES),
  provenance: ProvenanceSchema,
  scope: ScopeSchema,
  observation: z.object({
    thresholds: z.record(z.string(), z.number()),
    gold: V1GoldSchema,
  }).passthrough(),
  annotation_target: AnnotationTargetSchema,
  target_trace: TargetTraceSchema,
  eval_metadata: EvalMetadataSchema,
  split: z.enum(["train", "test"]),
});
export type V1Record = z.infer<typeof V1RecordSchema>;

export interface CoverageReport {
  schema_version: string;
  n: number;
  tools: string[];
  tool_count: number;
  songs: string[];
  song_count: number;
  genres: string[];
  genre_count: number;
  keys: string[];
  key_count: number;
  shapes: Record<string, number>;
  shape_count: number;
  majority_shape: string;
  majority_shape_share: number;
  families: Record<string, number>;
  floors: typeof COVERAGE_FLOORS;
  floors_met: boolean;
}
