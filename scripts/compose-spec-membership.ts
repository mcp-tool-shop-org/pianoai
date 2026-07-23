#!/usr/bin/env tsx
// ─── compose-spec-membership.ts — Phase 2 S2 Slice B1a, the membership fix ─────
//
// Session 1 measured that base qwen2.5:7b voices the fixed harmony as a DIFFERENT
// chord (C major → C-E-G-B), so it scored 0/10 under both gates — its failure is
// membership drift, orthogonal to style. B1a fixes that BY CONSTRUCTION: the model
// emits a VOICING SPEC (inversion + chord-tone selection) and a deterministic
// renderer maps it onto the chord's exact pitch classes (findings 11–13).
//
// This measures, live on the local model, the two things B1a claims:
//   ① membership-violation RATE — the fraction of sounding frames (over all drawn
//      samples) that contain a non-chord pitch — for the RAW-NOTE realizer
//      (Session-1 path) vs the SPEC realizer (should be 0 by construction).
//   ② downstream ADMIT-RATE — best-of-n, per style — the real question: once
//      membership can't fail, does the model's voice-leading clear the gate?
//
// Honest frame: admission is theory-validity, not quality (findings 18–20). A
// membership rate of 0 is a by-construction guarantee, not a quality claim; the
// admit-rate is the measurable downstream effect, reported with its nulls.
//
// Usage:
//   pnpm exec tsx scripts/compose-spec-membership.ts                 (n=8, 10 songs)
//   pnpm exec tsx scripts/compose-spec-membership.ts --n 16 --songs let-it-be,all-of-me
// ─────────────────────────────────────────────────────────────────────────────

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeFromLibrary } from "../src/songs/library.js";
import { getAllSongs } from "../src/songs/registry.js";
import { analyzeHarmony } from "../src/analysis/index.js";
import {
  progressionFromAnalysis,
  verifyVoiceLeading,
  OllamaRealizer,
  OllamaSpecRealizer,
  type ChordProgression,
  type Realization,
  type RealizationProposer,
  type StyleName,
} from "../src/compose/index.js";
import { parseChordSymbol } from "../src/maker/verify-harmony.js";

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

/** Frames whose voices contain a non-chord pitch (membership violations). */
function membershipStats(real: Realization): { sounding: number; violating: number } {
  let sounding = 0;
  let violating = 0;
  for (const f of real.frames) {
    if (f.voices.length === 0) continue;
    sounding++;
    const p = parseChordSymbol(f.chordSymbol);
    if (!p) continue; // out-of-vocab: not counted as a membership violation (can't check)
    const pcs = new Set(p.pcs);
    if (f.voices.some((v) => !pcs.has(v % 12))) violating++;
  }
  return { sounding, violating };
}

/** Draw n samples (nulls dropped). */
async function draw(proposer: RealizationProposer, prog: ChordProgression, n: number): Promise<Realization[]> {
  const out: Realization[] = [];
  for (let k = 0; k < n; k++) {
    const r = await proposer.proposeRealization(prog, k);
    if (r) out.push(r);
  }
  return out;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const n = parseInt(argOf(argv, "--n") ?? "8", 10);
  const voices = parseInt(argOf(argv, "--voices") ?? "4", 10);
  const model = argOf(argv, "--model") ?? "qwen2.5:7b";
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
    const analysis = analyzeHarmony(song, { measureRange: [lo, hi] });
    targets.push({ id, progression: progressionFromAnalysis(analysis) });
  }
  if (targets.length === 0) {
    console.error("No target songs found in the library.");
    process.exit(2);
  }

  const raw = new OllamaRealizer(model, { voices, maxTokens: 1024 });
  const spec = new OllamaSpecRealizer(model, { voices, maxTokens: 1024 });
  try {
    await raw.probe();
  } catch (err) {
    console.error(`Ollama not reachable — this measurement needs the live model.\n  ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
    process.exit(1);
  }

  console.log(`\n═══ Phase 2 S2 B1a — membership by construction (measures ${lo}-${hi}, ${voices} voices, best-of-${n}) ═══\n`);

  const proposers: Array<{ label: string; p: RealizationProposer }> = [
    { label: "raw-note (Session-1)", p: raw },
    { label: "voicing-spec (B1a)", p: spec },
  ];

  type Agg = { soundingFrames: number; violatingFrames: number; admit: Record<string, number> };
  const agg = new Map<string, Agg>();
  for (const { label } of proposers) {
    agg.set(label, { soundingFrames: 0, violatingFrames: 0, admit: Object.fromEntries(STYLES.map((s) => [s, 0])) });
  }

  for (const t of targets) {
    for (const { label, p } of proposers) {
      const samples = await draw(p, t.progression, n);
      const a = agg.get(label)!;
      for (const s of samples) {
        const ms = membershipStats(s);
        a.soundingFrames += ms.sounding;
        a.violatingFrames += ms.violating;
      }
      // best-of-n admit per style (any sample admitted)
      for (const style of STYLES) {
        const admitted = samples.some((s) => verifyVoiceLeading(s, { requireVoiceCount: voices, style }).admitted);
        if (admitted) a.admit[style]++;
      }
      const ms = a; // running
      console.log(
        `  ${t.id.padEnd(24)} ${label.padEnd(22)} samples ${samples.length}/${n}` +
          ` — membership-clean frames so far ${ms.soundingFrames - ms.violatingFrames}/${ms.soundingFrames}`,
      );
    }
  }

  console.log(`\n${"proposer".padEnd(24)} ${"membership-violation rate".padStart(28)} ${"admit CP".padStart(10)} ${"admit LS".padStart(10)}`);
  console.log("─".repeat(76));
  for (const { label } of proposers) {
    const a = agg.get(label)!;
    const rate = a.soundingFrames > 0 ? (a.violatingFrames / a.soundingFrames) : 0;
    console.log(
      `${label.padEnd(24)} ` +
        `${`${a.violatingFrames}/${a.soundingFrames} = ${(rate * 100).toFixed(1)}%`.padStart(28)} ` +
        `${`${a.admit["common-practice"]}/${targets.length}`.padStart(10)} ` +
        `${`${a.admit["lead-sheet"]}/${targets.length}`.padStart(10)}`,
    );
  }
  console.log(
    `\nmembership-violation rate = sounding frames with ≥1 non-chord pitch, over all ${n}×${targets.length} draws.\n` +
      `admit CP/LS = best-of-${n} admit-rate under common-practice / lead-sheet. Admission is theory-validity,\n` +
      `NOT quality (findings 18–20). A 0% membership rate is a by-construction guarantee, not a quality claim.\n`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
