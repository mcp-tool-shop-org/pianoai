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
// them and produced a 112-entry manifest where 115 are published.
//
// ONE FIELD IS NOT PORTABLE, and it is worth stating plainly rather than
// hiding behind a tolerance. `observation.render.wav_sha256` is the hash of the
// waveform the recipe produces, and the renderer calls Math.pow and Math.sin
// per sample. Neither is required by ECMA-262 to be correctly rounded, and V8's
// results changed between the versions in Node 22 and Node 24: of the 27,869
// distinct Math.pow(2, x) arguments this corpus evaluates, 253 (0.91%) return a
// different double. Almost all of those vanish under int16 quantisation, but
// two of the 108 records — both the `extra` perturbation of Für Elise, whose
// motif lands on MIDI 63 where Math.pow(2, -0.5) itself differs by one unit in
// the last place — come out with a different waveform hash.
//
// So the gate is split. Everything except that field must reproduce on ANY
// engine, which is what catches a semantics change in the scaffolding. The full
// byte check, wav_sha256 included, runs on the engine the corpus was generated
// with, because that is the only claim that is true.

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

/** The Node major the published corpus was generated on. */
const GENERATED_ON_NODE_MAJOR = 22;
const onGeneratingEngine =
  Number.parseInt(process.versions.node.split(".")[0]!, 10) === GENERATED_ON_NODE_MAJOR;

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

/** Published records as objects, in published order. */
function publishedRecords(): Array<Record<string, unknown>> {
  return readFileSync(join(CORPUS, "records.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

/** The record with the one engine-dependent field removed. */
function withoutWavHash(r: unknown): unknown {
  const clone = JSON.parse(JSON.stringify(r)) as Record<string, any>;
  if (clone.observation?.render) delete clone.observation.render.wav_sha256;
  return clone;
}

describe("acoustic corpus through ExperimentTask", () => {
  it("covers every published path, with none left unchecked", () => {
    const published = publishedChecksums();
    const built = corpusFiles(buildAllRecords());

    // checksums.sha256 is derived from the map, so it is not in the map.
    expect([...built.keys()].sort()).toEqual([...published.keys()].sort());
    expect(published.size).toBe(115);
    expect([...published.keys()].filter((k) => k.startsWith("records/"))).toHaveLength(108);
  });

  it("reproduces every record except the waveform hash, on any engine", () => {
    // The portable claim. A change in how a record is built fails here whatever
    // JS engine you are on; only the sampled audio's hash is exempt.
    const built = buildAllRecords().map(withoutWavHash);
    const published = publishedRecords().map(withoutWavHash);
    expect(built.length).toBe(108);
    expect(built).toEqual(published);
  });

  it.runIf(onGeneratingEngine)(
    "matches the published hash for all 115 files, on the generating engine",
    () => {
      const published = publishedChecksums();
      const built = corpusFiles(buildAllRecords());
      for (const [rel, content] of built) {
        expect(sha256(content), rel).toBe(published.get(rel));
      }
    },
  );

  it.runIf(onGeneratingEngine)(
    "regenerates checksums.sha256 itself byte for byte, on the generating engine",
    () => {
      // The manifest is derived, so it is reproducible too. If it were not, a
      // consumer verifying the download would disagree with the repo.
      const built = checksumManifest(corpusFiles(buildAllRecords()));
      expect(built).toBe(readFileSync(join(CORPUS, "checksums.sha256"), "utf8"));
    },
  );
});
