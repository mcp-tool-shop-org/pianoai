// ─── schema-window-role.test.ts ───────────────────────────────────────────────
//
// Tests for Slice 5 window-role schema extensions in ScopeSchema:
//   - window_role enum validation (allowed values only)
//   - window_role 'prompt' requires continuation_target_window
//   - window_role 'continuation_target' requires paired_prompt_record_id
//   - window_role 'standalone' requires neither
//   - All optional: no window_role is valid (backward compat for Slice 1–4 records)
//   - Invalid window_role values are rejected
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { ScopeSchema, makeRecordSchema } from "./schema.js";

// ─── Minimal valid scope factories ────────────────────────────────────────────

function baseScope() {
  return {
    song_id: "test-song",
    phrase_window: "measures 1-4",
    instrument: "piano",
    key: "C major",
    tempo_bpm: 120,
    time_signature: "4/4",
  };
}

function promptScope() {
  return {
    ...baseScope(),
    window_role: "prompt" as const,
    continuation_target_window: [5, 8] as [number, number],
    musical_phrase_label: "opening antecedent",
    natural_phrase_boundary: true,
  };
}

function continuationScope() {
  return {
    ...baseScope(),
    phrase_window: "measures 5-8",
    window_role: "continuation_target" as const,
    paired_prompt_record_id: "test-song:m001-004:piano:mcp-session:v1",
  };
}

function standaloneScope() {
  return {
    ...baseScope(),
    window_role: "standalone" as const,
  };
}

// ─── ScopeSchema — window_role enum ──────────────────────────────────────────

describe("ScopeSchema — window_role enum", () => {
  it("accepts window_role 'prompt'", () => {
    const r = ScopeSchema.safeParse(promptScope());
    expect(r.success).toBe(true);
  });

  it("accepts window_role 'continuation_target'", () => {
    const r = ScopeSchema.safeParse(continuationScope());
    expect(r.success).toBe(true);
  });

  it("accepts window_role 'standalone'", () => {
    const r = ScopeSchema.safeParse(standaloneScope());
    expect(r.success).toBe(true);
  });

  it("accepts scope with no window_role (backward compat)", () => {
    const r = ScopeSchema.safeParse(baseScope());
    expect(r.success).toBe(true);
  });

  it("REJECTS window_role 'pair_half' (invalid value)", () => {
    const scope = { ...baseScope(), window_role: "pair_half" };
    const r = ScopeSchema.safeParse(scope);
    expect(r.success).toBe(false);
  });

  it("REJECTS window_role 'gold' (invalid value)", () => {
    const scope = { ...baseScope(), window_role: "gold" };
    const r = ScopeSchema.safeParse(scope);
    expect(r.success).toBe(false);
  });

  it("REJECTS window_role '' (empty string)", () => {
    const scope = { ...baseScope(), window_role: "" };
    const r = ScopeSchema.safeParse(scope);
    expect(r.success).toBe(false);
  });
});

// ─── ScopeSchema — prompt requires continuation_target_window ─────────────────

describe("ScopeSchema — prompt → continuation_target_window required", () => {
  it("REJECTS prompt scope missing continuation_target_window", () => {
    const scope = { ...baseScope(), window_role: "prompt" };
    const r = ScopeSchema.safeParse(scope);
    expect(r.success).toBe(false);
    const issues = !r.success ? r.error.issues : [];
    expect(
      issues.some((i) => i.path.includes("continuation_target_window")),
    ).toBe(true);
  });

  it("accepts prompt scope with continuation_target_window [5, 8]", () => {
    const r = ScopeSchema.safeParse(promptScope());
    expect(r.success).toBe(true);
  });

  it("accepts prompt scope with continuation_target_window starting at 1", () => {
    const scope = { ...baseScope(), window_role: "prompt" as const, continuation_target_window: [1, 4] as [number, number] };
    const r = ScopeSchema.safeParse(scope);
    expect(r.success).toBe(true);
  });
});

// ─── ScopeSchema — continuation_target requires paired_prompt_record_id ───────

describe("ScopeSchema — continuation_target → paired_prompt_record_id required", () => {
  it("REJECTS continuation_target scope missing paired_prompt_record_id", () => {
    const scope = { ...baseScope(), window_role: "continuation_target" };
    const r = ScopeSchema.safeParse(scope);
    expect(r.success).toBe(false);
    const issues = !r.success ? r.error.issues : [];
    expect(
      issues.some((i) => i.path.includes("paired_prompt_record_id")),
    ).toBe(true);
  });

  it("accepts continuation_target scope with paired_prompt_record_id", () => {
    const r = ScopeSchema.safeParse(continuationScope());
    expect(r.success).toBe(true);
  });

  it("REJECTS continuation_target with empty paired_prompt_record_id", () => {
    const scope = {
      ...baseScope(),
      window_role: "continuation_target" as const,
      paired_prompt_record_id: "",
    };
    const r = ScopeSchema.safeParse(scope);
    expect(r.success).toBe(false);
  });
});

// ─── ScopeSchema — standalone requires neither ────────────────────────────────

describe("ScopeSchema — standalone requires neither field", () => {
  it("accepts standalone scope with no pair fields", () => {
    const r = ScopeSchema.safeParse(standaloneScope());
    expect(r.success).toBe(true);
  });

  it("accepts standalone scope with musical_phrase_label (allowed)", () => {
    const scope = {
      ...standaloneScope(),
      musical_phrase_label: "complete A theme",
      natural_phrase_boundary: true,
    };
    const r = ScopeSchema.safeParse(scope);
    expect(r.success).toBe(true);
  });
});

// ─── ScopeSchema — optional pair-metadata fields ──────────────────────────────

describe("ScopeSchema — optional pair-metadata fields", () => {
  it("accepts musical_phrase_label on any scope", () => {
    const scope = { ...baseScope(), musical_phrase_label: "theme A" };
    const r = ScopeSchema.safeParse(scope);
    expect(r.success).toBe(true);
  });

  it("accepts natural_phrase_boundary=false", () => {
    const scope = { ...baseScope(), natural_phrase_boundary: false };
    const r = ScopeSchema.safeParse(scope);
    expect(r.success).toBe(true);
  });

  it("REJECTS musical_phrase_label as empty string", () => {
    const scope = { ...baseScope(), musical_phrase_label: "" };
    const r = ScopeSchema.safeParse(scope);
    expect(r.success).toBe(false);
  });
});

// ─── makeRecordSchema — scope validation propagates ───────────────────────────

describe("makeRecordSchema — scope validation propagates", () => {
  const strictSchema = makeRecordSchema({ allow_placeholders: false });

  function minimalRecord(scope: Record<string, unknown>) {
    return {
      id: "test:v1",
      schema_version: "jam-actions-v0/1.0.0",
      provenance: {
        source_url: "https://example.com",
        source_collected_at: "2026-05-16",
        source_type: "transcribed-by-author",
        composition_title: "Test",
        composer: "Test Composer",
        composition_year: 1800,
        composition_pd_status_us: "public_domain",
        composition_pd_status_eu: "public_domain",
        arrangement_creator: "Test Arranger",
        arrangement_license: "CC-BY-SA",
        arrangement_license_version: null,
        arrangement_evidence_url: "https://example.com",
        record_verdict: "public_candidate",
        verdict_reason: "Test",
        verifier: "test",
        verified_at: "2026-05-16",
        training_use_permitted: true,
      },
      scope,
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
              velocity: 50,
              channel: 0,
              hand: "right",
              measure: 1,
              beat: 0,
            },
          ],
        },
        tokens_remi: ["Bar_1", "Position_0", "Pitch_60", "Velocity_48", "Duration_1"],
        tokens_abc: "X:1\nT:Test\nM:4/4\nL:1/16\nQ:1/4=120\nK:C\n|C|\n",
        piano_roll_svg_path: "pianoroll/test.svg",
        piano_roll_svg_inline: "<svg></svg>",
      },
      annotation_target: {
        measure_range: [1, 4],
        structure: "Test structure",
        key_moments: ["m1 test"],
        teaching_goals: ["test goal"],
        style_tips: ["test tip"],
        teaching_notes: [{ measure: 1, note: "test note" }],
      },
      target_trace: {
        task_family: "analyze-and-play-phrase",
        objective: "Test objective.",
        session: [{ turn: 1, role: "user", content: "Test." }],
      },
      eval_metadata: {
        split: "train",
        split_strategy: "stratified by (composer, composition_id) with MIDI byte-hash dedup",
        leakage_check: "pending",
        eval_eligibility: ["E1_tool_use"],
        phrase_continuation_eligible: false,
      },
    };
  }

  it("record with prompt scope + continuation_target_window passes strict schema", () => {
    const r = strictSchema.safeParse(minimalRecord(promptScope()));
    expect(r.success).toBe(true);
  });

  it("record with continuation_target scope + paired_prompt_record_id passes strict schema", () => {
    const r = strictSchema.safeParse(minimalRecord(continuationScope()));
    expect(r.success).toBe(true);
  });

  it("record with standalone scope passes strict schema", () => {
    const r = strictSchema.safeParse(minimalRecord(standaloneScope()));
    expect(r.success).toBe(true);
  });

  it("record with no scope window_role passes strict schema (backward compat)", () => {
    const r = strictSchema.safeParse(minimalRecord(baseScope()));
    expect(r.success).toBe(true);
  });

  it("record with prompt scope but MISSING continuation_target_window FAILS strict schema", () => {
    const scope = { ...baseScope(), window_role: "prompt" };
    const r = strictSchema.safeParse(minimalRecord(scope));
    expect(r.success).toBe(false);
  });

  it("record with continuation_target scope but MISSING paired_prompt_record_id FAILS strict schema", () => {
    const scope = { ...baseScope(), window_role: "continuation_target" };
    const r = strictSchema.safeParse(minimalRecord(scope));
    expect(r.success).toBe(false);
  });
});
