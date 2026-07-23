#!/usr/bin/env tsx
// ─── compose-bws-smoke.ts — Phase 2 S2, the $0 quality SMOKE-SCREEN ────────────
//
// The cheap directional filter that precedes the (deferred, priced) human BWS
// panel: a cross-family LOCAL-LLM best-worst-scaling panel over the composition
// systems. NOT the quality claim — it judges SYMBOLIC voicings with 24–31B models,
// so it is honest-by-construction with a DISCRIMINATION-FLOOR gate: if the judges
// cannot rank the theory-VALID refined system above the theory-INVALID root-
// position floor, the result is UNINTERPRETABLE (a judge problem), per the
// studio's prism family-AB lessons. INCONCLUSIVE is a real, reported outcome.
//
// Judges exclude the generator family (qwen) so no judge grades its own output
// (EXTERNAL_VERIFIER). Systems: floor (invalid anchor) · nearest · refined (valid
// anchor) · engine (model-spec best-of-n + refine). Zero API cost (local Ollama).
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
  renderVoicingText,
  shuffledOrder,
  makeRng,
  aggregatePanel,
  interpretPanel,
  OllamaBwsJudge,
  type PanelSystem,
  type BwsVote,
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

// Disjoint judge families — NONE is qwen (the generator family), so no judge
// grades its own output. All local, zero API cost.
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
  const targets = songIds
    .map((id) => all.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((song) => ({ id: song.id, progression: progressionFromAnalysis(analyzeHarmony(song, { measureRange: [lo, hi] })) }));
  if (targets.length === 0) {
    console.error("No target songs in the library.");
    process.exit(2);
  }

  const systems: PanelSystem[] = [
    { id: "floor", note: "root-position floor (theory-INVALID discrimination anchor)" },
    { id: "nearest", note: "nearest-tone deterministic leader" },
    { id: "refined", note: "refined nearest-tone (theory-VALID discrimination anchor)" },
    { id: "engine", note: "the composition engine: model-spec best-of-n + part-at-a-time refine" },
  ];

  // judges (exclude any unreachable)
  const judges: OllamaBwsJudge[] = [];
  for (const spec of judgeSpecs) {
    const [model, family] = spec.split(":").length === 3
      ? [spec.slice(0, spec.lastIndexOf(":")), spec.slice(spec.lastIndexOf(":") + 1)]
      : [spec, spec];
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

  const engineProposer = new RefiningProposer(new OllamaSpecRealizer(genModel, { voices, maxTokens: 1024 }), { voices, style });

  console.log(`\n═══ Phase 2 S2 — $0 cross-family LLM quality SMOKE-SCREEN (style ${style}, ${targets.length} songs, ${judges.length} families) ═══`);
  console.log(`Judges: ${judges.map((j) => `${j.family}(${j.model})`).join(", ")}  — none is the generator family (qwen).`);
  console.log(`This is a DIRECTIONAL symbolic smoke-screen, NOT the quality claim (human-audio BWS is deferred).\n`);

  const votes: BwsVote[] = [];
  const tupleSystems: string[][] = [];

  for (let si = 0; si < targets.length; si++) {
    const t = targets[si];
    // build the 4 system realizations ONCE per song
    const real: Record<string, Realization> = {
      floor: rootPositionRealization(t.progression, voices),
      nearest: nearestToneRealization(t.progression, voices),
      refined: refineRealization(nearestToneRealization(t.progression, voices), { voices, style }).realization,
      engine: (await realizeProgression(t.progression, engineProposer, { maxSamples: n, voices, style })).realization,
    };
    // each family judges a deterministically-shuffled view (anonymized options)
    for (let fi = 0; fi < judges.length; fi++) {
      const judge = judges[fi];
      const order = shuffledOrder(systems.length, makeRng(1000 * (si + 1) + 31 * (fi + 1)));
      const orderedIds = order.map((k) => systems[k].id);
      const optionsText = orderedIds.map((id) => renderVoicingText(real[id]));
      const v = await judge.judge(t.progression.key, optionsText, si * 10 + fi);
      if (v) {
        votes.push({ options: order, best: v.best, worst: v.worst, family: judge.family });
        tupleSystems.push(orderedIds);
      }
      process.stdout.write(v ? "." : "x");
    }
  }
  console.log(`\n\nCollected ${votes.length}/${targets.length * judges.length} votes (x = a judge returned unparseable output, dropped).\n`);

  const agg = aggregatePanel(systems, votes, tupleSystems, { bootstrap: 500, seed: 42 });
  const result = interpretPanel(agg, { floor: "floor", valid: "refined", engine: "engine" }, { floorMargin: 0.15 });

  console.log(`${"system".padEnd(10)} ${"BWS".padStart(7)} ${"95% CI".padStart(16)} ${"BT".padStart(7)} ${"best".padStart(6)} ${"worst".padStart(6)}`);
  console.log("─".repeat(60));
  for (const s of result.scores) {
    console.log(
      `${s.id.padEnd(10)} ${s.bwsScore.toFixed(2).padStart(7)} ` +
        `${`[${s.ci[0].toFixed(2)}, ${s.ci[1].toFixed(2)}]`.padStart(16)} ` +
        `${s.btStrength.toFixed(2).padStart(7)} ${String(s.best).padStart(6)} ${String(s.worst).padStart(6)}`,
    );
  }
  console.log(`\nRanking (best→worst): ${result.ranking.join(" > ")}`);
  console.log(`Inter-family agreement on the top pick: ${(result.familyAgreement * 100).toFixed(0)}%`);
  console.log(`Discrimination-floor gate: ${result.interpretable ? "PASSED" : "FAILED"}`);
  console.log(`\n⇒ ${result.verdict}\n`);
  console.log(
    `Reminder (findings 18–20): admission/ranking is theory-validity direction, NOT quality. A symbolic\n` +
      `LLM panel cannot make the quality claim — that is a blind human-AUDIO BWS panel (a director\n` +
      `priced-ask). This smoke-screen only says whether that paid panel is worth scheduling.\n`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
