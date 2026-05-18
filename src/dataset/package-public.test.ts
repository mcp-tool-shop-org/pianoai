// ─── package-public.test.ts ───────────────────────────────────────────────────
//
// Tests for src/dataset/package-public.ts (Slice 10 — public-subset packager
// library). Uses fixture-based unit tests, no real corpus reads. The CLI script
// at scripts/package-jam-actions-public.ts is the thin I/O layer; tests focus
// on the pure-data transforms (filter, splits, JSONL, manifest, checksums,
// pair completeness, idempotency).
//
// All filesystem writes (if any) go under os.tmpdir().
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  buildChecksumsManifest,
  buildCitationCff,
  buildLicenseDataset,
  buildManifest,
  buildReadme,
  buildRecordsJsonl,
  buildSplitIndex,
  countPairs,
  filterProvenanceVerification,
  filterSplitsToPublic,
  findPairOrphans,
  formatJson,
  publicIdSet,
  selectPublicRecords,
  sha256Hex,
  type PackageSplits,
  type SourceProvenanceVerification,
  type SourceRecord,
  type SourceSplits,
} from "./package-public.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeRecord(
  id: string,
  verdict: "public" | "internal" | "excluded" | "public_candidate",
  songId: string,
  windowRole: "prompt" | "continuation_target" | "standalone" | undefined,
  extra: Partial<SourceRecord["scope"]> = {},
): SourceRecord {
  return {
    id,
    schema_version: "jam-actions-v0/1.0.0",
    provenance: {
      record_verdict: verdict,
      verdict_reason: `fixture verdict_reason for ${id}`,
      verified_at: "2026-05-17",
      arrangement_evidence_url: "http://piano-midi.de/test.htm",
    },
    scope: {
      song_id: songId,
      window_role: windowRole,
      ...extra,
    },
  };
}

function makeSplits(train: string[], test: string[]): SourceSplits {
  return {
    strategy: "stratified-composer-composition",
    test_song_count: 1,
    test_pct: 8,
    pair_locked: true,
    held_out_song: "clair-de-lune",
    held_out_rationale: "Debussy distinct style era",
    test,
    train,
  };
}

const PROMPT_A = makeRecord("songA:m001-004:piano:mcp-session:v1", "public", "songA", "prompt", {
  continuation_target_window: [5, 8],
});
const CONT_A = makeRecord("songA:m005-008:piano:mcp-session:v1", "public", "songA", "continuation_target", {
  paired_prompt_record_id: "songA:m001-004:piano:mcp-session:v1",
});
const PROMPT_B = makeRecord("songB:m001-004:piano:mcp-session:v1", "public", "songB", "prompt", {
  continuation_target_window: [5, 8],
});
const CONT_B = makeRecord("songB:m005-008:piano:mcp-session:v1", "public", "songB", "continuation_target", {
  paired_prompt_record_id: "songB:m001-004:piano:mcp-session:v1",
});
const STANDALONE_C = makeRecord("songC:m001-008:piano:mcp-session:v1", "public", "songC", "standalone");

const INTERNAL_X = makeRecord("songX:m001-004:piano:mcp-session:v1", "internal", "songX", "prompt", {
  continuation_target_window: [5, 8],
});
const INTERNAL_X_CONT = makeRecord("songX:m005-008:piano:mcp-session:v1", "internal", "songX", "continuation_target", {
  paired_prompt_record_id: "songX:m001-004:piano:mcp-session:v1",
});

const PUBLIC_FIVE = [PROMPT_B, PROMPT_A, CONT_B, CONT_A, STANDALONE_C]; // intentionally unsorted
const MIXED_SEVEN = [...PUBLIC_FIVE, INTERNAL_X, INTERNAL_X_CONT];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("selectPublicRecords", () => {
  it("filters to public verdict only and sorts by id ascending", () => {
    const out = selectPublicRecords(MIXED_SEVEN);
    expect(out).toHaveLength(5);
    expect(out.map((r) => r.id)).toEqual([
      "songA:m001-004:piano:mcp-session:v1",
      "songA:m005-008:piano:mcp-session:v1",
      "songB:m001-004:piano:mcp-session:v1",
      "songB:m005-008:piano:mcp-session:v1",
      "songC:m001-008:piano:mcp-session:v1",
    ]);
    for (const r of out) {
      expect(r.provenance.record_verdict).toBe("public");
    }
  });

  it("excludes public_candidate, internal, and excluded verdicts", () => {
    const candidate = makeRecord("songY:m001-004:piano:mcp-session:v1", "public_candidate", "songY", "standalone");
    const excluded = makeRecord("songZ:m001-004:piano:mcp-session:v1", "excluded", "songZ", "standalone");
    const out = selectPublicRecords([...MIXED_SEVEN, candidate, excluded]);
    expect(out).toHaveLength(5);
    expect(out.find((r) => r.id.startsWith("songY"))).toBeUndefined();
    expect(out.find((r) => r.id.startsWith("songZ"))).toBeUndefined();
  });
});

describe("findPairOrphans", () => {
  it("returns empty for a well-formed public set", () => {
    expect(findPairOrphans(PUBLIC_FIVE)).toEqual([]);
  });

  it("detects an orphan prompt whose continuation_target is missing", () => {
    // Remove CONT_A; PROMPT_A should now be flagged.
    const broken = PUBLIC_FIVE.filter((r) => r.id !== CONT_A.id);
    const orphans = findPairOrphans(broken);
    expect(orphans).toContain(PROMPT_A.id);
  });

  it("detects an orphan continuation_target whose paired prompt is missing", () => {
    const broken = PUBLIC_FIVE.filter((r) => r.id !== PROMPT_A.id);
    const orphans = findPairOrphans(broken);
    expect(orphans).toContain(CONT_A.id);
  });

  it("treats standalone records as never orphaned", () => {
    expect(findPairOrphans([STANDALONE_C])).toEqual([]);
  });
});

describe("countPairs", () => {
  it("counts prompts as pair_count and standalones as standalone_count", () => {
    const counts = countPairs(PUBLIC_FIVE);
    expect(counts.pair_count).toBe(2); // PROMPT_A, PROMPT_B
    expect(counts.standalone_count).toBe(1); // STANDALONE_C
  });
});

describe("filterSplitsToPublic and buildSplitIndex", () => {
  it("filters source splits to public ids, sorts ascending", () => {
    const src = makeSplits(
      [PROMPT_B.id, PROMPT_A.id, INTERNAL_X.id, CONT_A.id, CONT_B.id, STANDALONE_C.id, INTERNAL_X_CONT.id],
      [],
    );
    const publicRecords = selectPublicRecords(MIXED_SEVEN);
    const idSet = publicIdSet(publicRecords);
    const pkg = filterSplitsToPublic(src, idSet);
    expect(pkg.train).toEqual([
      PROMPT_A.id,
      CONT_A.id,
      PROMPT_B.id,
      CONT_B.id,
      STANDALONE_C.id,
    ].sort());
    expect(pkg.test).toEqual([]);
    expect(pkg.held_out_song).toBe("clair-de-lune");
    expect(pkg.pair_locked).toBe(true);
  });

  it("buildSplitIndex maps every id to its split", () => {
    const pkg: PackageSplits = {
      strategy: "x",
      test_song_count: 1,
      test_pct: 8,
      pair_locked: true,
      held_out_song: "songC",
      held_out_rationale: "fixture",
      train: [PROMPT_A.id, CONT_A.id],
      test: [STANDALONE_C.id],
    };
    const idx = buildSplitIndex(pkg);
    expect(idx.get(PROMPT_A.id)).toBe("train");
    expect(idx.get(CONT_A.id)).toBe("train");
    expect(idx.get(STANDALONE_C.id)).toBe("test");
    expect(idx.get("unknown")).toBeUndefined();
  });
});

describe("buildRecordsJsonl", () => {
  it("produces one JSON object per line, sorted by id, with split field", () => {
    const publicRecords = selectPublicRecords(PUBLIC_FIVE);
    const pkgSplits = filterSplitsToPublic(
      makeSplits(publicRecords.map((r) => r.id), []),
      publicIdSet(publicRecords),
    );
    const idx = buildSplitIndex(pkgSplits);
    const jsonl = buildRecordsJsonl(publicRecords, idx);
    const lines = jsonl.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(5);
    // First line is the lowest-id record.
    const first = JSON.parse(lines[0]);
    expect(first.id).toBe(PROMPT_A.id);
    expect(first.split).toBe("train");
    // Each line is parseable JSON and has split appended.
    for (const line of lines) {
      const obj = JSON.parse(line);
      expect(obj).toHaveProperty("id");
      expect(obj).toHaveProperty("schema_version");
      expect(obj).toHaveProperty("split");
      expect(["train", "test"]).toContain(obj.split);
    }
    // Trailing newline.
    expect(jsonl.endsWith("\n")).toBe(true);
  });

  it("preserves source-record fields verbatim (no re-derivation)", () => {
    const publicRecords = selectPublicRecords(PUBLIC_FIVE);
    const idx = buildSplitIndex(
      filterSplitsToPublic(
        makeSplits(publicRecords.map((r) => r.id), []),
        publicIdSet(publicRecords),
      ),
    );
    const jsonl = buildRecordsJsonl(publicRecords, idx);
    const lines = jsonl.split("\n").filter((l) => l.length > 0);
    const promptALine = JSON.parse(lines.find((l) => l.includes(PROMPT_A.id))!);
    // verdict_reason / verified_at preserved exactly from fixture.
    expect(promptALine.provenance.verdict_reason).toBe(`fixture verdict_reason for ${PROMPT_A.id}`);
    expect(promptALine.provenance.verified_at).toBe("2026-05-17");
    expect(promptALine.provenance.arrangement_evidence_url).toBe("http://piano-midi.de/test.htm");
  });

  it("throws if a record is missing from the splits index", () => {
    const publicRecords = selectPublicRecords(PUBLIC_FIVE);
    const partial = new Map<string, "train" | "test">();
    partial.set(PROMPT_A.id, "train"); // only one
    expect(() => buildRecordsJsonl(publicRecords, partial)).toThrow(/not present in splits index/);
  });
});

describe("buildManifest", () => {
  it("builds a manifest with the exact required shape", () => {
    const publicRecords = selectPublicRecords(PUBLIC_FIVE);
    const pkgSplits = filterSplitsToPublic(
      makeSplits(publicRecords.map((r) => r.id), []),
      publicIdSet(publicRecords),
    );
    const m = buildManifest({
      today: "2026-05-17",
      sourceCommit: "abc1234",
      sourceTag: "jam-actions-v0-public-2026-05-17",
      packageVersion: "0.1.0",
      publicRecords,
      pkgSplits,
    });
    expect(m.dataset_name).toBe("jam-actions-v0-public");
    expect(m.version).toBe("0.1.0");
    expect(m.built_at).toBe("2026-05-17");
    expect(m.source_dataset).toBe("jam-actions-v0");
    expect(m.source_commit).toBe("abc1234");
    expect(m.license).toBe("CC-BY-SA-3.0-DE");
    expect(m.license_url).toBe("https://creativecommons.org/licenses/by-sa/3.0/de/");
    expect(m.record_count).toBe(5);
    expect(m.pair_count).toBe(2);
    expect(m.standalone_count).toBe(1);
    expect(m.songs_count).toBe(3);
    expect(m.songs_included).toEqual(["songA", "songB", "songC"]); // sorted
    expect(m.splits).toEqual({ train: 5, test: 0 });
    expect(m.verdict_summary).toEqual({ public: 5 });
    // instrument_surfaces has ai_jam_sessions but NOT vocal_synth_engine.
    expect(m.instrument_surfaces).toHaveProperty("ai_jam_sessions");
    expect(m.instrument_surfaces).not.toHaveProperty("vocal_synth_engine" as any);
    expect(m.checksums_file).toBe("checksums.sha256");
  });
});

describe("filterProvenanceVerification", () => {
  it("keeps only songs with post_verdict === 'public' and rebuilds summary", () => {
    const src: SourceProvenanceVerification = {
      slice: "jam-actions-v0/slice2.5",
      verified_at: "2026-05-17",
      politeness_defaults: { rate_limit_ms: 1000 },
      total_candidates: 10,
      songs: [
        { song_id: "a", post_verdict: "public", records_count: 16 } as any,
        { song_id: "b", post_verdict: "internal", records_count: 14 } as any,
        { song_id: "c", post_verdict: "public", records_count: 12 } as any,
      ],
      summary: { promoted_to_public: 2, demoted_to_internal: 1 },
    };
    const out = filterProvenanceVerification(src);
    expect(out.songs).toHaveLength(2);
    expect(out.songs.map((s) => s.song_id)).toEqual(["a", "c"]);
    expect(out.total_candidates).toBe(2);
    expect((out.summary as any).record_level_counts.public).toBe(28);
    expect((out.summary as any).record_level_counts.internal).toBe(0);
    expect((out.summary as any).demoted_to_internal).toBe(0);
  });
});

describe("buildChecksumsManifest", () => {
  it("produces sha256sum-compatible output (two-space separator, sorted by path)", () => {
    const files = [
      { relPath: "zeta.txt", content: "zeta\n" },
      { relPath: "alpha.txt", content: "alpha\n" },
      { relPath: "mid/file.json", content: '{"x":1}\n' },
    ];
    const out = buildChecksumsManifest(files);
    const lines = out.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(3);
    // Sorted by path.
    expect(lines[0].endsWith("  alpha.txt")).toBe(true);
    expect(lines[1].endsWith("  mid/file.json")).toBe(true);
    expect(lines[2].endsWith("  zeta.txt")).toBe(true);
    // Each line: <64-hex>  <path>
    for (const line of lines) {
      expect(line).toMatch(/^[0-9a-f]{64} {2}\S/);
    }
    // Trailing newline.
    expect(out.endsWith("\n")).toBe(true);
    // SHA-256 of "alpha\n" is deterministic.
    expect(lines[0].slice(0, 64)).toBe(sha256Hex("alpha\n"));
  });

  it("refuses to include checksums.sha256 in its own listing", () => {
    expect(() =>
      buildChecksumsManifest([{ relPath: "checksums.sha256", content: "x" }]),
    ).toThrow(/must not be in the input list/);
  });

  it("rejects backslash paths (POSIX-style required)", () => {
    expect(() =>
      buildChecksumsManifest([{ relPath: "records\\foo.json", content: "x" }]),
    ).toThrow(/forward slashes/);
  });
});

describe("idempotency / reproducibility", () => {
  it("buildRecordsJsonl is byte-identical across two runs with the same inputs", () => {
    const publicRecords = selectPublicRecords(PUBLIC_FIVE);
    const splits = filterSplitsToPublic(
      makeSplits(publicRecords.map((r) => r.id), []),
      publicIdSet(publicRecords),
    );
    const idx = buildSplitIndex(splits);
    const a = buildRecordsJsonl(publicRecords, idx);
    const b = buildRecordsJsonl(publicRecords, idx);
    expect(a).toBe(b);
  });

  it("buildManifest is byte-identical when --today is pinned", () => {
    const publicRecords = selectPublicRecords(PUBLIC_FIVE);
    const splits = filterSplitsToPublic(
      makeSplits(publicRecords.map((r) => r.id), []),
      publicIdSet(publicRecords),
    );
    const a = formatJson(
      buildManifest({
        today: "2026-05-17",
        sourceCommit: "abc",
        sourceTag: "tag",
        packageVersion: "0.1.0",
        publicRecords,
        pkgSplits: splits,
      }),
    );
    const b = formatJson(
      buildManifest({
        today: "2026-05-17",
        sourceCommit: "abc",
        sourceTag: "tag",
        packageVersion: "0.1.0",
        publicRecords,
        pkgSplits: splits,
      }),
    );
    expect(a).toBe(b);
  });

  it("buildChecksumsManifest is byte-identical across two runs (deterministic sort)", () => {
    const files = [
      { relPath: "b.txt", content: "b" },
      { relPath: "a.txt", content: "a" },
    ];
    const a = buildChecksumsManifest(files);
    const b = buildChecksumsManifest(files);
    expect(a).toBe(b);
  });

  it("README, CITATION, LICENSE are pure deterministic functions of their inputs", () => {
    const r1 = buildReadme({
      packageVersion: "0.1.0",
      today: "2026-05-17",
      recordCount: 115,
      trainCount: 103,
      testCount: 12,
      testSong: "clair-de-lune",
      songCount: 8,
      songsIncluded: ["a", "b"],
      sourceCommit: "abc",
      sourceTag: "tag",
    });
    const r2 = buildReadme({
      packageVersion: "0.1.0",
      today: "2026-05-17",
      recordCount: 115,
      trainCount: 103,
      testCount: 12,
      testSong: "clair-de-lune",
      songCount: 8,
      songsIncluded: ["a", "b"],
      sourceCommit: "abc",
      sourceTag: "tag",
    });
    expect(r1).toBe(r2);
    // YAML frontmatter must start at first line.
    expect(r1.startsWith("---\n")).toBe(true);
    // License slug uses HF-enumerated form.
    expect(r1).toContain("license: cc-by-sa-3.0");

    const c1 = buildCitationCff({ version: "0.1.0", dateReleased: "2026-05-17" });
    const c2 = buildCitationCff({ version: "0.1.0", dateReleased: "2026-05-17" });
    expect(c1).toBe(c2);
    expect(c1).toContain("cff-version: 1.2.0");
    expect(c1).toContain('license: "CC-BY-SA-3.0-DE"');

    const l1 = buildLicenseDataset();
    const l2 = buildLicenseDataset();
    expect(l1).toBe(l2);
    expect(l1).toContain("CC-BY-SA-3.0-DE");
  });

  it("two consecutive runs produce byte-identical artifacts in a tmp dir (smoke)", () => {
    // Smoke test: write a synthetic set of plan files to tmp twice; compare byte streams.
    const dirA = mkdtempSync(join(tmpdir(), "jam-pkg-test-A-"));
    const dirB = mkdtempSync(join(tmpdir(), "jam-pkg-test-B-"));
    try {
      const publicRecords = selectPublicRecords(PUBLIC_FIVE);
      const splits = filterSplitsToPublic(
        makeSplits(publicRecords.map((r) => r.id), []),
        publicIdSet(publicRecords),
      );
      const idx = buildSplitIndex(splits);
      const recordsJsonl = buildRecordsJsonl(publicRecords, idx);
      const manifest = formatJson(
        buildManifest({
          today: "2026-05-17",
          sourceCommit: "abc",
          sourceTag: "tag",
          packageVersion: "0.1.0",
          publicRecords,
          pkgSplits: splits,
        }),
      );
      const cs = buildChecksumsManifest([
        { relPath: "records.jsonl", content: recordsJsonl },
        { relPath: "manifest.json", content: manifest },
      ]);
      for (const dir of [dirA, dirB]) {
        writeFileSync(join(dir, "records.jsonl"), recordsJsonl, "utf8");
        writeFileSync(join(dir, "manifest.json"), manifest, "utf8");
        writeFileSync(join(dir, "checksums.sha256"), cs, "utf8");
      }
      expect(existsSync(join(dirA, "records.jsonl"))).toBe(true);
      const a1 = readFileSync(join(dirA, "records.jsonl"));
      const b1 = readFileSync(join(dirB, "records.jsonl"));
      expect(a1.equals(b1)).toBe(true);
      const a2 = readFileSync(join(dirA, "manifest.json"));
      const b2 = readFileSync(join(dirB, "manifest.json"));
      expect(a2.equals(b2)).toBe(true);
      const a3 = readFileSync(join(dirA, "checksums.sha256"));
      const b3 = readFileSync(join(dirB, "checksums.sha256"));
      expect(a3.equals(b3)).toBe(true);
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });
});

describe("sha256Hex", () => {
  it("matches a known reference (empty string)", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("matches a known reference ('abc')", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
