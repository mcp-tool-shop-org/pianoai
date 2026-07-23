// ─── Compose: the part-at-a-time refinement loop (hold-fixed-and-regenerate) ──
//
// Phase 2, Session 2, Slice B2. Session 1's loop proposed a whole N-voice block in
// ONE pass. The symbolic-music evidence is one-directional that ITERATIVE,
// part-at-a-time resampling beats single-pass on the SAME model (findings 14–17):
// Coconet's blocked-Gibbs (Huang et al. 2019, arXiv:1903.07227) and DeepBach's
// pseudo-Gibbs (Hadjeres et al. 2017, arXiv:1612.01010) both hold every other
// voice FIXED and regenerate one, and both were judged more Bach-like than
// ancestral sampling; the Bach Doodle ran dozens of such steps interactively
// (finding 17 — it is real-time-cheap, not a research luxury).
//
// This is that pattern as a DETERMINISTIC coordinate-ascent (a $0 blocked-Gibbs
// with an exhaustive proposal): hold every other voice fixed and, for one voice at
// one frame, try each chord-tone option in a register window; keep the change only
// if it improves the objective. Because a voice can only ever be a CHORD TONE, the
// membership floor (B1a) is preserved by construction through every step — the
// refiner can only ever re-voice, never re-harmonize.
//
// The objective is lexicographic and subsumes the kickoff's rule ("keep a change
// only if the gate admits AND the scorer improves"):
//     (−gatingViolations, score)
// Below admission it drives gating-violations DOWN toward 0 (fixing parallels /
// overlap / leaps a single re-voicing can repair); at admission (0 violations) it
// then maximizes the preference score among admitted voicings — exactly the
// kickoff's rule once admitted. It never lowers the objective, so it terminates
// (violations are bounded below by 0, score above by 1) and is also passes-bounded.
//
// PURE + deterministic (no LLM, no HTTP): given a seed it always returns the same
// refinement. It polishes ANY seed — a deterministic realizer's output OR a B1a
// model spec — and slots into best-of-n via RefiningProposer.
// ─────────────────────────────────────────────────────────────────────────────

import { parseChordSymbol } from "../maker/verify-harmony.js";
import { verifyVoiceLeading, type VoiceLeadingVerdict } from "./voice-leading.js";
import { resolveStyle, type StyleName, type StyleProfile } from "./style.js";
import { scoreRealization, DEFAULT_SCORE_WEIGHTS, type RealizationScore, type ScoreWeights } from "./scorer.js";
import type { ChordProgression, RealizationProposer } from "./realize.js";
import type { Realization, RealizedFrame } from "./types.js";

export interface RefineOptions {
  /** Voices per frame (the structure gate requires exactly this). Default: the seed's modal count. */
  voices?: number;
  /** Style whose relaxed set the refiner optimizes toward (default common-practice). */
  style?: StyleName | StyleProfile;
  /** Max full passes over (voice × frame). Default 8 (converges well before this). */
  maxPasses?: number;
  /** ± semitone window around a voice's current pitch to search for chord-tone options. Default 12. */
  registerWindow?: number;
  /** Scorer weights (the tie-break objective once admitted). Default DEFAULT_SCORE_WEIGHTS. */
  weights?: ScoreWeights;
}

export interface RefineResult {
  /** The refined realization (each frame sorted ascending). */
  realization: Realization;
  verdict: VoiceLeadingVerdict;
  score: RealizationScore;
  /** Passes actually run (≤ maxPasses; stops early on a no-change pass). */
  passes: number;
  /** Accepted single-voice changes across all passes. */
  accepted: number;
  /** Whether the SEED already admitted (before refinement). */
  seedAdmitted: boolean;
  /** Whether the refined result admits. */
  admitted: boolean;
}

const EPS = 1e-9;

/** Count the violations that ACTUALLY gate (applicable, not relaxed, failed). 0 ⟺ admitted. */
export function gatingViolationCount(verdict: VoiceLeadingVerdict): number {
  const relaxed = new Set(verdict.relaxedRules);
  let c = 0;
  for (const rule of Object.keys(verdict.hardGates) as Array<keyof typeof verdict.hardGates>) {
    const res = verdict.hardGates[rule];
    if (res.applicable && !relaxed.has(rule) && !res.pass) c += res.violations.length;
  }
  return c;
}

/** Sort each frame's voices ascending (rank identity: bass=0 … soprano=n-1). */
function sortedFrames(real: Realization): Realization {
  return { key: real.key, frames: real.frames.map((f) => ({ ...f, voices: [...f.voices].sort((a, b) => a - b) })) };
}

/** A copy of `real` with frame `fi`'s voice slot `v` replaced by `pitch`, re-sorted. */
function withVoiceChanged(real: Realization, fi: number, v: number, pitch: number): Realization {
  const frames = real.frames.map((f, i) => {
    if (i !== fi) return f;
    const voices = [...f.voices];
    voices[v] = pitch;
    voices.sort((a, b) => a - b);
    return { ...f, voices };
  });
  return { key: real.key, frames };
}

/** Chord-tone pitches within ±window of `curPitch` (the membership-safe options). */
function candidatePitches(pcs: number[], curPitch: number, window: number): number[] {
  const set = new Set(pcs.map((pc) => ((pc % 12) + 12) % 12));
  const lo = Math.max(0, curPitch - window);
  const hi = Math.min(127, curPitch + window);
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (set.has(m % 12)) out.push(m);
  return out;
}

/**
 * Refine a seed realization part-at-a-time: hold every other voice fixed and, for
 * one voice at one frame, adopt the chord-tone option that most improves the
 * lexicographic objective (−gatingViolations, then score). Repeat until a pass
 * makes no change or maxPasses is hit. Membership is preserved by construction
 * (candidates are always chord tones). Deterministic.
 */
export function refineRealization(seed: Realization, opts: RefineOptions = {}): RefineResult {
  const profile = resolveStyle(opts.style);
  const weights = opts.weights ?? DEFAULT_SCORE_WEIGHTS;
  const window = opts.registerWindow ?? 12;
  const maxPasses = Math.max(0, opts.maxPasses ?? 8);

  // Voice count: explicit, else the seed's most common sounding-frame count.
  const counts = seed.frames.filter((f) => f.voices.length > 0).map((f) => f.voices.length);
  const voices = opts.voices ?? (counts.length ? counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)] : 4);

  const verify = (r: Realization): VoiceLeadingVerdict =>
    verifyVoiceLeading(r, { requireVoiceCount: voices, style: profile });
  const objective = (r: Realization): [number, number] => {
    const v = verify(r);
    return [-gatingViolationCount(v), scoreRealization(r, weights).score];
  };
  const better = (a: [number, number], b: [number, number]): boolean =>
    a[0] > b[0] || (a[0] === b[0] && a[1] > b[1] + EPS);

  let cur = sortedFrames(seed);
  const seedVerdict = verify(cur);
  let curObj = objective(cur);
  let accepted = 0;
  let passes = 0;

  for (; passes < maxPasses; passes++) {
    let changed = false;
    for (let fi = 0; fi < cur.frames.length; fi++) {
      const frame: RealizedFrame = cur.frames[fi];
      if (frame.voices.length === 0) continue; // rest
      const chord = parseChordSymbol(frame.chordSymbol);
      if (!chord) continue; // out-of-vocab → cannot re-voice safely
      for (let v = 0; v < frame.voices.length; v++) {
        const curPitch = cur.frames[fi].voices[v];
        let bestObj = curObj;
        let bestPitch = curPitch;
        for (const cand of candidatePitches(chord.pcs, curPitch, window)) {
          if (cand === curPitch) continue;
          const obj = objective(withVoiceChanged(cur, fi, v, cand));
          if (better(obj, bestObj)) {
            bestObj = obj;
            bestPitch = cand;
          }
        }
        if (bestPitch !== curPitch) {
          cur = withVoiceChanged(cur, fi, v, bestPitch);
          curObj = bestObj;
          accepted++;
          changed = true;
        }
      }
    }
    if (!changed) {
      passes++; // count the converging (no-change) pass we just completed
      break;
    }
  }

  const verdict = verify(cur);
  return {
    realization: cur,
    verdict,
    score: scoreRealization(cur, weights),
    passes,
    accepted,
    seedAdmitted: seedVerdict.admitted,
    admitted: verdict.admitted,
  };
}

/**
 * Wrap a base proposer so every proposed realization is refined part-at-a-time
 * before it reaches the best-of-n loop. Same RealizationProposer contract, so it
 * drops straight into realizeProgression. Pass the SAME style you gate with, so
 * the refiner optimizes toward the same admission target.
 */
export class RefiningProposer implements RealizationProposer {
  constructor(
    private readonly base: RealizationProposer,
    private readonly opts: RefineOptions = {},
  ) {}
  async proposeRealization(progression: ChordProgression, sampleIndex: number): Promise<Realization | null> {
    const seed = await this.base.proposeRealization(progression, sampleIndex);
    if (!seed) return null;
    return refineRealization(seed, this.opts).realization;
  }
}
