// Build a VocalScore (notes + phonemes + lyrics) from a library song.

import type { SongEntry } from "../songs/types.js";
import { alignLyricsToNotes } from "./align-lyrics.js";
import { applyPhraseVibrato, extractMelodyNotes, type MelodyNoteOptions } from "./melody-notes.js";
import type { LyricG2P, ScoreNote, ScorePhoneme } from "./types.js";

export interface BuildScoreOptions extends MelodyNoteOptions {
  lyrics: string;
  language?: string;
  vibrato?: boolean;
  g2p: LyricG2P;
}

export interface BuiltVocalScore {
  bpm: number;
  notes: ScoreNote[];
  lyrics: { text: string; language: string };
  phonemes: ScorePhoneme[];
  warnings: string[];
  startMeasure: number;
  endMeasure: number;
}

export function buildScoreLockedVocals(
  song: SongEntry,
  options: BuildScoreOptions,
): BuiltVocalScore {
  const melody = extractMelodyNotes(song, options);
  // Engine presets already carry ~35-cent vibrato. Stacking another 50-cent
  // LFO on long notes is what turned the first listen into a siren.
  const notes = options.vibrato === true
    ? applyPhraseVibrato(melody.notes)
    : melody.notes;
  const aligned = alignLyricsToNotes(options.lyrics, notes, options.g2p);
  const phonemes = coverFrontVowels(notes, aligned.events);
  return {
    bpm: melody.effectiveBpm,
    notes,
    lyrics: { text: options.lyrics, language: options.language ?? "en-US" },
    phonemes,
    warnings: [...melody.warnings, ...aligned.warnings],
    startMeasure: melody.startMeasure,
    endMeasure: melody.endMeasure,
  };
}

const FRONT_VOWELS = new Set(["IY", "IH", "IX", "EY", "EH"]);

/** When F0 is near or above a front-vowel F1, retarget the timbre to AH
 *  (singer's covering). Additive Kokoro envelopes cannot raise F1. */
function coverFrontVowels(notes: ScoreNote[], events: ScorePhoneme[]): ScorePhoneme[] {
  return events.map((e) => {
    if (e.kind !== "vowel") return e;
    const note = notes.find(
      (n) => e.tSec >= n.startSec - 1e-4 && e.tSec < n.startSec + n.durationSec + 1e-4,
    );
    if (!note || note.midi < 64) return e;
    if (FRONT_VOWELS.has(e.phoneme) || e.timbreHint === "EE") {
      return { ...e, timbreHint: "AH" };
    }
    return e;
  });
}

/** Duration of the score in seconds (last note end). */
export function scoreDurationSec(score: { notes: ScoreNote[] }): number {
  let end = 0;
  for (const n of score.notes) {
    end = Math.max(end, n.startSec + n.durationSec);
  }
  return end;
}
