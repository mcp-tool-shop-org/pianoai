// ─── Acoustic schema tests ───────────────────────────────────────────────────
//
// The impersonation guard is the load-bearing one: schema_version must be
// jam-actions-acoustic-v0, never jam-actions-v0.

import { describe, it, expect } from "vitest";
import {
  ACOUSTIC_SCHEMA_VERSION,
  AcousticRecordSchema,
  DEFAULT_ACOUSTIC_THRESHOLDS,
  PERTURBATION_KINDS,
  parseAcousticRecord,
} from "./schema.js";
import { buildRecord, fixturePhrase } from "./builder.js";

describe("schema id", () => {
  it("is jam-actions-acoustic-v0/1.0.0, not the DOI corpus", () => {
    expect(ACOUSTIC_SCHEMA_VERSION).toBe("jam-actions-acoustic-v0/1.0.0");
    expect(ACOUSTIC_SCHEMA_VERSION).not.toMatch(/^jam-actions-v0\//);
  });

  it("rejects a record that impersonates jam-actions-v0", () => {
    const rec = buildRecord(fixturePhrase(), { seed: 1, kind: "clean" });
    const fake = { ...rec, schema_version: "jam-actions-v0/1.0.0" };
    const result = AcousticRecordSchema.safeParse(fake);
    expect(result.success).toBe(false);
  });
});

describe("thresholds", () => {
  it("defaults are the gates this arc actually enforces", () => {
    expect(DEFAULT_ACOUSTIC_THRESHOLDS).toEqual({
      timing_ms: 40,
      pitch_fail_cents: 50,
      pitch_warn_cents: 25,
      onset_delta: 0.15,
      min_duration_sec: 0.05,
    });
  });

  it("every built record states those thresholds", () => {
    const rec = parseAcousticRecord(
      buildRecord(fixturePhrase(), { seed: 2, kind: "sharp_60" }),
    );
    expect(rec.observation.thresholds).toEqual(DEFAULT_ACOUSTIC_THRESHOLDS);
    expect(rec.observation.gold.thresholds).toEqual(DEFAULT_ACOUSTIC_THRESHOLDS);
  });
});

describe("nine kinds", () => {
  it("lists exactly the constructible golds", () => {
    expect(PERTURBATION_KINDS).toEqual([
      "clean", "sharp_60", "sharp_30", "late_80", "late_25",
      "dropped", "extra", "vibrato", "silence",
    ]);
  });
});
