// Slice 10.5 verification — walk the package, recompute SHA-256 for each file,
// confirm every line in checksums.sha256 matches and every file is covered.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { sha256Hex } from "../src/dataset/package-public.js";

const PACKAGE_DIR = "datasets/jam-actions-v0-public";
const CHECKSUMS_FILE = "checksums.sha256";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (st.isFile()) out.push(full);
  }
  return out;
}

function main(): void {
  const allFiles = walk(PACKAGE_DIR);
  const onDisk = new Map<string, Buffer>();
  for (const full of allFiles) {
    let rel = relative(PACKAGE_DIR, full);
    if (sep !== "/") rel = rel.split(sep).join("/");
    if (rel === CHECKSUMS_FILE) continue;
    onDisk.set(rel, readFileSync(full));
  }

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
