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

// ─── Provenance ──────────────────────────────────────────────────────────────
//
// Where the .mid bytes came from and what the evidence says about them. Written
// by scripts/provenance-audit.ts from three sources: the download URL recorded
// in scripts/download-library.ts, the source site's terms (fetched, quoted),
// and the file's own text/copyright meta events (FF 01–07). `verifier` names
// the evidence, never a person or a program. Dataset builders read this block
// instead of inferring a licence from the genre (docs/findings/
// library-provenance-audit.md).

export const ARRANGEMENT_LICENSES = [
  "CC-BY-SA-3.0-DE",
  "Public-Domain",
  "all-rights-reserved",
  "no-redistribution",
  "unknown",
] as const;
export type ArrangementLicense = (typeof ARRANGEMENT_LICENSES)[number];

export const TITLE_VERDICTS = ["matches", "no-title-in-file", "contradicts"] as const;
export type TitleVerdict = (typeof TITLE_VERDICTS)[number];

export const CreditedPartySchema = z.object({
  name: z.string().min(1),
  /** "midi-meta" when the file itself names the party; otherwise the URL that does. */
  evidence: z.string().min(1),
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const ProvenanceSchema = z.object({
  schema: z.literal(1),
  /** URL the bytes were fetched from (scripts/download-library.ts), or the receipt page. */
  source_url: z.string().min(1),
  source_site: z.string().min(1),
  /** The arranger / sequencer / typesetter as the evidence names them. */
  arrangement_creator: z.string().min(1),
  arrangement_license: z.enum(ARRANGEMENT_LICENSES),
  terms_url: z.string().min(1),
  /** Verbatim from terms_url (or the file) — the sentence that sets the licence. */
  terms_quote: z.string().min(1),
  verified_at: z.string().regex(ISO_DATE),
  /** The evidence: URL(s) and/or the file's own meta events. Never a builder stamp. */
  verifier: z.string().min(1),
  midi_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** The file's own words (title-class meta events), as read at verified_at. */
  midi_title_events: z.array(z.string()),
  /** The file's credit-class events (FF 02 copyright + "sequenced by" etc.). */
  midi_credit_events: z.array(z.string()),
  /** First characters of the lyric track, when the file carries one. */
  midi_lyric_head: z.string().optional(),
  credited_parties: z.array(CreditedPartySchema),
  title_verdict: z.enum(TITLE_VERDICTS),
  /** Extra title tokens the audit accepts as this song (e.g. a translated title). */
  title_aliases: z.array(z.string()).optional(),
  title_note: z.string().optional(),
  /** Another library id whose .mid is byte-identical to this one. */
  duplicate_of: z.string().optional(),
  quarantine: z
    .object({
      at: z.string().regex(ISO_DATE),
      /** What the file actually is, per its own meta events. */
      actual_piece: z.string().min(1),
      reason: z.string().min(1),
    })
    .optional(),
  notes: z.string().optional(),
});

export type Provenance = z.infer<typeof ProvenanceSchema>;
export type CreditedParty = z.infer<typeof CreditedPartySchema>;

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
  provenance: ProvenanceSchema.optional(),
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
