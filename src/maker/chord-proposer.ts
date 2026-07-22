// ─── Maker: the chords-only decompose prompt + the Ollama chord proposer ──────
//
// The DECOMPOSE half of the shipped inference maker (docs/maker-arc-phase-c-
// design.md, F1/F2/F7): the model emits CHORD SYMBOLS ONLY — a deterministic
// voicer (voicer.ts) renders the voicing, so chord fidelity is 100% by
// construction. This removed the base's 37%-voicing-fidelity wall and lifted the
// single-pass pass-rate 9% → 50% (E1); paired with best-of-n it reached 91% @16
// (E3), above the frontier single-shot ceiling — with no training.
//
// This module is the SINGLE SOURCE for the chords-only brief + tolerant parse
// (scripts/er-experiments.ts imports them, so the experiment path and the
// product path can never drift), plus OllamaChordProposer — the concrete
// ChordProposer the demo CLI and the auto_reharmonize MCP tool feed to
// autoReharmonize(). The pure loop stays LLM-free in reharmonize.ts; every
// Ollama-touching detail lives here (DECOMPOSE_BY_SECRETS).
// ─────────────────────────────────────────────────────────────────────────────

import { OllamaBackend } from "../dataset/eval/llm-backends/ollama.js";
import { buildERBrief, type ERItem } from "./er-gate.js";
import type { ChordChoice, ChordProposer } from "./reharmonize.js";

// ─── The chords-only brief (the decompose lever) ──────────────────────────────

export const CHORDS_ONLY_SYSTEM = [
  "You are a harmony arranger. Given a melody (per-measure right-hand notes) in a stated key,",
  "propose a REHARMONIZATION as a chord symbol per measure. A deterministic renderer will voice",
  "your chords — you do NOT write voicings, only the chord SYMBOLS.",
  "",
  "Rules:",
  "- Supported chord qualities ONLY: major (write the root alone, e.g. \"C\"), m, 7, maj7, m7, dim, m7b5, aug, sus4, sus2.",
  "- The melody must sit consonantly on your harmony: chord tones and standard tensions (9,11,13,#11); keep chromatic clashes rare.",
  "- REHARMONIZE — change the harmony on a meaningful share of measures vs the original (substitutions, secondary dominants, modal interchange).",
  "",
  "Output ONLY a JSON array, one object per melody measure, no prose:",
  '[{"measure": 1, "chord": "Am7"}, {"measure": 2, "chord": "Fmaj7"}, ...]',
].join("\n");

/** Build the chords-only user message for an item — the E-R melody table with a
 *  chord-per-measure ask (reuses buildERBrief so the two paths share one table). */
export function buildChordsOnlyUser(item: ERItem): string {
  const brief = buildERBrief(item);
  // Reuse the same melody table, drop the voicing instruction line.
  return brief.user.replace(
    /Propose your reharmonization.*$/s,
    "Propose your chord-per-measure reharmonization as a JSON array.",
  );
}

/**
 * Parse a chords-only response into ChordChoice[]. Tolerant: accepts a raw JSON
 * array, an object wrapping an array, or an array embedded in prose / ```json
 * fences; coerces field-name variants (chord/intendedChord/intended, measure/m/
 * bar) and drops malformed entries. Returns [] when nothing is recoverable.
 */
export function parseChordsOnly(raw: string): ChordChoice[] {
  if (!raw?.trim()) return [];
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
    const cand = fence ? fence[1] : extractFirstArray(raw);
    if (cand) {
      try {
        parsed = JSON.parse(cand);
      } catch {
        /* unrecoverable */
      }
    }
  }
  const arr = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? Object.values(parsed as object).find(Array.isArray)
      : null;
  if (!Array.isArray(arr)) return [];
  const out: ChordChoice[] = [];
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const measure = Number(o.measure ?? o.m ?? o.bar);
    const chord = String(o.chord ?? o.intendedChord ?? o.intended ?? "").trim();
    if (Number.isFinite(measure) && chord) out.push({ measure, intendedChord: chord });
  }
  return out;
}

/** Extract the first balanced [...] array substring, or null. */
function extractFirstArray(s: string): string | null {
  const start = s.indexOf("[");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === "[") depth++;
    else if (s[i] === "]" && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

// ─── The Ollama-backed chord proposer ─────────────────────────────────────────

/**
 * The minimal backend surface the proposer needs. OllamaBackend satisfies it;
 * tests inject a stub so seed-threading and the tolerant fail-soft path are
 * verifiable without a live model.
 */
export interface ChordProposerBackend {
  callStructured(args: {
    systemPrompt: string;
    userMessage: string;
    outputSchema: Record<string, unknown>;
  }): Promise<unknown>;
  lastRawText(): string | null;
  probe(): Promise<void>;
}

export interface OllamaChordProposerOptions {
  /** Base seed; sample k draws with seed baseSeed + k (matches er-experiments). Default 42. */
  baseSeed?: number;
  /** num_predict cap per sample. Default 1024 — the measured decompose cap
   *  (temp-0 loops qwen, so temperature is left at Ollama's default). */
  maxTokens?: number;
  /** Ollama base URL. Default OLLAMA_HOST env or http://localhost:11434. */
  baseUrl?: string;
  /** Optional style hint appended to the brief (e.g. "jazz"). Omitted → the
   *  pinned experiment prompt, byte-for-byte. */
  styleHint?: string;
  /** Test seam: build the backend for a given per-sample seed. */
  backendFactory?: (seed: number) => ChordProposerBackend;
}

/**
 * A ChordProposer backed by a seeded local Ollama model. Each proposeChords call
 * builds a fresh backend seeded baseSeed + sampleIndex, so best-of-n draws a
 * DIFFERENT proposal per sample (the seed is what makes the search explore).
 *
 * Fail-soft by construction: any per-sample failure (non-JSON output, a timeout,
 * an unreachable Ollama) yields [] rather than throwing, so one bad sample never
 * aborts the loop. Callers that want to surface Ollama-absent up front (the MCP
 * tool) should probe() once before running the loop.
 */
export class OllamaChordProposer implements ChordProposer {
  readonly model: string;
  readonly baseSeed: number;
  readonly maxTokens: number;
  private readonly styleHint?: string;
  private readonly makeBackend: (seed: number) => ChordProposerBackend;

  constructor(model = "qwen2.5:7b", opts: OllamaChordProposerOptions = {}) {
    this.model = model;
    this.baseSeed = opts.baseSeed ?? 42;
    this.maxTokens = opts.maxTokens ?? 1024;
    this.styleHint = opts.styleHint?.trim() || undefined;
    const { baseUrl, backendFactory } = opts;
    const maxTokens = this.maxTokens;
    this.makeBackend =
      backendFactory ??
      ((seed) => new OllamaBackend(model, baseUrl, { seed, num_predict: maxTokens }));
  }

  /** One-shot reachability check (Ollama is optional). Throws if unreachable. */
  async probe(): Promise<void> {
    await this.makeBackend(this.baseSeed).probe();
  }

  async proposeChords(item: ERItem, sampleIndex: number): Promise<ChordChoice[]> {
    const backend = this.makeBackend(this.baseSeed + sampleIndex);
    const userMessage = this.styleHint
      ? `${buildChordsOnlyUser(item)}\n\nTarget style: ${this.styleHint} — prefer its idiomatic reharmonizations.`
      : buildChordsOnlyUser(item);
    try {
      await backend.callStructured({
        systemPrompt: CHORDS_ONLY_SYSTEM,
        userMessage,
        outputSchema: {},
      });
    } catch {
      // Tolerant: callStructured throws on non-JSON output (rawText is still set,
      // and parseChordsOnly recovers fences/embedded arrays) and on an
      // unreachable/erroring Ollama (rawText null → []). The loop resamples.
    }
    return parseChordsOnly(backend.lastRawText() ?? "");
  }
}
