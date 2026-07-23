// ─── Compose: the Ollama voicing-SPEC proposer (membership by construction) ───
//
// Slice B1a's proposer: instead of asking the model for raw pitches (the
// Session-1 OllamaRealizer, which drifts off membership), it asks the model for a
// VOICING SPEC per measure — an inversion + a chord-tone selection per voice —
// and a DETERMINISTIC renderer (voicing-spec.ts) maps that spec onto the fixed
// chord's exact pitch classes. The model never emits a pitch, so it can never
// emit a non-chord pitch: membership-violation rate is 0 by construction (findings
// 11–13). It mirrors OllamaChordProposer / OllamaRealizer — a seeded local model,
// a fresh backend per sample (seed = baseSeed + sampleIndex) so best-of-n
// explores, and fail-soft (any per-sample failure → null, the loop resamples).
//
// The pure loop stays LLM-free in realize.ts; every Ollama-touching detail lives
// here (DECOMPOSE_BY_SECRETS). This proposer swaps in for OllamaRealizer wherever
// membership drift is the bottleneck — same RealizationProposer contract.
// ─────────────────────────────────────────────────────────────────────────────

import { OllamaBackend } from "../dataset/eval/llm-backends/ollama.js";
import type { ChordProposerBackend } from "../maker/chord-proposer.js";
import { renderSpecRealization, type VoicingSpec } from "./voicing-spec.js";
import type { Realization } from "./types.js";
import type { ChordProgression, RealizationProposer } from "./realize.js";

// ─── The voicing-spec brief (choose an inversion + doublings, not pitches) ────

/** Build the system prompt for an N-voice voicing SPEC (N injected). */
export function specSystem(voices: number): string {
  return [
    `You are a keyboard part-writer. Given a FIXED chord progression in a key, choose`,
    `a VOICING for each chord as exactly ${voices} voices, low to high (bass first).`,
    `You do NOT write pitches — you choose, for each voice, WHICH note OF THE CHORD it`,
    `sings, and a renderer places the octaves.`,
    ``,
    `Number the chord's notes from 0: 0 = the root, 1 = the next chord note up, 2 = the`,
    `next, and so on. For a triad the notes are 0=root, 1=third, 2=fifth; for a seventh`,
    `chord add 3=seventh. Give a "degrees" array of ${voices} such numbers, low to high:`,
    `- the FIRST number is the bass (0 = root position, 1 = first inversion, …);`,
    `- repeat a number to DOUBLE that chord note (e.g. double the root or the fifth);`,
    `- "bassOctave" (optional, default 3) sets the register of the bass.`,
    ``,
    `Write good voice-leading: prefer common tones and small moves between chords,`,
    `avoid parallel perfect fifths/octaves, double the root or fifth (never the third`,
    `or the leading tone).`,
    ``,
    `Output ONLY a JSON array, one object per measure, no prose. Example (4 voices):`,
    `[{"measure": 1, "degrees": [0, 1, 2, 0], "bassOctave": 3}, {"measure": 2, "degrees": [2, 0, 1, 2]}]`,
  ].join("\n");
}

/** Build the user message: the fixed progression as a measure→chord table. */
export function buildSpecUser(progression: ChordProgression, voices: number): string {
  const lines: string[] = [
    `# Voice this progression in ${progression.key} — ${voices} voices per chord, bass to soprano.`,
    ``,
    `| Measure | Chord |`,
    `|---------|-------|`,
  ];
  for (const c of progression.chords) lines.push(`| ${c.measure} | ${c.chordSymbol} |`);
  lines.push(``, `Return one JSON object per measure above with its "degrees" (${voices} chord-note numbers, low→high).`);
  return lines.join("\n");
}

/** JSON-schema-ish descriptor forwarded to Ollama's format:"json" mode. */
export const SPEC_OUTPUT_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      measure: { type: "integer" },
      degrees: { type: "array", items: { type: "integer" } },
      bassOctave: { type: "integer" },
    },
    required: ["measure", "degrees"],
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

/** Read a degrees array from a response entry (tolerant of field-name variants). */
function degreesOf(o: Record<string, unknown>): number[] {
  const raw = o.degrees ?? o.voices ?? o.tones ?? o.notes;
  if (Array.isArray(raw)) return raw.map((x) => Number(x)).filter((x) => Number.isFinite(x));
  return [];
}

/**
 * Parse a spec response into VoicingSpec[]. Tolerant: raw array, object-wrapping-
 * array, or an array in prose / ```json fences; coerces measure/degrees/bassOctave
 * field variants; drops entries with no usable degrees. Returns [] when nothing is
 * recoverable (the renderer then yields all-rest frames → resampled).
 */
export function parseSpecResponse(raw: string): VoicingSpec[] {
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
  if (!Array.isArray(arr)) return [];

  const out: VoicingSpec[] = [];
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const measure = Number(o.measure ?? o.m ?? o.bar);
    const degrees = degreesOf(o);
    if (!Number.isFinite(measure) || degrees.length === 0) continue;
    const bassOctaveRaw = Number(o.bassOctave ?? o.octave ?? o.bass_octave);
    const spec: VoicingSpec = { measure, degrees };
    if (Number.isFinite(bassOctaveRaw)) spec.bassOctave = bassOctaveRaw;
    out.push(spec);
  }
  return out;
}

// ─── The proposer ─────────────────────────────────────────────────────────────

export interface OllamaSpecRealizerOptions {
  /** Base seed; sample k draws with seed baseSeed + k. Default 42. */
  baseSeed?: number;
  /** num_predict cap per sample. Default 1024. */
  maxTokens?: number;
  /** Voices per chord. Default 4. */
  voices?: number;
  /** Ollama base URL. Default OLLAMA_HOST env or http://localhost:11434. */
  baseUrl?: string;
  /** Optional style hint appended to the brief (e.g. "jazz"). */
  styleHint?: string;
  /** Test seam: build the backend for a given per-sample seed. */
  backendFactory?: (seed: number) => ChordProposerBackend;
}

/**
 * A RealizationProposer that asks a seeded local model for a VOICING SPEC per
 * measure and renders it deterministically onto the chord's exact pitch classes —
 * so every sounding frame spells its chord by construction (membership drift =
 * 0). Fresh backend per sample (seed = baseSeed + sampleIndex) → best-of-n
 * explores; fail-soft (any per-sample failure → null). Call probe() up front to
 * surface an unreachable Ollama.
 */
export class OllamaSpecRealizer implements RealizationProposer {
  readonly model: string;
  readonly baseSeed: number;
  readonly maxTokens: number;
  readonly voices: number;
  private readonly styleHint?: string;
  private readonly makeBackend: (seed: number) => ChordProposerBackend;

  constructor(model = "qwen2.5:7b", opts: OllamaSpecRealizerOptions = {}) {
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
    const base = buildSpecUser(progression, this.voices);
    const userMessage = this.styleHint
      ? `${base}\n\nTarget style: ${this.styleHint} — prefer its idiomatic voicings.`
      : base;
    try {
      await backend.callStructured({
        systemPrompt: specSystem(this.voices),
        userMessage,
        outputSchema: SPEC_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
      });
    } catch {
      // Tolerant: callStructured throws on non-JSON (rawText still set) or on an
      // unreachable/erroring Ollama (rawText null → null below).
    }
    const raw = backend.lastRawText() ?? "";
    if (!raw) return null;
    return renderSpecRealization(progression, parseSpecResponse(raw), this.voices);
  }
}
