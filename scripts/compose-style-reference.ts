#!/usr/bin/env tsx
// ─── compose-style-reference.ts — Phase 2 S2 A2, build the per-style bands ($0) ─
//
// Builds the corpus-derived style-typicality REFERENCE BANDS from the existing
// library ($0, deterministic, reproducible). For each style it forms an in-style
// corpus by refining the deterministic nearest-tone leader over the library under
// that style (B2 refinement admits ~10/10, giving a solid corpus of theory-valid
// in-style voicings), then reports each feature's mean ± std.
//
// Honest bound (findings 9, 19): these are BASELINE-derived distributional bands —
// a ranking tripwire, NOT a human-voiced gold corpus and NOT a quality claim. A
// learned style model + the blind BWS quality panel are later slices / priced-asks.
//
// Usage:
//   pnpm exec tsx scripts/compose-style-reference.ts
//   pnpm exec tsx scripts/compose-style-reference.ts --limit 60 --measures 1-8
// ─────────────────────────────────────────────────────────────────────────────

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeFromLibrary } from "../src/songs/library.js";
import { getAllSongs } from "../src/songs/registry.js";
import { analyzeHarmony } from "../src/analysis/index.js";
import {
  progressionFromAnalysis,
  nearestToneRealization,
  refineRealization,
  buildStyleReference,
  type Realization,
  type StyleName,
} from "../src/compose/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIBRARY_DIR = join(__dirname, "..", "songs", "library");

const STYLES: StyleName[] = ["common-practice", "lead-sheet", "film-ambient"];

function argOf(argv: string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const limit = parseInt(argOf(argv, "--limit") ?? "40", 10);
  const voices = parseInt(argOf(argv, "--voices") ?? "4", 10);
  const [lo, hi] = (argOf(argv, "--measures") ?? "1-8").split("-").map((x) => parseInt(x, 10));

  initializeFromLibrary(LIBRARY_DIR);
  const songs = getAllSongs().slice(0, limit);
  const progressions = songs.map((s) => progressionFromAnalysis(analyzeHarmony(s, { measureRange: [lo, hi] })));

  console.log(`\n═══ Phase 2 S2 A2 — style-typicality reference bands (${songs.length} songs, measures ${lo}-${hi}) ═══\n`);
  console.log(`Corpus per style: refined nearest-tone leader (admitted only). Baseline-derived — a`);
  console.log(`distributional tripwire, NOT a quality claim (findings 9, 19).\n`);

  for (const style of STYLES) {
    const corpus: Realization[] = [];
    for (const prog of progressions) {
      const r = refineRealization(nearestToneRealization(prog, voices), { voices, style, maxPasses: 8 });
      if (r.admitted) corpus.push(r.realization);
    }
    const ref = buildStyleReference(style, corpus);
    console.log(`── ${style} (corpus n=${ref.n}) ──`);
    for (const [name, s] of Object.entries(ref.features)) {
      console.log(`   ${name.padEnd(18)} mean ${s.mean.toFixed(3)}  ± ${s.std.toFixed(3)}`);
    }
    console.log();
  }

  console.log(
    `The bands are computed on demand (buildStyleReference over the library) — $0 at runtime,\n` +
      `no committed data file. Wire one into scoreRealization({ styleReference }) with a positive\n` +
      `styleTypicality weight to rank admitted candidates by in-style fit (ranking only, never a gate).\n`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
