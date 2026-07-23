// ─── Compose: the propose→verify→best-of-n realization loop ───────────────────
//
// The reharmonization envelope SCALED (docs/music-wing-professional-arc.md,
// Lane 1): a proposer emits an N-voice realization of a FIXED chord progression →
// the deterministic voice-leading gate ADMITS or rejects → best-of-n keeps the
// highest-scoring ADMITTED candidate. This is the Coconet generate→verify→
// resample loop (Huang et al. 2019, arXiv:1903.07227), one modality over.
//
// The loop is generic over a RealizationProposer, so it is testable without a
// live LLM and swappable across backends. Two DETERMINISTIC realizers ship here
// as the honest $0 comparators the measurement needs:
//   • rootPositionRealization — the fidelity FLOOR the kickoff names: every chord
//     in canonical close root position. Spells the chords by construction, but
//     block chords moving in parallel typically FAIL the voice-leading gate — so
//     it is the floor the model must beat, not a part-writer.
//   • nearestToneRealization — a stronger deterministic baseline: the classic
//     nearest-chord-tone voice-leader (each voice moves to the closest tone of
//     the next chord). Smoother, admits more often — the honest "does the model
//     beat a deterministic part-writer?" comparator. Neither is guaranteed to
//     pass; that is the point (a doubled tone moving in parallel still trips the
//     gate), and the measurement reports it.
// ─────────────────────────────────────────────────────────────────────────────

import { parseChordSymbol } from "../maker/verify-harmony.js";
import { verifyVoiceLeading, type VoiceLeadingVerdict, type VLRule } from "./voice-leading.js";
import { scoreRealization, type RealizationScore, type ScoreWeights } from "./scorer.js";
import type { StyleReference } from "./style-cost.js";
import type { StyleName, StyleProfile } from "./style.js";
import type { Realization, RealizedFrame } from "./types.js";

// ─── Inputs ───────────────────────────────────────────────────────────────────

/** A fixed chord progression to realize (from the analyzer, a maker rehar, etc.). */
export interface ChordProgression {
  /** Declared key, e.g. "C major" / "A minor". */
  key: string;
  /** The chords in time order. "N/C" measures become rest frames. */
  chords: Array<{ measure: number; chordSymbol: string }>;
}

/**
 * Proposes an N-voice realization of a progression. `sampleIndex` lets a
 * stochastic proposer (a seeded LLM) return a DIFFERENT realization per call so
 * best-of-n explores; a deterministic proposer ignores it. Returns null when it
 * cannot propose (so one bad sample never aborts the loop).
 */
export interface RealizationProposer {
  proposeRealization(progression: ChordProgression, sampleIndex: number): Promise<Realization | null>;
}

export interface RealizeOptions {
  /** Max samples to draw (best-of-n). Default 16 (the maker-arc measured knee). */
  maxSamples?: number;
  /** Voices per frame; the structure gate requires exactly this many. Default 4. */
  voices?: number;
  /**
   * Stop at the first ADMITTED candidate instead of drawing all maxSamples to
   * keep the highest-scoring one. Default false (kickoff: keep the best admitted).
   */
  stopOnFirstAdmit?: boolean;
  /**
   * A named style (or StyleProfile) whose style-gated rules are demoted for
   * admission (default common-practice = relax nothing). Forwarded to
   * verifyVoiceLeading — e.g. "lead-sheet" relaxes {parallels, tendencySeventh}.
   */
  style?: StyleName | StyleProfile;
  /**
   * Extra rules to demote from hard gates to warnings for admission, unioned with
   * the style's set (default none). Prefer `style`; this stays for direct control.
   */
  relaxRules?: VLRule[];
  /** Scorer weights for ranking admitted candidates (default DEFAULT_SCORE_WEIGHTS). */
  scoreWeights?: ScoreWeights;
  /** Opt-in A2 style-typicality reference band, forwarded to the scorer (default off). */
  styleReference?: StyleReference;
}

export interface RealizeResult {
  /** True iff at least one sample was admitted by the voice-leading gate. */
  admitted: boolean;
  /** The best-scoring ADMITTED realization, or the best-scoring attempt if none. */
  realization: Realization;
  verdict: VoiceLeadingVerdict;
  score: RealizationScore;
  /** 1-based sample indices that were admitted. */
  admittedAtSamples: number[];
  /** Samples actually drawn (≤ maxSamples). */
  samplesUsed: number;
  /** How many drawn samples were admitted (the best-of-n coverage numerator). */
  admittedCount: number;
}

// ─── Deterministic voicing primitives ─────────────────────────────────────────

const clampMidi = (m: number): number => Math.max(0, Math.min(127, m));

/** The nearest pitch to `p` whose pitch class is in `pcs` (deterministic tie-break). */
function nearestPitchWithPc(p: number, pcs: number[]): number {
  let best = p;
  let bestDist = Infinity;
  for (const pc of [...pcs].sort((a, b) => a - b)) {
    let delta = (((pc - p) % 12) + 12) % 12; // 0..11 upward
    if (delta > 6) delta -= 12; // choose the nearer direction
    const cand = p + delta;
    const dist = Math.abs(delta);
    if (dist < bestDist) {
      bestDist = dist;
      best = cand;
    }
  }
  return clampMidi(best);
}

/**
 * A canonical close root-position voicing of `n` voices for a chord's pitch
 * classes (root first), the bass near `bassTarget`. Voices ascend strictly;
 * when n exceeds the number of distinct tones, the extra voices double from the
 * root up (a standard SATB doubling).
 */
function seedVoicing(pcs: number[], n: number, bassTarget: number): number[] {
  const voices: number[] = [];
  let prev = -Infinity;
  for (let i = 0; i < n; i++) {
    const pc = pcs[i % pcs.length];
    if (i === 0) {
      voices.push(nearestPitchWithPc(bassTarget, [pc]));
    } else {
      // lowest pitch strictly above prev with this pc
      let pitch = prev + 1;
      pitch += (((pc - pitch) % 12) + 12) % 12;
      voices.push(clampMidi(pitch));
    }
    prev = voices[voices.length - 1];
  }
  return voices;
}

/**
 * Candidate N-voice voicings of a chord: each inversion (rotation putting a
 * different chord tone in the bass) × a few bass registers. Every candidate is a
 * clean strictly-ascending seedVoicing, so the leader never collides.
 */
function candidateVoicings(pcs: number[], n: number): number[][] {
  const cands: number[][] = [];
  for (let rot = 0; rot < pcs.length; rot++) {
    const rotated = [...pcs.slice(rot), ...pcs.slice(0, rot)];
    for (const bassTarget of [36, 43, 48, 55]) cands.push(seedVoicing(rotated, n, bassTarget));
  }
  return cands;
}

/** Lead to `newPcs` by picking the candidate voicing of minimal total motion from `prev`. */
function leadVoices(prev: number[], newPcs: number[], n: number): number[] {
  let best = prev;
  let bestMotion = Infinity;
  for (const cand of candidateVoicings(newPcs, n)) {
    let motion = 0;
    for (let i = 0; i < Math.min(n, cand.length, prev.length); i++) motion += Math.abs(cand[i] - prev[i]);
    if (motion < bestMotion) {
      bestMotion = motion;
      best = cand;
    }
  }
  return best;
}

// ─── Deterministic realizers ──────────────────────────────────────────────────

const DEFAULT_BASS_TARGET = 48; // C3

/** Rest/silent frame for an N/C or unparseable measure. */
function restFrame(measure: number, chordSymbol: string): RealizedFrame {
  return { measure, chordSymbol, voices: [] };
}

/**
 * The fidelity FLOOR: each chord in canonical close root position, independently
 * (same register), so a progression moving by step tends to make parallels — the
 * floor the model must beat on the voice-leading gate.
 */
export function rootPositionRealization(progression: ChordProgression, voices = 4): Realization {
  const frames = progression.chords.map(({ measure, chordSymbol }) => {
    const p = parseChordSymbol(chordSymbol);
    if (!p) return restFrame(measure, chordSymbol);
    return { measure, chordSymbol, voices: seedVoicing(p.pcs, voices, DEFAULT_BASS_TARGET) };
  });
  return { key: progression.key, frames };
}

/**
 * The nearest-chord-tone voice-leader: seed the first sounding chord in close
 * root position, then lead each subsequent chord by minimal motion. Smoother
 * than the floor; still not guaranteed to clear the gate (parallel doublings can
 * survive), which the measurement reports honestly.
 */
export function nearestToneRealization(progression: ChordProgression, voices = 4): Realization {
  const frames: RealizedFrame[] = [];
  let prev: number[] | null = null;
  for (const { measure, chordSymbol } of progression.chords) {
    const p = parseChordSymbol(chordSymbol);
    if (!p) {
      frames.push(restFrame(measure, chordSymbol));
      continue; // a rest does not carry voice-leading forward
    }
    const v: number[] =
      prev == null ? seedVoicing(p.pcs, voices, DEFAULT_BASS_TARGET) : leadVoices(prev, p.pcs, voices);
    frames.push({ measure, chordSymbol, voices: v });
    prev = v;
  }
  return { key: progression.key, frames };
}

/** Wrap a deterministic realizer as a proposer (ignores sampleIndex). */
export class DeterministicProposer implements RealizationProposer {
  constructor(
    private readonly realizer: (p: ChordProgression, voices: number) => Realization,
    private readonly voices = 4,
  ) {}
  async proposeRealization(progression: ChordProgression): Promise<Realization> {
    return this.realizer(progression, this.voices);
  }
}

// ─── The best-of-n loop ───────────────────────────────────────────────────────

/**
 * Realize a progression: propose → verify (admit) → keep the highest-scoring
 * ADMITTED candidate, resampling up to maxSamples. Deterministic given a
 * deterministic proposer. The only judge is the deterministic voice-leading gate
 * (external-verifier discipline — no model grades its own output).
 */
export async function realizeProgression(
  progression: ChordProgression,
  proposer: RealizationProposer,
  opts: RealizeOptions = {},
): Promise<RealizeResult> {
  const maxSamples = Math.max(1, opts.maxSamples ?? 16);
  const requireVoiceCount = opts.voices ?? 4;

  let bestAdmitted: { real: Realization; verdict: VoiceLeadingVerdict; score: RealizationScore } | null = null;
  let bestAny: { real: Realization; verdict: VoiceLeadingVerdict; score: RealizationScore } | null = null;
  const admittedAtSamples: number[] = [];
  let samplesUsed = 0;

  for (let k = 0; k < maxSamples; k++) {
    samplesUsed = k + 1;
    const real = await proposer.proposeRealization(progression, k);
    if (!real) continue;
    const verdict = verifyVoiceLeading(real, {
      requireVoiceCount,
      style: opts.style,
      relaxRules: opts.relaxRules,
    });
    const score = scoreRealization(real, opts.scoreWeights, { styleReference: opts.styleReference });
    const candidate = { real, verdict, score };

    if (bestAny === null || score.score > bestAny.score.score) bestAny = candidate;

    if (verdict.admitted) {
      admittedAtSamples.push(k + 1);
      if (bestAdmitted === null || score.score > bestAdmitted.score.score) bestAdmitted = candidate;
      if (opts.stopOnFirstAdmit) break;
    }
  }

  const chosen =
    bestAdmitted ??
    bestAny ?? {
      real: { key: progression.key, frames: [] } as Realization,
      verdict: verifyVoiceLeading({ key: progression.key, frames: [] }, { requireVoiceCount, style: opts.style }),
      score: scoreRealization({ key: progression.key, frames: [] }, opts.scoreWeights, { styleReference: opts.styleReference }),
    };

  return {
    admitted: bestAdmitted !== null,
    realization: chosen.real,
    verdict: chosen.verdict,
    score: chosen.score,
    admittedAtSamples,
    samplesUsed,
    admittedCount: admittedAtSamples.length,
  };
}
