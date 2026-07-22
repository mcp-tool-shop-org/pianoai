// ─── Maker: an ABC-format chord proposer (the ABC pilot) ──────────────────────
//
// A drop-in ChordProposer that asks the model to reharmonize as an ABC lead
// sheet — the melody with one chord symbol in "quotes" per bar — instead of a
// JSON chord array. Everything downstream is unchanged: the quoted chord symbols
// feed the SAME voiceChord → verify_harmony → best-of-n loop.
//
// Why: Phase-C's chord-vocab measurement (docs/maker-arc-phase-c-vocab-
// expansion.md) found the DOMINANT E-R miss is empty / unparseable output
// (12/22 items), not chord rejection. ABC is LLM-native and well-formed far more
// often than bespoke JSON (Yuan et al. 2024 ChatMusician, arXiv:2402.16153: ABC
// well-formedness 99.6% vs GPT-3.5's 65.4%; Qu et al. 2024 MuPT, arXiv:2404.06393:
// ABC ~38% the tokens). This pilot tests whether emitting in ABC reduces the
// empty-output rate — the actual ceiling lever the vocab expansion could not move.
//
// The parser is deliberately NARROW: it extracts the quoted chord annotations,
// not the ABC pitches (a full ABC→notes parser is a separate build). The melody
// is already known from the item; only the model's chord CHOICES are recovered.
// ─────────────────────────────────────────────────────────────────────────────

import { OllamaBackend } from "../dataset/eval/llm-backends/ollama.js";
import { buildERBrief, type ERItem } from "./er-gate.js";
import type { ChordChoice, ChordProposer } from "./reharmonize.js";

// ─── The ABC lead-sheet brief ─────────────────────────────────────────────────

export const ABC_REHARM_SYSTEM = [
  "You are a jazz reharmonization arranger who writes in ABC notation. You are given a melody",
  "(one row per measure). Write a REHARMONIZED ABC lead sheet: the tune with ONE chord symbol in",
  'double quotes at the start of each bar, e.g. "Am7".',
  "",
  "Rules:",
  '- Chord qualities: major (root alone, e.g. "C"), m, 7, maj7, m7, dim, m7b5, aug, sus4, sus2, add9, madd9. Half-diminished may be written "ø7".',
  "- Put exactly ONE chord in quotes per bar, and separate bars with a | bar line, in measure order.",
  "- REHARMONIZE — change the harmony on a meaningful share of bars vs the original (substitutions, secondary dominants, modal interchange).",
  "- The melody must sit consonantly on your chords (chord tones and standard tensions 9/11/13/#11); keep chromatic clashes rare.",
  "",
  "Output ONLY the ABC tune (the X:/T:/M:/L:/K: headers, then one line of music with chord annotations). No prose.",
  "",
  "Example:",
  "X:1",
  "T:Reharmonization",
  "M:4/4",
  "L:1/4",
  "K:Amin",
  '"Fmaj7"A2 c2 | "Dm7"d2 f2 | "E7"e2 ^g2 | "Am7"a4 |',
].join("\n");

/** Build the ABC-reharm user message — the same melody table as the JSON path,
 *  with an ABC lead-sheet ask (so the two paths differ ONLY in output format). */
export function buildAbcReharmUser(item: ERItem): string {
  const brief = buildERBrief(item);
  return brief.user.replace(
    /Propose your reharmonization.*$/s,
    "Write an ABC lead sheet that reharmonizes this melody — one chord symbol in quotes per bar, in measure order. Output ABC only.",
  );
}

/**
 * Extract the chord symbols from an ABC reharmonization, in order, mapped to the
 * given measure numbers by position (the i-th quoted chord → the i-th measure).
 * Tolerant: strips ```abc fences, prefers the tune body after the K: header, and
 * skips ABC text annotations (which start with ^ _ < > @). Returns [] when no
 * chord annotation is found. Position-mapping assumes one chord per bar in order
 * (what the prompt asks for); a bar with two chords would shift the alignment.
 */
export function parseAbcChords(abc: string, measureNumbers: number[]): ChordChoice[] {
  if (!abc?.trim()) return [];
  const fence = /```(?:abc)?\s*([\s\S]*?)```/i.exec(abc);
  let text = fence ? fence[1] : abc;
  // Prefer the tune body after the K: (key) header; fall back to the whole text.
  const k = /(^|\n)\s*K:[^\n]*\n?/.exec(text);
  if (k) text = text.slice(k.index + k[0].length);
  // Drop title / words / lyric lines that could carry stray quotes.
  text = text.split(/\r?\n/).filter((l) => !/^\s*[TtWw]:/.test(l)).join("\n");
  // Quoted chord annotations, in order.
  const chords: string[] = [];
  for (const m of text.matchAll(/"([^"]*)"/g)) {
    const sym = m[1].trim();
    if (!sym || /^[\^_<>@]/.test(sym)) continue; // ABC positioned-text annotation, not a chord
    chords.push(sym);
  }
  const out: ChordChoice[] = [];
  for (let i = 0; i < chords.length && i < measureNumbers.length; i++) {
    out.push({ measure: measureNumbers[i], intendedChord: chords[i] });
  }
  return out;
}

// ─── The ABC-backed proposer ──────────────────────────────────────────────────

/** The minimal backend surface the ABC proposer needs (OllamaBackend satisfies it). */
export interface AbcProposerBackend {
  generateText(args: { systemPrompt: string; userMessage: string }): Promise<string>;
  lastRawText(): string | null;
  probe(): Promise<void>;
}

export interface AbcChordProposerOptions {
  /** Base seed; sample k draws with seed baseSeed + k. Default 42. */
  baseSeed?: number;
  /** num_predict cap per sample. Default 1024. */
  maxTokens?: number;
  /** Ollama base URL. Default OLLAMA_HOST env or http://localhost:11434. */
  baseUrl?: string;
  /** Optional style hint appended to the brief (e.g. "jazz"). */
  styleHint?: string;
  /** Test seam: build the backend for a given per-sample seed. */
  backendFactory?: (seed: number) => AbcProposerBackend;
}

/**
 * A ChordProposer that reharmonizes via an ABC lead sheet (plain seeded text, no
 * JSON constraint). Drop-in for autoReharmonize — the recovered chord symbols go
 * through the exact same voiceChord + verify_harmony loop as the JSON path. Same
 * fail-soft contract: any per-sample failure yields [] rather than throwing.
 */
export class AbcChordProposer implements ChordProposer {
  readonly model: string;
  readonly baseSeed: number;
  readonly maxTokens: number;
  private readonly styleHint?: string;
  private readonly makeBackend: (seed: number) => AbcProposerBackend;

  constructor(model = "qwen2.5:7b", opts: AbcChordProposerOptions = {}) {
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
    const user = this.styleHint
      ? `${buildAbcReharmUser(item)}\n\nTarget style: ${this.styleHint} — prefer its idiomatic reharmonizations.`
      : buildAbcReharmUser(item);
    let text = "";
    try {
      text = await backend.generateText({ systemPrompt: ABC_REHARM_SYSTEM, userMessage: user });
    } catch {
      text = backend.lastRawText() ?? "";
    }
    return parseAbcChords(text, item.melody.map((m) => m.number));
  }
}
