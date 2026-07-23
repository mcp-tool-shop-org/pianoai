#!/usr/bin/env tsx
// ─── compose-style-matrix.ts — Phase 2 S2 Thread A, the per-style admit matrix ─
//
// Re-runs the Session-1 composition measurement ACROSS the named style presets,
// $0/deterministic (the model is optional). It answers the Session-1 finding
// directly: the strict common-practice gate applies a chorale rulebook to lead-
// sheet genres, so the near-zero admit-rate is a STYLE mismatch, not a part-
// writing verdict — demoting {parallels, tendencySeventh} (the `lead-sheet`
// preset) should recover the deterministic leader from ~1/10 to ~9/10.
//
// It reports:
//   • a per-song × per-style admit table for the nearest-tone leader,
//   • the admit-rate MATRIX (floor / nearest / [model]) × (styles),
//   • the strict-gate (common-practice) failing-rule tally for the nearest-tone
//     leader — reproducing WHICH rules cause the rejections (the finding's core),
//     with the hard floor shown holding across all styles.
//
// Honest frame (Lane 4 / findings 18–20): this measures theory-VALIDITY
// (admission) under each style yardstick, NOT quality. "Quality" is a blind BWS
// panel (a director priced-ask), never any of these numbers (Yang & Lerch 2020).
//
// Usage:
//   pnpm exec tsx scripts/compose-style-matrix.ts
//   pnpm exec tsx scripts/compose-style-matrix.ts --with-model --n 16
//   pnpm exec tsx scripts/compose-style-matrix.ts --songs let-it-be,autumn-leaves --measures 1-8
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
  OllamaRealizer,
  STYLE_PROFILES,
  type StyleName,
  type ChordProgression,
  type RealizeResult,
  type VLRule,
} from "../src/compose/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIBRARY_DIR = join(__dirname, "..", "songs", "library");

// One representative per genre (the Session-1 default set), all in the library.
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

const STYLES: StyleName[] = ["common-practice", "lead-sheet", "film-ambient"];
// The rules to show in the failing-rule tally: the style-gated group first (the
// finding lives here), then the hard floor (shown holding).
const TALLY_RULES: VLRule[] = [
  "parallels",
  "tendencySeventh",
  "tendencyLeadingTone",
  "hidden",
  "chordMembership",
  "overlap",
  "spacing",
  "leap",
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
  const withModel = argv.includes("--with-model");
  const [lo, hi] = (argOf(argv, "--measures") ?? "1-8").split("-").map((x) => parseInt(x, 10));
  const songIds = (argOf(argv, "--songs") ?? DEFAULT_SONGS.join(",")).split(",").map((s) => s.trim());

  initializeFromLibrary(LIBRARY_DIR);
  const all = getAllSongs();

  const targets: Array<{ id: string; progression: ChordProgression; chords: number }> = [];
  for (const id of songIds) {
    const song = all.find((s) => s.id === id);
    if (!song) {
      console.log(`(skipping "${id}" — not in the library)`);
      continue;
    }
    const analysis = analyzeHarmony(song, { measureRange: [lo, hi] });
    const progression = progressionFromAnalysis(analysis);
    const chords = progression.chords.filter((c) => c.chordSymbol && c.chordSymbol !== "N/C").length;
    targets.push({ id, progression, chords });
  }
  if (targets.length === 0) {
    console.error("No target songs found in the library.");
    process.exit(2);
  }

  console.log(
    `\n═══ Phase 2 S2 — per-style admit matrix (measures ${lo}-${hi}, ${voices} voices) ═══\n`,
  );
  for (const s of STYLES) {
    const r = STYLE_PROFILES[s];
    console.log(`  ${s.padEnd(16)} relax {${r.relaxRules.join(", ") || "—"}} — ${r.note}`);
  }
  console.log();

  const floorProposer = new DeterministicProposer(rootPositionRealization, voices);
  const nearestProposer = new DeterministicProposer(nearestToneRealization, voices);

  let realizer: OllamaRealizer | null = null;
  if (withModel) {
    realizer = new OllamaRealizer(model, { voices, maxTokens: 1024 });
    try {
      await realizer.probe();
    } catch (err) {
      console.log(
        `Ollama not reachable — deterministic-only matrix.\n  ` +
          (err instanceof Error ? err.message.split("\n")[0] : String(err)) + `\n`,
      );
      realizer = null;
    }
  }

  // Per (song, style): floor + nearest admit; keep the nearest verdict for the tally.
  type Cell = { floor: boolean; nearest: boolean; model: boolean | null; nearestVerdictRules: Set<VLRule> };
  const grid = new Map<string, Map<StyleName, Cell>>();

  for (const t of targets) {
    const byStyle = new Map<StyleName, Cell>();
    for (const style of STYLES) {
      const floor = await realizeProgression(t.progression, floorProposer, { maxSamples: 1, voices, style });
      const nearest = await realizeProgression(t.progression, nearestProposer, { maxSamples: 1, voices, style });
      // rules that ACTUALLY gated this style's rejection (applicable, not relaxed, failed)
      const relaxed = new Set(nearest.verdict.relaxedRules);
      const gatedFails = new Set<VLRule>(
        (Object.entries(nearest.verdict.hardGates) as Array<[VLRule, { pass: boolean; applicable: boolean }]>)
          .filter(([r, res]) => res.applicable && !relaxed.has(r) && !res.pass)
          .map(([r]) => r),
      );
      let model: boolean | null = null;
      if (realizer) {
        const res = await realizeProgression(t.progression, realizer, { maxSamples: n, voices, style });
        model = res.admitted;
      }
      byStyle.set(style, {
        floor: floor.verdict.admitted,
        nearest: nearest.verdict.admitted,
        model,
        nearestVerdictRules: gatedFails,
      });
    }
    grid.set(t.id, byStyle);
    if (realizer) {
      const cells = STYLES.map((s) => (byStyle.get(s)!.model ? "✓" : "·")).join(" ");
      console.log(`  ${t.id.padEnd(24)} model best-of-${n} per style: ${cells}`);
    }
  }

  // ── per-song nearest-tone admit table ──
  console.log(`\nNearest-tone leader — admit per style:\n`);
  console.log(`${"song".padEnd(24)} ${STYLES.map((s) => s.padStart(16)).join("")}`);
  console.log("─".repeat(24 + 16 * STYLES.length));
  for (const t of targets) {
    const row = STYLES.map((s) => (grid.get(t.id)!.get(s)!.nearest ? "✓" : "·").padStart(16)).join("");
    console.log(`${t.id.padEnd(24)}${row}`);
  }

  // ── admit-rate matrix ──
  const rate = (pred: (c: Cell) => boolean, style: StyleName) =>
    `${targets.filter((t) => pred(grid.get(t.id)!.get(style)!)).length}/${targets.length}`;
  console.log(`\nAdmit-rate matrix (deterministic voice-leading gate):\n`);
  console.log(`${"baseline".padEnd(24)} ${STYLES.map((s) => s.padStart(16)).join("")}`);
  console.log("─".repeat(24 + 16 * STYLES.length));
  console.log(`${"root-position floor".padEnd(24)}${STYLES.map((s) => rate((c) => c.floor, s).padStart(16)).join("")}`);
  console.log(`${"nearest-tone leader".padEnd(24)}${STYLES.map((s) => rate((c) => c.nearest, s).padStart(16)).join("")}`);
  if (realizer) {
    console.log(`${`model best-of-${n}`.padEnd(24)}${STYLES.map((s) => rate((c) => c.model === true, s).padStart(16)).join("")}`);
  }

  // ── strict-gate failing-rule tally (nearest-tone leader, common-practice) ──
  console.log(`\nWhy: nearest-tone leader failing-rule tally under STRICT (common-practice) — songs with ≥1 gating violation:\n`);
  const strictCells = targets.map((t) => grid.get(t.id)!.get("common-practice")!);
  for (const rule of TALLY_RULES) {
    const count = strictCells.filter((c) => c.nearestVerdictRules.has(rule)).length;
    const floorTag = ["chordMembership", "overlap", "spacing", "leap"].includes(rule) ? "  (hard floor)" : "";
    console.log(`  ${rule.padEnd(20)} ${count}/${targets.length}${floorTag}`);
  }

  console.log(
    `\nHonest frame: admission under a style yardstick is theory-VALIDITY, not quality.\n` +
      `The lead-sheet lift (if any) shows the strict gate was mis-scoring cross-genre\n` +
      `material — a style mismatch — NOT that the material got "better." Quality is a\n` +
      `blind BWS panel (a director priced-ask), never a number (findings 18–20).\n`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
