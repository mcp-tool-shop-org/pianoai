#!/usr/bin/env tsx
// ─── bass-aware-completeness.ts — the drift-free completeness A/B ─────────────
//
// Measures what the bass-aware inferChord change actually buys the ABC maker:
// FULLER reharmonizations (fewer out-of-vocab chords dropped by the voicer). It
// generates each frozen E-R item's ABC reharmonization ONCE (seed 42), then — on
// the IDENTICAL emitted chord symbols — computes how many measures the OLD
// (pre-bass-aware) voiceChord vocabulary kept vs the NEW one. Same symbols, two
// engines ⇒ ZERO GPU generation drift, isolating the engine effect (seeded Ollama
// is not bit-reproducible on GPU, so comparing two live runs would confound the
// engine change with ±1-2 items of drift — this sidesteps that entirely).
//
// The metric is COMPLETENESS (mean measures kept / dropped-measure rate), NOT
// pass-rate: ABC already clears the whole set (docs/maker-arc-phase-c-abc-pilot.md);
// the win here is that a passing reharmonization now covers MORE of its measures.
//
//   pnpm exec tsx scripts/bass-aware-completeness.ts [--models qwen2.5:7b]
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeFromLibrary } from "../src/songs/library.js";
import { getAllSongs } from "../src/songs/registry.js";
import { selectERItems } from "../src/maker/er-gate.js";
import { ABC_REHARM_SYSTEM, buildAbcReharmUser, parseAbcChords } from "../src/maker/abc-chord-proposer.js";
import { voiceChord } from "../src/maker/voicer.js";
import { OllamaBackend } from "../src/dataset/eval/llm-backends/ollama.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const LIBRARY = join(REPO, "songs", "library");
const OUT = join(REPO, "experiments", "maker-arc", "phase-c-experiments");

// The pre-bass-aware voiceChord vocabulary — the exact suffix set parseChordSymbol
// accepted BEFORE 6/m6/9/maj9/m9/dim7 + the min7/Δ/+/°/°7/7sus4 aliases landed. A
// symbol the OLD engine could voice (else renderReharmonization dropped its measure).
const OLD_SUFFIXES = new Set([
  "", "m", "7", "maj7", "m7", "dim", "m7b5", "aug", "sus4", "sus2", "add9", "madd9", "M7", "ø7", "ø",
]);
function oldKeeps(sym: string): boolean {
  const t = sym.trim();
  const base = t.includes("/") ? t.slice(0, t.indexOf("/")).trim() : t; // slash → base chord, as old parseChordSymbol did
  const m = /^([A-G])(#|b)?(.*)$/.exec(base);
  return m ? OLD_SUFFIXES.has(m[3]) : false;
}
const newKeeps = (sym: string): boolean => voiceChord(sym) !== null; // current engine
function quality(sym: string): string {
  const t = sym.trim();
  const base = t.includes("/") ? t.slice(0, t.indexOf("/")).trim() : t;
  const m = /^[A-G](#|b)?(.*)$/.exec(base);
  return m ? (m[2] || "maj") : sym;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  const model = arg("--models") ?? "qwen2.5:7b";

  initializeFromLibrary(LIBRARY);
  const items = selectERItems(getAllSongs());
  console.log(`bass-aware completeness A/B — ${items.length} items, ${model}, ABC decompose seed 42 (drift-free: same symbols, old vs new vocab)\n`);

  const perItem: Array<Record<string, unknown>> = [];
  let totEmitted = 0, totOld = 0, totNew = 0;
  const unlockedByQuality: Record<string, number> = {};
  const unlockedSymbols: Record<string, number> = {};

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const backend = new OllamaBackend(model, undefined, { seed: 42, num_predict: 1024 });
    let text = "";
    try { text = await backend.generateText({ systemPrompt: ABC_REHARM_SYSTEM, userMessage: buildAbcReharmUser(item) }); }
    catch { text = backend.lastRawText() ?? ""; }
    const syms = parseAbcChords(text, item.melody.map((m) => m.number)).map((c) => c.intendedChord);
    const oldKept = syms.filter(oldKeeps).length;
    const newKept = syms.filter(newKeeps).length;
    const unlocked = syms.filter((s) => newKeeps(s) && !oldKeeps(s));
    for (const s of unlocked) {
      unlockedByQuality[quality(s)] = (unlockedByQuality[quality(s)] ?? 0) + 1;
      unlockedSymbols[s] = (unlockedSymbols[s] ?? 0) + 1;
    }
    totEmitted += syms.length; totOld += oldKept; totNew += newKept;
    perItem.push({ itemId: item.itemId, emitted: syms.length, oldKept, newKept, unlocked });
    console.log(`  [${i + 1}/${items.length}] ${item.itemId}: emitted ${syms.length}, kept old ${oldKept} → new ${newKept}${unlocked.length ? "  +[" + unlocked.join(", ") + "]" : ""}`);
  }

  const receipt = {
    schemaVersion: "bass-aware-completeness/1.0.0",
    runDate: new Date().toISOString(),
    model,
    note: "Drift-free: each item's ABC generated once (seed 42); old vs new voiceChord vocabulary applied to the IDENTICAL emitted symbols. Metric is completeness (measures kept per proposal), not pass-rate.",
    itemCount: items.length,
    meanChordsEmitted: +(totEmitted / items.length).toFixed(3),
    meanKeptOld: +(totOld / items.length).toFixed(3),
    meanKeptNew: +(totNew / items.length).toFixed(3),
    droppedRateOld: +(1 - totOld / totEmitted).toFixed(4),
    droppedRateNew: +(1 - totNew / totEmitted).toFixed(4),
    newlyUnlockedMeasures: totNew - totOld,
    unlockedByQuality,
    unlockedSymbols,
    perItem,
  };
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `${model.replace(/[^a-zA-Z0-9._-]+/g, "_")}_bass-aware-completeness.json`);
  writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n");

  console.log(`\n  MEAN chords/proposal: emitted ${receipt.meanChordsEmitted}, kept OLD ${receipt.meanKeptOld} → NEW ${receipt.meanKeptNew}`);
  console.log(`  DROPPED-measure rate: OLD ${(receipt.droppedRateOld * 100).toFixed(1)}% → NEW ${(receipt.droppedRateNew * 100).toFixed(1)}%   (+${receipt.newlyUnlockedMeasures} measures unlocked across the set)`);
  console.log(`  unlocked by quality: ${JSON.stringify(unlockedByQuality)}`);
  console.log(`  written → ${path}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
