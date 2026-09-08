// ─── Published corpus is reproducible through the scaffolding ────────────────
//
// Every path in checksums.sha256, hashed from memory, compared to the published
// hash. Do not write the published tree. If a byte moves, this fails — that is
// a finding, not a reason to regenerate checksums.
//
// It checks ALL 115 paths, not only the records. An earlier version checked
// records.jsonl and the 108 record files, which left six published files
// unverified — and three of them (VERSION, CITATION.cff, LICENSE-DATASET.md)
// were not emitted by the generator at all, so regenerating the corpus deleted
// them and produced a 112-entry manifest where 115 are published. A gate that
// covers 109 of 115 reports "reproducible" about a tree that is not.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";
import { buildAllRecords, checksumManifest, corpusFiles } from "./generate-corpus.js";

vi.setConfig({ testTimeout: 30_000 });

const CORPUS = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..",
  "datasets", "jam-actions-acoustic-v0",
);

function sha256(content: string): string {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}

function publishedChecksums(): Map<string, string> {
  const map = new Map<string, string>();
  const raw = readFileSync(join(CORPUS, "checksums.sha256"), "utf8");
  for (const line of raw.trim().split("\n")) {
    map.set(line.slice(66).trim(), line.slice(0, 64));
  }
  return map;
}

describe("acoustic corpus through ExperimentTask is byte-identical", () => {
  it("covers every published path, with none left unchecked", () => {
    const published = publishedChecksums();
    const built = corpusFiles(buildAllRecords());

    // checksums.sha256 is derived from the map, so it is not in the map.
    expect([...built.keys()].sort()).toEqual([...published.keys()].sort());
    expect(published.size).toBe(115);
    expect([...published.keys()].filter((k) => k.startsWith("records/"))).toHaveLength(108);
  });

  it("matches the published hash for all 115 files", () => {
    const published = publishedChecksums();
    const built = corpusFiles(buildAllRecords());
    for (const [rel, content] of built) {
      expect(sha256(content), rel).toBe(published.get(rel));
    }
  });

  it("regenerates checksums.sha256 itself byte for byte", () => {
    // The manifest is derived, so it is reproducible too. If it were not, a
    // consumer verifying the download would disagree with the repo.
    const built = checksumManifest(corpusFiles(buildAllRecords()));
    expect(built).toBe(readFileSync(join(CORPUS, "checksums.sha256"), "utf8"));
  });
});
