#!/usr/bin/env tsx
// ─── compose-bws-smoke.ts — Phase 2 S2, the $0 quality SMOKE-SCREEN ────────────
//
// The cheap directional filter that precedes the deferred, priced human BWS panel:
// a cross-family LOCAL-LLM best-worst-scaling panel over the composition systems.
// NOT the quality claim — it judges SYMBOLIC voicings with 24–31B models, so it is
// honest by construction with a DISCRIMINATION-FLOOR gate (bws.ts). It drives the
// SAME runVoiceLeadingPanel core the compose_panel MCP tool uses (no drift).
//
// Judges exclude the generator family (qwen) so no judge grades its own output.
// Systems: floor (invalid anchor) · nearest · refined (valid anchor) · engine
// (model-spec best-of-n + refine). Zero API cost (local Ollama).
//
// Usage:
//   pnpm exec tsx scripts/compose-bws-smoke.ts
//   pnpm exec tsx scripts/compose-bws-smoke.ts --n 6 --style lead-sheet --songs let-it-be,all-of-me
// ─────────────────────────────────────────────────────────────────────────────

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeFromLibrary } from "../src/songs/library.js";
import { getAllSongs } from "../src/songs/registry.js";
import { analyzeHarmony } from "../src/analysis/index.js";
import {
  progressionFromAnalysis,
  rootPositionRealization,
  nearestToneRealization,
  refineRealization,
  realizeProgression,
  RefiningProposer,
  OllamaSpecRealizer,
  OllamaBwsJudge,
  runVoiceLeadingPanel,
  type PanelSystemSpec,
  type PanelJudge,
  type ChordProgression,
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

// Disjoint judge families — NONE is qwen (the generator family). All local, $0.
const DEFAULT_JUDGES = "mistral-small:24b:mistral,granite4.1:30b:granite,gemma4:31b:gemma,aya-expanse:32b:aya";

function argOf(argv: string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const n = parseInt(argOf(argv, "--n") ?? "6", 10);
  const voices = parseInt(argOf(argv, "--voices") ?? "4", 10);
  const style = (argOf(argv, "--style") ?? "lead-sheet") as StyleName;
  const genModel = argOf(argv, "--gen-model") ?? "qwen2.5:7b";
  const [lo, hi] = (argOf(argv, "--measures") ?? "1-8").split("-").map((x) => parseInt(x, 10));
  const songIds = (argOf(argv, "--songs") ?? DEFAULT_SONGS.join(",")).split(",").map((s) => s.trim());
  const judgeSpecs = (argOf(argv, "--judges") ?? DEFAULT_JUDGES).split(",").map((s) => s.trim()).filter(Boolean);

  initializeFromLibrary(LIBRARY_DIR);
  const all = getAllSongs();
  const progressions = songIds
    .map((id) => all.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((song) => ({ id: song.id, progression: progressionFromAnalysis(analyzeHarmony(song, { measureRange: [lo, hi] })) }));
  if (progressions.length === 0) {
    console.error("No target songs in the library.");
    process.exit(2);
  }

  // Systems (floor/nearest/refined deterministic; engine = model-spec + refine).
  const engineProposer = new RefiningProposer(new OllamaSpecRealizer(genModel, { voices, maxTokens: 1024 }), { voices, style });
  const systems: PanelSystemSpec[] = [
    { id: "floor", note: "root-position floor (theory-INVALID discrimination anchor)", realize: (p: ChordProgression) => rootPositionRealization(p, voices) },
    { id: "nearest", note: "nearest-tone deterministic leader", realize: (p) => nearestToneRealization(p, voices) },
    { id: "refined", note: "refined nearest-tone (theory-VALID discrimination anchor)", realize: (p) => refineRealization(nearestToneRealization(p, voices), { voices, style }).realization },
    { id: "engine", note: "the composition engine: model-spec best-of-n + part-at-a-time refine", realize: async (p) => (await realizeProgression(p, engineProposer, { maxSamples: n, voices, style })).realization },
  ];

  // Judges (exclude any unreachable); each satisfies PanelJudge.
  const judges: PanelJudge[] = [];
  for (const spec of judgeSpecs) {
    const li = spec.lastIndexOf(":");
    const [model, family] = spec.split(":").length === 3 ? [spec.slice(0, li), spec.slice(li + 1)] : [spec, spec];
    const j = new OllamaBwsJudge(model, family);
    try {
      await j.probe();
      judges.push(j);
    } catch {
      console.log(`(judge "${model}" unreachable — skipped)`);
    }
  }
  if (judges.length < 3) {
    console.error(`Need ≥3 reachable judge families for an honest cross-family panel; got ${judges.length}. Aborting.`);
    process.exit(1);
  }

  console.log(`\n═══ Phase 2 S2 — $0 cross-family LLM quality SMOKE-SCREEN (style ${style}, ${progressions.length} songs, ${judges.length} families) ═══`);
  console.log(`Judges: ${judges.map((j) => `${j.family}(${j.model})`).join(", ")}  — none is the generator family (qwen).\n`);

  const report = await runVoiceLeadingPanel({
    progressions,
    systems,
    judges,
    anchors: { floor: "floor", valid: "refined", engine: "engine" },
    bootstrap: 500,
    seed: 42,
    onProgress: (m) => process.stdout.write(m),
  });
  console.log(`\n\n${report.text}\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
