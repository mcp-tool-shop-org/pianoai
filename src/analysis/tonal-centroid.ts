// ─── Tonal centroid (6-D tonnetz) ─────────────────────────────────────────────
//
// Maps a 12-D pitch-class profile onto the 6-D tonal centroid of Harte, Sandler
// & Gasser 2006 ("Detecting Harmonic Change in Musical Audio", ACM AMCMM,
// DOI:10.1145/1178723.1178727). The embedding is three circles — fifths, minor
// thirds, major thirds — so harmonically-close chords (a fifth apart, or a
// relative major/minor) sit CLOSE in the space while distant ones (a tritone)
// sit far. The distance between consecutive segments' centroids is the harmonic
// change function (HCDF) used to segment a song into harmonically-stable
// regions — which is what stops beat-synchronous segmentation from fragmenting
// an arpeggiated chord (the Session-1/2 diagnosed weakness).
// ─────────────────────────────────────────────────────────────────────────────

/** Angular step per semitone on each of the three circles (fifths, m3, M3). */
const ANGLES = [(7 * Math.PI) / 6, (3 * Math.PI) / 2, (2 * Math.PI) / 3];
/** Radius (weight) of each circle — the major-thirds circle is weighted 0.5 (Harte 2006). */
const RADII = [1, 1, 0.5];

/**
 * The 6-D tonal centroid of a pitch-class profile. Uses the L1-normalized
 * profile, so it reflects the RELATIVE presence of pitch classes (magnitude-
 * independent). A silent profile returns the origin.
 */
export function tonalCentroid(profile: number[]): number[] {
  const total = profile.reduce((a, b) => a + b, 0);
  const c = new Array<number>(6).fill(0);
  if (total <= 0) return c;
  for (let l = 0; l < 12; l++) {
    const w = profile[l] / total;
    if (w === 0) continue;
    for (let k = 0; k < 3; k++) {
      c[2 * k] += w * RADII[k] * Math.sin(l * ANGLES[k]);
      c[2 * k + 1] += w * RADII[k] * Math.cos(l * ANGLES[k]);
    }
  }
  return c;
}

/** Euclidean distance between two 6-D tonal centroids. */
export function centroidDistance(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < 6; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}
