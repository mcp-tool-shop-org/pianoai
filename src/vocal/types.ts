/** Score-locked singing types. Mirrors vocal-synth-engine VocalNote/PhonemeEvent
 *  without importing that package from unit tests. */

export interface ScoreNote {
  id: string;
  startSec: number;
  durationSec: number;
  midi: number;
  velocity?: number;
  vibrato?: { rateHz: number; depthCents: number; onsetSec: number };
}

export interface ScorePhoneme {
  tSec: number;
  durSec: number;
  phoneme: string;
  kind: "vowel" | "consonant";
  timbreHint?: string;
  strength?: number;
}

export interface LyricSyllable {
  onset: string[];
  nucleus: string;
  coda: string[];
}

export interface AlignOptions {
  /** Max duration of a single onset consonant (sec). Default 0.08. */
  maxOnsetSec?: number;
  /** Max duration of a single coda consonant (sec). Default 0.08. */
  maxCodaSec?: number;
  /** Minimum vowel share of the note when onsets are forced inside it. Default 0.55. */
  minVowelFraction?: number;
  /** Split English diphthongs when the vowel window is at least this long. Default 0.35. */
  diphthongSplitSec?: number;
  /** ARPAbet → additive-synth timbre (AH/EE/OO). */
  timbreFor?: (vowel: string) => string | undefined;
}

export interface NoteSyllableMap {
  noteIndex: number;
  syllableIndex: number | null;
  vowelStartSec: number;
  melisma: boolean;
}

export interface AlignResult {
  events: ScorePhoneme[];
  warnings: string[];
  mapping: NoteSyllableMap[];
}

export interface LyricG2P {
  /** Word → ordered syllables. Unknown words should still return ≥1 syllable. */
  wordToSyllables(word: string): LyricSyllable[];
}
