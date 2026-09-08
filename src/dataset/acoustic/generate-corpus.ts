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
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PERTURBATION_KINDS, type AcousticRecord } from "./schema.js";
import { buildRecord } from "./builder.js";
import {
  PHRASE_SPECS,
  TEST_SONG_ID,
  TRAIN_SONG_IDS,
  assertNoClairDeLune,
} from "./phrases.js";
import { acousticCases, acousticIndexSeeds, acousticTask } from "./task.js";

const KINDS_PER_PHRASE = PERTURBATION_KINDS.length * 4;

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

export function targetIndexSeeds(n: number = 4): number[] {
  return acousticIndexSeeds(n);
}

export function buildAllRecords(seeds: number[] = targetIndexSeeds()): Array<AcousticRecord & { split: "train" | "test" }> {
  const records: Array<AcousticRecord & { split: "train" | "test" }> = acousticCases(seeds).map((c) => {
    const rec = buildRecord(c.phrase, { seed: c.seed, kind: c.kind });
    return { ...rec, split: splitOf(acousticTask.splitKey(c)) };
  });
  records.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return records;
}

function datasetCard(): string {
  return `# Dataset Card for jam-actions-acoustic-v0

**Version:** ${DATASET_VERSION}
Published at [mcp-tool-shop/jam-actions-acoustic-v0](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-acoustic-v0). No DOI.

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
- \`VERSION\`
- \`CITATION.cff\`
- \`LICENSE-DATASET.md\`
- \`checksums.sha256\` — every other file, sorted breadth-first by path
- This card

Every one of those is generated from the source repository, so the whole tree rebuilds from code.

## Re-rendering the audio

No WAV files ship. Each take re-renders deterministically from \`observation.render.recipe\`, and \`wav_sha256\` is the hash of the waveform it produces.

**That hash is engine-dependent, and you should know before you check it.** The renderer calls \`Math.pow\` and \`Math.sin\` once per sample, and ECMA-262 does not require either to be correctly rounded. V8's results changed between Node 22 and Node 24: of the 27,869 distinct \`Math.pow(2, x)\` arguments this corpus evaluates, 253 (0.91%) return a different double. Nearly all of that disappears under 16-bit quantisation, but **2 of the 108 records do not survive it** — both the \`extra\` perturbation of Für Elise, whose motif sits on MIDI 63, the one pitch where the semitone ratio itself differs by a unit in the last place.

So:

- **Every other field of every record reproduces on any engine.** Verify the download against \`checksums.sha256\` and it matches everywhere.
- **\`wav_sha256\` matches on Node 22**, the engine this corpus was generated on. On Node 24 expect those two records to differ. That is this, not a corrupt download.

Making the waveform bit-portable means replacing the transcendentals, which changes every hash and therefore every record. It would need a new \`schema_version\`, so it has not been done.

## License

Traces and synthetic audio: CC-BY-SA-3.0-DE. Underlying compositions: public domain. See \`LICENSE-DATASET.md\` for the three layers and what each obliges.
`;
}

/** The published dataset version. Kept beside the card that quotes it. */
export const DATASET_VERSION = "1.0.1";

function licenseDoc(): string {
  return readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "assets", "LICENSE-DATASET.md"),
    "utf8",
  );
}

function citationDoc(): string {
  return readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "assets", "CITATION.cff"),
    "utf8",
  );
}

export function buildSplits(records: GeneratedCorpus["records"]): unknown {
  const trainIds = records.filter((r) => r.split === "train").map((r) => r.id);
  const testIds = records.filter((r) => r.split === "test").map((r) => r.id);
  return {
    strategy: "hold out by phrase, not by record",
    test_song_count: 1,
    test_pct: testIds.length / records.length,
    pair_locked: true,
    held_out_song: TEST_SONG_ID,
    held_out_rationale:
      "F\u00fcr Elise is a distinct 4-note motif (E\u2013D#\u2013E\u2013D#). Holding out the whole phrase prevents leak of (kind, other-index) twins of the same melody. clair-de-lune is unused: it is the published jam-actions-v0 fine-tune holdout.",
    test: testIds,
    train: trainIds,
    songs: {
      train: [...TRAIN_SONG_IDS],
      test: [TEST_SONG_ID],
    },
  };
}

export function buildManifest(records: GeneratedCorpus["records"]): unknown {
  const trainIds = records.filter((r) => r.split === "train").map((r) => r.id);
  const testIds = records.filter((r) => r.split === "test").map((r) => r.id);
  return {
    dataset_name: "jam-actions-acoustic-v0",
    schema_version: acousticTask.schemaVersion,
    version: DATASET_VERSION,
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
}

/**
 * Every file the published corpus contains, as relative path to exact content.
 *
 * This is the single source of truth for what the dataset IS. `writeCorpus`
 * writes this map; the reproducibility test hashes it without writing. The two
 * cannot drift, which is the point: an earlier version built the metadata files
 * inline while writing, so a test could only check the records, and three
 * published files (VERSION, CITATION.cff, LICENSE-DATASET.md) were not emitted
 * by the generator at all. Regenerating deleted them.
 *
 * `checksums.sha256` is deliberately absent: it is derived FROM this map.
 */
export function corpusFiles(records: GeneratedCorpus["records"]): Map<string, string> {
  const files = new Map<string, string>();
  files.set("records.jsonl", records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  for (const r of records) {
    files.set(`records/${r.id.replace(/[:\\/]/g, "_")}.json`, JSON.stringify(r, null, 2) + "\n");
  }
  files.set("splits.json", JSON.stringify(buildSplits(records), null, 2) + "\n");
  files.set("manifest.json", JSON.stringify(buildManifest(records), null, 2) + "\n");
  files.set("README.md", datasetCard());
  files.set("VERSION", `${DATASET_VERSION}\n`);
  files.set("LICENSE-DATASET.md", licenseDoc());
  files.set("CITATION.cff", citationDoc());
  return files;
}

/**
 * `checksums.sha256` exactly as published: two spaces, trailing newline, and
 * breadth-first path order - every root file, sorted, then everything one level
 * down, sorted.
 *
 * That ordering is not decorative and not a flat sort. A flat sort puts
 * `splits.json` LAST, after all 108 `records/*.json`, because "records." sorts
 * below "records/". The published manifest does not look like that, so a flat
 * sort silently produces a DIFFERENT manifest for identical content and the
 * repo would disagree with the file every downloader verifies against. The
 * published bytes are the authority.
 */
export function checksumManifest(files: Map<string, string>): string {
  const depth = (rel: string): number => rel.split("/").length;
  const NL = "\n";
  return [...files.keys()]
    .sort((a, b) => depth(a) - depth(b) || (a < b ? -1 : a > b ? 1 : 0))
    .map((rel) => `${sha256(Buffer.from(files.get(rel)!, "utf8"))}  ${rel}`)
    .join(NL) + NL;
}

export function writeCorpus(outDir: string, records: GeneratedCorpus["records"]): void {
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }
  mkdirSync(join(outDir, "records"), { recursive: true });

  const files = corpusFiles(records);
  for (const [rel, content] of files) {
    writeFileSync(join(outDir, ...rel.split("/")), content, "utf8");
  }
  writeFileSync(join(outDir, "checksums.sha256"), checksumManifest(files), "utf8");
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
