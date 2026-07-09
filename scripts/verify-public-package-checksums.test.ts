// ─── verify-public-package-checksums.test.ts ─────────────────────────────────
//
// Tests pinning D-A1-002 / F-b74e0249 (CRITICAL): a checksums.sha256 that is
// internally self-consistent — every claimed hash matches a file on disk,
// one-to-one — can still be systematically WRONG if the package itself was
// built from a corrupted or partial checkout (bad merge, interrupted rsync,
// a re-run against a checkout silently missing whole records). That
// corrupted state re-hashes cleanly and used to "pass" verify-public-
// package-checksums.ts, which is the first of only two pre-flight checks
// gating an irreversible Zenodo DOI mint.
//
// Two layers of coverage:
//   1. Direct unit tests against `checkManifestCompleteness()` — the pure
//      cross-check function the fix introduced in package-public.ts. Fast,
//      exhaustive over the cross-check's branches.
//   2. One end-to-end child-process test against the real CLI script with a
//      constructed fixture directory (checksums self-consistent, manifest
//      record_count wrong) asserting the process exits non-zero — proving
//      main()'s wiring of the pure function's output into process.exit(1),
//      which the unit tests alone don't cover.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import {
  checkManifestCompleteness,
  buildChecksumsManifest,
  type CompletenessCheckInputs,
} from "../src/dataset/package-public.js";

// ─── Unit tests: checkManifestCompleteness (pure function) ───────────────────

function baseInputs(): CompletenessCheckInputs {
  return {
    manifest: { record_count: 5, splits: { train: 4, test: 1 } },
    generatedDirs: [
      { dir: "records", onDiskCount: 5, checksumsCount: 5 },
      { dir: "pianoroll", onDiskCount: 5, checksumsCount: 5 },
    ],
    recordsJsonlLineCount: 5,
    splitsJson: { train: 4, test: 1 },
  };
}

describe("checkManifestCompleteness", () => {
  it("returns no problems when every independent signal agrees", () => {
    expect(checkManifestCompleteness(baseInputs())).toEqual([]);
  });

  it("flags a mismatch between record_count and a generated dir's on-disk file count", () => {
    const inputs = baseInputs();
    inputs.generatedDirs = [
      { dir: "records", onDiskCount: 2, checksumsCount: 5 },
      { dir: "pianoroll", onDiskCount: 5, checksumsCount: 5 },
    ];
    const problems = checkManifestCompleteness(inputs);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((p) => p.includes("records/") && p.includes("disk"))).toBe(true);
  });

  it("flags a mismatch between record_count and a generated dir's checksums.sha256 entry count", () => {
    const inputs = baseInputs();
    inputs.generatedDirs = [
      { dir: "records", onDiskCount: 5, checksumsCount: 3 },
      { dir: "pianoroll", onDiskCount: 5, checksumsCount: 5 },
    ];
    const problems = checkManifestCompleteness(inputs);
    expect(problems.some((p) => p.includes("records/") && p.includes("checksums.sha256"))).toBe(true);
  });

  it("flags a mismatch between record_count and records.jsonl line count", () => {
    const inputs = baseInputs();
    inputs.recordsJsonlLineCount = 4;
    const problems = checkManifestCompleteness(inputs);
    expect(problems.some((p) => p.includes("records.jsonl"))).toBe(true);
  });

  it("flags a mismatch between record_count and manifest.splits' own sum", () => {
    const inputs = baseInputs();
    inputs.manifest.splits = { train: 4, test: 2 }; // sums to 6, record_count is 5
    inputs.splitsJson = { train: 4, test: 2 };
    const problems = checkManifestCompleteness(inputs);
    expect(problems.some((p) => p.includes("does not sum to record_count"))).toBe(true);
  });

  it("flags a mismatch between manifest.splits and the actual splits.json list lengths", () => {
    const inputs = baseInputs();
    inputs.splitsJson = { train: 3, test: 1 }; // manifest declares train:4
    const problems = checkManifestCompleteness(inputs);
    expect(
      problems.some((p) => p.includes("splits.train") && p.includes("splits.json")),
    ).toBe(true);
  });

  it("does not check splits when manifest.splits is absent (optional field)", () => {
    const inputs = baseInputs();
    delete inputs.manifest.splits;
    inputs.splitsJson = { train: 999, test: 999 }; // would mismatch if checked
    expect(checkManifestCompleteness(inputs)).toEqual([]);
  });

  it("does not check records.jsonl when its line count is not supplied (file absent from package)", () => {
    const inputs = baseInputs();
    delete inputs.recordsJsonlLineCount;
    expect(checkManifestCompleteness(inputs)).toEqual([]);
  });

  it("reports every independent problem simultaneously, not just the first", () => {
    const inputs = baseInputs();
    inputs.generatedDirs = [
      { dir: "records", onDiskCount: 2, checksumsCount: 2 },
      { dir: "pianoroll", onDiskCount: 2, checksumsCount: 2 },
    ];
    inputs.recordsJsonlLineCount = 2;
    const problems = checkManifestCompleteness(inputs);
    // 2 dirs x 2 checks (on-disk + checksums) + records.jsonl = 5 problems.
    expect(problems.length).toBe(5);
  });

  it("never throws — pure function per its own contract", () => {
    expect(() => checkManifestCompleteness(baseInputs())).not.toThrow();
  });
});

// ─── End-to-end: the real CLI script exits non-zero on this exact scenario ──

describe("verify-public-package-checksums.ts CLI — exits non-zero when checksums are self-consistent but manifest.json lies about record_count", () => {
  let fixtureRoot: string | undefined;

  afterEach(() => {
    if (fixtureRoot) {
      rmSync(fixtureRoot, { recursive: true, force: true });
      fixtureRoot = undefined;
    }
  });

  it(
    "exits non-zero on a fixture package dir where checksums.sha256 verifies cleanly but manifest.json.record_count (5) does not match the 2 actual records",
    () => {
      fixtureRoot = mkdtempSync(join(tmpdir(), "ajs-checksums-fixture-"));
      const packageDir = join(fixtureRoot, "datasets", "jam-actions-v0-public");
      mkdirSync(join(packageDir, "records"), { recursive: true });
      mkdirSync(join(packageDir, "pianoroll"), { recursive: true });

      writeFileSync(
        join(packageDir, "package-inputs.json"),
        JSON.stringify(
          {
            version_file: "VERSION",
            curated_files: [],
            generated_files: ["manifest.json", "splits.json"],
            generated_dirs: ["records", "pianoroll"],
          },
          null,
          2,
        ) + "\n",
      );
      writeFileSync(join(packageDir, "VERSION"), "0.0.1-test\n");
      writeFileSync(
        join(packageDir, "manifest.json"),
        JSON.stringify(
          {
            dataset_name: "jam-actions-v0-public",
            version: "0.0.1-test",
            // WRONG on purpose — only 2 records actually exist below. This
            // is the fixture's whole point: checksums are self-consistent,
            // but this field lies about how many records the package holds.
            record_count: 5,
            splits: { train: 1, test: 1 },
          },
          null,
          2,
        ) + "\n",
      );
      writeFileSync(
        join(packageDir, "splits.json"),
        JSON.stringify({ train: ["fixture-a"], test: ["fixture-b"] }, null, 2) + "\n",
      );
      writeFileSync(
        join(packageDir, "records", "fixture-a.json"),
        JSON.stringify({ id: "fixture-a" }) + "\n",
      );
      writeFileSync(
        join(packageDir, "records", "fixture-b.json"),
        JSON.stringify({ id: "fixture-b" }) + "\n",
      );
      writeFileSync(join(packageDir, "pianoroll", "fixture-a.svg"), "<svg></svg>\n");
      writeFileSync(join(packageDir, "pianoroll", "fixture-b.svg"), "<svg></svg>\n");

      // Build a checksums.sha256 that is fully self-consistent with the
      // files just written, using the real packager helper — proving the
      // failure below is attributable to the manifest completeness
      // cross-check, not to a checksum mismatch.
      const filesForChecksum = [
        { relPath: "package-inputs.json", content: readFileSync(join(packageDir, "package-inputs.json")) },
        { relPath: "VERSION", content: readFileSync(join(packageDir, "VERSION")) },
        { relPath: "manifest.json", content: readFileSync(join(packageDir, "manifest.json")) },
        { relPath: "splits.json", content: readFileSync(join(packageDir, "splits.json")) },
        { relPath: "records/fixture-a.json", content: readFileSync(join(packageDir, "records", "fixture-a.json")) },
        { relPath: "records/fixture-b.json", content: readFileSync(join(packageDir, "records", "fixture-b.json")) },
        { relPath: "pianoroll/fixture-a.svg", content: readFileSync(join(packageDir, "pianoroll", "fixture-a.svg")) },
        { relPath: "pianoroll/fixture-b.svg", content: readFileSync(join(packageDir, "pianoroll", "fixture-b.svg")) },
      ];
      writeFileSync(join(packageDir, "checksums.sha256"), buildChecksumsManifest(filesForChecksum));

      // Resolve tsx's real CLI entry point from within the repo (not from
      // the fixture's cwd, which has no node_modules of its own) so the
      // child process can execute a .ts file directly — mirroring this
      // repo's own `"smoke": "node --import tsx src/smoke.ts"` convention.
      // The script's own `PACKAGE_DIR = "datasets/jam-actions-v0-public"`
      // constant is a plain cwd-relative string (confirmed by reading the
      // script), so setting the child process's cwd to fixtureRoot redirects
      // it onto this fixture without touching the real dataset on disk.
      const require = createRequire(import.meta.url);
      const tsxCliPath = require.resolve("tsx/cli");
      const scriptPath = fileURLToPath(
        new URL("./verify-public-package-checksums.ts", import.meta.url),
      );

      let threw = false;
      let status: number | null = null;
      try {
        execFileSync(process.execPath, [tsxCliPath, scriptPath], {
          cwd: fixtureRoot,
          env: process.env as Record<string, string>,
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (err) {
        threw = true;
        status = (err as { status: number | null }).status;
      }

      expect(threw).toBe(true);
      expect(status).not.toBe(0);
    },
    30000,
  );
});
