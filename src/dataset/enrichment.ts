// ─── jam-actions-v0 Record Enrichment Library ────────────────────────────────
//
// Slice 11 — pure library that applies a small whitelist of overlay fields onto
// a source record, validates the result, and returns the merged record alongside
// an audit-trail describing which fields were overridden.
//
// Architectural rule (locked by the slice kickoff):
//   - Record JSONs are NEVER hand-edited as the source of truth.
//   - All record content changes flow through an enrichment-overrides.json overlay
//     (`datasets/jam-actions-v0/enrichment-overrides.json`).
//   - The runner (`scripts/apply-jam-actions-enrichment.ts`) reads the overlay,
//     calls `applyEnrichment(record, overrides)`, and writes the result back to
//     `datasets/jam-actions-v0/records/<id>.json`.
//   - Re-running the runner with the same overlay produces byte-identical output
//     (idempotency).
//
// Whitelist (LOCKED):
//
//   Top-level fields allowed in overlay block:
//     - annotation_target      → entire field is REPLACED by overlay value
//     - target_trace           → entire field is REPLACED by overlay value
//     - scope                  → ONLY `musical_phrase_label` may be present in the
//                                overlay's scope sub-object; any other key inside
//                                scope causes rejection
//
//   Fields NEVER allowed (overlay containing any of these keys is REJECTED):
//     - id, schema_version
//     - provenance  (and every nested provenance.* field — Slice 2.5's verdicts
//                    are immutable here)
//     - observation (and every nested observation.* field — the MIDI sidecar,
//                    REMI/ABC tokens, piano-roll path/inline come from source
//                    MIDI; they are the data, they don't get "enriched")
//     - scope.song_id, scope.phrase_window, scope.window_role,
//       scope.continuation_target_window, scope.paired_prompt_record_id,
//       scope.instrument, scope.key, scope.tempo_bpm, scope.time_signature,
//       scope.natural_phrase_boundary  (only `musical_phrase_label` is enrichable)
//     - eval_metadata (and every nested eval_metadata.* field — split + leakage +
//                      eligibility come from the dataset-build/eval pipeline)
//
// Merge semantics: TOP-LEVEL REPLACEMENT. The whole `annotation_target` (or
// `target_trace`) field is replaced atomically. Inside `scope`, the single
// allowed key replaces the corresponding scope field. No deep-merge; this is
// simpler to audit and easier to diff.
//
// Validation: after merge, the resulting record is validated against
// makeRecordSchema({ allow_placeholders: false }). Any schema-violating overlay
// is rejected with a structured error containing the zod issue list.
//
// Return: a discriminated union { ok: true, record, audit } | { ok: false, error }.
// The audit-trail names every overridden field so the caller can log changes.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { makeRecordSchema, type Record as DatasetRecord } from "./schema.js";

// ─── Enrichable / forbidden field declarations ───────────────────────────────

/**
 * Top-level record fields that an overlay block may set.
 * (scope is special — only one key within scope is enrichable; see below.)
 */
export const ENRICHABLE_TOP_LEVEL_FIELDS = [
  "annotation_target",
  "target_trace",
  "scope",
] as const;
export type EnrichableTopLevelField = (typeof ENRICHABLE_TOP_LEVEL_FIELDS)[number];

/**
 * The ONLY key allowed inside an overlay's `scope` sub-object.
 * Every other scope key (song_id, phrase_window, window_role,
 * continuation_target_window, paired_prompt_record_id, instrument, key,
 * tempo_bpm, time_signature, natural_phrase_boundary) is locked.
 */
export const ENRICHABLE_SCOPE_KEYS = ["musical_phrase_label"] as const;
export type EnrichableScopeKey = (typeof ENRICHABLE_SCOPE_KEYS)[number];

/**
 * Top-level fields that an overlay block MUST NOT contain.
 * These are immutable from the enrichment library's perspective.
 */
export const FORBIDDEN_TOP_LEVEL_FIELDS = [
  "id",
  "schema_version",
  "provenance",
  "observation",
  "eval_metadata",
] as const;

// ─── Overlay shape (typed) ───────────────────────────────────────────────────

/**
 * One overlay entry — the shape of `overrides["<record-id>"]` in
 * datasets/jam-actions-v0/enrichment-overrides.json.
 *
 * Every field is optional; an empty `{}` is a no-op overlay (merge returns the
 * record unchanged). At least one allowed field SHOULD be present in real
 * overlays, but an empty entry is not an error (callers may decide).
 *
 * The actual value-type of `annotation_target` and `target_trace` is left as
 * `unknown` here and validated by the schema after merge — so callers don't
 * need to import the deep zod schemas for these fields.
 */
export interface EnrichmentOverlayEntry {
  /** Replacement value for record.annotation_target (entire field). */
  annotation_target?: unknown;
  /** Replacement value for record.target_trace (entire field). */
  target_trace?: unknown;
  /**
   * Partial scope override — ONLY `musical_phrase_label` is allowed inside.
   * Any other key causes rejection.
   */
  scope?: {
    musical_phrase_label?: string;
  };
}

/**
 * The full enrichment-overrides.json shape.
 * The runner reads this file; the library only sees individual overlay entries.
 */
export interface EnrichmentOverlayFile {
  /** Overlay-file format version (semver-ish; not the dataset version). */
  version: string;
  /** Which dataset version this overlay is meant to produce. */
  applied_for_dataset_version: string;
  /** Schema version this overlay targets (e.g. "jam-actions-v0/1.0.0"). */
  schema_version: string;
  /** ISO date (YYYY-MM-DD) the overlay was authored / last edited. */
  applied_at: string;
  /**
   * Per-record overlay map keyed by full record id.
   * Order is preserved by JSON readers but is not load-bearing — every entry is
   * independent.
   */
  overrides: Record<string, EnrichmentOverlayEntry>;
}

// ─── Audit-trail shape ───────────────────────────────────────────────────────

/**
 * Audit record for one applied overlay — what changed on a single record.
 */
export interface EnrichmentAudit {
  /** Full record id. */
  record_id: string;
  /**
   * Field-paths that the overlay overrode on this record.
   * Format: "annotation_target" | "target_trace" | "scope.musical_phrase_label".
   * Empty array means the overlay was effectively a no-op (no fields present).
   */
  fields_overridden: string[];
  /**
   * Map field-path → { before, after } for human-readable diff.
   * Values are JSON-serializable.
   */
  diff: globalThis.Record<string, { before: unknown; after: unknown }>;
}

// ─── Result type ─────────────────────────────────────────────────────────────

/**
 * Result of applyEnrichment. Discriminated by `ok`.
 *
 * - ok=true:  record is the merged record (typed as DatasetRecord); audit
 *             describes which fields were overridden.
 * - ok=false: error.code names the failure class; error.message is a one-line
 *             human summary; error.details carries structured info (e.g. the
 *             list of forbidden keys present, or the zod issue list).
 */
export type EnrichmentResult =
  | {
      ok: true;
      record: DatasetRecord;
      audit: EnrichmentAudit;
    }
  | {
      ok: false;
      error: EnrichmentError;
    };

/**
 * Error codes from applyEnrichment.
 *
 * - forbidden_top_level_field   → overlay had a top-level key not in the
 *                                  whitelist (e.g. "id" or "provenance")
 * - forbidden_scope_key         → overlay.scope had a key other than
 *                                  "musical_phrase_label"
 * - schema_validation           → post-merge record fails makeRecordSchema
 * - bad_record                  → input record is not a non-null object
 * - bad_overlay                 → input overlay is not a non-null object
 */
export type EnrichmentErrorCode =
  | "forbidden_top_level_field"
  | "forbidden_scope_key"
  | "schema_validation"
  | "bad_record"
  | "bad_overlay";

export interface EnrichmentError {
  code: EnrichmentErrorCode;
  message: string;
  /** Structured details (varies by code). */
  details?: unknown;
}

// ─── Overlay file zod schema (used by the runner; library exposes for tests) ──

/**
 * Minimal zod schema for an overlay entry — enforces shape at the runner layer
 * (the per-record library function also enforces shape, but JSON parsing
 * benefits from a structural check up-front).
 *
 * NOTE: this schema does NOT validate the value-types of annotation_target /
 * target_trace deeply — that's done after merge via makeRecordSchema.
 */
export const EnrichmentOverlayEntrySchema = z
  .object({
    annotation_target: z.unknown().optional(),
    target_trace: z.unknown().optional(),
    scope: z
      .object({
        musical_phrase_label: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const EnrichmentOverlayFileSchema = z.object({
  version: z.string().min(1),
  applied_for_dataset_version: z.string().min(1),
  schema_version: z.string().regex(/^jam-actions-v0\/\d+\.\d+\.\d+$/),
  applied_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  overrides: z.record(z.string().min(1), EnrichmentOverlayEntrySchema),
});

// ─── The pure library function ───────────────────────────────────────────────

/**
 * Apply one overlay entry to a source record.
 *
 * Pure: does not read the filesystem, does not mutate inputs. Returns either
 * the merged record (schema-validated) and an audit trail, or a structured
 * error.
 *
 * The merge is TOP-LEVEL REPLACEMENT:
 *   - If overlay.annotation_target is present, the entire annotation_target
 *     field is replaced.
 *   - If overlay.target_trace is present, the entire target_trace field is
 *     replaced.
 *   - If overlay.scope is present, ONLY scope.musical_phrase_label is set on
 *     the resulting record's scope (everything else in source scope is
 *     preserved). If overlay.scope.musical_phrase_label is undefined, no
 *     change is made.
 *
 * Idempotency: applying the same overlay twice produces a record byte-identical
 * to the first application (after JSON.stringify with the same key order).
 *
 * @param sourceRecord The source record (typically loaded from datasets/jam-actions-v0/records/<id>.json).
 * @param overlay      The overlay entry (typically `overlayFile.overrides[recordId]`).
 * @returns EnrichmentResult — { ok: true, record, audit } on success;
 *          { ok: false, error } on rejection.
 */
export function applyEnrichment(
  sourceRecord: unknown,
  overlay: unknown,
): EnrichmentResult {
  // ── Input shape guards ────────────────────────────────────────────────────
  if (
    sourceRecord === null ||
    typeof sourceRecord !== "object" ||
    Array.isArray(sourceRecord)
  ) {
    return {
      ok: false,
      error: {
        code: "bad_record",
        message: "Source record must be a non-null object.",
      },
    };
  }
  if (
    overlay === null ||
    typeof overlay !== "object" ||
    Array.isArray(overlay)
  ) {
    return {
      ok: false,
      error: {
        code: "bad_overlay",
        message: "Overlay must be a non-null object.",
      },
    };
  }

  const rec = sourceRecord as globalThis.Record<string, unknown>;
  const ov = overlay as globalThis.Record<string, unknown>;

  // ── Whitelist enforcement: top-level keys ─────────────────────────────────
  const overlayKeys = Object.keys(ov);
  const forbiddenKeysPresent = overlayKeys.filter(
    (k) =>
      !(ENRICHABLE_TOP_LEVEL_FIELDS as readonly string[]).includes(k),
  );
  if (forbiddenKeysPresent.length > 0) {
    return {
      ok: false,
      error: {
        code: "forbidden_top_level_field",
        message: `Overlay contains forbidden top-level key(s): ${forbiddenKeysPresent.join(", ")}. Allowed: ${ENRICHABLE_TOP_LEVEL_FIELDS.join(", ")}.`,
        details: { forbidden_keys: forbiddenKeysPresent },
      },
    };
  }

  // ── Whitelist enforcement: scope sub-keys ─────────────────────────────────
  if (ov.scope !== undefined) {
    if (
      ov.scope === null ||
      typeof ov.scope !== "object" ||
      Array.isArray(ov.scope)
    ) {
      return {
        ok: false,
        error: {
          code: "forbidden_scope_key",
          message: "Overlay.scope must be a non-null object containing only allowed keys.",
        },
      };
    }
    const scopeOverride = ov.scope as globalThis.Record<string, unknown>;
    const scopeKeys = Object.keys(scopeOverride);
    const forbiddenScopeKeys = scopeKeys.filter(
      (k) => !(ENRICHABLE_SCOPE_KEYS as readonly string[]).includes(k),
    );
    if (forbiddenScopeKeys.length > 0) {
      return {
        ok: false,
        error: {
          code: "forbidden_scope_key",
          message: `Overlay.scope contains forbidden key(s): ${forbiddenScopeKeys.join(", ")}. Only ${ENRICHABLE_SCOPE_KEYS.join(", ")} is enrichable inside scope.`,
          details: { forbidden_scope_keys: forbiddenScopeKeys },
        },
      };
    }
  }

  // ── Build the merged record ───────────────────────────────────────────────
  // Deep-clone via JSON round-trip so we never mutate the caller's input and
  // so the audit-trail's `before` values are stable snapshots.
  //
  // NOTE: JSON round-trip is acceptable here because every record/overlay value
  // is JSON-serializable by construction (records live on disk as JSON). It is
  // not used as a fast path; it's used to guarantee no shared references.
  const cloneRecord = JSON.parse(JSON.stringify(rec)) as globalThis.Record<
    string,
    unknown
  >;
  const audit: EnrichmentAudit = {
    record_id: typeof rec.id === "string" ? rec.id : "<unknown-id>",
    fields_overridden: [],
    diff: {},
  };

  // annotation_target — full replacement
  if (Object.prototype.hasOwnProperty.call(ov, "annotation_target")) {
    const before = cloneRecord.annotation_target;
    const after = JSON.parse(
      JSON.stringify(ov.annotation_target),
    ) as unknown;
    cloneRecord.annotation_target = after;
    audit.fields_overridden.push("annotation_target");
    audit.diff["annotation_target"] = { before, after };
  }

  // target_trace — full replacement
  if (Object.prototype.hasOwnProperty.call(ov, "target_trace")) {
    const before = cloneRecord.target_trace;
    const after = JSON.parse(JSON.stringify(ov.target_trace)) as unknown;
    cloneRecord.target_trace = after;
    audit.fields_overridden.push("target_trace");
    audit.diff["target_trace"] = { before, after };
  }

  // scope.musical_phrase_label — single-key replacement inside scope
  if (Object.prototype.hasOwnProperty.call(ov, "scope")) {
    const scopeOverride = ov.scope as
      | { musical_phrase_label?: string }
      | undefined;
    if (
      scopeOverride !== undefined &&
      Object.prototype.hasOwnProperty.call(scopeOverride, "musical_phrase_label")
    ) {
      // Existing scope must be present and an object (the source record schema
      // guarantees this; defensive check is cheap).
      const existingScope = cloneRecord.scope as
        | globalThis.Record<string, unknown>
        | undefined;
      if (
        existingScope === undefined ||
        existingScope === null ||
        typeof existingScope !== "object" ||
        Array.isArray(existingScope)
      ) {
        return {
          ok: false,
          error: {
            code: "schema_validation",
            message:
              "Source record has no scope object; cannot apply scope.musical_phrase_label override.",
          },
        };
      }
      const before = existingScope.musical_phrase_label;
      const after = scopeOverride.musical_phrase_label;
      existingScope.musical_phrase_label = after;
      cloneRecord.scope = existingScope;
      audit.fields_overridden.push("scope.musical_phrase_label");
      audit.diff["scope.musical_phrase_label"] = { before, after };
    }
  }

  // ── Schema validation (post-merge) ────────────────────────────────────────
  const schema = makeRecordSchema({ allow_placeholders: false });
  const parseResult = schema.safeParse(cloneRecord);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        code: "schema_validation",
        message: `Post-merge record fails schema validation: ${parseResult.error.issues
          .slice(0, 5)
          .map(
            (i) => `[${i.path.join(".") || "<root>"}] ${i.message}`,
          )
          .join("; ")}`,
        details: { issues: parseResult.error.issues },
      },
    };
  }

  // Return the cloneRecord (NOT parseResult.data) so that the source record's
  // key insertion order is preserved on the merged result. zod's parse
  // re-orders keys to match its own schema declaration order, which would
  // cause the runner to rewrite files with reordered keys — appearing as a
  // diff on locked fields like scope.continuation_target_window even when
  // their values are byte-identical. We've already proven the record is valid
  // via parseResult.success; we just discard the re-ordered output.
  return { ok: true, record: cloneRecord as unknown as DatasetRecord, audit };
}

/**
 * Validate the shape of an overlay file at the runner layer.
 * Returns a structured error if the file is malformed.
 */
export function validateOverlayFile(
  raw: unknown,
):
  | { ok: true; data: EnrichmentOverlayFile }
  | { ok: false; error: { message: string; details?: unknown } } {
  const parseResult = EnrichmentOverlayFileSchema.safeParse(raw);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        message: `Overlay file is malformed: ${parseResult.error.issues
          .slice(0, 5)
          .map(
            (i) => `[${i.path.join(".") || "<root>"}] ${i.message}`,
          )
          .join("; ")}`,
        details: { issues: parseResult.error.issues },
      },
    };
  }
  return { ok: true, data: parseResult.data as EnrichmentOverlayFile };
}
