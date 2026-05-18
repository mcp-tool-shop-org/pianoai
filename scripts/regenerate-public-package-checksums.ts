// Slice 10.5 / 11.5 — regenerate datasets/jam-actions-v0-public/checksums.sha256
//
// After any package change (curated doc update, generated regen, etc.) the
// shipped checksums.sha256 may be stale. This script walks the package via
// `walkChecksumFiles()` (which uses datasets/jam-actions-v0-public/package-inputs.json
// as the contract), hashes every file (EXCEPT checksums.sha256 itself), sorts
// by relative path, formats via `buildChecksumsManifest()`, and writes the
// new file in place.
//
// Run: pnpm exec tsx scripts/regenerate-public-package-checksums.ts
//
// Slice 11.5: no hardcoded file list; discovery is driven by
// `walkChecksumFiles()` + package-inputs.json. Undeclared files in the package
// dir are warned-and-included (per the Slice 11.5 spec: preserve data; flag
// for human review).

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildChecksumsManifest,
  readPackageInputs,
  walkChecksumFiles,
} from "../src/dataset/package-public.js";

const PACKAGE_DIR = "datasets/jam-actions-v0-public";
const CHECKSUMS_FILE = "checksums.sha256";

function main(): void {
  const inputs = readPackageInputs(PACKAGE_DIR);
  const { files, undeclared } = walkChecksumFiles(PACKAGE_DIR, inputs);

  for (const u of undeclared) {
    console.warn(
      `[warn] Undeclared file in package dir: ${u}. ` +
        `Including in checksums for data preservation; declare it explicitly in package-inputs.json.`,
    );
  }

  const manifestStr = buildChecksumsManifest(files);
  const outPath = join(PACKAGE_DIR, CHECKSUMS_FILE);
  writeFileSync(outPath, manifestStr);

  const lines = manifestStr.split("\n").filter((l) => l.length > 0);
  if (lines.length !== files.length) {
    throw new Error(
      `Line count mismatch: expected ${files.length} lines, got ${lines.length}`,
    );
  }
  console.log(
    `[ok] Regenerated ${outPath}: ${lines.length} lines (one per file, excluding checksums.sha256 itself).`,
  );
  if (undeclared.length > 0) {
    console.log(`     ${undeclared.length} undeclared file(s) preserved.`);
  }
}

main();
