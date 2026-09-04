// Lazy G2P adapter over vocal-synth-engine's CMU-dict pipeline.

import type { LyricG2P, LyricSyllable } from "./types.js";

interface EngineSyllable {
  onset: Array<{ symbol: string }>;
  nucleus: { symbol: string };
  coda: Array<{ symbol: string }>;
}

interface EnginePhoneme {
  symbol: string;
  kind: "vowel" | "consonant";
}

function toLyricSyllable(s: EngineSyllable): LyricSyllable {
  return {
    onset: s.onset.map((p) => p.symbol),
    nucleus: s.nucleus.symbol,
    coda: s.coda.map((p) => p.symbol),
  };
}

/**
 * Load the engine G2P. Throws if vocal-synth-engine cannot be imported.
 */
export async function loadEngineG2P(): Promise<LyricG2P> {
  const mod = await import("vocal-synth-engine/src/phonemize/index.js") as unknown as {
    textToPhonemes: (text: string) => Array<{ word: string; phonemes: EnginePhoneme[] }>;
    syllabify: (phonemes: EnginePhoneme[]) => EngineSyllable[];
  };
  return {
    wordToSyllables(word: string): LyricSyllable[] {
      const words = mod.textToPhonemes(word);
      const out: LyricSyllable[] = [];
      for (const w of words) {
        const syls = mod.syllabify(w.phonemes);
        if (syls.length === 0) {
          out.push({ onset: [], nucleus: "AH", coda: [] });
          continue;
        }
        for (const s of syls) out.push(toLyricSyllable(s));
      }
      return out.length > 0 ? out : [{ onset: [], nucleus: "AH", coda: [] }];
    },
  };
}
