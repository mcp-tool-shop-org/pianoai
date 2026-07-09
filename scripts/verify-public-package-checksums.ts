// Slice 10.5 / 11.5 verification — walk the package, recompute SHA-256 for
// each file, confirm every line in checksums.sha256 matches and every file is
// covered.
//
// Slice 11.5: walk is driven by `walkChecksumFiles()` + package-inputs.json.
// Undeclared files are warned (not fatal) so the verifier matches the
// regenerator's behavior.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkManifestCompleteness,
  parseChecksumsManifest,
  readPackageInputs,
  sha256Hex,
  walkChecksumFiles,
  type GeneratedDirCompletenessInput,
  type PackageManifestSummary,
} from "../src/dataset/package-public.js";

const PACKAGE_DIR = "datasets/jam-actions-v0-public";
const CHECKSUMS_FILE = "checksums.sha256";
const MANIFEST_FILE = "manifest.json";
const RECORDS_JSONL_FILE = "records.jsonl";
const SPLITS_FILE = "splits.json";

function main(): void {
  const inputs = readPackageInputs(PACKAGE_DIR);
  const { files, undeclared } = walkChecksumFiles(PACKAGE_DIR, inputs);
  for (const u of undeclared) {
    console.warn(
      `[warn] Undeclared file in package dir: ${u}. ` +
        `Included in checksum walk anyway (Slice 11.5 data-preservation rule).`,
    );
  }

  const onDisk = new Map<string, Buffer>();
  for (const { relPath, content } of files) onDisk.set(relPath, content);

  const manifestStr = readFileSync(join(PACKAGE_DIR, CHECKSUMS_FILE), "utf8");
  // Slice 23.5: CRLF-tolerant parsing. The packager writes LF; .gitattributes
  // pins LF on disk for *.sha256. If either is stripped by a downstream
  // consumer (or a fresh-clone with stale autocrlf history), the parser
  // strips trailing \r before regex match so the verifier still parses
  // correctly. See src/dataset/package-public.ts → parseChecksumsManifest.
  const parsed = parseChecksumsManifest(manifestStr);
  const totalLines = parsed.totalLines;
  const claimed = parsed.claimed;
  const badLineCount = parsed.badLines.length;
  for (const bad of parsed.badLines) {
    console.error(`[bad line] ${bad}`);
  }

  let mismatches = 0;
  let missingOnDisk = 0;
  let missingInManifest = 0;

  for (const [rel, content] of onDisk) {
    const claimedHash = claimed.get(rel);
    if (!claimedHash) {
      console.error(`[missing in manifest] ${rel}`);
      missingInManifest++;
      continue;
    }
    const actual = sha256Hex(content);
    if (actual !== claimedHash) {
      console.error(`[hash mismatch] ${rel}`);
      console.error(`  claimed: ${claimedHash}`);
      console.error(`  actual : ${actual}`);
      mismatches++;
    }
  }

  for (const rel of claimed.keys()) {
    if (!onDisk.has(rel)) {
      console.error(`[missing on disk] ${rel}`);
      missingOnDisk++;
    }
  }

  console.log(`Lines in checksums.sha256: ${totalLines}`);
  console.log(`Files on disk (minus checksums.sha256): ${onDisk.size}`);
  console.log(`Bad lines: ${badLineCount}`);
  console.log(`Hash mismatches: ${mismatches}`);
  console.log(`Files missing in manifest: ${missingInManifest}`);
  console.log(`Files missing on disk: ${missingOnDisk}`);

  // D-A1-002: an internally self-consistent checksums.sha256 (every claimed
  // hash matches a file on disk, one-to-one) can still be systematically
  // WRONG if the on-disk state itself is a corrupted/partial checkout — the
  // checks above have no way to notice that, say, 10 record files silently
  // went missing before the walk ran. Cross-check manifest.json's declared
  // record_count (and split sizes) against independent signals that all move
  // together when the package is intact.
  const manifestPath = join(PACKAGE_DIR, MANIFEST_FILE);
  const manifestParsed = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    record_count?: unknown;
    splits?: { train?: unknown; test?: unknown };
    pair_count?: unknown;
    standalone_count?: unknown;
    songs_count?: unknown;
    songs_included?: unknown;
  };
  if (typeof manifestParsed.record_count !== "number") {
    throw new Error(`${manifestPath} has no numeric 'record_count' field`);
  }
  const manifestSummary: PackageManifestSummary = {
    record_count: manifestParsed.record_count,
  };
  if (typeof manifestParsed.pair_count === "number") {
    manifestSummary.pair_count = manifestParsed.pair_count;
  }
  if (typeof manifestParsed.standalone_count === "number") {
    manifestSummary.standalone_count = manifestParsed.standalone_count;
  }
  if (typeof manifestParsed.songs_count === "number") {
    manifestSummary.songs_count = manifestParsed.songs_count;
  }
  if (
    Array.isArray(manifestParsed.songs_included) &&
    manifestParsed.songs_included.every((s) => typeof s === "string")
  ) {
    manifestSummary.songs_included = manifestParsed.songs_included as string[];
  }
  if (
    manifestParsed.splits &&
    typeof manifestParsed.splits.train === "number" &&
    typeof manifestParsed.splits.test === "number"
  ) {
    manifestSummary.splits = {
      train: manifestParsed.splits.train,
      test: manifestParsed.splits.test,
    };
  }

  const generatedDirs: GeneratedDirCompletenessInput[] = inputs.generated_dirs.map(
    (dir) => {
      const prefix = `${dir}/`;
      let onDiskCount = 0;
      for (const rel of onDisk.keys()) if (rel.startsWith(prefix)) onDiskCount++;
      let checksumsCount = 0;
      for (const rel of claimed.keys()) if (rel.startsWith(prefix)) checksumsCount++;
      return { dir, onDiskCount, checksumsCount };
    },
  );

  let recordsJsonlLineCount: number | undefined;
  const recordsJsonlPath = join(PACKAGE_DIR, RECORDS_JSONL_FILE);
  if (existsSync(recordsJsonlPath)) {
    recordsJsonlLineCount = readFileSync(recordsJsonlPath, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.length > 0).length;
  }

  let splitsJson: { train: number; test: number } | undefined;
  const splitsPath = join(PACKAGE_DIR, SPLITS_FILE);
  if (existsSync(splitsPath)) {
    const splitsParsed = JSON.parse(readFileSync(splitsPath, "utf8")) as {
      train?: unknown;
      test?: unknown;
    };
    if (Array.isArray(splitsParsed.train) && Array.isArray(splitsParsed.test)) {
      splitsJson = {
        train: splitsParsed.train.length,
        test: splitsParsed.test.length,
      };
    }
  }

  const completenessProblems = checkManifestCompleteness({
    manifest: manifestSummary,
    generatedDirs,
    recordsJsonlLineCount,
    splitsJson,
  });
  for (const p of completenessProblems) {
    console.error(`[completeness] ${p}`);
  }
  console.log(`Manifest completeness problems: ${completenessProblems.length}`);

  if (
    badLineCount === 0 &&
    mismatches === 0 &&
    missingInManifest === 0 &&
    missingOnDisk === 0 &&
    totalLines === onDisk.size &&
    completenessProblems.length === 0
  ) {
    console.log("[ok] All checksums verify, every file accounted for.");
  } else {
    console.error("[FAIL] Verification failed.");
    process.exit(1);
  }
}

main();
