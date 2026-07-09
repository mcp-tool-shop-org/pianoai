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
//      pnpm exec tsx scripts/regenerate-public-package-checksums.ts --allow-count-change
//
// Slice 11.5: no hardcoded file list; discovery is driven by
// `walkChecksumFiles()` + package-inputs.json. Undeclared files in the package
// dir are warned-and-included (per the Slice 11.5 spec: preserve data; flag
// for human review).
//
// D-A1-002: this script refuses to change the NUMBER of checksum entries
// unless invoked with an explicit --allow-count-change flag. Without this
// guard, running the regenerator against a corrupted/partial checkout — an
// interrupted rsync, a bad merge, a record accidentally deleted — would
// silently re-hash whatever happens to be on disk and produce a
// checksums.sha256 that is fully self-consistent with the corrupted state,
// passing verify-public-package-checksums.ts with no trace that anything was
// ever wrong. A same-count regen (content changed, file set unchanged) is
// unaffected and proceeds without the flag, same as before.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildChecksumsManifest,
  parseChecksumsManifest,
  readPackageInputs,
  walkChecksumFiles,
} from "../src/dataset/package-public.js";

const PACKAGE_DIR = "datasets/jam-actions-v0-public";
const CHECKSUMS_FILE = "checksums.sha256";

interface CliArgs {
  allowCountChange: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let allowCountChange = false;
  for (const a of argv) {
    if (a === "--allow-count-change") {
      allowCountChange = true;
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown arg: ${a}`);
    }
  }
  return { allowCountChange };
}

function printHelp(): void {
  console.log(`Usage: pnpm exec tsx scripts/regenerate-public-package-checksums.ts [options]

Regenerates datasets/jam-actions-v0-public/checksums.sha256 from the files
currently on disk (via walkChecksumFiles() + package-inputs.json).

Options:
  --allow-count-change   Required to proceed if the number of checksum
                          entries would change from the currently-committed
                          checksums.sha256 (D-A1-002). Without this flag, a
                          count change is refused: this is the guard against
                          silently re-hashing a corrupted/partial checkout
                          (e.g. an interrupted rsync or bad merge that dropped
                          record files) into a checksums file that then looks
                          fully self-consistent to the verifier.
`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const inputs = readPackageInputs(PACKAGE_DIR);
  const { files, undeclared } = walkChecksumFiles(PACKAGE_DIR, inputs);

  for (const u of undeclared) {
    console.warn(
      `[warn] Undeclared file in package dir: ${u}. ` +
        `Including in checksums for data preservation; declare it explicitly in package-inputs.json.`,
    );
  }

  const newCount = files.length;
  const outPath = join(PACKAGE_DIR, CHECKSUMS_FILE);

  if (existsSync(outPath)) {
    const oldManifestStr = readFileSync(outPath, "utf8");
    const oldCount = parseChecksumsManifest(oldManifestStr).claimed.size;
    if (oldCount !== newCount) {
      const delta = newCount - oldCount;
      if (!args.allowCountChange) {
        console.error(
          `[refused] checksums.sha256 currently has ${oldCount} entries; regenerating now ` +
            `would produce ${newCount} entries (${delta > 0 ? "+" : ""}${delta}).`,
        );
        console.error(
          `[refused] Refusing to change the checksum entry count without --allow-count-change. ` +
            `If this count change is expected (e.g. a deliberate package resize), re-run with ` +
            `--allow-count-change to proceed. If it is NOT expected, STOP — investigate why the ` +
            `file count changed (partial checkout, bad merge, interrupted rsync) before ` +
            `regenerating checksums. See D-A1-002.`,
        );
        process.exit(1);
      }
      console.log(
        `[allowed] Checksum entry count is changing (${oldCount} -> ${newCount}) with --allow-count-change set.`,
      );
    }
  } else {
    console.log(
      `[bootstrap] No existing ${outPath} found; writing ${newCount} entries for the first time.`,
    );
  }

  const manifestStr = buildChecksumsManifest(files);
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
