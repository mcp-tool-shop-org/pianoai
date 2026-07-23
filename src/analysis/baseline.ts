// ─── The pooled-bag baseline ──────────────────────────────────────────────────
//
// The incumbent to beat: the crude per-measure pooled pitch-class bag the jam
// brief uses today (inferChord over a whole measure). Reproduced here — READ
// ONLY, importing the real inferChord unchanged — so the analyzer can be scored
// against exactly what the platform does now.
//
// Two forms:
//   • baselineLeftHand      — EXACTLY the current jam-brief behavior:
//                             inferChord(measure.leftHand). The real headline
//                             baseline.
//   • baselinePooledBothHands — inferChord over both hands pooled, equal weight.
//                             Holds note-coverage constant vs the analyzer so the
//                             A/B isolates the value of SALIENCE weighting + real
//                             root-finding (not just "the analyzer sees more notes").
// ─────────────────────────────────────────────────────────────────────────────

import type { SongEntry } from "../songs/types.js";
import { inferChord } from "../songs/jam.js";

export interface MeasureLabel {
  /** 1-based measure number. */
  measure: number;
  /** The pooled inferChord label ("N/A" for an empty hand). */
  symbol: string;
}

/** The current jam-brief baseline: pooled inferChord over the left hand only. */
export function baselineLeftHand(song: SongEntry): MeasureLabel[] {
  return song.measures.map((m) => ({ measure: m.number, symbol: inferChord(m.leftHand) }));
}

/** Pooled inferChord over both hands (equal-weight bag) — the salience control. */
export function baselinePooledBothHands(song: SongEntry): MeasureLabel[] {
  return song.measures.map((m) => ({
    measure: m.number,
    symbol: inferChord(`${m.leftHand} ${m.rightHand}`.trim()),
  }));
}
