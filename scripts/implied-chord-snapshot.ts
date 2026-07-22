#!/usr/bin/env tsx
// ─── implied-chord-snapshot.ts — Gate-2 library regression fixture ────────────
//
// Snapshots inferChord() over EVERY measure of EVERY ready library song. Run it
// BEFORE a change to inferChord to capture the baseline, and AFTER to regenerate
// the fixture; `git diff` on the JSON shows every shifted label so each can be
// adjudicated (a more-correct inversion label, or a genuine regression?).
//
// The committed output doubles as the fixture for src/songs/jam.regression.test.ts
// (the permanent CI guard). $0, deterministic, no network.
//
//   pnpm exec tsx scripts/implied-chord-snapshot.ts
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeFromLibrary } from "../src/songs/library.js";
import { getAllSongs } from "../src/songs/registry.js";
import { buildImpliedChordLines } from "../src/songs/implied-chord-snapshot.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const LIBRARY_DIR = join(REPO_ROOT, "songs", "library");
const OUT = join(REPO_ROOT, "experiments", "maker-arc", "implied-chord-snapshot.json");

function main(): void {
  initializeFromLibrary(LIBRARY_DIR);
  const lines = buildImpliedChordLines(getAllSongs());
  const songCount = new Set(lines.map((l) => l.slice(0, l.indexOf("\t")))).size;
  const snapshot = {
    schemaVersion: "implied-chord-snapshot/1.0.0",
    songCount,
    measureCount: lines.length,
    lines,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`wrote ${lines.length} measure labels across ${songCount} songs → ${OUT}`);
}

main();
