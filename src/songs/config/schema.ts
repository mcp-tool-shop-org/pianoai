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

/**
 * Shared tempo bounds — imported by registry.ts's validateSong() too.
 * Previously schema.ts accepted 10-400 while registry.ts independently
 * enforced 20-300, so a config with e.g. tempo:350 passed scanLibrary's
 * validation (reported "ready" in getLibraryProgress) only to be silently
 * rejected later at registerSong() with a registry-level error that didn't
 * obviously connect back to the tempo field (F-a5b89833).
 */
export const MIN_TEMPO = 20;
export const MAX_TEMPO = 300;

/**
 * Shared id-format regex — imported by config/loader.ts's sanitizeConfigId
 * too. Previously loader.ts had its own, looser regex that permitted
 * consecutive hyphens (e.g. "a--b") that could never pass this schema's
 * own id validation, so loadSongConfig would accept an id shape no valid
 * config could actually have (F-6acb6320).
 */
export const SONG_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const MeasureOverrideSchema = z.object({
  measure: z.number().int().min(1),
  fingering: z.string().optional(),
  teachingNote: z.string().optional(),
  dynamics: z.string().optional(),
  tempoOverride: z.number().min(MIN_TEMPO).max(MAX_TEMPO).optional(),
});

export const MusicalLanguageSchema = z.object({
  description: z.string().min(1),
  structure: z.string().min(1),
  keyMoments: z.array(z.string()),
  teachingGoals: z.array(z.string()),
  styleTips: z.array(z.string()),
});

export const SongConfigSchema = z.object({
  id: z.string().regex(SONG_ID_REGEX, "id must be kebab-case"),
  title: z.string().min(1),
  genre: z.enum(GENRES),
  composer: z.string().optional(),
  arranger: z.string().optional(),
  difficulty: z.enum(DIFFICULTIES),
  key: z.string().min(1),
  tempo: z.number().min(MIN_TEMPO).max(MAX_TEMPO).optional(),
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
