// ─── enrichment.test.ts ──────────────────────────────────────────────────────
//
// Slice 11 — unit tests for src/dataset/enrichment.ts.
//
// Coverage goals (all required by slice kickoff §Tests):
//   - Whitelist enforcement: reject overlay containing `id`, `provenance`,
//     `observation`, or `eval_metadata` (forbidden top-level fields).
//   - Whitelist enforcement: reject overlay.scope containing keys other than
//     `musical_phrase_label`.
//   - Field replacement semantics: annotation_target / target_trace are
//     REPLACED in full, not deep-merged.
//   - Scope override only touches musical_phrase_label; other scope fields
//     remain untouched.
//   - Schema validation after merge: overlays that produce an invalid record
//     are rejected with schema_validation error.
//   - Idempotency: applying the same overlay twice produces a byte-identical
//     record.
//   - Audit trail returned correctly (record_id, fields_overridden, diff).
//   - Empty overlay is a no-op (record returns unchanged).
//   - applyEnrichment does NOT mutate caller's inputs.
//   - validateOverlayFile rejects malformed overlay files.
//   - E1 trace validation is preserved when target_trace enrichment uses valid
//     MCP tool calls (catalog-validated).
//
// ≥10 tests by count (slice kickoff requirement).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  applyEnrichment,
  validateOverlayFile,
  ENRICHABLE_TOP_LEVEL_FIELDS,
  ENRICHABLE_SCOPE_KEYS,
} from "./enrichment.js";
import { loadToolSchemaCatalog, validateTrace } from "./trace-validator.js";
import type { TargetTrace } from "./schema.js";

// ─── Test fixture: a minimal-but-valid source record ──────────────────────────
//
// Shape matches makeRecordSchema({ allow_placeholders: false }). Mirrors the
// shape used in schema-window-role.test.ts so the fixture is known-valid.

function minimalSourceRecord() {
  return {
    id: "test-song:m001-004:piano:mcp-session:v1",
    schema_version: "jam-actions-v0/1.0.0",
    provenance: {
      source_url: "https://example.com/",
      source_collected_at: "2026-05-17",
      source_type: "transcribed-by-author",
      composition_title: "Test Composition",
      composer: "Test Composer",
      composition_year: 1800,
      composition_pd_status_us: "public_domain",
      composition_pd_status_eu: "public_domain",
      arrangement_creator: "Test Arranger",
      arrangement_license: "CC-BY-SA",
      arrangement_license_version: "3.0",
      arrangement_evidence_url: "https://example.com/evidence",
      record_verdict: "public",
      verdict_reason: "Test record for enrichment library tests.",
      verifier: "test-suite",
      verified_at: "2026-05-17",
      training_use_permitted: true,
    },
    scope: {
      song_id: "test-song",
      phrase_window: "measures 1-4",
      instrument: "piano",
      key: "C major",
      tempo_bpm: 120,
      time_signature: "4/4",
      window_role: "prompt" as const,
      continuation_target_window: [5, 8] as [number, number],
      musical_phrase_label: "opening phrase",
      natural_phrase_boundary: true,
    },
    observation: {
      midi_sidecar: {
        midi_sha256: "a".repeat(64),
        ticks_per_beat: 480,
        timed_events: [
          {
            t_seconds: 0,
            t_ticks: 0,
            dur_seconds: 0.25,
            dur_ticks: 120,
            note: 60,
            name: "C4",
            velocity: 64,
            channel: 0,
            hand: "right",
            measure: 1,
            beat: 0,
          },
        ],
      },
      tokens_remi: ["Bar_1", "Position_0", "Pitch_60", "Velocity_64", "Duration_1"],
      tokens_abc: "X:1\nT:Test\nM:4/4\nL:1/16\nQ:1/4=120\nK:C\n|C|\n",
      piano_roll_svg_path: "pianoroll/test-song-m001-004.svg",
      piano_roll_svg_inline: "<svg></svg>",
    },
    annotation_target: {
      measure_range: [1, 4],
      structure: "Original sparse structure",
      key_moments: ["m1 generic"],
      teaching_goals: ["generic goal"],
      style_tips: ["generic tip"],
      teaching_notes: [{ measure: 1, note: "generic note" }],
    },
    target_trace: {
      task_family: "analyze-and-play-phrase",
      objective: "Original sparse objective.",
      session: [{ turn: 1, role: "user" as const, content: "Original user turn." }],
    },
    eval_metadata: {
      split: "train" as const,
      split_strategy:
        "stratified by (composer, composition_id) with MIDI byte-hash dedup",
      leakage_check: "pending" as const,
      eval_eligibility: ["E1_tool_use"],
      phrase_continuation_eligible: false,
    },
  };
}

// ─── Valid enriched annotation_target / target_trace replacements ────────────

function richAnnotationTarget() {
  return {
    measure_range: [1, 4] as [number, number],
    structure:
      "Enriched opening — four-measure antecedent establishing C major (C–Am–Dm7–G).",
    key_moments: [
      "m1 b0 C4 entry — tonic statement",
      "m3 b2 D minor7 — chromatic color shift (F# → F natural)",
      "m4 b3 G major dominant — half cadence preparing continuation",
    ],
    teaching_goals: [
      "even 16th-note rhythm across all arpeggios",
      "hear chord, not individual notes",
    ],
    style_tips: ["equal weight on every note", "let the harmonic changes phrase"],
    teaching_notes: [
      { measure: 1, note: "Tonic C major arpeggio (C-E-G-C-E)." },
      { measure: 3, note: "Chromatic shift F# → F natural; D minor7 color." },
    ],
  };
}

function validTargetTrace(): TargetTrace {
  return {
    task_family: "analyze-and-play-phrase",
    objective:
      "Read mm. 1-4 of test song, view the piano roll, analyze, then loop the phrase.",
    session: [
      {
        turn: 1,
        role: "user",
        content: "Show me mm. 1-4 and describe what's happening.",
      },
      {
        turn: 2,
        role: "assistant",
        content: "Let me view the piano roll.",
        tool_calls: [
          {
            tool: "view_piano_roll",
            arguments: { songId: "test-song", startMeasure: 1, endMeasure: 4 },
          },
        ],
      },
      {
        turn: 3,
        role: "tool",
        tool: "view_piano_roll",
        content: { svg_returned: true, measures: 4, rh_notes: 16, lh_notes: 4 },
      },
      {
        turn: 4,
        role: "assistant",
        content:
          "Opening establishes C major. Let me loop mm. 1-4.",
        tool_calls: [
          {
            tool: "play_song",
            arguments: {
              id: "test-song",
              startMeasure: 1,
              endMeasure: 4,
              mode: "loop",
            },
          },
        ],
      },
      {
        turn: 5,
        role: "tool",
        tool: "play_song",
        content: { playback_started: true, mode: "loop" },
      },
      {
        turn: 6,
        role: "assistant",
        content: "Phrase summary: opening tonic statement, half-cadence at m. 4.",
      },
    ],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("enrichment library — exported whitelists", () => {
  it("exposes ENRICHABLE_TOP_LEVEL_FIELDS containing exactly the locked set", () => {
    expect(new Set(ENRICHABLE_TOP_LEVEL_FIELDS)).toEqual(
      new Set(["annotation_target", "target_trace", "scope"]),
    );
  });

  it("exposes ENRICHABLE_SCOPE_KEYS containing exactly musical_phrase_label", () => {
    expect(new Set(ENRICHABLE_SCOPE_KEYS)).toEqual(
      new Set(["musical_phrase_label"]),
    );
  });
});

describe("applyEnrichment — whitelist enforcement (forbidden top-level)", () => {
  it("REJECTS overlay attempting to override `id`", () => {
    const rec = minimalSourceRecord();
    const result = applyEnrichment(rec, { id: "totally-different-id:v2" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("forbidden_top_level_field");
      expect(result.error.message).toMatch(/forbidden/i);
      expect(result.error.message).toContain("id");
    }
  });

  it("REJECTS overlay attempting to override `provenance` (Slice 2.5 verdicts are immutable)", () => {
    const rec = minimalSourceRecord();
    const evilOverlay = {
      provenance: { ...rec.provenance, record_verdict: "internal" },
    };
    const result = applyEnrichment(rec, evilOverlay);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("forbidden_top_level_field");
      expect(result.error.message).toContain("provenance");
    }
  });

  it("REJECTS overlay attempting to override `observation` (MIDI sidecar is source-of-truth)", () => {
    const rec = minimalSourceRecord();
    const evilOverlay = {
      observation: { ...rec.observation, piano_roll_svg_inline: "<svg>FAKE</svg>" },
    };
    const result = applyEnrichment(rec, evilOverlay);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("forbidden_top_level_field");
      expect(result.error.message).toContain("observation");
    }
  });

  it("REJECTS overlay attempting to override `eval_metadata`", () => {
    const rec = minimalSourceRecord();
    const evilOverlay = {
      eval_metadata: { ...rec.eval_metadata, split: "test" as const },
    };
    const result = applyEnrichment(rec, evilOverlay);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("forbidden_top_level_field");
      expect(result.error.message).toContain("eval_metadata");
    }
  });

  it("REJECTS overlay attempting to override `schema_version`", () => {
    const rec = minimalSourceRecord();
    const result = applyEnrichment(rec, {
      schema_version: "jam-actions-v0/2.0.0",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("forbidden_top_level_field");
    }
  });
});

describe("applyEnrichment — whitelist enforcement (forbidden scope keys)", () => {
  it("REJECTS overlay attempting scope.song_id override (locked split field)", () => {
    const rec = minimalSourceRecord();
    const result = applyEnrichment(rec, {
      scope: { song_id: "different-song" } as unknown as {
        musical_phrase_label?: string;
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("forbidden_scope_key");
      expect(result.error.message).toContain("song_id");
    }
  });

  it("REJECTS overlay attempting scope.phrase_window override (locked split field)", () => {
    const rec = minimalSourceRecord();
    const result = applyEnrichment(rec, {
      scope: { phrase_window: "measures 99-102" } as unknown as {
        musical_phrase_label?: string;
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("forbidden_scope_key");
    }
  });

  it("REJECTS overlay attempting scope.continuation_target_window override (pair-lock)", () => {
    const rec = minimalSourceRecord();
    const result = applyEnrichment(rec, {
      scope: { continuation_target_window: [99, 102] } as unknown as {
        musical_phrase_label?: string;
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("forbidden_scope_key");
    }
  });

  it("REJECTS overlay attempting scope.window_role override", () => {
    const rec = minimalSourceRecord();
    const result = applyEnrichment(rec, {
      scope: { window_role: "standalone" } as unknown as {
        musical_phrase_label?: string;
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("forbidden_scope_key");
    }
  });
});

describe("applyEnrichment — field-replacement semantics", () => {
  it("replaces annotation_target IN FULL (not deep-merge)", () => {
    const rec = minimalSourceRecord();
    const result = applyEnrichment(rec, {
      annotation_target: richAnnotationTarget(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.annotation_target.structure).toBe(
        "Enriched opening — four-measure antecedent establishing C major (C–Am–Dm7–G).",
      );
      // Confirm full replacement: old key_moments are gone
      expect(result.record.annotation_target.key_moments).toEqual(
        richAnnotationTarget().key_moments,
      );
      expect(result.record.annotation_target.key_moments).not.toContain(
        "m1 generic",
      );
    }
  });

  it("replaces target_trace IN FULL (not deep-merge)", () => {
    const rec = minimalSourceRecord();
    const result = applyEnrichment(rec, { target_trace: validTargetTrace() });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.target_trace.session.length).toBe(6);
      expect(result.record.target_trace.objective).toBe(
        "Read mm. 1-4 of test song, view the piano roll, analyze, then loop the phrase.",
      );
    }
  });

  it("scope.musical_phrase_label override touches ONLY that field; other scope fields preserved", () => {
    const rec = minimalSourceRecord();
    const result = applyEnrichment(rec, {
      scope: { musical_phrase_label: "enriched opening tonic statement" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.scope.musical_phrase_label).toBe(
        "enriched opening tonic statement",
      );
      // Other scope fields must be byte-identical to the source.
      expect(result.record.scope.song_id).toBe(rec.scope.song_id);
      expect(result.record.scope.phrase_window).toBe(rec.scope.phrase_window);
      expect(result.record.scope.window_role).toBe(rec.scope.window_role);
      expect(result.record.scope.continuation_target_window).toEqual(
        rec.scope.continuation_target_window,
      );
      expect(result.record.scope.tempo_bpm).toBe(rec.scope.tempo_bpm);
    }
  });

  it("does not mutate caller's source record (immutability)", () => {
    const rec = minimalSourceRecord();
    const originalStructure = rec.annotation_target.structure;
    applyEnrichment(rec, { annotation_target: richAnnotationTarget() });
    expect(rec.annotation_target.structure).toBe(originalStructure);
  });

  it("does not mutate caller's overlay (immutability)", () => {
    const rec = minimalSourceRecord();
    const overlay = { annotation_target: richAnnotationTarget() };
    const originalStructure = overlay.annotation_target.structure;
    const result = applyEnrichment(rec, overlay);
    expect(result.ok).toBe(true);
    // Even if downstream callers mutate the result, the original overlay must be untouched.
    if (result.ok) {
      // Mutate the merged record's annotation_target — overlay must NOT be affected.
      result.record.annotation_target.structure = "MUTATED";
      expect(overlay.annotation_target.structure).toBe(originalStructure);
    }
  });
});

describe("applyEnrichment — schema validation after merge", () => {
  it("REJECTS overlay whose annotation_target violates schema (missing required fields)", () => {
    const rec = minimalSourceRecord();
    const invalidTarget = {
      // Missing required key_moments / teaching_goals / style_tips / teaching_notes
      measure_range: [1, 4],
      structure: "Invalid — too thin",
    };
    const result = applyEnrichment(rec, { annotation_target: invalidTarget });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema_validation");
    }
  });

  it("REJECTS overlay whose target_trace.session is empty (schema requires >= 1 turn)", () => {
    const rec = minimalSourceRecord();
    const invalidTrace = {
      task_family: "analyze-and-play-phrase",
      objective: "Test.",
      session: [],
    };
    const result = applyEnrichment(rec, { target_trace: invalidTrace });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema_validation");
    }
  });
});

describe("applyEnrichment — idempotency", () => {
  it("applying the same overlay twice produces byte-identical record JSON", () => {
    const rec1 = minimalSourceRecord();
    const rec2 = minimalSourceRecord();
    const overlay = {
      annotation_target: richAnnotationTarget(),
      target_trace: validTargetTrace(),
      scope: { musical_phrase_label: "enriched opening" },
    };
    const r1 = applyEnrichment(rec1, overlay);
    const r2 = applyEnrichment(rec2, overlay);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(JSON.stringify(r1.record)).toBe(JSON.stringify(r2.record));
    }
  });

  it("applying overlay to its own output is a fixed point (idempotent re-apply)", () => {
    const rec = minimalSourceRecord();
    const overlay = {
      annotation_target: richAnnotationTarget(),
      target_trace: validTargetTrace(),
      scope: { musical_phrase_label: "enriched opening" },
    };
    const r1 = applyEnrichment(rec, overlay);
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      const r2 = applyEnrichment(r1.record, overlay);
      expect(r2.ok).toBe(true);
      if (r2.ok) {
        expect(JSON.stringify(r2.record)).toBe(JSON.stringify(r1.record));
      }
    }
  });
});

describe("applyEnrichment — audit trail", () => {
  it("returns audit listing fields_overridden for annotation_target", () => {
    const rec = minimalSourceRecord();
    const r = applyEnrichment(rec, {
      annotation_target: richAnnotationTarget(),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.audit.record_id).toBe(rec.id);
      expect(r.audit.fields_overridden).toEqual(["annotation_target"]);
      expect(r.audit.diff["annotation_target"]).toBeDefined();
      // before snapshot captures the original
      expect(
        (r.audit.diff["annotation_target"].before as { structure: string })
          .structure,
      ).toBe("Original sparse structure");
    }
  });

  it("audit trail lists all three field-paths when overlay touches all three", () => {
    const rec = minimalSourceRecord();
    const r = applyEnrichment(rec, {
      annotation_target: richAnnotationTarget(),
      target_trace: validTargetTrace(),
      scope: { musical_phrase_label: "enriched label" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(new Set(r.audit.fields_overridden)).toEqual(
        new Set([
          "annotation_target",
          "target_trace",
          "scope.musical_phrase_label",
        ]),
      );
    }
  });

  it("empty overlay returns ok with no fields_overridden (no-op)", () => {
    const rec = minimalSourceRecord();
    const r = applyEnrichment(rec, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.audit.fields_overridden).toEqual([]);
      // The record is otherwise unchanged.
      expect(JSON.stringify(r.record)).toBe(JSON.stringify(rec));
    }
  });
});

describe("applyEnrichment — input-shape guards", () => {
  it("REJECTS null source record", () => {
    const r = applyEnrichment(null, { annotation_target: richAnnotationTarget() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("bad_record");
  });

  it("REJECTS array source record", () => {
    const r = applyEnrichment([], { annotation_target: richAnnotationTarget() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("bad_record");
  });

  it("REJECTS null overlay", () => {
    const r = applyEnrichment(minimalSourceRecord(), null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("bad_overlay");
  });

  it("REJECTS array overlay", () => {
    const r = applyEnrichment(minimalSourceRecord(), []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("bad_overlay");
  });
});

describe("validateOverlayFile", () => {
  it("accepts a minimal well-formed overlay file", () => {
    const file = {
      version: "0.1.0",
      applied_for_dataset_version: "0.2.0",
      schema_version: "jam-actions-v0/1.0.0",
      applied_at: "2026-05-17",
      overrides: {
        "test-song:m001-004:piano:mcp-session:v1": {
          annotation_target: richAnnotationTarget(),
        },
      },
    };
    const r = validateOverlayFile(file);
    expect(r.ok).toBe(true);
  });

  it("REJECTS overlay file missing required top-level fields", () => {
    const r = validateOverlayFile({ overrides: {} });
    expect(r.ok).toBe(false);
  });

  it("REJECTS overlay-entry containing extra keys beyond the whitelist", () => {
    const file = {
      version: "0.1.0",
      applied_for_dataset_version: "0.2.0",
      schema_version: "jam-actions-v0/1.0.0",
      applied_at: "2026-05-17",
      overrides: {
        "test:v1": {
          annotation_target: richAnnotationTarget(),
          provenance: { record_verdict: "internal" }, // forbidden — should fail strict schema
        },
      },
    };
    const r = validateOverlayFile(file);
    expect(r.ok).toBe(false);
  });

  it("REJECTS overlay-entry whose scope sub-object has forbidden keys", () => {
    const file = {
      version: "0.1.0",
      applied_for_dataset_version: "0.2.0",
      schema_version: "jam-actions-v0/1.0.0",
      applied_at: "2026-05-17",
      overrides: {
        "test:v1": {
          scope: { song_id: "evil" },
        },
      },
    };
    const r = validateOverlayFile(file);
    expect(r.ok).toBe(false);
  });
});

describe("applyEnrichment — E1 trace validation preserved on enriched target_trace", () => {
  it("an enriched target_trace using only catalogued MCP tools validates against tool-schemas.json", () => {
    const rec = minimalSourceRecord();
    const r = applyEnrichment(rec, { target_trace: validTargetTrace() });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const catalog = loadToolSchemaCatalog();
      const report = validateTrace(r.record.target_trace, catalog);
      expect(report.ok).toBe(true);
      expect(report.mismatches).toHaveLength(0);
    }
  });
});
