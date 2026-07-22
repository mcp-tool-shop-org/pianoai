#!/usr/bin/env tsx
// ─── er-experiments.ts — $0 local lever experiments (pre-pod) ─────────────────
//
// Tests the study-swarm's pod-obviating levers on the frozen 22-item E-R set,
// grounded in docs/maker-arc-phase-c-design.md:
//
//   E1 decompose    — the model emits CHORD SYMBOLS ONLY; a deterministic voicer
//                     (src/maker/voicer.ts) renders the voicing. Removes the 37%
//                     voicing-fidelity bottleneck by construction (Chord
//                     Jazzification ISMIR 2020; PAL/PoT). pass = consonance ∧
//                     non-triviality of the model's CHORDS.
//   E2 best-of-n    — the FULL prompt (chord+voicing), sampled N times; coverage@k
//                     = fraction of items some sample passes (Brown 2024 / Stroebl
//                     2024: with a perfect verifier, coverage → solve-rate).
//   E3 decompose×N  — chords-only, sampled N times, voiced deterministically —
//                     the candidate inference PRODUCT (base + voicer + verifier).
//
// $0: local Ollama only. Seeded, receipted. No pods, no API, no HF.
//
// Usage:
//   pnpm exec tsx scripts/er-experiments.ts --mode decompose --models qwen2.5:7b
//   pnpm exec tsx scripts/er-experiments.ts --mode best-of-n --n 16 --models qwen2.5:7b
//   pnpm exec tsx scripts/er-experiments.ts --mode decompose-bon --n 16 --models qwen2.5:7b
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeFromLibrary } from "../src/songs/library.js";
import { getAllSongs } from "../src/songs/registry.js";
import {
  selectERItems,
  scoreERProposal,
  parseReharmonization,
  buildERBrief,
  ER_NON_TRIVIALITY_FRACTION,
  type ERItem,
  type ParsedReharmonization,
} from "../src/maker/er-gate.js";
import { renderReharmonization } from "../src/maker/voicer.js";
import {
  CHORDS_ONLY_SYSTEM,
  buildChordsOnlyUser,
  parseChordsOnly,
} from "../src/maker/chord-proposer.js";
import { OllamaBackend } from "../src/dataset/eval/llm-backends/ollama.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const LIBRARY_DIR = join(REPO_ROOT, "songs", "library");
const OUTPUT_DIR = join(REPO_ROOT, "experiments", "maker-arc", "phase-c-experiments");

// The chords-only brief + tolerant parse (the decompose lever) are promoted to
// src/maker/chord-proposer.ts as the SINGLE SOURCE — imported above so the
// experiment path and the product path (OllamaChordProposer / the MCP tool) can
// never drift. The request bytes here are unchanged by the move.

// ─── Generation ───────────────────────────────────────────────────────────────

async function genFull(backend: OllamaBackend, item: ERItem): Promise<ParsedReharmonization> {
  const brief = buildERBrief(item);
  try { await backend.callStructured({ systemPrompt: brief.system, userMessage: brief.user, outputSchema: {} }); } catch { /* */ }
  return parseReharmonization(backend.lastRawText() ?? "");
}

async function genDecompose(backend: OllamaBackend, item: ERItem): Promise<ParsedReharmonization> {
  try { await backend.callStructured({ systemPrompt: CHORDS_ONLY_SYSTEM, userMessage: buildChordsOnlyUser(item), outputSchema: {} }); } catch { /* */ }
  const chords = parseChordsOnly(backend.lastRawText() ?? "");
  const measures = renderReharmonization(chords); // deterministic voicing → fidelity 100% by construction
  return { measures, status: measures.length ? "clean" : "unrecoverable" };
}

function backendFor(model: string, seed: number, maxTokens: number): OllamaBackend {
  return new OllamaBackend(model, undefined, { seed, num_predict: maxTokens });
}

// ─── Modes ────────────────────────────────────────────────────────────────────

interface ItemOutcome { itemId: string; genre: string; passAt: number | null; /* first sample index (1-based) that passed, null = none */ }

async function runSinglePass(model: string, items: ERItem[], gen: (b: OllamaBackend, it: ERItem) => Promise<ParsedReharmonization>, maxTokens: number, label: string): Promise<void> {
  console.log(`\n═══ ${label} — ${model}, ${items.length} items, single pass (seed 42) ═══`);
  const backend = backendFor(model, 42, maxTokens);
  const outcomes: ItemOutcome[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const parsed = await gen(backend, item);
    const score = scoreERProposal(item, parsed);
    outcomes.push({ itemId: item.itemId, genre: item.genre, passAt: score.passes ? 1 : null });
    console.log(`  [${i + 1}/${items.length}] ${item.itemId}: fidelity ${score.chordFidelity.matched}/${score.chordFidelity.total} Δ${(score.nonTriviality.fraction * 100).toFixed(0)}% ${score.passes ? "✓ PASS" : "· fail"}`);
  }
  const pass = outcomes.filter((o) => o.passAt !== null).length;
  console.log(`  → ${label}: ${pass}/${items.length} pass (${(pass / items.length * 100).toFixed(1)}%)`);
  writeReceipt(label, model, { mode: label, passRate: pass / items.length, passCount: pass, itemCount: items.length, outcomes });
}

async function runBestOfN(model: string, items: ERItem[], n: number, gen: (b: OllamaBackend, it: ERItem) => Promise<ParsedReharmonization>, maxTokens: number, label: string): Promise<void> {
  console.log(`\n═══ ${label} — ${model}, ${items.length} items, best-of-${n} ═══`);
  const outcomes: ItemOutcome[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let passAt: number | null = null;
    for (let k = 0; k < n; k++) {
      const backend = backendFor(model, 42 + k, maxTokens); // distinct seed per sample
      const parsed = await gen(backend, item);
      if (scoreERProposal(item, parsed).passes) { passAt = k + 1; break; }
    }
    outcomes.push({ itemId: item.itemId, genre: item.genre, passAt });
    console.log(`  [${i + 1}/${items.length}] ${item.itemId}: ${passAt === null ? "· no pass in " + n : "✓ pass@" + passAt}`);
  }
  // coverage@k curve
  const ks = [1, 2, 4, 8, 16, 32].filter((k) => k <= n);
  const coverage: Record<string, number> = {};
  for (const k of ks) coverage[String(k)] = outcomes.filter((o) => o.passAt !== null && o.passAt <= k).length / items.length;
  console.log(`  → ${label} coverage@k: ${ks.map((k) => `@${k}=${(coverage[String(k)] * 100).toFixed(0)}%`).join(" ")}`);
  writeReceipt(label + `-n${n}`, model, { mode: label, n, coverageAtK: coverage, itemCount: items.length, outcomes });
}

function writeReceipt(label: string, model: string, payload: Record<string, unknown>): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const path = join(OUTPUT_DIR, `${(model + "_" + label).replace(/[^a-zA-Z0-9._-]+/g, "_")}.json`);
  writeFileSync(path, JSON.stringify({ schemaVersion: "er-experiment/1.0.0", runDate: new Date().toISOString(), model, nonTrivialityFraction: ER_NON_TRIVIALITY_FRACTION, ...payload }, null, 2) + "\n");
  console.log(`  written → ${path}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  const mode = arg("--mode") ?? "decompose";
  const n = parseInt(arg("--n") ?? "16", 10);
  const models = (arg("--models") ?? "qwen2.5:7b").split(",").map((s) => s.trim()).filter(Boolean);

  initializeFromLibrary(LIBRARY_DIR);
  const items = selectERItems(getAllSongs());
  console.log(`E-R experiments — ${items.length} items, mode=${mode}${mode.includes("bon") || mode === "best-of-n" ? ` n=${n}` : ""}`);

  for (const model of models) {
    if (mode === "decompose") await runSinglePass(model, items, genDecompose, 1024, "decompose");
    else if (mode === "best-of-n") await runBestOfN(model, items, n, genFull, 2048, "best-of-n");
    else if (mode === "decompose-bon") await runBestOfN(model, items, n, genDecompose, 1024, "decompose-bon");
    else { console.error(`unknown mode: ${mode}`); process.exit(2); }
  }
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); });
