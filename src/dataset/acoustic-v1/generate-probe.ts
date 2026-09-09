#!/usr/bin/env tsx
// ─── jam-actions-v1-probe: evaluation-only near-gate takes ───────────────────
//
// Never split, never trained on, never merged into jam-actions-v1.
// Nine held-out songs. Gold from the two-sided predicates.

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPublishableSongs } from "./library.js";
import { buildAcousticTake, testSongIds, type V1BuildOpts } from "./builder.js";
import { keepFromApplied, type F5Kept } from "./f5-acoustic.js";
import type { SongEntry } from "../../songs/types.js";
import type { V1Record } from "./schema.js";

export const PROBE_SCHEMA_VERSION = "jam-actions-v1-probe/1.0.0";
export const ONSET_TOL_MS = 8;
export const CENTS_TOL = 3;

const ONSET_INSIDE_TARGET = 30;
const ONSET_OUTSIDE_TARGET = 50;
const CENTS_INSIDE_TARGET = 45;
const CENTS_OUTSIDE_TARGET = 55;
const CENTS_CARRIER = 20;
const DELAY_CARRIER_SEC = 0.02;
const BIAS_MS = 21;

export type ProbeBand = "onset_in" | "onset_out" | "cents_in" | "cents_out";

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function searchOnset(song: SongEntry, targetOnset: number, cents_shift: number): F5Kept | null {
  const guess = (targetOnset + BIAS_MS) / 1000;
  let best: F5Kept | null = null;
  let bestErr = Infinity;
  for (let step = -12; step <= 12; step++) {
    const delay_sec = guess + step * 0.002;
    const kept = keepFromApplied(song, cents_shift, delay_sec);
    if (!kept) continue;
    const err = Math.abs(kept.measured_onset_ms - targetOnset);
    if (err < bestErr) {
      best = kept;
      bestErr = err;
    }
    if (err <= ONSET_TOL_MS) return kept;
  }
  return bestErr <= ONSET_TOL_MS ? best : null;
}

function searchCents(song: SongEntry, targetCents: number, delay_sec: number): F5Kept | null {
  let best: F5Kept | null = null;
  let bestErr = Infinity;
  for (let step = -6; step <= 6; step++) {
    const cents_shift = targetCents + step * 0.5;
    const kept = keepFromApplied(song, cents_shift, delay_sec);
    if (!kept) continue;
    const err = Math.abs(kept.measured_cents - targetCents);
    if (err < bestErr) {
      best = kept;
      bestErr = err;
    }
    if (err <= CENTS_TOL) return kept;
  }
  return bestErr <= CENTS_TOL ? best : null;
}

export function buildProbeRecords(opts: V1BuildOpts = {}): { records: V1Record[]; applied: Array<Record<string, unknown>> } {
  const songs = loadPublishableSongs();
  const testIds = testSongIds(songs);
  const held = songs.filter((s) => testIds.has(s.id));
  const records: V1Record[] = [];
  const applied: Array<Record<string, unknown>> = [];
  const usedPaths = new Set<string>();

  const jobs: Array<{ band: ProbeBand; sign: 1 | -1; find: (s: SongEntry) => F5Kept | null }> = [
    { band: "onset_in", sign: 1, find: (s) => searchOnset(s, ONSET_INSIDE_TARGET, CENTS_CARRIER) },
    { band: "onset_in", sign: -1, find: (s) => searchOnset(s, -ONSET_INSIDE_TARGET, CENTS_CARRIER) },
    { band: "onset_out", sign: 1, find: (s) => searchOnset(s, ONSET_OUTSIDE_TARGET, CENTS_CARRIER) },
    { band: "onset_out", sign: -1, find: (s) => searchOnset(s, -ONSET_OUTSIDE_TARGET, CENTS_CARRIER) },
    { band: "cents_in", sign: 1, find: (s) => searchCents(s, CENTS_INSIDE_TARGET, DELAY_CARRIER_SEC) },
    { band: "cents_in", sign: -1, find: (s) => searchCents(s, -CENTS_INSIDE_TARGET, DELAY_CARRIER_SEC) },
    { band: "cents_out", sign: 1, find: (s) => searchCents(s, CENTS_OUTSIDE_TARGET, DELAY_CARRIER_SEC) },
    { band: "cents_out", sign: -1, find: (s) => searchCents(s, -CENTS_OUTSIDE_TARGET, DELAY_CARRIER_SEC) },
  ];

  for (const song of held) {
    for (const job of jobs) {
      const kept = job.find(song);
      if (!kept) throw new Error(`probe search failed ${song.id} ${job.band} sign=${job.sign}`);
      const id = `acoustic-probe:${song.id}:${job.band}:${job.sign === 1 ? "p" : "n"}`;
      const rec = buildAcousticTake(song, kept, id, "test", {
        schema_version: PROBE_SCHEMA_VERSION,
        band: job.band,
        ...opts,
      });
      const path = rec.target_trace.session
        .flatMap((t) => (t.role === "assistant" && t.tool_calls ? t.tool_calls : []))
        .map((tc) => tc.arguments.path)
        .find((p) => typeof p === "string") as string | undefined;
      if (path) {
        if (usedPaths.has(path)) throw new Error(`probe path collision ${path}`);
        usedPaths.add(path);
      }
      records.push(rec);
      applied.push({
        id,
        band: job.band,
        sign: job.sign,
        applied_cents: kept.cents_shift,
        applied_delay_ms: kept.delay_sec * 1000,
        measured_cents: kept.measured_cents,
        measured_onset_ms: kept.measured_onset_ms,
        gold: kept.gold,
      });
    }
  }
  return { records, applied };
}

export function writeProbeCorpus(outDir?: string, opts: V1BuildOpts = {}): { n: number; outDir: string } {
  const dest = outDir ?? join(
    dirname(fileURLToPath(import.meta.url)),
    "..", "..", "..",
    "datasets", "jam-actions-v1-probe",
  );
  const { records, applied } = buildProbeRecords(opts);
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(join(dest, "records"), { recursive: true });
  writeFileSync(join(dest, "records.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  for (const r of records) {
    writeFileSync(
      join(dest, "records", `${r.id.replace(/[:\\/|]/g, "_")}.json`),
      JSON.stringify(r, null, 2) + "\n",
      "utf8",
    );
  }
  writeFileSync(join(dest, "applied.json"), JSON.stringify(applied, null, 2) + "\n", "utf8");
  writeFileSync(join(dest, "splits.json"), JSON.stringify({
    strategy: "eval-only; nine held-out songs; never trained on",
    train: [],
    test: records.map((r) => r.id),
  }, null, 2) + "\n", "utf8");
  writeFileSync(join(dest, "manifest.json"), JSON.stringify({
    dataset_name: "jam-actions-v1-probe",
    schema_version: PROBE_SCHEMA_VERSION,
    version: "1.0.0",
    record_count: records.length,
    bands: ["onset_in", "onset_out", "cents_in", "cents_out"],
    onset_tol_ms: ONSET_TOL_MS,
    cents_tol: CENTS_TOL,
  }, null, 2) + "\n", "utf8");
  writeFileSync(join(dest, "README.md"), `# jam-actions-v1-probe

Eval-only near-gate takes. Schema \`${PROBE_SCHEMA_VERSION}\`.
Never split, never trained on, never merged into jam-actions-v1.

n=${records.length}. Nine held-out songs × four bands × both signs.
Gold from the two-sided predicates. Applied recipes in \`applied.json\`.
`, "utf8");
  writeFileSync(join(dest, "PROVENANCE-NOTE.md"), `# Provenance

Same publishable shelf and exclusions as jam-actions-v1.
Eval-only; no training split.
`, "utf8");

  const files: string[] = [];
  function walk(dir: string, prefix: string): void {
    for (const name of readdirSync(dir).sort()) {
      if (name === "checksums.sha256") continue;
      const full = join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, rel);
      else files.push(rel);
    }
  }
  walk(dest, "");
  const lines = files.sort().map((rel) => `${sha256(readFileSync(join(dest, ...rel.split("/"))))}  ${rel}`);
  writeFileSync(join(dest, "checksums.sha256"), lines.join("\n") + "\n", "utf8");
  return { n: records.length, outDir: dest };
}

const invoked = Boolean(
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)),
);
if (invoked) {
  const bare = process.argv.includes("--bare-label");
  const plain = process.argv.includes("--plain-comparison");
  const r = writeProbeCorpus(undefined, { acousticBareLabel: bare, acousticPlainComparison: plain });
  const variant = bare ? "bare-label" : plain ? "plain-comparison" : "arithmetic";
  process.stdout.write(`wrote ${r.n} probe records (${variant}) to ${r.outDir}\n`);
}
