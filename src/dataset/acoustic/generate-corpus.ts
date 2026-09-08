// ─── Generate jam-actions-acoustic-v0 under datasets/ ────────────────────────
//
// 3 phrases × 9 kinds × 4 target indexes = 108 records. Split by PHRASE:
// fur-elise held out as test. No WAV files; takes re-render from recipe.
// No Date(), no Math.random(). Does not publish.
// ─────────────────────────────────────────────────────────────────────────────

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
import { PERTURBATION_KINDS, type AcousticRecord } from "./schema.js";
import { buildRecord, smallestSeedForIndex } from "./builder.js";
import {
  PHRASE_SPECS,
  TEST_SONG_ID,
  TRAIN_SONG_IDS,
  assertNoClairDeLune,
} from "./phrases.js";

const NOTE_COUNT = 4;
const KINDS_PER_PHRASE = PERTURBATION_KINDS.length * NOTE_COUNT;

export interface GeneratedCorpus {
  records: Array<AcousticRecord & { split: "train" | "test" }>;
  seeds: number[];
  outDir: string;
}

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function splitOf(songId: string): "train" | "test" {
  assertNoClairDeLune(songId);
  if (songId === TEST_SONG_ID) return "test";
  if ((TRAIN_SONG_IDS as readonly string[]).includes(songId)) return "train";
  throw new Error(`Unexpected song_id ${songId}`);
}

export function targetIndexSeeds(n: number = NOTE_COUNT): number[] {
  return Array.from({ length: n }, (_, i) => smallestSeedForIndex(i, n));
}

export function buildAllRecords(seeds: number[] = targetIndexSeeds()): Array<AcousticRecord & { split: "train" | "test" }> {
  const records: Array<AcousticRecord & { split: "train" | "test" }> = [];
  for (const phrase of PHRASE_SPECS) {
    assertNoClairDeLune(phrase.song_id);
    const split = splitOf(phrase.song_id);
    for (const kind of PERTURBATION_KINDS) {
      for (const seed of seeds) {
        const rec = buildRecord(phrase, { seed, kind });
        records.push({ ...rec, split });
      }
    }
  }
  records.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return records;
}

function datasetCard(): string {
  return `# Dataset Card for jam-actions-acoustic-v0

**Version:** 1.0.0
**Not published.** This tree is a local, operator-gated corpus. It has no DOI.

## Summary

108 constructible gold records of grounded MCP tool use over **monophonic audio analysis**. Each record pairs a 4-note right-hand reduction of a public-domain library phrase with a seeded synthetic take and a gold verdict (match, pitch fail/warn, timing fail/pass, missed, extra, in-tune vibrato, or nothing-to-grade silence).

This is **not** a musical edition of the source pieces. A Bach measure contains far more than four notes. Reducing to four sequential right-hand onsets keeps the count honest: 9 perturbation kinds × 4 target notes = 36 records per phrase × 3 phrases = 108.

## Source phrases

| song_id | split | 4-note RH reduction |
|---|---|---|
| bach-prelude-c-major-bwv846 | train | first 4 RH onsets of mm.1–4 |
| schumann-traumerei | train | first 4 RH onsets of mm.1–4 |
| fur-elise | **test** | first 4 RH onsets of mm.1–8 |

**clair-de-lune is not in this corpus.** It is the held-out test split of the published jam-actions-v0 fine-tune arc.

Compositions are public domain. Arrangement metadata is copied read-only from jam-actions-v0 (CC-BY-SA-3.0-DE, Bernd Krueger / piano-midi.de). Audio is original synthetic (\`fixtures-sine-v1\`), not those MIDI performances.

## Split

Held out **by phrase**, not by record. Random record holdout would leak: the same phrase and kind at a different target note is nearly the same example.

- Train: 72 records (Bach + Schumann)
- Test: 36 records (Für Elise)

**Leaks:** the nine-kind taxonomy, the tool sequence, and the gate numbers (they sit on every record).
**Does not leak:** the held-out melody, its times, or which index was perturbed on that phrase.

## Files

- \`records.jsonl\` — one record per line, with \`split\`
- \`records/\` — the same records as individual JSON files
- \`splits.json\` — phrase-locked split
- \`manifest.json\`
- \`checksums.sha256\`
- This card

No WAV files. Takes re-render from \`observation.render.recipe\` and must match \`wav_sha256\`.

## License

Traces and synthetic audio: CC-BY-SA-3.0-DE. Underlying compositions: public domain.
`;
}

export function writeCorpus(outDir: string, records: GeneratedCorpus["records"]): void {
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }
  mkdirSync(join(outDir, "records"), { recursive: true });

  const jsonl = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(join(outDir, "records.jsonl"), jsonl, "utf8");
  for (const r of records) {
    writeFileSync(join(outDir, "records", `${r.id.replace(/[:\\/]/g, "_")}.json`), JSON.stringify(r, null, 2) + "\n", "utf8");
  }

  const trainIds = records.filter((r) => r.split === "train").map((r) => r.id);
  const testIds = records.filter((r) => r.split === "test").map((r) => r.id);
  const splits = {
    strategy: "hold out by phrase, not by record",
    test_song_count: 1,
    test_pct: testIds.length / records.length,
    pair_locked: true,
    held_out_song: TEST_SONG_ID,
    held_out_rationale:
      "Für Elise is a distinct 4-note motif (E–D#–E–D#). Holding out the whole phrase prevents leak of (kind, other-index) twins of the same melody. clair-de-lune is unused: it is the published jam-actions-v0 fine-tune holdout.",
    test: testIds,
    train: trainIds,
    songs: {
      train: [...TRAIN_SONG_IDS],
      test: [TEST_SONG_ID],
    },
  };
  writeFileSync(join(outDir, "splits.json"), JSON.stringify(splits, null, 2) + "\n", "utf8");

  const manifest = {
    dataset_name: "jam-actions-acoustic-v0",
    schema_version: "jam-actions-acoustic-v0/1.0.0",
    version: "1.0.0",
    built_at: "reproducible",
    license: "CC-BY-SA-3.0-DE",
    record_count: records.length,
    records_per_phrase: KINDS_PER_PHRASE,
    phrase_count: PHRASE_SPECS.length,
    songs_included: PHRASE_SPECS.map((p) => p.song_id),
    splits: { train: trainIds.length, test: testIds.length },
    test_song: TEST_SONG_ID,
    reduction: "first 4 sequential right-hand onsets; not a musical edition",
    checksums_file: "checksums.sha256",
  };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  writeFileSync(join(outDir, "README.md"), datasetCard(), "utf8");

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
  walk(outDir, "");
  const lines = files.sort().map((rel) => `${sha256(readFileSync(join(outDir, ...rel.split("/"))))}  ${rel}`);
  writeFileSync(join(outDir, "checksums.sha256"), lines.join("\n") + "\n", "utf8");
}

export function generateAcousticCorpus(outDir?: string): GeneratedCorpus {
  const seeds = targetIndexSeeds();
  const records = buildAllRecords(seeds);
  const dest = outDir ?? join(
    dirname(fileURLToPath(import.meta.url)),
    "..", "..", "..",
    "datasets", "jam-actions-acoustic-v0",
  );
  writeCorpus(dest, records);
  return { records, seeds, outDir: dest };
}

const invokedAsMain = Boolean(
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)),
);
if (invokedAsMain) {
  const result = generateAcousticCorpus();
  process.stdout.write(
    `wrote ${result.records.length} records to ${result.outDir} seeds=${result.seeds.join(",")}\n`,
  );
}
