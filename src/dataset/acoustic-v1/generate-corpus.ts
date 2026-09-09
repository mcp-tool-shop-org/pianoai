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
import { buildAllRecords, type V1BuildOpts } from "./builder.js";
import { coverageReport, assertCoverageFloors } from "./coverage.js";
import { loadPublishableSongs } from "./library.js";
import { V1_SCHEMA_VERSION } from "./schema.js";
import { f5DropStats } from "./f5-acoustic.js";

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function writeV1Corpus(outDir?: string, opts: V1BuildOpts = {}): { n: number; outDir: string } {
  const dest = outDir ?? join(
    dirname(fileURLToPath(import.meta.url)),
    "..", "..", "..",
    "datasets", "jam-actions-v1",
  );
  const records = buildAllRecords(opts);
  const songs = loadPublishableSongs();
  const report = coverageReport(records);
  report.genres = [...new Set(songs.map((s) => s.genre))].sort();
  report.genre_count = report.genres.length;
  report.floors_met =
    report.tool_count > report.floors.tools &&
    report.song_count > report.floors.songs &&
    report.shape_count > report.floors.shapes &&
    report.majority_shape_share <= 0.5;
  assertCoverageFloors(report);

  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(join(dest, "records"), { recursive: true });

  const jsonl = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(join(dest, "records.jsonl"), jsonl, "utf8");
  for (const r of records) {
    writeFileSync(
      join(dest, "records", `${r.id.replace(/[:\\/|]/g, "_")}.json`),
      JSON.stringify(r, null, 2) + "\n",
      "utf8",
    );
  }
  writeFileSync(join(dest, "coverage.json"), JSON.stringify({
    ...report,
    f5_drops: { ...f5DropStats },
  }, null, 2) + "\n", "utf8");

  const train = records.filter((r) => r.split === "train").map((r) => r.id);
  const test = records.filter((r) => r.split === "test").map((r) => r.id);
  writeFileSync(join(dest, "splits.json"), JSON.stringify({
    strategy: "hold out by song_id",
    train,
    test,
  }, null, 2) + "\n", "utf8");

  writeFileSync(join(dest, "manifest.json"), JSON.stringify({
    dataset_name: "jam-actions-v1",
    schema_version: V1_SCHEMA_VERSION,
    version: "1.0.0",
    record_count: records.length,
    coverage: {
      tools: report.tool_count,
      songs: report.song_count,
      genres: report.genre_count,
      shapes: report.shape_count,
    },
  }, null, 2) + "\n", "utf8");

  writeFileSync(join(dest, "PROVENANCE-NOTE.md"), `# Provenance

This tree is the **publishable** subset: classical, ragtime, and folk only.
Copyrighted library genres are not in this directory. Follows the
jam-actions-v0 / jam-actions-v0-public split.

Three songs are excluded, each for its own reason:

| song | why |
|---|---|
| \`clair-de-lune\` | the jam-actions-v0 fine-tune holdout |
| \`satie-gymnopedie-no1\` | arrangement provenance unverified in the Slice 2.5 audit |
| \`debussy-arabesque-no1\` | same audit, same finding |

The last two matter more than they look. Both are present in the v0 **working**
corpus and excluded from its **published** subset, for exactly the reason this
tree claims to follow. The first build of this corpus carried 7 records of each
into a tree its own note calls publishable, repeating a provenance problem the
studio had already audited and closed once. The exclusion is enforced by a test
now, not by this paragraph. See \`datasets/jam-actions-v0/PROVENANCE-NOTE.md\`.

Gold is re-derived from library engines (inferChord, detectChord,
transposeSong, measure counts, musicalLanguage counts and first keyMoment
spans, song.key for compare). No hand-written labels.
`, "utf8");

  writeFileSync(join(dest, "README.md"), `# jam-actions-v1 (working tree)

Schema \`${V1_SCHEMA_VERSION}\`. Public card is written elsewhere.

## Size

n=${records.length}. Split by song, not by record. Test n=${test.length}, so one
record is ${(100 / Math.max(1, test.length)).toFixed(2)} percentage points
(v0 test n=36 was 2.8 pp, and the whole LoRA gain sat inside one record).
Phrases/songs buy that power; we did not add more perturbations per song.

Coverage is in \`coverage.json\` (tools, songs, genres, shapes) and is a
build artifact, not a claim in this file.
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
  const r = writeV1Corpus(undefined, { acousticBareLabel: bare, acousticPlainComparison: plain });
  const variant = bare ? "bare-label" : plain ? "plain-comparison" : "arithmetic";
  process.stdout.write(`wrote ${r.n} records (${variant}) to ${r.outDir}\n`);
}
