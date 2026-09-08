// ─── Acoustic corpus builder tests ───────────────────────────────────────────
//
// Gold is a function of (kind, thresholds), not a hand-written string.
// Re-rendering the recipe must match wav_sha256. Traces must pass the
// existing catalog validator — finding that out at J4 is the expensive way.

import { describe, it, expect } from "vitest";
import { validateTrace } from "../trace-validator.js";
import { PERTURBATION_KINDS, parseAcousticRecord, type PerturbationKind } from "./schema.js";
import {
  buildKindSet,
  buildRecord,
  fixturePhrase,
  renderTake,
  sha256Samples,
} from "./builder.js";

const GOLD: Record<PerturbationKind, string> = {
  clean: "match",
  sharp_60: "pitch_fail",
  sharp_30: "pitch_warn",
  late_80: "timing_fail",
  late_25: "timing_pass",
  dropped: "missed",
  extra: "extra",
  vibrato: "in_tune",
  silence: "nothing_to_grade",
};

describe("constructible golds", () => {
  it("maps each of the nine kinds to its gold verdict", () => {
    const phrase = fixturePhrase();
    for (const kind of PERTURBATION_KINDS) {
      const rec = buildRecord(phrase, { seed: 3, kind });
      expect(rec.observation.gold.verdict).toBe(GOLD[kind]);
      expect(rec.observation.perturbation.kind).toBe(kind);
    }
  });

  it("vibrato is in_tune, not unstable, and silence is nothing_to_grade", () => {
    const phrase = fixturePhrase();
    expect(buildRecord(phrase, { seed: 4, kind: "vibrato" }).observation.gold.verdict)
      .toBe("in_tune");
    expect(buildRecord(phrase, { seed: 4, kind: "silence" }).observation.gold.verdict)
      .toBe("nothing_to_grade");
  });
});

describe("reproducibility", () => {
  it("re-rendering the recipe matches wav_sha256", () => {
    const rec = buildRecord(fixturePhrase(), { seed: 11, kind: "sharp_60" });
    const again = renderTake(rec.observation.render.recipe);
    expect(sha256Samples(again)).toBe(rec.observation.render.wav_sha256);
    expect(rec.observation.render.wav_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the same seed and kind produce the same record id and hash", () => {
    const phrase = fixturePhrase();
    const a = buildRecord(phrase, { seed: 8, kind: "late_80" });
    const b = buildRecord(phrase, { seed: 8, kind: "late_80" });
    expect(a.id).toBe(b.id);
    expect(a.observation.render.wav_sha256).toBe(b.observation.render.wav_sha256);
    expect(a.observation.render.recipe.target_index)
      .toBe(b.observation.render.recipe.target_index);
  });

  it("a different seed can pick a different target note", () => {
    const phrase = fixturePhrase();
    const indexes = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
        (seed) => buildRecord(phrase, { seed, kind: "dropped" })
          .observation.perturbation.target_index,
      ),
    );
    expect(indexes.size).toBeGreaterThan(1);
  });
});

describe("envelope and traces", () => {
  it("parses as an acoustic record and does not impersonate jam-actions-v0", () => {
    const rec = parseAcousticRecord(buildRecord(fixturePhrase(), { seed: 1, kind: "clean" }));
    expect(rec.schema_version).toBe("jam-actions-acoustic-v0/1.0.0");
    expect(rec.scope.window_role).toBe("standalone");
    expect(rec.provenance.source_type).toBe("transcribed-by-author");
    expect(rec.observation.render.engine).toBe("fixtures-sine-v1");
    expect(rec.eval_metadata.phrase_continuation_eligible).toBe(false);
  });

  it("every gold trace passes the jam-actions catalog validator", () => {
    const records = buildKindSet(fixturePhrase(), 5);
    expect(records).toHaveLength(9);
    for (const rec of records) {
      const report = validateTrace(rec.target_trace);
      expect(report.ok, report.mismatches.map((m) => m.message).join("; ")).toBe(true);
      expect(report.total_tool_calls).toBeGreaterThan(0);
    }
  });

  it("silence inspects before scoring, and does not treat empty as a zero", () => {
    const rec = buildRecord(fixturePhrase(), { seed: 1, kind: "silence" });
    const tools = rec.target_trace.session
      .filter((t) => t.role === "assistant" && t.tool_calls)
      .flatMap((t) => t.role === "assistant" ? t.tool_calls ?? [] : []);
    expect(tools.map((c) => c.tool)).toContain("analyze_audio");
    expect(tools.map((c) => c.tool)).not.toContain("score_audio_take");
    const last = rec.target_trace.session[rec.target_trace.session.length - 1];
    expect(last!.role).toBe("assistant");
    if (last!.role === "assistant") {
      expect(last.content).toMatch(/nothing to grade/i);
      expect(last.content).toMatch(/wrong answer/i);
    }
  });
});
