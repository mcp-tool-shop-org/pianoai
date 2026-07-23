// ─── Compose: the preference scorer (taste, BEHIND the gate) ──────────────────
//
// Lane 2's other half: PREFERENCE / reduction rules are heuristic and go behind
// the deterministic gate as a scorer/optimizer (Huron 2001; Tymoczko 2006). The
// gate (voice-leading.ts) decides ADMISSION (hard, deterministic); this scorer
// only RANKS admitted candidates so best-of-n keeps the best one. It never gates
// — a low score is still admissible.
//
// Four heuristics, each normalized to [0,1] (higher = better), combined by a
// weighted average into an overall [0,1] score:
//   • smoothness      — small total voice motion is preferred (the single most
//                        consistent human preference; Huron's voice-leading pull).
//   • completeness     — the essential chord tones are present (the 3rd defines
//                        major/minor and matters most; the 5th is most omissible).
//   • doublingQuality  — double the root or 5th; avoid doubling the 3rd or 7th,
//                        and NEVER double the leading tone (standard doctrine).
//   • outerContrary    — contrary/oblique outer-voice motion is preferred over
//                        similar motion (independence of the outer lines).
//
// It is a RANKING signal, NOT an absolute quality metric — there is no objective
// metric of musical quality (Yang & Lerch 2020). Do not maximize it as a proxy
// for "good music"; it orders theory-valid candidates, nothing more.
// ─────────────────────────────────────────────────────────────────────────────

import { parseChordSymbol } from "../maker/verify-harmony.js";
import { parseKey } from "./voice-leading.js";
import { verifyVoiceLeading } from "./voice-leading.js";
import { styleTypicality, type StyleReference } from "./style-cost.js";
import type { Realization, RealizedFrame } from "./types.js";

export interface ScoreWeights {
  smoothness: number;
  completeness: number;
  doublingQuality: number;
  outerContrary: number;
  /**
   * The soft STYLE-TYPICALITY axis (A2). DEFAULT 0 — off unless a caller opts in
   * with a reference band AND a positive weight, so it changes no existing
   * ranking. A ranking signal only, never a gate, never a quality claim (finding 19).
   */
  styleTypicality: number;
}

/** Default weights — the 3rd/root completeness and smoothness carry the most.
 *  styleTypicality defaults to 0 (the A2 axis is opt-in; see ScoreWeights). */
export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  smoothness: 0.3,
  completeness: 0.35,
  doublingQuality: 0.2,
  outerContrary: 0.15,
  styleTypicality: 0,
};

export interface RealizationScore {
  /** Overall [0,1], higher is better. For RANKING admitted candidates only. */
  score: number;
  /** [0,1] — 1 when voices barely move, → 0 as mean per-voice motion approaches a tritone. */
  smoothness: number;
  /** [0,1] — mean weighted coverage of each chord's essential tones. */
  completeness: number;
  /** [0,1] — mean per-frame doubling quality (root/5th good, 3rd/7th/LT bad). */
  doublingQuality: number;
  /** [0,1] — fraction of transitions with contrary or oblique outer-voice motion. */
  outerContrary: number;
  /** (0,1] — style-band fit (A2). 1 (neutral) when no styleReference was supplied. */
  styleTypicality: number;
  weights: ScoreWeights;
}

export interface ScoreRealizationOptions {
  /**
   * A per-style reference band. When supplied, the styleTypicality axis measures
   * the realization's fit to it; otherwise the axis is a neutral 1 (and, with the
   * default weight 0, contributes nothing). See style-cost.ts.
   */
  styleReference?: StyleReference;
}

const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);

/** The chord's tones by role, from its parsed intervals. */
interface ChordRoles {
  rootPc: number;
  thirdPc: number | null;
  fifthPc: number | null;
  seventhPc: number | null;
}

function chordRoles(symbol: string): ChordRoles | null {
  const p = parseChordSymbol(symbol);
  if (!p) return null;
  const has = (candidates: number[]): number | null => {
    for (const iv of candidates) if (p.intervals.includes(iv)) return (p.rootPc + iv) % 12;
    return null;
  };
  return {
    rootPc: p.rootPc,
    thirdPc: has([3, 4]),
    fifthPc: has([6, 7, 8]),
    seventhPc: has([9, 10, 11]),
  };
}

/** Weighted coverage of a frame's essential chord tones (3rd > root > 7th > 5th). */
function frameCompleteness(frame: RealizedFrame): number | null {
  const roles = chordRoles(frame.chordSymbol);
  if (!roles || frame.voices.length === 0) return null;
  const present = new Set(frame.voices.map((v) => v % 12));
  const items: Array<[number | null, number]> = [
    [roles.thirdPc, 0.4],
    [roles.rootPc, 0.3],
    [roles.seventhPc, roles.seventhPc != null ? 0.2 : 0],
    [roles.fifthPc, 0.1],
  ];
  let got = 0;
  let total = 0;
  for (const [pc, w] of items) {
    if (pc == null || w === 0) continue;
    total += w;
    if (present.has(pc)) got += w;
  }
  return total > 0 ? got / total : null;
}

/** Per-frame doubling quality: reward root/5th doubling, penalize 3rd/7th/LT. */
function frameDoublingQuality(frame: RealizedFrame, leadingTonePc: number | null): number | null {
  const roles = chordRoles(frame.chordSymbol);
  if (!roles || frame.voices.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of frame.voices) counts.set(v % 12, (counts.get(v % 12) ?? 0) + 1);
  const doubled = [...counts.entries()].filter(([, n]) => n > 1).map(([pc]) => pc);
  if (doubled.length === 0) return 1; // no doubling → neutral-good
  let worst = 1;
  for (const pc of doubled) {
    let q: number;
    if (leadingTonePc != null && pc === leadingTonePc) q = 0.1; // never double the LT
    else if (pc === roles.rootPc || pc === roles.fifthPc) q = 1;
    else if (pc === roles.thirdPc) q = 0.6;
    else if (pc === roles.seventhPc) q = 0.4;
    else q = 0.7; // a doubled non-chord/other tone (rare; membership gate usually blocks)
    worst = Math.min(worst, q);
  }
  return worst;
}

/**
 * Score a realization for RANKING (higher = better). Pure + deterministic.
 * Uses the verifier's informational motion for smoothness; the rest is computed
 * from the chord roles + outer-voice motion.
 */
export function scoreRealization(
  realization: Realization,
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
  opts: ScoreRealizationOptions = {},
): RealizationScore {
  const verdict = verifyVoiceLeading(realization);
  const key = parseKey(realization.key);
  const leadingTonePc = key ? (key.tonicPc + 11) % 12 : null;

  // Sort each frame ascending (bass = min, soprano = max) for outer-motion + roles.
  const frames = realization.frames.map((f) => ({
    ...f,
    voices: [...f.voices].sort((a, b) => a - b),
  }));
  const sounding = frames.filter((f) => f.voices.length > 0);

  // smoothness — from mean per-voice motion; a tritone (6) per voice → 0.
  const meanMotion = verdict.meanMotionPerVoice;
  const smoothness = meanMotion == null ? 1 : Math.max(0, 1 - meanMotion / 6);

  // completeness — mean over sounding frames.
  const comps = sounding.map(frameCompleteness).filter((x): x is number => x != null);
  const completeness = comps.length ? comps.reduce((a, b) => a + b, 0) / comps.length : 1;

  // doublingQuality — mean over sounding frames.
  const dqs = sounding
    .map((f) => frameDoublingQuality(f, leadingTonePc))
    .filter((x): x is number => x != null);
  const doublingQuality = dqs.length ? dqs.reduce((a, b) => a + b, 0) / dqs.length : 1;

  // outerContrary — fraction of transitions with contrary or oblique outer motion.
  let contrary = 0;
  let transitions = 0;
  for (let i = 0; i + 1 < sounding.length; i++) {
    const a = sounding[i];
    const b = sounding[i + 1];
    transitions++;
    const bassMove = sign(b.voices[0] - a.voices[0]);
    const sopMove = sign(b.voices[b.voices.length - 1] - a.voices[a.voices.length - 1]);
    // contrary (opposite nonzero signs) or oblique (one voice static) is preferred.
    if (bassMove === 0 || sopMove === 0 || bassMove !== sopMove) contrary++;
  }
  const outerContrary = transitions > 0 ? contrary / transitions : 1;

  // A2: the soft style-typicality axis. Neutral 1 when no reference is supplied;
  // with the default weight 0 it contributes nothing (default score unchanged).
  const styleTyp = opts.styleReference ? styleTypicality(realization, opts.styleReference) : 1;

  const wsum =
    weights.smoothness +
    weights.completeness +
    weights.doublingQuality +
    weights.outerContrary +
    weights.styleTypicality;
  const score =
    wsum > 0
      ? (smoothness * weights.smoothness +
          completeness * weights.completeness +
          doublingQuality * weights.doublingQuality +
          outerContrary * weights.outerContrary +
          styleTyp * weights.styleTypicality) /
        wsum
      : 0;

  return { score, smoothness, completeness, doublingQuality, outerContrary, styleTypicality: styleTyp, weights };
}
