// ─── Maker: the auto-reharmonize inference loop (the shipped product) ─────────
//
// The maker arc's Phase C conclusion (docs/maker-arc-phase-c-design.md, director-
// approved 2026-07-22): the reharmonization capability ships as a $0 INFERENCE
// SYSTEM, not a fine-tune. A weak local base + a deterministic voicer + a
// perfect-verifier best-of-n loop cleared the E-R gate at 91% — above the
// frontier single-shot ceiling — with no training. Measured contrast:
//
//   base single-shot            9%
//   search only (no decompose)  9% @16   (voicing-fidelity wall)
//   decompose single-shot       50%
//   decompose × search          91% @16  (the loop below)
//
// The two levers, both grounded and both measured necessary:
//   - DECOMPOSE (Chord Jazzification, ISMIR 2020; PAL/PoT): the model chooses
//     CHORD SYMBOLS; voiceChord() renders the voicing deterministically, so chord
//     fidelity is 100% by construction (removes the base's 37%-fidelity wall).
//   - VERIFIER-LOOP (Stroebl 2024; Brown 2024): a perfect verifier removes the
//     resampling ceiling, so best-of-n coverage climbs log-linearly to the answer.
//
// This module is the pure loop, generic over a ChordProposer (so it is testable
// without a live LLM and swappable across backends / future trained models).
// The concrete Ollama proposer + MCP tool wiring live outside this core.
// ─────────────────────────────────────────────────────────────────────────────

import { renderReharmonization } from "./voicer.js";
import {
  scoreERProposal,
  ER_NON_TRIVIALITY_FRACTION,
  type ERItem,
  type ERScore,
} from "./er-gate.js";
import type { ReharmonizedMeasure } from "./verify-harmony.js";

/** A per-measure chord choice (no voicing — the voicer renders that). */
export interface ChordChoice {
  measure: number;
  intendedChord: string;
}

/**
 * Proposes chord symbols for a section. `sampleIndex` lets a stochastic proposer
 * (e.g. a seeded LLM) return a DIFFERENT proposal per call so best-of-n explores
 * — a deterministic proposer may ignore it. Returns [] when it cannot propose.
 */
export interface ChordProposer {
  proposeChords(item: ERItem, sampleIndex: number): Promise<ChordChoice[]>;
}

export interface AutoReharmonizeOptions {
  /** Max samples to draw before giving up (best-of-n). Default 16 (the measured knee). */
  maxSamples?: number;
  /** Non-triviality fraction the reharmonization must clear. Default 1/3. */
  nonTrivialityThreshold?: number;
  /** Voicing register (root octave). Default 2 (left hand). */
  rootOctave?: number;
}

export interface AutoReharmonizeResult {
  /** True iff a sample passed verifyHarmony (fidelity ∧ consonance) AND non-triviality. */
  verified: boolean;
  /** The verified reharmonization, or the best-scoring attempt when none verified. */
  reharmonization: ReharmonizedMeasure[];
  /** Full score of the returned reharmonization. */
  score: ERScore;
  /** 1-based index of the sample that passed, or null if none did. */
  passedAtSample: number | null;
  /** Samples actually drawn (≤ maxSamples; stops early on first pass). */
  samplesUsed: number;
}

/**
 * Auto-reharmonize a melody section: propose chords → render voicings
 * deterministically → verify → resample on reject, up to maxSamples. Returns the
 * first verified reharmonization (chord fidelity is guaranteed by the voicer;
 * the loop searches over chord CHOICE for consonance + non-triviality).
 *
 * Deterministic given a deterministic proposer. No self-critique: the only judge
 * is the platform's own verifyHarmony (external-verifier discipline).
 */
export async function autoReharmonize(
  item: ERItem,
  proposer: ChordProposer,
  opts: AutoReharmonizeOptions = {},
): Promise<AutoReharmonizeResult> {
  const maxSamples = Math.max(1, opts.maxSamples ?? 16);
  const nonTrivialityThreshold = opts.nonTrivialityThreshold ?? ER_NON_TRIVIALITY_FRACTION;
  const rootOctave = opts.rootOctave ?? 2;

  let best: { rehar: ReharmonizedMeasure[]; score: ERScore } | null = null;
  let samplesUsed = 0;

  for (let k = 0; k < maxSamples; k++) {
    samplesUsed = k + 1;
    const chords = await proposer.proposeChords(item, k);
    const rehar = renderReharmonization(chords, { rootOctave }); // 100% fidelity by construction
    const score = scoreERProposal(item, { measures: rehar, status: rehar.length ? "clean" : "unrecoverable" }, {
      nonTrivialityThreshold,
    });
    if (score.passes) {
      return { verified: true, reharmonization: rehar, score, passedAtSample: k + 1, samplesUsed };
    }
    // Keep the best partial attempt as a fallback (more verified-chords + closer to non-trivial).
    if (best === null || rankAttempt(score) > rankAttempt(best.score)) {
      best = { rehar, score };
    }
  }

  const fallback = best ?? {
    rehar: [] as ReharmonizedMeasure[],
    score: scoreERProposal(item, { measures: [], status: "unrecoverable" }, { nonTrivialityThreshold }),
  };
  return {
    verified: false,
    reharmonization: fallback.rehar,
    score: fallback.score,
    passedAtSample: null,
    samplesUsed,
  };
}

/** Rank partial attempts so the returned fallback is the "closest to passing." */
function rankAttempt(s: ERScore): number {
  // verified consonance first, then chord coverage, then non-triviality progress.
  return (
    (s.verified ? 1000 : 0) +
    (s.consonance.pass ? 100 : 0) +
    s.chordFidelity.matched * 10 +
    s.nonTriviality.fraction
  );
}
