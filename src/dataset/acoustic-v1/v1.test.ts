import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineTask, publishedOwner, assertNoStraddle } from "../experiment/index.js";
import { v1Records, coverageV1Task } from "./task.js";
import {
  rederiveGold,
  toolSequenceOf,
  f5DropStats,
  USER_TURN_FORMAT,
  userTurnNamesClosedSet,
  sameKeyPairCount,
  testSongIds,
  acousticAssistantContent,
  compareAssistantContent,
  harmonyAssistantContent,
  parseCompareAssistant,
  parseHarmonyAssistant,
  chromaticRatioOf,
  compareGoldFromPrinted,
  consonanceInside,
  fidelitySame,
  harmonyGoldFromPrinted,
} from "./builder.js";
import {
  F5_KINDS,
  F5_PITCH_CLEARANCE_MULTIPLE,
  F5_ONSET_CLEARANCE_MULTIPLE,
  F5_THRESHOLDS,
  F5_SHARP_CENTS_MIN,
  F5_SHARP_CENTS_MAX,
  F5_INSIDE_CENTS_MIN,
  F5_INSIDE_CENTS_MAX,
  F5_LATE_MS_MIN,
  F5_LATE_MS_MAX,
  F5_INSIDE_MS_MIN,
  F5_INSIDE_MS_MAX,
  F5_INSIDE_ONSET_MARGIN_MS,
  onsetFailsGate,
  centsFailsGate,
  rederiveF5Measurements,
  parseAcousticAssistant,
  round1,
} from "./f5-acoustic.js";
import { DEFAULT_MAX_CHROMATIC_RATIO } from "../../maker/verify-harmony.js";
import {
  MEASURED_YIN_LOCKED_P95_CENTS,
  MEASURED_ONSET_ABS_P95_MS,
  V1_PITCH_FAIL_CENTS,
  V1_PITCH_CLEARANCE_CENTS,
  V1_TIMING_MS,
  V1_ONSET_CLEARANCE_MS,
} from "./tracker-error.js";
import { coverageReport, assertCoverageFloors } from "./coverage.js";
import { loadPublishableSongs } from "./library.js";
import {
  COVERAGE_FLOORS,
  PROMPT_VISIBLE_PATHS,
  RECORD_ONLY_PATHS,
  V1_SCHEMA_VERSION,
  type V1Record,
} from "./schema.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 300_000 });

// ─── Two kinds of test, two costs ────────────────────────────────────────────
//
// Structural tests — schema, floors, prompt gates, split, provenance — assert
// properties of the corpus that SHIPS, so they read the committed
// records.jsonl. Milliseconds.
//
// Engine tests rebuild the corpus from source and re-run every engine: 81
// acoustic records each render a take and run YIN and onset detection over it.
// 22 s on this rig. Under coverage instrumentation, which counts every branch
// inside those tight DSP loops, the same work measured 200 s for the build and
// 166 s + 110 s for the two verification tests — a 10x penalty that no timeout
// budget survives on a CI runner. So the engine block is skipped when
// SKIP_DSP_VERIFICATION=1, which only the "Test with coverage" step sets, and
// which runs on a job that has ALREADY run this whole file uninstrumented
// seconds earlier. Correctness runs on every push, twice. The coverage leg goes
// back to measuring coverage.
//
// That is a stated trade, not a quiet one: a gate that skips under one flag on
// one leg is written down here and in ci.yml, and it still bites on two legs
// per push.
const RUN_DSP = process.env.SKIP_DSP_VERIFICATION !== "1";

const CORPUS = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..",
  "datasets", "jam-actions-v1",
);

let committedCache: V1Record[] | null = null;
/** The corpus as committed — the artifact that ships, not a rebuild of it. */
function committedRecords(): V1Record[] {
  if (!committedCache) {
    committedCache = readFileSync(join(CORPUS, "records.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as V1Record);
  }
  return committedCache;
}

describe("v1 schema spine", () => {
  it("declares a new schemaVersion and rejects reuse of v0's", () => {
    expect(V1_SCHEMA_VERSION).toBe("jam-actions-v1/1.0.0");
    expect(publishedOwner(V1_SCHEMA_VERSION)).toBe("coverage-v1");
    expect(coverageV1Task.id).toBe("coverage-v1");
    expect(coverageV1Task.schemaVersion).not.toBe("jam-actions-acoustic-v0/1.0.0");
    expect(() =>
      defineTask({
        id: "someone-else",
        schemaVersion: "jam-actions-acoustic-v0/1.0.0",
        verdicts: ["x"],
        thresholds: {},
        cases: () => [],
        splitKey: () => "a",
      }),
    ).toThrow(/published by task "acoustic-sft"/);
  });

  it("keeps prompt-visible and record-only paths distinct", () => {
    expect([...PROMPT_VISIBLE_PATHS]).toEqual(["target_trace"]);
    expect([...RECORD_ONLY_PATHS]).toContain("observation.gold");
    expect([...RECORD_ONLY_PATHS]).toContain("observation.thresholds");
  });

  it("every committed record carries the v1 schema version", () => {
    const records = committedRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const r of records) expect(r.schema_version, r.id).toBe(V1_SCHEMA_VERSION);
  });
});

describe("v1 coverage floors", () => {
  it("meets tools > 9, songs > 24, shapes > 7, no majority shape", () => {
    const report = coverageReport(committedRecords());
    const songs = loadPublishableSongs();
    report.genres = [...new Set(songs.map((s) => s.genre))].sort();
    report.genre_count = report.genres.length;
    expect(COVERAGE_FLOORS.tools).toBe(9);
    expect(COVERAGE_FLOORS.songs).toBe(24);
    expect(COVERAGE_FLOORS.shapes).toBe(7);
    expect(report.tool_count).toBeGreaterThan(COVERAGE_FLOORS.tools);
    expect(report.song_count).toBeGreaterThan(COVERAGE_FLOORS.songs);
    expect(report.shape_count).toBeGreaterThan(COVERAGE_FLOORS.shapes);
    expect(report.majority_shape_share).toBeLessThanOrEqual(0.5);
    expect(() => assertCoverageFloors(report)).not.toThrow();
  });
});

describe("prompt-visible fields contain no gates", () => {
  it("user turns and tool results do not mention threshold field names", () => {
    const records = committedRecords();
    for (const r of records) {
      const visible = JSON.stringify(r.target_trace);
      expect(visible, r.id).not.toMatch(/pitch_fail_cents|pitch_warn_cents|timing_ms|onset_delta/);
      expect(visible, r.id).not.toContain('"thresholds"');
      const user = r.target_trace.session.filter((t) => t.role === "user").map((t) => t.content).join("\n");
      // Closed-set families name the vocabulary in the user turn (chunk 22 B1).
      // The gold token is one of the listed answers, not leaked as unique.
      if (!userTurnNamesClosedSet(r.family) && r.observation.gold.answer.length > 3) {
        expect(user, r.id).not.toContain(r.observation.gold.answer);
      }
    }
  });
});

describe("v1 user turns name the answer shape (chunk 22 B1)", () => {
  it("matches a per-family format pattern", () => {
    for (const r of committedRecords()) {
      const user = r.target_trace.session.filter((t) => t.role === "user").map((t) => t.content).join("\n");
      const spec = USER_TURN_FORMAT[r.family as keyof typeof USER_TURN_FORMAT];
      expect(spec, r.family).toBeDefined();
      expect(user, r.id).toMatch(spec.pattern);
    }
  });
});

function walkNumbers(node: unknown, path: string, out: Array<{ path: string; n: number }>): void {
  if (typeof node === "number" && Number.isFinite(node)) {
    out.push({ path, n: node });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((x, i) => walkNumbers(x, `${path}[${i}]`, out));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walkNumbers(v, path ? `${path}.${k}` : k, out);
    }
  }
}

describe("v1 prompt-visible floats are instrument resolution (chunk 22 B2)", () => {
  it("has no prompt-visible float with more than one decimal", () => {
    for (const r of committedRecords()) {
      const nums: Array<{ path: string; n: number }> = [];
      walkNumbers(r.target_trace, "target_trace", nums);
      for (const { path, n } of nums) {
        const places = JSON.stringify(n).split(".")[1]?.length ?? 0;
        expect(places, `${r.id} ${path} = ${n}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps full precision on acoustic observation measurements", () => {
    const rows = committedRecords().filter((r) => r.family === "acoustic");
    expect(rows.some((r) => {
      const a = r.observation.acoustic as { measured_cents: number };
      const t = scoreTakeContent(r).cents_from_target as number;
      return a.measured_cents !== t;
    })).toBe(true);
    for (const r of rows) {
      const a = r.observation.acoustic as { measured_cents: number; measured_onset_ms: number; measured_f0_hz: number };
      const t = scoreTakeContent(r);
      expect(round1(a.measured_cents), r.id).toBe(t.cents_from_target);
      expect(round1(a.measured_onset_ms), r.id).toBe(t.onset_ms);
      expect(round1(a.measured_f0_hz), r.id).toBe(t.f0_hz);
    }
  });
});

describe("v1 acoustic assistant comparison (chunk 22 B3)", () => {
  it("renders the arithmetic line with the subtraction before the word", () => {
    const line = acousticAssistantContent(56.4, 13.5, "pitch_fail");
    expect(line).toBe(
      "cents 56.4: |56.4| \u2212 50 = 6.4, against the gate; onset 13.5: |13.5| \u2212 40 = \u221226.5, inside: pitch_fail",
    );
    const parsed = parseAcousticAssistant(line);
    expect(parsed).toEqual({
      cents: 56.4,
      onset: 13.5,
      d: 6.4,
      e: -26.5,
      pitchWord: "against the gate",
      onsetWord: "inside",
      label: "pitch_fail",
    });
  });

  it("parses as arithmetic: X,Y match the tool; D,E match the subtraction; words match predicates", () => {
    const rows = committedRecords().filter((r) => r.family === "acoustic");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const last = [...r.target_trace.session].reverse().find((t) => t.role === "assistant");
      expect(last, r.id).toBeDefined();
      const line = (last as { content: string }).content;
      const parsed = parseAcousticAssistant(line);
      expect(parsed, `${r.id} ${line}`).not.toBeNull();
      expect(parsed!.label, r.id).toBe(r.observation.gold.answer);
      const t = scoreTakeContent(r);
      expect(parsed!.cents, r.id).toBe(t.cents_from_target);
      expect(parsed!.onset, r.id).toBe(t.onset_ms);
      expect(parsed!.d, r.id).toBe(round1(Math.abs(parsed!.cents) - 50));
      expect(parsed!.e, r.id).toBe(round1(Math.abs(parsed!.onset) - 40));
      expect(parsed!.pitchWord, r.id).toBe(centsFailsGate(parsed!.cents) ? "against the gate" : "inside");
      expect(parsed!.onsetWord, r.id).toBe(onsetFailsGate(parsed!.onset) ? "against the gate" : "inside");
    }
  });
});

function leafDiff(a: unknown, b: unknown, path: string, out: string[]): void {
  if (Object.is(a, b)) return;
  if (typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= 1e-6) return;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    out.push(path);
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      out.push(path);
      return;
    }
    a.forEach((x, i) => leafDiff(x, b[i], `${path}[${i}]`, out));
    return;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) leafDiff(ao[k], bo[k], path ? `${path}.${k}` : k, out);
}

describe("acoustic flag variants differ only in the last assistant turn", () => {
  it("plain-comparison differs in 162 acoustic assistant leaves", () => {
    const committed = committedRecords();
    const acousticN = committed.filter((r) => r.family === "acoustic").length;
    expect(acousticN).toBe(162);
    const diffs: string[] = [];
    for (const r of committed) {
      if (r.family !== "acoustic") continue;
      const t = scoreTakeContent(r);
      const next = acousticAssistantContent(t.cents_from_target as number, t.onset_ms as number, r.observation.gold.answer, "comparison");
      const copy = structuredClone(r);
      const last = [...copy.target_trace.session].reverse().find((x) => x.role === "assistant") as { content: string };
      last.content = next;
      leafDiff(r, copy, r.id, diffs);
    }
    expect(diffs.length).toBe(acousticN);
    expect(diffs.every((d) => d.endsWith(".content"))).toBe(true);
  });

  it("bare-label differs only in the last assistant leaf of acoustic, harmony, and compare", () => {
    const committed = committedRecords();
    const n = committed.filter((r) => r.family === "acoustic" || r.family === "harmony" || r.family === "compare").length;
    expect(n).toBeGreaterThan(162);
    const diffs: string[] = [];
    for (const r of committed) {
      let next: string | null = null;
      if (r.family === "acoustic") {
        const t = scoreTakeContent(r);
        next = acousticAssistantContent(t.cents_from_target as number, t.onset_ms as number, r.observation.gold.answer, "bare");
      } else if (r.family === "harmony") {
        const t = harmonyToolContent(r);
        next = harmonyAssistantContent(t.intended, t.detected, t.chromatic, t.scored, r.observation.gold.answer, true);
      } else if (r.family === "compare") {
        const t = compareToolContent(r);
        next = compareAssistantContent(t.key_a, t.key_b, r.observation.gold.answer, true);
      } else {
        continue;
      }
      const copy = structuredClone(r);
      const last = [...copy.target_trace.session].reverse().find((x) => x.role === "assistant") as { content: string };
      last.content = next;
      leafDiff(r, copy, r.id, diffs);
    }
    expect(diffs.length).toBe(n);
    expect(diffs.every((d) => d.endsWith(".content"))).toBe(true);
  });
});

describe("gold re-derived for every non-acoustic record", () => {
  // Every family except acoustic re-derives from MIDI, metadata or the
  // ensemble's intent channel — cheap, deterministic, and run on every leg.
  // The acoustic family renders audio and is in the engine block below.
  it("agrees with the engine that produced it", () => {
    const rows = committedRecords().filter((r) => r.family !== "acoustic");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(rederiveGold(r), r.id).toBe(r.observation.gold.answer);
    }
  });
});

describe("split", () => {
  it("does not let a splitKey straddle train/test", () => {
    assertNoStraddle(
      committedRecords(),
      (c) => coverageV1Task.splitKey(c),
      (c) => c.split,
    );
  });
});

describe("shapes are counted from traces", () => {
  it("has more than one family of tool sequences", () => {
    const shapes = new Set(committedRecords().map(toolSequenceOf));
    expect(shapes.size).toBeGreaterThan(3);
  });
});

function lastAssistant(r: V1Record): string {
  const last = [...r.target_trace.session].reverse().find((t) => t.role === "assistant");
  return (last as { content: string }).content;
}

function harmonyToolContent(r: V1Record): { intended: string; detected: string; chromatic: number; scored: number } {
  const turn = r.target_trace.session.find((t) => t.role === "tool" && t.tool === "verify_harmony");
  expect(turn, r.id).toBeDefined();
  return (turn as { content: { intended: string; detected: string; chromatic: number; scored: number } }).content;
}

function compareToolContent(r: V1Record): { key_a: string; key_b: string } {
  const turn = r.target_trace.session.find((t) => t.role === "tool" && t.tool === "compare_songs");
  expect(turn, r.id).toBeDefined();
  return (turn as { content: { key_a: string; key_b: string } }).content;
}

describe("F1 harmony", () => {
  it("re-derives the gate and populates both classes", () => {
    const rows = committedRecords().filter((r) => r.family === "harmony");
    const pass = rows.filter((r) => r.observation.gold.answer === "verified");
    const fail = rows.filter((r) => r.observation.gold.answer === "rejected");
    expect(pass.length).toBeGreaterThan(3);
    expect(fail.length).toBeGreaterThan(3);
    for (const r of rows) expect(rederiveGold(r), r.id).toBe(r.observation.gold.answer);
  });

  it("renders the shown-work line with fidelity and the chromatic subtraction", () => {
    const line = harmonyAssistantContent("C", "C", 0, 4, "verified");
    expect(line).toBe(
      "intended C, detected C: same; chromatic 0/4 = 0.000 \u2212 0.2 = \u22120.200, inside: verified",
    );
    const parsed = parseHarmonyAssistant(line);
    expect(parsed).toEqual({
      intended: "C",
      detected: "C",
      fidWord: "same",
      chromatic: 0,
      scored: 4,
      ratio: 0,
      delta: -0.2,
      consWord: "inside",
      label: "verified",
    });
  });

  it("parses as quantities then comparison then label; quantities equal the tool; label equals gold and the predicates", () => {
    const rows = committedRecords().filter((r) => r.family === "harmony");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const t = harmonyToolContent(r);
      const parsed = parseHarmonyAssistant(lastAssistant(r));
      expect(parsed, `${r.id} ${lastAssistant(r)}`).not.toBeNull();
      expect(parsed!.intended, r.id).toBe(t.intended);
      expect(parsed!.detected, r.id).toBe(t.detected);
      expect(parsed!.chromatic, r.id).toBe(t.chromatic);
      expect(parsed!.scored, r.id).toBe(t.scored);
      expect(parsed!.ratio, r.id).toBe(Math.round(chromaticRatioOf(t.chromatic, t.scored) * 1000) / 1000);
      expect(parsed!.delta, r.id).toBe(Math.round((parsed!.ratio - DEFAULT_MAX_CHROMATIC_RATIO) * 1000) / 1000);
      expect(parsed!.fidWord, r.id).toBe(fidelitySame(parsed!.intended, parsed!.detected) ? "same" : "different");
      expect(parsed!.consWord, r.id).toBe(consonanceInside(parsed!.chromatic, parsed!.scored) ? "inside" : "against");
      const gold = harmonyGoldFromPrinted(parsed!.intended, parsed!.detected, parsed!.chromatic, parsed!.scored);
      expect(parsed!.label, r.id).toBe(gold);
      expect(parsed!.label, r.id).toBe(r.observation.gold.answer);
    }
  });

  it("tool turns carry measurements only — no gate, no comparison word, no class word", () => {
    for (const r of committedRecords().filter((x) => x.family === "harmony")) {
      const tools = r.target_trace.session.filter((t) => t.role === "tool");
      for (const t of tools) {
        const blob = JSON.stringify(t.content);
        expect(blob, r.id).not.toMatch(/verified|rejected|maxChromatic|0\.2|"same"|"different"/);
      }
    }
  });
});

describe("compare shown work (chunk 34 C1)", () => {
  it("renders both keys, the comparison, and the label", () => {
    const line = compareAssistantContent("Eb major", "F major", "different_key");
    expect(line).toBe("Eb major, F major: different: different_key");
    expect(parseCompareAssistant(line)).toEqual({
      keyA: "Eb major",
      keyB: "F major",
      word: "different",
      label: "different_key",
    });
    expect(compareAssistantContent("Eb major", "Eb major", "same_key")).toBe(
      "Eb major, Eb major: same: same_key",
    );
  });

  it("parses as quantities then comparison then label; keys equal the tool; label equals gold and the predicate", () => {
    const rows = committedRecords().filter((r) => r.family === "compare");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const t = compareToolContent(r);
      const parsed = parseCompareAssistant(lastAssistant(r));
      expect(parsed, `${r.id} ${lastAssistant(r)}`).not.toBeNull();
      expect(parsed!.keyA, r.id).toBe(t.key_a);
      expect(parsed!.keyB, r.id).toBe(t.key_b);
      expect(parsed!.word, r.id).toBe(t.key_a === t.key_b ? "same" : "different");
      expect(parsed!.label, r.id).toBe(compareGoldFromPrinted(parsed!.keyA, parsed!.keyB));
      expect(parsed!.label, r.id).toBe(r.observation.gold.answer);
      const infos = r.target_trace.session.filter((x) => x.role === "tool" && x.tool === "song_info");
      expect(infos).toHaveLength(2);
      expect((infos[0] as { content: { key: string } }).content.key, r.id).toBe(t.key_a);
      expect((infos[1] as { content: { key: string } }).content.key, r.id).toBe(t.key_b);
    }
  });

  it("takes every same-key pair the split allows, matched with an equal number of different-key pairs", () => {
    const songs = loadPublishableSongs();
    const testIds = testSongIds(songs);
    const train = songs.filter((s) => !testIds.has(s.id));
    const test = songs.filter((s) => testIds.has(s.id));
    const rows = committedRecords().filter((r) => r.family === "compare");
    const trainRows = rows.filter((r) => r.split === "train");
    const testRows = rows.filter((r) => r.split === "test");
    expect(trainRows.filter((r) => r.observation.gold.answer === "same_key").length).toBe(sameKeyPairCount(train));
    expect(trainRows.filter((r) => r.observation.gold.answer === "different_key").length).toBe(sameKeyPairCount(train));
    expect(testRows.filter((r) => r.observation.gold.answer === "same_key").length).toBe(sameKeyPairCount(test));
    expect(testRows.filter((r) => r.observation.gold.answer === "different_key").length).toBe(sameKeyPairCount(test));
  });

  it("tool turns carry the keys only — no comparison word, no class word", () => {
    for (const r of committedRecords().filter((x) => x.family === "compare")) {
      const tools = r.target_trace.session.filter((t) => t.role === "tool");
      for (const t of tools) {
        const blob = JSON.stringify(t.content);
        expect(blob, r.id).not.toMatch(/same_key|different_key|"same"|"different"/);
      }
    }
  });
});

describe("F5 acoustic — the guard bands", () => {
  it("clears the stated multiple of the measured tracker error", () => {
    expect(committedRecords().some((r) => r.family === "acoustic")).toBe(true);
    expect(F5_THRESHOLDS.pitch_clearance_multiple).toBeCloseTo(F5_PITCH_CLEARANCE_MULTIPLE, 1);
    expect(F5_THRESHOLDS.onset_clearance_multiple).toBeCloseTo(F5_ONSET_CLEARANCE_MULTIPLE, 1);
    expect(F5_THRESHOLDS.pitch_clearance_cents).toBeGreaterThan(
      MEASURED_YIN_LOCKED_P95_CENTS * (F5_THRESHOLDS.pitch_clearance_multiple as number) * 0.99,
    );
    expect(F5_THRESHOLDS.onset_clearance_ms).toBeGreaterThan(
      MEASURED_ONSET_ABS_P95_MS * (F5_THRESHOLDS.onset_clearance_multiple as number) * 0.99,
    );
  });

  it("exposes no gate in any acoustic prompt", () => {
    for (const r of committedRecords().filter((r) => r.family === "acoustic")) {
      expect(JSON.stringify(r.target_trace), r.id).not.toMatch(/pitch_fail_cents|timing_ms/);
    }
  });
});

function scoreTakeContent(r: V1Record): { f0_hz: unknown; cents_from_target: unknown; onset_ms: unknown } {
  const turn = r.target_trace.session.find((t) => t.role === "tool" && t.tool === "score_audio_take");
  expect(turn, r.id).toBeDefined();
  return (turn as { content: { f0_hz: unknown; cents_from_target: unknown; onset_ms: unknown } }).content;
}

describe("F5 acoustic — prompt-visible measurements (chunk 18)", () => {
  const KIND_TOKEN = new RegExp(`\\b(${F5_KINDS.join("|")})\\b`);

  it("serialises no perturbation-kind token in any prompt-visible field", () => {
    for (const r of committedRecords()) {
      expect(JSON.stringify(r.target_trace), r.id).not.toMatch(KIND_TOKEN);
    }
  });

  it("puts a real number in every score_audio_take measurement field", () => {
    const rows = committedRecords().filter((r) => r.family === "acoustic");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const c = scoreTakeContent(r);
      expect(typeof c.f0_hz, `${r.id} f0_hz`).toBe("number");
      expect(Number.isFinite(c.f0_hz as number), `${r.id} f0_hz finite`).toBe(true);
      expect(typeof c.cents_from_target, `${r.id} cents`).toBe("number");
      expect(Number.isFinite(c.cents_from_target as number), `${r.id} cents finite`).toBe(true);
      expect(typeof c.onset_ms, `${r.id} onset`).toBe("number");
      expect(Number.isFinite(c.onset_ms as number), `${r.id} onset finite`).toBe(true);
    }
  });

  it("has f0_hz that varies across records", () => {
    const rows = committedRecords().filter((r) => r.family === "acoustic");
    const hz = rows.map((r) => scoreTakeContent(r).f0_hz as number);
    expect(new Set(hz.map((x) => x.toFixed(6))).size).toBeGreaterThan(1);
  });

  it("names the verdict set in every acoustic user turn, equal to the family's golds", () => {
    const rows = committedRecords().filter((r) => r.family === "acoustic");
    const golds = [...new Set(rows.map((r) => r.observation.gold.answer))].sort();
    expect(golds.length).toBeGreaterThanOrEqual(2);
    for (const r of rows) {
      const user = r.target_trace.session.filter((t) => t.role === "user").map((t) => t.content).join("\n");
      const named = [...new Set(user.match(/\b(?:match|pitch_fail|timing_fail)\b/g) ?? [])].sort();
      expect(named, r.id).toEqual(golds);
    }
  });
});

describe("F5 acoustic — gate-only magnitudes (chunk 20)", () => {
  function acousticOf(r: V1Record) {
    return r.observation.acoustic as {
      kind: (typeof F5_KINDS)[number];
      cents_shift: number;
      delay_sec: number;
    };
  }

  it("has two draws per class per song", () => {
    const rows = committedRecords().filter((r) => r.family === "acoustic");
    expect(rows.length).toBe(27 * 3 * 2);
    expect(rows.filter((r) => r.split === "test").length).toBe(9 * 3 * 2);
  });

  it("has distinct onsets within each class; no single-onset class", () => {
    const rows = committedRecords().filter((r) => r.family === "acoustic");
    expect(rows.length).toBeGreaterThan(0);
    const byKind = new Map<string, number[]>();
    for (const r of rows) {
      const k = acousticOf(r).kind;
      if (!byKind.has(k)) byKind.set(k, []);
      byKind.get(k)!.push(scoreTakeContent(r).onset_ms as number);
    }
    for (const [kind, onsets] of byKind) {
      const distinct = new Set(onsets.map((o) => o.toFixed(1)));
      expect(distinct.size, kind).toBeGreaterThan(1);
      // SuperFlux hop ≈ 11.6 ms caps distinct bins in a short window; n-1 is
      // the bar when the span can occupy it, otherwise every hop in the span.
      const span = Math.max(...onsets) - Math.min(...onsets);
      const hops = Math.max(2, Math.floor(span / 11.6) + 1);
      expect(distinct.size, kind).toBeGreaterThanOrEqual(Math.min(onsets.length - 1, hops));
    }
  });

  it("has both cents signs in every class, train and test", () => {
    const rows = committedRecords().filter((r) => r.family === "acoustic");
    for (const kind of F5_KINDS) {
      for (const side of ["train", "test"] as const) {
        const cents = rows
          .filter((r) => acousticOf(r).kind === kind && r.split === side)
          .map((r) => scoreTakeContent(r).cents_from_target as number);
        expect(cents.some((c) => c > 0), `${kind} ${side} +`).toBe(true);
        expect(cents.some((c) => c < 0), `${kind} ${side} −`).toBe(true);
      }
    }
  });

  it("clears its class gate by the stated multiple and sits inside the other", () => {
    const rows = committedRecords().filter((r) => r.family === "acoustic");
    for (const r of rows) {
      const a = acousticOf(r);
      const c = scoreTakeContent(r);
      const mag = Math.abs(c.cents_from_target as number);
      const onset = c.onset_ms as number;
      const delayMs = a.delay_sec * 1000;
      if (a.kind === "sharp_fail") {
        expect(Math.abs(a.cents_shift), r.id).toBeGreaterThanOrEqual(F5_SHARP_CENTS_MIN);
        expect(Math.abs(a.cents_shift), r.id).toBeLessThanOrEqual(F5_SHARP_CENTS_MAX);
        expect(mag, r.id).toBeGreaterThan(V1_PITCH_FAIL_CENTS);
        expect(mag - V1_PITCH_FAIL_CENTS, r.id).toBeGreaterThanOrEqual(V1_PITCH_CLEARANCE_CENTS * 0.5);
        expect(delayMs, r.id).toBeGreaterThanOrEqual(F5_INSIDE_MS_MIN);
        expect(delayMs, r.id).toBeLessThanOrEqual(F5_INSIDE_MS_MAX);
        expect(Math.abs(onset), r.id).toBeLessThan(V1_TIMING_MS);
      } else if (a.kind === "late_fail") {
        expect(delayMs, r.id).toBeGreaterThanOrEqual(F5_LATE_MS_MIN);
        expect(delayMs, r.id).toBeLessThanOrEqual(F5_LATE_MS_MAX);
        expect(Math.abs(onset), r.id).toBeGreaterThan(V1_TIMING_MS);
        expect(Math.abs(a.cents_shift), r.id).toBeGreaterThanOrEqual(F5_INSIDE_CENTS_MIN);
        expect(Math.abs(a.cents_shift), r.id).toBeLessThanOrEqual(F5_INSIDE_CENTS_MAX);
        expect(mag, r.id).toBeLessThan(V1_PITCH_FAIL_CENTS);
      } else {
        expect(Math.abs(a.cents_shift), r.id).toBeGreaterThanOrEqual(F5_INSIDE_CENTS_MIN);
        expect(Math.abs(a.cents_shift), r.id).toBeLessThanOrEqual(F5_INSIDE_CENTS_MAX);
        expect(mag, r.id).toBeLessThan(V1_PITCH_FAIL_CENTS);
        expect(delayMs, r.id).toBeGreaterThanOrEqual(F5_INSIDE_MS_MIN);
        expect(delayMs, r.id).toBeLessThanOrEqual(F5_INSIDE_MS_MAX);
        expect(Math.abs(onset), r.id).toBeLessThan(V1_TIMING_MS);
      }
    }
  });

  it("keeps non-timing |onset| inside 40−margin and timing |onset| past the two-sided gate", () => {
    const rows = committedRecords().filter((r) => r.family === "acoustic");
    for (const r of rows) {
      const onset = scoreTakeContent(r).onset_ms as number;
      const mag = Math.abs(onset);
      const kind = acousticOf(r).kind;
      if (kind === "late_fail") {
        expect(mag, r.id).toBeGreaterThan(V1_TIMING_MS);
        expect(acousticOf(r).delay_sec * 1000, r.id).toBeGreaterThanOrEqual(V1_TIMING_MS + V1_ONSET_CLEARANCE_MS);
      } else {
        expect(mag, r.id).toBeLessThan(V1_TIMING_MS - F5_INSIDE_ONSET_MARGIN_MS);
      }
    }
  });

  it("has within-class spread exceeding 10× tracker p95 on the defining axis", () => {
    const rows = committedRecords().filter((r) => r.family === "acoustic");
    const byKind = new Map<string, V1Record[]>();
    for (const r of rows) {
      const k = acousticOf(r).kind;
      if (!byKind.has(k)) byKind.set(k, []);
      byKind.get(k)!.push(r);
    }
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    const sharp = (byKind.get("sharp_fail") ?? []).map((r) => Math.abs(scoreTakeContent(r).cents_from_target as number));
    const late = (byKind.get("late_fail") ?? []).map((r) => scoreTakeContent(r).onset_ms as number);
    const matchC = (byKind.get("clean") ?? []).map((r) => scoreTakeContent(r).cents_from_target as number);
    const matchO = (byKind.get("clean") ?? []).map((r) => scoreTakeContent(r).onset_ms as number);
    const sharpO = (byKind.get("sharp_fail") ?? []).map((r) => scoreTakeContent(r).onset_ms as number);
    expect(sharp.length).toBeGreaterThan(3);
    expect(late.length).toBeGreaterThan(3);
    expect(matchC.length).toBeGreaterThan(3);
    expect(spread(sharp)).toBeGreaterThan(10 * MEASURED_YIN_LOCKED_P95_CENTS);
    expect(spread(matchC)).toBeGreaterThan(10 * MEASURED_YIN_LOCKED_P95_CENTS);
    // Late band was pulled toward the gate; 10× onset p95 (280 ms) no longer fits.
    expect(spread(late)).toBeGreaterThan(2 * MEASURED_ONSET_ABS_P95_MS);
    expect(spread(matchO)).toBeGreaterThan(1);
    expect(spread(sharpO)).toBeGreaterThan(1);
  });
});

describe("F6 ensemble", () => {
  it("serialises no createTapOutput and no live-graph types", () => {
    const rows = committedRecords().filter((r) => r.family === "ensemble");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const blob = JSON.stringify(r);
      expect(blob, r.id).not.toMatch(/createTapOutput|AudioContext|ScriptProcessor|GainNode|tapBus/);
      expect(rederiveGold(r), r.id).toBe(r.observation.gold.answer);
    }
  });
});

// ─── Provenance exclusions are enforced, not documented ──────────────────────
//
// The first build of this corpus carried 7 records each of Satie's Gymnopédie
// No. 1 and Debussy's Arabesque No. 1 into a tree its own note calls the
// publishable subset. Both had already been excluded from the published
// jam-actions-v0 subset because their arrangement provenance could not be
// verified in the Slice 2.5 audit. The note said the right thing; the code had
// one id in its exclusion list.
//
// Deleting the exclusions left every other test in this file green, which is
// why this one exists. A provenance rule with no test is a comment.
describe("publishable tree excludes what the provenance audit rejected", () => {
  const EXCLUDED = [
    "clair-de-lune",           // jam-actions-v0 fine-tune holdout
    "satie-gymnopedie-no1",    // arrangement provenance unverified
    "debussy-arabesque-no1",   // same audit, same finding
  ] as const;

  it("names all three in FORBIDDEN_IDS, so the list cannot quietly shrink", () => {
    for (const id of EXCLUDED) {
      expect(loadPublishableSongs().some((s) => s.id === id), id).toBe(false);
    }
  });

  it("has no record touching an excluded work, composite ids included", () => {
    const rows = committedRecords();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const sid = r.scope?.song_id ?? "";
      for (const id of EXCLUDED) {
        // Compare records use a composite "songA|songB" id, so substring is
        // the right check here rather than equality.
        expect(sid.includes(id), `${r.id} references ${id}`).toBe(false);
      }
    }
  });
});

// ─── Gold must vary within a family ──────────────────────────────────────────
//
// Found by the first fine-tune on this corpus, not by any test. Every sections
// record is "0:none" (no song on the publishable shelf has sections) and every
// compare record is "different_key" (every pair happens to differ). A model that
// always emits the constant scores 100% on both, so the majority-class baseline
// IS the ceiling and the family measures nothing. Both passed the coverage
// floors, because they add tools and shapes, and both passed the tool-less
// baseline, because pretraining cannot guess a convention -- which is not the
// same as the question needing a tool. 40 of 305 records, 13 of the held-out
// 100, measure nothing.
//
// The two known cases are named here so the list can only change on purpose.
// Fixing the corpus shrinks it; a new degenerate family grows it; either fails
// this test until someone edits it with intent.
//
// 2026-09-08 this assertion failed. It found three more constant-gold
// families than it was told to name:
//   teaching_cues  every answer is "0"     — the shelf has no teaching cues
//   teaching_note  every answer is "(none)" — same gap
//   server         one train-only record whose answer is "54"
// After the repair, the named list is empty: every remaining family varies.
// The predicate (size < 2, exact equality) is unchanged. Do not put names
// back to make a constant family pass.
describe("gold varies within every scored family", () => {
  const KNOWN_DEGENERATE = [] as const;

  it("names exactly the known constant-gold families, no more and no fewer", () => {
    const byFamily = new Map<string, Set<string>>();
    for (const r of committedRecords()) {
      if (!byFamily.has(r.family)) byFamily.set(r.family, new Set());
      byFamily.get(r.family)!.add(r.observation.gold.answer);
    }
    const degenerate = [...byFamily]
      .filter(([, answers]) => answers.size < 2)
      .map(([f]) => f)
      .sort();
    expect(degenerate).toEqual([...KNOWN_DEGENERATE]);
  });

  it("has at least two gold values in train and in test separately", () => {
    for (const side of ["train", "test"] as const) {
      const byFamily = new Map<string, Set<string>>();
      for (const r of committedRecords().filter((x) => x.split === side)) {
        if (!byFamily.has(r.family)) byFamily.set(r.family, new Set());
        byFamily.get(r.family)!.add(r.observation.gold.answer);
      }
      for (const [family, answers] of byFamily) {
        expect(answers.size, `${family} ${side}`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe("teaching gold is musicalLanguage, not measure-level empty fields", () => {
  it("re-derives teaching_goals and key_moments from musicalLanguage", () => {
    const songs = loadPublishableSongs();
    const byId = new Map(songs.map((s) => [s.id, s]));
    for (const r of committedRecords().filter((x) => x.family === "teaching_goals" || x.family === "key_moments")) {
      const song = byId.get(r.scope.song_id);
      expect(song, r.id).toBeDefined();
      expect(rederiveGold(r), r.id).toBe(r.observation.gold.answer);
      expect(r.observation.gold.engine).toMatch(/musicalLanguage/);
    }
  });
});

// ─── The engine block ────────────────────────────────────────────────────────
//
// Rebuild everything from source and hold it against what is committed. This is
// the reproduction gate and the acoustic half of rule 2 in one pass: if the
// generator no longer produces the committed corpus, or an acoustic label no
// longer agrees with what YIN and the onset detector measure, it fails here.
// Each engine test below re-renders and re-tracks all 81 acoustic takes.
// Measured on the rig after chunk 20 doubled the phrase clock: 36.7 s and
// 36.6 s. On a CI runner that crossed the file's 60 s per-test budget and went
// red while the same suite was green here. The cost is the work we want paid
// for -- every label and every f0 re-derived from a fresh render -- so the
// budget follows the measurement rather than the other way round. This block
// is skipped under coverage, so the number only ever applies to the two plain
// legs.
describe.runIf(RUN_DSP)("engine verification (skipped under SKIP_DSP_VERIFICATION=1)", { timeout: 600_000 }, () => {
  let built: V1Record[] = [];

  beforeAll(() => {
    built = v1Records();
  });

  // Numbers are compared with a tolerance; everything else exactly.
  //
  // Measured 2026-09-08: rebuilding on Node 24 differs from the committed
  // corpus on 3 of 305 records, all in one field -- the YIN cents inside the
  // acoustic tool-result turn -- by 3.8e-13 cents. That is V8's Math.pow and
  // Math.sin changing in the last place between majors, the same class as
  // v0's wav_sha256 finding, and thirteen orders of magnitude under the
  // 5-cent guard band. A byte-exact comparison would fail every engine except
  // the one that generated the corpus and prove nothing about the generator.
  // 1e-6 is six orders under the tracker's own 0.179 c p95 and seven above the
  // observed noise; any real semantic change is far beyond it.
  const NUMERIC_TOLERANCE = 1e-6;
  function expectCloseDeep(a: unknown, b: unknown, path: string): void {
    if (typeof a === "number" && typeof b === "number") {
      expect(Math.abs(a - b), path).toBeLessThanOrEqual(NUMERIC_TOLERANCE);
      return;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      expect(Array.isArray(a) && Array.isArray(b), path).toBe(true);
      expect((a as unknown[]).length, path).toBe((b as unknown[]).length);
      (a as unknown[]).forEach((x, i) => expectCloseDeep(x, (b as unknown[])[i], `${path}[${i}]`));
      return;
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
      const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
      expect(ka, path).toEqual(kb);
      for (const k of ka) expectCloseDeep((a as any)[k], (b as any)[k], `${path}.${k}`);
      return;
    }
    expect(a, path).toBe(b);
  }

  it("rebuilds the committed corpus, exactly except for last-place float noise", () => {
    const committed = committedRecords();
    expect(built.length).toBe(committed.length);
    const byId = new Map(committed.map((r) => [r.id, r]));
    for (const b of built) {
      const c = byId.get(b.id);
      expect(c, b.id).toBeDefined();
      expectCloseDeep(c, b, b.id);
    }
  });

  it("counts every untrackable drop instead of labelling it from the recipe", () => {
    expect(f5DropStats.attempted).toBeGreaterThan(0);
    const acousticKept = committedRecords().filter((r) => r.family === "acoustic").length;
    expect(
      f5DropStats.droppedUntrackable +
        f5DropStats.droppedClearance +
        f5DropStats.droppedShortPhrase +
        acousticKept,
    ).toBe(f5DropStats.attempted);
    // The counter is live: sweeping NOTE_GAP to 0.15 s drops 42 of 81. See
    // docs/findings/v1-f5-untrackable-gate-proved.md.
  });

  it("re-derives every acoustic label from a fresh render and track", () => {
    const rows = committedRecords().filter((r) => r.family === "acoustic");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(rederiveGold(r), r.id).toBe(r.observation.gold.answer);
    }
  });

  it("matches committed f0_hz to a fresh track within 1e-6", () => {
    const rows = committedRecords().filter((r) => r.family === "acoustic");
    for (const r of rows) {
      const a = r.observation.acoustic as {
        kind: (typeof F5_KINDS)[number];
        notes: { midi: number; name: string; time: number; duration: number }[];
        cents_shift: number;
        delay_sec: number;
        measured_f0_hz: number;
      };
      const m = rederiveF5Measurements(a.kind, a.notes, a.cents_shift, a.delay_sec);
      expect(m.f0_hz, r.id).not.toBeNull();
      expect(Math.abs(a.measured_f0_hz - m.f0_hz!), r.id).toBeLessThanOrEqual(1e-6);
      expect(scoreTakeContent(r).f0_hz as number, r.id).toBe(round1(m.f0_hz!));
    }
  });
});
