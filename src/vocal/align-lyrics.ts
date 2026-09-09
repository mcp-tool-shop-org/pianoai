// Score-locked lyric alignment.
//
// Vowels sit on the MIDI beat; onset consonants occupy the preceding
// inter-onset gap; leftover note length goes to the nucleus; diphthongs
// split on long notes; leftover notes after the lyric run are melisma
// (repeat the last nucleus). See vocology-knowledge wave-1 (Sundberg 2007,
// Sinsy/NNSVS, Zhang & Wang 2020).

import type {
  AlignOptions,
  AlignResult,
  LyricG2P,
  LyricSyllable,
  NoteSyllableMap,
  ScoreNote,
  ScorePhoneme,
} from "./types.js";

export type { LyricG2P };

const DEFAULT_MAX_ONSET = 0.08;
const DEFAULT_MAX_CODA = 0.08;
const DEFAULT_MIN_VOWEL = 0.55;
const DEFAULT_DIPHTHONG_SPLIT = 0.75;

const PLOSIVES = new Set(["P", "T", "K", "B", "D", "G", "Q"]);
const AFFRICATES = new Set(["CH", "JH"]);
const FRICATIVES = new Set(["F", "V", "S", "Z", "SH", "ZH", "TH", "DH", "HH"]);

/** Sinsy-style English diphthong split: on-glide, then off-glide. */
export const DIPHTHONG_SPLIT: Record<string, [string, string]> = {
  AY: ["AA", "AY"],
  AW: ["AA", "AW"],
  EY: ["EH", "EY"],
  OW: ["AO", "OW"],
  OY: ["AO", "OY"],
};

const DEFAULT_TIMBRE: Record<string, string> = {
  AA: "AH", AE: "AH", AH: "AH", AO: "AH", AX: "AH", ER: "AH", AY: "AH",
  EH: "EE", EY: "EE", IH: "EE", IX: "EE", IY: "EE",
  OW: "OO", OY: "OO", UH: "OO", UW: "OO", UX: "OO", AW: "OO",
};

function consonantStrength(symbol: string): number {
  if (PLOSIVES.has(symbol)) return 0.9;
  if (AFFRICATES.has(symbol)) return 0.7;
  if (FRICATIVES.has(symbol)) return 0.5;
  return 0.2;
}

function defaultTimbre(vowel: string): string | undefined {
  return DEFAULT_TIMBRE[vowel];
}

/**
 * Align already-syllabified lyrics to melody notes.
 *
 * Extra notes after the last syllable become melisma (same nucleus, no
 * new onset). Extra syllables after the last note are dropped with a warning.
 */
export function alignSyllablesToNotes(
  syllables: LyricSyllable[],
  notes: ScoreNote[],
  options: AlignOptions = {},
): AlignResult {
  const maxOnset = options.maxOnsetSec ?? DEFAULT_MAX_ONSET;
  const maxCoda = options.maxCodaSec ?? DEFAULT_MAX_CODA;
  const minVowelFrac = options.minVowelFraction ?? DEFAULT_MIN_VOWEL;
  const diphthongSplitSec = options.diphthongSplitSec ?? DEFAULT_DIPHTHONG_SPLIT;
  const timbreFor = options.timbreFor ?? defaultTimbre;

  const warnings: string[] = [];
  const events: ScorePhoneme[] = [];
  const mapping: NoteSyllableMap[] = [];

  if (notes.length === 0) {
    if (syllables.length > 0) {
      warnings.push(`No melody notes; dropped ${syllables.length} syllable(s)`);
    }
    return { events, warnings, mapping };
  }

  if (syllables.length > notes.length) {
    warnings.push(
      `More syllables (${syllables.length}) than notes (${notes.length}); ${syllables.length - notes.length} syllable(s) dropped`,
    );
  }

  let prevOccupiedEnd = 0;

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const syl = i < syllables.length ? syllables[i] : syllables[syllables.length - 1];
    const melisma = i >= syllables.length;
    if (melisma && syllables.length === 0) {
      warnings.push(`Note ${i} (${note.id}) has no lyric nucleus — skipped`);
      continue;
    }
    if (melisma) {
      warnings.push(`Note ${i} (${note.id}) is melisma on "${syl.nucleus}"`);
    }

    const onsetSyms = melisma ? [] : syl.onset;
    const codaSyms = melisma ? [] : syl.coda;
    const onsetDurEach = onsetSyms.length > 0 ? maxOnset : 0;
    const codaDurEach = codaSyms.length > 0 ? maxCoda : 0;
    let totalOnset = onsetDurEach * onsetSyms.length;
    let totalCoda = codaDurEach * codaSyms.length;

    const minVowel = note.durationSec * minVowelFrac;
    if (totalCoda > note.durationSec - minVowel) {
      totalCoda = Math.max(0, note.durationSec - minVowel);
    }

    const vowelStart = note.startSec;
    let onsetStart = vowelStart - totalOnset;
    if (onsetStart < prevOccupiedEnd) onsetStart = prevOccupiedEnd;
    if (onsetStart < 0) onsetStart = 0;

    let onsetWindow = vowelStart - onsetStart;
    if (onsetWindow < totalOnset - 1e-9) {
      if (onsetWindow < 0.005) {
        if (onsetSyms.length > 0) {
          warnings.push(
            `Note ${i} (${note.id}): onset consonants truncated (no pre-roll before the beat)`,
          );
        }
        totalOnset = 0;
        onsetWindow = 0;
      } else {
        totalOnset = onsetWindow;
      }
    }

    const vowelDur = Math.max(minVowel, note.durationSec - totalCoda);
    const codaDur = Math.max(0, Math.min(totalCoda, note.durationSec - vowelDur));

    const onsetEach = onsetSyms.length > 0 && totalOnset > 0
      ? totalOnset / onsetSyms.length
      : 0;
    const codaEach = codaSyms.length > 0 && codaDur > 0
      ? codaDur / codaSyms.length
      : 0;

    let t = onsetStart;
    if (totalOnset > 0) {
      for (const p of onsetSyms) {
        events.push({
          tSec: t,
          durSec: onsetEach,
          phoneme: p,
          kind: "consonant",
          strength: consonantStrength(p),
        });
        t += onsetEach;
      }
    }

    const split = DIPHTHONG_SPLIT[syl.nucleus];
    if (split && vowelDur >= diphthongSplitSec) {
      const firstDur = vowelDur * 0.4;
      const secondDur = vowelDur - firstDur;
      events.push({
        tSec: vowelStart,
        durSec: firstDur,
        phoneme: split[0],
        kind: "vowel",
        timbreHint: timbreFor(split[0]),
      });
      events.push({
        tSec: vowelStart + firstDur,
        durSec: secondDur,
        phoneme: split[1],
        kind: "vowel",
        timbreHint: timbreFor(split[1]),
      });
    } else {
      events.push({
        tSec: vowelStart,
        durSec: vowelDur,
        phoneme: syl.nucleus,
        kind: "vowel",
        timbreHint: timbreFor(syl.nucleus),
      });
    }

    t = vowelStart + vowelDur;
    if (codaEach > 0) {
      for (const p of codaSyms) {
        events.push({
          tSec: t,
          durSec: codaEach,
          phoneme: p,
          kind: "consonant",
          strength: consonantStrength(p),
        });
        t += codaEach;
      }
    }

    mapping.push({
      noteIndex: i,
      syllableIndex: melisma ? syllables.length - 1 : i,
      vowelStartSec: vowelStart,
      melisma,
    });

    prevOccupiedEnd = Math.max(t, note.startSec + note.durationSec);
  }

  return { events, warnings, mapping };
}

/**
 * Tokenize lyric text into syllable-sized units.
 *
 * Hyphens split a word into explicit syllables (`A-ma-zing` → 3 units).
 * Otherwise each whitespace-separated word is one unit for the G2P layer
 * to syllabify.
 */
export function tokenizeLyricUnits(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .flatMap((word) => {
      const cleaned = word.replace(/[^\p{L}\p{N}'-]+/gu, "");
      if (!cleaned) return [];
      if (cleaned.includes("-")) {
        return cleaned.split("-").filter((p) => p.length > 0);
      }
      return [cleaned];
    });
}

/**
 * Expand lyric text through a G2P into a flat syllable list, then align.
 */
export function alignLyricsToNotes(
  lyricsText: string,
  notes: ScoreNote[],
  g2p: LyricG2P,
  options: AlignOptions = {},
): AlignResult {
  const units = tokenizeLyricUnits(lyricsText);
  const warnings: string[] = [];
  const syllables: LyricSyllable[] = [];
  if (lyricsText.trim().length > 0 && units.length === 0) {
    warnings.push("lyrics produced 0 tokens after tokenization");
  }
  for (const unit of units) {
    const syls = g2p.wordToSyllables(unit);
    if (syls.length === 0) {
      warnings.push(`"${unit}" produced 0 syllables`);
      continue;
    }
    syllables.push(...syls);
  }
  const aligned = alignSyllablesToNotes(syllables, notes, options);
  return {
    events: aligned.events,
    warnings: [...warnings, ...aligned.warnings],
    mapping: aligned.mapping,
  };
}
