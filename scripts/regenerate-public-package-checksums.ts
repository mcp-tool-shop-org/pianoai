// Slice 10.5 — regenerate datasets/jam-actions-v0-public/checksums.sha256
//
// After the Slice 10.5 doc-hardening writes (README updated; DATASET_SCHEMA.md,
// KNOWN_LIMITATIONS.md, ATTRIBUTION.md added; manifest version bump; VERSION bump;
// CITATION version bump), the checksums file shipped by Slice 10 is stale.
//
// This script walks the package directory recursively, hashes every file
// (EXCEPT checksums.sha256 itself), sorts by relative path, formats per the
// Slice 10 convention via `buildChecksumsManifest()` in src/dataset/package-public.ts,
// and writes the new file in place.
//
// Run: pnpm exec tsx scripts/regenerate-public-package-checksums.ts

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { buildChecksumsManifest } from "../src/dataset/package-public.js";

const PACKAGE_DIR = "datasets/jam-actions-v0-public";
const CHECKSUMS_FILE = "checksums.sha256";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (st.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function main(): void {
  const allFiles = walk(PACKAGE_DIR);

  const inputs: Array<{ relPath: string; content: Buffer }> = [];
  for (const full of allFiles) {
    // relPath relative to PACKAGE_DIR, with forward slashes
    let rel = relative(PACKAGE_DIR, full);
    if (sep !== "/") rel = rel.split(sep).join("/");
    if (rel === CHECKSUMS_FILE) continue;
    inputs.push({ relPath: rel, content: readFileSync(full) });
  }

  const manifestStr = buildChecksumsManifest(inputs);
  const outPath = join(PACKAGE_DIR, CHECKSUMS_FILE);
  writeFileSync(outPath, manifestStr);

  // Self-check: parse the manifest and verify line count matches inputs.length
  const lines = manifestStr.split("\n").filter((l) => l.length > 0);
  if (lines.length !== inputs.length) {
    throw new Error(
      `Line count mismatch: expected ${inputs.length} lines, got ${lines.length}`,
    );
  }
  console.log(
    `[ok] Regenerated ${outPath}: ${lines.length} lines (one per file, excluding checksums.sha256 itself).`,
  );
}

main();
