// ─── jam-actions-v0 Public-Subset Packager (library) ─────────────────────────
//
// Slice 10 — packages the `public` subset of `datasets/jam-actions-v0/` into a
// self-contained, externally-legible artifact set under
// `datasets/jam-actions-v0-public/` for Zenodo primary release + HuggingFace
// mirror.
//
// This module contains the pure-data logic (filter, serialize, manifest build,
// checksum manifest). All filesystem I/O lives in `scripts/package-jam-actions-public.ts`.
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
//
// Reproducibility: pure functions, no `new Date()`, no Math.random.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";

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

// ─── JSON formatting ─────────────────────────────────────────────────────────

/** Stable JSON formatter — 2-space indent + trailing newline, matching source. */
export function formatJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2) + "\n";
}
