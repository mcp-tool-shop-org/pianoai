// ─── HCDF — harmonic-change segmentation into stable regions ───────────────────
//
// Groups the beat-synchronous segments of a song into harmonically-STABLE
// regions: a boundary is placed where the (smoothed) tonal centroid jumps, so
// consecutive beats that share a harmony become one region (one chord). This is
// the context the Session-1/2 measurement showed was missing — it lets an
// arpeggiated or block-chord passage be labeled over its true span instead of
// per fixed beat.
//
// The change function is computed over a SMOOTHED profile stream (a ±radius
// window pool), because salience weighting collapses each arpeggio beat to its
// dominant tone (bach's C-major bar reads as [C][C][E][E] at the beat), and raw
// single-tone centroids are far apart even within one chord (measured ~1.9).
// Smoothing lets the window see the whole chord before the centroid is taken.
// Grounded in Harte et al. 2006 (the tonal-centroid change function + smoothing).
//
// LABELING uses the region's RAW pooled profile (not the smoothed one) so the
// smoothing only informs WHERE the boundaries are, never WHAT the chord is.
// ─────────────────────────────────────────────────────────────────────────────

import type { Segment } from "./types.js";
import { tonalCentroid, centroidDistance } from "./tonal-centroid.js";

/** Default centroid-distance boundary threshold (tuned on the reference set). */
export const DEFAULT_HCDF_THRESHOLD = 0.5;
/** Default smoothing radius (beats each side) for the change function. */
export const DEFAULT_HCDF_SMOOTH = 2;

/** A harmonically-stable region: one or more contiguous beat segments merged. */
export interface Region {
  startBeat: number;
  endBeat: number;
  /** 1-based measure the region starts in. */
  measure: number;
  /** Pooled RAW pitch-class profile over the region (for labeling). */
  profile: number[];
  /** Lowest sounding pitch class in the region, or -1 if silent. */
  bassPc: number;
  /** Lowest sounding MIDI pitch in the region, or -1. */
  bassPitch: number;
  /** Total salience of the region (0 when silent). */
  totalWeight: number;
  /** Number of beat segments merged. */
  segments: number;
  /** True for a silent (no-chord) region. */
  silent: boolean;
}

/** Sum the profiles of segments in [i-radius, i+radius] (a smoothing window). */
function windowProfile(segments: Segment[], i: number, radius: number): number[] {
  const out = new Array<number>(12).fill(0);
  const lo = Math.max(0, i - radius);
  const hi = Math.min(segments.length - 1, i + radius);
  for (let j = lo; j <= hi; j++) {
    for (let pc = 0; pc < 12; pc++) out[pc] += segments[j].profile[pc];
  }
  return out;
}

function startRegion(seg: Segment): Region {
  return {
    startBeat: seg.startBeat,
    endBeat: seg.endBeat,
    measure: seg.measure,
    profile: seg.profile.slice(),
    bassPc: seg.bassPc,
    bassPitch: seg.bassPitch,
    totalWeight: seg.totalWeight,
    segments: 1,
    silent: seg.totalWeight <= 0,
  };
}

function extendRegion(region: Region, seg: Segment): void {
  for (let pc = 0; pc < 12; pc++) region.profile[pc] += seg.profile[pc];
  region.endBeat = seg.endBeat;
  region.totalWeight += seg.totalWeight;
  region.segments += 1;
  if (seg.bassPitch >= 0 && (region.bassPitch < 0 || seg.bassPitch < region.bassPitch)) {
    region.bassPitch = seg.bassPitch;
    region.bassPc = seg.bassPc;
  }
}

/**
 * Segment ordered beat segments into harmonically-stable regions. A boundary is
 * placed (1) before/after any silent segment, and (2) between segments i-1 and i
 * when their SMOOTHED tonal centroids are farther apart than `threshold`.
 */
export function detectRegions(
  segments: Segment[],
  threshold: number = DEFAULT_HCDF_THRESHOLD,
  smoothRadius: number = DEFAULT_HCDF_SMOOTH,
): Region[] {
  const centroids = segments.map((_, i) => tonalCentroid(windowProfile(segments, i, smoothRadius)));

  const regions: Region[] = [];
  let current: Region | null = null;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.totalWeight <= 0) {
      if (current) regions.push(current);
      current = null;
      regions.push(startRegion(seg));
      continue;
    }
    if (!current) {
      current = startRegion(seg);
      continue;
    }
    // Boundary if the harmonic change from the previous beat exceeds threshold.
    if (centroidDistance(centroids[i - 1], centroids[i]) > threshold) {
      regions.push(current);
      current = startRegion(seg);
    } else {
      extendRegion(current, seg);
    }
  }
  if (current) regions.push(current);
  return regions;
}
