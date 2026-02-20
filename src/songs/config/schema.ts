// ─── Song Config Schema ──────────────────────────────────────────────────────
//
// Human-authored config that accompanies each .mid file.
// The MIDI ingest pipeline merges this config with extracted note data
// to produce a complete SongEntry.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { GENRES, DIFFICULTIES } from "../types.js";

// ─── Song Status ─────────────────────────────────────────────────────────────

export const SONG_STATUSES = ["raw", "annotated", "ready"] as const;
export type SongStatus = (typeof SONG_STATUSES)[number];

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const MeasureOverrideSchema = z.object({
  measure: z.number().int().min(1),
  fingering: z.string().optional(),
  teachingNote: z.string().optional(),
  dynamics: z.string().optional(),
  tempoOverride: z.number().min(10).max(400).optional(),
});

export const MusicalLanguageSchema = z.object({
  description: z.string().min(1),
  structure: z.string().min(1),
  keyMoments: z.array(z.string()),
  teachingGoals: z.array(z.string()),
  styleTips: z.array(z.string()),
});

export const SongConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be kebab-case"),
  title: z.string().min(1),
  genre: z.enum(GENRES),
  composer: z.string().optional(),
  arranger: z.string().optional(),
  difficulty: z.enum(DIFFICULTIES),
  key: z.string().min(1),
  tempo: z.number().min(10).max(400).optional(),
  timeSignature: z.string().optional(),
  tags: z.array(z.string()),
  source: z.string().optional(),
  musicalLanguage: MusicalLanguageSchema.optional(),
  measureOverrides: z.array(MeasureOverrideSchema).optional(),
  splitPoint: z.number().int().min(0).max(127).optional(),
  status: z.enum(SONG_STATUSES).default("raw"),
});

// ─── Derived Types ───────────────────────────────────────────────────────────

export type SongConfig = z.infer<typeof SongConfigSchema>;
export type MeasureOverride = z.infer<typeof MeasureOverrideSchema>;

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ConfigError {
  field: string;
  message: string;
}

/**
 * Validate a SongConfig object using the zod schema.
 * Returns an empty array if valid.
 */
export function validateConfig(config: unknown): ConfigError[] {
  const result = SongConfigSchema.safeParse(config);
  if (result.success) return [];

  return result.error.issues.map((issue) => ({
    field: issue.path.join(".") || "root",
    message: issue.message,
  }));
}
