// ─── Acoustic experiment, as an ExperimentTask ───────────────────────────────
//
// The published jam-actions-acoustic-v0 corpus. cases() is the 3×9×4 grid
// that produced the checksummed records — not a seed. splitKey is the phrase
// (song_id), because the same phrase perturbed at a different note leaks.

import { defineTask } from "../experiment/index.js";
import { smallestSeedForIndex, type PhraseSpec } from "./builder.js";
import {
  ACOUSTIC_SCHEMA_VERSION,
  DEFAULT_ACOUSTIC_THRESHOLDS,
  GOLD_VERDICTS,
  PERTURBATION_KINDS,
  type PerturbationKind,
} from "./schema.js";
import { PHRASE_SPECS, assertNoClairDeLune } from "./phrases.js";

export interface AcousticCase {
  phrase: PhraseSpec;
  kind: PerturbationKind;
  seed: number;
}

const NOTE_COUNT = 4;

export function acousticIndexSeeds(n: number = NOTE_COUNT): number[] {
  return Array.from({ length: n }, (_, i) => smallestSeedForIndex(i, n));
}

export function acousticCases(seeds: number[] = acousticIndexSeeds()): AcousticCase[] {
  const cases: AcousticCase[] = [];
  for (const phrase of PHRASE_SPECS) {
    assertNoClairDeLune(phrase.song_id);
    for (const kind of PERTURBATION_KINDS) {
      for (const seed of seeds) {
        cases.push({ phrase, kind, seed });
      }
    }
  }
  return cases;
}

export const acousticTask = defineTask<AcousticCase>({
  id: "acoustic-sft",
  schemaVersion: ACOUSTIC_SCHEMA_VERSION,
  verdicts: GOLD_VERDICTS,
  thresholds: DEFAULT_ACOUSTIC_THRESHOLDS,
  cases: () => acousticCases(),
  splitKey: (c) => c.phrase.song_id,
});
