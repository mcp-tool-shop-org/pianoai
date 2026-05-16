// ─── schema-placeholder.test.ts ──────────────────────────────────────────────
//
// Tests for placeholder rejection in the Slice 3 schema update:
//   - `{ todo: "..." }` in tokens_remi MUST fail strict validation.
//   - `{ todo: "..." }` in tokens_abc MUST fail strict validation.
//   - The same record passes when allow_placeholders: true.
//   - Real tokens pass strict validation.
//   - All 3 pilot records pass strict validation.
//
// The pilot record JSON files are loaded from disk (built by build-pilot-records.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  makeRecordSchema,
  RecordSchema,
  RealRemiTokensSchema,
  RealAbcTokensSchema,
  PlaceholderSchema,
} from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const RECORDS_DIR = join(REPO_ROOT, "datasets/jam-actions-v0/records");

// ─── Minimal placeholder record factory ──────────────────────────────────────

/** Build a minimal valid record with real tokens. */
function minimalRealRecord() {
  return {
    id: "test-record:v1",
    schema_version: "jam-actions-v0/1.0.0",
    provenance: {
      source_url: "https://example.com",
      source_collected_at: "2026-05-16",
      source_type: "transcribed-by-author",
      composition_title: "Test Piece",
      composer: "Test Composer",
      composition_year: 1800,
      composition_pd_status_us: "public_domain",
      composition_pd_status_eu: "public_domain",
      arrangement_creator: "Test Arranger",
      arrangement_license: "CC-BY-SA",
      arrangement_license_version: null,
      arrangement_evidence_url: "https://example.com",
      record_verdict: "public_candidate",
      verdict_reason: "Test verdict reason",
      verifier: "test",
      verified_at: "2026-05-16",
      training_use_permitted: true,
    },
    scope: {
      song_id: "test-song",
      phrase_window: "measures 1-4",
      instrument: "piano",
      key: "C major",
      tempo_bpm: 120,
      time_signature: "4/4",
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
      session: [{ turn: 1, role: "user", content: "Test prompt." }],
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

// ─── Helper ───────────────────────────────────────────────────────────────────

function withTokens(
  remi: unknown,
  abc: unknown,
) {
  const record = minimalRealRecord();
  (record.observation as any).tokens_remi = remi;
  (record.observation as any).tokens_abc = abc;
  return record;
}

// ─── Placeholder schema unit tests ───────────────────────────────────────────

describe("PlaceholderSchema", () => {
  it("accepts { todo: 'message' }", () => {
    const r = PlaceholderSchema.safeParse({ todo: "do this later" });
    expect(r.success).toBe(true);
  });

  it("rejects empty todo string", () => {
    const r = PlaceholderSchema.safeParse({ todo: "" });
    expect(r.success).toBe(false);
  });

  it("rejects plain string", () => {
    const r = PlaceholderSchema.safeParse("real token string");
    expect(r.success).toBe(false);
  });
});

describe("RealRemiTokensSchema", () => {
  it("accepts a non-empty array of strings", () => {
    const r = RealRemiTokensSchema.safeParse(["Bar_1", "Pitch_60"]);
    expect(r.success).toBe(true);
  });

  it("rejects an empty array", () => {
    const r = RealRemiTokensSchema.safeParse([]);
    expect(r.success).toBe(false);
  });

  it("rejects placeholder object", () => {
    const r = RealRemiTokensSchema.safeParse({ todo: "implement me" });
    expect(r.success).toBe(false);
  });
});

describe("RealAbcTokensSchema", () => {
  it("accepts a non-empty string", () => {
    const r = RealAbcTokensSchema.safeParse("X:1\nT:Test\n|C4|\n");
    expect(r.success).toBe(true);
  });

  it("rejects an empty string", () => {
    const r = RealAbcTokensSchema.safeParse("");
    expect(r.success).toBe(false);
  });

  it("rejects placeholder object", () => {
    const r = RealAbcTokensSchema.safeParse({ todo: "implement me" });
    expect(r.success).toBe(false);
  });
});

// ─── makeRecordSchema strict mode (no placeholders) ──────────────────────────

describe("makeRecordSchema({ allow_placeholders: false }) — strict mode", () => {
  const strictSchema = makeRecordSchema({ allow_placeholders: false });

  it("accepts a record with real tokens", () => {
    const record = minimalRealRecord();
    const result = strictSchema.safeParse(record);
    expect(result.success).toBe(true);
  });

  it("REJECTS a record with REMI placeholder { todo: '...' }", () => {
    const record = withTokens({ todo: "wire in Slice 3" }, "X:1\nT:Test\n|C|\n");
    const result = strictSchema.safeParse(record);
    expect(result.success).toBe(false);
    const issues = !result.success ? result.error.issues : [];
    expect(issues.some((i) => i.path.includes("tokens_remi"))).toBe(true);
  });

  it("REJECTS a record with ABC placeholder { todo: '...' }", () => {
    const record = withTokens(["Bar_1", "Pitch_60"], { todo: "wire in Slice 3" });
    const result = strictSchema.safeParse(record);
    expect(result.success).toBe(false);
    const issues = !result.success ? result.error.issues : [];
    expect(issues.some((i) => i.path.includes("tokens_abc"))).toBe(true);
  });

  it("REJECTS a record with BOTH placeholders", () => {
    const record = withTokens(
      { todo: "REMI todo" },
      { todo: "ABC todo" },
    );
    const result = strictSchema.safeParse(record);
    expect(result.success).toBe(false);
  });
});

// ─── makeRecordSchema({ allow_placeholders: true }) ──────────────────────────

describe("makeRecordSchema({ allow_placeholders: true }) — permissive mode", () => {
  const permissiveSchema = makeRecordSchema({ allow_placeholders: true });

  it("accepts real tokens", () => {
    const result = permissiveSchema.safeParse(minimalRealRecord());
    expect(result.success).toBe(true);
  });

  it("accepts REMI placeholder { todo: '...' }", () => {
    const record = withTokens({ todo: "wire in Slice 3" }, "X:1\nT:Test\n|C|\n");
    const result = permissiveSchema.safeParse(record);
    expect(result.success).toBe(true);
  });

  it("accepts ABC placeholder { todo: '...' }", () => {
    const record = withTokens(["Bar_1"], { todo: "wire in Slice 3" });
    const result = permissiveSchema.safeParse(record);
    expect(result.success).toBe(true);
  });

  it("accepts both placeholders (Slice 1 legacy shape)", () => {
    const slice1Shape = {
      todo: "Install MidiTok (Python) or a JS REMI implementation. Out of Slice 1 scope per kickoff — wire in Slice 3.",
    };
    const record = withTokens(slice1Shape, slice1Shape);
    const result = permissiveSchema.safeParse(record);
    expect(result.success).toBe(true);
  });
});

// ─── Default RecordSchema still accepts placeholders (backward compat) ────────

describe("RecordSchema (default — backward compatible)", () => {
  it("still accepts placeholder objects (union includes placeholder branch)", () => {
    const record = withTokens({ todo: "old" }, { todo: "old" });
    const result = RecordSchema.safeParse(record);
    // The default schema uses union (includes placeholder branch) — backward compat.
    expect(result.success).toBe(true);
  });
});

// ─── Pilot record regression tests ───────────────────────────────────────────

describe("Pilot records — strict validation (no placeholders)", () => {
  const strictSchema = makeRecordSchema({ allow_placeholders: false });

  function loadRecord(filename: string) {
    const path = join(RECORDS_DIR, filename);
    return JSON.parse(readFileSync(path, "utf8"));
  }

  it("fur-elise-m001-008.json passes strict validation", () => {
    const record = loadRecord("fur-elise-m001-008.json");
    const result = strictSchema.safeParse(record);
    if (!result.success) {
      console.error("Strict validation issues:", JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("bach-prelude-c-major-bwv846-m001-004.json passes strict validation", () => {
    const record = loadRecord("bach-prelude-c-major-bwv846-m001-004.json");
    const result = strictSchema.safeParse(record);
    if (!result.success) {
      console.error("Strict validation issues:", JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("mozart-k545-mvt1-m001-004.json passes strict validation", () => {
    const record = loadRecord("mozart-k545-mvt1-m001-004.json");
    const result = strictSchema.safeParse(record);
    if (!result.success) {
      console.error("Strict validation issues:", JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("fur-elise record has real REMI tokens (array of strings, not placeholder)", () => {
    const record = loadRecord("fur-elise-m001-008.json");
    expect(Array.isArray(record.observation.tokens_remi)).toBe(true);
    expect((record.observation.tokens_remi as string[]).length).toBeGreaterThan(0);
    expect(typeof record.observation.tokens_remi[0]).toBe("string");
  });

  it("fur-elise record has real ABC tokens (non-empty string, not placeholder)", () => {
    const record = loadRecord("fur-elise-m001-008.json");
    expect(typeof record.observation.tokens_abc).toBe("string");
    expect((record.observation.tokens_abc as string).length).toBeGreaterThan(0);
  });

  it("fur-elise record has REMI Bar_ tokens for correct measures", () => {
    const record = loadRecord("fur-elise-m001-008.json");
    const tokens: string[] = record.observation.tokens_remi;
    expect(tokens).toContain("Bar_1");
    expect(tokens).toContain("Bar_8");
  });

  it("bach record has REMI tokens for 4 bars", () => {
    const record = loadRecord("bach-prelude-c-major-bwv846-m001-004.json");
    const tokens: string[] = record.observation.tokens_remi;
    const barTokens = tokens.filter((t) => t.startsWith("Bar_"));
    expect(barTokens).toContain("Bar_1");
    expect(barTokens).toContain("Bar_4");
    expect(barTokens.length).toBe(4);
  });

  it("mozart record has REMI tokens for 4 bars", () => {
    const record = loadRecord("mozart-k545-mvt1-m001-004.json");
    const tokens: string[] = record.observation.tokens_remi;
    const barTokens = tokens.filter((t) => t.startsWith("Bar_"));
    expect(barTokens).toContain("Bar_1");
    expect(barTokens).toContain("Bar_4");
  });

  it("all 3 records have real ABC strings (start with X:1)", () => {
    const files = [
      "fur-elise-m001-008.json",
      "bach-prelude-c-major-bwv846-m001-004.json",
      "mozart-k545-mvt1-m001-004.json",
    ];
    for (const file of files) {
      const record = loadRecord(file);
      expect(typeof record.observation.tokens_abc).toBe("string");
      expect(record.observation.tokens_abc).toContain("X:1");
    }
  });
});
