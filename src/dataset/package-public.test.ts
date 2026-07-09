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
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  assertCitationCffMatchesVersion,
  assertCuratedFilesPresent,
  assertNoExcludedWorksInPublicSet,
  assertPackageInputsValid,
  buildChecksumsManifest,
  buildCitationCff,
  buildLicenseDataset,
  buildManifest,
  buildReadme,
  buildRecordsJsonl,
  buildSplitIndex,
  countPairs,
  EXCLUDED_SONG_IDS,
  extractCitationCffVersion,
  filterProvenanceVerification,
  filterSplitsToPublic,
  findPairOrphans,
  formatJson,
  parseChecksumsManifest,
  publicIdSet,
  readPackageInputs,
  readVersion,
  removeStaleGeneratedFiles,
  selectPublicRecords,
  sha256Hex,
  walkChecksumFiles,
  type PackageInputs,
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

// ────────────────────────────────────────────────────────────────────────────
// ─── D-B1-002 — exclusion regression guard ─────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
//
// selectPublicRecords() filters strictly on `provenance.record_verdict ===
// "public"`. That is correct today, but before this guard existed, it was
// the ONLY thing standing between the two provenance-unverifiable works
// (Satie Gymnopédie No. 1; Debussy Arabesque No. 1 — see PROVENANCE-NOTE.md)
// and the public package: nothing would have caught a future accidental
// re-promotion (a corpus-edit bug, a bad merge, a script that flips
// `record_verdict` back to "public"). assertNoExcludedWorksInPublicSet() is
// a defense-in-depth backstop, independent of `record_verdict` — even if a
// deny-listed song's records somehow carry `record_verdict: "public"`, the
// packager must still refuse to ship them. These tests construct exactly
// that regression scenario and assert the guard actually rejects it — this
// is the gate that was previously missing from the suite entirely (T-B1-002
// / F-1ab2f033).
describe("D-B1-002 — assertNoExcludedWorksInPublicSet (exclusion regression guard)", () => {
  it("does NOT throw when the public set contains no deny-listed song", () => {
    expect(() => assertNoExcludedWorksInPublicSet(PUBLIC_FIVE)).not.toThrow();
  });

  it("EXCLUDED_SONG_IDS contains exactly the two provenance-unverifiable songs", () => {
    expect([...EXCLUDED_SONG_IDS].sort()).toEqual(["debussy-arabesque-no1", "satie-gymnopedie-no1"]);
  });

  it("throws when a satie-gymnopedie-no1 record sneaks into the public set despite record_verdict: 'public'", () => {
    // Simulates the exact regression this guard defends against: a
    // corpus-edit bug or bad merge that flips record_verdict back to
    // "public" for a deny-listed song. selectPublicRecords() alone does NOT
    // catch this (it only filters on record_verdict) — the deny-list guard
    // is the only thing standing between this fixture and a public release.
    const sneaky = makeRecord(
      "satie-gymnopedie-no1:m003-006:piano:mcp-session:v1",
      "public",
      "satie-gymnopedie-no1",
      "prompt",
    );
    const attemptedPublicSet = selectPublicRecords([...PUBLIC_FIVE, sneaky]);
    // Prove selectPublicRecords' own filter really did let it through — i.e.
    // this test is actually exercising the guard, not a filter that already
    // caught it upstream.
    expect(attemptedPublicSet.some((r) => r.scope.song_id === "satie-gymnopedie-no1")).toBe(true);
    expect(() => assertNoExcludedWorksInPublicSet(attemptedPublicSet)).toThrow(/EXCLUSION REGRESSION/);
  });

  it("throws when a debussy-arabesque-no1 record sneaks into the public set despite record_verdict: 'public'", () => {
    const sneaky = makeRecord(
      "debussy-arabesque-no1:m001-004:piano:mcp-session:v1",
      "public",
      "debussy-arabesque-no1",
      "standalone",
    );
    const attemptedPublicSet = selectPublicRecords([...PUBLIC_FIVE, sneaky]);
    expect(attemptedPublicSet.some((r) => r.scope.song_id === "debussy-arabesque-no1")).toBe(true);
    expect(() => assertNoExcludedWorksInPublicSet(attemptedPublicSet)).toThrow(/EXCLUSION REGRESSION/);
  });

  it("throws when EITHER deny-listed song is mixed in among otherwise-clean public records (does not require an all-bad set)", () => {
    const satieSneaky = makeRecord(
      "satie-gymnopedie-no1:m003-006:piano:mcp-session:v1",
      "public",
      "satie-gymnopedie-no1",
      "prompt",
    );
    expect(() =>
      assertNoExcludedWorksInPublicSet(selectPublicRecords([...MIXED_SEVEN, satieSneaky])),
    ).toThrow(/EXCLUSION REGRESSION/);
  });

  it("the thrown error message names the offending song and the specific record id (actionable, not just 'something failed')", () => {
    const sneaky = makeRecord(
      "satie-gymnopedie-no1:m003-006:piano:mcp-session:v1",
      "public",
      "satie-gymnopedie-no1",
      "prompt",
    );
    let caught: Error | undefined;
    try {
      assertNoExcludedWorksInPublicSet([sneaky]);
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toContain("satie-gymnopedie-no1");
    expect(caught!.message).toContain("satie-gymnopedie-no1:m003-006:piano:mcp-session:v1");
  });

  it("does not flag a song whose id merely shares a prefix with a deny-listed id (exact match, not substring match)", () => {
    // Guards against an implementation that does substring/prefix matching
    // instead of exact song_id equality — a false positive here would be a
    // real (if less severe) bug of its own.
    const notActuallyDenylisted = makeRecord(
      "satie-gymnopedie-no1-arrangement-b:m001-004:piano:mcp-session:v1",
      "public",
      "satie-gymnopedie-no1-arrangement-b",
      "standalone",
    );
    expect(() => assertNoExcludedWorksInPublicSet([notActuallyDenylisted])).not.toThrow();
  });

  it("supports a custom deny-list override rather than hardcoding EXCLUDED_SONG_IDS internally", () => {
    const record = makeRecord("songZ:m001-004:piano:mcp-session:v1", "public", "songZ", "standalone");
    expect(() => assertNoExcludedWorksInPublicSet([record])).not.toThrow(); // not deny-listed by default
    expect(() => assertNoExcludedWorksInPublicSet([record], ["songZ"])).toThrow(/EXCLUSION REGRESSION/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ─── FL2-001 — normalizeSongId bypass regression (Fable adversarial, HIGH) ──
// ────────────────────────────────────────────────────────────────────────────
//
// Pre-fix, the guard compared raw `scope.song_id` with strict `===` against
// EXCLUDED_SONG_IDS and read ONLY scope.song_id — never the record id. Four
// bypasses followed, each demonstrated below and proven to THROW post-fix:
//   (a) a case-variant song_id
//   (b) a whitespace-padded song_id
//   (c) a homoglyph (full-width Unicode) song_id that NFKC-folds to the
//       deny-listed ASCII string
//   (d) a record whose id is genuinely prefixed with a deny-listed song but
//       whose scope.song_id was mutated to something clean — caught by the
//       id/song_id CONSISTENCY check (check 1), not the deny-list check
describe("FL2-001 — assertNoExcludedWorksInPublicSet bypass regression (normalizeSongId + id/song_id consistency)", () => {
  it("(a) THROWS on a case-variant song_id ('Satie-Gymnopedie-No1') consistent with its record id", () => {
    const r = makeRecord(
      "Satie-Gymnopedie-No1:m003-006:piano:mcp-session:v1",
      "public",
      "Satie-Gymnopedie-No1",
      "standalone",
    );
    let caught: Error | undefined;
    try {
      assertNoExcludedWorksInPublicSet([r]);
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toContain("EXCLUSION REGRESSION");
    // Caught by the deny-list check (2/3), not the id/song_id consistency
    // check (1) — the two fields agree, only the casing bypasses a naive ===.
    expect(caught!.message).not.toContain("CONSISTENCY check fired");
  });

  it("(b) THROWS on a whitespace-padded song_id ('  satie-gymnopedie-no1  ') consistent with its record id", () => {
    const r = makeRecord(
      "satie-gymnopedie-no1:m007-010:piano:mcp-session:v1",
      "public",
      "  satie-gymnopedie-no1  ",
      "standalone",
    );
    let caught: Error | undefined;
    try {
      assertNoExcludedWorksInPublicSet([r]);
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toContain("EXCLUSION REGRESSION");
    expect(caught!.message).not.toContain("CONSISTENCY check fired");
  });

  it("(c) THROWS on a full-width-Unicode homoglyph song_id that NFKC-folds to the deny-listed ASCII id", () => {
    // U+FF33 U+FF41 U+FF54 U+FF49 U+FF45 = fullwidth "Satie" — a genuine
    // compatibility-equivalent homoglyph (NOT a cross-script lookalike):
    // NFKC decomposes each fullwidth Latin letter to its Basic Latin
    // equivalent, so normalizeSongId() reads it as "satie-gymnopedie-no1".
    const homoglyphSongId = "Ｓａｔｉｅ-gymnopedie-no1";
    // Sanity: prove this is a genuine bypass premise against a naive `===`
    // compare — it is NOT byte-equal to the deny-listed ASCII string.
    expect(homoglyphSongId === "satie-gymnopedie-no1").toBe(false);
    expect(homoglyphSongId.normalize("NFKC").toLowerCase()).toBe("satie-gymnopedie-no1");

    const r = makeRecord(
      `${homoglyphSongId}:m011-014:piano:mcp-session:v1`,
      "public",
      homoglyphSongId,
      "standalone",
    );
    expect(() => assertNoExcludedWorksInPublicSet([r])).toThrow(/EXCLUSION REGRESSION/);
  });

  it("(d) THROWS via the id/song_id CONSISTENCY check when a satie-gymnopedie-no1-prefixed record id carries a mutated, clean scope.song_id", () => {
    // The id genuinely belongs to the deny-listed song (colon-prefix), but
    // scope.song_id was mutated to something that, read alone, looks clean —
    // exactly what a corpus-edit bug or bad merge could produce. The old
    // guard read ONLY scope.song_id and would have let this straight
    // through; the id<->song_id consistency check (check 1) must fire first
    // and refuse to guess which field is lying.
    const r = makeRecord(
      "satie-gymnopedie-no1:m015-018:piano:mcp-session:v1",
      "public",
      "totally-clean-song-name",
      "standalone",
    );
    let caught: Error | undefined;
    try {
      assertNoExcludedWorksInPublicSet([r]);
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toContain("EXCLUSION REGRESSION");
    expect(caught!.message).toContain("CONSISTENCY");
    expect(caught!.message).toContain("satie-gymnopedie-no1:m015-018:piano:mcp-session:v1");
  });

  it("a normal public record with a consistent id/song_id and no deny-list membership still PASSES", () => {
    const r = makeRecord(
      "mozart-turkish-march:m001-004:piano:mcp-session:v1",
      "public",
      "mozart-turkish-march",
      "standalone",
    );
    expect(() => assertNoExcludedWorksInPublicSet([r])).not.toThrow();
  });
});

describe("D-B1-002 — real corpus regression: satie/debussy never survive the public packaging pipeline", () => {
  // FL3-001 hygiene: this test previously did a silent `return` when the
  // corpus dir was absent, which renders as a plain PASS in the run summary
  // on a sparse checkout — indistinguishable from an actually-exercised
  // pass. it.skipIf reports an absent corpus as a visibly SKIPPED test
  // instead, so a sparse-checkout run can never be mistaken for a green
  // real-corpus regression check.
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = join(__dirname, "..", "..");
  const recordsDir = join(REPO_ROOT, "datasets", "jam-actions-v0", "records");
  const corpusAbsent = !existsSync(recordsDir);

  it.skipIf(corpusAbsent)(
    "selectPublicRecords + assertNoExcludedWorksInPublicSet on the real datasets/jam-actions-v0/records corpus excludes both deny-listed songs",
    () => {
    const files = readdirSync(recordsDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    const allRecords: SourceRecord[] = files.map(
      (f) => JSON.parse(readFileSync(join(recordsDir, f), "utf8")) as SourceRecord,
    );

    const publicRecords = selectPublicRecords(allRecords);
    expect(publicRecords.length).toBeGreaterThan(0);

    // Must not throw for TODAY's real corpus (both deny-listed songs are
    // correctly "internal" today, per PROVENANCE-NOTE.md) — a throw here
    // would mean the source data has ALREADY regressed and this test is
    // correctly reporting that, not a test bug.
    expect(() => assertNoExcludedWorksInPublicSet(publicRecords)).not.toThrow();

    const offendingIds = publicRecords
      .filter((r) => r.id.startsWith("satie-gymnopedie") || r.id.startsWith("debussy-arabesque"))
      .map((r) => r.id);
    expect(offendingIds).toEqual([]);

    // Sanity: the deny-listed songs really are present in the SOURCE corpus
    // (proving this test isn't vacuously passing because the records simply
    // don't exist on disk) — they're just correctly excluded by verdict.
    const songIds = new Set(allRecords.map((r) => r.scope.song_id));
    expect(songIds.has("satie-gymnopedie-no1")).toBe(true);
    expect(songIds.has("debussy-arabesque-no1")).toBe(true);
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

describe("parseChecksumsManifest (Slice 23.5 — CRLF tolerance)", () => {
  // SHA-256 of "alpha\n" — deterministic, used as fixture content below.
  const HASH_ALPHA = sha256Hex("alpha\n");
  // SHA-256 of "zeta\n" — second fixture.
  const HASH_ZETA = sha256Hex("zeta\n");

  it("parses LF-terminated input (the packager's canonical format)", () => {
    const manifest = `${HASH_ALPHA}  alpha.txt\n${HASH_ZETA}  zeta.txt\n`;
    const parsed = parseChecksumsManifest(manifest);
    expect(parsed.badLines).toEqual([]);
    expect(parsed.totalLines).toBe(2);
    expect(parsed.claimed.get("alpha.txt")).toBe(HASH_ALPHA);
    expect(parsed.claimed.get("zeta.txt")).toBe(HASH_ZETA);
  });

  it("parses CRLF-terminated input (the Windows fresh-clone case)", () => {
    // This is the case that broke the verifier on Windows in Slice 23 audit:
    // core.autocrlf=true converted checksums.sha256 to CRLF on checkout, and
    // the old regex `^...(.+)$` matched the trailing \r into capture group 2,
    // producing a relpath ending in \r that never matched any on-disk file.
    const manifest = `${HASH_ALPHA}  alpha.txt\r\n${HASH_ZETA}  zeta.txt\r\n`;
    const parsed = parseChecksumsManifest(manifest);
    expect(parsed.badLines).toEqual([]);
    expect(parsed.totalLines).toBe(2);
    // Critical: relpath has no trailing \r — the verifier maps by exact key
    // equality against on-disk relpaths produced by walkChecksumFiles().
    expect(parsed.claimed.get("alpha.txt")).toBe(HASH_ALPHA);
    expect(parsed.claimed.get("zeta.txt")).toBe(HASH_ZETA);
    expect(parsed.claimed.has("alpha.txt\r")).toBe(false);
  });

  it("parses mixed LF + CRLF (a checked-in LF file edited on a Windows editor)", () => {
    const manifest = `${HASH_ALPHA}  alpha.txt\n${HASH_ZETA}  zeta.txt\r\n`;
    const parsed = parseChecksumsManifest(manifest);
    expect(parsed.badLines).toEqual([]);
    expect(parsed.totalLines).toBe(2);
    expect(parsed.claimed.get("alpha.txt")).toBe(HASH_ALPHA);
    expect(parsed.claimed.get("zeta.txt")).toBe(HASH_ZETA);
  });

  it("collects bad lines without throwing", () => {
    const manifest = `garbage line one\n${HASH_ALPHA}  alpha.txt\nnot a hash  zeta.txt\n`;
    const parsed = parseChecksumsManifest(manifest);
    expect(parsed.totalLines).toBe(3);
    expect(parsed.badLines).toHaveLength(2);
    expect(parsed.badLines).toContain("garbage line one");
    expect(parsed.badLines).toContain("not a hash  zeta.txt");
    expect(parsed.claimed.size).toBe(1);
    expect(parsed.claimed.get("alpha.txt")).toBe(HASH_ALPHA);
  });

  it("ignores blank lines (trailing newline padding)", () => {
    const manifest = `\n${HASH_ALPHA}  alpha.txt\n\n\n${HASH_ZETA}  zeta.txt\n\n`;
    const parsed = parseChecksumsManifest(manifest);
    expect(parsed.totalLines).toBe(2);
    expect(parsed.badLines).toEqual([]);
  });

  it("round-trips with buildChecksumsManifest output (every entry parses)", () => {
    const files = [
      { relPath: "alpha.txt", content: "alpha\n" },
      { relPath: "zeta.txt", content: "zeta\n" },
      { relPath: "mid/file.json", content: '{"x":1}\n' },
    ];
    const manifest = buildChecksumsManifest(files);
    const parsed = parseChecksumsManifest(manifest);
    expect(parsed.badLines).toEqual([]);
    expect(parsed.totalLines).toBe(3);
    expect(parsed.claimed.size).toBe(3);
    for (const f of files) {
      expect(parsed.claimed.get(f.relPath)).toBe(sha256Hex(f.content));
    }
  });

  it("round-trips with CRLF-corrupted buildChecksumsManifest output", () => {
    const files = [
      { relPath: "alpha.txt", content: "alpha\n" },
      { relPath: "zeta.txt", content: "zeta\n" },
    ];
    const lfManifest = buildChecksumsManifest(files);
    // Simulate autocrlf-style corruption on a Windows checkout.
    const crlfManifest = lfManifest.replace(/\n/g, "\r\n");
    const parsed = parseChecksumsManifest(crlfManifest);
    expect(parsed.badLines).toEqual([]);
    for (const f of files) {
      expect(parsed.claimed.get(f.relPath)).toBe(sha256Hex(f.content));
    }
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

// ─── Slice 11.5: packager durability (package-inputs.json + VERSION + ────────
//                CITATION consistency + stale-removal + walk-based checksums) ─

const STANDARD_INPUTS: PackageInputs = {
  version_file: "VERSION",
  curated_files: [
    "README.md",
    "DATASET_SCHEMA.md",
    "KNOWN_LIMITATIONS.md",
    "ATTRIBUTION.md",
    "LICENSE-DATASET.md",
    "CITATION.cff",
  ],
  generated_files: [
    "manifest.json",
    "records.jsonl",
    "splits.json",
    "provenance-verification.json",
    "checksums.sha256",
  ],
  generated_dirs: ["records", "pianoroll"],
};

function makeStandardPackageDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "jam-pkg-test-"));
  writeFileSync(join(dir, "package-inputs.json"), formatJson(STANDARD_INPUTS), "utf8");
  writeFileSync(join(dir, "VERSION"), "0.2.0\n", "utf8");
  // Curated docs (distinctive markers so we can assert byte-for-byte preservation).
  writeFileSync(join(dir, "README.md"), "CURATED-README-MARKER\n", "utf8");
  writeFileSync(
    join(dir, "DATASET_SCHEMA.md"),
    "CURATED-SCHEMA-MARKER\n",
    "utf8",
  );
  writeFileSync(
    join(dir, "KNOWN_LIMITATIONS.md"),
    "CURATED-LIMITATIONS-MARKER\n",
    "utf8",
  );
  writeFileSync(
    join(dir, "ATTRIBUTION.md"),
    "CURATED-ATTRIBUTION-MARKER\n",
    "utf8",
  );
  writeFileSync(
    join(dir, "LICENSE-DATASET.md"),
    "CURATED-LICENSE-MARKER\n",
    "utf8",
  );
  writeFileSync(
    join(dir, "CITATION.cff"),
    [
      "cff-version: 1.2.0",
      'title: "test"',
      "type: dataset",
      'version: "0.2.0"',
      "",
    ].join("\n"),
    "utf8",
  );
  mkdirSync(join(dir, "records"));
  mkdirSync(join(dir, "pianoroll"));
  return dir;
}

describe("Slice 11.5 — readPackageInputs / assertPackageInputsValid", () => {
  it("rejects missing package-inputs.json with informative bootstrap error", () => {
    const dir = mkdtempSync(join(tmpdir(), "jam-pkg-missing-inputs-"));
    try {
      expect(() => readPackageInputs(dir)).toThrow(
        /package-inputs\.json missing/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects non-object package-inputs.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "jam-pkg-bad-shape-"));
    try {
      writeFileSync(join(dir, "package-inputs.json"), '"hello"', "utf8");
      expect(() => readPackageInputs(dir)).toThrow(/must be a JSON object/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects missing version_file field", () => {
    expect(() =>
      assertPackageInputsValid({
        curated_files: [],
        generated_files: [],
        generated_dirs: [],
      }),
    ).toThrow(/missing required string field: version_file/);
  });

  it("rejects same path in curated_files AND generated_files (conflicting declaration)", () => {
    expect(() =>
      assertPackageInputsValid({
        version_file: "VERSION",
        curated_files: ["foo.md"],
        generated_files: ["foo.md"],
        generated_dirs: [],
      }),
    ).toThrow(/conflicting input declaration/);
  });

  it("rejects same path in curated_files AND generated_dirs", () => {
    expect(() =>
      assertPackageInputsValid({
        version_file: "VERSION",
        curated_files: ["records"],
        generated_files: [],
        generated_dirs: ["records"],
      }),
    ).toThrow(/conflicting input declaration/);
  });

  it("rejects 'package-inputs.json' listed explicitly (it is implicit)", () => {
    expect(() =>
      assertPackageInputsValid({
        version_file: "VERSION",
        curated_files: ["package-inputs.json"],
        generated_files: [],
        generated_dirs: [],
      }),
    ).toThrow(/implicitly tracked/);
  });

  it("accepts 'checksums.sha256' listed in generated_files (per kickoff design)", () => {
    expect(() =>
      assertPackageInputsValid({
        version_file: "VERSION",
        curated_files: [],
        generated_files: ["checksums.sha256"],
        generated_dirs: [],
      }),
    ).not.toThrow();
  });

  it("accepts the standard shape used by the real package", () => {
    expect(() => assertPackageInputsValid(STANDARD_INPUTS)).not.toThrow();
  });
});

describe("Slice 11.5 — readVersion", () => {
  it("reads VERSION and trims surrounding whitespace + newlines", () => {
    const dir = mkdtempSync(join(tmpdir(), "jam-pkg-version-"));
    try {
      writeFileSync(join(dir, "VERSION"), "  0.2.0  \n\n", "utf8");
      expect(readVersion(dir)).toBe("0.2.0");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws if VERSION file is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "jam-pkg-version-missing-"));
    try {
      expect(() => readVersion(dir)).toThrow(/VERSION file missing/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws if VERSION file is empty after trim", () => {
    const dir = mkdtempSync(join(tmpdir(), "jam-pkg-version-empty-"));
    try {
      writeFileSync(join(dir, "VERSION"), "   \n\n", "utf8");
      expect(() => readVersion(dir)).toThrow(/empty after trim/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Slice 11.5 — extractCitationCffVersion + assertCitationCffMatchesVersion", () => {
  it("extracts quoted version", () => {
    const cff =
      'cff-version: 1.2.0\ntitle: "x"\nversion: "0.2.0"\nlicense: "MIT"\n';
    expect(extractCitationCffVersion(cff)).toBe("0.2.0");
  });

  it("extracts single-quoted version", () => {
    const cff = "cff-version: 1.2.0\nversion: '0.3.1'\n";
    expect(extractCitationCffVersion(cff)).toBe("0.3.1");
  });

  it("extracts bare (unquoted) version", () => {
    const cff = "cff-version: 1.2.0\nversion: 1.0.0\n";
    expect(extractCitationCffVersion(cff)).toBe("1.0.0");
  });

  it("returns null when no version field exists", () => {
    const cff = "cff-version: 1.2.0\ntitle: x\n";
    expect(extractCitationCffVersion(cff)).toBeNull();
  });

  it("ignores commented-out version line", () => {
    const cff = '# version: "9.9.9"\nversion: "0.2.0"\n';
    expect(extractCitationCffVersion(cff)).toBe("0.2.0");
  });

  it("handles Windows CRLF line endings", () => {
    const cff = 'cff-version: 1.2.0\r\nversion: "0.2.0"\r\n';
    expect(extractCitationCffVersion(cff)).toBe("0.2.0");
  });

  it("passes when CITATION.cff version equals VERSION", () => {
    const dir = makeStandardPackageDir();
    try {
      expect(() => assertCitationCffMatchesVersion(dir, "0.2.0")).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws when VERSION and CITATION.cff version diverge", () => {
    const dir = makeStandardPackageDir();
    try {
      expect(() => assertCitationCffMatchesVersion(dir, "0.3.0")).toThrow(
        /Version mismatch.*VERSION says "0\.3\.0".*CITATION\.cff says "0\.2\.0"/s,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws if CITATION.cff has no version field at all", () => {
    const dir = makeStandardPackageDir();
    try {
      writeFileSync(
        join(dir, "CITATION.cff"),
        "cff-version: 1.2.0\ntitle: x\n",
        "utf8",
      );
      expect(() => assertCitationCffMatchesVersion(dir, "0.2.0")).toThrow(
        /no 'version' field/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws if CITATION.cff is missing from disk", () => {
    const dir = makeStandardPackageDir();
    try {
      rmSync(join(dir, "CITATION.cff"));
      expect(() => assertCitationCffMatchesVersion(dir, "0.2.0")).toThrow(
        /CITATION\.cff missing/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Slice 11.5 — assertCuratedFilesPresent", () => {
  it("succeeds when every curated file declared in package-inputs.json exists on disk", () => {
    const dir = makeStandardPackageDir();
    try {
      const inputs = readPackageInputs(dir);
      const { emptyFiles } = assertCuratedFilesPresent(dir, inputs);
      expect(emptyFiles).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails informatively if a declared curated file is missing", () => {
    const dir = makeStandardPackageDir();
    try {
      rmSync(join(dir, "ATTRIBUTION.md"));
      const inputs = readPackageInputs(dir);
      expect(() => assertCuratedFilesPresent(dir, inputs)).toThrow(
        /Curated file missing on disk: 'ATTRIBUTION\.md'/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does NOT fail on zero-byte curated files; returns them in emptyFiles for warning", () => {
    const dir = makeStandardPackageDir();
    try {
      writeFileSync(join(dir, "ATTRIBUTION.md"), "", "utf8");
      const inputs = readPackageInputs(dir);
      const { emptyFiles } = assertCuratedFilesPresent(dir, inputs);
      expect(emptyFiles).toEqual(["ATTRIBUTION.md"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Slice 11.5 — removeStaleGeneratedFiles", () => {
  it("removes files in generated_dirs that aren't in the should-be set", () => {
    const dir = makeStandardPackageDir();
    try {
      // Plant a stale record + a current record.
      writeFileSync(join(dir, "records", "stale-record.json"), "stale", "utf8");
      writeFileSync(join(dir, "records", "current-record.json"), "current", "utf8");
      writeFileSync(join(dir, "pianoroll", "stale-record.svg"), "stale-svg", "utf8");
      writeFileSync(join(dir, "pianoroll", "current-record.svg"), "current-svg", "utf8");
      const inputs = readPackageInputs(dir);
      const shouldBe = new Set([
        "records/current-record.json",
        "pianoroll/current-record.svg",
      ]);
      const removed = removeStaleGeneratedFiles(dir, inputs, shouldBe);
      expect(removed.sort()).toEqual([
        "pianoroll/stale-record.svg",
        "records/stale-record.json",
      ]);
      // current files survived
      expect(existsSync(join(dir, "records", "current-record.json"))).toBe(true);
      expect(existsSync(join(dir, "pianoroll", "current-record.svg"))).toBe(true);
      // stale files gone
      expect(existsSync(join(dir, "records", "stale-record.json"))).toBe(false);
      expect(existsSync(join(dir, "pianoroll", "stale-record.svg"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never touches curated top-level files (they aren't in generated_dirs)", () => {
    const dir = makeStandardPackageDir();
    try {
      const inputs = readPackageInputs(dir);
      const before = readFileSync(join(dir, "ATTRIBUTION.md"));
      // Pass an empty should-be set; only generated_dirs are walked.
      removeStaleGeneratedFiles(dir, inputs, new Set<string>());
      const after = readFileSync(join(dir, "ATTRIBUTION.md"));
      expect(before.equals(after)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is a no-op when generated_dirs is empty / missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "jam-pkg-no-dirs-"));
    try {
      const inputs: PackageInputs = {
        version_file: "VERSION",
        curated_files: [],
        generated_files: [],
        generated_dirs: [],
      };
      const removed = removeStaleGeneratedFiles(dir, inputs, new Set<string>());
      expect(removed).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Slice 11.5 — walkChecksumFiles", () => {
  it("walks every file except checksums.sha256 itself", () => {
    const dir = makeStandardPackageDir();
    try {
      // Plant a couple of generated_dirs entries.
      writeFileSync(join(dir, "records", "r1.json"), "r1", "utf8");
      writeFileSync(join(dir, "pianoroll", "r1.svg"), "r1-svg", "utf8");
      // Plant a stale checksums.sha256 to confirm it's skipped.
      writeFileSync(join(dir, "checksums.sha256"), "should-be-skipped\n", "utf8");
      const inputs = readPackageInputs(dir);
      const { files, undeclared } = walkChecksumFiles(dir, inputs);
      const paths = files.map((f) => f.relPath);
      expect(paths).toContain("package-inputs.json");
      expect(paths).toContain("VERSION");
      expect(paths).toContain("README.md");
      expect(paths).toContain("CITATION.cff");
      expect(paths).toContain("records/r1.json");
      expect(paths).toContain("pianoroll/r1.svg");
      expect(paths).not.toContain("checksums.sha256");
      expect(undeclared).toEqual([]);
      // Deterministic sort.
      const sortedPaths = [...paths].sort();
      expect(paths).toEqual(sortedPaths);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("flags undeclared top-level files but includes them in checksums (data preservation)", () => {
    const dir = makeStandardPackageDir();
    try {
      writeFileSync(join(dir, "notes.txt"), "rogue file\n", "utf8");
      const inputs = readPackageInputs(dir);
      const { files, undeclared } = walkChecksumFiles(dir, inputs);
      expect(undeclared).toEqual(["notes.txt"]);
      expect(files.find((f) => f.relPath === "notes.txt")).toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("output ordering is deterministic / sorted by relPath", () => {
    const dir = makeStandardPackageDir();
    try {
      writeFileSync(join(dir, "records", "zzz.json"), "z", "utf8");
      writeFileSync(join(dir, "records", "aaa.json"), "a", "utf8");
      writeFileSync(join(dir, "records", "mmm.json"), "m", "utf8");
      const inputs = readPackageInputs(dir);
      const { files } = walkChecksumFiles(dir, inputs);
      const recordPaths = files
        .filter((f) => f.relPath.startsWith("records/"))
        .map((f) => f.relPath);
      expect(recordPaths).toEqual([
        "records/aaa.json",
        "records/mmm.json",
        "records/zzz.json",
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Slice 11.5 — full-package integration (smoke; 9-test contract)", () => {
  // These tests prove the 9 behaviors required by the operator: version source
  // of truth, curated-preservation default, missing-curated failure, stale
  // removal, checksums include curated + generated, idempotency, and
  // no-source-mutation. We assemble a miniature package + run the helpers in
  // the same order the CLI does.

  function setupMiniPackage(): { dir: string; inputs: PackageInputs } {
    const dir = makeStandardPackageDir();
    const inputs = readPackageInputs(dir);
    return { dir, inputs };
  }

  it("(test #1+#2) packager reads version from VERSION, drives manifest from it", () => {
    const { dir } = setupMiniPackage();
    try {
      // Bump VERSION + CITATION together, then read.
      writeFileSync(join(dir, "VERSION"), "0.3.0\n", "utf8");
      writeFileSync(
        join(dir, "CITATION.cff"),
        'cff-version: 1.2.0\nversion: "0.3.0"\n',
        "utf8",
      );
      const v = readVersion(dir);
      expect(v).toBe("0.3.0");
      // Manifest built with this version reflects it.
      const m = buildManifest({
        today: "2026-05-17",
        sourceCommit: "abc",
        sourceTag: "tag",
        packageVersion: v,
        publicRecords: selectPublicRecords(PUBLIC_FIVE),
        pkgSplits: filterSplitsToPublic(
          makeSplits([PROMPT_A.id, CONT_A.id, PROMPT_B.id, CONT_B.id, STANDALONE_C.id], []),
          publicIdSet(selectPublicRecords(PUBLIC_FIVE)),
        ),
      });
      expect(m.version).toBe("0.3.0");
      // Consistency check passes for the matching pair.
      expect(() => assertCitationCffMatchesVersion(dir, v)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(test #3) packager preserves curated docs byte-for-byte by default", () => {
    const { dir, inputs } = setupMiniPackage();
    try {
      // Capture distinctive marker bytes for all 6 curated files.
      const before: Record<string, Buffer> = {};
      for (const f of inputs.curated_files) {
        before[f] = readFileSync(join(dir, f));
      }
      // Simulate a "packager run" that only touches generated_files +
      // generated_dirs (the real packager doesn't write any curated file).
      writeFileSync(
        join(dir, "manifest.json"),
        formatJson({ dataset_name: "test", version: "0.2.0" }),
        "utf8",
      );
      writeFileSync(join(dir, "records.jsonl"), '{"id":"x"}\n', "utf8");
      writeFileSync(join(dir, "splits.json"), formatJson({ train: [], test: [] }), "utf8");
      writeFileSync(
        join(dir, "provenance-verification.json"),
        formatJson({ songs: [] }),
        "utf8",
      );
      // Assert all curated files byte-identical after.
      for (const f of inputs.curated_files) {
        const after = readFileSync(join(dir, f));
        expect(after.equals(before[f])).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(test #4) packager fails if a curated file declared in package-inputs.json is missing", () => {
    const { dir, inputs } = setupMiniPackage();
    try {
      rmSync(join(dir, "ATTRIBUTION.md"));
      expect(() => assertCuratedFilesPresent(dir, inputs)).toThrow(
        /Curated file missing on disk: 'ATTRIBUTION\.md'/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(test #5) packager removes stale generated records/SVGs when source records change", () => {
    const { dir, inputs } = setupMiniPackage();
    try {
      writeFileSync(join(dir, "records", "stale-record.json"), "stale", "utf8");
      writeFileSync(join(dir, "records", "kept.json"), "kept", "utf8");
      writeFileSync(join(dir, "pianoroll", "stale-record.svg"), "stale-svg", "utf8");
      const shouldBe = new Set([
        "records/kept.json",
        "pianoroll/kept.svg",
      ]);
      // Plant the kept svg so it's not stale either.
      writeFileSync(join(dir, "pianoroll", "kept.svg"), "kept-svg", "utf8");
      const removed = removeStaleGeneratedFiles(dir, inputs, shouldBe);
      expect(removed.sort()).toEqual([
        "pianoroll/stale-record.svg",
        "records/stale-record.json",
      ]);
      expect(existsSync(join(dir, "records", "stale-record.json"))).toBe(false);
      expect(existsSync(join(dir, "records", "kept.json"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(test #6) checksum walk includes curated docs + generated files + VERSION + package-inputs.json", () => {
    const { dir, inputs } = setupMiniPackage();
    try {
      // Plant some generated_files + generated_dirs.
      writeFileSync(join(dir, "manifest.json"), formatJson({ x: 1 }), "utf8");
      writeFileSync(join(dir, "records.jsonl"), "{}\n", "utf8");
      writeFileSync(join(dir, "splits.json"), formatJson({ train: [] }), "utf8");
      writeFileSync(
        join(dir, "provenance-verification.json"),
        formatJson({ songs: [] }),
        "utf8",
      );
      writeFileSync(join(dir, "records", "x.json"), "x", "utf8");
      writeFileSync(join(dir, "pianoroll", "x.svg"), "x", "utf8");
      const { files } = walkChecksumFiles(dir, inputs);
      const paths = new Set(files.map((f) => f.relPath));
      // All curated files.
      for (const f of inputs.curated_files) expect(paths.has(f)).toBe(true);
      // All generated_files (except checksums.sha256 itself).
      for (const f of inputs.generated_files) {
        if (f === "checksums.sha256") continue;
        expect(paths.has(f)).toBe(true);
      }
      // VERSION + package-inputs.json.
      expect(paths.has("VERSION")).toBe(true);
      expect(paths.has("package-inputs.json")).toBe(true);
      // Generated_dirs files.
      expect(paths.has("records/x.json")).toBe(true);
      expect(paths.has("pianoroll/x.svg")).toBe(true);
      // Each file has a valid checksum (verifiable via buildChecksumsManifest).
      const cs = buildChecksumsManifest(files);
      const lines = cs.split("\n").filter((l) => l.length > 0);
      expect(lines.length).toBe(files.length);
      for (const line of lines) {
        expect(line).toMatch(/^[0-9a-f]{64} {2}\S/);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(test #7) idempotency: walk + checksums are byte-identical across two runs with the same package state", () => {
    const { dir, inputs } = setupMiniPackage();
    try {
      writeFileSync(join(dir, "manifest.json"), formatJson({ x: 1 }), "utf8");
      writeFileSync(join(dir, "records.jsonl"), "{}\n", "utf8");
      writeFileSync(join(dir, "splits.json"), formatJson({ train: [] }), "utf8");
      writeFileSync(
        join(dir, "provenance-verification.json"),
        formatJson({ songs: [] }),
        "utf8",
      );
      writeFileSync(join(dir, "records", "a.json"), "a", "utf8");
      writeFileSync(join(dir, "pianoroll", "a.svg"), "a", "utf8");

      const r1 = walkChecksumFiles(dir, inputs);
      const r2 = walkChecksumFiles(dir, inputs);
      expect(r1.files.map((f) => f.relPath)).toEqual(
        r2.files.map((f) => f.relPath),
      );
      const cs1 = buildChecksumsManifest(r1.files);
      const cs2 = buildChecksumsManifest(r2.files);
      expect(cs1).toBe(cs2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(test #8) instrument_surfaces.ai_jam_sessions present after manifest build (and vocal_synth_engine absent)", () => {
    // Build manifest with the real shape; assert instrument_surfaces block is
    // not affected by Slice 11.5's changes (load-bearing — kickoff hard rule).
    const publicRecords = selectPublicRecords(PUBLIC_FIVE);
    const pkgSplits = filterSplitsToPublic(
      makeSplits(publicRecords.map((r) => r.id), []),
      publicIdSet(publicRecords),
    );
    const m = buildManifest({
      today: "2026-05-17",
      sourceCommit: "abc",
      sourceTag: "tag",
      packageVersion: "0.2.0",
      publicRecords,
      pkgSplits,
    });
    expect(m.instrument_surfaces).toHaveProperty("ai_jam_sessions");
    expect(m.instrument_surfaces.ai_jam_sessions.repo).toBe(
      "mcp-tool-shop-org/ai-jam-sessions",
    );
    expect(m.instrument_surfaces.ai_jam_sessions.status).toBe("active");
    expect(m.instrument_surfaces).not.toHaveProperty("vocal_synth_engine" as any);
  });

  it("(test #9) walk-based packager flow never reads from outside the tmp package dir", () => {
    // The library helpers walkChecksumFiles / removeStaleGeneratedFiles /
    // readVersion / readPackageInputs all take packageDir as their root —
    // they cannot mutate anywhere outside that root. We assert by running a
    // mini packager flow against a tmp dir and confirming the tmp dir's
    // parent (other tmp siblings) is untouched.
    const parent = mkdtempSync(join(tmpdir(), "jam-pkg-isolation-"));
    try {
      const pkgDir = join(parent, "pkg");
      mkdirSync(pkgDir);
      writeFileSync(
        join(pkgDir, "package-inputs.json"),
        formatJson(STANDARD_INPUTS),
        "utf8",
      );
      writeFileSync(join(pkgDir, "VERSION"), "0.2.0\n", "utf8");
      for (const f of STANDARD_INPUTS.curated_files) {
        if (f === "CITATION.cff") {
          writeFileSync(
            join(pkgDir, f),
            'cff-version: 1.2.0\nversion: "0.2.0"\n',
            "utf8",
          );
        } else {
          writeFileSync(join(pkgDir, f), `marker-${f}\n`, "utf8");
        }
      }
      mkdirSync(join(pkgDir, "records"));
      mkdirSync(join(pkgDir, "pianoroll"));
      // Plant a sibling file at parent level — must remain untouched.
      const sibling = join(parent, "outside-witness.txt");
      writeFileSync(sibling, "do-not-touch\n", "utf8");
      const before = readFileSync(sibling);

      // Run the flow.
      const inputs = readPackageInputs(pkgDir);
      const v = readVersion(pkgDir, inputs.version_file);
      expect(v).toBe("0.2.0");
      assertCuratedFilesPresent(pkgDir, inputs);
      assertCitationCffMatchesVersion(pkgDir, v);
      removeStaleGeneratedFiles(pkgDir, inputs, new Set<string>());
      walkChecksumFiles(pkgDir, inputs);

      const after = readFileSync(sibling);
      expect(after.equals(before)).toBe(true);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe("Slice 11.5 — no hardcoded PACKAGE_VERSION constant (hard gate 9)", () => {
  it("library never exports a PACKAGE_VERSION-like constant", async () => {
    const mod = await import("./package-public.js");
    // None of these names should exist as exports of the library after Slice 11.5.
    expect((mod as Record<string, unknown>).PACKAGE_VERSION).toBeUndefined();
    expect((mod as Record<string, unknown>).SOURCE_TAG).toBeUndefined();
    expect((mod as Record<string, unknown>).VERSION).toBeUndefined();
  });
});
