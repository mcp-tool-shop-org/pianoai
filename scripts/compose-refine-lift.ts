#!/usr/bin/env tsx
// ─── compose-refine-lift.ts — Phase 2 S2 Slice B2, part-at-a-time vs single-pass ─
//
// Measures the admit-rate LIFT of the part-at-a-time refinement (B2) over the
// single-pass proposal (B1a), per style, on top of the membership fix. For each
// song it draws n voicing-SPEC samples ONCE (membership-correct by construction),
// then evaluates four cells from the SAME draws (a fair, seed-matched comparison):
//   • single-pass admit (B1a): any drawn sample admits as-is,
//   • refined admit   (B2): any drawn sample admits after part-at-a-time refine.
// under common-practice and lead-sheet. A deterministic nearest-tone anchor
// (refined vs not) is included as a $0 reference.
//
// Evidence (findings 14–17): iterative hold-fixed-and-regenerate beats single-pass
// on the same model (Coconet/DeepBach), one-directional. Honest frame: admission
// is theory-validity, not quality (findings 18–20). Report the nulls.
//
// Usage:
//   pnpm exec tsx scripts/compose-refine-lift.ts                 (n=8, 10 songs)
//   pnpm exec tsx scripts/compose-refine-lift.ts --n 16 --no-model   ($0 anchor only)
// ─────────────────────────────────────────────────────────────────────────────

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeFromLibrary } from "../src/songs/library.js";
import { getAllSongs } from "../src/songs/registry.js";
import { analyzeHarmony } from "../src/analysis/index.js";
import {
  progressionFromAnalysis,
  nearestToneRealization,
  verifyVoiceLeading,
  refineRealization,
  OllamaSpecRealizer,
  type ChordProgression,
  type Realization,
  type StyleName,
} from "../src/compose/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIBRARY_DIR = join(__dirname, "..", "songs", "library");

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

const STYLES: StyleName[] = ["common-practice", "lead-sheet"];

function argOf(argv: string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}

const admits = (r: Realization, voices: number, style: StyleName): boolean =>
  verifyVoiceLeading(r, { requireVoiceCount: voices, style }).admitted;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const n = parseInt(argOf(argv, "--n") ?? "8", 10);
  const voices = parseInt(argOf(argv, "--voices") ?? "4", 10);
  const model = argOf(argv, "--model") ?? "qwen2.5:7b";
  const noModel = argv.includes("--no-model");
  const maxPasses = parseInt(argOf(argv, "--passes") ?? "8", 10);
  const [lo, hi] = (argOf(argv, "--measures") ?? "1-8").split("-").map((x) => parseInt(x, 10));
  const songIds = (argOf(argv, "--songs") ?? DEFAULT_SONGS.join(",")).split(",").map((s) => s.trim());

  initializeFromLibrary(LIBRARY_DIR);
  const all = getAllSongs();
  const targets: Array<{ id: string; progression: ChordProgression }> = [];
  for (const id of songIds) {
    const song = all.find((s) => s.id === id);
    if (!song) {
      console.log(`(skipping "${id}" — not in the library)`);
      continue;
    }
    targets.push({ id, progression: progressionFromAnalysis(analyzeHarmony(song, { measureRange: [lo, hi] })) });
  }
  if (targets.length === 0) {
    console.error("No target songs found in the library.");
    process.exit(2);
  }

  let realizer: OllamaSpecRealizer | null = null;
  if (!noModel) {
    realizer = new OllamaSpecRealizer(model, { voices, maxTokens: 1024 });
    try {
      await realizer.probe();
    } catch (err) {
      console.log(`Ollama not reachable — $0 deterministic anchor only.\n  ${err instanceof Error ? err.message.split("\n")[0] : String(err)}\n`);
      realizer = null;
    }
  }

  console.log(`\n═══ Phase 2 S2 B2 — part-at-a-time lift (measures ${lo}-${hi}, ${voices} voices, best-of-${n}, ≤${maxPasses} passes) ═══\n`);

  // tallies: [variant][style] = songs admitted (keyed by the measured STYLES)
  const zero = (): Record<string, number> => Object.fromEntries(STYLES.map((s) => [s, 0]));
  const modelSingle = zero();
  const modelRefined = zero();
  const detSingle = zero();
  const detRefined = zero();

  for (const t of targets) {
    // $0 deterministic anchor (one sample; refine per style)
    const near = nearestToneRealization(t.progression, voices);
    for (const style of STYLES) {
      if (admits(near, voices, style)) detSingle[style]++;
      if (refineRealization(near, { voices, style, maxPasses }).admitted) detRefined[style]++;
    }

    // model spec samples drawn ONCE, evaluated four ways
    if (realizer) {
      const samples: Realization[] = [];
      for (let k = 0; k < n; k++) {
        const s = await realizer.proposeRealization(t.progression, k);
        if (s) samples.push(s);
      }
      for (const style of STYLES) {
        if (samples.some((s) => admits(s, voices, style))) modelSingle[style]++;
        if (samples.some((s) => refineRealization(s, { voices, style, maxPasses }).admitted)) modelRefined[style]++;
      }
      console.log(
        `  ${t.id.padEnd(24)} drew ${samples.length}/${n} — ` +
          STYLES.map((s) => `${s}: single ${samples.some((x) => admits(x, voices, s)) ? "✓" : "·"} / refined ${samples.some((x) => refineRealization(x, { voices, style: s, maxPasses }).admitted) ? "✓" : "·"}`).join("  |  "),
      );
    }
  }

  const N = targets.length;
  const row = (label: string, single: Record<string, number>, refined: Record<string, number>) =>
    console.log(
      `${label.padEnd(26)}` +
        STYLES.map((s) => `${`${single[s]}/${N}→${refined[s]}/${N}`.padStart(16)}`).join(""),
    );

  console.log(`\n${"seed  (single→refined)".padEnd(26)}${STYLES.map((s) => s.padStart(16)).join("")}`);
  console.log("─".repeat(26 + 16 * STYLES.length));
  row("nearest-tone (det, $0)", detSingle, detRefined);
  if (realizer) row("model-spec (B1a→B2)", modelSingle, modelRefined);

  console.log(
    `\nEach cell is best-of-${n} admit-rate: SINGLE-pass → part-at-a-time REFINED, per style.\n` +
      `Admission is theory-validity, not quality (findings 18–20). Report the nulls: a cell that\n` +
      `does not lift is a finding, not a failure — the refiner can only fix what a single re-voicing\n` +
      `reaches, and a measure the model left unvoiced still fails the structure gate.\n`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
