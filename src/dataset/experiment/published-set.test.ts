// ─── The registry must know every published schema_version ───────────────────
//
// The collision guard is only as good as its list. It shipped knowing 2 of the
// 12 schema_versions actually published under datasets/, which meant a new task
// could claim `release-gate-assessment/2.0.0` and the guard would wave it
// through while reporting that it had checked.
//
// This derives the truth from disk. Publish a new corpus and forget to register
// it, and this goes red instead of the hole staying quiet.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";
import { publishedOwner } from "./registry.js";

vi.setConfig({ testTimeout: 60_000 });

const DATASETS = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..",
  "datasets",
);

/** Every distinct schema_version literal appearing under datasets/. */
function publishedSchemaVersions(): string[] {
  const found = new Set<string>();
  const pattern = /"schema_version"\s*:\s*"([^"]+)"/g;

  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name.endsWith(".json") || name.endsWith(".jsonl")) {
        const body = readFileSync(full, "utf8");
        for (const m of body.matchAll(pattern)) found.add(m[1]!);
      }
    }
  }

  walk(DATASETS);
  return [...found].sort();
}

describe("published schema registry", () => {
  it("has an owner for every schema_version published under datasets/", () => {
    const published = publishedSchemaVersions();
    expect(published.length).toBeGreaterThan(1);

    const unregistered = published.filter((v) => publishedOwner(v) === undefined);
    expect(unregistered, `unregistered published schema_versions: ${unregistered.join(", ")}`)
      .toEqual([]);
  });
});
