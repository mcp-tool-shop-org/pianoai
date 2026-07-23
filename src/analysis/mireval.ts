// ─── MIREX-style chord comparison ─────────────────────────────────────────────
//
// A duration-weighted overlap comparison between a reference chord timeline and
// an estimated one, at three vocabularies of strictness — the standard MIREX
// Automatic-Chord-Estimation accuracy levels (Raffel et al. 2014, mir_eval,
// ISMIR; the study-swarm's finding-11 yardstick):
//   • root     — same root pitch class
//   • maj/min  — same root AND same maj/min triad class
//   • full     — same root AND exact quality (the deepest, hardest level;
//                weighted recall falls as the vocabulary deepens — Humphrey &
//                Bello 2015, so this number is EXPECTED to be lower than root)
//
// Accuracy = matched-overlap-beats / total-reference-beats, so a region the
// estimate leaves unlabeled counts against it. There is no single "correct"
// chord (inter-annotator agreement is ~76%/~73%/~54% at these three levels —
// study-swarm finding 10), so these are relative, best-effort numbers for an
// A/B, never an absolute grade.
// ─────────────────────────────────────────────────────────────────────────────

import { parseChordLabel, majMinClass } from "./symbols.js";

/** A chord label placed on a beat timeline (same beat frame for ref + est). */
export interface LabelSpan {
  startBeat: number;
  endBeat: number;
  /** Root pitch class 0-11, or -1 for no-chord. */
  rootPc: number;
  /** Canonical quality suffix, or "N/C". */
  quality: string;
}

export interface MirexScore {
  /** Root accuracy in [0,1] (duration-weighted). */
  rootAcc: number;
  /** Maj/min accuracy in [0,1]. */
  majMinAcc: number;
  /** Full-quality (exact) accuracy in [0,1]. */
  fullAcc: number;
  /** Total reference beats scored (denominator). */
  refBeats: number;
}

/** Build a LabelSpan from a chord symbol over [startBeat, endBeat). */
export function toLabelSpan(startBeat: number, endBeat: number, symbol: string): LabelSpan {
  const parsed = parseChordLabel(symbol);
  return {
    startBeat,
    endBeat,
    rootPc: parsed ? parsed.rootPc : -1,
    quality: parsed ? parsed.quality : "N/C",
  };
}

/**
 * Score an estimated timeline against a reference. Reference no-chord regions
 * (rootPc < 0) are excluded from the denominator. Both lists must share one beat
 * frame (the caller aligns them).
 */
export function scoreTimeline(ref: LabelSpan[], est: LabelSpan[]): MirexScore {
  let refBeats = 0;
  let rootMatch = 0;
  let majMinMatch = 0;
  let fullMatch = 0;

  for (const r of ref) {
    if (r.rootPc < 0 || r.endBeat <= r.startBeat) continue;
    refBeats += r.endBeat - r.startBeat;
    for (const e of est) {
      const overlap = Math.min(r.endBeat, e.endBeat) - Math.max(r.startBeat, e.startBeat);
      if (overlap <= 0) continue;
      if (e.rootPc >= 0 && e.rootPc === r.rootPc) {
        rootMatch += overlap;
        if (majMinClass(e.quality) === majMinClass(r.quality)) majMinMatch += overlap;
        if (e.quality === r.quality) fullMatch += overlap;
      }
    }
  }

  return {
    rootAcc: refBeats > 0 ? rootMatch / refBeats : 0,
    majMinAcc: refBeats > 0 ? majMinMatch / refBeats : 0,
    fullAcc: refBeats > 0 ? fullMatch / refBeats : 0,
    refBeats,
  };
}

/** Sum several per-section scores into one duration-weighted aggregate. */
export function aggregateScores(scores: MirexScore[]): MirexScore {
  let refBeats = 0;
  let root = 0;
  let mm = 0;
  let full = 0;
  for (const s of scores) {
    refBeats += s.refBeats;
    root += s.rootAcc * s.refBeats;
    mm += s.majMinAcc * s.refBeats;
    full += s.fullAcc * s.refBeats;
  }
  return {
    rootAcc: refBeats > 0 ? root / refBeats : 0,
    majMinAcc: refBeats > 0 ? mm / refBeats : 0,
    fullAcc: refBeats > 0 ? full / refBeats : 0,
    refBeats,
  };
}
