// ─── jam-actions-v0 Public-Subset Packager (library) ─────────────────────────
//
// Slice 10 — packages the `public` subset of `datasets/jam-actions-v0/` into a
// self-contained, externally-legible artifact set under
// `datasets/jam-actions-v0-public/` for Zenodo primary release + HuggingFace
// mirror.
//
// Slice 11.5 — packager durability fix. The package directory now declares its
// own input shape in `package-inputs.json` (curated_files vs generated_files
// vs generated_dirs). Library helpers (readPackageInputs, readVersion,
// assertVersionConsistency, removeStaleGeneratedFiles, walkChecksumFiles)
// drive the packager off that declaration so curated docs are preserved by
// default and version is sourced from VERSION (single source of truth).
//
// This module contains the pure-data logic (filter, serialize, manifest build,
// checksum manifest) PLUS the lightweight filesystem helpers needed for the
// package-inputs.json contract. The CLI script at
// `scripts/package-jam-actions-public.ts` is the orchestrator.
//
// Contract:
//   - Filters by `provenance.record_verdict === "public"` (115 records expected)
//   - Splits remain locked: clair-de-lune stays test (12), other 7 songs stay train
//   - Per-record content is byte-for-byte preserved (no re-derivation of
//     provenance fields, no schema upgrades)
//   - records.jsonl is sorted by record id ascending and adds a top-level
//     `split` field per line
//   - checksums.sha256 lists every other package file, sorted by path, format:
//       <64-char-hex>  <relative-path>
//   - VERSION is the single source of truth for package version; CITATION.cff
//     version must match (consistency-checked; never auto-edited)
//   - Curated files listed in package-inputs.json are preserved byte-for-byte
//     across packager runs; generated_files / generated_dirs are overwritten;
//     stale files in generated_dirs that fall out of the source filter are
//     removed before the current set is written.
//
// Reproducibility: pure functions, no `new Date()`, no Math.random.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, relative, sep } from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Subset of the record shape we need. Records are passed through verbatim. */
export interface SourceRecord {
  id: string;
  schema_version: string;
  provenance: {
    record_verdict: "public" | "public_candidate" | "internal" | "excluded";
    [k: string]: unknown;
  };
  scope: {
    song_id: string;
    window_role?: "prompt" | "continuation_target" | "standalone";
    continuation_target_window?: [number, number];
    paired_prompt_record_id?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface SourceSplits {
  strategy: string;
  test_song_count: number;
  test_pct: number;
  pair_locked: boolean;
  held_out_song: string;
  held_out_rationale: string;
  test: string[];
  train: string[];
}

export interface SourceProvenanceVerification {
  slice: string;
  verified_at: string;
  politeness_defaults: Record<string, unknown>;
  total_candidates: number;
  songs: Array<{
    song_id: string;
    post_verdict: "public" | "public_candidate" | "internal" | "excluded";
    [k: string]: unknown;
  }>;
  summary: Record<string, unknown>;
}

export interface SourceManifest {
  dataset_name: string;
  version: string;
  built_at: string;
  songs_included: string[];
  [k: string]: unknown;
}

/** Output: a record as it appears in records.jsonl (source record + split field). */
export interface JsonlRecord extends SourceRecord {
  split: "train" | "test";
}

export interface PackageSplits {
  strategy: string;
  test_song_count: number;
  test_pct: number;
  pair_locked: boolean;
  held_out_song: string;
  held_out_rationale: string;
  test: string[];
  train: string[];
}

export interface PackageManifest {
  dataset_name: "jam-actions-v0-public";
  version: string;
  built_at: string;
  source_dataset: "jam-actions-v0";
  source_commit: string;
  source_tag: string;
  license: "CC-BY-SA-3.0-DE";
  license_url: "https://creativecommons.org/licenses/by-sa/3.0/de/";
  record_count: number;
  pair_count: number;
  standalone_count: number;
  songs_count: number;
  songs_included: string[];
  splits: { train: number; test: number };
  test_song: string;
  verdict_summary: { public: number };
  instrument_surfaces: {
    ai_jam_sessions: {
      repo: "mcp-tool-shop-org/ai-jam-sessions";
      status: "active";
      v0_usage: "primary";
    };
  };
  checksums_file: "checksums.sha256";
}

// ─── Filtering ────────────────────────────────────────────────────────────────

/** Filter records to public only, sorted by id ascending. */
export function selectPublicRecords(records: SourceRecord[]): SourceRecord[] {
  return records
    .filter((r) => r.provenance.record_verdict === "public")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Build the set of public record IDs for fast lookup. */
export function publicIdSet(publicRecords: SourceRecord[]): Set<string> {
  return new Set(publicRecords.map((r) => r.id));
}

// ─── Pair completeness ───────────────────────────────────────────────────────

/**
 * Given the public records, verify every prompt's continuation lands inside the
 * public set. Returns the list of orphan IDs (empty if the package is sound).
 *
 * Pairing model:
 *   - window_role === 'prompt' MUST have a paired record whose
 *     paired_prompt_record_id resolves back to it
 *   - window_role === 'continuation_target' MUST have its paired prompt in set
 *   - window_role === 'standalone' has no pair requirement
 */
export function findPairOrphans(publicRecords: SourceRecord[]): string[] {
  const idSet = publicIdSet(publicRecords);
  const byPrompt = new Map<string, SourceRecord>(); // promptId → continuation
  for (const r of publicRecords) {
    if (
      r.scope.window_role === "continuation_target" &&
      r.scope.paired_prompt_record_id
    ) {
      byPrompt.set(r.scope.paired_prompt_record_id, r);
    }
  }
  const orphans: string[] = [];
  for (const r of publicRecords) {
    if (r.scope.window_role === "prompt") {
      // Prompt needs a continuation_target in the public set pointing back.
      const cont = byPrompt.get(r.id);
      if (!cont) {
        orphans.push(r.id);
      }
    }
    if (r.scope.window_role === "continuation_target") {
      const promptId = r.scope.paired_prompt_record_id;
      if (!promptId || !idSet.has(promptId)) {
        orphans.push(r.id);
      }
    }
  }
  return orphans;
}

/** Count prompt+continuation pairs and standalone records in the public set. */
export function countPairs(publicRecords: SourceRecord[]): {
  pair_count: number;
  standalone_count: number;
} {
  let prompts = 0;
  let standalone = 0;
  for (const r of publicRecords) {
    if (r.scope.window_role === "prompt") prompts++;
    else if (r.scope.window_role === "standalone") standalone++;
  }
  return { pair_count: prompts, standalone_count: standalone };
}

// ─── Splits ──────────────────────────────────────────────────────────────────

/**
 * Filter the source splits.json to public IDs only, preserving structure.
 * Sorts train/test lists ascending for determinism.
 */
export function filterSplitsToPublic(
  source: SourceSplits,
  publicIds: Set<string>,
): PackageSplits {
  const train = source.train.filter((id) => publicIds.has(id)).sort();
  const test = source.test.filter((id) => publicIds.has(id)).sort();
  return {
    strategy: source.strategy,
    test_song_count: source.test_song_count,
    test_pct: source.test_pct,
    pair_locked: source.pair_locked,
    held_out_song: source.held_out_song,
    held_out_rationale: source.held_out_rationale,
    test,
    train,
  };
}

/** Map id → split using the package splits. Throws if id is in neither list. */
export function buildSplitIndex(
  pkgSplits: PackageSplits,
): Map<string, "train" | "test"> {
  const idx = new Map<string, "train" | "test">();
  for (const id of pkgSplits.train) idx.set(id, "train");
  for (const id of pkgSplits.test) idx.set(id, "test");
  return idx;
}

// ─── Provenance-verification filter ──────────────────────────────────────────

export function filterProvenanceVerification(
  src: SourceProvenanceVerification,
): SourceProvenanceVerification {
  const filteredSongs = src.songs.filter((s) => s.post_verdict === "public");
  // Recompute summary block to match filtered subset.
  const recordLevel = filteredSongs.reduce(
    (acc, s) => acc + Number((s as any).records_count || 0),
    0,
  );
  return {
    slice: src.slice,
    verified_at: src.verified_at,
    politeness_defaults: src.politeness_defaults,
    total_candidates: filteredSongs.length,
    songs: filteredSongs,
    summary: {
      promoted_to_public: filteredSongs.length,
      kept_public_candidate: 0,
      demoted_to_internal: 0,
      demoted_to_excluded: 0,
      summary_failures_by_reason: {},
      record_level_counts: {
        public: recordLevel,
        public_candidate: 0,
        internal: 0,
        excluded: 0,
      },
    },
  };
}

// ─── records.jsonl serialization ─────────────────────────────────────────────

/**
 * Build records.jsonl content as a string.
 *   - One JSON object per line
 *   - Records sorted by id (selectPublicRecords already enforces this)
 *   - Each line is the full record with an added top-level `split` field
 *   - Trailing newline on the final line
 */
export function buildRecordsJsonl(
  publicRecords: SourceRecord[],
  splitIndex: Map<string, "train" | "test">,
): string {
  const lines: string[] = [];
  for (const r of publicRecords) {
    const split = splitIndex.get(r.id);
    if (!split) {
      throw new Error(
        `package-public: record ${r.id} not present in splits index (train/test)`,
      );
    }
    // Build the JSONL row: spread original record, append split. JSON.stringify
    // is deterministic for plain objects on V8 (insertion order).
    const row: JsonlRecord = { ...(r as SourceRecord), split };
    lines.push(JSON.stringify(row));
  }
  return lines.join("\n") + "\n";
}

// ─── Manifest ────────────────────────────────────────────────────────────────

export interface BuildManifestArgs {
  today: string; // YYYY-MM-DD
  sourceCommit: string;
  sourceTag: string;
  packageVersion: string;
  publicRecords: SourceRecord[];
  pkgSplits: PackageSplits;
}

export function buildManifest(args: BuildManifestArgs): PackageManifest {
  const { publicRecords, pkgSplits, today, sourceCommit, sourceTag, packageVersion } = args;
  const songIds = Array.from(new Set(publicRecords.map((r) => r.scope.song_id))).sort();
  const { pair_count, standalone_count } = countPairs(publicRecords);
  return {
    dataset_name: "jam-actions-v0-public",
    version: packageVersion,
    built_at: today,
    source_dataset: "jam-actions-v0",
    source_commit: sourceCommit,
    source_tag: sourceTag,
    license: "CC-BY-SA-3.0-DE",
    license_url: "https://creativecommons.org/licenses/by-sa/3.0/de/",
    record_count: publicRecords.length,
    pair_count,
    standalone_count,
    songs_count: songIds.length,
    songs_included: songIds,
    splits: { train: pkgSplits.train.length, test: pkgSplits.test.length },
    test_song: pkgSplits.held_out_song,
    verdict_summary: { public: publicRecords.length },
    instrument_surfaces: {
      ai_jam_sessions: {
        repo: "mcp-tool-shop-org/ai-jam-sessions",
        status: "active",
        v0_usage: "primary",
      },
    },
    checksums_file: "checksums.sha256",
  };
}

// ─── README dataset card ─────────────────────────────────────────────────────

export interface BuildReadmeArgs {
  packageVersion: string;
  today: string;
  recordCount: number;
  trainCount: number;
  testCount: number;
  testSong: string;
  songCount: number;
  songsIncluded: string[];
  sourceCommit: string;
  sourceTag: string;
}

export function buildReadme(args: BuildReadmeArgs): string {
  const {
    packageVersion,
    today,
    recordCount,
    trainCount,
    testCount,
    testSong,
    songCount,
    songsIncluded,
    sourceCommit,
    sourceTag,
  } = args;
  const frontmatter = [
    "---",
    "license: cc-by-sa-3.0",
    "language:",
    "  - en",
    'pretty_name: "AI Jam Sessions — Tool-Use Traces v0 (Public Subset)"',
    "size_categories:",
    "  - n<1K",
    "task_categories:",
    "  - text-generation",
    "  - other",
    "task_ids: []",
    "tags:",
    "  - music",
    "  - midi",
    "  - mcp",
    "  - tool-use",
    "  - symbolic-music",
    "  - piano",
    "  - classical",
    "configs:",
    "  - config_name: default",
    "    data_files:",
    "      - split: train",
    "        path: records.jsonl",
    "---",
  ].join("\n");

  const songsList = songsIncluded.map((s) => `- \`${s}\``).join("\n");

  const body = [
    "",
    "# Dataset Card for jam-actions-v0 (public subset)",
    "",
    `**Version:** ${packageVersion}   **Built:** ${today}   **Source commit:** \`${sourceCommit}\`   **Source tag:** \`${sourceTag}\``,
    "",
    "## Dataset Summary",
    "",
    "`jam-actions-v0` is a corpus of multi-turn MCP (Model Context Protocol) tool-use traces grounded in real classical-piano MIDI. Each record pairs a short phrase window (typically 4 measures) with an annotated teaching target and a target trace — a turn-by-turn session in which an assistant uses the `ai-jam-sessions` MCP tools to read, analyze, and discuss the phrase. The dataset teaches LLMs to do **grounded tool-use over symbolic music**, not just text generation.",
    "",
    `This is the **public subset**: ${recordCount} records across ${songCount} compositions, all under CC-BY-SA-3.0 (DE jurisdiction). Two songs from the full source corpus (Satie Gymnopédie No. 1; Debussy Arabesque No. 1) are NOT included here — their provenance against piano-midi.de could not be verified during Slice 2.5 URL verification.`,
    "",
    "## Dataset Structure",
    "",
    "Top-level files:",
    "",
    "- `records.jsonl` — one JSON object per line; the canonical training feed. Each line is a complete record with an additional `split` field (`\"train\"` or `\"test\"`) so consumers can use the file without consulting `splits.json`.",
    "- `records/` — the same records as individual JSON files (sorted by id), useful for spot-inspection or downstream tools that prefer one-record-per-file.",
    "- `pianoroll/` — one SVG per record, matched by basename (`<id>.svg` corresponds to `records/<id>.json`).",
    "- `splits.json` — train/test split with `held_out_song` pinned. Locked: `clair-de-lune` is the canonical held-out test set; it is NEVER used for training.",
    "- `provenance-verification.json` — per-song URL verification report from Slice 2.5 (filtered to the public songs).",
    "- `manifest.json` — package-scope manifest with `record_count`, `pair_count`, `songs_included`, `splits`, etc.",
    "- `CITATION.cff` — Citation File Format metadata.",
    "- `LICENSE-DATASET.md` — layered-licensing explainer (public-domain compositions + CC-BY-SA-3.0-DE arrangements).",
    "- `VERSION` — single-line package version.",
    "- `checksums.sha256` — SHA-256 sums of every other file in the package, sorted by path.",
    "",
    "Each record has these top-level fields: `id`, `schema_version`, `provenance`, `scope`, `observation`, `annotation_target`, `target_trace`, `eval_metadata`. See the source repo's `src/dataset/schema.ts` for the full Zod schema.",
    "",
    "## Source Data",
    "",
    "MIDI arrangements are by **Bernd Krueger**, published at **piano-midi.de** under CC-BY-SA 3.0 (DE jurisdiction). The underlying compositions are all in the public domain in both the US and EU (composer death + 70 years elapsed; latest of the 8 composers, Debussy, d. 1918).",
    "",
    "Songs included (alphabetical):",
    "",
    songsList,
    "",
    "## Licensing",
    "",
    "This dataset is layered:",
    "",
    "1. **Compositions** — public domain (US: pre-1929 publication; EU: composer death + 70 years elapsed).",
    "2. **Arrangements (MIDI sequences)** — Bernd Krueger, piano-midi.de, **CC-BY-SA 3.0 (DE)** — https://creativecommons.org/licenses/by-sa/3.0/de/",
    "3. **Derivative records (this dataset)** — **CC-BY-SA-3.0-DE** — share-alike inherited from the upstream arrangements.",
    "",
    "HuggingFace's enumerated license slugs do not include the `-de` jurisdiction; the dataset card YAML uses `cc-by-sa-3.0` and the DE jurisdiction is documented here in the body and in `LICENSE-DATASET.md`.",
    "",
    "Attribution requirements when using this dataset:",
    "",
    "- Cite **Bernd Krueger** and **piano-midi.de** when using the MIDI bytes or sequences.",
    "- Cite this dataset (see `CITATION.cff`) when using the records, traces, or derived tokenizations.",
    "",
    "## Held-out Test Set",
    "",
    `**\`${testSong}\`** (${testCount} records) is the canonical held-out test set. It is **never** to be used for training. The remaining ${trainCount} records form the train split. The held-out choice is stratified by composer + style era: Debussy's Impressionist (1905) voicing is distinct from every training-set composer's idiom, so leakage from train to test is structurally low.`,
    "",
    "Split discipline is preserved across the packaging: every pair (`prompt` + `continuation_target`) is in the same split, and `clair-de-lune` was held out from the start of v0.",
    "",
    "## Provenance",
    "",
    "Slice 2.5 of the source repo verified the provenance URL for each song against piano-midi.de's per-composer page. Of the 10 candidate songs, 8 passed verification and were promoted to `public`; the other 2 were demoted to `internal` (excluded from this public subset). The per-song report — including verification timestamps, attempted URLs, response sizes, and failure reasons (for the demoted songs) — is shipped alongside this dataset as `provenance-verification.json` (filtered to the 8 public songs).",
    "",
    "Each record's `provenance` block carries its own `verdict_reason`, `verifier`, `verified_at`, and `arrangement_evidence_url` byte-for-byte from the source corpus. None of these fields are re-derived during packaging.",
    "",
    "## Citation",
    "",
    "See `CITATION.cff` for machine-readable metadata. BibTeX equivalent:",
    "",
    "```bibtex",
    "@dataset{jam_actions_v0_public_2026,",
    "  author       = {mcp-tool-shop-org},",
    "  title        = {jam-actions-v0 — AI Jam Sessions tool-use traces (public subset)},",
    `  version      = {${packageVersion}},`,
    `  year         = {2026},`,
    "  license      = {CC-BY-SA-3.0-DE},",
    "  url          = {https://github.com/mcp-tool-shop-org/ai-jam-sessions}",
    "}",
    "```",
    "",
    "## Limitations",
    "",
    "- **Satie Gymnopédie No. 1** and **Debussy Arabesque No. 1** are **NOT** in this public subset. Slice 2.5 could not confirm their provenance against piano-midi.de — the Satie composer page returned HTTP 418 (the upstream does not currently carry Satie), and the Debussy composer page was reachable but did not reference Arabesque No. 1. Both songs remain in the source repo with `record_verdict: \"internal\"` and are excluded from this distribution.",
    "- **No vocal records.** The source repo's `manifest.json` declares `vocal_synth_engine` as a `declared_dependency_surface` for future record types (vocal_phrase, sing_along_trace, phoneme_alignment, vocal_render_score), but v0 ships **only** instrument records. The public-subset `manifest.json` reflects this by listing only `ai_jam_sessions` under `instrument_surfaces`.",
    "- **Piano only.** All 8 songs are solo-piano arrangements. Other instruments are out of scope for v0.",
    "- **English-only annotations.** Teaching-note text is English-only.",
    "",
    "## Maintainer",
    "",
    "[`mcp-tool-shop-org`](https://github.com/mcp-tool-shop-org) — please open an issue at https://github.com/mcp-tool-shop-org/ai-jam-sessions for questions, corrections, or contributions.",
    "",
  ].join("\n");

  return frontmatter + body;
}

// ─── CITATION.cff ────────────────────────────────────────────────────────────

export function buildCitationCff(args: {
  version: string;
  dateReleased: string;
}): string {
  return [
    "cff-version: 1.2.0",
    'title: "jam-actions-v0 — AI Jam Sessions tool-use traces (public subset)"',
    'message: "If you use this dataset, please cite it as below."',
    "type: dataset",
    "authors:",
    '  - name: "mcp-tool-shop-org"',
    `version: "${args.version}"`,
    `date-released: "${args.dateReleased}"`,
    'license: "CC-BY-SA-3.0-DE"',
    'repository-code: "https://github.com/mcp-tool-shop-org/ai-jam-sessions"',
    "keywords:",
    "  - music",
    "  - midi",
    "  - mcp",
    "  - tool-use",
    "  - symbolic-music",
    "",
  ].join("\n");
}

// ─── LICENSE-DATASET.md ──────────────────────────────────────────────────────

export function buildLicenseDataset(): string {
  return [
    "# Layered licensing for `jam-actions-v0` (public subset)",
    "",
    "This dataset combines three distinct layers of intellectual property; the layered license below describes each.",
    "",
    "## 1. Compositions",
    "",
    "All 8 musical compositions in this dataset are in the **public domain** in both the United States and the European Union:",
    "",
    "- US: each composition was first published before 1929 (the public-domain boundary as of 2024 in the US).",
    "- EU: each composer died more than 70 years ago. The latest-deceased composer represented here is Claude Debussy (d. 1918, 70 years elapsed in 1988).",
    "",
    "No copyright restrictions apply to the underlying compositions.",
    "",
    "## 2. Arrangements (MIDI sequences)",
    "",
    "The MIDI sequences used to derive these records were arranged by **Bernd Krueger** and published at **piano-midi.de**. These arrangements are licensed under:",
    "",
    "**Creative Commons Attribution-ShareAlike 3.0 Germany** (CC-BY-SA-3.0-DE)",
    "",
    "Canonical URL: https://creativecommons.org/licenses/by-sa/3.0/de/",
    "",
    "The DE jurisdiction is the **legal** governing law for the arrangements; the substantive obligations (attribution + share-alike) are equivalent to the international CC-BY-SA-3.0.",
    "",
    "## 3. Derivative records (this dataset)",
    "",
    "Because each record incorporates and is derived from a CC-BY-SA-3.0-DE arrangement, the share-alike clause propagates: **this dataset is licensed under CC-BY-SA-3.0-DE**.",
    "",
    "Downstream users redistributing this dataset, or derivatives of it, MUST:",
    "",
    "1. Provide attribution to **Bernd Krueger / piano-midi.de** for the MIDI arrangements.",
    "2. Provide attribution to **`mcp-tool-shop-org`** for the dataset (see `CITATION.cff`).",
    "3. Release derivatives under a compatible share-alike license (CC-BY-SA-3.0, CC-BY-SA-4.0, or CC-BY-SA-3.0-DE).",
    "4. Indicate any changes made to the dataset.",
    "",
    "## Note on HuggingFace's license slug",
    "",
    "HuggingFace's dataset-card YAML enumerates `cc-by-sa-3.0` but does **not** carry the `-de` jurisdiction suffix. The card therefore declares `license: cc-by-sa-3.0`; the DE jurisdiction is documented here and in the README body. There is no conflict — the obligations are identical, and the DE jurisdiction is the governing law for the upstream arrangements.",
    "",
    "## On the demoted songs",
    "",
    "Two songs (Satie Gymnopédie No. 1; Debussy Arabesque No. 1) from the source corpus could not be verified against piano-midi.de during Slice 2.5 URL verification. They are **not** in this public subset and carry no claim of CC-BY-SA-3.0-DE licensing here. They remain in the source repo with `record_verdict: \"internal\"`.",
    "",
  ].join("\n");
}

// ─── checksums.sha256 ────────────────────────────────────────────────────────

/** Compute SHA-256 of a buffer / string and return lowercase hex. */
export function sha256Hex(content: Buffer | string): string {
  const h = createHash("sha256");
  h.update(content);
  return h.digest("hex");
}

/**
 * Build the checksums.sha256 file content from a list of (path, content) pairs.
 *
 *   - Each line: "<64-char-hex>  <relative-path>\n" (two spaces between)
 *   - Sorted alphabetically by relative path
 *   - Trailing newline on the last line
 *   - The checksums file itself MUST NOT be in the input list
 *   - Paths use forward slashes (POSIX-style), even when produced on Windows
 */
export function buildChecksumsManifest(
  files: Array<{ relPath: string; content: Buffer | string }>,
): string {
  const lines: string[] = [];
  const sorted = [...files].sort((a, b) =>
    a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0,
  );
  for (const f of sorted) {
    if (f.relPath === "checksums.sha256") {
      throw new Error(
        "buildChecksumsManifest: checksums.sha256 must not be in the input list",
      );
    }
    if (f.relPath.includes("\\")) {
      throw new Error(
        `buildChecksumsManifest: relPath must use forward slashes: ${f.relPath}`,
      );
    }
    lines.push(`${sha256Hex(f.content)}  ${f.relPath}`);
  }
  return lines.join("\n") + "\n";
}

// ─── Parse checksums.sha256 (Slice 23.5 — CRLF-tolerant) ─────────────────────

export interface ParsedChecksumsManifest {
  /** Map of relpath → 64-char hex hash. */
  claimed: Map<string, string>;
  /** Lines that did not match the "<64hex>  <relpath>" format. */
  badLines: string[];
  /** Total non-empty lines seen (after CRLF stripping). */
  totalLines: number;
}

/**
 * Parse a checksums.sha256 manifest body. CRLF-tolerant per Slice 23.5: lines
 * with a trailing `\r` are stripped before regex match. The packager writes LF
 * and `.gitattributes` pins LF on disk for *.sha256, but this defense-in-depth
 * tolerance handles any consumer that mis-normalizes the file post-clone.
 *
 * Earned by Slice 23 audit (Gap #1 — Windows-only "[bad line]" failure).
 */
export function parseChecksumsManifest(
  manifestStr: string,
): ParsedChecksumsManifest {
  const lines = manifestStr
    .split(/\r?\n/)
    .map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l))
    .filter((l) => l.length > 0);

  const claimed = new Map<string, string>();
  const badLines: string[] = [];
  for (const line of lines) {
    // Format: "<64-hex>  <relpath>"
    const m = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!m) {
      badLines.push(line);
      continue;
    }
    claimed.set(m[2], m[1]);
  }
  return { claimed, badLines, totalLines: lines.length };
}

// ─── JSON formatting ─────────────────────────────────────────────────────────

/** Stable JSON formatter — 2-space indent + trailing newline, matching source. */
export function formatJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2) + "\n";
}

// ─── package-inputs.json + VERSION + CITATION.cff (Slice 11.5) ───────────────

/**
 * Shape of `<packageDir>/package-inputs.json`. This file is the contract that
 * tells the packager which files in the package directory are curated (read-
 * only, preserved byte-for-byte) vs generated (regenerated every run).
 *
 * `version_file` (relative path to a file containing the package version)
 *   - Single source of truth for package version
 *   - Required field
 *
 * `curated_files` (array of relative paths)
 *   - These files are READ ONLY by the packager
 *   - Missing-on-disk: packager FAILS with informative error
 *   - Empty-on-disk: packager WARNS, continues
 *
 * `generated_files` (array of relative paths)
 *   - Top-level files the packager regenerates each run
 *
 * `generated_dirs` (array of relative directory paths)
 *   - Directories whose contents the packager fully regenerates each run.
 *   - Files in this directory that are NOT in the current source filter set
 *     are DELETED (stale-removal) before the current set is written.
 *
 * `package-inputs.json` itself is implicitly tracked (always checksummed; not
 * listed in any of the above arrays). `checksums.sha256` is implicit too (it
 * cannot checksum itself).
 *
 * Invariant: no file path may appear in more than one of the three arrays
 * (curated_files / generated_files / generated_dirs). The
 * `assertPackageInputsValid` helper enforces this.
 */
export interface PackageInputs {
  version_file: string;
  curated_files: string[];
  generated_files: string[];
  generated_dirs: string[];
}

/**
 * Read and validate `<packageDir>/package-inputs.json`.
 *
 * Throws if:
 *   - file missing (bootstrap error — Slice 11.5 is the first to create it)
 *   - JSON parse failure
 *   - shape failure (missing required field or wrong type)
 *   - same path appears in more than one of curated_files / generated_files /
 *     generated_dirs (conflicting input declaration)
 */
export function readPackageInputs(packageDir: string): PackageInputs {
  const inputsPath = join(packageDir, "package-inputs.json");
  if (!existsSync(inputsPath)) {
    throw new Error(
      `package-inputs.json missing at ${inputsPath}. ` +
        `The packager requires this file to know which files are curated vs generated. ` +
        `See Slice 11.5 documentation for the required shape.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(inputsPath, "utf8"));
  } catch (err) {
    throw new Error(
      `package-inputs.json parse error at ${inputsPath}: ${(err as Error).message}`,
    );
  }
  assertPackageInputsValid(parsed);
  return parsed;
}

/**
 * Validate the shape of a parsed package-inputs.json and check for conflicting
 * declarations (same path in more than one array, or version_file overlapping
 * curated/generated).
 *
 * Throws on any validation failure with an actionable message.
 */
export function assertPackageInputsValid(
  parsed: unknown,
): asserts parsed is PackageInputs {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "package-inputs.json must be a JSON object (got " +
        (Array.isArray(parsed) ? "array" : typeof parsed) +
        ").",
    );
  }
  const p = parsed as Record<string, unknown>;
  if (typeof p.version_file !== "string" || p.version_file.length === 0) {
    throw new Error(
      "package-inputs.json missing required string field: version_file",
    );
  }
  for (const key of ["curated_files", "generated_files", "generated_dirs"]) {
    if (!Array.isArray(p[key])) {
      throw new Error(
        `package-inputs.json field '${key}' must be an array of strings`,
      );
    }
    for (const v of p[key] as unknown[]) {
      if (typeof v !== "string" || v.length === 0) {
        throw new Error(
          `package-inputs.json field '${key}' contains a non-string or empty entry`,
        );
      }
    }
  }
  const curated = new Set(p.curated_files as string[]);
  const generated = new Set(p.generated_files as string[]);
  const dirs = new Set(p.generated_dirs as string[]);
  const versionFile = p.version_file as string;

  // No overlap between any two of the three arrays.
  for (const v of curated) {
    if (generated.has(v)) {
      throw new Error(
        `package-inputs.json: '${v}' appears in BOTH curated_files and generated_files (conflicting input declaration)`,
      );
    }
    if (dirs.has(v)) {
      throw new Error(
        `package-inputs.json: '${v}' appears in BOTH curated_files and generated_dirs (conflicting input declaration)`,
      );
    }
    if (v === versionFile) {
      throw new Error(
        `package-inputs.json: '${v}' is listed in curated_files AND is the version_file (it is implicitly tracked as version_file; do not list it explicitly)`,
      );
    }
  }
  for (const v of generated) {
    if (dirs.has(v)) {
      throw new Error(
        `package-inputs.json: '${v}' appears in BOTH generated_files and generated_dirs (conflicting input declaration)`,
      );
    }
    if (v === versionFile) {
      throw new Error(
        `package-inputs.json: '${v}' is listed in generated_files AND is the version_file (conflicting input declaration)`,
      );
    }
  }
  for (const v of dirs) {
    if (v === versionFile) {
      throw new Error(
        `package-inputs.json: '${v}' is listed in generated_dirs AND is the version_file (conflicting input declaration)`,
      );
    }
  }
  // package-inputs.json must NOT list itself (it is implicitly tracked).
  // checksums.sha256, by kickoff design, IS listed in generated_files so
  // operators can see at a glance what the packager regenerates. The
  // packager treats it specially: it never includes checksums.sha256 in its
  // own listing (you can't checksum a file with its own checksum inside).
  if (
    curated.has("package-inputs.json") ||
    generated.has("package-inputs.json") ||
    dirs.has("package-inputs.json")
  ) {
    throw new Error(
      `package-inputs.json: 'package-inputs.json' must not be listed (it is implicitly tracked by the packager)`,
    );
  }
}

/**
 * Read the VERSION file from the package directory. Trims surrounding
 * whitespace (including a trailing newline). Throws if the file is missing or
 * empty after trim.
 *
 * The package version is the SINGLE SOURCE OF TRUTH; manifest.json.version is
 * derived from it, and CITATION.cff.version is consistency-checked against it.
 */
export function readVersion(
  packageDir: string,
  versionFileName = "VERSION",
): string {
  const versionPath = join(packageDir, versionFileName);
  if (!existsSync(versionPath)) {
    throw new Error(
      `VERSION file missing at ${versionPath}. ` +
        `The packager requires this file as the single source of truth for the package version.`,
    );
  }
  const raw = readFileSync(versionPath, "utf8");
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error(
      `VERSION file at ${versionPath} is empty after trim. The packager requires a non-empty version string.`,
    );
  }
  return trimmed;
}

/**
 * Find the `version: "X.Y.Z"` line in a CITATION.cff document and return the
 * declared version string. Returns null if the field is absent.
 *
 * CFF version syntax (per cff-version 1.2.0): `version: "0.2.0"` or
 * `version: 0.2.0` (quoted or bare). This helper handles both. Multi-line
 * version values are not part of the CFF spec; this helper returns null on
 * malformed input rather than guessing.
 */
export function extractCitationCffVersion(cffText: string): string | null {
  // Split on universal newlines so Windows / Unix file endings both work.
  const lines = cffText.split(/\r?\n/);
  for (const rawLine of lines) {
    // CFF is YAML; `version:` is a top-level key. We look for lines that start
    // with `version:` (no indent, no '#' comment prefix). Trailing comments
    // after the value are allowed but rare in shipped CFF.
    const m = /^version:\s*(.+?)\s*$/.exec(rawLine);
    if (!m) continue;
    if (rawLine.startsWith("#")) continue;
    let value = m[1].trim();
    // Strip trailing inline comment.
    const hashIdx = value.indexOf(" #");
    if (hashIdx >= 0) value = value.substring(0, hashIdx).trim();
    // Strip surrounding double or single quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.substring(1, value.length - 1);
    }
    if (value.length === 0) return null;
    return value;
  }
  return null;
}

/**
 * Consistency check: assert that CITATION.cff's `version` field matches the
 * package version (from VERSION). This treats CITATION.cff as truly curated —
 * the packager READS it but never WRITES to it.
 *
 * Behavior:
 *   - CITATION.cff missing from disk: throws (curated-file-missing error in
 *     readPackageInputs handles this earlier; this helper assumes it exists)
 *   - CITATION.cff has no version field: throws ("missing version field")
 *   - CITATION.cff version != versionString: throws (mismatch error;
 *     instructs operator to edit CITATION.cff manually)
 *   - Match: returns void (no-op)
 *
 * Manual bump procedure for a future version:
 *   1. Edit VERSION
 *   2. Edit CITATION.cff version field
 *   3. Run the packager — it picks up VERSION, regenerates manifest.json,
 *      asserts CITATION.cff matches, succeeds.
 */
export function assertCitationCffMatchesVersion(
  packageDir: string,
  versionString: string,
  citationFileName = "CITATION.cff",
): void {
  const cffPath = join(packageDir, citationFileName);
  if (!existsSync(cffPath)) {
    throw new Error(
      `CITATION.cff missing at ${cffPath}. ` +
        `The packager requires this curated file to consistency-check its version field.`,
    );
  }
  const cffText = readFileSync(cffPath, "utf8");
  const cffVersion = extractCitationCffVersion(cffText);
  if (cffVersion === null) {
    throw new Error(
      `CITATION.cff at ${cffPath} has no 'version' field. ` +
        `Add a 'version: "${versionString}"' line to CITATION.cff (matching VERSION).`,
    );
  }
  if (cffVersion !== versionString) {
    throw new Error(
      `Version mismatch: VERSION says "${versionString}" but CITATION.cff says "${cffVersion}". ` +
        `Update CITATION.cff manually to match VERSION before packaging. ` +
        `The packager treats CITATION.cff as curated content and never auto-edits it.`,
    );
  }
}

/**
 * Assert that every curated file listed in package-inputs.json exists on disk.
 * Throws on the first missing file with an actionable message.
 *
 * Empty (zero-byte) curated files are NOT fatal — caller may choose to warn
 * via the returned `emptyFiles` array.
 */
export function assertCuratedFilesPresent(
  packageDir: string,
  inputs: PackageInputs,
): { emptyFiles: string[] } {
  const emptyFiles: string[] = [];
  for (const rel of inputs.curated_files) {
    const full = join(packageDir, rel);
    if (!existsSync(full)) {
      throw new Error(
        `Curated file missing on disk: '${rel}' (declared in package-inputs.json.curated_files). ` +
          `The packager will not silently regenerate hand-curated content. ` +
          `Restore '${rel}' from git, or remove it from package-inputs.json if it is no longer curated.`,
      );
    }
    const sz = statSync(full).size;
    if (sz === 0) emptyFiles.push(rel);
  }
  return { emptyFiles };
}

/**
 * Remove stale entries from `generated_dirs`. Given the package directory,
 * the package-inputs.json, and the canonical set of relative paths that
 * SHOULD be present (e.g., `records/songA-m001-004.json`, ...),
 * delete any file currently in `generated_dirs` whose relative path is NOT
 * in the should-be set.
 *
 * Returns the list of removed relative paths (for logging).
 *
 * This function does NOT write the current set — that is the caller's job
 * after stale removal completes.
 */
export function removeStaleGeneratedFiles(
  packageDir: string,
  inputs: PackageInputs,
  shouldBePresent: Set<string>,
): string[] {
  const removed: string[] = [];
  for (const dir of inputs.generated_dirs) {
    const dirAbs = join(packageDir, dir);
    if (!existsSync(dirAbs)) continue;
    const stack: string[] = [dirAbs];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const entry of readdirSync(cur)) {
        const full = join(cur, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
          stack.push(full);
          continue;
        }
        const relPath = relToPosix(packageDir, full);
        if (!shouldBePresent.has(relPath)) {
          rmSync(full);
          removed.push(relPath);
        }
      }
    }
  }
  return removed;
}

/** Helper: relative path from packageDir to fileAbs in POSIX form. */
function relToPosix(packageDir: string, fileAbs: string): string {
  let rel = relative(packageDir, fileAbs);
  if (sep !== "/") rel = rel.split(sep).join("/");
  return rel;
}

/**
 * Walk the package directory and collect every file that should appear in
 * `checksums.sha256` — i.e., every file under `packageDir` EXCEPT
 * `checksums.sha256` itself. The walk includes:
 *   - package-inputs.json
 *   - VERSION file
 *   - all curated_files
 *   - all generated_files
 *   - everything under generated_dirs
 *   - any UNDECLARED files (warn-and-include per Slice 11.5 spec: preserve
 *     data; flag the unknown for human review)
 *
 * Returns:
 *   { files: [{ relPath, content }], undeclared: [...rel] }
 *
 * The caller is responsible for printing the warning lines for undeclared
 * files (this library function returns data, not side effects).
 */
export function walkChecksumFiles(
  packageDir: string,
  inputs: PackageInputs,
): {
  files: Array<{ relPath: string; content: Buffer }>;
  undeclared: string[];
} {
  if (!existsSync(packageDir)) {
    throw new Error(`walkChecksumFiles: packageDir does not exist: ${packageDir}`);
  }
  const files: Array<{ relPath: string; content: Buffer }> = [];
  const undeclared: string[] = [];

  // Declared set: every path that the package-inputs.json contract explicitly
  // accounts for, including version_file and (implicitly) package-inputs.json.
  const declaredAtTopLevel = new Set<string>([
    "package-inputs.json",
    inputs.version_file,
    ...inputs.curated_files,
    ...inputs.generated_files,
  ]);
  const declaredDirPrefixes = inputs.generated_dirs.map((d) => `${d}/`);

  const stack: string[] = [packageDir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const entry of readdirSync(cur)) {
      const full = join(cur, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
        continue;
      }
      const relPath = relToPosix(packageDir, full);
      if (relPath === "checksums.sha256") continue;

      const isDeclaredTop = declaredAtTopLevel.has(relPath);
      const isInDeclaredDir = declaredDirPrefixes.some((pfx) =>
        relPath.startsWith(pfx),
      );
      if (!isDeclaredTop && !isInDeclaredDir) {
        undeclared.push(relPath);
      }
      files.push({ relPath, content: readFileSync(full) });
    }
  }
  // Deterministic ordering — sort by path so buildChecksumsManifest's sorted
  // output is stable across runs.
  files.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  undeclared.sort();
  return { files, undeclared };
}
