#!/usr/bin/env tsx
// ─── compose-realize-demo.ts — Phase 2 composition engine, measured honestly ──
//
// The reharmonization envelope SCALED, end to end on real library material:
//
//   song → analyzeHarmony (Phase 1) → progression → realize N voices →
//   deterministic voice-leading gate admits → best-of-n keeps the best admitted
//
// Reports the DETERMINISTIC pass-rates — the cheap, defensible, $0 numbers:
//   • the ROOT-POSITION FLOOR admit-rate (the fidelity floor; block chords),
//   • the NEAREST-TONE deterministic voice-leader admit-rate + mean motion,
//   • (Ollama-optional) the MODEL best-of-n admit-rate + coverage.
//
// The quality claim is bounded by Lane 4: "in-distribution, theory-valid,
// preferred over baseline in a blind BWS panel" — NOT "professional-quality"
// from any metric. This script measures ADMISSION (theory-validity) + smoothness,
// nothing more. The BWS human panel is a director priced-ask, not a $0 step.
//
// Usage:
//   pnpm exec tsx scripts/compose-realize-demo.ts
//   pnpm exec tsx scripts/compose-realize-demo.ts --songs let-it-be,fur-elise --n 16
//   pnpm exec tsx scripts/compose-realize-demo.ts --measures 1-8 --voices 4 --no-model
// ─────────────────────────────────────────────────────────────────────────────

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeFromLibrary } from "../src/songs/library.js";
import { getAllSongs } from "../src/songs/registry.js";
import { analyzeHarmony } from "../src/analysis/index.js";
import {
  progressionFromAnalysis,
  realizeProgression,
  rootPositionRealization,
  nearestToneRealization,
  DeterministicProposer,
  verifyVoiceLeading,
  scoreRealization,
  OllamaRealizer,
  type ChordProgression,
  type RealizeResult,
} from "../src/compose/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIBRARY_DIR = join(__dirname, "..", "songs", "library");

// A genre-diverse default set, all in the shipped library (classical/jazz/pop/
// blues/rock/rnb/soul/latin/ragtime/folk) — one representative per genre.
const DEFAULT_SONGS = [
  "bach-prelude-c-major-bwv846",
  "autumn-leaves",
  "all-of-me",
  "blues-in-the-night",
  "bennie-and-the-jets",
  "fallin",
  "aint-no-sunshine",
  "besame-mucho",
  "bethena",
  "amazing-grace",
];

function argOf(argv: string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const n = parseInt(argOf(argv, "--n") ?? "16", 10);
  const voices = parseInt(argOf(argv, "--voices") ?? "4", 10);
  const model = argOf(argv, "--model") ?? "qwen2.5:7b";
  const noModel = argv.includes("--no-model");
  const [lo, hi] = (argOf(argv, "--measures") ?? "1-8").split("-").map((x) => parseInt(x, 10));
  const songIds = (argOf(argv, "--songs") ?? DEFAULT_SONGS.join(",")).split(",").map((s) => s.trim());

  initializeFromLibrary(LIBRARY_DIR);
  const all = getAllSongs();

  // Build a progression per requested song (skip any not in the library).
  const targets: Array<{ id: string; progression: ChordProgression; chords: number }> = [];
  for (const id of songIds) {
    const song = all.find((s) => s.id === id);
    if (!song) {
      console.log(`(skipping "${id}" — not in the library)`);
      continue;
    }
    const analysis = analyzeHarmony(song, { measureRange: [lo, hi] });
    const progression = progressionFromAnalysis(analysis); // per-measure block-realization target
    const chords = progression.chords.filter((c) => c.chordSymbol && c.chordSymbol !== "N/C").length;
    targets.push({ id, progression, chords });
  }
  if (targets.length === 0) {
    console.error("No target songs found in the library.");
    process.exit(2);
  }

  console.log(`\n═══ Phase 2 composition engine — voice-leading admission (measures ${lo}-${hi}, ${voices} voices) ═══\n`);

  // ── deterministic baselines ($0, no Ollama) ──
  const floorProposer = new DeterministicProposer(rootPositionRealization, voices);
  const nearestProposer = new DeterministicProposer(nearestToneRealization, voices);

  // ── the model (Ollama-optional) ──
  let realizer: OllamaRealizer | null = null;
  if (!noModel) {
    realizer = new OllamaRealizer(model, { voices, maxTokens: 1024 });
    try {
      await realizer.probe();
    } catch (err) {
      console.log(
        `Ollama not reachable — reporting the deterministic baselines only ($0).\n  ` +
          (err instanceof Error ? err.message.split("\n")[0] : String(err)) +
          `\n  (pass --no-model to silence this.)\n`,
      );
      realizer = null;
    }
  }

  const rows: Array<{
    id: string;
    floor: boolean;
    nearest: boolean;
    nearestMotion: number;
    model: RealizeResult | null;
  }> = [];

  for (const t of targets) {
    const floor = await realizeProgression(t.progression, floorProposer, { maxSamples: 1, voices });
    const nearest = await realizeProgression(t.progression, nearestProposer, { maxSamples: 1, voices });
    let model: RealizeResult | null = null;
    if (realizer) {
      const t0 = Date.now();
      model = await realizeProgression(t.progression, realizer, { maxSamples: n, voices });
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(
        `  ${t.id.padEnd(24)} model best-of-${n}: ` +
          `${model.admitted ? "ADMITTED" : "—       "} ` +
          `coverage ${model.admittedCount}/${model.samplesUsed}, ` +
          `score ${model.score.score.toFixed(3)}  (${secs}s)`,
      );
    }
    rows.push({
      id: t.id,
      floor: floor.verdict.admitted,
      nearest: nearest.verdict.admitted,
      nearestMotion: nearest.verdict.meanMotionPerVoice ?? 0,
      model,
    });
  }

  // ── table ──
  console.log(`\n${"song".padEnd(24)} ${"chords".padStart(6)}  ${"floor".padStart(6)}  ${"nearest".padStart(8)}  ${"model".padStart(8)}`);
  console.log("─".repeat(64));
  for (const r of rows) {
    const t = targets.find((x) => x.id === r.id)!;
    console.log(
      `${r.id.padEnd(24)} ${String(t.chords).padStart(6)}  ` +
        `${(r.floor ? "✓" : "·").padStart(6)}  ` +
        `${(r.nearest ? "✓" : "·").padStart(8)}  ` +
        `${(r.model ? (r.model.admitted ? "✓" : "·") : "n/a").padStart(8)}`,
    );
  }

  // ── aggregate admit-rates ──
  const rate = (pred: (r: (typeof rows)[number]) => boolean) =>
    `${rows.filter(pred).length}/${rows.length}`;
  console.log("─".repeat(64));
  console.log(`\nAdmit-rate (deterministic voice-leading gate):`);
  console.log(`  root-position floor : ${rate((r) => r.floor)}`);
  console.log(`  nearest-tone leader : ${rate((r) => r.nearest)}`);
  if (realizer) console.log(`  model best-of-${n}      : ${rate((r) => r.model?.admitted === true)}`);
  console.log(
    `\nMean nearest-tone motion/voice: ` +
      (rows.length ? (rows.reduce((a, b) => a + b.nearestMotion, 0) / rows.length).toFixed(2) : "—") +
      ` semitones`,
  );
  console.log(
    `\nHonest frame: this measures theory-VALIDITY (admission) + smoothness, the $0 defensible\n` +
      `numbers. It is NOT a quality metric — "professional-quality" is a blind BWS human panel\n` +
      `(a director priced-ask), never a number (Yang & Lerch 2020).\n`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
