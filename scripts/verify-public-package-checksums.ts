// Slice 10.5 / 11.5 verification — walk the package, recompute SHA-256 for
// each file, confirm every line in checksums.sha256 matches and every file is
// covered.
//
// Slice 11.5: walk is driven by `walkChecksumFiles()` + package-inputs.json.
// Undeclared files are warned (not fatal) so the verifier matches the
// regenerator's behavior.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  readPackageInputs,
  sha256Hex,
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
        `Included in checksum walk anyway (Slice 11.5 data-preservation rule).`,
    );
  }

  const onDisk = new Map<string, Buffer>();
  for (const { relPath, content } of files) onDisk.set(relPath, content);

  const manifestStr = readFileSync(join(PACKAGE_DIR, CHECKSUMS_FILE), "utf8");
  const lines = manifestStr.split("\n").filter((l) => l.length > 0);

  const claimed = new Map<string, string>();
  let badLineCount = 0;
  for (const line of lines) {
    // Format: "<64-hex>  <relpath>"
    const m = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!m) {
      console.error(`[bad line] ${line}`);
      badLineCount++;
      continue;
    }
    claimed.set(m[2], m[1]);
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

  console.log(`Lines in checksums.sha256: ${lines.length}`);
  console.log(`Files on disk (minus checksums.sha256): ${onDisk.size}`);
  console.log(`Bad lines: ${badLineCount}`);
  console.log(`Hash mismatches: ${mismatches}`);
  console.log(`Files missing in manifest: ${missingInManifest}`);
  console.log(`Files missing on disk: ${missingOnDisk}`);
  if (
    badLineCount === 0 &&
    mismatches === 0 &&
    missingInManifest === 0 &&
    missingOnDisk === 0 &&
    lines.length === onDisk.size
  ) {
    console.log("[ok] All checksums verify, every file accounted for.");
  } else {
    console.error("[FAIL] Verification failed.");
    process.exit(1);
  }
}

main();
