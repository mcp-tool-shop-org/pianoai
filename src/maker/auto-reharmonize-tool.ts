// ─── Maker: the auto_reharmonize tool core (proposer-injected, testable) ──────
//
// The section-reharmonize logic behind the auto_reharmonize MCP tool, factored
// out of the server closure so it is unit-testable with a STUB ChordProposer
// (no live model). Given a song + measure range + an injected proposer, it:
//   builds the E-R item → runs autoReharmonize (decompose × best-of-n, external
//   verifier only) → returns the verified reharmonization + telemetry, plus a
//   readable report.
//
// The Ollama-specific glue (constructing the concrete OllamaChordProposer and
// probing for reachability — Ollama is OPTIONAL) stays in mcp-server.ts; this
// core is proposer-agnostic and deterministic given a deterministic proposer.
// ─────────────────────────────────────────────────────────────────────────────

import { autoReharmonize, type ChordProposer } from "./reharmonize.js";
import { buildERItemFromSong } from "./er-gate.js";
import type { SongEntry } from "../songs/types.js";
import type { ReharmonizedMeasure } from "./verify-harmony.js";

export interface AutoReharmonizePayload {
  songId: string;
  title: string;
  genre: string;
  measureRange: [number, number];
  key: string;
  /** True iff a sample passed verify_harmony (fidelity ∧ consonance) AND non-triviality. */
  verified: boolean;
  reharmonization: ReharmonizedMeasure[];
  telemetry: {
    samplesUsed: number;
    passedAtSample: number | null;
    maxSamples: number;
    /** e.g. "8/8" — every voicing confirmed by the chord engine (guaranteed by the voicer). */
    chordFidelity: string;
    chromaticRatio: number;
    changedFraction: number;
    nonTrivialityThreshold: number;
  };
}

export type AutoReharmonizeToolResult =
  | { ok: true; text: string; payload: AutoReharmonizePayload }
  | { ok: false; code: "bad_measure_range" | "no_melody_in_section"; message: string; hint: string };

export interface ReharmonizeSectionOptions {
  /** Measure range (1-based measure numbers), e.g. "1-8". Default measures 1-8. */
  measures?: string;
  /** Best-of-n budget. Default 16 (the measured knee). */
  maxSamples?: number;
  /** The chord proposer (inject a stub in tests; OllamaChordProposer in the tool). */
  proposer: ChordProposer;
}

/** Parse "N" or "start-end" into 1-based { start, bars }, or an error message. */
export function parseSectionRange(measures?: string): { start: number; bars: number } | { error: string } {
  if (!measures || !measures.trim()) return { start: 1, bars: 8 };
  const parts = measures.split("-").map((s) => s.trim());
  if (parts.length < 1 || parts.length > 2 || parts.some((p) => !p)) {
    return { error: `Invalid measure range "${measures}". Use "N" or "start-end", e.g. "1-8".` };
  }
  const start = Number.parseInt(parts[0], 10);
  const end = parts.length === 2 ? Number.parseInt(parts[1], 10) : start;
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { error: `Invalid measure range "${measures}". Measures must be whole numbers, e.g. "1-8".` };
  }
  if (start < 1) return { error: `Invalid measure range "${measures}". Measures are 1-based.` };
  if (end < start) return { error: `Invalid measure range "${measures}". The end measure must be ≥ the start.` };
  return { start, bars: end - start + 1 };
}

/**
 * Reharmonize a section of a song with the injected proposer and report the
 * result. Deterministic given a deterministic proposer; the only judge is
 * verify_harmony (via autoReharmonize) — never model self-critique.
 */
export async function reharmonizeSongSection(
  song: SongEntry,
  opts: ReharmonizeSectionOptions,
): Promise<AutoReharmonizeToolResult> {
  const range = parseSectionRange(opts.measures);
  if ("error" in range) {
    return { ok: false, code: "bad_measure_range", message: range.error, hint: 'Pass a range like "1-8", or omit it for the first 8 measures.' };
  }

  const item = buildERItemFromSong(song, range.start, range.bars);
  if (!item) {
    return {
      ok: false,
      code: "no_melody_in_section",
      message: `Measures ${range.start}-${range.start + range.bars - 1} of "${song.id}" have no melody to reharmonize.`,
      hint: "Pick a range that contains right-hand melody, or widen the range.",
    };
  }

  const maxSamples = opts.maxSamples ?? 16;
  const result = await autoReharmonize(item, opts.proposer, { maxSamples });
  const s = result.score;

  const payload: AutoReharmonizePayload = {
    songId: song.id,
    title: item.title,
    genre: item.genre,
    measureRange: item.measureRange,
    key: item.key,
    verified: result.verified,
    reharmonization: result.reharmonization,
    telemetry: {
      samplesUsed: result.samplesUsed,
      passedAtSample: result.passedAtSample,
      maxSamples,
      chordFidelity: `${s.chordFidelity.matched}/${s.chordFidelity.total}`,
      chromaticRatio: Number(s.consonance.chromaticRatio.toFixed(3)),
      changedFraction: Number(s.nonTriviality.fraction.toFixed(3)),
      nonTrivialityThreshold: s.nonTriviality.threshold,
    },
  };

  // Readable report: source chord → proposed chord (Δ = changed) → voicing.
  const changed = new Map(s.nonTriviality.perMeasure.map((p) => [p.measure, p]));
  const byMeasure = new Map(result.reharmonization.map((r) => [r.measure, r]));
  const lines: string[] = [
    `${result.verified ? "✅ VERIFIED" : "❌ not verified within the budget"} — ` +
      `reharmonized ${item.title} (${item.genre}) m${item.measureRange[0]}-${item.measureRange[1]}, key ${item.key}`,
    "",
    "| Measure | Original → Proposed | Voicing |",
    "|---------|---------------------|---------|",
  ];
  for (const src of item.sourceChords) {
    const r = byMeasure.get(src.measure);
    if (!r) {
      lines.push(`| ${src.measure} | ${src.impliedChord} → (none) | — |`);
      continue;
    }
    const mark = changed.get(src.measure)?.changed ? " Δ" : "";
    lines.push(`| ${src.measure} | ${src.impliedChord} → ${r.intendedChord}${mark} | ${r.voicing} |`);
  }
  lines.push(
    "",
    `Telemetry: samplesUsed=${result.samplesUsed}, passedAtSample=${result.passedAtSample ?? "—"}, ` +
      `chord fidelity ${payload.telemetry.chordFidelity}, chromatic ${payload.telemetry.chromaticRatio}, ` +
      `changed ${(s.nonTriviality.fraction * 100).toFixed(0)}% (need ≥${(s.nonTriviality.threshold * 100).toFixed(0)}%)`,
    result.verified
      ? "\nEvery voicing is confirmed by the chord engine and the melody sits on the new harmony. Save with add_song, hear it with play_song."
      : `\nNo sample cleared verify_harmony within ${maxSamples} tries — showing the closest attempt. Retry with a higher maxSamples.`,
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
  );

  return { ok: true, text: lines.join("\n"), payload };
}
