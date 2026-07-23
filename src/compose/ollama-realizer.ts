// ─── Compose: the Ollama-backed realization proposer ─────────────────────────
//
// The concrete RealizationProposer the demo + measurement feed to
// realizeProgression(). It mirrors OllamaChordProposer (src/maker/chord-
// proposer.ts): a seeded local model, one fresh backend per sample (seed =
// baseSeed + sampleIndex) so best-of-n draws a DIFFERENT realization each time,
// and fail-soft by construction — any per-sample failure (non-JSON, timeout,
// unreachable Ollama) yields null, so one bad sample never aborts the loop.
//
// The pure loop stays LLM-free in realize.ts; every Ollama-touching detail lives
// here (DECOMPOSE_BY_SECRETS). The brief asks the model to VOICE a fixed
// progression — it does not change the chords, only chooses the notes — so the
// deterministic gate judges part-writing, not harmony (that was Phase-1/the maker).
// ─────────────────────────────────────────────────────────────────────────────

import { OllamaBackend } from "../dataset/eval/llm-backends/ollama.js";
import type { ChordProposerBackend } from "../maker/chord-proposer.js";
import { frameFromVoicing, type Realization } from "./types.js";
import type { ChordProgression, RealizationProposer } from "./realize.js";

// ─── The realize brief (voice-the-progression) ────────────────────────────────

/** Build the system prompt for an N-voice realization (N injected). */
export function realizeSystem(voices: number): string {
  return [
    `You are a keyboard part-writer. Given a FIXED chord progression in a key, VOICE`,
    `each chord as exactly ${voices} voices written LOW TO HIGH (bass first). Do NOT`,
    `change the chords — only choose the notes that spell and voice them.`,
    ``,
    `Write good voice-leading:`,
    `- every note must belong to that measure's chord;`,
    `- avoid parallel perfect fifths and octaves between any two voices;`,
    `- move each voice as little as possible (prefer common tones and steps);`,
    `- resolve a chordal 7th down by step and the leading tone up to the tonic;`,
    `- keep adjacent upper voices within an octave.`,
    ``,
    `Output ONLY a JSON array, one object per measure, no prose. Each "voicing" is`,
    `space-separated scientific-pitch notes low→high (octaves ~2–5):`,
    `[{"measure": 1, "voicing": "C3 E3 G3 C4"}, {"measure": 2, "voicing": "B2 D3 G3 B3"}]`,
  ].join("\n");
}

/** Build the user message: the fixed progression as a measure→chord table. */
export function buildRealizeUser(progression: ChordProgression, voices: number): string {
  const lines: string[] = [
    `# Voice this progression in ${progression.key} — ${voices} voices per chord, bass to soprano.`,
    ``,
    `| Measure | Chord |`,
    `|---------|-------|`,
  ];
  for (const c of progression.chords) lines.push(`| ${c.measure} | ${c.chordSymbol} |`);
  lines.push(``, `Return one JSON object per measure above with its voicing.`);
  return lines.join("\n");
}

/** JSON-schema-ish descriptor forwarded to Ollama's format:"json" mode. */
export const REALIZE_OUTPUT_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: { measure: { type: "integer" }, voicing: { type: "string" } },
    required: ["measure", "voicing"],
  },
} as const;

// ─── Tolerant response parsing ────────────────────────────────────────────────

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

/** Read a voicing value from a response entry — a string, or an array of note tokens. */
function voicingOf(o: Record<string, unknown>): string {
  const raw = o.voicing ?? o.voices ?? o.notes ?? o.voicing_notes;
  if (Array.isArray(raw)) return raw.map((x) => String(x)).join(" ");
  return String(raw ?? "").trim();
}

/**
 * Parse a realizer response into a Realization aligned to the progression: every
 * progression measure gets a frame (its voicing if the model supplied one, else
 * an empty rest frame — which fails the structure gate and is resampled).
 * Tolerant: raw array, object-wrapping-array, or an array in prose/```json.
 */
export function parseRealizationResponse(raw: string, progression: ChordProgression): Realization {
  let parsed: unknown = null;
  if (raw?.trim()) {
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
  }
  const arr = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? Object.values(parsed as object).find(Array.isArray)
      : null;

  const voicingByMeasure = new Map<number, string>();
  if (Array.isArray(arr)) {
    for (const e of arr) {
      if (!e || typeof e !== "object") continue;
      const o = e as Record<string, unknown>;
      const measure = Number(o.measure ?? o.m ?? o.bar);
      const voicing = voicingOf(o);
      if (Number.isFinite(measure) && voicing) voicingByMeasure.set(measure, voicing);
    }
  }

  const frames = progression.chords.map((c) => {
    const voicing = voicingByMeasure.get(c.measure);
    return voicing ? frameFromVoicing(c.measure, c.chordSymbol, voicing) : { measure: c.measure, chordSymbol: c.chordSymbol, voices: [] };
  });
  return { key: progression.key, frames };
}

// ─── The proposer ─────────────────────────────────────────────────────────────

export interface OllamaRealizerOptions {
  /** Base seed; sample k draws with seed baseSeed + k. Default 42. */
  baseSeed?: number;
  /** num_predict cap per sample. Default 1024. */
  maxTokens?: number;
  /** Voices per chord. Default 4. */
  voices?: number;
  /** Ollama base URL. Default OLLAMA_HOST env or http://localhost:11434. */
  baseUrl?: string;
  /** Optional style hint appended to the brief (e.g. "chorale", "jazz"). */
  styleHint?: string;
  /** Test seam: build the backend for a given per-sample seed. */
  backendFactory?: (seed: number) => ChordProposerBackend;
}

/**
 * A RealizationProposer backed by a seeded local Ollama model. Fresh backend per
 * sample (seed = baseSeed + sampleIndex) → best-of-n explores. Fail-soft: any
 * per-sample failure yields null (the loop resamples). Call probe() once up front
 * to surface an unreachable Ollama as a clear error.
 */
export class OllamaRealizer implements RealizationProposer {
  readonly model: string;
  readonly baseSeed: number;
  readonly maxTokens: number;
  readonly voices: number;
  private readonly styleHint?: string;
  private readonly makeBackend: (seed: number) => ChordProposerBackend;

  constructor(model = "qwen2.5:7b", opts: OllamaRealizerOptions = {}) {
    this.model = model;
    this.baseSeed = opts.baseSeed ?? 42;
    this.maxTokens = opts.maxTokens ?? 1024;
    this.voices = opts.voices ?? 4;
    this.styleHint = opts.styleHint?.trim() || undefined;
    const { baseUrl, backendFactory } = opts;
    const maxTokens = this.maxTokens;
    this.makeBackend =
      backendFactory ?? ((seed) => new OllamaBackend(model, baseUrl, { seed, num_predict: maxTokens }));
  }

  /** One-shot reachability check (Ollama is optional). Throws if unreachable. */
  async probe(): Promise<void> {
    await this.makeBackend(this.baseSeed).probe();
  }

  async proposeRealization(progression: ChordProgression, sampleIndex: number): Promise<Realization | null> {
    const backend = this.makeBackend(this.baseSeed + sampleIndex);
    const base = buildRealizeUser(progression, this.voices);
    const userMessage = this.styleHint
      ? `${base}\n\nTarget style: ${this.styleHint} — prefer its idiomatic voicings.`
      : base;
    try {
      await backend.callStructured({
        systemPrompt: realizeSystem(this.voices),
        userMessage,
        outputSchema: REALIZE_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
      });
    } catch {
      // Tolerant: callStructured throws on non-JSON (rawText still set) or on an
      // unreachable/erroring Ollama (rawText null → all-rest frames → rejected).
    }
    const raw = backend.lastRawText() ?? "";
    if (!raw) return null;
    return parseRealizationResponse(raw, progression);
  }
}
