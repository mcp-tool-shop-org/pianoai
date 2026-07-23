// ─── Compose: the cross-family Ollama BWS judge (blind best-worst) ────────────
//
// The judge half of the $0 quality smoke-screen (bws.ts is the pure core). It
// presents a judge model with k ANONYMIZED, shuffled realizations of the SAME
// progression and asks for the best + worst by voice-leading / musicality. The
// judge never sees which system produced which option (reasoning-hidden), and no
// judge grades its own generator (the generator here is deterministic or a
// different local model) — EXTERNAL_VERIFIER discipline.
//
// Cross-family is the caller's job: instantiate one OllamaBwsJudge per local
// family (mistral / granite / qwen3.6 / gemma4 / aya-expanse / hermes — all on the
// rig, zero API cost) so the panel spans ≥3 disjoint families. Fail-soft: an
// unparseable or unreachable judgment yields null (that tuple is dropped for that
// family), never a fabricated vote. Ollama detail isolated here (DECOMPOSE_BY_SECRETS).
// ─────────────────────────────────────────────────────────────────────────────

import { OllamaBackend } from "../dataset/eval/llm-backends/ollama.js";
import type { ChordProposerBackend } from "../maker/chord-proposer.js";

/** Build the blind best-worst prompt over k rendered (anonymized) options. */
export function buildJudgePrompt(key: string, options: string[]): { system: string; user: string } {
  const system = [
    `You are a music theory examiner judging keyboard part-writing. You will see several`,
    `voicings of the SAME chord progression, each labeled "Option N". Judge them ONLY on`,
    `voice-leading quality and musicality:`,
    `- every note should belong to its chord;`,
    `- prefer smooth motion (common tones, small steps) over leaps;`,
    `- avoid parallel perfect fifths and octaves;`,
    `- resolve tendency tones; keep sensible spacing and doublings.`,
    ``,
    `Pick the ONE best option and the ONE worst option. Output ONLY JSON, no prose:`,
    `{"best": <option number>, "worst": <option number>}`,
  ].join("\n");

  const blocks = options.map((o, i) => `Option ${i + 1}:\n${o}`).join("\n\n");
  const user = [
    `Progression key: ${key}. ${options.length} options follow — each is the same chords, voiced differently.`,
    ``,
    blocks,
    ``,
    `Return {"best": N, "worst": N} with 1-based option numbers (best ≠ worst).`,
  ].join("\n");
  return { system, user };
}

/** Parse a judge response into 0-based {best, worst} indices, or null. */
export function parseJudgeResponse(raw: string, k: number): { best: number; worst: number } | null {
  if (!raw?.trim()) return null;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = /\{[^}]*\}/.exec(raw);
    if (m) {
      try {
        parsed = JSON.parse(m[0]);
      } catch {
        /* unrecoverable */
      }
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const best = Number(o.best ?? o.Best ?? o.b);
  const worst = Number(o.worst ?? o.Worst ?? o.w);
  if (!Number.isFinite(best) || !Number.isFinite(worst)) return null;
  const bi = Math.round(best) - 1;
  const wi = Math.round(worst) - 1;
  if (bi < 0 || bi >= k || wi < 0 || wi >= k || bi === wi) return null;
  return { best: bi, worst: wi };
}

export interface OllamaBwsJudgeOptions {
  seed?: number;
  maxTokens?: number;
  baseUrl?: string;
  backendFactory?: (seed: number) => ChordProposerBackend;
}

/** A single-family BWS judge backed by a local Ollama model. */
export class OllamaBwsJudge {
  readonly model: string;
  readonly family: string;
  private readonly seed: number;
  private readonly makeBackend: (seed: number) => ChordProposerBackend;

  constructor(model: string, family: string, opts: OllamaBwsJudgeOptions = {}) {
    this.model = model;
    this.family = family;
    this.seed = opts.seed ?? 7;
    const { baseUrl, backendFactory } = opts;
    const maxTokens = opts.maxTokens ?? 128;
    this.makeBackend =
      backendFactory ?? ((seed) => new OllamaBackend(model, baseUrl, { seed, num_predict: maxTokens }));
  }

  async probe(): Promise<void> {
    await this.makeBackend(this.seed).probe();
  }

  /** Judge one tuple of rendered options → 0-based {best, worst}, or null (dropped). */
  async judge(key: string, options: string[], tupleSeed = 0): Promise<{ best: number; worst: number } | null> {
    const backend = this.makeBackend(this.seed + tupleSeed);
    const { system, user } = buildJudgePrompt(key, options);
    try {
      await backend.callStructured({ systemPrompt: system, userMessage: user, outputSchema: {} });
    } catch {
      // tolerant: rawText may still hold recoverable JSON; else null below
    }
    return parseJudgeResponse(backend.lastRawText() ?? "", options.length);
  }
}
