#!/usr/bin/env tsx
// ─── jam-actions-v1 -> SFT lines ─────────────────────────────────────────────
//
// Thin wrapper over the generic formatter in src/dataset/experiment/. The only
// work here is the envelope: v1 calls its class `family` and keeps the song id
// under `scope`, where the generic shape wants `kind` and `song_id`.
//
// Reads the COMMITTED corpus rather than rebuilding it, so what trains is what
// ships. Rebuilding would take 22 s and could disagree with the artifact by the
// last-place float noise the reproduction test tolerates.
//
//   pnpm exec tsx experiments/coverage-v1-sft/format-sft.ts

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatRecords, type SftSource } from "../../src/dataset/experiment/format-sft.js";
import type { V1Record } from "../../src/dataset/acoustic-v1/schema.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, "..", "..", "datasets", "jam-actions-v1", "records.jsonl");
const OUT = join(HERE, "data");

const SYSTEM_TEXT =
  "You are operating AI Jam Sessions, a music education platform. Use the tools " +
  "to answer. Your final turn is the answer alone, with no explanation.";

const records: V1Record[] = readFileSync(CORPUS, "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as V1Record);

const sources: SftSource[] = records.map((r) => ({
  id: r.id,
  split: r.split,
  kind: r.family,
  song_id: r.scope?.song_id ?? "(none)",
  session: r.target_trace.session,
}));

const { train, test } = formatRecords(sources, SYSTEM_TEXT);

// The held-out families must all be represented, or a per-family score is a
// number over a partly-empty table.
const testFamilies = new Set(test.map((l) => l.kind));
const trainFamilies = new Set(train.map((l) => l.kind));
const trainOnly = [...trainFamilies].filter((f) => !testFamilies.has(f)).sort();

// `catalog` (3 records) and `server` (1) have no song_id -- one is per-genre,
// the other is global -- so a split by song puts every one of them on the same
// side. Four records of 305 therefore train something the held-out split can
// never score.
//
// Reported, not thrown: it does not invalidate the run, and blocking here would
// stop a training pass over a detail worth four records. But a per-family table
// must not silently omit them, so the number goes in the eval and in this
// output rather than being discovered later.
if (trainOnly.length > 0) {
  const counts = trainOnly.map((f) => `${f}=${train.filter((l) => l.kind === f).length}`);
  process.stdout.write(
    `NOTE: ${trainOnly.length} famil${trainOnly.length === 1 ? "y is" : "ies are"} train-only ` +
    `(${counts.join(", ")}). Those records are trained on and never scored.
`,
  );
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "sft-train.jsonl"), train.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
writeFileSync(join(OUT, "sft-test.jsonl"), test.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
const goldTest = records
  .filter((r) => r.split === "test")
  .map((r) => ({ id: r.id, family: r.family, gold: r.observation.gold.answer }));
writeFileSync(join(OUT, "gold-test.jsonl"), goldTest.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
process.stdout.write(
  `sft-train ${train.length}  sft-test ${test.length}  gold-test ${goldTest.length}  families ${[...trainFamilies].sort().join(",")}\n`,
);
