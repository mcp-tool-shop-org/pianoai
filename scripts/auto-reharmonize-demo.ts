#!/usr/bin/env tsx
// ─── auto-reharmonize-demo.ts — the shipped inference maker, end to end ────────
//
// Runs the Phase-C product core on ONE library section, live on local Ollama:
//
//   OllamaChordProposer (chords-only, seeded) → voiceChord (deterministic) →
//   verify_harmony best-of-n   =   autoReharmonize(item, proposer)
//
// Prints the verified reharmonization (source chord → proposed chord → voicing)
// and the loop telemetry (samplesUsed, passedAtSample, verified). $0 — local
// Ollama only. Ollama-optional: a clear message, not a stack trace, if it is not
// reachable.
//
// Usage:
//   pnpm exec tsx scripts/auto-reharmonize-demo.ts
//   pnpm exec tsx scripts/auto-reharmonize-demo.ts --song fallin --n 16 --model qwen2.5:7b
//   pnpm exec tsx scripts/auto-reharmonize-demo.ts --item 3
// ─────────────────────────────────────────────────────────────────────────────

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeFromLibrary } from "../src/songs/library.js";
import { getAllSongs } from "../src/songs/registry.js";
import { selectERItems, type ERItem } from "../src/maker/er-gate.js";
import { autoReharmonize } from "../src/maker/reharmonize.js";
import { OllamaChordProposer } from "../src/maker/chord-proposer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIBRARY_DIR = join(__dirname, "..", "songs", "library");

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (f: string) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : null;
  };
  const model = arg("--model") ?? "qwen2.5:7b";
  const n = parseInt(arg("--n") ?? "16", 10);
  const songId = arg("--song");
  const itemIndex = parseInt(arg("--item") ?? "0", 10);

  initializeFromLibrary(LIBRARY_DIR);
  const items = selectERItems(getAllSongs());
  const item: ERItem | undefined = songId
    ? items.find((it) => it.songId === songId)
    : items[itemIndex];

  if (!item) {
    console.error(
      songId
        ? `No E-R item for song "${songId}". Available songs: ${items.map((it) => it.songId).join(", ")}`
        : `No E-R item at index ${itemIndex} (valid: 0..${items.length - 1}).`,
    );
    process.exit(2);
  }

  console.log(
    `\n═══ auto_reharmonize — ${item.title} (${item.genre}) ` +
      `m${item.measureRange[0]}-${item.measureRange[1]} ═══`,
  );
  console.log(`Key ${item.key} | Time ${item.timeSignature} | model ${model} | best-of-${n}\n`);

  const proposer = new OllamaChordProposer(model, { maxTokens: 1024 });
  try {
    await proposer.probe();
  } catch (err) {
    console.error(
      `Ollama not reachable — this demo needs a local model.\n  ` +
        (err instanceof Error ? err.message : String(err)),
    );
    process.exit(1);
  }

  const t0 = Date.now();
  const result = await autoReharmonize(item, proposer, { maxSamples: n });
  const elapsedS = ((Date.now() - t0) / 1000).toFixed(1);

  // Per-measure: source chord → proposed chord (Δ = changed) → deterministic voicing.
  console.log("Reharmonization (source → proposed → voicing):");
  const byMeasure = new Map(result.reharmonization.map((r) => [r.measure, r]));
  const changed = new Map(result.score.nonTriviality.perMeasure.map((p) => [p.measure, p]));
  for (const src of item.sourceChords) {
    const r = byMeasure.get(src.measure);
    if (!r) {
      console.log(`  m${String(src.measure).padStart(2)}: ${src.impliedChord.padEnd(7)} → (no chord proposed)`);
      continue;
    }
    const mark = changed.get(src.measure)?.changed ? "Δ" : " ";
    console.log(
      `  m${String(src.measure).padStart(2)}: ${src.impliedChord.padEnd(7)} → ` +
        `${r.intendedChord.padEnd(7)} ${mark}  [${r.voicing}]`,
    );
  }

  const s = result.score;
  console.log(
    `\nVerdict: ${result.verified ? "✅ VERIFIED" : "❌ not verified"} — ` +
      `chord fidelity ${s.chordFidelity.matched}/${s.chordFidelity.total}, ` +
      `chromatic ratio ${s.consonance.chromaticRatio.toFixed(3)}, ` +
      `changed ${s.nonTriviality.changedMeasures}/${s.nonTriviality.totalMeasures} ` +
      `(${(s.nonTriviality.fraction * 100).toFixed(0)}%, need ≥${(s.nonTriviality.threshold * 100).toFixed(0)}%)`,
  );
  console.log(
    `Telemetry: samplesUsed=${result.samplesUsed}, passedAtSample=${result.passedAtSample ?? "—"}, ` +
      `verified=${result.verified}, elapsed=${elapsedS}s`,
  );
  if (!result.verified) {
    console.log("(No sample cleared the gate within the budget — showing the closest attempt. Try a higher --n.)");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
