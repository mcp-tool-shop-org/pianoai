// ─── Beat-synchronous segmentation + salience-weighted profile ────────────────
//
// Splits each measure into tactus-level windows (one per beat) and builds a
// salience-weighted pitch-class profile per window. A window's profile is the
// sum, over every event sounding in it, of (overlap-in-beats × metric-strength
// at the event's onset). Duration enters twice, correctly: a longer note both
// overlaps more of the window AND spans more windows. Metric strength enters
// once, at the onset — a downbeat-struck tone is structural wherever it sustains.
//
// This is the ACE-prescribed unit of analysis (Cho & Bello 2014: sub-bar
// segments, not a pooled per-measure bag) with the non-chord-tone defense the
// literature calls for (Ju et al. 2017; Lee 2006 — metric/temporal context is
// what separates ornament from chord tone). Segmentation is intentionally at
// the beat, not finer: fine enough to catch 2–4 chords/bar of harmonic rhythm
// (Masada & Bunescu 2018), coarse enough not to fragment on ornaments.
// ─────────────────────────────────────────────────────────────────────────────

import type { Meter } from "./meter.js";
import { metricStrength } from "./meter.js";
import type { TimedEvent, Segment } from "./types.js";

/** Numerical floor below which an overlap is treated as non-sounding. */
const EPS = 1e-9;

/**
 * Segment one measure into tactus windows and weight each by salience.
 *
 * @param events           all song events (filtered here by overlap — callers
 *                         may pass the whole song's event list)
 * @param meter            the parsed meter
 * @param measureStartBeat absolute beat where this measure begins
 * @param measureNumber    1-based measure number (carried onto each Segment)
 */
export function segmentMeasure(
  events: TimedEvent[],
  meter: Meter,
  measureStartBeat: number,
  measureNumber: number,
): Segment[] {
  const segments: Segment[] = [];
  const { beatsPerMeasure, tactus } = meter;

  // Walk the tactus grid across the measure. The final window is clamped to the
  // barline so an odd beatsPerMeasure/tactus ratio can't spill past the measure.
  for (let start = 0; start < beatsPerMeasure - 1e-6; start += tactus) {
    const end = Math.min(start + tactus, beatsPerMeasure);
    const absStart = measureStartBeat + start;
    const absEnd = measureStartBeat + end;

    const profile = new Array<number>(12).fill(0);
    let bassPitch = Infinity;
    let totalWeight = 0;

    for (const ev of events) {
      const evEnd = ev.onsetBeat + ev.durBeats;
      const overlap = Math.min(absEnd, evEnd) - Math.max(absStart, ev.onsetBeat);
      if (overlap <= EPS) continue;

      const strength = metricStrength(ev.onsetBeat - measureStartBeat, meter);
      const weight = overlap * strength;
      profile[ev.pc] += weight;
      totalWeight += weight;
      // Bass = the lowest sounding pitch in the window (the ACE bass field). It
      // is only ever a weak tiebreak in root-finding, so plain min-pitch is
      // enough; a durational-weighted bass is a possible refinement.
      if (ev.pitch < bassPitch) bassPitch = ev.pitch;
    }

    segments.push({
      startBeat: absStart,
      endBeat: absEnd,
      measure: measureNumber,
      beatInMeasure: start,
      profile,
      bassPitch: bassPitch === Infinity ? -1 : bassPitch,
      bassPc: bassPitch === Infinity ? -1 : bassPitch % 12,
      totalWeight,
    });
  }

  return segments;
}
