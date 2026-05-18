#!/usr/bin/env tsx
// ─── Slice 10: jam-actions-v0 Public-Subset Packager (CLI) ───────────────────
//
// Reads the source corpus at `datasets/jam-actions-v0/`, filters to records
// with `provenance.record_verdict === "public"` (115 expected), and writes a
// self-contained release artifact set to `datasets/jam-actions-v0-public/`
// suitable for Zenodo primary release and HuggingFace mirror.
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
//
// Exit 0 on success; non-zero on any error.
// ─────────────────────────────────────────────────────────────────────────────

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

const PACKAGE_VERSION = "0.2.0";
const SOURCE_TAG = "jam-actions-v0-enriched-2026-05-17";

// ─── CLI args ────────────────────────────────────────────────────────────────

interface CliArgs {
  today: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let today: string | null = null;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--today") {
      today = argv[++i] ?? null;
    } else if (a === "--dry-run") {
      dryRun = true;
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
  return { today, dryRun };
}

function printHelp(): void {
  console.log(`Usage: tsx scripts/package-jam-actions-public.ts --today YYYY-MM-DD [--dry-run]

Builds datasets/jam-actions-v0-public/ from datasets/jam-actions-v0/ by
filtering to records with provenance.record_verdict === "public".

Options:
  --today YYYY-MM-DD   Required. Used as 'built_at' in the package manifest
                       and as the date-released in CITATION.cff. Pinning this
                       value is what makes the packager reproducible.
  --dry-run            Plan only — print what would be written; touch nothing.
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

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  console.log("=".repeat(70));
  console.log(" jam-actions-v0 Public-Subset Packager (Slice 10)");
  console.log("=".repeat(70));
  console.log(`  Source:      ${SOURCE_DATASET}`);
  console.log(`  Destination: ${PACKAGE_DATASET}`);
  console.log(`  Today:       ${args.today}`);
  console.log(`  Dry run:     ${args.dryRun}`);

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

  // 6. Build manifest + dataset card + citation + license.
  const sourceCommit = gitHeadShaShort();
  const manifest = buildManifest({
    today: args.today,
    sourceCommit,
    sourceTag: SOURCE_TAG,
    packageVersion: PACKAGE_VERSION,
    publicRecords,
    pkgSplits,
  });
  const readme = buildReadme({
    packageVersion: PACKAGE_VERSION,
    today: args.today,
    recordCount: publicRecords.length,
    trainCount: pkgSplits.train.length,
    testCount: pkgSplits.test.length,
    testSong: pkgSplits.held_out_song,
    songCount: manifest.songs_count,
    songsIncluded: manifest.songs_included,
    sourceCommit,
    sourceTag: SOURCE_TAG,
  });
  const citation = buildCitationCff({
    version: PACKAGE_VERSION,
    dateReleased: args.today,
  });
  const license = buildLicenseDataset();
  const recordsJsonl = buildRecordsJsonl(publicRecords, splitIndex);

  // 7. Plan all writes (so we can dry-run, compute checksums up-front).
  // Each entry: { relPath, content (string|Buffer), copyFrom? (source absolute path) }
  type WritePlan = {
    relPath: string;
    content: Buffer | string;
    copyFrom?: string;
  };

  const plan: WritePlan[] = [];
  plan.push({ relPath: "manifest.json", content: formatJson(manifest) });
  plan.push({ relPath: "records.jsonl", content: recordsJsonl });
  plan.push({
    relPath: "provenance-verification.json",
    content: formatJson(pkgProv),
  });
  plan.push({
    relPath: "splits.json",
    content: formatJson(pkgSplits),
  });
  plan.push({ relPath: "README.md", content: readme });
  plan.push({ relPath: "CITATION.cff", content: citation });
  plan.push({ relPath: "LICENSE-DATASET.md", content: license });
  plan.push({ relPath: "VERSION", content: `${PACKAGE_VERSION}\n` });

  // Individual record JSONs + SVGs.
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

  // Checksums file is computed AFTER the plan is finalized, over everything else.
  const checksums = buildChecksumsManifest(
    plan.map((p) => ({ relPath: p.relPath, content: p.content })),
  );
  plan.push({ relPath: "checksums.sha256", content: checksums });

  console.log(`\n  Planned writes: ${plan.length} files`);
  console.log(`    - manifest.json, records.jsonl, splits.json, provenance-verification.json`);
  console.log(`    - README.md, CITATION.cff, LICENSE-DATASET.md, VERSION, checksums.sha256`);
  console.log(`    - records/ (${publicRecords.length} files)`);
  console.log(`    - pianoroll/ (${publicRecords.length} files)`);

  if (args.dryRun) {
    console.log("\n[DRY RUN] No files written. Done.");
    return;
  }

  // 8. Clean prior package output (idempotency / reproducibility) — but only
  // the dataset-public dir, never the source dir.
  if (existsSync(PACKAGE_DATASET)) {
    // Safety: refuse to delete anything that doesn't end with our target dir name.
    if (!PACKAGE_DATASET.endsWith("jam-actions-v0-public")) {
      throw new Error(`Refusing to rm-rf unexpected path: ${PACKAGE_DATASET}`);
    }
    rmSync(PACKAGE_DATASET, { recursive: true, force: true });
  }
  ensureDir(PACKAGE_DATASET);

  // 9. Execute the plan.
  for (const p of plan) {
    const dest = join(PACKAGE_DATASET, p.relPath);
    if (p.copyFrom) {
      ensureDir(dirname(dest));
      copyFileSync(p.copyFrom, dest);
    } else {
      writeText(dest, typeof p.content === "string" ? p.content : p.content.toString("utf8"));
    }
  }

  console.log(`\n  Wrote ${plan.length} files to ${PACKAGE_DATASET}.`);
  console.log("\nDONE.");
}

try {
  main();
} catch (err) {
  console.error(`\nFATAL: ${(err as Error).message}`);
  process.exit(1);
}
