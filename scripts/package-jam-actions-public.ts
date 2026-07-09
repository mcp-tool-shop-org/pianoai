#!/usr/bin/env tsx
// ─── Slice 10 + 11.5: jam-actions-v0 Public-Subset Packager (CLI) ────────────
//
// Reads the source corpus at `datasets/jam-actions-v0/`, filters to records
// with `provenance.record_verdict === "public"` (115 expected), and writes a
// self-contained release artifact set to `datasets/jam-actions-v0-public/`
// suitable for Zenodo primary release and HuggingFace mirror.
//
// SLICE 11.5 DURABILITY CHANGES:
//   - Version is read from `datasets/jam-actions-v0-public/VERSION` (single
//     source of truth). No `PACKAGE_VERSION` constant in this file.
//   - `datasets/jam-actions-v0-public/package-inputs.json` declares which
//     files are curated (preserved byte-for-byte) vs generated (regenerated
//     every run). The packager never silently wipes curated docs.
//   - CITATION.cff.version is consistency-checked against VERSION; mismatch
//     fails the run with an actionable error. The packager never auto-edits
//     CITATION.cff.
//   - `generated_dirs` (records/, pianoroll/) get stale-file removal before
//     the current source-filter set is written.
//   - `--regenerate-docs` is reserved CLI syntax for a future slice. It is a
//     no-op in this slice.
//
// Hard rules:
//   - Source dataset is read-only — no modification to anything under
//     datasets/jam-actions-v0/
//   - Records are copied byte-for-byte (no re-derivation of any field)
//   - Splits are preserved: clair-de-lune (12 records) stays in test;
//     the other 103 public records stay in train
//   - Deterministic output: running twice with the same --today MUST produce
//     byte-identical files (sort, stable JSON, no `new Date()` in content)
//   - No symlinks (Windows-hostile)
//   - No network requests
//
// Usage:
//   pnpm exec tsx scripts/package-jam-actions-public.ts --today 2026-05-17
//   pnpm exec tsx scripts/package-jam-actions-public.ts --today 2026-05-17 --dry-run
//   pnpm exec tsx scripts/package-jam-actions-public.ts --today 2026-05-17 --source-tag jam-actions-v0-enriched-2026-05-17
//
// Exit 0 on success; non-zero on any error.
// ─────────────────────────────────────────────────────────────────────────────

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  assertCitationCffMatchesVersion,
  assertCuratedFilesPresent,
  assertNoExcludedWorksInPublicSet,
  buildChecksumsManifest,
  buildManifest,
  buildRecordsJsonl,
  buildSplitIndex,
  countPairs,
  EXCLUDED_SONG_IDS,
  filterProvenanceVerification,
  filterSplitsToPublic,
  findPairOrphans,
  formatJson,
  publicIdSet,
  readPackageInputs,
  readVersion,
  removeStaleGeneratedFiles,
  selectPublicRecords,
  walkChecksumFiles,
  type SourceManifest,
  type SourceProvenanceVerification,
  type SourceRecord,
  type SourceSplits,
} from "../src/dataset/package-public.js";

// ─── Paths ───────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SOURCE_DATASET = join(REPO_ROOT, "datasets", "jam-actions-v0");
const PACKAGE_DATASET = join(REPO_ROOT, "datasets", "jam-actions-v0-public");

const SOURCE_RECORDS_DIR = join(SOURCE_DATASET, "records");
const SOURCE_PIANOROLL_DIR = join(SOURCE_DATASET, "pianoroll");
const SOURCE_MANIFEST_PATH = join(SOURCE_DATASET, "manifest.json");
const SOURCE_SPLITS_PATH = join(SOURCE_DATASET, "splits.json");
const SOURCE_PROVENANCE_VERIFICATION_PATH = join(
  SOURCE_DATASET,
  "provenance-verification.json",
);

// ─── CLI args ────────────────────────────────────────────────────────────────

interface CliArgs {
  today: string;
  dryRun: boolean;
  regenerateDocs: boolean;
  sourceTag: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  let today: string | null = null;
  let dryRun = false;
  let regenerateDocs = false;
  let sourceTag: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--today") {
      today = argv[++i] ?? null;
    } else if (a === "--dry-run") {
      dryRun = true;
    } else if (a === "--regenerate-docs") {
      regenerateDocs = true;
    } else if (a === "--source-tag") {
      sourceTag = argv[++i] ?? null;
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else if (a) {
      throw new Error(`Unknown arg: ${a}`);
    }
  }
  if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw new Error("--today YYYY-MM-DD is required");
  }
  return { today, dryRun, regenerateDocs, sourceTag };
}

function printHelp(): void {
  console.log(`Usage: tsx scripts/package-jam-actions-public.ts --today YYYY-MM-DD [options]

Builds datasets/jam-actions-v0-public/ from datasets/jam-actions-v0/ by
filtering to records with provenance.record_verdict === "public".

Options:
  --today YYYY-MM-DD     Required. Used as 'built_at' in the package manifest.
                         Pinning this value is what makes the packager
                         reproducible.
  --dry-run              Plan only — print what would be written; touch nothing.
  --source-tag <tag>     Override the source tag stored in manifest.json. By
                         default, this is read from 'git describe --tags
                         --exact-match HEAD' if HEAD is tagged, else falls
                         back to the short commit SHA. Use this flag if you
                         need a specific tag string (e.g., during a release
                         dry-run before the tag is created).
  --regenerate-docs      RESERVED SYNTAX (Slice 11.5). No-op in this slice;
                         a future slice may implement template-based
                         regeneration of curated docs. The DEFAULT path
                         preserves curated docs (declared in
                         datasets/jam-actions-v0-public/package-inputs.json).

Version source of truth:
  The package version is read from datasets/jam-actions-v0-public/VERSION.
  CITATION.cff.version is consistency-checked against VERSION; mismatch
  fails the run with an actionable error. To bump the version:
    1. Edit datasets/jam-actions-v0-public/VERSION
    2. Edit datasets/jam-actions-v0-public/CITATION.cff version field to match
    3. Re-run this packager.
`);
}

// ─── Filesystem helpers ──────────────────────────────────────────────────────

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loadAllSourceRecords(): SourceRecord[] {
  if (!existsSync(SOURCE_RECORDS_DIR)) {
    throw new Error(`Source records dir not found: ${SOURCE_RECORDS_DIR}`);
  }
  const files = readdirSync(SOURCE_RECORDS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  return files.map((f) => readJson<SourceRecord>(join(SOURCE_RECORDS_DIR, f)));
}

function recordFilenameFromId(id: string): string {
  // ID shape: "<song-id>:<window>:piano:mcp-session:v1"
  // Filename: "<song-id>-<window>.json"
  // Source corpus is the authority for the mapping; rebuild it from the song
  // id + window slice. The third-onwards path components (piano:mcp-session:v1)
  // are not in the filename in the source corpus.
  const colonIdx = id.indexOf(":");
  if (colonIdx === -1) throw new Error(`Bad id: ${id}`);
  const songId = id.substring(0, colonIdx);
  const rest = id.substring(colonIdx + 1);
  const windowEnd = rest.indexOf(":");
  if (windowEnd === -1) throw new Error(`Bad id (no window): ${id}`);
  const windowSlice = rest.substring(0, windowEnd);
  return `${songId}-${windowSlice}.json`;
}

function pianorollFilenameFromRecordId(id: string): string {
  return recordFilenameFromId(id).replace(/\.json$/, ".svg");
}

function ensureDir(p: string): void {
  mkdirSync(p, { recursive: true });
}

function writeText(p: string, content: string): void {
  ensureDir(dirname(p));
  writeFileSync(p, content, "utf8");
}

function gitHeadShaShort(): string {
  try {
    const out = execSync("git rev-parse HEAD", {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim();
  } catch {
    // No git or detached state — return a placeholder. Won't break packaging.
    return "unknown";
  }
}

function gitHeadTagOrCommit(): string {
  // Try to use the exact-match tag at HEAD (e.g.,
  // 'jam-actions-v0-enriched-2026-05-17'). If HEAD isn't tagged, fall back
  // to the short commit SHA.
  try {
    const out = execSync("git describe --tags --exact-match HEAD", {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim();
  } catch {
    // Not tagged — fall through to short-sha.
  }
  try {
    const out = execSync("git rev-parse --short HEAD", {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim();
  } catch {
    return "unknown";
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  console.log("=".repeat(70));
  console.log(" jam-actions-v0 Public-Subset Packager (Slice 10 + 11.5)");
  console.log("=".repeat(70));
  console.log(`  Source:      ${SOURCE_DATASET}`);
  console.log(`  Destination: ${PACKAGE_DATASET}`);
  console.log(`  Today:       ${args.today}`);
  console.log(`  Dry run:     ${args.dryRun}`);
  if (args.regenerateDocs) {
    console.log(
      "  --regenerate-docs is reserved syntax (Slice 11.5); no-op in this slice. " +
        "Curated docs are preserved per package-inputs.json.",
    );
  }

  // 0. Read package-inputs.json + VERSION + run consistency checks (Slice 11.5).
  if (!existsSync(PACKAGE_DATASET)) {
    throw new Error(
      `Package destination dir does not exist: ${PACKAGE_DATASET}. ` +
        `Slice 11.5 requires the package directory to already exist with ` +
        `VERSION + package-inputs.json + curated docs before the packager runs.`,
    );
  }
  const inputs = readPackageInputs(PACKAGE_DATASET);
  const packageVersion = readVersion(PACKAGE_DATASET, inputs.version_file);
  console.log(`\n  package-inputs.json loaded: ${inputs.curated_files.length} curated, ${inputs.generated_files.length} generated, ${inputs.generated_dirs.length} generated_dirs`);
  console.log(`  VERSION (single source of truth): ${packageVersion}`);
  const { emptyFiles } = assertCuratedFilesPresent(PACKAGE_DATASET, inputs);
  for (const f of emptyFiles) {
    console.warn(`  [warn] Curated file is zero-byte: ${f}`);
  }
  // CITATION.cff consistency check (consistency-check semantics; never edits).
  if (inputs.curated_files.includes("CITATION.cff")) {
    assertCitationCffMatchesVersion(PACKAGE_DATASET, packageVersion);
    console.log(`  CITATION.cff consistency: PASS (version="${packageVersion}")`);
  }

  // Resolve source tag.
  const sourceCommit = gitHeadShaShort();
  const sourceTag = args.sourceTag ?? gitHeadTagOrCommit();
  console.log(`  Source commit: ${sourceCommit}`);
  console.log(`  Source tag:    ${sourceTag}`);

  // 1. Load source artifacts.
  const sourceManifest = readJson<SourceManifest>(SOURCE_MANIFEST_PATH);
  const sourceSplits = readJson<SourceSplits>(SOURCE_SPLITS_PATH);
  const sourceProv = readJson<SourceProvenanceVerification>(
    SOURCE_PROVENANCE_VERIFICATION_PATH,
  );
  const allRecords = loadAllSourceRecords();
  console.log(`\n  Loaded ${allRecords.length} source records.`);
  console.log(`  Source manifest record_count: ${sourceManifest.record_count}`);
  if (allRecords.length !== sourceManifest.record_count) {
    throw new Error(
      `Source record count mismatch: ${allRecords.length} on disk vs manifest ${sourceManifest.record_count}`,
    );
  }

  // 2. Filter to public.
  const publicRecords = selectPublicRecords(allRecords);
  console.log(`  Public records: ${publicRecords.length}`);
  if (publicRecords.length === 0) {
    throw new Error("No public records found — refusing to package empty set.");
  }

  // 2b. Exclusion regression guard (D-B1-002): fail closed if a deny-listed
  //     work's records would enter the public subset, independent of what
  //     record_verdict says on those records. See EXCLUDED_SONG_IDS in
  //     src/dataset/package-public.ts for the deny-list + rationale.
  assertNoExcludedWorksInPublicSet(publicRecords);
  console.log(
    `  Exclusion regression guard: PASS (${EXCLUDED_SONG_IDS.length} deny-listed song(s) checked: ${EXCLUDED_SONG_IDS.join(", ")})`,
  );

  // 3. Pair-completeness gate (must pass before any writes).
  const orphans = findPairOrphans(publicRecords);
  if (orphans.length > 0) {
    console.error(`\n  Pair-completeness FAIL — ${orphans.length} orphan(s):`);
    for (const id of orphans) console.error(`    - ${id}`);
    throw new Error(
      "Pair completeness failed: a prompt's continuation is missing from the public set (or vice-versa). Stop.",
    );
  }
  const { pair_count, standalone_count } = countPairs(publicRecords);
  console.log(`  Pair completeness: PASS (${pair_count} pairs + ${standalone_count} standalone)`);

  // 4. Filter splits.
  const idSet = publicIdSet(publicRecords);
  const pkgSplits = filterSplitsToPublic(sourceSplits, idSet);
  console.log(
    `  Splits filtered: train=${pkgSplits.train.length}, test=${pkgSplits.test.length}`,
  );
  if (pkgSplits.train.length + pkgSplits.test.length !== publicRecords.length) {
    throw new Error(
      `Split total ${pkgSplits.train.length + pkgSplits.test.length} != public record count ${publicRecords.length}`,
    );
  }
  // Verify every public id is in exactly one split.
  const splitIndex = buildSplitIndex(pkgSplits);
  for (const r of publicRecords) {
    if (!splitIndex.has(r.id)) {
      throw new Error(`Public record ${r.id} is not present in train or test split — corpus invariant broken.`);
    }
  }

  // 5. Filter provenance verification.
  const pkgProv = filterProvenanceVerification(sourceProv);
  console.log(`  Provenance verification: ${pkgProv.songs.length} public songs`);

  // 6. Build manifest + records.jsonl (generated content). CITATION.cff /
  //    README.md / LICENSE-DATASET.md / DATASET_SCHEMA.md / KNOWN_LIMITATIONS.md
  //    / ATTRIBUTION.md are curated and preserved byte-for-byte; we do NOT
  //    rebuild them here.
  const manifest = buildManifest({
    today: args.today,
    sourceCommit,
    sourceTag,
    packageVersion,
    publicRecords,
    pkgSplits,
  });
  const recordsJsonl = buildRecordsJsonl(publicRecords, splitIndex);

  // 7. Compute the canonical set of `generated_dirs` paths we will write
  //    (every public record's records/*.json + pianoroll/*.svg). This drives
  //    stale-removal (Lock 5).
  const expectedGeneratedDirPaths = new Set<string>();
  for (const rec of publicRecords) {
    expectedGeneratedDirPaths.add(`records/${recordFilenameFromId(rec.id)}`);
    expectedGeneratedDirPaths.add(`pianoroll/${pianorollFilenameFromRecordId(rec.id)}`);
  }

  // 8. Plan the writes for generated_files + generated_dirs. Curated files are
  //    NOT in the plan — they stay on disk as-is.
  type WritePlan = {
    relPath: string;
    content: Buffer | string;
    copyFrom?: string;
  };

  const plan: WritePlan[] = [];
  // generated_files (top-level):
  if (inputs.generated_files.includes("manifest.json")) {
    plan.push({ relPath: "manifest.json", content: formatJson(manifest) });
  }
  if (inputs.generated_files.includes("records.jsonl")) {
    plan.push({ relPath: "records.jsonl", content: recordsJsonl });
  }
  if (inputs.generated_files.includes("splits.json")) {
    plan.push({ relPath: "splits.json", content: formatJson(pkgSplits) });
  }
  if (inputs.generated_files.includes("provenance-verification.json")) {
    plan.push({
      relPath: "provenance-verification.json",
      content: formatJson(pkgProv),
    });
  }

  // generated_dirs: per-record JSON + SVG.
  for (const rec of publicRecords) {
    const recName = recordFilenameFromId(rec.id);
    const recAbs = join(SOURCE_RECORDS_DIR, recName);
    if (!existsSync(recAbs)) {
      throw new Error(`Source record file not found for id=${rec.id}: ${recAbs}`);
    }
    plan.push({
      relPath: `records/${recName}`,
      content: readFileSync(recAbs),
      copyFrom: recAbs,
    });
    const svgName = pianorollFilenameFromRecordId(rec.id);
    const svgAbs = join(SOURCE_PIANOROLL_DIR, svgName);
    if (!existsSync(svgAbs)) {
      throw new Error(`Source SVG not found for id=${rec.id}: ${svgAbs}`);
    }
    plan.push({
      relPath: `pianoroll/${svgName}`,
      content: readFileSync(svgAbs),
      copyFrom: svgAbs,
    });
  }

  console.log(`\n  Planned generated writes: ${plan.length} files`);
  console.log(`    - generated_files: ${inputs.generated_files.filter((f) => f !== "checksums.sha256").length}`);
  console.log(`    - records/ (${publicRecords.length} files)`);
  console.log(`    - pianoroll/ (${publicRecords.length} files)`);
  console.log(`  Preserved curated files: ${inputs.curated_files.length}`);

  if (args.dryRun) {
    console.log("\n[DRY RUN] No files written. Done.");
    return;
  }

  // 9. Stale-removal: delete entries in generated_dirs that aren't in the
  //    canonical expected set. Preserves curated content (curated docs are
  //    top-level, not under generated_dirs) and source-corpus invariants.
  const removed = removeStaleGeneratedFiles(
    PACKAGE_DATASET,
    inputs,
    expectedGeneratedDirPaths,
  );
  for (const path of removed) {
    console.log(`  [stale removed] ${path}`);
  }
  if (removed.length > 0) {
    console.log(`  Removed ${removed.length} stale file(s) from generated_dirs.`);
  }

  // 10. Execute the plan (overwrite generated_files + generated_dirs; never
  //     touch curated files).
  for (const p of plan) {
    const dest = join(PACKAGE_DATASET, p.relPath);
    if (p.copyFrom) {
      ensureDir(dirname(dest));
      copyFileSync(p.copyFrom, dest);
    } else {
      writeText(dest, typeof p.content === "string" ? p.content : p.content.toString("utf8"));
    }
  }

  // 11. Recompute checksums.sha256 over EVERY file in the package dir
  //     (except checksums.sha256 itself) via the package-inputs.json walk.
  //     This includes package-inputs.json + VERSION + all curated + all
  //     generated + everything under generated_dirs + any undeclared files
  //     (warn-and-include).
  const { files: checksumInputs, undeclared } = walkChecksumFiles(
    PACKAGE_DATASET,
    inputs,
  );
  for (const u of undeclared) {
    console.warn(
      `  [warn] Undeclared file in package dir (not in package-inputs.json): ${u}. ` +
        `Including in checksums for data preservation; declare it explicitly in a future slice.`,
    );
  }
  const checksums = buildChecksumsManifest(checksumInputs);
  writeText(join(PACKAGE_DATASET, "checksums.sha256"), checksums);

  const totalLines = checksums.split("\n").filter((l) => l.length > 0).length;
  console.log(
    `\n  Wrote ${plan.length} generated file(s) + regenerated checksums.sha256 (${totalLines} entries) to ${PACKAGE_DATASET}.`,
  );
  console.log("\nDONE.");
}

try {
  main();
} catch (err) {
  console.error(`\nFATAL: ${(err as Error).message}`);
  process.exit(1);
}
